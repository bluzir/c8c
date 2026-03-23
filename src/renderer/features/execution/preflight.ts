import type { C8cApi } from "@shared/c8c-api"
import { getModelPricing, resolveModelFamily } from "@shared/model-pricing"
import {
  PROVIDER_LABELS,
  resolveWorkflowProvider,
  workflowRequiresProvider,
} from "@shared/provider-metadata"
import type {
  ClaudeCodeSubscriptionStatus,
  EvaluatorNodeConfig,
  ProviderDiagnostics,
  ProviderId,
  ProviderSettings,
  SplitterNodeConfig,
  Workflow,
  WorkflowNode,
} from "@shared/types"

export interface ExecutionPreflightSnapshot {
  diagnostics: ProviderDiagnostics
  cliStatus: ClaudeCodeSubscriptionStatus | null
}

export interface PreflightWarning {
  kind: "token_budget"
  title: string
  message: string
  detail: string
  estimatedCostUsd: number
  worstCaseInvocations: number
}

export interface ExecutionPreflightSuccess {
  ok: true
  effectiveProvider: ProviderId
  snapshot: ExecutionPreflightSnapshot
  warnings: PreflightWarning[]
}

export interface ExecutionPreflightFailure {
  ok: false
  reason: "cli_unavailable" | "cli_version_unsupported" | "auth_required"
  effectiveProvider: ProviderId
  message: string
  snapshot: ExecutionPreflightSnapshot
}

export type ExecutionPreflightResult =
  | ExecutionPreflightSuccess
  | ExecutionPreflightFailure

type ExecutionPreflightApi = Pick<
  C8cApi,
  "getProviderDiagnostics" | "getClaudeCodeSubscriptionStatus"
>

/**
 * Minimum Claude CLI version required by c8c.
 * Bump this when c8c starts relying on newer CLI features.
 */
export const MIN_CLAUDE_CLI_VERSION = "1.0.0"

/**
 * Extract a semver-ish version string (e.g. "1.0.33") from a raw `claude --version` output line.
 * Returns null when no version can be parsed.
 */
export function parseCliVersion(raw: string | undefined | null): string | null {
  if (!raw) return null
  const match = raw.match(/(\d+\.\d+\.\d+)/)
  return match ? match[1] : null
}

