import { ArrowUpRight, FileStack, Inbox, Loader2, Rocket } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SectionHeading } from "@/components/ui/page-shell"
import { formatRelativeTime } from "@/components/sidebar/projectSidebarUtils"
import { cn } from "@/lib/cn"
import { formatElapsedTime } from "@/lib/run-progress"
import {
  deriveBlockedTaskLatestResultText,
  deriveBlockedTaskReasonText,
  deriveBlockedTaskStatusText,
} from "@/lib/workflow-blocked-copy"
import {
  deriveTemplateExecutionDisciplineLabels,
  deriveTemplateJourneyStageLabel,
  formatArtifactContractLabel,
} from "@/lib/workflow-entry"
import type {
  ArtifactRecord,
  HumanTaskSummary,
  WorkflowTemplate,
} from "@shared/types"
import {
  cardToneClass,
  factoryCaseStatusLabel,
  factoryPrimaryActionButtonLabel,
  factoryCaseStatusTone,
  type FactoryCase,
  type FactoryCaseSummary,
} from "@/components/factory/factory-page-helpers"

interface CaseDetailProps {
  selectedCase: FactoryCase
  selectedCaseSummary: FactoryCaseSummary | null
  launchingTemplateId: string | null
  onLaunchTemplate: (
    template: WorkflowTemplate,
    artifacts: ArtifactRecord[],
  ) => Promise<void> | void
  onOpenArtifact: (artifact: ArtifactRecord) => Promise<void> | void
  onOpenCaseArtifacts: (caseId: string) => void
  onOpenInboxTask: (task: HumanTaskSummary, caseId?: string) => void
  onOpenReport: (reportPath: string | null) => Promise<void> | void
  onOpenWorkflow: (workflowPath: string | null) => Promise<void> | void
}

function fieldToneClass(tone?: FactoryCaseSummary["fields"][number]["tone"]) {
  if (tone === "warning") return "text-status-warning"
  if (tone === "info") return "text-status-info"
  if (tone === "success") return "text-status-success"
  return "text-foreground"
}

