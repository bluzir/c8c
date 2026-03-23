import { Button } from "@/components/ui/button"
import type { WorkflowTemplate } from "@shared/types"
import { ProcessSpine } from "@/components/ui/process-spine"
import type { ProcessSpineStage } from "@/lib/process-spine"
import { getWorkflowTemplateDisplayName } from "@/lib/template-display"
import { deriveTemplateCardCopy } from "@/lib/workflow-entry"

export function TemplateSuggestionCard({
  template,
  onSelect,
  title,
  summary,
  eyebrow,
  recommended = false,
}: {
  template: WorkflowTemplate
  onSelect: (template: WorkflowTemplate) => void
  title?: string
  summary?: string
  eyebrow?: string
  recommended?: boolean
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="bare"
      onClick={() => onSelect(template)}
      className="h-auto w-full !items-start gap-3 rounded-xl px-2 py-2 text-left !whitespace-normal ui-transition-colors ui-motion-fast hover:bg-surface-2/45"
    >
      <span className="mt-0.5 text-base leading-none" aria-hidden>
        {template.emoji}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        {eyebrow || recommended ? (
          <div className="flex flex-wrap items-center gap-1.5 text-body-xs text-muted-foreground">
            {eyebrow ? <span>{eyebrow}</span> : null}
            {eyebrow && recommended ? <span aria-hidden>•</span> : null}
            {recommended ? <span>Suggested</span> : null}
          </div>
        ) : null}
        <p className="text-body-sm font-medium text-foreground">
          {title || getWorkflowTemplateDisplayName(template)}
        </p>
        <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">
          {summary || template.headline || deriveTemplateCardCopy(template)}
        </p>
      </div>
    </Button>
  )
}

export function PendingTemplateDetails({
  intentLabel,
  startStageLabel,
  executionSummary,
  processStages,
}: {
  intentLabel: string | null
  startStageLabel: string | null
  executionSummary: string | null
  processStages?: ProcessSpineStage[] | null
}) {
  if (
    !intentLabel &&
    !startStageLabel &&
    !executionSummary &&
    (!processStages || processStages.length === 0)
  ) {
    return null
  }

  return (
    <div className="space-y-3 ui-section-divider pt-4">
      <div className="flex flex-wrap gap-3">
        {intentLabel ? (
          <div className="space-y-1">
            <p className="ui-meta-text text-muted-foreground">Path</p>
            <p className="text-body-sm text-foreground">{intentLabel}</p>
          </div>
        ) : null}
        {startStageLabel ? (
          <div className="space-y-1">
            <p className="ui-meta-text text-muted-foreground">First step</p>
            <p className="text-body-sm text-foreground">{startStageLabel}</p>
          </div>
        ) : null}
        {executionSummary ? (
          <div className="space-y-1">
            <p className="ui-meta-text text-muted-foreground">Flow rules</p>
            <p className="text-body-sm text-foreground">{executionSummary}</p>
          </div>
        ) : null}
      </div>
      {processStages && processStages.length > 0 ? (
        <div className="space-y-1">
          <p className="ui-meta-text text-muted-foreground">Steps</p>
          <ProcessSpine stages={processStages} />
        </div>
      ) : null}
    </div>
  )
}
