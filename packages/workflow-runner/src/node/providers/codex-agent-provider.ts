import { spawn } from "node:child_process"
import type {
  AgentExecutionHandle,
  AgentProvider,
  AgentRunOptions,
  AgentRunResult,
  ProviderAuthStatus,
  ProviderHealth,
  SafetyProfile,
} from "../../schema.js"
import {
  createErroredExecutionHandle,
  createLegacyExecutionHandle,
} from "../../lib/agent-execution.js"
import { resolveSafetyProfile } from "../../provider-metadata.js"
import {
  buildCodexEnv,
  execCodex,
  findCodexExecutable,
  supportsCodexExecSubcommand,
} from "../codex-cli.js"
import {
  createCodexJsonNormalizerState,
  normalizeCodexJsonLine,
} from "../codex-json-normalizer.js"
import { buildProviderExtraArgs } from "../mcp-config.js"
import { getCodexApiKey, getProviderSettings } from "../provider-settings.js"
import {
  errorMessage,
  execErrorOutput,
  normalizeCliText,
} from "./provider-utils.js"

function buildCodexToolPolicyPrefix(options: AgentRunOptions): string {
  const sections: string[] = []
  if (options.systemPrompts?.length) {
    sections.push(options.systemPrompts.join("\n\n"))
  }
  if (options.allowedTools?.length) {
    sections.push(`Allowed tools: ${options.allowedTools.join(", ")}.`)
  }
  if (options.disallowedTools?.length) {
    sections.push(
      `Disallowed tools: ${options.disallowedTools.join(", ")}. Never use them.`,
    )
  }
  if (sections.length === 0) return options.prompt
  return `${sections.join("\n\n")}\n\n${options.prompt}`
}

function codexSafetyArgs(profile: SafetyProfile): string[] {
  switch (profile) {
    case "safe_readonly":
      return ["--sandbox", "read-only", "--ask-for-approval", "on-request"]
    case "workspace_untrusted":
      return ["--sandbox", "workspace-write", "--ask-for-approval", "untrusted"]
    case "ci_readonly":
      return ["--sandbox", "read-only", "--ask-for-approval", "never"]
    case "dangerous":
      return ["--dangerously-bypass-approvals-and-sandbox"]
    case "workspace_auto":
    default:
      return [
        "--sandbox",
        "workspace-write",
        "--ask-for-approval",
        "on-request",
      ]
  }
}

async function checkCodexAvailability(): Promise<ProviderHealth> {
  const executablePath = findCodexExecutable() || undefined

  try {
    const { stdout, stderr } = await execCodex(["--version"], {
      timeout: 5_000,
    })
    const version = `${stdout}\n${stderr}`
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("WARNING:"))

    return {
      provider: "codex",
      available: true,
      executablePath,
      version,
      error: null,
    }
  } catch (error) {
    return {
      provider: "codex",
      available: false,
      executablePath,
      error: errorMessage(error) || "Codex CLI is not available.",
    }
  }
}

function isCodexHeadlessAuthCheckError(text: string): boolean {
  const normalized = normalizeCliText(text).toLowerCase()
  return (
    normalized.includes("raw mode is not supported") ||
    normalized.includes(
      "could not report auth status in non-interactive mode",
    ) ||
    normalized.includes("sign in with chatgpt") ||
    normalized.includes("paste an api key")
  )
}

function sanitizeCodexAuthError(text: string): string {
  const normalized = normalizeCliText(text)
  if (!normalized) {
    return "Codex CLI is not authenticated."
  }

  if (isCodexHeadlessAuthCheckError(normalized)) {
    return "Codex CLI could not report auth status in non-interactive mode."
  }

  if (
    /not authenticated|not logged in|login required|please log in|unauthorized|forbidden|401/i.test(
      normalized,
    )
  ) {
    return "Codex CLI is not authenticated."
  }

  return normalized
}

