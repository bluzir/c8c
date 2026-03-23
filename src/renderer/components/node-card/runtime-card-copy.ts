import type {
  ApprovalNodeConfig,
  EvaluatorNodeConfig,
  HumanNodeConfig,
  MergerNodeConfig,
  NodeState,
  NodeStatus,
  OutputNodeConfig,
  SkillNodeConfig,
  WorkflowNode,
} from "@shared/types"

export interface RuntimeBranchSummaryPreview {
  id: string
  label: string
  detail?: string | null
  status: NodeStatus
}

export interface RuntimeBranchSummary {
  total: number
  running: number
  completed: number
  failed: number
  waitingApproval: number
  pending: number
  previews: RuntimeBranchSummaryPreview[]
}

export interface RuntimeCardCopy {
  summary: string
  detail: string | null
  metricChips: string[]
}

function compactRuntimeText(value: string | undefined | null, maxLength = 120) {
  if (!value) return null
  const normalized = value.replace(/\s+/g, " ").trim()
  if (!normalized) return null
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trimEnd()}...`
}

function formatDurationMs(durationMs: number | null) {
  if (durationMs == null || durationMs <= 0) return null

  const totalSeconds = Math.round(durationMs / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, "0")}s`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${String(remainingMinutes).padStart(2, "0")}m`
}

function formatTokenCount(tokens: number) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`
  return String(tokens)
}

function getLatestLogSnippet(state?: NodeState) {
  if (!state?.log?.length) return null

  for (let index = state.log.length - 1; index >= 0; index -= 1) {
    const entry = state.log[index]
    if (
      entry.type === "thinking" ||
      entry.type === "text" ||
      entry.type === "error"
    ) {
      const snippet = compactRuntimeText(entry.content, 120)
      if (snippet) return snippet
    }
    if (entry.type === "tool_use") {
      return `Using ${entry.tool}`
    }
    if (entry.type === "tool_result") {
      return entry.status === "success"
        ? `${entry.tool} returned data`
        : `${entry.tool} returned an error`
    }
  }

  return null
}

function formatBranchSummary(summary: RuntimeBranchSummary) {
  const parts: string[] = []

  if (summary.running > 0) {
    parts.push(`${summary.running}/${summary.total} active`)
  } else if (summary.completed > 0) {
    parts.push(`${summary.completed}/${summary.total} done`)
  } else {
    parts.push(`${summary.total} branches`)
  }

  if (summary.waitingApproval > 0) {
    parts.push(`${summary.waitingApproval} blocked`)
  }
  if (summary.failed > 0) {
    parts.push(`${summary.failed} issue${summary.failed === 1 ? "" : "s"}`)
  }

  return parts.join(" · ")
}

function deriveDurationMs(state?: NodeState) {
  if (
    typeof state?.completedAt === "number" &&
    typeof state.startedAt === "number"
  ) {
    return Math.max(state.completedAt - state.startedAt, 0)
  }
  if (
    (state?.status === "running" ||
      state?.status === "waiting_approval" ||
      state?.status === "waiting_human") &&
    typeof state.startedAt === "number"
  ) {
    return Math.max(Date.now() - state.startedAt, 0)
  }
  if (
    typeof state?.metrics?.latency_ms === "number" &&
    state.metrics.latency_ms > 0
  ) {
    return state.metrics.latency_ms
  }
  return null
}

function buildMetricChips({
  node,
  state,
  runtimeBranchSummary,
}: {
  node: WorkflowNode
  state?: NodeState
  runtimeBranchSummary: RuntimeBranchSummary | null
}) {
  const chips: string[] = []
  const score =
    typeof state?.output?.metadata?.score === "number"
      ? state.output.metadata.score
      : null

  if (node.type === "evaluator" && score != null) {
    chips.push(`Score ${score}/10`)
  }

  const totalTokens =
    (state?.metrics?.tokens_in || 0) + (state?.metrics?.tokens_out || 0)
  if (totalTokens > 0) {
    chips.push(`${formatTokenCount(totalTokens)} tok`)
  }

  if (
    typeof state?.metrics?.cost_usd === "number" &&
    state.metrics.cost_usd > 0
  ) {
    chips.push(
      state.metrics.cost_usd < 0.01
        ? "<$0.01"
        : `$${state.metrics.cost_usd.toFixed(2)}`,
    )
  }

  const durationLabel = formatDurationMs(deriveDurationMs(state))
  if (durationLabel) {
    chips.push(durationLabel)
  }

  if (runtimeBranchSummary) {
    chips.push(formatBranchSummary(runtimeBranchSummary))
  }

  if ((state?.retriesUsed || 0) > 0) {
    chips.push(`Retry x${state?.retriesUsed}`)
  }

  return chips.slice(0, 5)
}

