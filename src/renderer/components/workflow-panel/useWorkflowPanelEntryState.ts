import { useMemo } from "react"
import { resolveWorkflowInput } from "@/lib/input-type"
import {
  resolveTemplateToolingRecommendation,
  type TemplateToolingRecommendation,
  type WebSearchBackend,
} from "@/lib/web-search-backend"
import type { ExecutionRunStatus } from "@/lib/workflow-execution"
import {
  areTemplateContractsSatisfied,
  buildContinuationArtifactPool,
  deriveTemplateContinuationDescription,
  deriveTemplateContextDisplayLabel,
  deriveTemplateContextJobLabel,
  deriveTemplateContextJourneyStageLabel,
  formatArtifactContractLabel,
  getTemplateContextRecommendedNext,
  getTemplateContextSuggestedTools,
  selectArtifactsForTemplateContracts,
  type WorkflowEntryState,
  type WorkflowTemplateRunContext,
} from "@/lib/workflow-entry"
import { deriveExecutionPolicyFlowRules } from "@/lib/flow-rules"
import { deriveWorkflowResumeEntrySummary } from "@/lib/workflow-resume-entry"
import { contextRequiresStartApproval } from "@/lib/stage-run-policy"
import type {
  ArtifactRecord,
  CaseStateRecord,
  InputAttachment,
  Workflow,
  WorkflowTemplate,
} from "@shared/types"
import {
  deriveEntryNextStepLabel,
  formatInputAttachmentLabel,
  takeLeadingSentence,
} from "./WorkflowPanelInlineSections"

interface UseWorkflowPanelEntryStateParams {
  workflow: Workflow
  selectedWorkflowPath: string | null
  workflowEntryState: WorkflowEntryState | null
  inputValue: string
  inputAttachments: InputAttachment[]
  artifactRecords: ArtifactRecord[]
  projectArtifacts: ArtifactRecord[]
  projectCaseStates: CaseStateRecord[]
  selectedWorkflowTemplateContext: WorkflowTemplateRunContext | null
  packTemplates: WorkflowTemplate[]
  runStatus: ExecutionRunStatus
  webSearchBackend: WebSearchBackend
  viewMode: "list" | "settings"
  pendingCreateMessage: Record<string, string>
  chatStatus: string
  workflowPastRunsCount: number
  hasSelectedPastRun: boolean
  prepareNewRun: boolean
  projectArtifactsLoading: boolean
  projectArtifactsError: string | null
  selectedProject: string | null
}

export function formatTemplateToolingRecommendationNote(
  recommendation: TemplateToolingRecommendation,
) {
  return `${recommendation.title}. ${recommendation.description}`
}

export function resolveStageStartPolicyNotes({
  notes,
  templateToolingRecommendation,
}: {
  notes: string[]
  templateToolingRecommendation?: TemplateToolingRecommendation | null
}) {
  const baseNotes = notes
    .map((note) => note.trim())
    .filter((note) => note.length > 0 && !note.startsWith('"Target operator:'))
    .slice(0, templateToolingRecommendation ? 2 : 3)

  if (!templateToolingRecommendation) return baseNotes

  return [
    formatTemplateToolingRecommendationNote(templateToolingRecommendation),
    ...baseNotes,
  ]
}

export function hasWorkflowReviewHistory({
  workflowPastRunsCount,
  hasSelectedPastRun,
}: {
  workflowPastRunsCount: number
  hasSelectedPastRun: boolean
}) {
  return workflowPastRunsCount > 0 || hasSelectedPastRun
}

export function resolveShowResumeHeader({
  viewMode,
  runStatus,
  activeEntryState,
  resumeEntrySummary,
  showCreateDraftSkeleton,
  prepareNewRun,
}: {
  viewMode: "list" | "settings"
  runStatus: ExecutionRunStatus
  activeEntryState: WorkflowEntryState | null
  resumeEntrySummary: ReturnType<typeof deriveWorkflowResumeEntrySummary>
  showCreateDraftSkeleton: boolean
  prepareNewRun: boolean
}) {
  return (
    viewMode === "list" &&
    runStatus === "idle" &&
    activeEntryState !== null &&
    resumeEntrySummary !== null &&
    !showCreateDraftSkeleton &&
    !prepareNewRun
  )
}

