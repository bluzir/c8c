import { useState, useEffect, useCallback, useMemo } from "react"
import { cn } from "@/lib/cn"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import { SingleDecisionDialog } from "@/components/ui/single-decision-dialog"
import { Copy, Lightbulb, Trash2 } from "lucide-react"
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { CursorMenu } from "@/components/ui/cursor-menu"
import { toast } from "sonner"
import type {
  FlowImprovementRecommendation,
  RunResult,
  RunWorkspaceCleanupResult,
  RunWorkspaceDeleteResult,
} from "@shared/types"
import { toastErrorFromCatch } from "@/lib/toast-error"

function formatDurationMs(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs}ms`
  const seconds = durationMs / 1_000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = Math.round(seconds % 60)
  return `${minutes}m ${remainSeconds}s`
}

function formatRunDuration(run: RunResult): string | null {
  if (typeof run.durationMs === "number" && run.durationMs >= 0) {
    return formatDurationMs(run.durationMs)
  }
  if (run.completedAt > 0 && run.startedAt > 0) {
    const delta = run.completedAt - run.startedAt
    if (delta > 0) return formatDurationMs(delta)
  }
  return null
}

function formatRunCost(run: RunResult): string | null {
  if (typeof run.totalCost === "number") {
    return `$${run.totalCost.toFixed(2)}`
  }
  return null
}

function formatRunCompletedAt(run: RunResult): string | null {
  const timestamp = run.completedAt > 0 ? run.completedAt : run.startedAt
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString()
}

function formatRunRelativeTime(run: RunResult): string {
  const timestamp = run.completedAt > 0 ? run.completedAt : run.startedAt
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "Unknown time"
  const deltaMs = Date.now() - timestamp
  if (deltaMs < 60_000) return "Now"
  const minutes = Math.floor(deltaMs / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

function statusToneClass(status: RunResult["status"]): string {
  if (status === "completed") return "ui-status-badge-success"
  if (status === "failed") return "ui-status-badge-danger"
  if (status === "blocked" || status === "interrupted")
    return "ui-status-badge-warning"
  if (status === "cancelled")
    return "border border-hairline bg-surface-2/80 text-muted-foreground"
  return "ui-status-badge-info"
}

function statusLabel(status: RunResult["status"]): string {
  if (status === "completed") return "Completed"
  if (status === "failed") return "Failed"
  if (status === "blocked") return "Blocked"
  if (status === "interrupted") return "Interrupted"
  if (status === "cancelled") return "Cancelled"
  if (status === "paused") return "Paused"
  return "Running"
}

function isRunContinuable(run: RunResult): boolean {
  return (
    run.status !== "completed" &&
    run.status !== "failed" &&
    run.status !== "cancelled"
  )
}

function joinMeta(parts: Array<string | null | undefined>) {
  return parts.filter((value): value is string => Boolean(value)).join(" · ")
}

function formatRunIdShort(runId: string): string {
  return runId.length > 10 ? `${runId.slice(0, 8)}…` : runId
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`
}

// ── Improvement recommendation formatting ──────────────

function formatPercent(rate: number | undefined): string | null {
  if (rate == null || !Number.isFinite(rate)) return null
  return `${Math.round(rate * 100)}%`
}

function formatRecommendationVerdict(
  rec: FlowImprovementRecommendation,
): string {
  const stepLabel = rec.nodeLabel || rec.nodeId || "A step"
  const m = rec.metrics

  if (rec.kind === "prefer_variant") {
    const candidateRate = formatPercent(m?.candidateSuccessRate)
    const baselineRate = formatPercent(m?.comparisonSuccessRate)
    const comparison =
      candidateRate && baselineRate
        ? ` — succeeds ${candidateRate} vs ${baselineRate}`
        : ""
    return `${stepLabel} has a better variant${comparison}`
  }

  if (rec.kind === "stabilize_step") {
    const gatePassAt1 = formatPercent(m?.candidateGatePassAt1)
    const gatePassAt3 = formatPercent(m?.candidateGatePassAt3)
    if (gatePassAt1 && gatePassAt3) {
      return `${stepLabel} needs attention — passes ${gatePassAt1} on first try, ${gatePassAt3} within 3 attempts`
    }
    const successRate = formatPercent(m?.candidateSuccessRate)
    const runs = rec.supportingRunCount
    const rate = successRate
      ? `${successRate} success rate`
      : "low success rate"
    return `${stepLabel} needs attention — ${rate} across ${runs} run${runs === 1 ? "" : "s"}`
  }

  if (rec.kind === "reduce_manual_edits") {
    const editRate = formatPercent(m?.editRate)
    const rate = editRate || "most"
    return `Approval at ${stepLabel} keeps getting rewritten — ${rate} of runs edited`
  }

  return rec.summary
}

