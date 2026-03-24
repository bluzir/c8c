import type {
  AgentExecutionEvent,
  AgentExecutionHandle,
  AgentExecutionSummary,
  AgentRunOptions,
} from "@shared/types"
import type {
  Options as ClaudeSdkOptions,
  Query as ClaudeSdkQuery,
  SDKMessage,
  SDKResultMessage,
  SettingSource,
} from "@anthropic-ai/claude-agent-sdk"
import { buildClaudeEnv, findClaudeExecutable } from "./claude-cli"
import { errorMessage } from "./error-utils"
import { LogParser, type UsageStats } from "./log-parser"
import { buildClaudeSdkMcpServers } from "./mcp-config"

type ClaudeSdkQueryFn = typeof import("@anthropic-ai/claude-agent-sdk").query

let cachedClaudeSdkQuery: ClaudeSdkQueryFn | null = null
const HEARTBEAT_THRESHOLDS_MS = [15_000, 30_000, 60_000] as const
const HEARTBEAT_REPEAT_MS = 60_000
const HEARTBEAT_CHECK_INTERVAL_MS = 5_000

function resolveClaudeExecutablePath(): string | undefined {
  try {
    return findClaudeExecutable() || undefined
  } catch {
    return undefined
  }
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private items: T[] = []
  private resolvers: Array<(result: IteratorResult<T>) => void> = []
  private closed = false

  push(item: T): void {
    if (this.closed) return
    const resolver = this.resolvers.shift()
    if (resolver) {
      resolver({ value: item, done: false })
      return
    }
    this.items.push(item)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    while (this.resolvers.length > 0) {
      const resolver = this.resolvers.shift()
      resolver?.({ value: undefined as T, done: true })
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.items.length > 0) {
          return Promise.resolve({
            value: this.items.shift() as T,
            done: false,
          })
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as T, done: true })
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolvers.push(resolve)
        })
      },
    }
  }
}

export interface ParsedClaudeSdkLegacyArgs {
  extraArgs: NonNullable<ClaudeSdkOptions["extraArgs"]>
  mcpConfigPath?: string
  systemPrompt?: string
  appendSystemPrompt?: string
  tools?: ClaudeSdkOptions["tools"]
}

function readFlagValue(
  args: string[],
  index: number,
): { value: string | null; consumed: number } {
  const current = args[index]
  const equalsIndex = current.indexOf("=")
  if (equalsIndex >= 0) {
    return {
      value: current.slice(equalsIndex + 1),
      consumed: 0,
    }
  }

  const next = args[index + 1]
  if (next === undefined || next.startsWith("--")) {
    return { value: null, consumed: 0 }
  }

  return {
    value: next,
    consumed: 1,
  }
}

export function parseClaudeSdkLegacyArgs(
  extraArgs?: string[],
): ParsedClaudeSdkLegacyArgs {
  const parsed: ParsedClaudeSdkLegacyArgs = {
    extraArgs: {},
  }

  if (!extraArgs || extraArgs.length === 0) return parsed

  for (let index = 0; index < extraArgs.length; index++) {
    const current = extraArgs[index]
    if (!current.startsWith("--")) continue

    const normalizedFlag = current.includes("=")
      ? current.slice(0, current.indexOf("="))
      : current
    const { value, consumed } = readFlagValue(extraArgs, index)
    index += consumed

    switch (normalizedFlag) {
      case "--verbose":
      case "--output-format":
        break
      case "--mcp-config":
        if (value) parsed.mcpConfigPath = value
        break
      case "--system-prompt":
        if (value) parsed.systemPrompt = value
        break
      case "--append-system-prompt":
        if (value) parsed.appendSystemPrompt = value
        break
      case "--tools":
        if (value === "") {
          parsed.tools = []
        }
        break
      default: {
        const key = normalizedFlag.slice(2)
        parsed.extraArgs[key] = value
        break
      }
    }
  }

  return parsed
}