export function resolveActiveWorkflowEntryState({
  workflowEntryState,
  workflowContinuationEntryState,
  selectedWorkflowPath,
  workflowName,
}: {
  workflowEntryState: WorkflowEntryState | null
  workflowContinuationEntryState?: WorkflowEntryState | null
  selectedWorkflowPath: string | null
  workflowName: string
}): WorkflowEntryState | null {
  const resolveMatchingEntryState = (entryState: WorkflowEntryState | null) => {
    if (!entryState) return null
    if (entryState.workflowPath) {
      return entryState.workflowPath === selectedWorkflowPath
        ? entryState
        : null
    }
    if (selectedWorkflowPath !== null) {
      return null
    }
    return entryState.workflowName === workflowName ? entryState : null
  }

  return (
    resolveMatchingEntryState(workflowEntryState) ||
    resolveMatchingEntryState(workflowContinuationEntryState || null)
  )
}

export function useWorkflowPanelEntryState({
  workflow,
  selectedWorkflowPath,
  workflowEntryState,
  inputValue,
  inputAttachments,
  artifactRecords,
  projectArtifacts,
  projectCaseStates,
  selectedWorkflowTemplateContext,
  packTemplates,
  runStatus,
  webSearchBackend,
  viewMode,
  pendingCreateMessage,
  chatStatus,
  workflowPastRunsCount,
  hasSelectedPastRun,
  prepareNewRun,
  projectArtifactsLoading,
  projectArtifactsError,
  selectedProject,
}: UseWorkflowPanelEntryStateParams) {
  const activeEntryState = useMemo(
    () =>
      resolveActiveWorkflowEntryState({
        workflowEntryState,
        selectedWorkflowPath,
        workflowName: workflow.name,
      }),
    [selectedWorkflowPath, workflow.name, workflowEntryState],
  )

  const inputNode = workflow.nodes.find((node) => node.type === "input")
  const inputValidation = resolveWorkflowInput(inputValue, {
    inputType:
      inputNode?.type === "input" ? inputNode.config.inputType : undefined,
    required:
      inputNode?.type === "input" ? inputNode.config.required : undefined,
    defaultValue:
      inputNode?.type === "input" ? inputNode.config.defaultValue : undefined,
  })
  const readyToRun =
    inputValidation.valid &&
    workflow.nodes.some((node) => node.type === "skill")

  const combinedArtifactRecords = useMemo(() => {
    const byId = new Map<string, ArtifactRecord>()
    for (const artifact of projectArtifacts) {
      byId.set(artifact.id, artifact)
    }
    for (const artifact of artifactRecords) {
      byId.set(artifact.id, artifact)
    }
    return Array.from(byId.values()).sort(
      (left, right) => right.updatedAt - left.updatedAt,
    )
  }, [artifactRecords, projectArtifacts])

  const continuationArtifactRecords = useMemo(
    () =>
      buildContinuationArtifactPool({
        currentArtifacts: artifactRecords,
        projectArtifacts,
        context: selectedWorkflowTemplateContext,
      }),
    [artifactRecords, projectArtifacts, selectedWorkflowTemplateContext],
  )
  const templateToolingRecommendation = useMemo(
    () =>
      resolveTemplateToolingRecommendation({
        suggestedTools: getTemplateContextSuggestedTools(
          selectedWorkflowTemplateContext,
        ),
        backend: webSearchBackend,
      }),
    [selectedWorkflowTemplateContext, webSearchBackend],
  )

  const nextStageSelection = useMemo(() => {
    const recommendedNext = getTemplateContextRecommendedNext(
      selectedWorkflowTemplateContext,
    )
    if (recommendedNext.length === 0 || packTemplates.length === 0) {
      return { template: null, artifacts: [] as ArtifactRecord[] }
    }

    const orderedCandidates = recommendedNext
      .map(
        (templateId) =>
          packTemplates.find((template) => template.id === templateId) || null,
      )
      .filter((template): template is WorkflowTemplate => template !== null)

    const preferredTemplate =
      orderedCandidates.find((template) =>
        areTemplateContractsSatisfied(
          template.contractIn,
          continuationArtifactRecords,
        ),
      ) || null
    if (preferredTemplate) {
      return {
        template: preferredTemplate,
        artifacts: selectArtifactsForTemplateContracts(
          preferredTemplate.contractIn,
          continuationArtifactRecords,
        ),
      }
    }

    return { template: null, artifacts: [] as ArtifactRecord[] }
  }, [
    continuationArtifactRecords,
    packTemplates,
    selectedWorkflowTemplateContext,
  ])

  const nextStageTemplate = nextStageSelection.template
  const nextStageArtifacts = nextStageSelection.artifacts
  const currentTemplate = useMemo(
    () =>
      packTemplates.find(
        (template) =>
          template.id === selectedWorkflowTemplateContext?.templateId,
      ) || null,
    [packTemplates, selectedWorkflowTemplateContext?.templateId],
  )
  const entryStageLabel = useMemo(
    () =>
      deriveTemplateContextDisplayLabel(selectedWorkflowTemplateContext) ||
      deriveTemplateContextJobLabel(selectedWorkflowTemplateContext) ||
      deriveTemplateContextJourneyStageLabel(selectedWorkflowTemplateContext),
    [selectedWorkflowTemplateContext],
  )
  const entryFlowRules = useMemo(
    () =>
      deriveExecutionPolicyFlowRules(
        selectedWorkflowTemplateContext?.executionPolicy,
        {
          defaultScope: entryStageLabel || "Run",
        },
      ),
    [entryStageLabel, selectedWorkflowTemplateContext],
  )
  const startApprovalRequired = useMemo(
    () =>
      runStatus === "idle" &&
      contextRequiresStartApproval(selectedWorkflowTemplateContext),
    [runStatus, selectedWorkflowTemplateContext],
  )
  const entryNextStepLabel = useMemo(
    () => deriveEntryNextStepLabel({ readyToRun, nextStageTemplate }),
    [nextStageTemplate, readyToRun],
  )
  const sourceArtifacts = useMemo(() => {
    const sourceArtifactIds = (
      selectedWorkflowTemplateContext?.sourceArtifactIds || []
    ).filter(Boolean)
    if (sourceArtifactIds.length === 0) return [] as ArtifactRecord[]

    const artifactsById = new Map(
      combinedArtifactRecords.map((artifact) => [artifact.id, artifact]),
    )
    return sourceArtifactIds
      .map((artifactId) => artifactsById.get(artifactId) || null)
      .filter((artifact): artifact is ArtifactRecord => artifact !== null)
      .sort((left, right) => right.updatedAt - left.updatedAt)
  }, [
    combinedArtifactRecords,
    selectedWorkflowTemplateContext?.sourceArtifactIds,
  ])
  const currentCaseState = useMemo(() => {
    const caseId =
      selectedWorkflowTemplateContext?.caseId ||
      sourceArtifacts.find((artifact) => artifact.caseId)?.caseId ||
      null
    if (!caseId) return null
    return projectCaseStates.find((entry) => entry.caseId === caseId) || null
  }, [
    projectCaseStates,
    selectedWorkflowTemplateContext?.caseId,
    sourceArtifacts,
  ])
  const resumeEntrySummary = useMemo(
    () =>
      deriveWorkflowResumeEntrySummary({
        context: selectedWorkflowTemplateContext,
        currentStepLabel: entryStageLabel,
        sourceArtifacts,
        caseState: currentCaseState,
        startApprovalRequired,
      }),
    [
      currentCaseState,
      entryStageLabel,
      selectedWorkflowTemplateContext,
      sourceArtifacts,
      startApprovalRequired,
    ],
  )
  const stageStartInputLabels = useMemo(() => {
    if (inputAttachments.length > 0) {
      return inputAttachments.map(formatInputAttachmentLabel)
    }
    return (selectedWorkflowTemplateContext?.contractIn || []).map((contract) =>
      formatArtifactContractLabel(contract),
    )
  }, [inputAttachments, selectedWorkflowTemplateContext])
  const stageStartPolicyNotes = useMemo(
    () =>
      resolveStageStartPolicyNotes({
        notes: selectedWorkflowTemplateContext?.executionPolicy?.notes || [],
        templateToolingRecommendation,
      }),
    [selectedWorkflowTemplateContext, templateToolingRecommendation],
  )
  const stageStartFlowName =
    workflow.name ||
    selectedWorkflowTemplateContext?.workflowName ||
    selectedWorkflowTemplateContext?.templateName ||
    activeEntryState?.workflowName ||
    "Untitled flow"
  const stageStartTitle =
    deriveTemplateContextJobLabel(selectedWorkflowTemplateContext) ||
    activeEntryState?.title ||
    stageStartFlowName
  const stageStartDescription = takeLeadingSentence(
    deriveTemplateContinuationDescription(currentTemplate) ||
      selectedWorkflowTemplateContext?.inputText,
    "Run this step with the current input.",
  )
  const stageStartContextLine = useMemo(() => {
    const primaryArtifact = sourceArtifacts[0] || null
    const originFlowLabel =
      primaryArtifact?.workflowName ||
      primaryArtifact?.templateName ||
      primaryArtifact?.caseLabel ||
      null
    if (originFlowLabel) {
      return `From ${originFlowLabel}`
    }
    const caseLabel =
      selectedWorkflowTemplateContext?.caseLabel ||
      currentCaseState?.caseLabel ||
      null
    return caseLabel ? `Case: ${caseLabel}` : null
  }, [
    currentCaseState?.caseLabel,
    selectedWorkflowTemplateContext?.caseLabel,
    sourceArtifacts,
  ])
  const stageStartProvenanceLabel = useMemo(() => {
    const primaryArtifact = sourceArtifacts[0] || null
    if (!primaryArtifact) return null

    const originFlowLabel =
      primaryArtifact.workflowName ||
      primaryArtifact.templateName ||
      primaryArtifact.caseLabel ||
      null
    if (sourceArtifacts.length === 1) {
      return originFlowLabel && originFlowLabel !== primaryArtifact.title
        ? `${primaryArtifact.title} from ${originFlowLabel}`
        : primaryArtifact.title
    }
    return (
      resumeEntrySummary?.attachText ||
      `${sourceArtifacts.length} saved results`
    )
  }, [resumeEntrySummary?.attachText, sourceArtifacts])
  const workflowHasGeneratedSteps = workflow.nodes.some(
    (node) => node.type !== "input" && node.type !== "output",
  )
  const showCreateDraftSkeleton =
    viewMode === "list" &&
    selectedWorkflowPath != null &&
    (Boolean(
      selectedWorkflowPath && pendingCreateMessage[selectedWorkflowPath],
    ) ||
      ((chatStatus === "thinking" || chatStatus === "streaming") &&
        !workflowHasGeneratedSteps))
  const showResumeHeader = resolveShowResumeHeader({
    viewMode,
    runStatus,
    activeEntryState,
    resumeEntrySummary,
    showCreateDraftSkeleton,
    prepareNewRun,
  })
  const showIdleReviewMode =
    runStatus === "idle" &&
    activeEntryState === null &&
    !showCreateDraftSkeleton &&
    hasWorkflowReviewHistory({
      workflowPastRunsCount,
      hasSelectedPastRun,
    }) &&
    !prepareNewRun
  const showIdleInputPanel =
    viewMode === "list" &&
    runStatus === "idle" &&
    Boolean(inputNode) &&
    !showCreateDraftSkeleton &&
    !showResumeHeader &&
    !showIdleReviewMode
  const showProjectArtifactsPanel =
    Boolean(selectedProject) &&
    (projectArtifactsLoading ||
      Boolean(projectArtifactsError) ||
      combinedArtifactRecords.length > 0 ||
      (selectedWorkflowTemplateContext?.contractIn?.length ?? 0) > 0)

  return {
    activeEntryState,
    readyToRun,
    combinedArtifactRecords,
    nextStageTemplate,
    nextStageArtifacts,
    sourceArtifacts,
    entryStageLabel,
    entryFlowRules,
    startApprovalRequired,
    entryNextStepLabel,
    resumeEntrySummary,
    stageStartInputLabels,
    stageStartPolicyNotes,
    templateToolingRecommendation,
    stageStartTitle,
    stageStartFlowName,
    stageStartDescription,
    stageStartContextLine,
    stageStartProvenanceLabel,
    showCreateDraftSkeleton,
    showResumeHeader,
    showIdleReviewMode,
    showIdleInputPanel,
    showProjectArtifactsPanel,
  }
}