function recommendationKindLabel(
  kind: FlowImprovementRecommendation["kind"],
): string {
  if (kind === "prefer_variant") return "Better variant"
  if (kind === "stabilize_step") return "Needs attention"
  if (kind === "reduce_manual_edits") return "Frequent edits"
  return "Suggestion"
}

function formatMetricComparison(
  label: string,
  candidate: number | undefined,
  baseline: number | undefined,
): string | null {
  const candidateLabel = formatPercent(candidate)
  if (!candidateLabel) return null
  const baselineLabel = formatPercent(baseline)
  return baselineLabel
    ? `${label} ${candidateLabel} vs ${baselineLabel}`
    : `${label} ${candidateLabel}`
}

function formatRecommendationMetricHighlights(
  recommendation: FlowImprovementRecommendation,
): string[] {
  const metrics = recommendation.metrics
  if (!metrics) return []

  return [
    formatMetricComparison(
      "Pass@1",
      metrics.candidateGatePassAt1,
      metrics.comparisonGatePassAt1,
    ),
    formatMetricComparison(
      "Pass@3",
      metrics.candidateGatePassAt3,
      metrics.comparisonGatePassAt3,
    ),
    formatMetricComparison(
      "Stable",
      metrics.candidateGatePassConsistency,
      metrics.comparisonGatePassConsistency,
    ),
    formatMetricComparison(
      "Saved",
      metrics.candidateEvaluatorSaveRate,
      metrics.comparisonEvaluatorSaveRate,
    ),
  ].filter((value): value is string => Boolean(value))
}

