import { ArrowUpRight, FileStack, FileText, Loader2, X } from "lucide-react"
import ReactMarkdown from "react-markdown"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import { ScopeBanner } from "@/components/ui/scope-banner"
import { SummaryRail } from "@/components/ui/summary-rail"
import { cn } from "@/lib/cn"
import { DEFAULT_MARKDOWN_PROPS } from "@/lib/markdown"
import { deriveArtifactInspectSummary } from "@/lib/artifact-inspect"
import { deriveTemplateExecutionDisciplineLabels, deriveTemplateJourneyStageLabel, formatArtifactContractLabel } from "@/lib/workflow-entry"
import type { ArtifactRecord, CaseStateRecord, WorkflowTemplate } from "@shared/types"

export function ArtifactInspectPanel({
  artifact,
  caseState,
  relatedArtifacts,
  matchingTemplates,
  loading,
  content,
  truncated,
  error,
  launchingTemplateId,
  onLaunchTemplate,
  onRevealArtifact,
  onOpenArtifact,
  onClearSelection,
}: {
  artifact: ArtifactRecord
  caseState?: CaseStateRecord | null
  relatedArtifacts: ArtifactRecord[]
  matchingTemplates: WorkflowTemplate[]
  loading: boolean
  content: string
  truncated: boolean
  error: string | null
  launchingTemplateId: string | null
  onLaunchTemplate: (template: WorkflowTemplate, sourceArtifacts: ArtifactRecord[]) => Promise<void> | void
  onRevealArtifact: (artifact: ArtifactRecord) => Promise<void> | void
  onOpenArtifact: (artifact: ArtifactRecord) => Promise<void> | void
  onClearSelection: () => void
}) {
  const inspectSummary = deriveArtifactInspectSummary({
    artifact,
    caseState,
    relatedArtifacts,
    matchingTemplates,
  })

  return (
    <section data-artifact-inspect-panel="true" className="rounded-xl surface-panel p-4 space-y-4 ui-fade-slide-in">
      <ScopeBanner
        tone="muted"
        eyebrow={(
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="ui-meta-text px-2 py-0">
              Saved result
            </Badge>
            <Badge variant="outline" className="ui-meta-text px-2 py-0">
              {formatArtifactContractLabel(artifact.kind)}
            </Badge>
            {artifact.caseLabel ? (
              <Badge variant="secondary" className="ui-meta-text px-2 py-0">
                {artifact.caseLabel}
              </Badge>
            ) : null}
          </div>
        )}
        title={artifact.title}
        description={inspectSummary.statusText}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={onClearSelection}>
              <X size={14} />
              Hide inspect
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { void onRevealArtifact(artifact) }}>
              <ArrowUpRight size={14} />
              Reveal
            </Button>
            <Button variant="outline" size="sm" onClick={() => { void onOpenArtifact(artifact) }}>
              <FileStack size={14} />
              Open file
            </Button>
          </div>
        )}
      >
        <div className="space-y-3">
          {artifact.description ? (
            <p className="text-body-sm text-muted-foreground">{artifact.description}</p>
          ) : null}
          <SummaryRail
            items={[
              { label: "Saved from", value: inspectSummary.savedFromText },
              ...(inspectSummary.latestCheckText
                ? [{ label: "Latest check", value: inspectSummary.latestCheckText }]
                : []),
              { label: "Built from", value: inspectSummary.sourceText },
              { label: "Ready next", value: inspectSummary.readyNextText },
            ]}
            className={inspectSummary.latestCheckText ? "xl:grid-cols-4" : "xl:grid-cols-3"}
            compact
          />
        </div>
      </ScopeBanner>

      {matchingTemplates.length > 0 ? (
        <div className="space-y-2">
          <div className="ui-meta-label text-muted-foreground">Ready next steps</div>
          <div className="space-y-2">
            {matchingTemplates.slice(0, 3).map((template) => {
              const stageLabel = deriveTemplateJourneyStageLabel(template)
              const disciplineLabels = deriveTemplateExecutionDisciplineLabels(template)
              const isLaunching = launchingTemplateId === template.id

              return (
                <div key={`${artifact.id}-${template.id}`} className="rounded-lg surface-inset-card px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-body-sm font-medium text-foreground">{template.name}</div>
                        {stageLabel ? (
                          <Badge variant="secondary" className="ui-meta-text px-2 py-0">
                            {stageLabel}
                          </Badge>
                        ) : null}
                      </div>
                      {disciplineLabels.length > 0 ? (
                        <div className="mt-1 text-body-sm text-muted-foreground">
                          {disciplineLabels.join(" · ")}
                        </div>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      disabled={Boolean(launchingTemplateId)}
                      onClick={() => { void onLaunchTemplate(template, relatedArtifacts) }}
                    >
                      {isLaunching ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpRight size={14} />}
                      {isLaunching ? "Opening..." : "Open step"}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <DisclosurePanel
        summary={(
          <span className="flex items-center gap-2">
            <FileText size={14} />
            Result preview
          </span>
        )}
        className="border border-hairline bg-surface-1/70"
        contentClassName="space-y-3"
        defaultOpen
      >
        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-hairline bg-surface-2/40 px-4 py-6 text-body-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            Loading saved result preview...
          </div>
        ) : error ? (
          <div role="alert" className="rounded-lg border border-status-danger/25 bg-status-danger/5 px-4 py-3 text-body-sm text-status-danger">
            {error}
          </div>
        ) : content ? (
          <div className={cn("max-h-[420px] overflow-y-auto rounded-lg border border-hairline bg-surface-1 px-4 py-4", "prose-c8c")}>
            <ReactMarkdown {...DEFAULT_MARKDOWN_PROPS}>
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-hairline bg-surface-2/40 px-4 py-6 text-body-sm text-muted-foreground">
            This saved result has no text preview.
          </div>
        )}
        {truncated ? (
          <p className="ui-meta-text text-muted-foreground">
            Preview trimmed to the first 100 KB.
          </p>
        ) : null}
      </DisclosurePanel>
    </section>
  )
}
