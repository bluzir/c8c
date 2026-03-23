import {
  AlertTriangle,
  ExternalLink,
  Eye,
  FolderSearch2,
  Pause,
  Play,
  Square,
  TimerReset,
  Workflow as WorkflowIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  entryDurationLabel,
  folderName,
  formatDateTime,
  formatTokenCount,
  groupMetaLabel,
  isRunInFlight,
  outcomeIcon,
  outcomeLabel,
  primaryActionLabel,
  summarizeCost,
  triageGroup,
  triageHeadline,
  triageSummary,
  type DashboardEntry,
} from "./dashboardModel"

export function MultiRunDashboardDetail({
  entry,
  now,
  onFocusWorkflow,
  onPauseExecution,
  onResumeExecution,
  onCancelExecution,
  onClearEntry,
}: {
  entry: DashboardEntry | null
  now: number
  onFocusWorkflow: (
    entry: DashboardEntry,
    options?: { reviewPastRun?: boolean },
  ) => Promise<void>
  onPauseExecution: (entry: DashboardEntry) => Promise<void>
  onResumeExecution: (entry: DashboardEntry) => Promise<void>
  onCancelExecution: (entry: DashboardEntry) => Promise<void>
  onClearEntry: (entry: DashboardEntry) => void
}) {
  if (!entry) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-12 text-center">
        <div className="max-w-sm">
          <p className="text-title-sm text-foreground">No runs to show</p>
          <p className="mt-2 text-body-sm text-muted-foreground">
            Start a flow and it will appear here with live status, approvals,
            and results.
          </p>
        </div>
      </div>
    )
  }

  const selectedEntryCost = summarizeCost(entry)
  const selectedEntryDurationLabel = entryDurationLabel(entry, now)

  return (
    <div
      key={entry.workflowKey}
      className="flex h-full flex-col ui-fade-slide-in"
    >
      <div className="border-b border-hairline px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-title-md text-foreground">
              {entry.workflowName ||
                (entry.workflowPath ? "Untitled flow" : "Unsaved draft")}
            </h3>
            {entry.isSelectedWorkflow && (
              <Badge
                variant="outline"
                className="border-primary/30 bg-primary/10 text-primary"
              >
                Current flow
              </Badge>
            )}
          </div>
          <p className="mt-1 text-body-sm text-muted-foreground">
            {entry.workflowPath || "Unsaved draft flow"}
          </p>
        </div>
      </div>

      <div className="ui-scroll-region flex-1 overflow-y-auto px-5 py-4">
        <section className="rounded-xl surface-panel p-5 space-y-5 ui-fade-slide-in">
          <div className="space-y-2">
            <p className="section-kicker">
              {groupMetaLabel(triageGroup(entry))}
            </p>
            <h4 className="text-title-md text-foreground">
              {triageHeadline(entry)}
            </h4>
            <p className="text-body-sm text-muted-foreground">
              {triageSummary(entry, now)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 ui-section-divider pt-4">
            {entry.runStatus === "paused" && entry.runId ? (
              <Button size="sm" onClick={() => void onResumeExecution(entry)}>
                <Play size={14} />
                {primaryActionLabel(entry)}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() =>
                  void onFocusWorkflow(entry, {
                    reviewPastRun:
                      !isRunInFlight(entry.runStatus) && entry.pastRun !== null,
                  })
                }
              >
                <Eye size={14} />
                {primaryActionLabel(entry)}
              </Button>
            )}

            {entry.runStatus === "paused" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void onFocusWorkflow(entry)}
              >
                <ExternalLink size={14} />
                Open flow
              </Button>
            )}

            {isRunInFlight(entry.runStatus) &&
            entry.runStatus !== "paused" &&
            entry.runStatus !== "cancelling" &&
            entry.runStatus !== "starting" &&
            entry.runId ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void onPauseExecution(entry)}
              >
                <Pause size={14} />
                Pause
              </Button>
            ) : null}

            {entry.runStatus === "cancelling" ? (
              <span className="ui-meta-text text-muted-foreground">
                Stopping…
              </span>
            ) : isRunInFlight(entry.runStatus) && entry.runId ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void onCancelExecution(entry)}
              >
                <Square size={14} />
                Stop
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onClearEntry(entry)}
              >
                <TimerReset size={14} />
                Clear
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-x-6 gap-y-3 ui-section-divider pt-4 text-body-sm md:grid-cols-2">
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">Project</span>
              <span className="text-right text-foreground">
                {folderName(entry.projectPath)}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">Status</span>
              <span className="inline-flex items-center gap-2 text-right text-foreground">
                {outcomeIcon(entry)}
                {outcomeLabel(entry)}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">Progress</span>
              <span className="text-right text-foreground tabular-nums">
                Step{" "}
                {Math.min(
                  entry.progress.completedSteps,
                  entry.progress.totalSteps,
                )}
                /{entry.progress.totalSteps || 0}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">Runtime</span>
              <span className="text-right text-foreground tabular-nums">
                {selectedEntryDurationLabel || "Not available"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">Active step</span>
              <span className="max-w-[60%] text-right text-foreground">
                {entry.activeNodeLabel || "None"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">Approvals</span>
              <span className="text-right text-foreground">
                {entry.approvalCount > 0
                  ? `${entry.approvalCount} pending`
                  : "None"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">Started</span>
              <span className="text-right text-foreground">
                {formatDateTime(entry.runStartedAt)}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">Usage</span>
              <span className="text-right text-foreground tabular-nums">
                {selectedEntryCost.totalCost > 0
                  ? `$${selectedEntryCost.totalCost.toFixed(2)}`
                  : "No cost yet"}
                {selectedEntryCost.totalTokens > 0
                  ? ` · ${formatTokenCount(selectedEntryCost.totalTokens)} tokens`
                  : ""}
              </span>
            </div>
          </div>

          {entry.approvalMessages.length > 0 && (
            <div
              className="space-y-2 ui-section-divider pt-4"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-2 text-status-warning">
                <AlertTriangle size={14} />
                <p className="text-body-sm font-medium">Pending approvals</p>
              </div>
              <div className="space-y-1.5">
                {entry.approvalMessages.map((message, index) => (
                  <p
                    key={`${message}-${index}`}
                    className="text-body-sm text-status-warning/90"
                  >
                    {message}
                  </p>
                ))}
              </div>
            </div>
          )}

          {entry.lastError && (
            <div
              className="space-y-2 ui-section-divider pt-4"
              role="alert"
              aria-live="assertive"
            >
              <div className="flex items-center gap-2 text-status-danger">
                <AlertTriangle size={14} />
                <p className="text-body-sm font-medium">Last error</p>
              </div>
              <p className="text-body-sm text-status-danger/90 whitespace-pre-wrap break-words">
                {entry.lastError}
              </p>
            </div>
          )}

          <div className="space-y-3 ui-section-divider pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <WorkflowIcon size={15} className="text-muted-foreground" />
                <h4 className="text-body-sm font-medium text-foreground">
                  Result snapshot
                </h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {entry.reportPath ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void window.api.openReport(entry.reportPath!)
                    }
                  >
                    <ExternalLink size={14} />
                    Open report
                  </Button>
                ) : null}
                {entry.workspace ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void window.api.showInFinder(entry.workspace!)
                    }
                  >
                    <FolderSearch2 size={14} />
                    Reveal workspace
                  </Button>
                ) : null}
              </div>
            </div>

            {entry.finalContent.trim() ? (
              <pre className="ui-scroll-region max-h-[320px] overflow-auto whitespace-pre-wrap break-words text-body-sm text-foreground">
                {entry.finalContent}
              </pre>
            ) : (
              <p className="text-body-sm text-muted-foreground">
                No final output captured for this run yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
