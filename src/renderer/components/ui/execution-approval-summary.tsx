import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import { cn } from "@/lib/cn"

interface ExecutionApprovalSummaryProps {
  flowName: string
  stepName: string
  stepKind?: string | null
  stepDescription?: string | null
  expectedResult: string
  inputPreview?: string | null
  inputLabels?: string[]
  approveLabel?: string
  approveConsequence: string
  rejectLabel?: string
  rejectConsequence: string
  topBadges?: ReactNode
  className?: string
}

function collapseText(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ")
}

export function ExecutionApprovalSummary({
  flowName,
  stepName,
  stepKind = null,
  stepDescription = null,
  expectedResult,
  inputPreview = null,
  inputLabels = [],
  approveLabel = "Approve",
  approveConsequence,
  rejectLabel = "Reject",
  rejectConsequence,
  topBadges = null,
  className,
}: ExecutionApprovalSummaryProps) {
  const compactDescription = collapseText(stepDescription)
  const previewText = inputPreview?.trim() || null
  const hasTopBadges = Boolean(topBadges)
  const hasRunContext = inputLabels.length > 0 || Boolean(previewText)

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="ui-meta-label text-muted-foreground">Flow</p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="min-w-0 truncate text-body-sm font-medium text-foreground">
              {flowName}
            </span>
            {stepKind ? (
              <Badge variant="outline" size="compact">
                {stepKind}
              </Badge>
            ) : null}
          </div>
        </div>
        {hasTopBadges ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {topBadges}
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 ui-section-divider md:grid-cols-3">
        <div className="space-y-1">
          <div className="ui-meta-label text-muted-foreground">This step</div>
          <div className="text-body-sm font-medium text-foreground">
            {stepName}
          </div>
          {compactDescription ? (
            <div className="line-clamp-2 ui-meta-text text-muted-foreground">
              {compactDescription}
            </div>
          ) : null}
        </div>
        <div className="space-y-1">
          <div className="ui-meta-label text-status-success">
            {approveLabel}
          </div>
          <div className="text-body-sm font-medium text-foreground">
            {approveConsequence}
          </div>
        </div>
        <div className="space-y-1">
          <div className="ui-meta-label text-muted-foreground">
            Expected result
          </div>
          <div className="text-body-sm font-medium text-foreground">
            {expectedResult}
          </div>
        </div>
      </div>

      {hasRunContext ? (
        <DisclosurePanel
          summary="What will run"
          surface="plain"
          summaryClassName="px-0 py-1.5"
          contentClassName="space-y-3 pt-2"
          unmountWhenClosed
        >
          <div className="space-y-1">
            <div className="ui-meta-label text-muted-foreground">Runs with</div>
            {inputLabels.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {inputLabels.map((label) => (
                  <Badge
                    key={label}
                    variant="outline"
                    className="ui-meta-text px-2 py-0"
                  >
                    {label}
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="ui-meta-text text-muted-foreground">
                Current input
              </div>
            )}
          </div>

          {previewText ? (
            <div className="space-y-1">
              <div className="ui-meta-label text-muted-foreground">
                Input preview
              </div>
              <div className="line-clamp-4 whitespace-pre-wrap text-body-sm text-foreground">
                {previewText}
              </div>
            </div>
          ) : null}
        </DisclosurePanel>
      ) : null}

      <details className="group text-body-sm">
        <summary className="cursor-pointer select-none ui-meta-label text-muted-foreground hover:text-foreground ui-transition-colors ui-motion-fast">
          What happens on reject?
        </summary>
        <div className="mt-1 space-y-1">
          <div className="ui-meta-label text-status-danger">{rejectLabel}</div>
          <div className="text-body-sm font-medium text-foreground">
            {rejectConsequence}
          </div>
        </div>
      </details>
    </section>
  )
}
