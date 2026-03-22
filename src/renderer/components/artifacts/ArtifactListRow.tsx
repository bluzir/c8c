import type { ReactNode } from "react"
import { ArrowUpRight, FileStack, FileText, Loader2, Play, Rocket } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatRelativeTime } from "@/components/sidebar/projectSidebarUtils"
import {
  deriveTemplateExecutionDisciplineLabels,
  deriveTemplateJourneyStageLabel,
  formatArtifactContractLabel,
} from "@/lib/workflow-entry"
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
  launchingTemplateId: string | null
  onOpenTrack?: (() => void) | null
  onInspect: () => void
  onReveal: () => void
  onOpen: () => void
  onLaunchTemplate: (template: WorkflowTemplate) => void
  detailPanel?: ReactNode
}

export function ArtifactListRow({
  artifact,
  artifactCaseLabel = null,
  selectedCaseId,
  selected,
  factoryBetaEnabled,
  supportingArtifactCount,
  matchingTemplates,
  launchingTemplateId,
  onOpenTrack = null,
  onInspect,
  onReveal,
  onOpen,
  onLaunchTemplate,
  detailPanel = null,
}: ArtifactListRowProps) {
  return (
    <article className={cn("px-4 py-4", selected && "bg-surface-2/30")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-title-sm text-foreground">{artifact.title}</h2>
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
            {artifact.description || "Reusable output saved from a previous run."}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 ui-meta-text text-muted-foreground">
            <span>{artifact.templateName || artifact.workflowName || "Saved output"}</span>
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
          <Button variant="ghost" size="sm" onClick={onReveal}>
            <ArrowUpRight size={14} />
            Reveal
          </Button>
          <Button variant="outline" size="sm" onClick={onOpen}>
            <FileStack size={14} />
            Open
          </Button>
        </div>
      </div>

      <div className="mt-3 border-t border-hairline/70 pt-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="ui-meta-label text-muted-foreground">Ready next steps</div>
            <p className="mt-1 text-body-sm text-muted-foreground">
              {selectedCaseId
                ? "Steps whose requirements are already satisfied by this track."
                : "Steps whose requirements are already satisfied by this project."}
            </p>
          </div>
          {supportingArtifactCount > 1 ? (
            <span className="ui-meta-text text-muted-foreground">
              {supportingArtifactCount} supporting artifact{supportingArtifactCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        {matchingTemplates.length === 0 ? (
          <div className="mt-2 text-body-sm text-muted-foreground">
            No next steps are ready from this artifact alone yet.
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {matchingTemplates.map((template) => {
              const disciplineLabels = deriveTemplateExecutionDisciplineLabels(template)
              const stageLabel = deriveTemplateJourneyStageLabel(template)
              const isLaunching = launchingTemplateId === template.id
              return (
                <div
                  key={`${artifact.id}-${template.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-hairline/70 bg-surface-1/40 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="ui-body-text-medium text-foreground">{template.name}</div>
                      {template.pack ? (
                        <Badge variant="outline" className="ui-meta-text px-2 py-0">
                          {template.pack.label}
                        </Badge>
                      ) : null}
                      {stageLabel ? (
                        <Badge variant="secondary" className="ui-meta-text px-2 py-0">
                          {stageLabel}
                        </Badge>
                      ) : null}
                    </div>
                    {disciplineLabels.length > 0 ? (
                      <p className="mt-1 text-body-sm text-muted-foreground">
                        {disciplineLabels.join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => onLaunchTemplate(template)}
                    disabled={Boolean(launchingTemplateId)}
                  >
                    {isLaunching ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                    {isLaunching ? "Opening..." : "Open step"}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {detailPanel ? <div className="mt-4">{detailPanel}</div> : null}
    </article>
  )
}