function buildRuntimeSummary({
  node,
  status,
  runtimeFocusKind,
  runtimeBranchSummary,
  state,
  retryLabel,
}: {
  node: WorkflowNode
  status: NodeStatus
  runtimeFocusKind: "current" | "next" | null
  runtimeBranchSummary: RuntimeBranchSummary | null
  state?: NodeState
  retryLabel: string | null
}) {
  const errorSnippet = compactRuntimeText(state?.error, 120)
  const outputSnippet = compactRuntimeText(state?.output?.content, 120)
  const latestLogSnippet = getLatestLogSnippet(state)

  if (node.type === "input") {
    if (status === "completed")
      return {
        summary: "Input ready",
        detail: outputSnippet || latestLogSnippet,
      }
    if (status === "running")
      return { summary: "Preparing input", detail: latestLogSnippet }
    if (status === "failed")
      return {
        summary: "Input issue",
        detail: errorSnippet || latestLogSnippet,
      }
    return {
      summary:
        runtimeFocusKind === "next" ? "Next: input" : "Waiting for input",
      detail: null,
    }
  }

  if (node.type === "skill") {
    const config = node.config as SkillNodeConfig
    const promptSnippet = compactRuntimeText(config.prompt, 110)
    if (status === "running")
      return {
        summary: runtimeBranchSummary ? "Branch work active" : "Agent running",
        detail: latestLogSnippet || outputSnippet || promptSnippet,
      }
    if (status === "completed")
      return {
        summary: runtimeBranchSummary ? "Branches complete" : "Step complete",
        detail: outputSnippet || latestLogSnippet,
      }
    if (status === "failed")
      return {
        summary: runtimeBranchSummary ? "Branch issue" : "Step issue",
        detail: errorSnippet || latestLogSnippet || promptSnippet,
      }
    return {
      summary:
        runtimeFocusKind === "next"
          ? "Next step"
          : runtimeBranchSummary
            ? "Ready to fan out"
            : "Ready to run",
      detail: promptSnippet,
    }
  }

  if (node.type === "evaluator") {
    const config = node.config as EvaluatorNodeConfig
    const score =
      typeof state?.output?.metadata?.score === "number"
        ? state.output.metadata.score
        : null
    if (status === "running") {
      return {
        summary: "Quality check running",
        detail:
          latestLogSnippet ||
          `Threshold ${config.threshold}/10${retryLabel ? ` · Retry from ${retryLabel}` : ""}`,
      }
    }
    if (status === "completed") {
      return {
        summary: score != null ? `Score ${score}/10` : "Quality check complete",
        detail:
          compactRuntimeText(state?.output?.metadata?.reason, 120) ||
          outputSnippet ||
          latestLogSnippet,
      }
    }
    if (status === "failed") {
      return {
        summary: "Quality check issue",
        detail: errorSnippet || latestLogSnippet,
      }
    }
    return {
      summary:
        runtimeFocusKind === "next"
          ? "Next quality check"
          : "Quality check queued",
      detail: `Threshold ${config.threshold}/10${retryLabel ? ` · Retry from ${retryLabel}` : ""}`,
    }
  }

  if (node.type === "splitter") {
    if (status === "running")
      return {
        summary: "Creating branches",
        detail: latestLogSnippet || outputSnippet,
      }
    if (status === "completed") {
      return {
        summary: runtimeBranchSummary
          ? `${runtimeBranchSummary.total} branches ready`
          : "Branches ready",
        detail: latestLogSnippet || outputSnippet,
      }
    }
    if (status === "failed")
      return {
        summary: "Fan-out issue",
        detail: errorSnippet || latestLogSnippet,
      }
    return {
      summary: runtimeFocusKind === "next" ? "Next fan-out" : "Ready to branch",
      detail: null,
    }
  }

  if (node.type === "merger") {
    const config = node.config as MergerNodeConfig
    if (status === "running")
      return {
        summary: "Merging branches",
        detail: latestLogSnippet || outputSnippet,
      }
    if (status === "completed")
      return {
        summary: "Merge complete",
        detail: outputSnippet || latestLogSnippet,
      }
    if (status === "failed")
      return {
        summary: "Merge issue",
        detail: errorSnippet || latestLogSnippet,
      }
    return {
      summary: runtimeFocusKind === "next" ? "Next merge" : "Waiting to merge",
      detail: `Strategy ${config.strategy}`,
    }
  }

  if (node.type === "approval") {
    const config = node.config as ApprovalNodeConfig
    const messageSnippet = compactRuntimeText(config.message, 110)
    if (status === "waiting_approval")
      return { summary: "Awaiting approval", detail: messageSnippet }
    if (status === "completed")
      return { summary: "Approved", detail: messageSnippet || outputSnippet }
    if (status === "failed") {
      return {
        summary: errorSnippet?.toLowerCase().includes("reject")
          ? "Rejected"
          : "Approval issue",
        detail: errorSnippet || messageSnippet,
      }
    }
    return {
      summary:
        runtimeFocusKind === "next" ? "Next approval" : "Approval queued",
      detail: messageSnippet,
    }
  }

  if (node.type === "human") {
    const config = node.config as HumanNodeConfig
    const requestSnippet = compactRuntimeText(
      config.staticRequest?.instructions || config.staticRequest?.title,
      110,
    )
    if (status === "waiting_human") {
      return {
        summary:
          config.mode === "approval"
            ? "Awaiting human approval"
            : "Awaiting human input",
        detail: requestSnippet,
      }
    }
    if (status === "completed") {
      return {
        summary: config.mode === "approval" ? "Approved" : "Input received",
        detail: outputSnippet || latestLogSnippet || requestSnippet,
      }
    }
    if (status === "failed") {
      return {
        summary: errorSnippet?.toLowerCase().includes("reject")
          ? "Rejected"
          : "Human input issue",
        detail: errorSnippet || requestSnippet,
      }
    }
    return {
      summary:
        runtimeFocusKind === "next" ? "Next human check" : "Human check queued",
      detail: requestSnippet,
    }
  }

  const outputConfig = node.config as OutputNodeConfig
  if (status === "running")
    return {
      summary: "Preparing result",
      detail: latestLogSnippet || outputSnippet,
    }
  if (status === "completed")
    return {
      summary: "Result ready",
      detail: outputSnippet || latestLogSnippet,
    }
  if (status === "failed")
    return { summary: "Result issue", detail: errorSnippet || latestLogSnippet }
  return {
    summary:
      runtimeFocusKind === "next" ? "Next result step" : "Final result pending",
    detail: `Format ${outputConfig.format || "markdown"}`,
  }
}

