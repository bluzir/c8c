import type { ReactNode } from "react"

import { cn } from "@/lib/cn"
import type { RuntimeStagePresentation } from "@/lib/runtime-flow-labels"

function compactLine(items: Array<string | null | undefined>) {
  return items
    .filter((item): item is string => Boolean(item && item.trim()))
    .join(" · ")
}

function buildStageMetaLine({
  presentation,
  branchLabel,
}: {
  presentation: RuntimeStagePresentation
  branchLabel?: string | null
}) {
  return compactLine([
    branchLabel ? `Branch: ${branchLabel}` : null,
    `${presentation.outcomeLabel} ${presentation.artifactLabel}`,
  ])
}

function StepSummaryStrip({
  contextLabelClass,
  contextLabel,
  title,
  metaLine,
  branchLabel,
  detail,
  action,
  secondaryContent,
}: {
  contextLabelClass: string
  contextLabel: string
  title: string
  metaLine: string
  branchLabel?: string | null
  detail?: string | null
  action?: ReactNode
  secondaryContent?: ReactNode
}) {
  return (
    <div className="border-b border-hairline px-1 py-3 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className={cn("ui-meta-label", contextLabelClass)}>
            {contextLabel}
          </div>
          <div className="mt-1 text-body-sm font-medium text-foreground">
            {title}
          </div>
          <div className="mt-1 ui-meta-text text-muted-foreground">
            {metaLine}
          </div>
          {detail ? (
            <p className="mt-1 ui-meta-text text-muted-foreground">{detail}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {secondaryContent ? <div className="mt-2">{secondaryContent}</div> : null}
    </div>
  )
}

export function SelectedStepSummaryPanel({
  selectedStagePresentation,
  selectedStageContextLabelClass,
  selectedStageContextLabel,
  selectedStageBranchLabel,
  selectedStageBranchDetail,
  action,
  secondaryContent,
}: {
  selectedStagePresentation: RuntimeStagePresentation | null
  selectedStageContextLabelClass: string
  selectedStageContextLabel: string
  selectedStageBranchLabel?: string | null
  selectedStageBranchDetail?: string | null
  action?: ReactNode
  secondaryContent?: ReactNode
}) {
  if (!selectedStagePresentation) return null

  return (
    <StepSummaryStrip
      contextLabelClass={selectedStageContextLabelClass}
      contextLabel={selectedStageContextLabel}
      title={selectedStagePresentation.title}
      metaLine={buildStageMetaLine({
        presentation: selectedStagePresentation,
        branchLabel: selectedStageBranchLabel,
      })}
      branchLabel={selectedStageBranchLabel}
      detail={selectedStageBranchDetail || null}
      action={action}
      secondaryContent={secondaryContent}
    />
  )
}