/**
 * Compare two semver strings.  Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number)
  const pb = b.split(".").map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function applyExecutionProviderFeatureFlags(
  provider: ProviderId,
  features: ProviderSettings["features"],
): ProviderId {
  if (provider === "codex" && !features.codexProvider) return "claude"
  return provider
}

export function resolveEffectiveExecutionProvider(
  workflow: Workflow,
  settings: ProviderSettings,
): ProviderId {
  const requestedProvider = resolveWorkflowProvider(
    workflow,
    settings.defaultProvider,
  )
  return applyExecutionProviderFeatureFlags(
    requestedProvider,
    settings.features,
  )
}

function unavailableMessage(
  provider: ProviderId,
  cliStatus: ClaudeCodeSubscriptionStatus | null,
  providerError?: string | null,
): string {
  if (provider === "codex") {
    return (
      providerError ||
      "Codex CLI is not installed or not executable. Install it with: npm install -g @openai/codex"
    )
  }

  if (cliStatus && !cliStatus.cliInstalled) {
    return (
      cliStatus.error ||
      "Claude CLI is not installed. Install it with: npm install -g @anthropic-ai/claude-code"
    )
  }

  return (
    providerError ||
    "Claude CLI is not installed. Install it with: npm install -g @anthropic-ai/claude-code"
  )
}

function authRequiredMessage(
  provider: ProviderId,
  cliStatus: ClaudeCodeSubscriptionStatus | null,
  providerError?: string | null,
): string {
  if (provider === "codex") {
    return (
      providerError ||
      "Codex CLI is not authenticated. Run `codex login` (ChatGPT subscription works) or configure an optional CODEX_API_KEY in Settings."
    )
  }

  if (cliStatus && !cliStatus.loggedIn) {
    return (
      cliStatus.error ||
      "Claude CLI is not authenticated. Run `claude login` in your terminal."
    )
  }

  return (
    providerError ||
    "Claude CLI is not authenticated. Run `claude login` in your terminal."
  )
}

export function evaluateExecutionStartPreflight(
  workflow: Workflow,
  snapshot: ExecutionPreflightSnapshot,
): ExecutionPreflightResult {
  const effectiveProvider = resolveEffectiveExecutionProvider(
    workflow,
    snapshot.diagnostics.settings,
  )

  if (!workflowRequiresProvider(workflow)) {
    const warnings = collectPreflightWarnings(
      workflow,
      snapshot.diagnostics.settings,
    )
    return {
      ok: true,
      effectiveProvider,
      snapshot,
      warnings,
    }
  }

  const providerHealth = snapshot.diagnostics.health[effectiveProvider]
  const providerAuth = snapshot.diagnostics.auth[effectiveProvider]

  if (!providerHealth?.available) {
    return {
      ok: false,
      reason: "cli_unavailable",
      effectiveProvider,
      message: unavailableMessage(
        effectiveProvider,
        snapshot.cliStatus,
        providerHealth?.error,
      ),
      snapshot,
    }
  }

  // Version gate — only enforced for Claude CLI where we can reliably parse semver.
  if (effectiveProvider === "claude") {
    const detectedVersion = parseCliVersion(providerHealth?.version)
    if (
      detectedVersion &&
      compareSemver(detectedVersion, MIN_CLAUDE_CLI_VERSION) < 0
    ) {
      return {
        ok: false,
        reason: "cli_version_unsupported",
        effectiveProvider,
        message: `Claude CLI version ${detectedVersion} is installed, but c8c requires ${MIN_CLAUDE_CLI_VERSION} or newer. Run: npm update -g @anthropic-ai/claude-code`,
        snapshot,
      }
    }
  }

  // Codex can legitimately return unknown auth state when ACP/API-key-backed flows are available.
  if (effectiveProvider === "codex" && providerAuth?.state === "unknown") {
    const warnings = collectPreflightWarnings(
      workflow,
      snapshot.diagnostics.settings,
    )
    return {
      ok: true,
      effectiveProvider,
      snapshot,
      warnings,
    }
  }

  if (!providerAuth?.authenticated) {
    return {
      ok: false,
      reason: "auth_required",
      effectiveProvider,
      message: authRequiredMessage(
        effectiveProvider,
        snapshot.cliStatus,
        providerAuth?.error,
      ),
      snapshot,
    }
  }

  const warnings = collectPreflightWarnings(
    workflow,
    snapshot.diagnostics.settings,
  )
  return {
    ok: true,
    effectiveProvider,
    snapshot,
    warnings,
  }
}

function collectPreflightWarnings(
  workflow: Workflow,
  settings: ProviderSettings,
): PreflightWarning[] {
  const warnings: PreflightWarning[] = []
  const effectiveProvider = resolveEffectiveExecutionProvider(
    workflow,
    settings,
  )
  if (effectiveProvider === "codex") {
    return warnings
  }
  const defaultModel = workflow.defaults?.model ?? "sonnet"
  const budgetWarning = evaluateTokenBudgetWarning(workflow, defaultModel)
  if (budgetWarning) {
    warnings.push(budgetWarning)
  }
  return warnings
}

export async function loadExecutionStartPreflight(
  api: ExecutionPreflightApi,
  workflow: Workflow,
): Promise<ExecutionPreflightResult> {
  const diagnostics = await api.getProviderDiagnostics()
  if (!workflowRequiresProvider(workflow)) {
    return evaluateExecutionStartPreflight(workflow, {
      diagnostics,
      cliStatus: null,
    })
  }

  const effectiveProvider = resolveEffectiveExecutionProvider(
    workflow,
    diagnostics.settings,
  )
  const cliStatus =
    effectiveProvider === "claude"
      ? await api.getClaudeCodeSubscriptionStatus()
      : null

  return evaluateExecutionStartPreflight(workflow, {
    diagnostics,
    cliStatus,
  })
}

export function formatExecutionPreflightTitle(
  provider: ProviderId,
  reason: ExecutionPreflightFailure["reason"],
): string {
  const providerLabel = PROVIDER_LABELS[provider]
  if (reason === "cli_unavailable") return `${providerLabel} unavailable`
  if (reason === "cli_version_unsupported")
    return `${providerLabel} update required`
  return `${providerLabel} login required`
}

function appendSettingsHint(message: string) {
  const trimmed = message.trim()
  if (!trimmed) return "Open Settings to fix the provider setup."
  if (/open settings/i.test(trimmed)) return trimmed
  return `${trimmed} Open Settings to fix the provider setup.`
}

export function resolveExecutionStartBlockReason(
  workflow: Workflow,
  snapshot: {
    settings: ProviderSettings
    availability: Record<
      ProviderId,
      ProviderDiagnostics["health"][ProviderId] | null
    >
    auth: Record<ProviderId, ProviderDiagnostics["auth"][ProviderId] | null>
  },
): string | null {
  if (!workflowRequiresProvider(workflow)) {
    return null
  }

  const effectiveProvider = resolveEffectiveExecutionProvider(
    workflow,
    snapshot.settings,
  )
  const providerHealth = snapshot.availability[effectiveProvider]
  if (!providerHealth) {
    return null
  }
  if (!providerHealth.available) {
    return appendSettingsHint(
      unavailableMessage(effectiveProvider, null, providerHealth.error),
    )
  }

  if (effectiveProvider === "claude") {
    const detectedVersion = parseCliVersion(providerHealth.version)
    if (
      detectedVersion &&
      compareSemver(detectedVersion, MIN_CLAUDE_CLI_VERSION) < 0
    ) {
      return appendSettingsHint(
        `Claude CLI version ${detectedVersion} is installed, but c8c requires ${MIN_CLAUDE_CLI_VERSION} or newer. Run: npm update -g @anthropic-ai/claude-code`,
      )
    }
  }

  const providerAuth = snapshot.auth[effectiveProvider]
  if (!providerAuth) {
    return null
  }
  if (effectiveProvider === "codex" && providerAuth.state === "unknown") {
    return null
  }
  if (!providerAuth.authenticated) {
    return appendSettingsHint(
      authRequiredMessage(effectiveProvider, null, providerAuth.error),
    )
  }

  return null
}

// ── Token Budget Estimation ─────────────────────────────

/**
 * Conservative average tokens per skill invocation, keyed by model family.
 * Used for worst-case estimation when no historical data is available.
 */