function CaseSummaryFieldList({
  fields,
}: {
  fields: FactoryCaseSummary["fields"]
}) {
  return (
    <div className="ui-slab space-y-3">
      {fields.map((field, index) => (
        <div
          key={`${field.label}:${field.value}`}
          className={cn(
            "flex flex-wrap items-start justify-between gap-3",
            index > 0 && "ui-section-divider",
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="ui-meta-label text-muted-foreground">
              {field.label}
            </div>
            {field.hint ? (
              <div className="mt-1 ui-meta-text text-muted-foreground">
                {field.hint}
              </div>
            ) : null}
          </div>
          <div
            className={cn(
              "text-body-sm font-medium",
              fieldToneClass(field.tone),
            )}
          >
            {field.value}
          </div>
        </div>
      ))}
    </div>
  )
}

export function CaseDetail({
  selectedCase,
  selectedCaseSummary,
  launchingTemplateId,
  onLaunchTemplate,
  onOpenArtifact,
  onOpenCaseArtifacts,
  onOpenInboxTask,
  onOpenReport,
  onOpenWorkflow,
}: CaseDetailProps) {
  const primaryAction = selectedCaseSummary?.primaryAction || null

  return (
    <section
      data-factory-case-shell="true"
      className="surface-figure p-5 ui-fade-slide-in"
    >
      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[1.25fr,0.75fr]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-title-md font-semibold text-foreground">
                  {selectedCase.label}
                </h2>
                <span
                  className={cn(
                    "ui-status-badge ui-meta-text",
                    cardToneClass(factoryCaseStatusTone(selectedCase.status)),
                  )}
                >
                  {factoryCaseStatusLabel(selectedCase.status)}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {selectedCase.lineageLabels.map((label) => (
                  <Badge
                    key={`${selectedCase.id}-${label}`}
                    variant="secondary"
                    className="ui-meta-text px-2 py-0"
                  >
                    {label}
                  </Badge>
                ))}
                {selectedCase.nextStepLabel ? (
                  <Badge variant="outline" className="ui-meta-text px-2 py-0">
                    Next: {selectedCase.nextStepLabel}
                  </Badge>
                ) : null}
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenCaseArtifacts(selectedCase.id)}
            >
              <FileStack size={14} />
              Track results
            </Button>
          </div>

          <div className="space-y-3 ui-section-divider">
            <div className="ui-meta-label text-muted-foreground">
              Result lineage
            </div>
            {selectedCase.artifacts.length === 0 ? (
              <div className="ui-empty-state-box px-4 py-6 text-body-sm">
                No saved results for this track yet.
              </div>
            ) : (
              <div className="space-y-2">
                {[...selectedCase.artifacts]
                  .sort((left, right) => left.updatedAt - right.updatedAt)
                  .map((artifact) => {
                    const sourceLabels = (artifact.sourceArtifactIds || [])
                      .map(
                        (id) =>
                          selectedCase.artifacts.find(
                            (candidate) => candidate.id === id,
                          )?.title,
                      )
                      .filter((value): value is string => Boolean(value))

                    return (
                      <div
                        key={artifact.id}
                        className="ui-inset-well px-4 py-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-body-sm font-medium text-foreground">
                                {artifact.title}
                              </div>
                              <Badge
                                variant="outline"
                                className="ui-meta-text px-2 py-0"
                              >
                                {formatArtifactContractLabel(artifact.kind)}
                              </Badge>
                            </div>
                            <div className="mt-1 text-body-sm text-muted-foreground">
                              {artifact.templateName ||
                                artifact.workflowName ||
                                "Saved from run"}{" "}
                              · {formatRelativeTime(artifact.updatedAt)}
                            </div>
                            {sourceLabels.length > 0 ? (
                              <div className="mt-2 text-body-sm text-muted-foreground">
                                Built from: {sourceLabels.join(", ")}
                              </div>
                            ) : null}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              void onOpenArtifact(artifact)
                            }}
                          >
                            <FileStack size={14} />
                            Open file
                          </Button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>

          <div className="space-y-3 ui-section-divider">
            <div className="ui-meta-label text-muted-foreground">
              Related runs
            </div>
            {selectedCase.activeRun ? (
              <div className="ui-inset-well surface-info-soft">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-body-sm font-medium text-foreground">
                      {selectedCase.activeRun.workflowName}
                    </div>
                    <div className="mt-1 text-body-sm text-muted-foreground">
                      {selectedCase.activeRun.summary.activeStepLabel ||
                        "Run in progress"}
                      {selectedCase.activeRun.runStartedAt
                        ? ` · ${formatElapsedTime(selectedCase.activeRun.runStartedAt)}`
                        : ""}
                    </div>
                  </div>
                  {selectedCase.activeRun.workflowPath ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void onOpenWorkflow(
                          selectedCase.activeRun?.workflowPath || null,
                        )
                      }}
                    >
                      <ArrowUpRight size={14} />
                      Open flow
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {selectedCase.relatedRuns.length === 0 ? (
              <div className="ui-empty-state-box px-4 py-6 text-body-sm">
                No persisted run history is linked to this track yet.
              </div>
            ) : (
              <div className="space-y-2">
                {selectedCase.relatedRuns.slice(0, 5).map((run) => (
                  <div key={run.runId} className="ui-inset-well px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-body-sm font-medium text-foreground">
                            {run.workflowName}
                          </div>
                          <Badge
                            variant={
                              run.status === "completed"
                                ? "success"
                                : run.status === "failed"
                                  ? "destructive"
                                  : "outline"
                            }
                            className="ui-meta-text px-2 py-0"
                          >
                            {run.status}
                          </Badge>
                        </div>
                        <div className="mt-1 text-body-sm text-muted-foreground">
                          Finished {formatRelativeTime(run.completedAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            void onOpenReport(run.reportPath)
                          }}
                        >
                          <FileStack size={14} />
                          Report
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            void onOpenWorkflow(run.workflowPath || null)
                          }}
                          disabled={!run.workflowPath}
                        >
                          <ArrowUpRight size={14} />
                          Open flow
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside
          data-factory-case-detail="true"
          className="space-y-5 border-t border-hairline pt-5 2xl:border-l 2xl:border-t-0 2xl:pl-5 2xl:pt-0"
        >
          <div className="space-y-3">
            <SectionHeading title="Track detail" />

            {selectedCaseSummary ? (
              <>
                <CaseSummaryFieldList fields={selectedCaseSummary.fields} />

                {selectedCase.lastGate?.summaryText ? (
                  <div className="ui-inset-well space-y-1">
                    <div className="ui-meta-label text-muted-foreground">
                      Latest check
                    </div>
                    <div className="text-body-sm text-foreground">
                      {selectedCase.lastGate.summaryText}
                    </div>
                    {selectedCase.lastGate.reasonText ? (
                      <div className="ui-meta-text text-muted-foreground">
                        {selectedCase.lastGate.reasonText}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {primaryAction?.task ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (primaryAction.task)
                          onOpenInboxTask(primaryAction.task, selectedCase.id)
                      }}
                    >
                      <Inbox size={14} />
                      {factoryPrimaryActionButtonLabel(primaryAction.kind)}
                    </Button>
                  ) : null}
                  {primaryAction?.run ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void onOpenWorkflow(
                          primaryAction.run?.workflowPath || null,
                        )
                      }}
                      disabled={!primaryAction.run.workflowPath}
                    >
                      <ArrowUpRight size={14} />
                      {factoryPrimaryActionButtonLabel(primaryAction.kind)}
                    </Button>
                  ) : null}
                  {primaryAction?.template ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        if (primaryAction.template)
                          void onLaunchTemplate(
                            primaryAction.template,
                            selectedCase.artifacts,
                          )
                      }}
                      disabled={Boolean(launchingTemplateId)}
                    >
                      {launchingTemplateId === primaryAction.template.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Rocket size={14} />
                      )}
                      {launchingTemplateId === primaryAction.template.id
                        ? "Opening..."
                        : factoryPrimaryActionButtonLabel(primaryAction.kind)}
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="text-body-sm text-muted-foreground">
                No track summary is available yet for this case.
              </div>
            )}
          </div>

          <div className="space-y-3 ui-section-divider">
            <div className="ui-meta-label text-muted-foreground">
              Needs your response
            </div>
            {selectedCase.tasks.length === 0 ? (
              <div className="ui-empty-state-box px-4 py-4 text-body-sm">
                No blocked steps are waiting on you for this track.
              </div>
            ) : (
              <div className="space-y-2">
                {selectedCase.tasks.map((task) => {
                  const currentStepLabel =
                    selectedCase.lineageLabels[
                      selectedCase.lineageLabels.length - 1
                    ] || null
                  const statusText = deriveBlockedTaskStatusText(
                    task,
                    currentStepLabel,
                  )
                  const reasonText = deriveBlockedTaskReasonText(
                    task,
                    currentStepLabel,
                  )
                  const latestResultText = deriveBlockedTaskLatestResultText(
                    selectedCase.latestArtifact,
                  )

                  return (
                    <div
                      key={`${task.workspace}:${task.taskId}`}
                      className="rounded-lg surface-warning-soft px-4 py-3"
                    >
                      <div className="text-body-sm font-medium text-foreground">
                        {task.title}
                      </div>
                      <div className="mt-1 text-body-sm text-muted-foreground">
                        {statusText}
                      </div>
                      <div className="mt-1 ui-meta-text text-muted-foreground">
                        {[
                          latestResultText,
                          reasonText,
                          formatRelativeTime(task.createdAt),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                  )
                })}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedCase.tasks[0]) {
                      onOpenInboxTask(selectedCase.tasks[0], selectedCase.id)
                    }
                  }}
                >
                  <Inbox size={14} />
                  Review in flow
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-3 ui-section-divider">
            <div className="ui-meta-label text-muted-foreground">
              Next steps
            </div>
            {selectedCase.nextTemplates.length === 0 ? (
              <div className="ui-empty-state-box px-4 py-4 text-body-sm">
                {selectedCase.nextStepLabel
                  ? `Saved work is ready to continue to ${selectedCase.nextStepLabel}, but no matching library step was found yet.`
                  : "No downstream step is ready yet for this track."}
              </div>
            ) : (
              <div className="space-y-2">
                {selectedCase.nextTemplates.map((template) => {
                  const stageLabel = deriveTemplateJourneyStageLabel(template)
                  const disciplineLabels =
                    deriveTemplateExecutionDisciplineLabels(template)
                  const isLaunching = launchingTemplateId === template.id

                  return (
                    <div
                      key={`${selectedCase.id}-${template.id}`}
                      className="ui-inset-well px-4 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-body-sm font-medium text-foreground">
                              {template.name}
                            </div>
                            {stageLabel ? (
                              <Badge
                                variant="secondary"
                                className="ui-meta-text px-2 py-0"
                              >
                                {stageLabel}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-1 text-body-sm text-muted-foreground">
                            {disciplineLabels.length > 0
                              ? disciplineLabels.join(" · ")
                              : "Ready from this track context."}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => {
                            void onLaunchTemplate(
                              template,
                              selectedCase.artifacts,
                            )
                          }}
                          disabled={Boolean(launchingTemplateId)}
                        >
                          {isLaunching ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Rocket size={14} />
                          )}
                          {isLaunching ? "Opening..." : "Continue flow"}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}
