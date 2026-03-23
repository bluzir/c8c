import type {
  ArtifactRecord,
  CaseStateRecord,
  HumanTaskSummary,
  WorkflowTemplate,
} from "@shared/types"
import {
  areTemplateContractsSatisfied,
  deriveArtifactCaseKey,
  deriveTemplateContinuationLabel,
  deriveTemplateDisplayLabel,
  getTemplateRecommendedNext,
  selectArtifactsForTemplateContracts,
} from "./workflow-entry"
import {
  deriveBlockedTaskReasonText,
  deriveBlockedTaskStatusText,
} from "./workflow-blocked-copy"

export type WorkflowCreateContinuationAction =
  | {
      kind: "launch_next_step"
      template: WorkflowTemplate
      artifacts: ArtifactRecord[]
      caseId: string
      caseLabel?: string
      factoryId?: string
      factoryLabel?: string
    }
  | {
      kind: "open_blocked_work"
      task: HumanTaskSummary
    }

export interface WorkflowCreateContinuationCandidate {
  caseId: string
  title: string
  status: "blocked" | "ready"
  readinessText: string
  supportText: string
  lastGateText: string | null
  latestResultLabel: string | null
  latestStepLabel: string | null
  nextStepLabel: string | null
  updatedAt: number
  action: WorkflowCreateContinuationAction
}

export type WorkflowCreateContinuationPresentation =
  | "none"
  | "supporting"
  | "dominant"

export interface WorkflowCreateContinuationPresentationState {
  primaryContinuation: WorkflowCreateContinuationCandidate | null
  secondaryContinuations: WorkflowCreateContinuationCandidate[]
  presentation: WorkflowCreateContinuationPresentation
  reason?: string
}

function hasDominantContinuationContract(
  candidate: WorkflowCreateContinuationCandidate,
) {
  return Boolean(
    candidate.title &&
    candidate.status &&
    candidate.updatedAt > 0 &&
    (candidate.latestResultLabel || candidate.readinessText) &&
    (candidate.nextStepLabel || candidate.action.kind === "open_blocked_work"),
  )
}

export function resolveWorkflowCreateContinuationPresentation({
  candidates,
  hasStartedNewRequest,
  routingInProgress,
  clarificationInProgress,
}: {
  candidates: WorkflowCreateContinuationCandidate[]
  hasStartedNewRequest: boolean
  routingInProgress: boolean
  clarificationInProgress: boolean
}): WorkflowCreateContinuationPresentationState {
  const primaryContinuation = candidates[0] ?? null
  const secondaryContinuations = candidates.slice(1)

  if (!primaryContinuation) {
    return {
      primaryContinuation: null,
      secondaryContinuations: [],
      presentation: "none",
      reason: "no_candidates",
    }
  }

  if (hasStartedNewRequest) {
    return {
      primaryContinuation,
      secondaryContinuations,
      presentation: "supporting",
      reason: "new_request_started",
    }
  }

  if (routingInProgress) {
    return {
      primaryContinuation,
      secondaryContinuations,
      presentation: "supporting",
      reason: "routing_in_progress",
    }
  }

  if (clarificationInProgress) {
    return {
      primaryContinuation,
      secondaryContinuations,
      presentation: "supporting",
      reason: "clarification_in_progress",
    }
  }

  if (candidates.length !== 1) {
    return {
      primaryContinuation,
      secondaryContinuations,
      presentation: "supporting",
      reason: "multiple_candidates",
    }
  }

  if (!hasDominantContinuationContract(primaryContinuation)) {
    return {
      primaryContinuation,
      secondaryContinuations,
      presentation: "supporting",
      reason: "candidate_incomplete",
    }
  }

  return {
    primaryContinuation,
    secondaryContinuations: [],
    presentation: "dominant",
    reason: "single_clear_candidate",
  }
}

interface ContinuationEntry {
  id: string
  label: string
  artifacts: ArtifactRecord[]
  tasks: HumanTaskSummary[]
}