const AVG_TOKENS_PER_INVOCATION: Record<string, number> = {
  opus: 50_000,
  sonnet: 20_000,
  haiku: 10_000,
}

const DEFAULT_SPLITTER_MAX_BRANCHES = 3
const DEFAULT_EVALUATOR_MAX_RETRIES = 0

/** Default cost threshold (USD) above which a preflight warning is emitted. */
export const DEFAULT_COST_WARNING_THRESHOLD_USD = 5

export interface FlowCostEstimate {
  totalSkillNodes: number
  worstCaseInvocations: number
  estimatedCostUsd: number
  modelFamily: string
  breakdown: FlowCostBreakdownItem[]
}

export interface FlowCostBreakdownItem {
  label: string
  kind: "skill" | "splitter" | "evaluator"
  multiplier: number
}

/**
 * Analyze a workflow graph and estimate worst-case cost.
 *
 * The algorithm:
 * 1. Counts all skill nodes (base invocations).
 * 2. For each splitter, finds downstream skill nodes (up to the next merger)
 *    and multiplies those by `maxBranches`.
 * 3. For each evaluator with retries, finds the retry-from node (or the node
 *    feeding the evaluator) and counts downstream skill nodes between that
 *    point and the evaluator, multiplied by `maxRetries`.
 * 4. Estimates cost using conservative per-invocation token averages.
 */
