import type {
  AgentExecutionHandle,
  AgentProvider,
  AgentRunOptions,
  ProviderAuthStatus,
  ProviderHealth,
} from "@shared/types"
import { createClaudeSdkExecutionHandle } from "../claude-sdk-runtime"
import { execClaude, findClaudeExecutable } from "../claude-cli"
import { getClaudeCodeSubscriptionStatus } from "../claude-subscription"
import { errorMessage } from "./provider-utils"

async function checkClaudeAvailability(): Promise<ProviderHealth> {
  const executablePath = findClaudeExecutable() || undefined

  try {
    const { stdout, stderr } = await execClaude(["--version"], {
      timeout: 5_000,
    })
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

  async executeInteractive(
    options: AgentRunOptions,
  ): Promise<AgentExecutionHandle> {
    return createClaudeSdkExecutionHandle(options)
  }

  async executeTask(options: AgentRunOptions): Promise<AgentExecutionHandle> {
    return createClaudeSdkExecutionHandle(options)
  }

  cancel(_sessionId: string): boolean {
    return false
  }
}
