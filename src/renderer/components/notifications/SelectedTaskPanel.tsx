import { ArrowUpRight, Check, Loader2 } from "lucide-react"
import type { HumanTaskField, HumanTaskSnapshot } from "@shared/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  deriveTaskCardContext,
  normalizeHumanFieldValue,
  taskActionCopy,
  type TaskStageMeta,
} from "./task-ui"

function normalizePanelLine(value: string) {
  return value
    .replace(/^[\s>*-]+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
}

function collectFindingLines(...values: Array<string | null | undefined>) {
  const seen = new Set<string>()

  return values
    .flatMap((value) => (value || "").split(/\r?\n/))
    .map(normalizePanelLine)
    .filter(Boolean)
    .filter((line) => {
      const key = line.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function compactBlockedStatus(kind: HumanTaskSnapshot["kind"]) {
  return kind === "approval" ? "Awaiting approval" : "Waiting for input"
}

function compactSavedContext(value: string | null | undefined) {
  if (!value) return null
  return value.replace(/^Latest result:\s*/i, "").replace(/\.$/, "").trim() || null
}

interface SelectedTaskPanelProps {
  selectedTask: HumanTaskSnapshot | null
  taskLoading: boolean
  taskSubmitting: boolean
  taskAnswers: Record<string, unknown>
  selectedTaskStageMeta: TaskStageMeta | null
  primaryActionShortcutLabel?: string | null
  blockedSummary?: {
    statusText?: string | null
    reasonText?: string | null
    inputText?: string | null
    latestResultText?: string | null
    findings?: string[] | null
    approveText?: string | null
    rejectText?: string | null
  } | null
  showOpenWorkflowButton?: boolean
  inspectLabel?: string | null
  className?: string
  onOpenWorkflow: () => void
  onFieldChange: (field: HumanTaskField, value: unknown) => void
  onSubmit: () => void
  onSubmitAndContinue: () => void
  onReject: () => void
  onInspect?: (() => void) | null
}

export function SelectedTaskPanel({
  selectedTask,
  taskLoading,
  taskSubmitting,
  taskAnswers,
  selectedTaskStageMeta,
  primaryActionShortcutLabel = null,
  blockedSummary = null,
  showOpenWorkflowButton = true,
  inspectLabel = null,
  className,
  onOpenWorkflow,
  onFieldChange,
  onSubmit,
  onSubmitAndContinue,
  onReject,
  onInspect = null,
}: SelectedTaskPanelProps) {
  const taskContext = selectedTask
    ? deriveTaskCardContext(selectedTask, { stageLabel: selectedTaskStageMeta?.title || null })
    : null
  const currentStepLabel = selectedTaskStageMeta?.title || selectedTask?.title || "Current step"
  const panelStatusText = selectedTask
    ? blockedSummary
      ? compactBlockedStatus(selectedTask.kind)
      : taskContext?.statusText || taskActionCopy(selectedTask)
    : ""
  const panelReasonText = selectedTask
    ? blockedSummary?.reasonText || selectedTask.summary || selectedTask.instructions || "This flow is waiting for your decision."
    : ""
  const findingLines = selectedTask
    ? (blockedSummary?.findings && blockedSummary.findings.length > 0
        ? blockedSummary.findings
        : collectFindingLines(
          selectedTask.summary,
          selectedTask.instructions,
          selectedTask.request.summary,
          selectedTask.request.instructions,
        ).filter((line) => normalizePanelLine(line) !== normalizePanelLine(panelReasonText)).slice(0, 3))
    : []
  const primaryActionLabel = selectedTask
    ? selectedTask.workflowPath
      ? selectedTask.kind === "approval"
        ? "Approve & Continue"
        : "Submit & Continue"
      : selectedTask.kind === "approval"
        ? "Approve"
        : "Submit response"
    : "Continue"
  const savedContextText = compactSavedContext(blockedSummary?.latestResultText)
  const showSavedContext = Boolean(
    savedContextText
    && savedContextText.toLowerCase() !== (blockedSummary?.inputText || "").trim().toLowerCase(),
  )

  return (
    <article className={className || "rounded-lg bg-surface-1 px-4 py-4"}>
      {taskLoading ? (
        <div className="flex min-h-[260px] items-center justify-center text-muted-foreground">
          <Loader2 size={18} className="mr-2 animate-spin" />
          Loading task...
        </div>
      ) : !selectedTask ? (
        <div className="flex min-h-[260px] items-center justify-center text-body-md text-muted-foreground">
          Select a task to inspect it.
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="ui-meta-label text-muted-foreground">Flow</p>
                <p className="text-body-sm font-medium text-foreground">{selectedTask.workflowName}</p>
              </div>
              {showOpenWorkflowButton && selectedTask.workflowPath && (
                <Button type="button" variant="ghost" size="sm" onClick={onOpenWorkflow}>
                  <ArrowUpRight size={14} />
                  Open flow
                </Button>
              )}
            </div>

            <div className="grid gap-3 border-t border-hairline pt-2 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="ui-meta-label text-muted-foreground">Step</p>
                <p className="text-body-sm text-foreground">{currentStepLabel}</p>
                {selectedTask.title && selectedTask.title !== currentStepLabel && (
                  <p className="ui-meta-text text-muted-foreground">{selectedTask.title}</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="ui-meta-label text-muted-foreground">Status</p>
                <p className="text-body-sm text-foreground">{panelStatusText}</p>
                {selectedTaskStageMeta?.group && (
                  <p className="ui-meta-text text-muted-foreground">{selectedTaskStageMeta.group}</p>
                )}
              </div>
            </div>

            <div className="space-y-1 border-t border-hairline pt-2">
              <p className="ui-meta-label text-muted-foreground">Reason</p>
              <p className="text-body-sm text-foreground whitespace-pre-wrap">{panelReasonText}</p>
            </div>

            {findingLines.length > 0 && (
              <div className="space-y-1 border-t border-hairline pt-2">
                <p className="ui-meta-label text-muted-foreground">Top findings</p>
                <div className="space-y-1">
                  {findingLines.map((finding) => (
                    <p key={finding} className="text-body-sm text-foreground">
                      · {finding}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {(blockedSummary?.inputText || blockedSummary?.latestResultText) && (
              <div className="space-y-2 border-t border-hairline pt-2">
                <div className="space-y-1">
                  <p className="ui-meta-label text-muted-foreground">Step input</p>
                  <p className="text-body-sm text-foreground">
                    {blockedSummary?.inputText || "Saved work context is already tied to this step."}
                  </p>
                </div>
                {showSavedContext && (
                  <div className="space-y-1">
                    <p className="ui-meta-label text-muted-foreground">Saved context</p>
                    <p className="text-body-sm text-muted-foreground">{savedContextText}</p>
                  </div>
                )}
              </div>
            )}

            {selectedTask.kind === "approval" && (
              <div className="grid gap-3 border-t border-hairline pt-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="ui-meta-label text-muted-foreground">On approve</p>
                  <p className="text-body-sm text-foreground">
                    {blockedSummary?.approveText || "Continue this flow from the blocked step."}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="ui-meta-label text-muted-foreground">On reject</p>
                  <p className="text-body-sm text-foreground">
                    {blockedSummary?.rejectText || "Stop the flow and keep the current results."}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            {selectedTask.request.fields.map((field) => {
              const value = normalizeHumanFieldValue(field, taskAnswers[field.id])
              const fieldControlId = `selected-task-field-${field.id}`
              const fieldDescriptionId = field.description ? `${fieldControlId}-description` : undefined
              const requiredMark = field.required ? (
                <>
                  <span className="ml-0.5 text-label-xs text-status-danger" aria-hidden="true">*</span>
                  <span className="sr-only"> (required)</span>
                </>
              ) : null

              if (field.type === "boolean") {
                return (
                  <div key={field.id} className="flex items-start justify-between gap-4 border-t border-hairline pt-2">
                    <div className="min-w-0">
                      <label htmlFor={fieldControlId} className="text-body-sm font-medium text-foreground">
                        {field.label}
                        {requiredMark}
                      </label>
                      {field.description && (
                        <p id={fieldDescriptionId} className="mt-1 text-body-sm text-muted-foreground">{field.description}</p>
                      )}
                    </div>
                    <Checkbox
                      id={fieldControlId}
                      checked={Boolean(value)}
                      aria-describedby={fieldDescriptionId}
                      onChange={(e) => onFieldChange(field, e.target.checked)}
                    />
                  </div>
                )
              }

              if (field.type === "select") {
                return (
                  <div key={field.id} className="space-y-2">
                    <label htmlFor={fieldControlId} className="ui-meta-text text-muted-foreground">
                      {field.label}
                      {requiredMark}
                    </label>
                    {field.description && (
                      <p id={fieldDescriptionId} className="text-body-sm text-muted-foreground">{field.description}</p>
                    )}
                    <Select
                      value={String(value)}
                      onValueChange={(nextValue) => onFieldChange(field, nextValue)}
                    >
                      <SelectTrigger
                        id={fieldControlId}
                        aria-describedby={fieldDescriptionId}
                        className="w-full"
                      >
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options || []).map((option) => (
                          <SelectItem key={option.value} value={String(option.value)}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )
              }

              if (field.type === "multiselect") {
                const selectedValues = Array.isArray(value) ? value : []
                return (
                  <fieldset key={field.id} className="space-y-2 border-t border-hairline pt-2">
                    <legend className="ui-meta-text text-muted-foreground">
                      {field.label}
                      {requiredMark}
                    </legend>
                    {field.description && (
                      <p id={fieldDescriptionId} className="text-body-sm text-muted-foreground">{field.description}</p>
                    )}
                    <div className="space-y-2">
                      {(field.options || []).map((option) => {
                        const checked = selectedValues.includes(option.value)
                        const optionId = `${fieldControlId}-${String(option.value).replace(/[^a-zA-Z0-9_-]/g, "-")}`
                        return (
                          <label key={option.value} htmlFor={optionId} className="flex items-center gap-2 text-body-sm text-foreground">
                            <Checkbox
                              id={optionId}
                              checked={checked}
                              aria-describedby={fieldDescriptionId}
                              onChange={(e) => {
                                const nextValues = e.target.checked
                                  ? [...selectedValues, option.value]
                                  : selectedValues.filter((item) => item !== option.value)
                                onFieldChange(field, nextValues)
                              }}
                            />
                            {option.label}
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>
                )
              }

              if (field.type === "textarea" || field.type === "json") {
                return (
                  <div key={field.id} className="space-y-2">
                    <label htmlFor={fieldControlId} className="ui-meta-text text-muted-foreground">
                      {field.label}
                      {requiredMark}
                    </label>
                    {field.description && (
                      <p id={fieldDescriptionId} className="text-body-sm text-muted-foreground">{field.description}</p>
                    )}
                    <Textarea
                      id={fieldControlId}
                      value={String(value)}
                      placeholder={field.placeholder}
                      className="min-h-[120px]"
                      aria-describedby={fieldDescriptionId}
                      onChange={(event) => onFieldChange(field, event.target.value)}
                    />
                  </div>
                )
              }

              return (
                <div key={field.id} className="space-y-2">
                  <label htmlFor={fieldControlId} className="ui-meta-text text-muted-foreground">
                    {field.label}
                    {requiredMark}
                  </label>
                  {field.description && (
                    <p id={fieldDescriptionId} className="text-body-sm text-muted-foreground">{field.description}</p>
                  )}
                  <Input
                    id={fieldControlId}
                    type={field.type === "number" ? "number" : "text"}
                    value={String(value)}
                    placeholder={field.placeholder}
                    aria-describedby={fieldDescriptionId}
                    onChange={(event) => onFieldChange(
                      field,
                      field.type === "number" ? Number(event.target.value) : event.target.value,
                    )}
                  />
                </div>
              )
            })}
          </div>

          <div className="border-t border-hairline pt-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={selectedTask.workflowPath ? onSubmitAndContinue : onSubmit}
                disabled={taskSubmitting}
                isLoading={taskSubmitting}
              >
                {!taskSubmitting && (selectedTask.workflowPath ? <ArrowUpRight size={14} /> : <Check size={14} />)}
                {primaryActionLabel}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onReject}
                disabled={taskSubmitting}
              >
                {selectedTask.kind === "approval" ? "Reject" : "Reject task"}
              </Button>
            </div>
            {primaryActionShortcutLabel ? (
              <p className="mt-2 ui-meta-text text-muted-foreground">
                {primaryActionShortcutLabel}
              </p>
            ) : null}
            {onInspect && inspectLabel ? (
              <div className="mt-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto px-0 py-0 text-body-sm text-muted-foreground hover:text-foreground"
                  onClick={onInspect}
                >
                  {inspectLabel}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </article>
  )
}
