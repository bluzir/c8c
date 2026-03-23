import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { WorkflowTemplate } from "@/lib/store"
import { deriveTemplateCardCopy } from "@/lib/workflow-entry"
import {
  getTemplateSourceKind,
  getTemplateSourceLabel,
} from "@/lib/template-source"
import type { GuidedTemplateEntryContract } from "@/lib/entry-state-contracts"

export function TemplateCard({
  entry,
  isSelected,
  onSelect,
}: {
  entry: GuidedTemplateEntryContract
  isSelected: boolean
  onSelect: (template: WorkflowTemplate) => void
}) {
  const template = entry.template
  const sourceKind = getTemplateSourceKind(template)

  return (
    <Button
      type="button"
      variant="ghost"
      size="bare"
      onClick={() => onSelect(template)}
      className={`w-full !items-start !justify-start gap-3 rounded-lg border border-hairline bg-transparent p-4 text-left !whitespace-normal ui-transition-colors ui-motion-fast ${
        isSelected
          ? "border-transparent bg-surface-2/70 text-foreground"
          : "text-foreground hover:bg-surface-2/35"
      }`}
    >
      <span className="text-xl flex-shrink-0 mt-0.5" aria-hidden>
        {template.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-body-md font-semibold">{entry.jobLabel}</h3>
          {entry.entryKind === "guided" ? (
            <Badge variant="outline" size="compact">
              Guided
            </Badge>
          ) : null}
          {(sourceKind === "plugin" ||
            sourceKind === "user" ||
            sourceKind === "hub") && (
            <Badge variant="secondary" size="compact">
              {getTemplateSourceLabel(template)}
            </Badge>
          )}
        </div>
        <p className="text-body-sm text-muted-foreground mt-1 line-clamp-2">
          {entry.jobSummary || deriveTemplateCardCopy(template)}
        </p>
        {entry.entryKind === "guided" ? (
          <dl className="mt-3 space-y-2 text-sidebar-meta">
            <div>
              <dt className="ui-meta-label text-muted-foreground">
                Use this when
              </dt>
              <dd className="mt-0.5 text-body-sm text-foreground">
                {entry.useWhen}
              </dd>
            </div>
            <div>
              <dt className="ui-meta-label text-muted-foreground">
                You provide
              </dt>
              <dd className="mt-0.5 text-body-sm text-foreground">
                {entry.youProvide}
              </dd>
            </div>
            <div>
              <dt className="ui-meta-label text-muted-foreground">
                You get first
              </dt>
              <dd className="mt-0.5 text-body-sm text-foreground">
                {entry.youGetFirst}
              </dd>
            </div>
            {entry.stagePathLabel ? (
              <div>
                <dt className="ui-meta-label text-muted-foreground">Path</dt>
                <dd className="mt-0.5 text-body-sm text-foreground">
                  {entry.stagePathLabel}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>
    </Button>
  )
}
