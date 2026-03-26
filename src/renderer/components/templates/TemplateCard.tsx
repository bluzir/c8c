import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/cn"
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
      className={cn(
        "ui-interactive-card-subtle w-full !items-start !justify-start gap-3 rounded-lg p-4 text-left !whitespace-normal",
        isSelected && "ui-selected-row-tint",
      )}
    >
      <span className="text-xl flex-shrink-0 mt-0.5" aria-hidden="true">
        {template.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-title-sm">{entry.jobLabel}</h3>
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
      </div>
    </Button>
  )
}
