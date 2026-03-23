import type {
  PermissionMode,
  ProviderId,
  SafetyProfile,
  Workflow,
  WorkflowNode,
} from "./types"

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  claude: "Claude Code",
  codex: "OpenAI Codex",
}

export const PROVIDER_MODELS: Record<ProviderId, string[]> = {
  claude: [
    "sonnet",
    "opus",
    "haiku",
    "claude-sonnet-4-6",
    "claude-opus-4-6",
    "claude-haiku-4-5",
  ],
  codex: [
    "gpt-5.4",
    "gpt-5.3-codex",
    "gpt-5.2-codex",
    "gpt-5.2",
    "gpt-5.1-codex-max",
    "gpt-5.1-codex-mini",
  ],
}

export const DEFAULT_MODEL_BY_PROVIDER: Record<ProviderId, string> = {
  claude: "sonnet",
  codex: "gpt-5.4",
}

export const SAFETY_PROFILE_LABELS: Record<SafetyProfile, string> = {
  safe_readonly: "Safe read-only",
  workspace_auto: "Workspace auto",
  workspace_untrusted: "Workspace untrusted",
  ci_readonly: "CI read-only",
  dangerous: "Dangerous",
}

export function getDefaultModelForProvider(provider: ProviderId): string {
  return DEFAULT_MODEL_BY_PROVIDER[provider]
}

export function getProviderModels(provider: ProviderId): string[] {
  return PROVIDER_MODELS[provider]
}

export function inferProviderFromModel(
  model?: string | null,
): ProviderId | null {
  const normalized = (model || "").trim().toLowerCase()
  if (!normalized) return null

  if (
    normalized.includes("sonnet") ||
    normalized.includes("opus") ||
    normalized.includes("haiku") ||
    normalized.startsWith("claude")
  ) {
    return "claude"
  }

  if (
    normalized.startsWith("gpt-") ||
    normalized.includes("codex") ||
    normalized === "o1" ||
    normalized === "o3" ||
    normalized === "o4-mini" ||
    normalized.startsWith("o1-") ||
    normalized.startsWith("o3-") ||
    normalized.startsWith("o4-")
  ) {
    return "codex"
  }

  return null
}

export function modelLooksCompatible(
  provider: ProviderId,
  model?: string | null,
): boolean {
  const inferred = inferProviderFromModel(model)
  if (!inferred) return true
  return inferred === provider
}

export function resolveWorkflowProvider(
  workflow: Workflow,
  defaultProvider: ProviderId,
): ProviderId {
  return workflow.defaults?.provider || defaultProvider
}

export function workflowRequiresProvider(workflow: Workflow): boolean {
  return workflow.nodes.some(
    (node) =>
      node.type === "skill" ||
      node.type === "evaluator" ||
      node.type === "splitter" ||
      node.type === "merger",
  )
}

export function resolveNodeProvider(
  node: WorkflowNode,
  workflow: Workflow,
  defaultProvider: ProviderId,
): ProviderId {
  return workflow.defaults?.provider || defaultProvider
}

export function resolveSafetyProfile(
  executionMode: PermissionMode | undefined,
  configuredProfile: SafetyProfile,
): SafetyProfile {
  if (executionMode === "plan") return "safe_readonly"
  return configuredProfile
}
