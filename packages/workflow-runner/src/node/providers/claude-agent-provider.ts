import type {
  AgentExecutionHandle,
  AgentProvider,
  AgentRunOptions,
  AgentRunResult,
  ProviderAuthStatus,
  ProviderHealth,
} from "../../schema.js"
import { createLegacyExecutionHandle } from "../../lib/agent-execution.js"
import { createClaudeSdkExecutionHandle } from "../claude-sdk-runtime.js"
import { execClaude, findClaudeExecutable, spawnClaude, type SpawnClaudeOptions } from "../claude-cli.js"
import { getClaudeCodeSubscriptionStatus } from "../claude-subscription.js"
import { buildProviderExtraArgs } from "../mcp-config.js"
import { errorMessage } from "./provider-utils.js"

function toClaudeSpawnOptions(options: AgentRunOptions): SpawnClaudeOptions {
  const extraArgs = [
    ...buildProviderExtraArgs("claude", options.mcpConfigPath),
    ...(options.disableSlashCommands ? ["--disable-slash-commands"] : []),
    ...(options.disableBuiltInTools ? ["--tools", ""] : []),
    ...(options.resumeSessionId ? ["--resume", options.resumeSessionId] : []),
    ...(options.persistSession === false ? ["--no-session-persistence"] : []),
    ...(options.systemPrompts?.length
      ? ["--append-system-prompt", options.systemPrompts.join("\n\n")]
      : []),
    ...(options.extraArgs || []),
  ]

  return {
    ...options,
    extraArgs,
    onStdout: options.onStdout ? (data) => options.onStdout?.(data) : undefined,
    onStderr: options.onStderr ? (data) => options.onStderr?.(data) : undefined,
  }
}

async function checkClaudeAvailability(): Promise<ProviderHealth> {
  const executablePath = findClaudeExecutable() || undefined

  try {
    const { stdout, stderr } = await execClaude(["--version"], { timeout: 5_000 })
    const version = `${stdout}\n${stderr}`
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean)

    return {
      provider: "claude",
      available: true,
      executablePath,
      version,
      error: null,
    }
  } catch (error) {
    return {
      provider: "claude",
      available: false,
      executablePath,
      error: errorMessage(error) || "Claude CLI is not available.",
    }
  }
}

export class ClaudeAgentProvider implements AgentProvider {
  readonly id = "claude" as const

  checkAvailability(): Promise<ProviderHealth> {
    return checkClaudeAvailability()
  }

  async getAuthStatus(): Promise<ProviderAuthStatus> {
    const status = await getClaudeCodeSubscriptionStatus()
    return {
      provider: "claude",
      state: status.loggedIn ? "authenticated" : "unauthenticated",
      authenticated: status.loggedIn,
      authMethod: status.authMethod,
      accountLabel: status.apiProvider,
      error: status.error,
    }
  }

  private async runLegacyClaude(options: AgentRunOptions): Promise<AgentRunResult> {
    return spawnClaude(toClaudeSpawnOptions(options))
  }

  async executeInteractive(options: AgentRunOptions): Promise<AgentExecutionHandle> {
    try {
      return await createClaudeSdkExecutionHandle(options)
    } catch {
      return createLegacyExecutionHandle(this.id, "claude_cli", options, this.runLegacyClaude.bind(this))
    }
  }

  async executeTask(options: AgentRunOptions): Promise<AgentExecutionHandle> {
    try {
      return await createClaudeSdkExecutionHandle(options)
    } catch {
      return createLegacyExecutionHandle(this.id, "claude_cli", options, this.runLegacyClaude.bind(this))
    }
  }

  cancel(_sessionId: string): boolean {
    return false
  }
}
