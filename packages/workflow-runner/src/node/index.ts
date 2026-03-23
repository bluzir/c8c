import {
  createWorkflowRunner,
  type WorkflowRunner,
  type WorkflowRunnerDeps,
} from "../runner.js"
import type { ProviderId } from "../schema.js"
import { prepareWorkspaceMcpConfig } from "./mcp-config.js"
import { scanAllSkills } from "./skill-scanner.js"
import { ClaudeAgentProvider } from "./providers/claude-agent-provider.js"
import { CodexAgentProvider } from "./providers/codex-agent-provider.js"

export { execClaude, findClaudeExecutable } from "./claude-cli.js"
export { getClaudeCodeSubscriptionStatus } from "./claude-subscription.js"
export {
  execCodex,
  findCodexExecutable,
  supportsCodexExecSubcommand,
} from "./codex-cli.js"
export {
  buildProviderExtraArgs,
  prepareWorkspaceMcpConfig,
} from "./mcp-config.js"
export { getCodexApiKey, getProviderSettings } from "./provider-settings.js"
export { scanAllSkills, scanSkills, scanUserSkills } from "./skill-scanner.js"
export { validateWorkflowExtended } from "./workflow-validator.js"
export { ClaudeAgentProvider } from "./providers/claude-agent-provider.js"
export { CodexAgentProvider } from "./providers/codex-agent-provider.js"

let claudeAgentProvider: ClaudeAgentProvider | null = null
let codexAgentProvider: CodexAgentProvider | null = null

export function resolveNodeAgentProvider(
  providerId: ProviderId,
): ClaudeAgentProvider | CodexAgentProvider {
  if (providerId === "claude") {
    claudeAgentProvider ||= new ClaudeAgentProvider()
    return claudeAgentProvider
  }

  if (providerId === "codex") {
    codexAgentProvider ||= new CodexAgentProvider()
    return codexAgentProvider
  }

  throw new Error(`Unsupported provider: ${providerId}`)
}

export function createNodeRunnerDeps(
  providerOverride?: ProviderId,
): WorkflowRunnerDeps {
  return {
    startProviderTask(providerId, options) {
      return resolveNodeAgentProvider(providerId).executeTask(options)
    },
    resolveWorkflowProviderId(workflow) {
      return Promise.resolve(
        providerOverride || workflow.defaults?.provider || "claude",
      )
    },
    resolveNodeProviderId(_node, workflow) {
      return Promise.resolve(
        providerOverride || workflow.defaults?.provider || "claude",
      )
    },
    prepareWorkspaceMcpConfig,
    scanSkills: scanAllSkills,
  }
}

export function createNodeWorkflowRunner(
  providerOverride?: ProviderId,
): WorkflowRunner {
  return createWorkflowRunner(createNodeRunnerDeps(providerOverride))
}

export type { WorkflowRunnerDeps }
