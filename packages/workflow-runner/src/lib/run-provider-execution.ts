import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"
import { drainExecutionHandle } from "./agent-execution.js"
import { withExecutionSlot } from "./execution-pool.js"
import { LogParser } from "./log-parser.js"
import {
  recordRunPidExit,
  recordRunPidStart,
  type RunPidManifestMode,
} from "./run-pid-manifest.js"
import type {
  AgentExecutionHandle,
  AgentExecutionSummary,
  AgentRunOptions,
  LogEntry,
  NodeInput,
  ProviderId,
} from "../schema.js"

const execFile = promisify(execFileCb)
const CLAUDE_LIMIT_RE =
  /\b(rate limit(?:ed)?|usage limit|quota(?: exceeded)?|too many requests|http\s*429|status\s*429|credit balance|billing|exceeded (?:your )?(?:usage|rate|monthly|spend|token) limit|limit reached)\b/i
const MAX_TURNS_RE = /\b(?:error_max_turns|max turns?|turn limit)\b/i
const PARTIAL_PROGRESS_TOOLS = new Set([
  "Edit",
  "MultiEdit",
  "Write",
  "NotebookEdit",
])

interface ProviderExecutionLogger {
  info?(
    component: string,
    event: string,
    context?: Record<string, unknown>,
  ): void
}

export interface ProviderExecutionDeps {
  startProviderTask(
    providerId: ProviderId,
    options: AgentRunOptions,
  ): Promise<AgentExecutionHandle>
  logger?: ProviderExecutionLogger
}

export interface SpawnTrackingContext {
  workspace: string
  runId: string
  mode: RunPidManifestMode
  role: string
  nodeId?: string
}

export async function runGitCommand(
  args: string[],
  cwd: string,
): Promise<string> {
  const { stdout } = await withExecutionSlot(() =>
    execFile("git", args, { cwd, encoding: "utf-8" }),
  )
  return String(stdout || "").trimEnd()
}

function normalizeLimitLine(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function collectClaudeFailureEvidence(
  logParser: LogParser,
  stderrText: string,
): string[] {
  const evidence: string[] = []
  if (stderrText.trim()) evidence.push(stderrText)

  for (const entry of logParser.entries) {
    if (entry.type === "error") {
      evidence.push(entry.content)
      continue
    }
    if (entry.type === "tool_result" && entry.status === "error") {
      evidence.push(entry.output)
    }
  }

  if (evidence.length === 0 && logParser.textContent.trim()) {
    evidence.push(logParser.textContent)
  }

  return evidence
}

function detectClaudeLimitEvidence(
  logParser: LogParser,
  stderrText: string,
): string | undefined {
  const evidence = collectClaudeFailureEvidence(logParser, stderrText)
  for (const chunk of evidence) {
    for (const rawLine of chunk.split(/\r?\n/)) {
      const line = normalizeLimitLine(rawLine)
      if (!line) continue
      if (CLAUDE_LIMIT_RE.test(line)) return line.slice(0, 240)
    }

    const collapsed = normalizeLimitLine(chunk)
    if (collapsed && CLAUDE_LIMIT_RE.test(collapsed)) {
      return collapsed.slice(0, 240)
    }
  }
  return undefined
}

function detectMaxTurnsEvidence(
  logParser: LogParser,
  stderrText: string,
): string | undefined {
  const evidence = [
    stderrText,
    ...collectClaudeFailureEvidence(logParser, ""),
    logParser.rawOutput,
  ]

  for (const chunk of evidence) {
    if (!chunk?.trim()) continue

    for (const rawLine of chunk.split(/\r?\n/)) {
      const line = normalizeLimitLine(rawLine)
      if (!line) continue
      if (MAX_TURNS_RE.test(line)) return line.slice(0, 240)
    }

    const collapsed = normalizeLimitLine(chunk)
    if (collapsed && MAX_TURNS_RE.test(collapsed)) {
      return collapsed.slice(0, 240)
    }
  }

  return undefined
}

export function hasPartialSkillProgress(
  log: LogEntry[],
  partialOutput: NodeInput | undefined,
): boolean {
  if (
    partialOutput?.metadata?.output_source &&
    partialOutput.metadata.output_source !== "input_fallback"
  ) {
    return true
  }

  return log.some(
    (entry) =>
      entry.type === "tool_result" &&
      entry.status === "success" &&
      PARTIAL_PROGRESS_TOOLS.has(entry.tool),
  )
}

export function isMaxTurnsErrorText(text: string): boolean {
  return MAX_TURNS_RE.test(text)
}

export function buildAgentFailureDetail(
  providerId: ProviderId,
  result: AgentExecutionSummary,
  logParser: LogParser,
  stderrText: string,
): string {
  if (result.exitCode === null) {
    if (result.error?.trim()) return result.error.trim()
    return providerId === "codex"
      ? "Could not start Codex CLI — check that 'codex' is in your PATH and accessible"
      : "Could not start Claude CLI — check that 'claude' is in your PATH and accessible"
  }

  const limitEvidence =
    providerId === "claude"
      ? detectClaudeLimitEvidence(logParser, stderrText)
      : undefined
  if (limitEvidence && providerId === "claude") {
    return `Claude usage limit reached: ${limitEvidence}. Wait for the limit window to reset or use an account/key with available quota, then rerun.`
  }

  const maxTurnsEvidence = detectMaxTurnsEvidence(logParser, stderrText)
  if (maxTurnsEvidence) {
    return `max turns reached before finishing: ${maxTurnsEvidence}`
  }

  return `exit code ${result.exitCode}`
}

export async function spawnProviderTracked(
  deps: ProviderExecutionDeps,
  providerId: ProviderId,
  options: AgentRunOptions,
  tracking: SpawnTrackingContext,
  callbacks: {
    onExecutionStart?: () => void | Promise<void>
    onSpawn?: (pid: number) => void
    onProviderSession?: (sessionId: string) => void | Promise<void>
    onLogEntry?: (entry: LogEntry) => void
    onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void
    onStderr?: (text: string) => void
    onError?: (text: string) => void
  } = {},
): Promise<AgentExecutionSummary> {
  let trackedPid: number | undefined
  const result = await withExecutionSlot(async (ticket) => {
    if (ticket.queueWaitMs > 0) {
      deps.logger?.info?.("workflow-runner", "provider_execution_waited", {
        runId: tracking.runId,
        nodeId: tracking.nodeId,
        providerId,
        role: tracking.role,
        queueWaitMs: ticket.queueWaitMs,
      })
    }

    await callbacks.onExecutionStart?.()
    const handle = await deps.startProviderTask(providerId, options)
    return drainExecutionHandle(handle, {
      onSpawn: (pid) => {
        trackedPid = pid
        callbacks.onSpawn?.(pid)
        void recordRunPidStart(
          tracking.workspace,
          tracking.runId,
          tracking.mode,
          pid,
          tracking.role,
          tracking.nodeId,
        )
      },
      onProviderSession: (sessionId) => {
        void callbacks.onProviderSession?.(sessionId)
      },
      onLogEntry: callbacks.onLogEntry,
      onUsage: callbacks.onUsage,
      onStderr: callbacks.onStderr,
      onError: callbacks.onError,
    })
  })

  const pid = typeof trackedPid === "number" ? trackedPid : result.pid
  if (typeof pid === "number") {
    void recordRunPidExit(
      tracking.workspace,
      tracking.runId,
      tracking.mode,
      pid,
      { exitCode: result.exitCode, signal: result.signal },
    )
  }

  return result
}