export function estimateFlowCost(
  workflow: Workflow,
  defaultModel?: string,
): FlowCostEstimate {
  const modelFamily = resolveModelFamily(
    defaultModel || workflow.defaults?.model,
  )
  const nodeMap = new Map<string, WorkflowNode>()
  for (const node of workflow.nodes) {
    nodeMap.set(node.id, node)
  }

  // Build adjacency list for downstream traversal
  const outgoing = new Map<string, string[]>()
  for (const edge of workflow.edges) {
    const targets = outgoing.get(edge.source) ?? []
    targets.push(edge.target)
    outgoing.set(edge.source, targets)
  }

  const skillNodes = workflow.nodes.filter((n) => n.type === "skill")
  const splitterNodes = workflow.nodes.filter((n) => n.type === "splitter")
  const evaluatorNodes = workflow.nodes.filter((n) => n.type === "evaluator")
  const summarizeMergerNodes = workflow.nodes.filter(
    (node) => node.type === "merger" && node.config.strategy === "summarize",
  )

  const totalSkillNodes = skillNodes.length
  const breakdown: FlowCostBreakdownItem[] = []

  if (totalSkillNodes > 0) {
    breakdown.push({
      label: `${totalSkillNodes} skill step${totalSkillNodes === 1 ? "" : "s"}`,
      kind: "skill",
      multiplier: 1,
    })
  }

  // Start with base skill count
  let worstCaseInvocations = totalSkillNodes

  if (summarizeMergerNodes.length > 0) {
    worstCaseInvocations += summarizeMergerNodes.length
    breakdown.push({
      label: `${summarizeMergerNodes.length} summarize merger${summarizeMergerNodes.length === 1 ? "" : "s"}`,
      kind: "evaluator",
      multiplier: 1,
    })
  }

  // Splitter fan-out: each splitter multiplies downstream skills
  for (const splitter of splitterNodes) {
    const config = splitter.config as SplitterNodeConfig
    const maxBranches = config.maxBranches ?? DEFAULT_SPLITTER_MAX_BRANCHES

    // Find skill nodes downstream of this splitter (BFS, stop at merger)
    const downstreamSkills = countDownstreamSkillNodes(
      splitter.id,
      nodeMap,
      outgoing,
    )

    if (downstreamSkills > 0 && maxBranches > 1) {
      // The downstream skills are already counted once in totalSkillNodes.
      // The splitter creates (maxBranches - 1) additional copies of each.
      const additionalInvocations = downstreamSkills * (maxBranches - 1)
      worstCaseInvocations += additionalInvocations

      breakdown.push({
        label: `1 splitter (\u00d7${maxBranches} branches, ${downstreamSkills} downstream skill${downstreamSkills === 1 ? "" : "s"})`,
        kind: "splitter",
        multiplier: maxBranches,
      })
    }
  }

  // Evaluator retries: each retry re-runs upstream skill nodes
  for (const evaluator of evaluatorNodes) {
    const config = evaluator.config as EvaluatorNodeConfig
    const maxRetries = config.maxRetries ?? DEFAULT_EVALUATOR_MAX_RETRIES

    if (maxRetries > 0) {
      // The retryFrom node is the starting point of the retry loop.
      // If not specified, the immediate upstream skill node is retried.
      const retryScope = countRetrySkillNodes(
        evaluator.id,
        config.retryFrom,
        nodeMap,
        outgoing,
        workflow,
      )

      if (retryScope > 0) {
        const additionalInvocations = retryScope * maxRetries
        worstCaseInvocations += additionalInvocations

        breakdown.push({
          label: `1 check (\u00d7${maxRetries} retries, ${retryScope} skill${retryScope === 1 ? "" : "s"} per retry)`,
          kind: "evaluator",
          multiplier: 1 + maxRetries,
        })
      }
    }
  }

  // Estimate cost
  const avgTokens =
    AVG_TOKENS_PER_INVOCATION[modelFamily] ?? AVG_TOKENS_PER_INVOCATION.sonnet
  // Assume roughly equal input/output token split
  const inputTokens = avgTokens * 0.6
  const outputTokens = avgTokens * 0.4
  const pricing = getModelPricing(modelFamily)
  const costPerInvocation =
    (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
  const estimatedCostUsd = worstCaseInvocations * costPerInvocation

  return {
    totalSkillNodes,
    worstCaseInvocations,
    estimatedCostUsd,
    modelFamily,
    breakdown,
  }
}

/**
 * BFS from a splitter to find downstream skill nodes.
 * Stops traversal at merger nodes (they represent the end of the fan-out region).
 */
function countDownstreamSkillNodes(
  splitterId: string,
  nodeMap: Map<string, WorkflowNode>,
  outgoing: Map<string, string[]>,
): number {
  const visited = new Set<string>()
  const queue = outgoing.get(splitterId) ?? []
  let skillCount = 0

  const pending = [...queue]
  while (pending.length > 0) {
    const id = pending.shift()!
    if (visited.has(id)) continue
    visited.add(id)

    const node = nodeMap.get(id)
    if (!node) continue

    if (node.type === "skill") {
      skillCount++
    }

    // Stop at merger — it's the convergence point
    if (node.type === "merger") continue

    for (const next of outgoing.get(id) ?? []) {
      pending.push(next)
    }
  }

  return skillCount
}

/**
 * Count skill nodes in the retry scope of an evaluator.
 *
 * If `retryFrom` is specified, count skills between retryFrom and the evaluator.
 * Otherwise, count immediate upstream skill nodes of the evaluator.
 */
function countRetrySkillNodes(
  evaluatorId: string,
  retryFrom: string | undefined,
  nodeMap: Map<string, WorkflowNode>,
  outgoing: Map<string, string[]>,
  workflow: Workflow,
): number {
  // Build reverse adjacency (incoming edges)
  const incoming = new Map<string, string[]>()
  for (const edge of workflow.edges) {
    const sources = incoming.get(edge.target) ?? []
    sources.push(edge.source)
    incoming.set(edge.target, sources)
  }

  if (retryFrom) {
    // BFS forward from retryFrom, counting skills, stopping at (but not including) evaluator
    const visited = new Set<string>()
    const pending = [retryFrom]
    let skillCount = 0

    while (pending.length > 0) {
      const id = pending.shift()!
      if (visited.has(id) || id === evaluatorId) continue
      visited.add(id)

      const node = nodeMap.get(id)
      if (!node) continue

      if (node.type === "skill") {
        skillCount++
      }

      for (const next of outgoing.get(id) ?? []) {
        pending.push(next)
      }
    }

    return skillCount
  }

  // No retryFrom: count immediate upstream skill nodes
  const upstreamIds = incoming.get(evaluatorId) ?? []
  let count = 0
  for (const id of upstreamIds) {
    const node = nodeMap.get(id)
    if (node?.type === "skill") count++
  }
  return Math.max(count, 1) // At least 1 skill is retried
}

/**
 * Build a human-readable breakdown string for the cost warning.
 */
export function formatCostBreakdown(estimate: FlowCostEstimate): string {
  const parts = estimate.breakdown.map((item) => item.label)
  return `${parts.join(", ")} = up to ${estimate.worstCaseInvocations} invocations`
}

/**
 * Evaluate a workflow for token budget warnings.
 * Returns a PreflightWarning if the estimated cost exceeds the threshold.
 */
export function evaluateTokenBudgetWarning(
  workflow: Workflow,
  defaultModel?: string,
  thresholdUsd: number = DEFAULT_COST_WARNING_THRESHOLD_USD,
): PreflightWarning | null {
  const estimate = estimateFlowCost(workflow, defaultModel)

  if (estimate.estimatedCostUsd <= thresholdUsd) return null
  if (estimate.worstCaseInvocations <= 1) return null

  const costFormatted = estimate.estimatedCostUsd.toFixed(2)
  const detail = formatCostBreakdown(estimate)

  return {
    kind: "token_budget",
    title: "High estimated cost",
    message: `This flow could use up to ~$${costFormatted} in the worst case (${estimate.worstCaseInvocations} skill invocations). Continue?`,
    detail,
    estimatedCostUsd: estimate.estimatedCostUsd,
    worstCaseInvocations: estimate.worstCaseInvocations,
  }
}
