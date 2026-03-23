import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ProcessSpine } from "@/components/ui/process-spine"
import type { WorkflowTemplate } from "@/lib/store"
import { deriveTemplateExecutionDisciplineLabels } from "@/lib/workflow-entry"
import {
  getTemplateSourceKind,
  getTemplateSourceLabel,
} from "@/lib/template-source"
import type { GuidedTemplateEntryContract } from "@/lib/entry-state-contracts"
import type { CreateRoutingPreview } from "@/lib/create-routing-preview"

export function TemplateDetailPanel({
  entry,
  routingPreview,
  onUse,
  disabled,
  onClose,
}: {
  entry: GuidedTemplateEntryContract
  routingPreview?: Pick<
    CreateRoutingPreview,
    "helpModeLabel" | "stageLabel" | "stages"
  > | null
  onUse: (template: WorkflowTemplate) => void
  disabled?: boolean
  onClose: () => void
}) {
  const template = entry.template
  const sourceKind = getTemplateSourceKind(template)
  const sourceLabel = getTemplateSourceLabel(template)
  const disciplineLabels = deriveTemplateExecutionDisciplineLabels(template)
  const executionSummary =
    template.executionPolicy?.summary?.trim() ||
    (disciplineLabels.length > 0 ? disciplineLabels.join(", ") : null)
  const executionDescription =
    template.executionPolicy?.description?.trim() || null
  const showsRoutingPreview =
    Boolean(routingPreview?.helpModeLabel) ||
    Boolean(routingPreview?.stageLabel) ||
    Boolean(routingPreview?.stages.length)

  return (
    <aside className="w-full lg:w-[22rem] lg:max-h-[calc(100vh-var(--titlebar-height)-6rem)] lg:self-start lg:sticky lg:top-0 flex-shrink-0 overflow-hidden rounded-lg border border-hairline bg-surface-1 flex flex-col">
      <header className="border-b border-border px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-xl leading-none" aria-hidden>
            {template.emoji}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-body-md font-semibold text-foreground">
                {entry.jobLabel}
              </h3>
              {entry.entryKind === "guided" ? (
                <Badge variant="outline" size="compact">
                  Guided
                </Badge>
              ) : null}
            </div>
            <p className="ui-meta-text mt-1 text-muted-foreground">
              {entry.jobSummary || template.headline}
            </p>
            {template.description && (
              <p className="mt-2 text-body-sm text-muted-foreground">
                {template.description}
              </p>
            )}
            {(sourceKind === "plugin" ||
              sourceKind === "user" ||
              sourceKind === "hub") && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="secondary" size="compact">
                  {sourceLabel}
                </Badge>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="ui-icon-button shrink-0"
            aria-label="Close details"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="border-b border-border px-4 py-3 space-y-3">
        <div>
          <span className="ui-meta-label text-muted-foreground">
            Use this when
          </span>
          <p className="mt-1 text-body-sm">{entry.useWhen}</p>
        </div>
        <div>
          <span className="ui-meta-label text-muted-foreground">
            You provide
          </span>
          <p className="mt-1 text-body-sm">{entry.youProvide}</p>
        </div>
        <div>
          <span className="ui-meta-label text-muted-foreground">
            You get first
          </span>
          <p className="mt-1 text-body-sm">{entry.youGetFirst}</p>
        </div>
        {entry.entryKind === "guided" &&
        entry.stagePathLabel &&
        !showsRoutingPreview ? (
          <div>
            <span className="ui-meta-label text-muted-foreground">
              Stage path
            </span>
            <p className="mt-1 text-body-sm">{entry.stagePathLabel}</p>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto ui-scroll-region px-4 py-4">
        <div className="space-y-4">
          {(routingPreview?.helpModeLabel ||
            routingPreview?.stageLabel ||
            executionSummary ||
            executionDescription ||
            (routingPreview?.stages.length ?? 0) > 0) && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                {routingPreview?.helpModeLabel ? (
                  <div>
                    <span className="ui-meta-label text-muted-foreground">
                      Intent
                    </span>
                    <p className="mt-1 text-body-sm text-foreground">
                      {routingPreview.helpModeLabel}
                    </p>
                  </div>
                ) : null}
                {routingPreview?.stageLabel ? (
                  <div>
                    <span className="ui-meta-label text-muted-foreground">
                      Starts in
                    </span>
                    <p className="mt-1 text-body-sm text-foreground">
                      {routingPreview.stageLabel}
                    </p>
                  </div>
                ) : null}
                {(executionSummary || executionDescription) && (
                  <div>
                    <span className="ui-meta-label text-muted-foreground">
                      Flow rules
                    </span>
                    {executionSummary ? (
                      <p className="mt-1 text-body-sm text-foreground">
                        {executionSummary}
                      </p>
                    ) : null}
                    {executionDescription &&
                    executionDescription !== executionSummary ? (
                      <p className="mt-2 text-body-sm text-muted-foreground">
                        {executionDescription}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
              {routingPreview?.stages.length ? (
                <div className="space-y-1">
                  <span className="ui-meta-label text-muted-foreground">
                    Steps
                  </span>
                  <ProcessSpine stages={routingPreview.stages} />
                </div>
              ) : null}
            </div>
          )}

          {template.how ? (
            <div className="ui-section-divider pt-4">
              <span className="ui-meta-label text-muted-foreground">
                How this flow works
              </span>
              <p className="mt-2 text-body-sm text-muted-foreground">
                {template.how}
              </p>
            </div>
          ) : null}

          <div className="ui-section-divider pt-4">
            <span className="ui-meta-label text-muted-foreground">
              Inside this flow
            </span>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-body-sm text-muted-foreground">
              {template.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </div>

          {(sourceKind === "plugin" ||
            sourceKind === "user" ||
            sourceKind === "hub") && (
            <div className="ui-section-divider pt-4">
              <span className="ui-meta-label text-muted-foreground">
                Source
              </span>
              <p className="mt-1 text-body-sm">
                {sourceLabel}
                {template.marketplaceName
                  ? ` via ${template.marketplaceName}`
                  : ""}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border px-4 py-3">
        <Button
          size="sm"
          onClick={() => onUse(template)}
          disabled={disabled}
          className="w-full"
        >
          {entry.primaryActionLabel}
        </Button>
      </div>
    </aside>
  )
}
