import { useEffect, useMemo, useRef, useState } from "react"
import type { EvalCriterion, EvaluationResult } from "@/lib/store"
import type { LogEntry, NodeState, WorkflowNode } from "@shared/types"
import { cn } from "@/lib/cn"
import { mergeLogEntriesForDisplay } from "@/lib/log-display"
import {
  Check,
  Loader2,
  AlertCircle,
  Clock,
  Search,
  X,
  ShieldCheck,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { CursorMenu } from "@/components/ui/cursor-menu"
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { DebugDetailsPanel } from "@/components/output/DebugDetailsPanel"
import { LogEntryCard } from "@/components/output/LogEntryCard"
import { formatCost, formatTokens } from "@/components/output/outputFormatters"

const PREVIEW_MAX_W = "max-w-52" as const

const STATUS_ICONS: Record<string, typeof Clock> = {
  pending: Clock,
  queued: Clock,
  running: Loader2,
  completed: Check,
  failed: AlertCircle,
  skipped: Clock,
  waiting_approval: Clock,
  waiting_human: Clock,
}

const ERROR_KIND_LABELS: Record<string, string> = {
  tool: "Tool error",
  model: "Model error",
  timeout: "Timeout",
  policy: "Flow rules",
  unknown: "Error",
}

const STATUS_LABELS: Record<string, string> = {
  queued: "waiting",
  waiting_approval: "waiting for approval",
  waiting_human: "waiting for input",
}

const LOG_ENTRY_TYPES = [
  "thinking",
  "text",
  "tool_use",
  "tool_result",
  "error",
  "diff",
] as const
type LogEntryType = (typeof LOG_ENTRY_TYPES)[number]

const LOG_TYPE_LABELS: Record<LogEntryType, string> = {
  thinking: "Thoughts",
  text: "Text",
  tool_use: "Tools",
  tool_result: "Results",
  error: "Errors",
  diff: "Diffs",
}

function getEntrySearchText(entry: LogEntry): string {
  switch (entry.type) {
    case "thinking":
    case "text":
    case "error":
      return entry.content
    case "tool_use":
      return `${entry.tool} ${JSON.stringify(entry.input)}`
    case "tool_result":
      return `${entry.tool} ${entry.output}`
    case "diff":
      return `${entry.files.join(" ")} ${entry.content}`
  }
}

function getLogEntryKey(
  selectedNodeId: string,
  entry: LogEntry,
  index: number,
): string {
  switch (entry.type) {
    case "thinking":
    case "text":
    case "error":
      return `${selectedNodeId}-${entry.type}-${entry.timestamp}-${index}`
    case "tool_use":
      return `${selectedNodeId}-${entry.type}-${entry.timestamp}-${entry.tool}-${index}`
    case "tool_result":
      return `${selectedNodeId}-${entry.type}-${entry.timestamp}-${entry.tool}-${entry.status}-${index}`
    case "diff":
      return `${selectedNodeId}-${entry.type}-${entry.timestamp}-${entry.files.join(",")}-${index}`
  }
}

export function NodesTab({
  nodes,
  nodeStates,
  activeNodeId,
  evalResults,
  canRerun,
  onSelectNode,
  onRerunFrom,
  surface = "card",
}: {
  nodes: { id: string; label: string; type: string; indent?: boolean }[]
  nodeStates: Record<string, NodeState>
  activeNodeId: string | null
  evalResults: Record<string, EvaluationResult[]>
  canRerun: boolean
  onSelectNode: (nodeId: string) => void
  onRerunFrom?: (nodeId: string) => void
  surface?: "card" | "flat"
}) {
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    nodeId: string
  } | null>(null)

  return (
    <>
      <div
        className={cn(
          surface === "card"
            ? "rounded-lg ui-slab overflow-hidden"
            : "overflow-hidden",
        )}
      >
        {nodes.length === 0 && (
          <div className="px-3 py-4 text-body-md text-muted-foreground text-center">
            No skill steps in this flow
          </div>
        )}
        {nodes.map((node) => {
          const state = nodeStates[node.id]
          const status = state?.status || "pending"
          const Icon = STATUS_ICONS[status] || Clock
          const statusLabel = STATUS_LABELS[status] || status
          const isActive = node.id === activeNodeId
          const splitterTotalSubtasks =
            state?.output?.metadata?.splitter_total_subtasks
          const splitterUsedSubtasks =
            state?.output?.metadata?.splitter_used_subtasks
          const splitterTruncated = Boolean(
            state?.output?.metadata?.splitter_truncated,
          )
          const canRerunNode =
            canRerun &&
            (status === "completed" || status === "failed") &&
            Boolean(onRerunFrom)

          let durationMs: number | undefined
          if (state?.startedAt && state?.completedAt) {
            durationMs = state.completedAt - state.startedAt
          }

          const metaBits: string[] = []
          if (
            state?.metrics &&
            (state.metrics.tokens_in > 0 || state.metrics.tokens_out > 0)
          ) {
            metaBits.push(
              `${formatTokens(state.metrics.tokens_in + state.metrics.tokens_out)}t`,
            )
          }
          if (state?.metrics && state.metrics.cost_usd > 0) {
            metaBits.push(formatCost(state.metrics.cost_usd))
          }
          if (durationMs != null) {
            metaBits.push(`${(durationMs / 1000).toFixed(1)}s`)
          }
          if (splitterTruncated) {
            metaBits.push(
              `truncated ${splitterUsedSubtasks || "?"}/${splitterTotalSubtasks || "?"}`,
            )
          }
          if ((state?.retriesUsed || 0) > 0) {
            metaBits.push(`retry x${state?.retriesUsed}`)
          }
          if (state?.policyApplied) {
            metaBits.push(state.policyApplied)
          }
          if (evalResults[node.id]?.length > 0) {
            const latestEval =
              evalResults[node.id][evalResults[node.id].length - 1]
            metaBits.push(`eval ${latestEval.score}/10`)
          }

          const metaSummary = metaBits.join(" · ")

          return (
            <div
              key={node.id}
              className="border-b border-hairline last:border-b-0"
            >
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-3/80 ui-pressable focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                  isActive && "bg-surface-3/80",
                  node.indent && "pl-7",
                )}
                onClick={() => onSelectNode(node.id)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setContextMenu({
                    x: event.clientX,
                    y: event.clientY,
                    nodeId: node.id,
                  })
                }}
                aria-label={`Select node ${node.label}`}
              >
                <Icon
                  size={14}
                  className={cn(
                    status === "completed" && "text-status-success",
                    status === "failed" && "text-status-danger",
                    status === "running" && "text-status-info animate-spin",
                    (status === "pending" ||
                      status === "queued" ||
                      status === "skipped") &&
                      "text-muted-foreground",
                  )}
                />
                <span className="sr-only">Status: {statusLabel}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body-md font-medium">
                    {node.label}
                  </div>
                  {state?.error ? (
                    <div
                      className={cn(
                        "ui-meta-text text-status-danger truncate",
                        PREVIEW_MAX_W,
                      )}
                      title={state.error}
                    >
                      {state?.errorKind
                        ? `[${ERROR_KIND_LABELS[state.errorKind] || state.errorKind}] `
                        : ""}
                      {state.error.slice(0, 80)}
                      {state.error.length > 80 ? "..." : ""}
                    </div>
                  ) : metaSummary ? (
                    <div
                      className="ui-meta-text truncate text-muted-foreground"
                      title={metaSummary}
                    >
                      {metaSummary}
                    </div>
                  ) : null}
                </div>
                <span
                  className={cn(
                    "ui-meta-text ui-status-badge",
                    status === "completed" && "ui-status-badge-success",
                    status === "failed" && "ui-status-badge-danger",
                    status !== "completed" &&
                      status !== "failed" &&
                      "border-hairline bg-surface-2 text-muted-foreground",
                  )}
                >
                  {statusLabel}
                </span>
                {canRerunNode && (
                  <span className="sr-only">Right-click for rerun actions</span>
                )}
              </button>
            </div>
          )
        })}
      </div>

      <CursorMenu
        open={contextMenu !== null}
        x={contextMenu?.x || 0}
        y={contextMenu?.y || 0}
        onOpenChange={(open) => {
          if (!open) setContextMenu(null)
        }}
      >
        {contextMenu && (
          <>
            <DropdownMenuLabel>
              {nodes.find((node) => node.id === contextMenu.nodeId)?.label ||
                "Step"}
            </DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => {
                onSelectNode(contextMenu.nodeId)
                setContextMenu(null)
              }}
            >
              View step details
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={
                !canRerun ||
                !onRerunFrom ||
                !["completed", "failed"].includes(
                  nodeStates[contextMenu.nodeId]?.status || "pending",
                )
              }
              onSelect={() => {
                if (!onRerunFrom) return
                onRerunFrom(contextMenu.nodeId)
                setContextMenu(null)
              }}
            >
              Rerun from this step
            </DropdownMenuItem>
          </>
        )}
      </CursorMenu>
    </>
  )
}

