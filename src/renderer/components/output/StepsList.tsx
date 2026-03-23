import { useState, useEffect } from "react"
import { cn } from "@/lib/cn"
import { Loader2 } from "lucide-react"
import { StepRow } from "./StepRow"
import { LogTab } from "./OutputSections"
import { formatDuration, formatCost } from "./outputFormatters"
import { getRuntimeNodeLabel } from "@/lib/runtime-flow-labels"
import type {
  Workflow,
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
  workflow?: Workflow
  runId?: string | null
  evalOverrideNodeIds?: Set<string>
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
  workflow,
  runId,
  evalOverrideNodeIds,
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
        const fanOutProgress =
          "config" in node && node.config
            ? deriveFanOutProgress(
                node as WorkflowNode,
                nodeStates,
                runtimeMeta,
              )
            : undefined
        const expanded = expandedStepId === node.id
        const label =
          "config" in node && node.config
            ? getRuntimeNodeLabel(node as WorkflowNode, { fallbackId: node.id })
            : (node as { label?: string }).label || node.id

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
              nodeStates={nodeStates}
              evalResults={evalResults}
              workflowNode={
                "config" in node && node.config
                  ? (node as WorkflowNode)
                  : undefined
              }
              runId={runId}
              evalOverrideNodeIds={evalOverrideNodeIds}
            />
          </StepRow>
        )
      })}
    </div>
  )
}

type StepDetailView = "result" | "log"

function StepExpandedContent({
  nodeId,
  status,
  nodeState,
  nodeStates,
  evalResults,
  workflowNode,
  runId,
  evalOverrideNodeIds,
}: {
  nodeId: string
  status: StepStatus
  nodeState: NodeState | undefined
  nodeStates: Record<string, NodeState>
  evalResults?: Record<string, EvaluationResult[]>
  workflowNode?: WorkflowNode
  runId?: string | null
  evalOverrideNodeIds?: Set<string>
}) {
  const [detailView, setDetailView] = useState<StepDetailView>(
    status === "running" ? "log" : "result",
  )

  if (status === "blocked") {
    return (
      <div className="px-3 py-3">
        <div className="text-body-sm text-status-warning">
          Waiting for approval
        </div>
      </div>
    )
  }

  if (status === "failed") {
    const hasLog = Boolean(nodeState?.log?.length)
    return (
      <div className="space-y-2 px-3 py-3">
        <div className="text-body-sm text-status-danger">
          {nodeState?.error || "Step failed"}
        </div>
        {hasLog && (
          <button
            type="button"
            className="ui-meta-text text-muted-foreground hover:text-foreground"
            onClick={() =>
              setDetailView(detailView === "log" ? "result" : "log")
            }
          >
            {detailView === "log" ? "Hide log" : "View step log"}
          </button>
        )}
        {detailView === "log" && hasLog && (
          <div className="max-h-[min(20rem,40vh)] overflow-y-auto ui-scroll-region">
            <LogTab
              selectedNodeId={nodeId}
              nodeStates={nodeStates}
              evalResults={evalResults || {}}
              workflowNode={workflowNode || null}
              runId={runId || null}
              evalOverrideNodeIds={evalOverrideNodeIds || new Set()}
            />
          </div>
        )}
      </div>
    )
  }

  // Running or done — show toggle between Result and Log
  const hasResult = status === "done" && Boolean(nodeState?.output?.content)
  const hasLog = Boolean(nodeState?.log?.length) || status === "running"
  const showToggle = hasResult && hasLog

  return (
    <div className="space-y-2">
      {showToggle && (
        <div className="flex gap-1 px-3 pt-2">
          <button
            type="button"
            className={cn(
              "rounded-full px-3 py-0.5 text-body-sm font-medium transition-colors",
              detailView === "result"
                ? "bg-surface-1 border border-hairline text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setDetailView("result")}
          >
            Result
          </button>
          <button
            type="button"
            className={cn(
              "rounded-full px-3 py-0.5 text-body-sm font-medium transition-colors",
              detailView === "log"
                ? "bg-surface-1 border border-hairline text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setDetailView("log")}
          >
            Log
          </button>
        </div>
      )}

      {detailView === "result" && hasResult ? (
        <StepResultContent nodeState={nodeState} />
      ) : hasLog || status === "running" ? (
        <div className="max-h-[min(24rem,50vh)] overflow-y-auto ui-scroll-region">
          <LogTab
            selectedNodeId={nodeId}
            nodeStates={nodeStates}
            evalResults={evalResults || {}}
            workflowNode={workflowNode || null}
            runId={runId || null}
            evalOverrideNodeIds={evalOverrideNodeIds || new Set()}
          />
        </div>
      ) : (
        <div className="px-3 py-3 text-body-sm text-muted-foreground">
          No output yet
        </div>
      )}
    </div>
  )
}

function StepResultContent({
  nodeState,
}: {
  nodeState: NodeState | undefined
}) {
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
        <div className="text-body-sm text-muted-foreground">Step completed</div>
      )}
      {metaParts.length > 0 && (
        <div className="ui-meta-text text-muted-foreground">
          {metaParts.join(" · ")}
        </div>
      )}
    </div>
  )
}
