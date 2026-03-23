import type {
  ArtifactRecord,
  HumanTaskField,
  HumanTaskSnapshot,
  HumanTaskSummary,
  RunResult,
} from "@shared/types"
import {
  deriveBlockedTaskLatestResultText,
  deriveBlockedTaskReasonText,
  deriveBlockedTaskStatusText,
} from "@/lib/workflow-blocked-copy"

export interface TaskStageMeta {
  title: string
  group: string
}

export function normalizeHumanFieldValue(
  field: HumanTaskField,
  value: unknown,
): string | number | boolean | string[] {
  if (field.type === "boolean") return Boolean(value)
  if (field.type === "number")
    return typeof value === "number" ? value : Number(value || 0)
  if (field.type === "multiselect")
    return Array.isArray(value) ? value.map(String) : []
  return typeof value === "string"
    ? value
    : value == null
      ? ""
      : JSON.stringify(value, null, 2)
}

export function taskSelectionKey(
  task: Pick<HumanTaskSummary, "workspace" | "taskId">,
) {
  return `${task.workspace}::${task.taskId}`
}

export function taskActivityAt(
  task:
    | Pick<HumanTaskSummary, "createdAt" | "updatedAt">
    | Pick<HumanTaskSnapshot, "createdAt" | "updatedAt">,
): number {
  return task.updatedAt || task.createdAt || 0
}

export function sortHumanTasksByActivity<
  T extends
    | Pick<HumanTaskSummary, "createdAt" | "updatedAt">
    | Pick<HumanTaskSnapshot, "createdAt" | "updatedAt">,
>(tasks: T[]): T[] {
  return [...tasks].sort((left, right) => {
    const byActivity = taskActivityAt(right) - taskActivityAt(left)
    if (byActivity !== 0) return byActivity
    return (right.createdAt || 0) - (left.createdAt || 0)
  })
}

export function compactTaskText(
  value?: string | null,
  maxLength = 140,
): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim()
  if (!normalized) return null
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1)}…`
}

export function primaryTaskFieldLabel(
  task: Pick<HumanTaskSnapshot, "request"> | null,
): string | null {
  const firstField = task?.request.fields[0]
  if (!firstField?.label) return null
  return firstField.label.trim() || null
}

export function taskKindLabel(
  task: Pick<HumanTaskSummary, "kind"> | Pick<HumanTaskSnapshot, "kind">,
): string {
  return task.kind === "approval" ? "Review" : "Input"
}

export function taskActionCopy(task: HumanTaskSnapshot): string {
  if (task.kind === "approval") {
    return task.allowEdit
      ? "Review the proposed content, adjust it if needed, then continue the run."
      : "Review the checkpoint and decide whether the run should continue."
  }
  return "Provide the missing input this flow needs before it can continue."
}

export function taskCardPreview(
  task: HumanTaskSummary | HumanTaskSnapshot,
): string | null {
  const summary = compactTaskText(task.summary, 120)
  if (summary) return summary
  return compactTaskText(task.instructions, 120)
}

export function deriveTaskCardContext(
  task: HumanTaskSummary | HumanTaskSnapshot,
  options?: {
    stageLabel?: string | null
    latestArtifact?: ArtifactRecord | null
  },
) {
  const stageLabel = options?.stageLabel || null
  const latestArtifact = options?.latestArtifact || null
  const statusText = deriveBlockedTaskStatusText(task, stageLabel)
  const detailText = [
    deriveBlockedTaskLatestResultText(latestArtifact),
    deriveBlockedTaskReasonText(task, stageLabel),
  ]
    .filter(Boolean)
    .join(" · ")

  return {
    statusText,
    detailText,
  }
}

export function taskStageKey(
  task:
    | Pick<HumanTaskSummary, "workflowPath" | "nodeId">
    | Pick<HumanTaskSnapshot, "workflowPath" | "nodeId">,
): string | null {
  if (!task.workflowPath) return null
  return `${task.workflowPath}::${task.nodeId}`
}

export function buildInitialHumanTaskAnswers(
  task: Pick<HumanTaskSnapshot, "latestResponse" | "request"> | null,
): Record<string, unknown> {
  if (!task) return {}
  if (task.latestResponse?.answers) return task.latestResponse.answers
  return task.request.defaults || {}
}

export function buildSubmitHumanTaskAnswers(
  task: Pick<HumanTaskSnapshot, "kind">,
  answers: Record<string, unknown>,
): Record<string, unknown> {
  if (task.kind !== "approval") return answers
  return {
    ...answers,
    approved: true,
  }
}

export function hasMissingRequiredTaskAnswers(
  task: Pick<HumanTaskSnapshot, "request">,
  answers: Record<string, unknown>,
) {
  return getMissingRequiredTaskFields(task, answers).length > 0
}

export function getMissingRequiredTaskFields(
  task: Pick<HumanTaskSnapshot, "request">,
  answers: Record<string, unknown>,
): HumanTaskField[] {
  return task.request.fields.filter((field) => {
    if (!field.required) return false
    const value = answers[field.id]
    return field.type === "multiselect"
      ? !Array.isArray(value) || value.length === 0
      : field.type === "boolean"
        ? value === undefined
        : value === null ||
          value === undefined ||
          String(value).trim().length === 0
  })
}

export function missingRequiredTaskFieldLabels(
  task: Pick<HumanTaskSnapshot, "request">,
  answers: Record<string, unknown>,
) {
  return getMissingRequiredTaskFields(task, answers).map(
    (field) => field.label.trim() || field.id,
  )
}

export function toContinuationRun(
  task: Pick<
    HumanTaskSnapshot,
    | "sourceRunId"
    | "workflowName"
    | "workflowPath"
    | "createdAt"
    | "updatedAt"
    | "workspace"
  >,
): RunResult {
  return {
    runId: task.sourceRunId,
    status: "blocked",
    workflowName: task.workflowName,
    workflowPath: task.workflowPath,
    startedAt: task.createdAt,
    completedAt: task.updatedAt,
    reportPath: "",
    workspace: task.workspace,
  }
}
