import { spawn } from "node:child_process"
import { resolveSafetyProfile } from "@shared/provider-metadata"
import type {
  AgentExecutionHandle,
  AgentProvider,
  AgentRunOptions,
  AgentRunResult,
  ProviderAuthStatus,
  ProviderHealth,
  SafetyProfile,
} from "@shared/types"
import {
  createErroredExecutionHandle,
  createLegacyExecutionHandle,
} from "../agent-execution"
import {
  canUseCodexAcpExecution,
  createCodexAcpExecutionHandle,
} from "../codex-acp-runtime"
import {
  buildCodexEnv,
  execCodex,
  findCodexExecutable,
  supportsCodexExecSubcommand,
} from "../codex-cli"
import {
  createCodexJsonNormalizerState,
  normalizeCodexJsonLine,
} from "../codex-json-normalizer"
import { buildProviderExtraArgs } from "../mcp-config"
import { getProviderSettings } from "../provider-settings"
import { logInfo, logWarn } from "../structured-log"
import {
  getCodexAuthStatus,
  isCodexInteractiveEditorNoise,
  summarizeCodexInteractiveEditorNoise,
} from "./codex-auth"
import { errorMessage, normalizeCliText } from "./provider-utils"

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

interface CodexLegacyExecConfig {
  args: string[]
  prompt: string
  safetyProfile: SafetyProfile
  mcpOverrideArgs: string[]
}

export function buildCodexLegacyExecArgs(
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

  const mcpOverrideArgs = buildProviderExtraArgs("codex", options.mcpConfigPath)
  const legacyExtraArgs = [...mcpOverrideArgs, ...(options.extraArgs || [])]
  if (legacyExtraArgs.length > 0) {
    args.push(...legacyExtraArgs)
  }

  args.push(prompt)

  return {
    args,
    prompt,
    safetyProfile,
    mcpOverrideArgs,
  }
}

export class CodexAgentProvider implements AgentProvider {
  readonly id = "codex" as const

  private async createCodexLegacyUnavailableHandle(
    mode: "interactive" | "task",
    reason: string,
  ): Promise<AgentExecutionHandle> {
    const message = `Codex ACP could not be used (${reason}), and the installed Codex CLI does not support the legacy \`codex exec\` backend. Restart on a build with ACP working, or upgrade the Codex CLI fallback implementation.`
    logWarn("codex-provider", "legacy-exec-unavailable", {
      mode,
      reason,
      message,
    })
    return createErroredExecutionHandle(this.id, "codex_exec", message)
  }

  checkAvailability(): Promise<ProviderHealth> {
    return checkCodexAvailability()
  }

  getAuthStatus(): Promise<ProviderAuthStatus> {
    return getCodexAuthStatus()
  }

  private async createExecutionHandle(
    mode: "interactive" | "task",
    options: AgentRunOptions,
  ): Promise<AgentExecutionHandle> {
    const settings = await getProviderSettings()
    const support = canUseCodexAcpExecution(options, settings.safetyProfile)

    logInfo("codex-provider", "backend-selection", {
      mode,
      workdir: options.workdir,
      model: options.model ?? null,
      executionMode: options.executionMode ?? null,
      requestedSafetyProfile: options.safetyProfile ?? null,
      configuredSafetyProfile: settings.safetyProfile,
      addDirCount: options.addDirs?.length ?? 0,
      hasMcpConfigPath: Boolean(options.mcpConfigPath),
      acpSupported: support.supported,
      acpUnsupportedReason: support.reason ?? null,
    })

    if (!support.supported) {
      if (!(await supportsCodexExecSubcommand())) {
        return this.createCodexLegacyUnavailableHandle(
          mode,
          support.reason ?? "ACP unsupported",
        )
      }
      logWarn("codex-provider", "legacy-fallback", {
        mode,
        reason: support.reason ?? "unknown",
        workdir: options.workdir,
        hasMcpConfigPath: Boolean(options.mcpConfigPath),
      })
      return createLegacyExecutionHandle(
        this.id,
        "codex_exec",
        options,
        this.runLegacyCodex.bind(this),
      )
    }

    try {
      const handle = await createCodexAcpExecutionHandle(options)
      logInfo("codex-provider", "acp-selected", {
        mode,
        workdir: options.workdir,
        hasMcpConfigPath: Boolean(options.mcpConfigPath),
      })
      return handle
    } catch (error) {
      if (!(await supportsCodexExecSubcommand())) {
        return this.createCodexLegacyUnavailableHandle(
          mode,
          errorMessage(error),
        )
      }
      logWarn("codex-provider", "acp-init-failed", {
        mode,
        workdir: options.workdir,
        hasMcpConfigPath: Boolean(options.mcpConfigPath),
        error: errorMessage(error),
      })
      return createLegacyExecutionHandle(
        this.id,
        "codex_exec",
        options,
        this.runLegacyCodex.bind(this),
      )
    }
  }

  executeInteractive(options: AgentRunOptions): Promise<AgentExecutionHandle> {
    return this.createExecutionHandle("interactive", options)
  }

  executeTask(options: AgentRunOptions): Promise<AgentExecutionHandle> {
    return this.createExecutionHandle("task", options)
  }

  cancel(_sessionId: string): boolean {
    return false
  }

  private async runLegacyCodex(
    options: AgentRunOptions,
  ): Promise<AgentRunResult> {
    if (!(await supportsCodexExecSubcommand())) {
      throw new Error(
        "Installed Codex CLI does not support the legacy `codex exec` backend.",
      )
    }

    const executable = findCodexExecutable() || "codex"
    const settings = await getProviderSettings()
    const { args, safetyProfile, mcpOverrideArgs } = buildCodexLegacyExecArgs(
      options,
      settings.safetyProfile,
    )
    const env = await buildCodexEnv(options.extraEnv)

    logWarn("codex-provider", "legacy-exec-start", {
      workdir: options.workdir,
      model: options.model ?? null,
      resolvedSafetyProfile: safetyProfile,
      addDirCount: options.addDirs?.length ?? 0,
      hasMcpConfigPath: Boolean(options.mcpConfigPath),
      mcpOverrideArgCount: mcpOverrideArgs.length,
      hasCodexConfigOverrides: mcpOverrideArgs.length > 0,
      extraArgCount: options.extraArgs?.length ?? 0,
    })

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
      let sawInteractiveEditorNoise = false

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
        const text = data.toString("utf-8")
        if (isCodexInteractiveEditorNoise(text)) {
          const summary = summarizeCodexInteractiveEditorNoise(text)
          if (!sawInteractiveEditorNoise) {
            sawInteractiveEditorNoise = true
            logWarn("codex-provider", "legacy-exec-interactive-editor", {
              workdir: options.workdir,
              hasMcpConfigPath: Boolean(options.mcpConfigPath),
              mcpOverrideArgCount: mcpOverrideArgs.length,
              stderr: normalizeCliText(text).slice(0, 500),
            })
            options.onStderr?.(Buffer.from(`${summary}\n`))
          }
          return
        }
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

        logInfo("codex-provider", "legacy-exec-finished", {
          workdir: options.workdir,
          exitCode: code,
          signal,
          aborted,
          killed: killed || child.killed,
          sawInteractiveEditorNoise,
        })

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