function labelForCase({
  label,
  artifacts,
  latestArtifact,
  latestTask,
}: {
  label: string
  artifacts: ArtifactRecord[]
  latestArtifact: ArtifactRecord | null
  latestTask: HumanTaskSummary | null
}) {
  return (
    artifacts.find((artifact) => artifact.caseLabel)?.caseLabel ||
    latestTask?.workflowName ||
    artifacts.find((artifact) => artifact.workflowName)?.workflowName ||
    latestTask?.title ||
    latestArtifact?.title ||
    label ||
    "Saved work"
  )
}

function formatArtifactList(artifacts: ArtifactRecord[]) {
  if (artifacts.length === 0) return "saved results"
  if (artifacts.length === 1) return artifacts[0].title
  if (artifacts.length === 2)
    return `${artifacts[0].title} and ${artifacts[1].title}`
  return `${artifacts[0].title}, ${artifacts[1].title}, +${artifacts.length - 2} more`
}

function deriveSourceStepLabel(
  artifact: ArtifactRecord | null,
  templateById: Map<string, WorkflowTemplate>,
) {
  if (!artifact?.templateId) return null
  const template = templateById.get(artifact.templateId)
  return (
    deriveTemplateDisplayLabel(template) ||
    template?.name ||
    artifact.templateName ||
    null
  )
}

function resolveReadyContinuation(
  artifacts: ArtifactRecord[],
  templateById: Map<string, WorkflowTemplate>,
) {
  for (const artifact of artifacts) {
    if (!artifact.templateId) continue
    const sourceTemplate = templateById.get(artifact.templateId)
    const recommendedNext = getTemplateRecommendedNext(sourceTemplate)
    if (recommendedNext.length === 0) continue

    const nextTemplate = recommendedNext
      .map((templateId) => templateById.get(templateId) || null)
      .find(
        (template): template is WorkflowTemplate =>
          template !== null &&
          areTemplateContractsSatisfied(template.contractIn, artifacts),
      )

    if (!nextTemplate) continue

    const selectedArtifacts =
      (nextTemplate.contractIn?.length || 0) > 0
        ? selectArtifactsForTemplateContracts(
            nextTemplate.contractIn,
            artifacts,
          )
        : [artifact]

    return {
      nextTemplate,
      selectedArtifacts,
      sourceStepLabel: deriveSourceStepLabel(artifact, templateById),
    }
  }

  return null
}