function parseCodexAuth(
  output: string,
  apiKeyConfigured: boolean,
): ProviderAuthStatus {
  const normalized = normalizeCliText(output)
  if (/logged in using chatgpt/i.test(normalized)) {
    return {
      provider: "codex",
      state: "authenticated",
      authenticated: true,
      authMethod: "chatgpt",
      accountLabel: "ChatGPT",
      apiKeyConfigured,
      error: null,
    }
  }

  if (/logged in using api key/i.test(normalized)) {
    return {
      provider: "codex",
      state: "authenticated",
      authenticated: true,
      authMethod: "api_key",
      accountLabel: "CLI API key",
      apiKeyConfigured,
      error: null,
    }
  }

  if (apiKeyConfigured) {
    return {
      provider: "codex",
      state: "authenticated",
      authenticated: true,
      authMethod: "api_key",
      accountLabel: "App-managed CODEX_API_KEY",
      apiKeyConfigured: true,
      error: null,
    }
  }

  return {
    provider: "codex",
    state: isCodexHeadlessAuthCheckError(normalized)
      ? "unknown"
      : "unauthenticated",
    authenticated: false,
    authMethod: null,
    accountLabel: null,
    apiKeyConfigured,
    error: sanitizeCodexAuthError(normalized),
  }
}

async function fallbackCodexAuthStatus(
  apiKeyConfigured: boolean,
): Promise<ProviderAuthStatus | null> {
  try {
    await execCodex(["mcp", "list", "--json"], { timeout: 10_000 })
    return {
      provider: "codex",
      state: "authenticated",
      authenticated: true,
      authMethod: apiKeyConfigured ? "api_key" : "chatgpt",
      accountLabel: apiKeyConfigured
        ? "App-managed CODEX_API_KEY"
        : "ChatGPT subscription",
      apiKeyConfigured,
      error: null,
    }
  } catch (error) {
    const message = sanitizeCodexAuthError(execErrorOutput(error))
    if (
      /not authenticated|login required|unauthorized|forbidden|401/i.test(
        message,
      )
    ) {
      return {
        provider: "codex",
        state: "unauthenticated",
        authenticated: false,
        authMethod: null,
        accountLabel: null,
        apiKeyConfigured,
        error: message,
      }
    }
    return null
  }
}

async function getCodexAuthStatus(): Promise<ProviderAuthStatus> {
  const apiKeyConfigured =
    Boolean(await getCodexApiKey()) ||
    Boolean(process.env.CODEX_API_KEY) ||
    Boolean(process.env.OPENAI_API_KEY)

  if (apiKeyConfigured) {
    return {
      provider: "codex",
      state: "authenticated",
      authenticated: true,
      authMethod: "api_key",
      accountLabel: "App-managed CODEX_API_KEY",
      apiKeyConfigured: true,
      error: null,
    }
  }

  try {
    const { stdout, stderr } = await execCodex(["login", "status"], {
      timeout: 10_000,
    })
    const parsed = parseCodexAuth(
      [stdout, stderr].filter(Boolean).join("\n"),
      apiKeyConfigured,
    )
    if (parsed.state === "unknown") {
      return (await fallbackCodexAuthStatus(apiKeyConfigured)) ?? parsed
    }
    return parsed
  } catch (error) {
    const message = sanitizeCodexAuthError(execErrorOutput(error))
    if (isCodexHeadlessAuthCheckError(message)) {
      const fallback = await fallbackCodexAuthStatus(apiKeyConfigured)
      if (fallback) return fallback
    }

    const isUnauthenticated =
      /not authenticated|login required|unauthorized|forbidden|401/i.test(
        message,
      )
    return {
      provider: "codex",
      state: isUnauthenticated ? "unauthenticated" : "unknown",
      authenticated: false,
      authMethod: null,
      accountLabel: null,
      apiKeyConfigured,
      error: message,
    }
  }
}

interface CodexLegacyExecConfig {
  args: string[]
  prompt: string
  safetyProfile: SafetyProfile
}

function buildCodexLegacyExecArgs(
  options: AgentRunOptions,
  configuredSafetyProfile: SafetyProfile,
): CodexLegacyExecConfig {
  const safetyProfile = resolveSafetyProfile(
    options.executionMode,
    options.safetyProfile || configuredSafetyProfile,
  )
  const prompt = buildCodexToolPolicyPrefix(options)
  const args: string[] = [
    "exec",
    "--json",
    "--ephemeral",
    "--color",
    "never",
    "--skip-git-repo-check",
    "-C",
    options.workdir,
    ...codexSafetyArgs(safetyProfile),
  ]

  if (options.model) {
    args.push("-m", options.model)
  }

  for (const dir of options.addDirs || []) {
    if (!dir) continue
    args.push("--add-dir", dir)
  }

  args.push(
    ...buildProviderExtraArgs("codex", options.mcpConfigPath),
    ...(options.extraArgs || []),
  )
  args.push(prompt)

  return {
    args,
    prompt,
    safetyProfile,
  }
}