function EvalResultsSection({
  selectedNodeId,
  evalResults,
  runId,
  isWaitingForOverride,
}: {
  selectedNodeId: string
  evalResults: Record<string, EvaluationResult[]>
  runId?: string | null
  isWaitingForOverride: boolean
}) {
  const [overriding, setOverriding] = useState(false)
  const [overridden, setOverridden] = useState(false)

  const handleOverride = async () => {
    if (!runId || overriding) return
    setOverriding(true)
    try {
      await window.api.overrideEvaluator(runId, selectedNodeId)
      setOverridden(true)
    } finally {
      setOverriding(false)
    }
  }

  return (
    <div className="border-t border-hairline pt-2 mt-2 space-y-2">
      <span className="ui-meta-label text-muted-foreground">Evaluations</span>
      {evalResults[selectedNodeId].map((er) => (
        <div key={er.attempt} className="space-y-1.5">
          <div
            className={cn(
              "border-l-2 pl-3 py-0.5 ui-meta-text font-mono",
              er.passed
                ? "border-status-success/40 text-status-success"
                : "border-status-warning/40 text-status-warning",
            )}
          >
            Attempt {er.attempt}: {er.score}/10 {er.passed ? "PASS" : "FAIL"} —{" "}
            {er.reason}
          </div>
          {er.criteria && er.criteria.length > 0 && (
            <div className="pl-3 space-y-1">
              {er.criteria.map((c: EvalCriterion) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 ui-meta-text"
                >
                  <span className="w-20 truncate text-muted-foreground">
                    {c.id}
                  </span>
                  <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full w-full origin-left rounded-full transition-transform ui-motion-standard",
                        c.score >= 7
                          ? "bg-status-success"
                          : c.score >= 4
                            ? "bg-status-warning"
                            : "bg-status-danger",
                      )}
                      style={{ transform: `scaleX(${c.score / 10})` }}
                    />
                  </div>
                  <span className="w-8 text-right font-mono text-muted-foreground">
                    {c.score}/10
                  </span>
                </div>
              ))}
            </div>
          )}
          {er.fix_instructions && (
            <div className="pl-3 ui-meta-text">
              <span className="font-medium text-foreground-subtle">Fix: </span>
              <span className="text-muted-foreground">
                {er.fix_instructions}
              </span>
            </div>
          )}
        </div>
      ))}
      {isWaitingForOverride && !overridden && (
        <div className="border-l-2 border-status-warning/35 pl-3 py-0.5 space-y-2">
          <div className="ui-meta-text text-status-warning">
            Check failed after all retries. The flow is paused waiting for your
            decision.
          </div>
          <button
            type="button"
            disabled={overriding}
            onClick={handleOverride}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border border-status-warning/35 bg-transparent px-3 py-1.5",
              "text-body-sm font-medium text-status-warning",
              "hover:bg-status-warning/10 ui-pressable",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <ShieldCheck size={14} />
            {overriding ? "Overriding..." : "Override — accept result anyway"}
          </button>
        </div>
      )}
      {overridden && (
        <div className="border-l-2 border-status-warning/35 pl-3 py-0.5 ui-meta-text text-status-warning flex items-center gap-1.5">
          <ShieldCheck size={14} />
          Overridden by user
        </div>
      )}
    </div>
  )
}