function RecommendationItem({
  recommendation,
}: {
  recommendation: FlowImprovementRecommendation
}) {
  const metricHighlights = formatRecommendationMetricHighlights(recommendation)

  return (
    <div
      className="surface-info-soft rounded-md px-3 py-2.5"
      data-testid="recommendation-item"
    >
      <div className="flex items-start gap-2">
        <Lightbulb
          size={14}
          className="mt-0.5 shrink-0 text-status-info"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-body-sm font-medium text-foreground">
              {formatRecommendationVerdict(recommendation)}
            </span>
            <Badge
              variant={
                recommendation.confidence === "high" ? "info" : "secondary"
              }
              size="compact"
            >
              {recommendation.confidence === "high"
                ? "High confidence"
                : "Medium confidence"}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 ui-meta-text text-muted-foreground">
            <span>{recommendationKindLabel(recommendation.kind)}</span>
            <span>
              {`${recommendation.supportingRunCount} run${recommendation.supportingRunCount === 1 ? "" : "s"} analyzed`}
            </span>
          </div>
          <div className="mt-1 ui-meta-text text-muted-foreground">
            {recommendation.evidence}
          </div>
          {metricHighlights.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 ui-meta-text text-muted-foreground">
              {metricHighlights.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── HistoryTab ──────────────────────────────────────────

export interface HistoryTabProps {
  pastRuns: RunResult[]
  improvementRecommendations: FlowImprovementRecommendation[]
  runStatus: string
  fillHeight?: boolean
  onOpenReport: (path: string) => Promise<void> | void
  onContinueRun?: (run: RunResult) => Promise<void> | void
  onDeleteRun?: (
    run: RunResult,
  ) => Promise<RunWorkspaceDeleteResult> | RunWorkspaceDeleteResult
  onCleanupRuns?: () =>
    | Promise<RunWorkspaceCleanupResult>
    | RunWorkspaceCleanupResult
  selectedRunId?: string | null
  onSelectRun?: (run: RunResult) => void
}

export function HistoryTab({
  pastRuns,
  improvementRecommendations,
  runStatus,
  fillHeight = false,
  onOpenReport,
  onContinueRun,
  onDeleteRun,
  onCleanupRuns,
  selectedRunId,
  onSelectRun,
}: HistoryTabProps) {
  const [selectedHistoryRunId, setSelectedHistoryRunId] = useState<
    string | null
  >(null)
  const [deleteRunDialogOpen, setDeleteRunDialogOpen] = useState(false)
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<
    "delete" | "cleanup" | null
  >(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    runId: string
  } | null>(null)

  const selectedHistoryRun = useMemo(
    () => pastRuns.find((run) => run.runId === selectedHistoryRunId) || null,
    [pastRuns, selectedHistoryRunId],
  )
  const contextHistoryRun = contextMenu
    ? pastRuns.find((run) => run.runId === contextMenu.runId) || null
    : null
  const selectedRunCanDelete = Boolean(
    selectedHistoryRun &&
    onDeleteRun &&
    selectedHistoryRun.status !== "running",
  )
  const canCleanupRuns = Boolean(onCleanupRuns && pastRuns.length > 0)

  const handleOpenReport = useCallback(
    async (path: string) => {
      try {
        await Promise.resolve(onOpenReport(path))
      } catch (error) {
        console.error("[HistoryTab] open report failed:", error)
        toastErrorFromCatch("Could not open report file", error)
      }
    },
    [onOpenReport],
  )

  const handleCopyRunId = useCallback(async (runId: string) => {
    try {
      await navigator.clipboard.writeText(runId)
    } catch (error) {
      console.error("[HistoryTab] copy run ID failed:", error)
      toastErrorFromCatch("Could not copy run ID", error)
    }
  }, [])

  const handleDeleteRun = useCallback(async () => {
    if (!selectedHistoryRun || !onDeleteRun) return
    setPendingAction("delete")
    try {
      const result = await Promise.resolve(onDeleteRun(selectedHistoryRun))
      if (result.deleted) {
        toast.success("Run deleted", {
          description: `Removed ${result.runId} and reclaimed ${formatBytes(result.reclaimedBytes)}.`,
        })
      } else {
        toast("Run already removed", {
          description: `${result.runId} was not present on disk anymore.`,
        })
      }
    } catch (error) {
      console.error("[HistoryTab] delete run failed:", error)
      toastErrorFromCatch("Could not delete run", error)
    } finally {
      setPendingAction(null)
    }
  }, [onDeleteRun, selectedHistoryRun])

  const handleCleanupRuns = useCallback(async () => {
    if (!onCleanupRuns) return
    setPendingAction("cleanup")
    try {
      const result = await Promise.resolve(onCleanupRuns())
      if (result.deletedRuns > 0) {
        toast.success("Old runs cleaned up", {
          description: `Removed ${result.deletedRuns} run workspace${result.deletedRuns === 1 ? "" : "s"} and reclaimed ${formatBytes(result.reclaimedBytes)}.`,
        })
      } else {
        toast("No stale runs to clean up", {
          description: "Recent and in-progress run workspaces were kept.",
        })
      }
    } catch (error) {
      console.error("[HistoryTab] cleanup runs failed:", error)
      toastErrorFromCatch("Could not clean up old runs", error)
    } finally {
      setPendingAction(null)
    }
  }, [onCleanupRuns])

  useEffect(() => {
    if (selectedRunId && pastRuns.some((run) => run.runId === selectedRunId)) {
      setSelectedHistoryRunId(selectedRunId)
      return
    }
    if (pastRuns.length === 0) {
      setSelectedHistoryRunId(null)
      return
    }
    const exists =
      selectedHistoryRunId &&
      pastRuns.some((run) => run.runId === selectedHistoryRunId)
    if (!exists) {
      setSelectedHistoryRunId(pastRuns[0].runId)
    }
  }, [pastRuns, selectedHistoryRunId, selectedRunId])

  if (pastRuns.length === 0) {
    return (
      <div className="px-1 py-2 text-body-sm text-muted-foreground">
        No runs yet. Results will appear here after you run this flow.
      </div>
    )
  }

  const selectedRunCanContinue = Boolean(
    selectedHistoryRun &&
    onContinueRun &&
    selectedHistoryRun.workspace &&
    isRunContinuable(selectedHistoryRun) &&
    runStatus !== "running",
  )
  const selectedRunCanViewResult = Boolean(selectedHistoryRun && onSelectRun)
  const selectedRunCanOpenFile = Boolean(selectedHistoryRun?.reportPath)
  const handleSelectedRunViewResult = () => {
    if (!selectedHistoryRun) return
    onSelectRun?.(selectedHistoryRun)
  }

  return (
    <>
      <div
        className={cn(
          fillHeight ? "flex min-h-0 flex-1 flex-col gap-3" : "space-y-3",
        )}
      >
        {selectedHistoryRun && (
          <div className="surface-figure px-4 py-4">
            <div className="min-w-0">
              <div className="ui-meta-label text-muted-foreground">
                Selected run
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <div className="text-body-sm font-medium text-foreground">
                  {formatRunRelativeTime(selectedHistoryRun)}
                </div>
                <span
                  className={cn(
                    "ui-status-badge shrink-0 ui-meta-text",
                    statusToneClass(selectedHistoryRun.status),
                  )}
                >
                  {statusLabel(selectedHistoryRun.status)}
                </span>
              </div>
              <div className="mt-1 ui-meta-text text-muted-foreground">
                {joinMeta([
                  formatRunCompletedAt(selectedHistoryRun),
                  formatRunDuration(selectedHistoryRun),
                  formatRunCost(selectedHistoryRun),
                ]) || "Run details unavailable"}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 ui-meta-text text-muted-foreground">
                <span>
                  {pastRuns.length === 1
                    ? "1 run recorded"
                    : `${pastRuns.length} runs recorded`}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span>Run ID:</span>
                  <span className="font-mono" title={selectedHistoryRun.runId}>
                    {formatRunIdShort(selectedHistoryRun.runId)}
                  </span>
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    title="Copy run ID"
                    aria-label="Copy run ID"
                    onClick={() => {
                      void handleCopyRunId(selectedHistoryRun.runId)
                    }}
                  >
                    <Copy size={12} aria-hidden="true" />
                  </button>
                </span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {selectedRunCanViewResult && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSelectedRunViewResult}
                >
                  View result
                </Button>
              )}
              {selectedRunCanContinue && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!selectedHistoryRun || !onContinueRun) return
                    void onContinueRun(selectedHistoryRun)
                  }}
                >
                  Continue
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedRunCanOpenFile}
                title={
                  selectedRunCanOpenFile
                    ? undefined
                    : "No report file saved for this run"
                }
                onClick={() => {
                  if (!selectedHistoryRun?.reportPath) return
                  void handleOpenReport(selectedHistoryRun.reportPath)
                }}
              >
                Open file
              </Button>
              {selectedRunCanDelete && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteRunDialogOpen(true)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Delete
                </Button>
              )}
            </div>
            {canCleanupRuns && (
              <div className="mt-3 border-t border-hairline pt-3">
                <button
                  type="button"
                  className="ui-meta-text text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setCleanupDialogOpen(true)}
                >
                  Clean up old runs
                </button>
              </div>
            )}
          </div>
        )}

        {improvementRecommendations.length > 0 &&
          improvementRecommendations.length <= 2 && (
            <div className="space-y-2">
              {improvementRecommendations.map((recommendation) => (
                <RecommendationItem
                  key={recommendation.id}
                  recommendation={recommendation}
                />
              ))}
            </div>
          )}

        {improvementRecommendations.length > 2 && (
          <div className="px-1">
            <DisclosurePanel
              summary={`Improvement suggestions (${improvementRecommendations.length})`}
              surface="plain"
              className="border-b border-hairline"
              summaryClassName="px-0 py-2"
              contentClassName="space-y-2 px-0 py-2"
              unmountWhenClosed
            >
              {improvementRecommendations.map((recommendation) => (
                <RecommendationItem
                  key={recommendation.id}
                  recommendation={recommendation}
                />
              ))}
            </DisclosurePanel>
          </div>
        )}

        <div
          role="list"
          aria-label="Run history"
          className={cn(
            "ui-scroll-region overflow-y-auto",
            fillHeight
              ? "min-h-0 flex-1"
              : "max-h-[min(24rem,calc(100vh-18rem))]",
          )}
        >
          {pastRuns.map((run) => {
            const isSelected = selectedHistoryRun?.runId === run.runId
            const rowMeta = joinMeta([
              formatRunCompletedAt(run),
              formatRunDuration(run),
              formatRunCost(run),
            ])

            return (
              <button
                key={run.runId}
                type="button"
                role="listitem"
                onClick={() => setSelectedHistoryRunId(run.runId)}
                onDoubleClick={() => onSelectRun?.(run)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setSelectedHistoryRunId(run.runId)
                  setContextMenu({
                    x: event.clientX,
                    y: event.clientY,
                    runId: run.runId,
                  })
                }}
                className={cn(
                  "ui-pressable flex w-full items-center gap-3 border-b border-hairline px-1 py-2.5 text-left ui-transition-colors ui-motion-fast last:border-b-0",
                  isSelected ? "ui-selected-row-tint" : "hover:bg-surface-2/40",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-2 w-2 shrink-0 rounded-full",
                    run.status === "completed"
                      ? "bg-status-success"
                      : run.status === "failed"
                        ? "bg-status-danger"
                        : run.status === "blocked" ||
                            run.status === "interrupted"
                          ? "bg-status-warning"
                          : "bg-muted-foreground",
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="truncate text-body-sm font-medium text-foreground">
                    {formatRunRelativeTime(run)}
                  </span>
                  <span className="mt-0.5 block truncate ui-meta-text text-muted-foreground">
                    {rowMeta || run.runId}
                  </span>
                </span>
                <span
                  className={cn(
                    "ui-status-badge shrink-0 ui-meta-text",
                    statusToneClass(run.status),
                  )}
                >
                  {statusLabel(run.status)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <CursorMenu
        open={contextMenu !== null}
        x={contextMenu?.x || 0}
        y={contextMenu?.y || 0}
        onOpenChange={(open) => {
          if (!open) setContextMenu(null)
        }}
      >
        {contextHistoryRun && (
          <>
            <DropdownMenuLabel>
              {formatRunRelativeTime(contextHistoryRun)}
            </DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!onSelectRun}
              onSelect={() => {
                if (!onSelectRun) return
                onSelectRun?.(contextHistoryRun)
                setContextMenu(null)
              }}
            >
              View result
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={
                !onContinueRun ||
                !contextHistoryRun.workspace ||
                !isRunContinuable(contextHistoryRun) ||
                runStatus === "running"
              }
              onSelect={() => {
                if (
                  !onContinueRun ||
                  !contextHistoryRun.workspace ||
                  !isRunContinuable(contextHistoryRun) ||
                  runStatus === "running"
                )
                  return
                void onContinueRun(contextHistoryRun)
                setContextMenu(null)
              }}
            >
              Continue run
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                void handleCopyRunId(contextHistoryRun.runId)
                setContextMenu(null)
              }}
            >
              Copy run ID
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!contextHistoryRun.reportPath}
              onSelect={() => {
                if (!contextHistoryRun.reportPath) return
                void handleOpenReport(contextHistoryRun.reportPath)
                setContextMenu(null)
              }}
            >
              Open report file
            </DropdownMenuItem>
            {onDeleteRun && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={contextHistoryRun.status === "running"}
                  onSelect={() => {
                    setSelectedHistoryRunId(contextHistoryRun.runId)
                    setDeleteRunDialogOpen(true)
                    setContextMenu(null)
                  }}
                >
                  Delete run
                </DropdownMenuItem>
              </>
            )}
            {canCleanupRuns && (
              <DropdownMenuItem
                onSelect={() => {
                  setCleanupDialogOpen(true)
                  setContextMenu(null)
                }}
              >
                Clean up old runs
              </DropdownMenuItem>
            )}
          </>
        )}
      </CursorMenu>

      <SingleDecisionDialog
        open={deleteRunDialogOpen}
        onOpenChange={setDeleteRunDialogOpen}
        title="Delete stored run?"
        description="This removes the selected run workspace from local disk."
        note={
          selectedHistoryRun && isRunContinuable(selectedHistoryRun)
            ? "This run can still be continued. Deleting it also removes that continuation state."
            : "Reports and persisted step history inside this workspace will be removed."
        }
        noteTone="danger"
        confirmLabel="Delete run"
        confirmVariant="destructive"
        confirmDisabled={!selectedRunCanDelete || pendingAction !== null}
        preventOutsideDismiss
        onConfirm={() => {
          void handleDeleteRun()
        }}
      />

      <SingleDecisionDialog
        open={cleanupDialogOpen}
        onOpenChange={setCleanupDialogOpen}
        title="Clean up old run workspaces?"
        description="This keeps recent history and removes stale completed, failed, cancelled, and interrupted run workspaces."
        note="Paused or actively running workspaces are kept."
        confirmLabel="Clean up old runs"
        confirmDisabled={!canCleanupRuns || pendingAction !== null}
        onConfirm={() => {
          void handleCleanupRuns()
        }}
      />
    </>
  )
}