export class CodexAgentProvider implements AgentProvider {
  readonly id = "codex" as const

  checkAvailability(): Promise<ProviderHealth> {
    return checkCodexAvailability()
  }

  getAuthStatus(): Promise<ProviderAuthStatus> {
    return getCodexAuthStatus()
  }

  private async createUnavailableHandle(
    reason: string,
  ): Promise<AgentExecutionHandle> {
    return createErroredExecutionHandle(
      this.id,
      "codex_exec",
      `Codex CLI legacy backend is unavailable: ${reason}`,
    )
  }

  async executeInteractive(
    options: AgentRunOptions,
  ): Promise<AgentExecutionHandle> {
    if (!(await supportsCodexExecSubcommand())) {
      return this.createUnavailableHandle(
        "installed Codex CLI does not support `codex exec`",
      )
    }
    return createLegacyExecutionHandle(
      this.id,
      "codex_exec",
      options,
      this.runLegacyCodex.bind(this),
    )
  }

  async executeTask(options: AgentRunOptions): Promise<AgentExecutionHandle> {
    if (!(await supportsCodexExecSubcommand())) {
      return this.createUnavailableHandle(
        "installed Codex CLI does not support `codex exec`",
      )
    }
    return createLegacyExecutionHandle(
      this.id,
      "codex_exec",
      options,
      this.runLegacyCodex.bind(this),
    )
  }

  cancel(_sessionId: string): boolean {
    return false
  }

  private async runLegacyCodex(
    options: AgentRunOptions,
  ): Promise<AgentRunResult> {
    const executable = findCodexExecutable() || "codex"
    const settings = await getProviderSettings()
    const { args } = buildCodexLegacyExecArgs(options, settings.safetyProfile)
    const env = await buildCodexEnv(options.extraEnv)

    return new Promise<AgentRunResult>((resolve, reject) => {
      const startedAt = Date.now()
      const child = spawn(executable, args, {
        cwd: options.workdir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      })
      const normalizerState = createCodexJsonNormalizerState()
      let stdoutBuffer = ""
      let killed = false
      let aborted = Boolean(options.abortSignal?.aborted)

      if (child.pid) {
        options.onSpawn?.(child.pid)
      }

      const onAbort = () => {
        aborted = true
        if (child.killed) return
        killed = child.kill("SIGTERM")
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL")
          }
        }, 2_000).unref()
      }

      if (options.abortSignal) {
        if (options.abortSignal.aborted) {
          onAbort()
        } else {
          options.abortSignal.addEventListener("abort", onAbort, { once: true })
        }
      }

      child.stdout.on("data", (data: Buffer) => {
        stdoutBuffer += data.toString()
        const lines = stdoutBuffer.split(/\r?\n/)
        stdoutBuffer = lines.pop() || ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          const normalized = normalizeCodexJsonLine(trimmed, normalizerState)
          if (normalized.length === 0) {
            options.onStderr?.(Buffer.from(`${trimmed}\n`))
            continue
          }

          for (const eventLine of normalized) {
            options.onStdout?.(Buffer.from(`${eventLine}\n`))
          }
        }
      })

      child.stderr.on("data", (data: Buffer) => {
        options.onStderr?.(data)
      })

      child.on("error", (error) => {
        reject(error)
      })

      child.on("close", (code, signal) => {
        if (stdoutBuffer.trim()) {
          const normalized = normalizeCodexJsonLine(
            stdoutBuffer.trim(),
            normalizerState,
          )
          for (const eventLine of normalized) {
            options.onStdout?.(Buffer.from(`${eventLine}\n`))
          }
        }

        resolve({
          success: code === 0 && !aborted,
          exitCode: code,
          signal,
          killed: killed || child.killed,
          aborted,
          durationMs: Date.now() - startedAt,
          pid: child.pid,
        })
      })
    })
  }
}
