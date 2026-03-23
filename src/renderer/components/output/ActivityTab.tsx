import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import { SelectedStepSummaryPanel } from "@/components/output/SelectedStepSummaryPanel"
import { cn } from "@/lib/cn"
import type { RuntimeStagePresentation } from "@/lib/runtime-flow-labels"

interface SummaryBranchPreview {
  id: string
  label: string
  detail?: string | null
  status: string
}

interface SummaryBranchAggregate {
  total: number
  running: number
  completed: number
  failed: number
  waitingApproval: number
  pending: number
  previews: SummaryBranchPreview[]
}

function compactLine(items: Array<string | null | undefined>) {
  return items
    .filter((item): item is string => Boolean(item && item.trim()))
    .join(" · ")
}

function formatBranchAggregate(summary: SummaryBranchAggregate) {
  const lead =
    summary.running > 0
      ? `${summary.running}/${summary.total} active`
      : summary.waitingApproval > 0
        ? `${summary.waitingApproval}/${summary.total} blocked`
        : summary.completed > 0
          ? `${summary.completed}/${summary.total} done`
          : `${summary.total} branches`

  return compactLine([
    lead,
    summary.failed > 0
      ? `${summary.failed} issue${summary.failed === 1 ? "" : "s"}`
      : null,
  ])
}

function formatBranchStatus(status: string) {
  if (status === "waiting_approval") return "needs approval"
  if (status === "waiting_human") return "waiting for input"
  if (status === "completed") return "done"
  if (status === "failed") return "failed"
  return status
}

function branchStatusBadgeClass(status: string) {
  if (status === "waiting_approval" || status === "waiting_human")
    return "ui-status-badge-warning"
  if (status === "running") return "ui-status-badge-info"
  if (status === "failed") return "ui-status-badge-danger"
  if (status === "completed") return "ui-status-badge-success"
  return "border border-hairline bg-surface-1 text-muted-foreground"
}

function SummaryRow({
  kicker,
  headline,
  detail,
  detailClassName,
  action,
  toneClassName,
  children,
}: {
  kicker: string
  headline: string
  detail?: string | null
  detailClassName?: string
  action?: ReactNode
  toneClassName?: string
  children?: ReactNode
}) {
  return (
    <div className="border-b border-hairline py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "ui-meta-label",
              toneClassName || "text-muted-foreground",
            )}
          >
            {kicker}
          </div>
          <div className="mt-1 text-body-sm font-medium text-foreground">
            {headline}
          </div>
          {detail ? (
            <div
              className={cn(
                "mt-1 ui-meta-text text-muted-foreground",
                detailClassName,
              )}
            >
              {detail}
            </div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? (
        <div className="mt-2 flex flex-wrap gap-2">{children}</div>
      ) : null}
    </div>
  )
}

