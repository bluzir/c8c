import { Inbox } from "lucide-react"
import type {
  ArtifactRecord,
  HumanTaskField,
  HumanTaskSnapshot,
  HumanTaskSummary,
} from "@shared/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SectionHeading } from "@/components/ui/page-shell"
import { cn } from "@/lib/cn"
import { formatRelativeTime } from "@/components/sidebar/projectSidebarUtils"
import { SelectedTaskPanel } from "./SelectedTaskPanel"
import {
  deriveTaskCardContext,
  taskActivityAt,
  taskKindLabel,
  taskSelectionKey,
  taskStageKey,
  type TaskStageMeta,
} from "./task-ui"

interface HumanTaskInboxSectionProps {
  humanTasksLoading: boolean
  humanTasksError: string | null
  openHumanTaskCount: number
  visibleHumanTasks: HumanTaskSummary[]
  selectedTaskId: string | null
  selectedCaseId: string | null
  taskStageMetaByKey: Record<string, TaskStageMeta>
  caseIdByTaskKey: Map<string, string>
  caseLabelById: Map<string, string>
  latestArtifactByCaseId: Map<string, ArtifactRecord>
  onSelectTaskId: (taskKey: string) => void
  selectedTask: HumanTaskSnapshot | null
  taskLoading: boolean
  taskSubmitting: boolean
  taskAnswers: Record<string, unknown>
  selectedTaskStageMeta: TaskStageMeta | null
  primaryActionShortcutLabel?: string | null
  onOpenWorkflow: () => void
  onFieldChange: (field: HumanTaskField, value: unknown) => void
  onSubmit: () => void
  onSubmitAndContinue: () => void
  onReject: () => void
  onClearCaseFilter?: (() => void) | null
}

export function HumanTaskInboxSection({
  humanTasksLoading,
  humanTasksError,
  openHumanTaskCount,
  visibleHumanTasks,
  selectedTaskId,
  selectedCaseId,
  taskStageMetaByKey,
  caseIdByTaskKey,
  caseLabelById,
  latestArtifactByCaseId,
  onSelectTaskId,
  selectedTask,
  taskLoading,
  taskSubmitting,
  taskAnswers,
  selectedTaskStageMeta,
  primaryActionShortcutLabel = null,
  onOpenWorkflow,
  onFieldChange,
  onSubmit,
  onSubmitAndContinue,
  onReject,
  onClearCaseFilter = null,
}: HumanTaskInboxSectionProps) {
  return (
    <section className="space-y-4">
      <SectionHeading
        title="Waiting on you"
        meta={
          <span className="control-badge border border-hairline bg-surface-2/70 ui-meta-text text-muted-foreground">
            {humanTasksLoading ? "Loading..." : `${openHumanTaskCount} open`}
          </span>
        }
      />
      {humanTasksError ? (
        <article className="rounded-lg surface-danger-soft px-4 py-3 text-body-sm text-status-danger">
          {humanTasksError}
        </article>
      ) : humanTasksLoading ? (
        <div className="ui-slab overflow-hidden">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="space-y-2 border-b border-hairline px-4 py-3 last:border-b-0"
            >
              <div className="h-4 w-40 ui-skeleton" />
              <div className="h-3 w-32 ui-skeleton" />
              <div className="h-3 w-3/4 ui-skeleton" />
            </div>
          ))}
        </div>
      ) : openHumanTaskCount === 0 && !humanTasksLoading ? (
        <article className="surface-figure px-5 py-10 text-center">
          <div className="mx-auto flex h-control-lg w-control-lg items-center justify-center rounded-lg bg-surface-2/80">
            <Inbox size={20} className="text-muted-foreground" />
          </div>
          <p className="mt-4 text-body-md font-medium text-foreground">
            {selectedCaseId
              ? "No open decisions for this flow"
              : "No open review or input tasks"}
          </p>
          <p className="mt-1 text-body-sm text-muted-foreground">
            {selectedCaseId
              ? "Switch to all flows or continue the related flow if you want to move it forward."
              : "Flows that need structured answers or approvals will appear here."}
          </p>
          {selectedCaseId && onClearCaseFilter ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={onClearCaseFilter}
            >
              Show all tasks
            </Button>
          ) : null}
        </article>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="ui-slab overflow-hidden">
            {visibleHumanTasks.map((task) => {
              const stageMeta =
                taskStageMetaByKey[taskStageKey(task) || ""] || null
              const taskCaseId =
                caseIdByTaskKey.get(taskSelectionKey(task)) || null
              const taskCaseLabel = taskCaseId
                ? caseLabelById.get(taskCaseId) || null
                : null
              const latestArtifact = taskCaseId
                ? latestArtifactByCaseId.get(taskCaseId) || null
                : null
              const taskCardContext = deriveTaskCardContext(task, {
                stageLabel: stageMeta?.title || null,
                latestArtifact,
              })
              return (
                <button
                  key={`${task.workspace}:${task.taskId}`}
                  type="button"
                  onClick={() => onSelectTaskId(taskSelectionKey(task))}
                  className={cn(
                    "w-full border-b border-hairline px-4 py-3 text-left ui-motion-fast last:border-b-0",
                    selectedTaskId === taskSelectionKey(task)
                      ? "ui-selected-row-tint"
                      : "bg-transparent hover:bg-surface-2/25",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-body-md font-semibold text-foreground">
                          {task.title}
                        </p>
                        <Badge
                          variant={
                            task.kind === "approval" ? "warning" : "info"
                          }
                          size="pill"
                        >
                          {taskKindLabel(task)}
                        </Badge>
                        {!selectedCaseId && taskCaseLabel && (
                          <Badge
                            variant="outline"
                            size="pill"
                            className="text-muted-foreground"
                          >
                            {taskCaseLabel}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 ui-meta-text text-muted-foreground">
                        <span>{task.workflowName}</span>
                        {stageMeta && <span>· {stageMeta.title}</span>}
                        {!stageMeta && task.kind === "approval" && (
                          <span>· Approval</span>
                        )}
                      </div>
                      {stageMeta?.group ? (
                        <p className="mt-1 ui-meta-text text-muted-foreground">
                          {stageMeta.group}
                        </p>
                      ) : null}
                      <p className="mt-2 text-body-sm text-muted-foreground">
                        {taskCardContext.statusText}
                      </p>
                      {taskCardContext.detailText && (
                        <p className="mt-1 line-clamp-2 ui-meta-text text-muted-foreground">
                          {taskCardContext.detailText}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 ui-meta-text text-muted-foreground">
                      {formatRelativeTime(taskActivityAt(task))}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          <SelectedTaskPanel
            selectedTask={selectedTask}
            taskLoading={taskLoading}
            taskSubmitting={taskSubmitting}
            taskAnswers={taskAnswers}
            selectedTaskStageMeta={selectedTaskStageMeta}
            primaryActionShortcutLabel={primaryActionShortcutLabel}
            className="surface-figure px-4 py-4"
            onOpenWorkflow={onOpenWorkflow}
            onFieldChange={onFieldChange}
            onSubmit={onSubmit}
            onSubmitAndContinue={onSubmitAndContinue}
            onReject={onReject}
          />
        </div>
      )}
    </section>
  )
}