export function LogTab({
  selectedNodeId,
  nodeStates,
  evalResults,
  workflowNode,
  runId,
  evalOverrideNodeIds,
}: {
  selectedNodeId: string | null
  nodeStates: Record<string, NodeState>
  evalResults: Record<string, EvaluationResult[]>
  workflowNode?: WorkflowNode | null
  runId?: string | null
  evalOverrideNodeIds?: Set<string>
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const prevLogLengthRef = useRef(0)
  const prevSelectedNodeIdRef = useRef<string | null>(selectedNodeId)
  const state = selectedNodeId ? nodeStates[selectedNodeId] : null
  const rawLog = state?.log || []
  const log = useMemo(() => mergeLogEntriesForDisplay(rawLog), [rawLog])

  const [searchQuery, setSearchQuery] = useState("")
  const [activeTypeFilters, setActiveTypeFilters] = useState<Set<LogEntryType>>(
    () => new Set(LOG_ENTRY_TYPES),
  )

  // Reset search/filter when switching nodes
  useEffect(() => {
    setSearchQuery("")
    setActiveTypeFilters(new Set(LOG_ENTRY_TYPES))
  }, [selectedNodeId])

  const filteredLog = useMemo(() => {
    const query = searchQuery.toLowerCase()
    return log.filter((entry) => {
      if (!activeTypeFilters.has(entry.type)) return false
      if (query && !getEntrySearchText(entry).toLowerCase().includes(query))
        return false
      return true
    })
  }, [log, searchQuery, activeTypeFilters])

  const toggleTypeFilter = (type: LogEntryType) => {
    setActiveTypeFilters((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const hasActiveFilters =
    searchQuery !== "" || activeTypeFilters.size !== LOG_ENTRY_TYPES.length
  const isNearBottom = useMemo(
    () => () => {
      const container = scrollContainerRef.current
      if (!container) return true
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight
      return distanceFromBottom <= 96
    },
    [],
  )

  useEffect(() => {
    prevLogLengthRef.current = rawLog.length
    prevSelectedNodeIdRef.current = selectedNodeId
  }, [selectedNodeId])

  useEffect(() => {
    // Avoid forcing scroll-to-bottom when the user switches between nodes.
    if (prevSelectedNodeIdRef.current !== selectedNodeId) {
      prevSelectedNodeIdRef.current = selectedNodeId
      prevLogLengthRef.current = rawLog.length
      return
    }
    const delta = rawLog.length - prevLogLengthRef.current
    prevLogLengthRef.current = rawLog.length
    if (delta <= 0) return
    if (hasActiveFilters || !isNearBottom()) return
    const behavior: ScrollBehavior = delta === 1 ? "smooth" : "auto"
    scrollRef.current?.scrollIntoView({ behavior, block: "end" })
  }, [hasActiveFilters, isNearBottom, rawLog.length, selectedNodeId])

  if (!selectedNodeId) {
    return (
      <div className="px-1 py-3 text-body-sm text-muted-foreground">
        Click a step to view its log
      </div>
    )
  }

  if (log.length === 0 && !state?.error) {
    return (
      <div className="py-3 text-body-sm text-muted-foreground">
        {state?.status === "pending" || state?.status === "queued"
          ? "Waiting to execute..."
          : state?.status === "running"
            ? "Running... output will appear here soon."
            : state?.status === "waiting_human"
              ? "Waiting for human input..."
              : state?.status === "waiting_approval"
                ? "Waiting for approval..."
                : "No log entries"}
      </div>
    )
  }

  const showDebugDetails = Boolean(
    selectedNodeId &&
    state &&
    (state.status === "completed" || state.status === "failed"),
  )

  return (
    <section className="space-y-4">
      {/* Search and filter controls */}
      {log.length > 0 && (
        <div className="ui-slab space-y-3">
          {/* Search input */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search this step log..."
              aria-label="Search this step log"
              className="h-control-sm bg-surface-2/60 pl-8 pr-8 shadow-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 ui-icon-button"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Type filter buttons */}
          <div className="flex flex-wrap gap-2 items-center">
            {LOG_ENTRY_TYPES.map((type) => {
              const isActive = activeTypeFilters.has(type)
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleTypeFilter(type)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 ui-meta-text ui-pressable",
                    isActive
                      ? cn(
                          "bg-surface-1 border-hairline",
                          type === "error"
                            ? "text-status-danger"
                            : "text-foreground",
                        )
                      : "bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-surface-2/45",
                  )}
                  aria-pressed={isActive}
                  aria-label={`${isActive ? "Hide" : "Show"} ${LOG_TYPE_LABELS[type]} entries`}
                >
                  {LOG_TYPE_LABELS[type]}
                </button>
              )
            })}
            {/* Filtered/total count */}
            <span className="ui-meta-text text-muted-foreground ml-auto">
              {hasActiveFilters
                ? `${filteredLog.length}/${log.length} entries`
                : `${log.length} entries`}
            </span>
          </div>
        </div>
      )}

      {/* Scrollable log content */}
      <div
        ref={scrollContainerRef}
        className="ui-slab max-h-[min(24rem,calc(100vh-18rem))] overflow-y-auto px-3 py-3 ui-scroll-region"
      >
        {state?.metrics &&
          (state.metrics.tokens_in > 0 || state.metrics.tokens_out > 0) && (
            <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-hairline/70 pb-3 ui-meta-text font-mono text-muted-foreground">
              <span title="Input tokens">
                In: {formatTokens(state.metrics.tokens_in)}
              </span>
              <span title="Output tokens">
                Out: {formatTokens(state.metrics.tokens_out)}
              </span>
              {state.metrics.cost_usd > 0 && (
                <span title="Estimated cost">
                  {formatCost(state.metrics.cost_usd)}
                </span>
              )}
              {Number.isFinite(state.metrics.latency_ms) &&
                state.metrics.latency_ms >= 0 && (
                  <span title="Latency">
                    {(state.metrics.latency_ms / 1000).toFixed(1)}s
                  </span>
                )}
              {state.meta?.model_id && (
                <span className="text-muted-foreground/60">
                  {state.meta.model_id}
                </span>
              )}
            </div>
          )}
        {state?.error && (
          <div className="mb-3 rounded-md surface-danger-soft px-3 py-2 ui-meta-text text-status-danger">
            <span className="font-medium">
              {state.errorKind
                ? ERROR_KIND_LABELS[state.errorKind] || state.errorKind
                : "Error"}
              :
            </span>{" "}
            {state.error}
            {(state.retriesUsed || 0) > 0 && (
              <span className="ml-2 text-status-warning">
                retry x{state.retriesUsed}
              </span>
            )}
            {state.policyApplied && (
              <span className="ml-2 text-muted-foreground">
                policy: {state.policyApplied}
              </span>
            )}
          </div>
        )}
        {filteredLog.length === 0 && log.length > 0 && (
          <div className="py-4 text-center text-body-sm text-muted-foreground">
            No entries match the current filters
          </div>
        )}
        {filteredLog.map((entry, index) => (
          <LogEntryCard
            key={getLogEntryKey(selectedNodeId, entry, index)}
            entry={entry}
          />
        ))}
        {selectedNodeId && evalResults[selectedNodeId]?.length > 0 && (
          <EvalResultsSection
            selectedNodeId={selectedNodeId}
            evalResults={evalResults}
            runId={runId}
            isWaitingForOverride={
              evalOverrideNodeIds?.has(selectedNodeId) ?? false
            }
          />
        )}
        <div ref={scrollRef} />
      </div>

      {showDebugDetails && state && selectedNodeId && (
        <DebugDetailsPanel
          state={state}
          rawLog={rawLog}
          evalResults={evalResults[selectedNodeId] || []}
          workflowNode={workflowNode}
        />
      )}
    </section>
  )
}
