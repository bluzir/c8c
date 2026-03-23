import { FileStack, FileText, Rocket } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatRelativeTime } from "@/components/sidebar/projectSidebarUtils"
import { formatArtifactContractLabel } from "@/lib/workflow-entry"
import type { ArtifactRecord, WorkflowTemplate } from "@shared/types"
import { cn } from "@/lib/cn"

interface ArtifactListRowProps {
  artifact: ArtifactRecord
  artifactCaseLabel?: string | null
  selectedCaseId: string | null
  selected: boolean
  factoryBetaEnabled: boolean
  supportingArtifactCount: number
  matchingTemplates: WorkflowTemplate[]
  onOpenTrack?: (() => void) | null
  onInspect: () => void
  onOpen: () => void
}

export function ArtifactListRow({
  artifact,
  artifactCaseLabel = null,
  selectedCaseId,
  selected,
  factoryBetaEnabled,
  supportingArtifactCount,
  matchingTemplates,
  onOpenTrack = null,
  onInspect,
  onOpen,
}: ArtifactListRowProps) {
  const primaryNextStep = matchingTemplates[0] || null
  const hiddenNextStepCount = Math.max(0, matchingTemplates.length - 1)

  return (
    <article
      className={cn(
        "space-y-3 -mx-3 rounded-xl px-3 py-4",
        selected && "ui-selected-row-tint",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-title-sm text-foreground">{artifact.title}</h3>
            <Badge variant="outline" className="ui-meta-text px-2 py-0">
              {formatArtifactContractLabel(artifact.kind)}
            </Badge>
            {artifactCaseLabel ? (
              <Badge variant="secondary" className="ui-meta-text px-2 py-0">
                {artifactCaseLabel}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-body-sm text-muted-foreground">
            {artifact.description ||
              "Reusable output saved from a previous run."}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 ui-meta-text text-muted-foreground">
            <span>
              {artifact.templateName || artifact.workflowName || "Saved output"}
            </span>
            <span>Updated {formatRelativeTime(artifact.updatedAt)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {factoryBetaEnabled && onOpenTrack ? (
            <Button variant="ghost" size="sm" onClick={onOpenTrack}>
              <Rocket size={14} />
              Track
            </Button>
          ) : null}
          <Button
            variant={selected ? "secondary" : "ghost"}
            size="sm"
            onClick={onInspect}
          >
            <FileText size={14} />
            {selected ? "Inspecting" : "Inspect"}
          </Button>
          <Button variant="outline" size="sm" onClick={onOpen}>
            <FileStack size={14} />
            Open file
          </Button>
        </div>
      </div>

      <div className="mt-3 ui-section-divider">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ui-meta-text text-muted-foreground">
          <span className="ui-meta-label text-muted-foreground">
            Ready next
          </span>
          {primaryNextStep ? (
            <span className="text-foreground">
              {primaryNextStep.name}
              {hiddenNextStepCount > 0 ? ` +${hiddenNextStepCount} more` : ""}
            </span>
          ) : (
            <span>
              {selectedCaseId
                ? "No next steps ready from this track yet"
                : "No next steps ready from this result yet"}
            </span>
          )}
          {supportingArtifactCount > 1 ? (
            <span>
              {supportingArtifactCount} related result
              {supportingArtifactCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  )
}