export function buildRuntimeCardCopy({
  node,
  state,
  retryLabel,
  runtimeFocusKind,
  runtimeBranchSummary,
}: {
  node: WorkflowNode
  state?: NodeState
  retryLabel: string | null
  runtimeFocusKind: "current" | "next" | null
  runtimeBranchSummary: RuntimeBranchSummary | null
}): RuntimeCardCopy {
  const status = state?.status ?? "pending"
  const base = buildRuntimeSummary({
    node,
    status,
    runtimeFocusKind,
    runtimeBranchSummary,
    state,
    retryLabel,
  })

  return {
    summary: base.summary,
    detail: base.detail,
    metricChips: buildMetricChips({ node, state, runtimeBranchSummary }),
  }
}

export function getPreviewStatusLabel(status: NodeStatus) {
  if (status === "running") return "Active"
  if (status === "waiting_approval") return "Approval"
  if (status === "waiting_human") return "Input"
  if (status === "failed") return "Issue"
  if (status === "completed") return "Done"
  return "Queued"
}

export function getRuntimeStatusLabel(status: NodeStatus | undefined) {
  if (status === "running") return "Running"
  if (status === "waiting_approval") return "Awaiting approval"
  if (status === "waiting_human") return "Awaiting input"
  if (status === "failed") return "Needs attention"
  if (status === "completed") return "Completed"
  if (status === "skipped") return "Skipped"
  if (status === "queued") return "Queued"
  return "Pending"
}

export function getRuntimeStatusBadgeVariant(
  status: NodeStatus | undefined,
): "info" | "warning" | "destructive" | "success" | "secondary" {
  if (status === "running") return "info"
  if (status === "waiting_approval" || status === "waiting_human")
    return "warning"
  if (status === "failed") return "destructive"
  if (status === "completed") return "success"
  return "secondary"
}

export function getRuntimeStatusDotStyle(status: NodeStatus | undefined): {
  core: string
  ring?: string
} {
  if (status === "running") {
    return {
      core: "bg-status-info",
      ring: "bg-status-info/35",
    }
  }
  if (status === "waiting_approval" || status === "waiting_human") {
    return {
      core: "bg-status-warning",
      ring: "bg-status-warning/35",
    }
  }
  if (status === "failed") {
    return {
      core: "bg-status-danger",
    }
  }
  if (status === "completed") {
    return {
      core: "bg-status-success",
    }
  }
  if (status === "queued") {
    return {
      core: "bg-primary/70",
    }
  }
  return {
    core: "bg-muted-foreground/55",
  }
}

export function getRuntimeProgress(status: NodeStatus | undefined) {
  if (status === "running") {
    return {
      value: 62,
      label: "In flight",
      barClass: "bg-status-info",
      animate: true,
    }
  }
  if (status === "waiting_approval" || status === "waiting_human") {
    return {
      value: 84,
      label: "Blocked",
      barClass: "bg-status-warning",
      animate: false,
    }
  }
  if (status === "failed") {
    return {
      value: 100,
      label: "Stopped",
      barClass: "bg-status-danger",
      animate: false,
    }
  }
  if (status === "completed") {
    return {
      value: 100,
      label: "Done",
      barClass: "bg-status-success",
      animate: false,
    }
  }
  if (status === "skipped") {
    return {
      value: 100,
      label: "Skipped",
      barClass: "bg-status-warning",
      animate: false,
    }
  }
  if (status === "queued") {
    return {
      value: 26,
      label: "Queued",
      barClass: "bg-primary/70",
      animate: false,
    }
  }
  return {
    value: 10,
    label: "Pending",
    barClass: "bg-muted-foreground/50",
    animate: false,
  }
}