export function deriveWorkflowCreateContinuations({
  artifacts,
  caseStates,
  humanTasks,
  templates,
}: {
  artifacts: ArtifactRecord[]
  caseStates?: CaseStateRecord[]
  humanTasks: HumanTaskSummary[]
  templates: WorkflowTemplate[]
}) {
  const templateById = new Map(
    templates.map((template) => [template.id, template]),
  )
  const caseStateById = new Map(
    (caseStates || []).map((state) => [state.caseId, state]),
  )
  const caseByRunId = new Map<string, string>()
  const caseByWorkflowPath = new Map<string, string>()
  const entries = new Map<string, ContinuationEntry>()

  const ensureEntry = (id: string, label: string) => {
    const existing = entries.get(id)
    if (existing) {
      if (!existing.label && label) existing.label = label
      return existing
    }

    const created: ContinuationEntry = {
      id,
      label,
      artifacts: [],
      tasks: [],
    }
    entries.set(id, created)
    return created
  }

  for (const artifact of artifacts) {
    const caseId = deriveArtifactCaseKey(artifact)
    const entry = ensureEntry(
      caseId,
      artifact.caseLabel || artifact.workflowName || artifact.title,
    )
    entry.artifacts.push(artifact)
    caseByRunId.set(artifact.runId, caseId)
    if (artifact.workflowPath) {
      caseByWorkflowPath.set(artifact.workflowPath, caseId)
    }
  }

  for (const task of humanTasks.filter((entry) => entry.status === "open")) {
    const caseId =
      (task.workflowPath && caseByWorkflowPath.get(task.workflowPath)) ||
      caseByRunId.get(task.sourceRunId) ||
      `task:${task.workflowPath || task.sourceRunId || task.taskId}`
    const entry = ensureEntry(caseId, task.workflowName || task.title)
    entry.tasks.push(task)
  }

  const candidates = Array.from(entries.values())
    .map<WorkflowCreateContinuationCandidate | null>((entry) => {
      const caseArtifacts = [...entry.artifacts].sort(
        (left, right) => right.updatedAt - left.updatedAt,
      )
      const openTasks = [...entry.tasks].sort(
        (left, right) => right.updatedAt - left.updatedAt,
      )
      const latestArtifact = caseArtifacts[0] || null
      const primaryTask = openTasks[0] || null
      const latestStepLabel = deriveSourceStepLabel(
        latestArtifact,
        templateById,
      )
      const title = labelForCase({
        label: entry.label,
        artifacts: caseArtifacts,
        latestArtifact,
        latestTask: primaryTask,
      })
      const caseState = caseStateById.get(entry.id) || null

      if (primaryTask) {
        return {
          caseId: entry.id,
          title,
          status: "blocked" as const,
          readinessText: deriveBlockedTaskStatusText(primaryTask),
          supportText: deriveBlockedTaskReasonText(primaryTask),
          lastGateText: caseState?.lastGate?.summaryText || null,
          latestResultLabel: latestArtifact?.title || null,
          latestStepLabel,
          nextStepLabel: null,
          updatedAt: Math.max(
            primaryTask.updatedAt,
            latestArtifact?.updatedAt || 0,
          ),
          action: {
            kind: "open_blocked_work",
            task: primaryTask,
          } satisfies WorkflowCreateContinuationAction,
        }
      }

      const readyContinuation = resolveReadyContinuation(
        caseArtifacts,
        templateById,
      )
      if (!readyContinuation) return null

      const nextStepLabel =
        deriveTemplateContinuationLabel(readyContinuation.nextTemplate) ||
        deriveTemplateDisplayLabel(readyContinuation.nextTemplate) ||
        readyContinuation.nextTemplate.name

      return {
        caseId: entry.id,
        title,
        status: "ready" as const,
        readinessText: `Ready to continue to ${nextStepLabel}.`,
        supportText:
          readyContinuation.selectedArtifacts.length > 0
            ? `Using saved ${formatArtifactList(readyContinuation.selectedArtifacts)}${readyContinuation.sourceStepLabel ? ` from ${readyContinuation.sourceStepLabel}` : ""}.`
            : "Ready from the saved results already attached to this work.",
        lastGateText: caseState?.lastGate?.summaryText || null,
        latestResultLabel: latestArtifact?.title || null,
        latestStepLabel: readyContinuation.sourceStepLabel || latestStepLabel,
        nextStepLabel,
        updatedAt: latestArtifact?.updatedAt || 0,
        action: {
          kind: "launch_next_step",
          template: readyContinuation.nextTemplate,
          artifacts: readyContinuation.selectedArtifacts,
          caseId: entry.id,
          caseLabel: latestArtifact?.caseLabel,
          factoryId: latestArtifact?.factoryId,
          factoryLabel: latestArtifact?.factoryLabel,
        } satisfies WorkflowCreateContinuationAction,
      }
    })
    .filter(
      (candidate): candidate is WorkflowCreateContinuationCandidate =>
        candidate !== null,
    )

  const priority = (candidate: WorkflowCreateContinuationCandidate) =>
    candidate.status === "blocked" ? 0 : 1

  return candidates.sort((left, right) => {
    const byPriority = priority(left) - priority(right)
    if (byPriority !== 0) return byPriority
    return right.updatedAt - left.updatedAt
  })
}
