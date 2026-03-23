import { useState, useEffect } from "react"
import ReactMarkdown from "react-markdown"
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

function deriveLogSummary(log: import("@shared/types").LogEntry[] | undefined) {
  if (!log || log.length === 0) return null
  const counts: Record<string, number> = {}
  let lastAction = ""
  for (const entry of log) {
    if (entry.type === "tool_use") {
      const tool = entry.tool.split("__").pop() || entry.tool
      counts[tool] = (counts[tool] || 0) + 1
      lastAction = `${tool}...`
    } else if (entry.type === "thinking") {
      counts["thinking"] = (counts["thinking"] || 0) + 1
      lastAction = "Thinking..."
    } else if (entry.type === "text") {
      counts["text"] = (counts["text"] || 0) + 1
    } else if (entry.type === "error") {
      counts["errors"] = (counts["errors"] || 0) + 1
    } else if (entry.type === "diff") {
      counts["edits"] = (counts["edits"] || 0) + 1
    }
  }
  const parts: string[] = []
  if (counts["Read"]) parts.push(`${counts["Read"]} files read`)
  if (counts["Write"]) parts.push(`${counts["Write"]} files written`)
  if (counts["Edit"]) parts.push(`${counts["Edit"]} edits`)
  if (counts["edits"]) parts.push(`${counts["edits"]} diffs`)
  if (counts["Bash"]) parts.push(`${counts["Bash"]} commands`)
  const searchKeys = Object.keys(counts).filter(
    (k) =>
      k.includes("search") ||
      k.includes("Search") ||
      k === "web_search_exa" ||
      k === "web_search_serper",
  )
  const searchCount = searchKeys.reduce((s, k) => s + counts[k], 0)
  if (searchCount) parts.push(`${searchCount} searches`)
  if (counts["thinking"]) parts.push(`${counts["thinking"]} thinking blocks`)
  // Catch remaining tools not yet listed
  const knownKeys = new Set([
    "Read",
    "Write",
    "Edit",
    "Bash",
    "thinking",
    "text",
    "errors",
    "edits",
    ...searchKeys,
  ])
  for (const [tool, count] of Object.entries(counts)) {
    if (!knownKeys.has(tool) && tool !== "text" && tool !== "errors") {
      parts.push(`${count} ${tool}`)
    }
  }
  return { lastAction, stats: parts.join(" · "), totalEntries: log.length }
}

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
  const [showFullLog, setShowFullLog] = useState(false)
  const logSummary = deriveLogSummary(nodeState?.log)
  const hasResult = status === "done" && Boolean(nodeState?.output?.content)

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
    return (
      <div className="space-y-2 px-3 py-3">
        <div className="text-body-sm text-status-danger">
          {nodeState?.error || "Step failed"}
        </div>
        {logSummary && (
          <>
            <div className="ui-meta-text tabular-nums text-muted-foreground min-h-[1rem]">
              {logSummary.stats}
            </div>
            <button
              type="button"
              className="ui-meta-text text-muted-foreground hover:text-foreground"
              onClick={() => setShowFullLog(!showFullLog)}
            >
              {showFullLog
                ? "Hide log"
                : `Show full log (${logSummary.totalEntries} entries)`}
            </button>
          </>
        )}
        {showFullLog && (
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

  // Running or done — compact summary + optional full log
  return (
    <div className="space-y-2 px-3 py-3">
      {/* Live activity line for running */}
      {status === "running" && logSummary?.lastAction && (
        <div className="flex items-center gap-2 text-body-sm text-muted-foreground min-h-[1.25rem]">
          <Loader2 size={12} className="animate-spin shrink-0" />
          <span className="truncate tabular-nums">{logSummary.lastAction}</span>
        </div>
      )}

      {/* Compact stats */}
      {logSummary && (
        <div className="ui-meta-text text-muted-foreground">
          {logSummary.stats}
        </div>
      )}

      {/* Result for done steps */}
      {hasResult && <StepResultContent nodeState={nodeState} />}

      {/* Full log toggle */}
      {logSummary && (
        <button
          type="button"
          className="ui-meta-text text-muted-foreground hover:text-foreground"
          onClick={() => setShowFullLog(!showFullLog)}
        >
          {showFullLog
            ? "Hide full log"
            : `Show full log (${logSummary.totalEntries} entries)`}
        </button>
      )}

      {showFullLog && (
        <div className="max-h-[min(24rem,50vh)] overflow-y-auto ui-scroll-region border-t border-hairline pt-2">
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

      {/* No content at all */}
      {!logSummary && !hasResult && status !== "running" && (
        <div className="text-body-sm text-muted-foreground">No output yet</div>
      )}
    </div>
  )
}

function StepResultContent({
  nodeState,
}: {
  nodeState: NodeState | undefined
}) {
  const [showFull, setShowFull] = useState(false)
  const result = nodeState?.output?.content
  const duration = deriveDuration(nodeState)
  const cost = deriveCost(nodeState)
  const metaParts: string[] = []
  if (duration) metaParts.push(duration)
  if (cost) metaParts.push(cost)

  // Strip to first 8 lines for preview
  const lines = result?.split("\n").filter(Boolean) || []
  const isLong = lines.length > 8
  const preview = isLong ? lines.slice(0, 8).join("\n") : result

  return (
    <div className="space-y-2">
      {result ? (
        <>
          <div className="prose-c8c text-body-sm">
            <ReactMarkdown>{showFull ? result : preview || ""}</ReactMarkdown>
          </div>
          {isLong && (
            <button
              type="button"
              className="ui-meta-text text-muted-foreground hover:text-foreground"
              onClick={() => setShowFull(!showFull)}
            >
              {showFull
                ? "Collapse"
                : `Show full result (${lines.length} lines)`}
            </button>
          )}
        </>
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
