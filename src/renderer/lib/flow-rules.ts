import type {
  ExecutionPolicyTag,
  WorkflowExecutionPolicyProfile,
} from "@shared/types"
import type { ExecutionLoopSummary } from "./execution-loops"

export interface FlowRulePreview {
  id: string
  label: string
  scope: string
}

const POLICY_RULE_REGISTRY: Partial<
  Record<ExecutionPolicyTag, Omit<FlowRulePreview, "id">>
> = {
  human_gate_required: {
    label: "Ask for approval before this step runs",
    scope: "Run",
  },
  review_gates: {
    label: "Pause for human review at high-risk points",
    scope: "Review",
  },
  critique_loops: {
    label: "Return to fix when checks fail",
    scope: "Review",
  },
  consistency_checks: {
    label: "Check completion before the flow continues",
    scope: "Verify",
  },
  publish_gate: {
    label: "Always ask before shipping",
    scope: "Ship",
  },
  evidence_first: {
    label: "Check evidence before continuing",
    scope: "Review",
  },
  spec_first: {
    label: "Keep implementation anchored to the agreed scope",
    scope: "Plan",
  },
  test_first: {
    label: "Run checks before calling the work complete",
    scope: "Verify",
  },
  isolated_workspace: {
    label: "Run in an isolated workspace",
    scope: "Run",
  },
  no_slop: {
    label: "Hold low-quality output for review",
    scope: "Review",
  },
  voice_locked: {
    label: "Keep voice and style locked before publish",
    scope: "Review",
  },
}

function normalizeScopeLabel(
  value: string | null | undefined,
  fallback: string,
) {
  const clean = (value || "").trim()
  return clean || fallback
}

export function deriveExecutionPolicyFlowRules(
  profile: WorkflowExecutionPolicyProfile | null | undefined,
  options?: { defaultScope?: string | null },
) {
  if (!profile) return [] as FlowRulePreview[]

  const rules: FlowRulePreview[] = []
  const seen = new Set<string>()
  const defaultScope = normalizeScopeLabel(options?.defaultScope, "Run")

  for (const tag of profile.tags || []) {
    const rule = POLICY_RULE_REGISTRY[tag]
    if (!rule) continue
    const label = rule.label.trim()
    if (!label || seen.has(label)) continue
    seen.add(label)
    rules.push({
      id: `policy-${tag}`,
      label,
      scope: rule.scope === "Run" ? defaultScope : rule.scope,
    })
  }

  if (rules.length === 0 && profile.summary?.trim()) {
    rules.push({
      id: "policy-summary",
      label: profile.summary.trim(),
      scope: defaultScope,
    })
  }

  return rules
}

function scopeFromLoopLabel(loopLabel: string | null | undefined) {
  const normalized = (loopLabel || "").trim().replace(/\s+loop$/i, "")
  return normalized || "Check"
}

export function deriveExecutionLoopFlowRules(
  summary: ExecutionLoopSummary | null | undefined,
) {
  if (!summary) return [] as FlowRulePreview[]

  const scope = scopeFromLoopLabel(summary.loopLabel)
  const rules: FlowRulePreview[] = [
    {
      id: "loop-pass",
      label: "Continue automatically when checks pass",
      scope,
    },
    {
      id: "loop-return",
      label: "Return to fix when checks stay below the threshold",
      scope,
    },
  ]

  if (summary.maxAttempts > 1) {
    rules.push({
      id: "loop-escalate",
      label: `Escalate after ${summary.maxAttempts} loop attempts`,
      scope,
    })
  }

  if (
    summary.outcome === "human decision" ||
    summary.outcome === "retry cap reached"
  ) {
    rules.push({
      id: "loop-approval",
      label: "Ask for human approval when the loop cannot decide",
      scope,
    })
  }

  return rules
}