function emitUsageIfChanged(
  parser: LogParser,
  queue: AsyncEventQueue<AgentExecutionEvent>,
  lastUsage: UsageStats,
): void {
  const usage = parser.usage
  if (
    usage.input_tokens === lastUsage.input_tokens &&
    usage.output_tokens === lastUsage.output_tokens
  ) {
    return
  }

  lastUsage.input_tokens = usage.input_tokens
  lastUsage.output_tokens = usage.output_tokens
  queue.push({
    type: "usage",
    usage: {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
    },
  })
}

function toClaudeSettingSources(settingSources?: string[]): SettingSource[] {
  const allowed = new Set<SettingSource>(["user", "project", "local"])
  const requested = (settingSources || ["project", "user"]).filter(
    (source): source is SettingSource => allowed.has(source as SettingSource),
  )

  return requested.length > 0 ? requested : ["project", "user"]
}

function resolveClaudePermissionMode(
  options: AgentRunOptions,
): Pick<
  ClaudeSdkOptions,
  "permissionMode" | "allowDangerouslySkipPermissions"
> {
  if (options.executionMode === "plan") {
    return {
      permissionMode: "plan",
      allowDangerouslySkipPermissions: false,
    }
  }

  if (options.permissionMode === "bypassPermissions") {
    return {
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
    }
  }

  if (
    options.permissionMode === "acceptEdits" ||
    options.permissionMode === "dontAsk" ||
    options.permissionMode === "default"
  ) {
    return {
      permissionMode: options.permissionMode,
      allowDangerouslySkipPermissions: false,
    }
  }

  return {
    permissionMode: undefined,
    allowDangerouslySkipPermissions: false,
  }
}

function buildClaudeToolPermissionHandler(
  options: AgentRunOptions,
): ClaudeSdkOptions["canUseTool"] {
  const disallowedTools = new Set(options.disallowedTools || [])
  if (disallowedTools.size === 0) return undefined

  return async (toolName, input) => {
    if (disallowedTools.has(toolName)) {
      return {
        behavior: "deny",
        message: `${toolName} is blocked for this run.`,
      }
    }

    return {
      behavior: "allow",
      updatedInput: input,
    }
  }
}

function buildSystemPrompt(
  options: AgentRunOptions,
  parsedArgs: ParsedClaudeSdkLegacyArgs,
): ClaudeSdkOptions["systemPrompt"] {
  const appendedSegments = [
    ...(parsedArgs.appendSystemPrompt ? [parsedArgs.appendSystemPrompt] : []),
    ...(options.systemPrompts || []),
  ].filter(Boolean)

  if (parsedArgs.systemPrompt) {
    return [parsedArgs.systemPrompt, ...appendedSegments]
      .filter(Boolean)
      .join("\n\n")
  }

  if (appendedSegments.length > 0) {
    return {
      type: "preset",
      preset: "claude_code",
      append: appendedSegments.join("\n\n"),
    }
  }

  return undefined
}

function buildSummaryFromResult(
  result: SDKResultMessage,
  sessionId: string | null,
  aborted: boolean,
): AgentExecutionSummary {
  const errorText =
    result.subtype === "success"
      ? null
      : result.errors.join("\n") || result.subtype
  const explicitExitCode = (() => {
    if (!errorText) return 0
    const match = errorText.match(/\bexit code\s+(-?\d+)\b/i)
    if (match) {
      return Number.parseInt(match[1], 10)
    }
    if (/could not start claude cli/i.test(errorText)) {
      return null
    }
    return 1
  })()
  const base = {
    exitCode: explicitExitCode,
    signal: null,
    killed: false,
    aborted,
    durationMs: result.duration_ms,
    providerSessionId: sessionId,
    backend: "claude_sdk" as const,
  }

  if (result.subtype === "success") {
    return {
      ...base,
      success: !aborted,
      error: null,
    }
  }

  return {
    ...base,
    success: false,
    error: errorText,
  }
}

function pushSdkMessageEntries(
  parser: LogParser,
  queue: AsyncEventQueue<AgentExecutionEvent>,
  message: SDKMessage,
  lastUsage: UsageStats,
): void {
  const entries = parser.feed(JSON.stringify(message))
  for (const entry of entries) {
    queue.push({ type: "log-entry", entry })
  }
  emitUsageIfChanged(parser, queue, lastUsage)
}

