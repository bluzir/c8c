import { Badge } from "@/components/ui/badge"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import { cn } from "@/lib/cn"
import type {
  ExecutionLoopOutcome,
  ExecutionLoopSummary,
} from "@/lib/execution-loops"
import {
  CheckCircle2,
  Gauge,
  RefreshCcw,
  ShieldAlert,
  TimerReset,
} from "lucide-react"

function resolveLoopOutcomePresentation(outcome: ExecutionLoopOutcome) {
  switch (outcome) {
    case "auto-pass":
      return {
        Icon: CheckCircle2,
        badgeVariant: "success" as const,
        iconToneClass: "text-status-success surface-success-soft",
        headline: "Check passed",
        nextAction: "Continue",
      }
    case "human decision":
      return {
        Icon: ShieldAlert,
        badgeVariant: "warning" as const,
        iconToneClass: "text-status-warning surface-warning-soft",
        headline: "Decision required",
        nextAction: "Approve or reject",
      }
    case "retry cap reached":
      return {
        Icon: TimerReset,
        badgeVariant: "warning" as const,
        iconToneClass: "text-status-warning surface-warning-soft",
        headline: "Retry limit hit",
        nextAction: "Decide manually",
      }
    default:
      return {
        Icon: RefreshCcw,
        badgeVariant: "info" as const,
        iconToneClass: "text-status-info surface-info-soft",
        headline: "Returning with fixes",
        nextAction: "Auto return",
      }
  }
}

export function ExecutionLoopCard({
  summary,
  className,
  detailSummary = "Loop details",
  compact = false,
  surface = "card",
}: {
  summary: ExecutionLoopSummary | null
  className?: string
  detailSummary?: string
  compact?: boolean
  surface?: "card" | "flat"
}) {
  if (!summary) return null

  const outcome = resolveLoopOutcomePresentation(summary.outcome)
  const scoreVariant =
    summary.score >= summary.threshold ? "success" : "warning"
  const scoreGap = Math.max(summary.threshold - summary.score, 0)
  const criteriaCount = summary.criteriaBreakdown?.length || 0
  const compactDetail = summary.fixInstructions || summary.reason
  const flatSurface = surface === "flat"

  return (
    <div
      className={cn(
        flatSurface ? "px-0.5 py-1.5" : "ui-inset-well px-3 py-2.5",
        compact && !flatSurface && "px-2.5 py-2",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                outcome.iconToneClass,
              )}
            >
              <outcome.Icon size={13} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="ui-meta-label text-muted-foreground">
                  {summary.loopLabel}
                </span>
                <span className="text-body-sm font-medium text-foreground">
                  {summary.title}
                </span>
              </div>
              {!compact && (
                <div className="mt-0.5 text-body-sm font-medium text-foreground">
                  {outcome.headline}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="ui-badge-row">
          <Badge variant={outcome.badgeVariant} size="compact">
            {summary.outcomeLabel}
          </Badge>
          <Badge variant={scoreVariant} size="compact">
            <Gauge size={11} />
            {summary.score}/10
          </Badge>
          <Badge variant="outline" size="compact">
            Bar {summary.threshold}/10
          </Badge>
          <Badge variant="outline" size="compact">
            Loop {summary.attempt}/{summary.maxAttempts}
          </Badge>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge variant={outcome.badgeVariant} size="compact">
          {outcome.nextAction}
        </Badge>
        {summary.failedCriteriaCount > 0 && (
          <Badge variant="warning" size="compact">
            {summary.failedCriteriaCount} below bar
          </Badge>
        )}
        {summary.deltaLabel && (
          <Badge variant="outline" size="compact">
            {summary.deltaLabel}
          </Badge>
        )}
        {scoreGap > 0 && (
          <Badge variant="outline" size="compact">
            -{scoreGap} to pass
          </Badge>
        )}
      </div>

      {compact && compactDetail && (
        <p className="mt-2 line-clamp-2 ui-meta-text text-muted-foreground">
          {compactDetail}
        </p>
      )}

      {(summary.reason || summary.fixInstructions || criteriaCount > 0) && (
        <DisclosurePanel
          summary={detailSummary}
          surface={flatSurface ? "flat" : "plain"}
          className={cn("mt-2", !flatSurface && "border-0 bg-transparent")}
          summaryClassName={cn("py-1.5", !flatSurface && "px-0")}
          contentClassName="space-y-2.5"
        >
          {summary.reason && (
            <div>
              <p className="ui-meta-label text-muted-foreground">Why</p>
              <p className="mt-1 text-body-sm text-foreground whitespace-pre-wrap">
                {summary.reason}
              </p>
            </div>
          )}
          {summary.fixInstructions && (
            <div>
              <p className="ui-meta-label text-muted-foreground">Fix next</p>
              <p className="mt-1 text-body-sm text-foreground whitespace-pre-wrap">
                {summary.fixInstructions}
              </p>
            </div>
          )}
          {summary.criteriaBreakdown &&
            summary.criteriaBreakdown.length > 0 && (
              <div className="space-y-1.5">
                <p className="ui-meta-label text-muted-foreground">Checks</p>
                <div className="space-y-1">
                  {summary.criteriaBreakdown.map((criterion) => (
                    <div
                      key={`${criterion.id}-${criterion.score}`}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-md border border-hairline px-2.5 py-1.5 text-body-sm",
                        flatSurface ? "bg-transparent" : "bg-surface-2/45",
                      )}
                    >
                      <span className="min-w-0 truncate text-foreground">
                        {criterion.id}
                      </span>
                      <Badge
                        variant={
                          criterion.score >= summary.threshold
                            ? "success"
                            : "warning"
                        }
                        size="compact"
                      >
                        {criterion.score}/10
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </DisclosurePanel>
      )}
    </div>
  )
}