export function ActivityTab({
  showIdleState,
  isStartingState,
  selectedStagePresentation,
  selectedStageContextLabelClass,
  selectedStageContextLabel,
  selectedStageBranchLabel,
  selectedStageBranchDetail,
  runProgressItems,
  resultReadyLabel,
  onViewResult,
  selectedStageBranchSummary,
  selectedStageResourceLabel,
  selectedStageResourceItems = [],
  onOpenBranchLog,
  budgetWarning,
  budgetWarningClassName,
  onViewStepLog,
  runAttentionNotice,
}: {
  showIdleState: boolean
  isStartingState: boolean
  selectedStagePresentation: RuntimeStagePresentation | null
  selectedStageContextLabelClass: string
  selectedStageContextLabel: string
  selectedStageBranchLabel?: string | null
  selectedStageBranchDetail?: string | null
  runProgressItems: string[]
  resultReadyLabel?: string | null
  onViewResult?: (() => void) | null
  selectedStageBranchSummary?: SummaryBranchAggregate | null
  selectedStageResourceLabel?: string | null
  selectedStageResourceItems?: string[]
  onOpenBranchLog?: ((nodeId: string) => void) | null
  budgetWarning?: string | null
  budgetWarningClassName: string
  onViewStepLog?: (() => void) | null
  runAttentionNotice?: ReactNode
}) {
  if (showIdleState) {
    return (
      <div className="space-y-2 px-1 py-1">
        <div className="ui-meta-text text-muted-foreground">
          No summary yet. Run this flow to review progress, fan-out status, and
          result readiness here.
        </div>
      </div>
    )
  }

  const showStartingPlaceholder =
    isStartingState &&
    !selectedStagePresentation &&
    runProgressItems.length === 0 &&
    !resultReadyLabel &&
    !selectedStageBranchSummary &&
    !runAttentionNotice

  if (showStartingPlaceholder) {
    return (
      <div className="flex items-start gap-3 py-1">
        <Loader2
          size={16}
          className="mt-0.5 shrink-0 animate-spin text-muted-foreground"
        />
        <div className="min-w-0">
          <div className="ui-meta-label text-muted-foreground">Starting</div>
          <div className="mt-1 text-body-sm font-medium text-foreground">
            Preparing your flow
          </div>
          <div className="mt-1 ui-meta-text text-muted-foreground">
            Waiting for the first step to begin.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {selectedStagePresentation && (
        <SelectedStepSummaryPanel
          selectedStagePresentation={selectedStagePresentation}
          selectedStageContextLabelClass={selectedStageContextLabelClass}
          selectedStageContextLabel={selectedStageContextLabel}
          selectedStageBranchLabel={selectedStageBranchLabel}
          selectedStageBranchDetail={selectedStageBranchDetail}
          action={
            onViewStepLog ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-0 py-0 text-body-sm text-muted-foreground hover:text-foreground"
                onClick={onViewStepLog}
              >
                View step log
              </Button>
            ) : null
          }
        />
      )}

      {selectedStageResourceLabel ? (
        <SummaryRow
          kicker="Resource footprint"
          headline={selectedStageResourceLabel}
          detail="Secondary execution detail for this step. Keep verdict and action in the primary surface."
        >
          <div className="w-full">
            <DisclosurePanel
              summary="Show token and runtime details"
              surface="plain"
              contentClassName="px-0 py-2"
              unmountWhenClosed
            >
              <div className="flex flex-wrap gap-2">
                {selectedStageResourceItems.map((item) => (
                  <span
                    key={item}
                    className="ui-status-badge border border-hairline bg-surface-1 text-muted-foreground"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </DisclosurePanel>
          </div>
        </SummaryRow>
      ) : null}

      {runProgressItems.length > 0 || budgetWarning ? (
        <SummaryRow
          kicker="Run progress"
          headline={runProgressItems.join(" · ")}
          detail={budgetWarning}
          detailClassName={budgetWarning ? budgetWarningClassName : undefined}
          toneClassName={budgetWarning ? budgetWarningClassName : undefined}
        />
      ) : null}

      <SummaryRow
        kicker="Result"
        headline={resultReadyLabel ? "Ready to inspect" : "No result yet"}
        detail={
          resultReadyLabel
            ? `${resultReadyLabel}. Open the result surface to inspect or copy the latest result.`
            : "A result link will appear here as soon as the run produces one."
        }
        action={
          resultReadyLabel && onViewResult ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-0 py-0 text-body-sm text-muted-foreground hover:text-foreground"
              onClick={onViewResult}
            >
              View result
            </Button>
          ) : null
        }
      />

      {selectedStageBranchSummary ? (
        <SummaryRow
          kicker="Fan-out"
          headline={formatBranchAggregate(selectedStageBranchSummary)}
          detail="Open any branch below to inspect its step log. The flow tree above remains the owner of branch selection."
        >
          {selectedStageBranchSummary.previews.map((preview) => {
            const content = (
              <>
                <span className="truncate">{preview.label}</span>
                <span className="opacity-70">
                  {formatBranchStatus(preview.status)}
                </span>
              </>
            )

            if (!onOpenBranchLog) {
              return (
                <span
                  key={preview.id}
                  className={cn(
                    "ui-status-badge h-control-xs max-w-full items-center gap-1 px-2 ui-meta-text text-left",
                    branchStatusBadgeClass(preview.status),
                  )}
                  title={preview.detail || preview.label}
                >
                  {content}
                </span>
              )
            }

            return (
              <button
                key={preview.id}
                type="button"
                className={cn(
                  "ui-status-badge h-control-xs max-w-full items-center gap-1 px-2 ui-meta-text text-left ui-transition-colors ui-motion-fast hover:text-foreground",
                  branchStatusBadgeClass(preview.status),
                )}
                title={preview.detail || preview.label}
                onClick={() => onOpenBranchLog(preview.id)}
              >
                {content}
              </button>
            )
          })}
        </SummaryRow>
      ) : null}

      {runAttentionNotice ? (
        <div className="py-4">{runAttentionNotice}</div>
      ) : null}
    </div>
  )
}