async function getClaudeSdkQuery(): Promise<ClaudeSdkQueryFn> {
  if (cachedClaudeSdkQuery) return cachedClaudeSdkQuery
  const sdk = await import("@anthropic-ai/claude-agent-sdk")
  cachedClaudeSdkQuery = sdk.query
  return cachedClaudeSdkQuery
}

function formatHeartbeatSilence(ms: number): string {
  const totalSeconds = Math.max(1, Math.floor(ms / 1_000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${totalSeconds}s`
  if (seconds === 0) return `${minutes}m`
  return `${minutes}m ${seconds}s`
}

function nextHeartbeatThreshold(lastThresholdMs: number | null): number {
  if (lastThresholdMs === null) return HEARTBEAT_THRESHOLDS_MS[0]
  const index = HEARTBEAT_THRESHOLDS_MS.indexOf(
    lastThresholdMs as (typeof HEARTBEAT_THRESHOLDS_MS)[number],
  )
  if (index >= 0 && index < HEARTBEAT_THRESHOLDS_MS.length - 1) {
    return HEARTBEAT_THRESHOLDS_MS[index + 1]
  }
  return lastThresholdMs + HEARTBEAT_REPEAT_MS
}

export async function createClaudeSdkExecutionHandle(
  options: AgentRunOptions,
): Promise<AgentExecutionHandle> {
  const query = await getClaudeSdkQuery()
  const parsedArgs = parseClaudeSdkLegacyArgs(options.extraArgs)
  const queue = new AsyncEventQueue<AgentExecutionEvent>()
  const parser = new LogParser()
  const lastUsage: UsageStats = { input_tokens: 0, output_tokens: 0 }
  const sdkAbortController = new AbortController()
  const externalAbort = () => {
    if (!sdkAbortController.signal.aborted) {
      sdkAbortController.abort()
    }
  }

  if (options.abortSignal) {
    if (options.abortSignal.aborted) {
      externalAbort()
    } else {
      options.abortSignal.addEventListener("abort", externalAbort, {
        once: true,
      })
    }
  }

  queue.push({ type: "start" })

  let activeQuery: ClaudeSdkQuery | null = null
  let sessionId: string | null = null
  let lastActivityAt = Date.now()
  let lastHeartbeatThresholdMs: number | null = null
  const markActivity = () => {
    lastActivityAt = Date.now()
    lastHeartbeatThresholdMs = null
  }
  const publishSessionId = (value: string | null | undefined) => {
    const nextSessionId = typeof value === "string" ? value.trim() : ""
    if (!nextSessionId || nextSessionId === sessionId) return
    sessionId = nextSessionId
    queue.push({ type: "provider-session", sessionId: nextSessionId })
  }

  const done = (async (): Promise<AgentExecutionSummary> => {
    const startedAt = Date.now()
    const heartbeatInterval = setInterval(() => {
      if (!activeQuery || sdkAbortController.signal.aborted) return
      const silenceMs = Date.now() - lastActivityAt
      const thresholdMs = nextHeartbeatThreshold(lastHeartbeatThresholdMs)
      if (silenceMs < thresholdMs) return
      lastHeartbeatThresholdMs = thresholdMs
      queue.push({
        type: "log-entry",
        entry: {
          type: "thinking",
          content: `\n\n[runtime] Claude is still working. No new output for ${formatHeartbeatSilence(silenceMs)}.`,
          timestamp: Date.now(),
        },
      })
    }, HEARTBEAT_CHECK_INTERVAL_MS)
    try {
      const permission = resolveClaudePermissionMode(options)
      const mcpConfigPath = options.mcpConfigPath || parsedArgs.mcpConfigPath
      const tools = options.disableBuiltInTools ? [] : parsedArgs.tools
      const extraArgs = {
        ...(options.disableSlashCommands
          ? { "disable-slash-commands": null }
          : {}),
        ...parsedArgs.extraArgs,
      }
      const sdkOptions: ClaudeSdkOptions = {
        abortController: sdkAbortController,
        cwd: options.workdir,
        env: {
          ...buildClaudeEnv(options.extraEnv),
          CLAUDE_AGENT_SDK_CLIENT_APP:
            process.env.CLAUDE_AGENT_SDK_CLIENT_APP || "c8c",
        },
        model: options.model,
        maxTurns: options.maxTurns,
        tools,
        allowedTools: options.allowedTools,
        disallowedTools: options.disallowedTools,
        canUseTool: buildClaudeToolPermissionHandler(options),
        extraArgs: Object.keys(extraArgs).length > 0 ? extraArgs : undefined,
        additionalDirectories: options.addDirs,
        mcpServers: buildClaudeSdkMcpServers(mcpConfigPath),
        pathToClaudeCodeExecutable: resolveClaudeExecutablePath(),
        permissionMode: permission.permissionMode,
        allowDangerouslySkipPermissions:
          permission.allowDangerouslySkipPermissions,
        persistSession: options.resumeSessionId
          ? true
          : (options.persistSession ?? false),
        resume: options.resumeSessionId,
        includePartialMessages: true,
        settingSources: toClaudeSettingSources(options.settingSources),
        stderr: (text) => {
          markActivity()
          queue.push({ type: "stderr", text })
        },
        systemPrompt: buildSystemPrompt(options, parsedArgs),
      }

      activeQuery = query({
        prompt: options.prompt,
        options: sdkOptions,
      })

      let resultMessage: SDKResultMessage | null = null

      for await (const message of activeQuery) {
        markActivity()
        publishSessionId(message.session_id)
        pushSdkMessageEntries(parser, queue, message, lastUsage)

        if (message.type === "assistant" && message.error) {
          const text = `Claude SDK assistant error: ${message.error}`
          queue.push({
            type: "log-entry",
            entry: { type: "error", content: text, timestamp: Date.now() },
          })
          queue.push({ type: "error", text })
        }

        if (message.type === "auth_status") {
          const text = [...message.output, message.error || ""]
            .filter(Boolean)
            .join("\n")
          if (text) {
            queue.push({ type: "stderr", text: `${text}\n` })
          }
        }

        if (message.type === "result") {
          resultMessage = message
          if (message.subtype !== "success") {
            const text = message.errors.join("\n") || message.subtype
            queue.push({
              type: "log-entry",
              entry: { type: "error", content: text, timestamp: Date.now() },
            })
            queue.push({ type: "error", text })
          }
        }
      }

      if (resultMessage) {
        const summary = buildSummaryFromResult(
          resultMessage,
          sessionId,
          sdkAbortController.signal.aborted,
        )
        queue.push({ type: "finish", summary })
        return summary
      }

      const summary: AgentExecutionSummary = {
        success: false,
        exitCode: sdkAbortController.signal.aborted ? 0 : null,
        signal: null,
        killed: false,
        aborted: sdkAbortController.signal.aborted,
        durationMs: Date.now() - startedAt,
        error: sdkAbortController.signal.aborted
          ? "Execution aborted."
          : "Claude SDK query finished without a result message.",
        providerSessionId: sessionId,
        backend: "claude_sdk",
      }
      queue.push({
        type: "error",
        text: summary.error || "Claude SDK query failed.",
      })
      queue.push({ type: "finish", summary })
      return summary
    } catch (error) {
      const aborted = sdkAbortController.signal.aborted
      const summary: AgentExecutionSummary = {
        success: false,
        exitCode: aborted ? 0 : null,
        signal: null,
        killed: false,
        aborted,
        durationMs: Date.now() - startedAt,
        error: aborted ? "Execution aborted." : errorMessage(error),
        providerSessionId: sessionId,
        backend: "claude_sdk",
      }
      queue.push({
        type: "error",
        text: summary.error || "Claude SDK query failed.",
      })
      queue.push({ type: "finish", summary })
      return summary
    } finally {
      clearInterval(heartbeatInterval)
      activeQuery?.close()
      if (options.abortSignal) {
        options.abortSignal.removeEventListener("abort", externalAbort)
      }
      queue.close()
    }
  })()

  return {
    provider: "claude",
    backend: "claude_sdk",
    events: queue,
    abort: () => {
      if (!sdkAbortController.signal.aborted) {
        sdkAbortController.abort()
      }
      activeQuery?.close()
    },
    done,
  }
}
