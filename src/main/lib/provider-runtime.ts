import type {
  AgentExecutionHandle,
  AgentRunOptions,
  ProviderAuthStatus,
  ProviderHealth,
  ProviderId,
  Workflow,
  WorkflowNode,
} from "@shared/types"
import {
  resolveNodeProvider,
  resolveWorkflowProvider,
} from "@shared/provider-metadata"
import { getProviderSettings } from "./provider-settings"
import { resolveAgentProvider } from "./providers"

export function applyProviderFeatureFlags(
  provider: ProviderId,
  codexProviderEnabled: boolean,
): ProviderId {
  if (provider === "codex" && !codexProviderEnabled) return "claude"
  return provider
}

export async function resolveWorkflowProviderId(
  workflow: Workflow,
): Promise<ProviderId> {
  const settings = await getProviderSettings()
  const requested = resolveWorkflowProvider(workflow, settings.defaultProvider)
  return applyProviderFeatureFlags(requested, settings.features.codexProvider)
}

export async function resolveNodeProviderId(
  node: WorkflowNode,
  workflow: Workflow,
): Promise<ProviderId> {
  const settings = await getProviderSettings()
  const requested = resolveNodeProvider(
    node,
    workflow,
    settings.defaultProvider,
  )
  return applyProviderFeatureFlags(requested, settings.features.codexProvider)
}

export interface ProviderReadiness {
  provider: ProviderId
  health: ProviderHealth
  auth: ProviderAuthStatus
}

export async function getProviderReadiness(
  provider: ProviderId,
): Promise<ProviderReadiness> {
  const resolved = resolveAgentProvider(provider)
  const [health, auth] = await Promise.all([
    resolved.checkAvailability(),
    resolved.getAuthStatus(),
  ])

  return {
    provider,
    health,
    auth,
  }
}

export function providerReadinessError(
  readiness: ProviderReadiness,
): string | null {
  if (!readiness.health.available) {
    if (readiness.provider === "codex") {
      return "cli_unavailable:Codex CLI is not installed or not executable. Install it with: npm install -g @openai/codex"
    }
    return "cli_unavailable:Claude CLI is not installed. Install it with: npm install -g @anthropic-ai/claude-code"
  }

  if (readiness.provider === "codex" && readiness.auth.state === "unknown") {
    return null
  }

  if (!readiness.auth.authenticated) {
    if (readiness.provider === "codex") {
      return "cli_unavailable:Codex CLI is not authenticated. Run `codex login` (ChatGPT subscription works) or configure an optional CODEX_API_KEY in Settings."
    }
    return "cli_unavailable:Claude CLI is not authenticated. Run `claude login` in your terminal."
  }

  return null
}

export async function startProviderTask(
  provider: ProviderId,
  options: AgentRunOptions,
): Promise<AgentExecutionHandle> {
  const resolved = resolveAgentProvider(provider)
  return resolved.executeTask(options)
}

export async function startProviderInteractive(
  provider: ProviderId,
  options: AgentRunOptions,
): Promise<AgentExecutionHandle> {
  const resolved = resolveAgentProvider(provider)
  return resolved.executeInteractive(options)
}
