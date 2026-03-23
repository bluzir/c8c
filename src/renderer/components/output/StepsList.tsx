import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { StepRow } from "./StepRow"
import { formatDuration, formatCost } from "./outputFormatters"
import { getRuntimeNodeLabel } from "@/lib/runtime-flow-labels"
import type {
  WorkflowNode,
  NodeState,
  WorkflowRuntimeMeta,
  EvaluationResult,
} from "@shared/types"

type StepStatus = "pending" | "running" | "done" | "failed" | "blocked"

interface StepsListProps {
  nodes: WorkflowNode[]
  nodeStates: Record<string, NodeState>
  evalResults?: Record<string, EvaluationResult[]>
  activeNodeId?: string | null
  runtimeMeta?: WorkflowRuntimeMeta
  onRerunFrom?: (nodeId: string) => void
}

function deriveStepStatus(nodeState: NodeState | undefined): StepStatus {
  if (!nodeState) return "pending"
  const { status } = nodeState
  if (status === "running" || status === "queued") return "running"
  if (status === "completed" || status === "skipped") return "done"
  if (status === "failed") return "failed"
  if (status === "waiting_approval" || status === "waiting_human")
    return "blocked"
  return "pending"
}

function deriveDuration(nodeState: NodeState | undefined): string | undefined {
  const ms = nodeState?.metrics?.latency_ms
  if (ms != null && ms > 0) return formatDuration(ms)
  if (nodeState?.startedAt && nodeState?.completedAt) {
    return formatDuration(nodeState.completedAt - nodeState.startedAt)
  }
  return undefined
}

function deriveCost(nodeState: NodeState | undefined): string | undefined {
  const cost = nodeState?.metrics?.cost_usd
  if (cost != null && cost > 0) return formatCost(cost)
  return undefined
}

function deriveFanOutProgress(
  node: WorkflowNode,
  nodeStates: Record<string, NodeState>,
  runtimeMeta?: WorkflowRuntimeMeta,
): string | undefined {
  if (node.type !== "splitter" || !runtimeMeta) return undefined

  const branchIds = Object.keys(runtimeMeta).filter(
    (id) =>
      runtimeMeta[id].splitterId === node.id ||
      runtimeMeta[id].templateId === node.id,
  )
  if (branchIds.length === 0) return undefined

  const done = branchIds.filter((id) => {
    const status = nodeStates[id]?.status
    return status === "completed" || status === "skipped"
  }).length

  return `${done} / ${branchIds.length}`
}

export function StepsList({
  nodes,
  nodeStates,
  evalResults,
  activeNodeId,
  runtimeMeta,
  onRerunFrom,
}: StepsListProps) {
  const [expandedStepId, setExpandedStepId] = useState<string | null>(
    activeNodeId ?? null,
  )

  // Auto-expand the active (running) node when it changes
  useEffect(() => {
    if (activeNodeId) {
      setExpandedStepId(activeNodeId)
    }
  }, [activeNodeId])

  function handleToggle(nodeId: string) {
    setExpandedStepId((prev) => (prev === nodeId ? null : nodeId))
  }

  return (
    <div data-testid="steps-list">
      {nodes.map((node) => {
        const nodeState = nodeStates[node.id]
        const status = deriveStepStatus(nodeState)
        const duration = deriveDuration(nodeState)
        const cost = deriveCost(nodeState)
        const fanOutProgress = deriveFanOutProgress(
          node,
          nodeStates,
          runtimeMeta,
        )
        const expanded = expandedStepId === node.id
        const label = getRuntimeNodeLabel(node, { fallbackId: node.id })

        return (
          <StepRow
            key={node.id}
            name={label}
            status={status}
            nodeType={node.type === "human" ? "approval" : node.type}
            duration={duration}
            cost={cost}
            expanded={expanded}
            onToggle={() => handleToggle(node.id)}
            fanOutProgress={fanOutProgress}
          >
            <StepExpandedContent
              nodeId={node.id}
              status={status}
              nodeState={nodeState}
            />
          </StepRow>
        )
      })}
    </div>
  )
}

function StepExpandedContent({
  nodeId,
  status,
  nodeState,
}: {
  nodeId: string
  status: StepStatus
  nodeState: NodeState | undefined
}) {
  if (status === "running") {
    return (
      <div
        className="flex items-center gap-2 px-3 py-3 text-body-sm text-muted-foreground"
        data-testid="step-log-placeholder"
      >
        <Loader2 size={14} className="animate-spin" />
        <span>Running...</span>
      </div>
    )
  }

  if (status === "failed") {
    return (
      <div className="px-3 py-3">
        <div className="text-body-sm text-status-danger">
          {nodeState?.error || "Step failed"}
        </div>
      </div>
    )
  }

  if (status === "blocked") {
    return (
      <div className="px-3 py-3">
        <div className="text-body-sm text-status-warning">
          Waiting for approval
        </div>
      </div>
    )
  }

  if (status === "done") {
    const result = nodeState?.output?.content
    const duration = deriveDuration(nodeState)
    const cost = deriveCost(nodeState)
    const metaParts: string[] = []
    if (duration) metaParts.push(duration)
    if (cost) metaParts.push(cost)

    return (
      <div className="px-3 py-3 space-y-2">
        {result ? (
          <div className="prose-c8c text-body-sm">{result}</div>
        ) : (
          <div className="text-body-sm text-muted-foreground">
            Step completed
          </div>
        )}
        {metaParts.length > 0 && (
          <div className="ui-meta-text text-muted-foreground">
            {metaParts.join(" · ")}
          </div>
        )}
      </div>
    )
  }

  return null
}
