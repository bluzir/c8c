import { useState, useEffect, useCallback, useMemo } from "react"
import { cn } from "@/lib/cn"
import { Button } from "@/components/ui/button"
import { Copy } from "lucide-react"
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { CursorMenu } from "@/components/ui/cursor-menu"
import type { RunResult } from "@shared/types"
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
  if (status === "blocked" || status === "interrupted") return "ui-status-badge-warning"
  if (status === "cancelled") return "border border-hairline bg-surface-2/80 text-muted-foreground"
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
  return run.status !== "completed" && run.status !== "failed" && run.status !== "cancelled"
}

function joinMeta(parts: Array<string | null | undefined>) {
  return parts.filter((value): value is string => Boolean(value)).join(" · ")
}

function formatRunIdShort(runId: string): string {
  return runId.length > 10 ? `${runId.slice(0, 8)}…` : runId
}

export interface HistoryTabProps {
  pastRuns: RunResult[]
  runStatus: string
  fillHeight?: boolean
  onOpenReport: (path: string) => Promise<void> | void
  onContinueRun?: (run: RunResult) => Promise<void> | void
  selectedRunId?: string | null
  onSelectRun?: (run: RunResult) => void
}

export function HistoryTab({
  pastRuns,
  runStatus,
  fillHeight = false,
  onOpenReport,
  onContinueRun,
  selectedRunId,
  onSelectRun,
}: HistoryTabProps) {
  const [selectedHistoryRunId, setSelectedHistoryRunId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; runId: string } | null>(null)

  const selectedHistoryRun = useMemo(
    () => pastRuns.find((run) => run.runId === selectedHistoryRunId) || null,
    [pastRuns, selectedHistoryRunId],
  )
  const contextHistoryRun = contextMenu
    ? pastRuns.find((run) => run.runId === contextMenu.runId) || null
    : null

  const handleOpenReport = useCallback(async (path: string) => {
    try {
      await Promise.resolve(onOpenReport(path))
    } catch (error) {
      console.error("[HistoryTab] open report failed:", error)
      toastErrorFromCatch("Could not open report file", error)
    }
  }, [onOpenReport])

  const handleCopyRunId = useCallback(async (runId: string) => {
    try {
      await navigator.clipboard.writeText(runId)
    } catch (error) {
      console.error("[HistoryTab] copy run ID failed:", error)
      toastErrorFromCatch("Could not copy run ID", error)
    }
  }, [])

  useEffect(() => {
    if (selectedRunId && pastRuns.some((run) => run.runId === selectedRunId)) {
      setSelectedHistoryRunId(selectedRunId)
      return
    }
    if (pastRuns.length === 0) {
      setSelectedHistoryRunId(null)
      return
    }
    const exists = selectedHistoryRunId && pastRuns.some((run) => run.runId === selectedHistoryRunId)
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
    selectedHistoryRun
    && onContinueRun
    && selectedHistoryRun.workspace
    && isRunContinuable(selectedHistoryRun)
    && runStatus !== "running",
  )
  const selectedRunCanViewResult = Boolean(selectedHistoryRun && onSelectRun)
  const selectedRunCanOpenFile = Boolean(selectedHistoryRun?.reportPath)
  const handleSelectedRunViewResult = () => {
    if (!selectedHistoryRun) return
    onSelectRun?.(selectedHistoryRun)
  }

  return (
    <>
      <div className={cn(fillHeight ? "flex min-h-0 flex-1 flex-col gap-3" : "space-y-3")}>
        {selectedHistoryRun && (
          <div className="border-b border-hairline px-1 pb-3">
            <div className="min-w-0">
              <div className="ui-meta-label text-muted-foreground">Selected run</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <div className="text-body-sm font-medium text-foreground">
                  {formatRunRelativeTime(selectedHistoryRun)}
                </div>
                <span className={cn("ui-status-badge shrink-0 ui-meta-text", statusToneClass(selectedHistoryRun.status))}>
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
                <span>{pastRuns.length === 1 ? "1 run recorded" : `${pastRuns.length} runs recorded`}</span>
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
                    onClick={() => { void handleCopyRunId(selectedHistoryRun.runId) }}
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
                title={selectedRunCanOpenFile ? undefined : "No report file saved for this run"}
                onClick={() => {
                  if (!selectedHistoryRun?.reportPath) return
                  void handleOpenReport(selectedHistoryRun.reportPath)
                }}
              >
                Open file
              </Button>
            </div>
          </div>
        )}

        <div
          role="list"
          aria-label="Run history"
          className={cn(
            "ui-scroll-region overflow-y-auto",
            fillHeight ? "min-h-0 flex-1" : "max-h-[min(24rem,calc(100vh-18rem))]",
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
                  setContextMenu({ x: event.clientX, y: event.clientY, runId: run.runId })
                }}
                className={cn(
                  "ui-pressable flex w-full items-center gap-3 border-b border-hairline/70 px-1 py-2.5 text-left ui-transition-colors ui-motion-fast last:border-b-0",
                  isSelected
                    ? "bg-surface-2/70"
                    : "hover:bg-surface-2/40",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-2 w-2 shrink-0 rounded-full",
                    run.status === "completed"
                      ? "bg-status-success"
                      : run.status === "failed"
                        ? "bg-status-danger"
                        : run.status === "blocked" || run.status === "interrupted"
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
                <span className={cn("ui-status-badge shrink-0 ui-meta-text", statusToneClass(run.status))}>
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
            <DropdownMenuLabel>{formatRunRelativeTime(contextHistoryRun)}</DropdownMenuLabel>
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
              disabled={!onContinueRun || !contextHistoryRun.workspace || !isRunContinuable(contextHistoryRun) || runStatus === "running"}
              onSelect={() => {
                if (!onContinueRun || !contextHistoryRun.workspace || !isRunContinuable(contextHistoryRun) || runStatus === "running") return
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
          </>
        )}
      </CursorMenu>
    </>
  )
}
