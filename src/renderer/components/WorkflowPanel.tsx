import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAtom } from "jotai"
import { useWorkflowWithUndo } from "@/hooks/useWorkflowWithUndo"
import {
  chatFlowInputRequestAtom,
  chatStatusAtom,
  selectedProjectAtom,
  selectedInboxTaskKeyAtom,
  selectedWorkflowPathAtom,
  inputAttachmentsAtom,
  inputValueAtom,
  viewModeAtom,
  flowSurfaceModeAtom,
  workflowDirtyAtom,
  mainViewAtom,
  selectedWorkflowTemplateContextAtom,
  setWorkflowTemplateContextForKeyAtom,
  workflowCreatePendingMessageAtom,
  workflowEntryStateAtom,
  workflowQueuedAutoRunPathAtom,
  setWorkflowRequestedResultForKeyAtom,
  workflowSavedSnapshotAtom,
  selectedWorkflowContinuationEntryStateAtom,
  selectedWorkflowSavedRunReviewRequestedAtom,
  workflowReviewModeAtom,
  workflowRunBlockReasonAtom,
  workflowOpenStateAtom,
  webSearchBackendAtom,
  workflowsAtom,
  desktopRuntimeAtom,
  openSkillPickerAtom,
  selectedNodeIdAtom,
  routeAlternativesOpenAtom,
} from "@/lib/store"
import {
  activeNodeIdAtom,
  artifactPersistenceStatusAtom,
  artifactRecordsAtom,
  evalResultsAtom,
  finalContentAtom,
  nodeStatesAtom,
  reportPathAtom,
  runIdAtom,
  runStartedAtAtom,
  runOutcomeAtom,
  runStatusAtom,
  runtimeMetaAtom,
  runtimeNodesAtom,
  selectedPastRunAtom,
  surfaceNoticeAtom,
  workflowHistoryRunsAtom,
  workspaceAtom,
} from "@/features/execution"
import { Toolbar } from "./Toolbar"
import { BatchPanel } from "./BatchPanel"
import {
  EmptyProjectState,
  EmptyWorkspaceState,
} from "./workflow-panel/WorkflowPanelInlineSections"
import {
  WorkflowListTab,
  WorkflowSettingsTab,
} from "./workflow-panel/WorkflowPanelTabContents"
import {
  WorkflowOpenErrorBanner,
  WorkflowOpenLoadingState,
} from "./workflow-panel/WorkflowPanelChrome"
import { workflowHasMeaningfulContent } from "@/lib/workflow-content"
import { useWorkflowReset } from "@/hooks/useWorkflowReset"
import { useExecutionReset } from "@/hooks/useExecutionReset"
import { useWorkflowValidation } from "@/hooks/useWorkflowValidation"
import { useUndoRedo } from "@/hooks/useUndoRedo"
import { useChainExecution } from "@/hooks/useChainExecution"
import { useSelectedRunReview } from "@/hooks/useSelectedRunReview"
import { useWorkflowCreateNavigation } from "@/hooks/useWorkflowCreateNavigation"
import { useMcpIntegrationSetup } from "@/hooks/useMcpIntegrationSetup"
import { buildTemplateRoutingPreview } from "@/lib/create-routing-preview"
import {
  buildProcessSpine,
  selectProcessSpineFactory,
} from "@/lib/process-spine"
import {
  buildRoutedTemplateResultForTemplate,
  prepareRoutedTemplateLaunch,
} from "@/lib/routed-template-launch"
import { toastErrorFromCatch } from "@/lib/toast-error"
import { shouldAutoRunCreateStart } from "@/lib/workflow-create-start-policy"
import {
  getRequestedResultFromEntryState,
  type WorkflowEntryState,
} from "@/lib/workflow-entry"
import { isRunInFlight, toWorkflowExecutionKey } from "@/lib/workflow-execution"
import { Tabs } from "@/components/ui/tabs"
import { buildCreateEntryRouteSeed } from "@shared/create-entry-routing"
import type {
  CreateEntryRouteResult,
  Workflow,
  WorkflowTemplate,
} from "@shared/types"
import { ProcessSpine } from "@/components/ui/process-spine"
import { useWorkflowPanelResources } from "./workflow-panel/useWorkflowPanelResources"
import { useWorkflowBlockedResumeTask } from "./workflow-panel/useWorkflowBlockedResumeTask"
import { useWorkflowPanelContinuationActions } from "./workflow-panel/useWorkflowPanelContinuationActions"
import { useWorkflowPanelEntryActions } from "./workflow-panel/useWorkflowPanelEntryActions"
import { useWorkflowPanelEntryState } from "./workflow-panel/useWorkflowPanelEntryState"
import { useWorkflowPanelLifecycle } from "./workflow-panel/useWorkflowPanelLifecycle"
import { useWorkflowPanelOutputSurface } from "./workflow-panel/useWorkflowPanelOutputSurface"
import { useWorkflowPanelReviewState } from "./workflow-panel/useWorkflowPanelReviewState"
import { useWorkflowPanelShellDerivations } from "./workflow-panel/useWorkflowPanelShellDerivations"
import { useWorkflowStageLaunch } from "./workflow-panel/useWorkflowStageLaunch"
import { ChatPanel } from "./chat/ChatPanel"
import { SectionErrorBoundary } from "@/components/ui/error-boundary"
import {
  resolveSavedRunReviewRequested,
  resolveWorkflowReviewModes,
} from "./workflow-panel/review-mode"
import { resolveWorkflowListSurfaceIntent } from "./workflow-panel/screen-state"
import { WorkflowBlockedTaskPanel } from "./workflow-panel/WorkflowBlockedTaskPanel"
import { WorkflowPanelDialogs } from "./workflow-panel/WorkflowPanelDialogs"

function mergeTemplatesById(
  catalogs: WorkflowTemplate[][],
): WorkflowTemplate[] {
  const templatesById = new Map<string, WorkflowTemplate>()
  for (const catalog of catalogs) {
    for (const template of catalog) {
      templatesById.set(template.id, template)
    }
  }
  return Array.from(templatesById.values())
}

export function WorkflowPanel() {
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [selectedInboxTaskKey, setSelectedInboxTaskKey] = useAtom(
    selectedInboxTaskKeyAtom,
  )
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(
    selectedWorkflowPathAtom,
  )
  const { workflow, setWorkflow, setWorkflowDirect } = useWorkflowWithUndo()
  const [inputValue, setInputValue] = useAtom(inputValueAtom)
  const [inputAttachments, setInputAttachments] = useAtom(inputAttachmentsAtom)
  const [viewMode, setViewMode] = useAtom(viewModeAtom)
  const [chatStatus] = useAtom(chatStatusAtom)
  const [workflowDirty] = useAtom(workflowDirtyAtom)
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [webSearchBackend, setWebSearchBackend] = useAtom(webSearchBackendAtom)
  const [selectedWorkflowTemplateContext] = useAtom(
    selectedWorkflowTemplateContextAtom,
  )
  const [, setWorkflowTemplateContextForKey] = useAtom(
    setWorkflowTemplateContextForKeyAtom,
  )
  const [activeNodeId] = useAtom(activeNodeIdAtom)
  const [artifactPersistenceStatus] = useAtom(artifactPersistenceStatusAtom)
  const [artifactRecords] = useAtom(artifactRecordsAtom)
  const [evalResults] = useAtom(evalResultsAtom)
  const [finalContent] = useAtom(finalContentAtom)
  const [nodeStates] = useAtom(nodeStatesAtom)
  const [reportPath] = useAtom(reportPathAtom)
  const [runId] = useAtom(runIdAtom)
  const [runStartedAt] = useAtom(runStartedAtAtom)
  const [runOutcome] = useAtom(runOutcomeAtom)
  const [runStatus] = useAtom(runStatusAtom)
  const [runtimeMeta] = useAtom(runtimeMetaAtom)
  const [runtimeNodes] = useAtom(runtimeNodesAtom)
  const [surfaceNotice, setSurfaceNotice] = useAtom(surfaceNoticeAtom)
  const [workspace] = useAtom(workspaceAtom)
  const [pendingCreateMessage] = useAtom(workflowCreatePendingMessageAtom)
  const [workflowEntryState, setWorkflowEntryState] = useAtom(
    workflowEntryStateAtom,
  )
  const [workflowContinuationEntryState, setWorkflowContinuationEntryState] =
    useAtom(selectedWorkflowContinuationEntryStateAtom)
  const [queuedAutoRunPath, setQueuedAutoRunPath] = useAtom(
    workflowQueuedAutoRunPathAtom,
  )
  const [, setWorkflowRequestedResultForKey] = useAtom(
    setWorkflowRequestedResultForKeyAtom,
  )
  const [, setWorkflowReviewMode] = useAtom(workflowReviewModeAtom)
  const [, setWorkflowRunBlockReason] = useAtom(workflowRunBlockReasonAtom)
  const [workflowOpenState, setWorkflowOpenState] = useAtom(
    workflowOpenStateAtom,
  )
  const [, setMainView] = useAtom(mainViewAtom)
  const [selectedPastRun, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const [workflowPastRuns] = useAtom(workflowHistoryRunsAtom)
  const { run, cancel, rerunFrom, continueRun, continueWithWorkflow } =
    useChainExecution()
  const { openWorkflowCreate } = useWorkflowCreateNavigation()
  const [showEntryEditor, setShowEntryEditor] = useState(false)
  const [prepareNewRun, setPrepareNewRun] = useState(false)
  const [outputTabRequest, setOutputTabRequest] = useState<{
    tab: "nodes" | "log" | "result" | "history"
    nodeId?: string
    nonce: number
  } | null>(null)
  const blockedTaskAutoFocusKeyRef = useRef<string | null>(null)
  const [flowSurfaceMode, setFlowSurfaceMode] = useAtom(flowSurfaceModeAtom)
  const [desktopRuntime] = useAtom(desktopRuntimeAtom)
  const [, openSkillPicker] = useAtom(openSkillPickerAtom)
  const [, setSelectedNodeId] = useAtom(selectedNodeIdAtom)
  const idleReviewAutoScrollKeyRef = useRef<string | null>(null)
  const resetExecution = useExecutionReset({ preserveCompletedWork: true })
  const resetExecutionForFreshStart = useExecutionReset({
    clearSelectedPastRun: true,
  })
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [showSavedRunReview, setShowSavedRunReview] = useAtom(
    selectedWorkflowSavedRunReviewRequestedAtom,
  )
  const [routeAlternativesOpen, setRouteAlternativesOpen] = useAtom(
    routeAlternativesOpenAtom,
  )
  const [
    pendingRouteAlternativeTemplateId,
    setPendingRouteAlternativeTemplateId,
  ] = useState<string | null>(null)
  const [routeAlternativeCatalog, setRouteAlternativeCatalog] = useState<
    WorkflowTemplate[]
  >([])

  const LONG_RUNNING_THRESHOLD_MS = 2 * 60 * 1000

  const handleCancelRequest = useCallback(() => {
    if (
      runStartedAt &&
      Date.now() - runStartedAt >= LONG_RUNNING_THRESHOLD_MS
    ) {
      setCancelConfirmOpen(true)
      return
    }
    void cancel()
  }, [cancel, runStartedAt])

  const handleConfirmCancel = useCallback(() => {
    setCancelConfirmOpen(false)
    void cancel()
  }, [cancel])
  const {
    ensureSuggestedToolsReady,
    integrationSetupOpen,
    onIntegrationSetupOpenChange,
    integrationSetupStatus,
    integrationSetupValues,
    onIntegrationSetupValueChange,
    integrationSetupSaving,
    onConfirmIntegrationSetup,
    pendingRunMode: pendingIntegrationRunMode,
    resumeBlocked: integrationResumeBlocked,
    consumePendingRunMode,
  } = useMcpIntegrationSetup({
    projectPath: selectedProject,
    selectedWorkflowTemplateContext,
    webSearchBackend,
    onWebSearchBackendChange: setWebSearchBackend,
  })
  const {
    listScrollRegionRef,
    outputPanelRef,
    inputPanelRef,
    blockedTaskPanelRef,
    lastRunInputRef,
    elapsed,
    clearWorkflowOpenState,
    workflowTitleFromPath,
    scrollOutputPanelIntoListViewport,
    scrollOutputPanelToListViewportStart,
    focusInputPanel,
    focusBlockedTaskPanel,
  } = useWorkflowPanelLifecycle({
    runStatus,
    runStartedAt,
    inputValue,
    viewMode,
    selectedWorkflowPath,
    workflowEntryState,
    setWorkflowOpenState,
    setWorkflowEntryState,
    setShowEntryEditor,
    setFlowSurfaceMode,
    setPrepareNewRun,
    setShowSavedRunReview,
    setWorkflowContinuationEntryState,
    setOutputTabRequest,
    idleReviewAutoScrollKeyRef,
  })

  useWorkflowReset()
  useWorkflowValidation()
  useUndoRedo()
  const {
    projectArtifacts,
    projectCaseStates,
    projectArtifactsLoading,
    projectArtifactsError,
    factoryBlueprint,
    packTemplates,
  } = useWorkflowPanelResources({
    selectedProject,
    selectedWorkflowTemplateContext,
    artifactRecords,
  })
  const {
    activeEntryState,
    readyToRun,
    combinedArtifactRecords,
    nextStageTemplate,
    nextStageArtifacts,
    sourceArtifacts,
    entryStageLabel,
    resumeEntrySummary,
    entryFlowRules,
    startApprovalRequired,
    entryNextStepLabel,
    stageStartInputLabels,
    stageStartPolicyNotes,
    templateToolingRecommendation,
    stageStartTitle,
    stageStartFlowName,
    stageStartDescription,
    stageStartContextLine,
    stageStartProvenanceLabel,
    showCreateDraftSkeleton,
    showResumeHeader: showEntryResumeHeader,
    showIdleReviewMode,
    showProjectArtifactsPanel,
  } = useWorkflowPanelEntryState({
    workflow,
    selectedWorkflowPath,
    workflowEntryState,
    workflowContinuationEntryState,
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
    workflowPastRunsCount: workflowPastRuns.length,
    hasSelectedPastRun: selectedPastRun !== null,
    prepareNewRun,
    projectArtifactsLoading,
    projectArtifactsError,
    selectedProject,
  })
  const {
    stageStartGateOpen,
    handleRunRequest,
    handleApproveStageStart,
    handleCancelStageStart,
    queuePreparedStageAutoRun,
    runNextStage,
    launchingNextStage,
    runLaunchPending,
  } = useWorkflowStageLaunch({
    run,
    startApprovalRequired,
    runStatus,
    selectedProject,
    nextStageTemplate,
    nextStageArtifacts,
    webSearchBackend,
    selectedWorkflowTemplateContext,
    selectedWorkflowPath,
    queuedAutoRunPath,
    setQueuedAutoRunPath,
    beforeRun: ensureSuggestedToolsReady,
  })
  useEffect(() => {
    if (pendingIntegrationRunMode === null || integrationResumeBlocked) return
    const mode = consumePendingRunMode()
    if (!mode) return
    void handleRunRequest(mode)
  }, [
    consumePendingRunMode,
    handleRunRequest,
    integrationResumeBlocked,
    pendingIntegrationRunMode,
  ])

  // Chat-as-composer: when the chat input sets chatFlowInputRequestAtom,
  // trigger a flow run on the next render (after inputValueAtom has propagated).
  const [chatFlowInputRequest, setChatFlowInputRequest] = useAtom(
    chatFlowInputRequestAtom,
  )
  useEffect(() => {
    if (!chatFlowInputRequest) return
    if (isRunInFlight(runStatus)) {
      setChatFlowInputRequest(null)
      return
    }
    const request = chatFlowInputRequest
    setChatFlowInputRequest(null)
    if (request.kind === "rerun" && request.fromNodeId) {
      void rerunFrom(request.fromNodeId, { workspace: request.workspace })
    } else {
      void handleRunRequest()
    }
  }, [
    chatFlowInputRequest,
    handleRunRequest,
    rerunFrom,
    runStatus,
    setChatFlowInputRequest,
  ])

  const {
    selectedResumeTask,
    resumeTaskAnswers,
    resumeTaskSubmitting,
    blockedResumeSummary,
    selectedResumeTaskStageMeta,
    blockedEntryState,
    hasBlockedResumeState,
    showBlockedResumeHeader,
    handleResumeTaskFieldChange,
    handleSubmitResumeTask,
    handleSubmitResumeTaskAndContinue,
    handleRejectResumeTask,
  } = useWorkflowBlockedResumeTask({
    selectedInboxTaskKey,
    selectedWorkflowPath,
    setSelectedInboxTaskKey,
    combinedArtifactRecords,
    workflow,
    nodeStates,
    evalResults,
    runStatus,
    hasActiveEntryState: activeEntryState !== null,
    showCreateDraftSkeleton,
    viewMode,
    onSelectPastRun: setSelectedPastRun,
    onPrepareNewRun: () => {
      setPrepareNewRun(true)
      setViewMode("list")
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const inputPanel = inputPanelRef.current
          if (!inputPanel) return
          inputPanel.scrollIntoView({ behavior: "smooth", block: "start" })
          window.requestAnimationFrame(() => {
            const focusTarget = inputPanel.querySelector<HTMLElement>(
              "textarea, input, [contenteditable='true']",
            )
            focusTarget?.focus()
          })
        })
      })
    },
    continueWithWorkflow: async (
      runToContinue,
      workflowForRun,
      workflowPathForRun,
    ) => {
      await continueWithWorkflow(
        runToContinue,
        workflowForRun,
        workflowPathForRun,
      )
    },
  })
  const effectiveEntryState = activeEntryState || blockedEntryState
  const effectiveResumeHeader = showEntryResumeHeader || showBlockedResumeHeader
  const effectiveEntryStageLabel =
    blockedResumeSummary?.currentStepLabel || entryStageLabel
  const savedRunReviewRequested = resolveSavedRunReviewRequested({
    showSavedRunReview,
    hasSelectedPastRun: selectedPastRun !== null,
  })
  const {
    showAnyReviewMode,
    showResumeReviewMode,
    showStandaloneIdleReviewMode,
  } = resolveWorkflowReviewModes({
    showIdleReviewMode: showIdleReviewMode && savedRunReviewRequested,
    showBlockedResumeHeader,
    selectedPastRunStatus: selectedPastRun?.status,
  })
  const processSpineFactory = useMemo(
    () =>
      selectProcessSpineFactory(
        factoryBlueprint,
        selectedWorkflowTemplateContext,
      ),
    [factoryBlueprint, selectedWorkflowTemplateContext],
  )
  const processSpineStages = useMemo(
    () =>
      buildProcessSpine({
        context: selectedWorkflowTemplateContext,
        nextTemplate: nextStageTemplate,
        templates: packTemplates,
        factory: processSpineFactory,
        runStatus,
        runOutcome,
        reviewingPastRun: showStandaloneIdleReviewMode,
      }),
    [
      nextStageTemplate,
      packTemplates,
      processSpineFactory,
      runOutcome,
      runStatus,
      selectedWorkflowTemplateContext,
      showStandaloneIdleReviewMode,
    ],
  )

  const hasMeaningfulContent = workflowHasMeaningfulContent(workflow)
  const {
    reviewedRun,
    reviewedRunDetails,
    reviewedRunLoading,
    reviewedRunError,
  } = useSelectedRunReview(showAnyReviewMode)
  const {
    shellState,
    shellDetail,
    isRuntimeFlowView,
    listShellClass,
    idleStageContract,
    canShowTerminalResultSurface,
    liveTerminalResultOwnsLayout,
    resultSourceAttachments,
    resultSourceLabel,
    canUseInNewFlow,
    showProcessSpine,
    primaryScreenState,
  } = useWorkflowPanelShellDerivations({
    workflow,
    runtimeNodes,
    runtimeMeta,
    nodeStates,
    runStatus,
    runOutcome,
    activeNodeId,
    hasBlockedResumeState,
    effectiveResumeHeader,
    viewMode,
    showAnyReviewMode,
    selectedPastRunStatus: selectedPastRun?.status,
    showCreateDraftSkeleton,
    prepareNewRun,
    finalContent,
    reportPath,
    artifactRecords,
    runId,
    workspace,
    selectedProject,
    hasActiveEntryState: activeEntryState !== null,
    hasSourceArtifacts: sourceArtifacts.length > 0,
    nextStageTemplate,
    stageStartTitle,
    stageStartDescription,
    stageStartContextLine,
    stageStartProvenanceLabel,
    stageStartInputLabels,
    templateOutputText: selectedWorkflowTemplateContext?.outputText,
    workflowName: workflow.name,
    elapsed,
  })
  const {
    blockedInspectionVisible,
    requestOutputTab,
    openResult,
    handleSurfaceNoticeAction,
    handleOpenArtifact,
  } = useWorkflowPanelOutputSurface({
    showBlockedResumeHeader,
    blockedTaskKey: selectedResumeTask
      ? `${selectedResumeTask.taskId}:${selectedResumeTask.sourceRunId}`
      : null,
    canShowTerminalResultSurface,
    showAnyReviewMode,
    runStatus,
    surfaceNotice,
    outputPanelRef,
    scrollOutputPanelIntoListViewport,
    setMainView,
    setSurfaceNotice,
    setViewMode,
    setOutputTabRequest,
  })
  const { handleStartNewRun, openEditFlow } = useWorkflowPanelReviewState({
    runStatus,
    runOutcome,
    runId,
    selectedWorkflowPath,
    selectedPastRun,
    workflowPastRuns,
    selectedResumeTask,
    inputValue,
    lastRunInputRef,
    prepareNewRun,
    showSavedRunReview,
    showAnyReviewMode,
    viewMode,
    hasBlockedResumeState,
    canShowTerminalResultSurface,
    outputPanelRef,
    idleReviewAutoScrollKeyRef,
    resetExecution,
    resetExecutionForFreshStart,
    setInputValue,
    setSelectedPastRun,
    setPrepareNewRun,
    setShowSavedRunReview,
    setWorkflowReviewMode,
    setWorkflowRunBlockReason,
    setOutputTabRequest,
    setViewMode,
    setFlowSurfaceMode,
    focusInputPanel,
    openResult,
    scrollOutputPanelToListViewportStart,
  })
  const {
    handleRunNextStage,
    useInNewFlowOpen,
    setUseInNewFlowOpen,
    useInNewFlowLoading,
    useInNewFlowPending,
    selectedUseInNewFlowTemplateId,
    setSelectedUseInNewFlowTemplateId,
    useInNewFlowIntent,
    setUseInNewFlowIntent,
    suggestedUseInNewFlowTemplates,
    handleOpenUseInNewFlow,
    handleConfirmUseInNewFlow,
  } = useWorkflowPanelContinuationActions({
    selectedProject,
    canUseInNewFlow,
    artifactRecords,
    resultSourceAttachments,
    webSearchBackend,
    openWorkflowCreate,
    queuePreparedStageAutoRun,
    runNextStage,
    focusInputPanel,
    setWorkflows,
    setSelectedWorkflowPath,
    setWorkflowDirect,
    setWorkflowSavedSnapshot,
    setInputValue,
    setWorkflowEntryState,
    setWorkflowContinuationEntryState,
    setWorkflowRequestedResultForKey,
    setWorkflowTemplateContextForKey,
    setSelectedInboxTaskKey,
    setSelectedPastRun,
    setPrepareNewRun,
    setWorkflowReviewMode,
    setMainView,
    setViewMode,
    setOutputTabRequest,
    setInputAttachments,
  })

  const sharedOutputPanelProps = useMemo(
    () => ({
      onRerunFrom: rerunFrom,
      onContinueRun: continueRun,
      requestedTab: outputTabRequest,
      reviewedRun,
      reviewedRunDetails,
      reviewedRunLoading,
      reviewedRunError,
      onStartNewRun: handleStartNewRun,
      onOpenInbox: () => setMainView("inbox"),
      onOpenArtifacts: () => setMainView("artifacts"),
      onEditFlow: openEditFlow,
      onUseInNewFlow: canUseInNewFlow ? handleOpenUseInNewFlow : null,
      nextStageTemplate,
      nextStageArtifacts,
      onRunNextStage:
        selectedProject && nextStageTemplate ? handleRunNextStage : null,
      nextStagePending: launchingNextStage,
    }),
    [
      canUseInNewFlow,
      handleOpenUseInNewFlow,
      continueRun,
      handleRunNextStage,
      handleStartNewRun,
      launchingNextStage,
      nextStageArtifacts,
      nextStageTemplate,
      outputTabRequest,
      rerunFrom,
      reviewedRun,
      reviewedRunDetails,
      reviewedRunError,
      reviewedRunLoading,
      openEditFlow,
      selectedProject,
      setMainView,
    ],
  )
  const {
    handleAddSkillSelection,
    handleAttachCapability,
    handleDismissEntry,
  } = useWorkflowPanelEntryActions({
    effectiveEntryStageLabel,
    blockedResumeSummary,
    openSkillPicker,
    setWorkflow,
    setSelectedNodeId,
    setShowEntryEditor,
    setFlowSurfaceMode,
    setPrepareNewRun,
    setSelectedInboxTaskKey,
    setWorkflowContinuationEntryState,
    setWorkflowEntryState,
  })
  const routeAlternativeTemplateIds =
    effectiveEntryState?.routing?.alternateTemplateIds || []
  const routeAlternativeTemplateIdsKey = routeAlternativeTemplateIds.join("|")
  const routeAlternativeCatalogTemplates = useMemo(
    () => mergeTemplatesById([packTemplates, routeAlternativeCatalog]),
    [packTemplates, routeAlternativeCatalog],
  )
  const missingRouteAlternativeTemplateIds = useMemo(
    () =>
      routeAlternativeTemplateIds.filter(
        (templateId) =>
          !routeAlternativeCatalogTemplates.some(
            (template) => template.id === templateId,
          ),
      ),
    [routeAlternativeCatalogTemplates, routeAlternativeTemplateIds],
  )
  const missingRouteAlternativeTemplateIdsKey =
    missingRouteAlternativeTemplateIds.join("|")

  useEffect(() => {
    if (routeAlternativeTemplateIds.length === 0) {
      setRouteAlternativeCatalog([])
      return
    }
    if (missingRouteAlternativeTemplateIds.length === 0) {
      return
    }

    let cancelled = false
    void window.api
      .listTemplates()
      .then((templates) => {
        if (cancelled) return
        setRouteAlternativeCatalog(templates)
      })
      .catch((error) => {
        if (cancelled) return
        console.error(
          "[WorkflowPanel] failed to load route alternative templates:",
          error,
        )
        toastErrorFromCatch("Could not load other starts", error)
      })

    return () => {
      cancelled = true
    }
  }, [missingRouteAlternativeTemplateIdsKey, routeAlternativeTemplateIdsKey])

  const routeAlternativeOptions = useMemo(() => {
    if (
      routeAlternativeTemplateIds.length === 0 ||
      routeAlternativeCatalogTemplates.length === 0
    ) {
      return []
    }

    return routeAlternativeTemplateIds.flatMap((templateId) => {
      const template =
        routeAlternativeCatalogTemplates.find(
          (candidate) => candidate.id === templateId,
        ) || null
      if (!template) return []

      const preview = buildTemplateRoutingPreview({
        template,
        templates: routeAlternativeCatalogTemplates,
      })
      return [
        {
          templateId,
          title: preview.title,
          helpModeLabel: preview.helpModeLabel,
          stageLabel: preview.stageLabel,
        },
      ]
    })
  }, [routeAlternativeCatalogTemplates, routeAlternativeTemplateIds])
  const canShowRouteAlternatives = Boolean(
    selectedProject &&
    effectiveEntryState?.routing?.source === "agent" &&
    effectiveEntryState.routing.projectInspection &&
    routeAlternativeOptions.length > 0,
  )

  const buildActiveRouteResult = useCallback(
    (entryState: WorkflowEntryState): CreateEntryRouteResult | null => {
      const projectInspection = entryState.routing?.projectInspection
      if (!projectInspection) return null

      return {
        recommendedTemplateId:
          selectedWorkflowTemplateContext?.templateId ||
          "delivery-shape-project",
        alternateTemplateIds: entryState.routing?.alternateTemplateIds || [],
        reason:
          entryState.routing?.reason ||
          "Recommended from the current request and project context.",
        projectInspection,
        seed: buildCreateEntryRouteSeed(
          selectedWorkflowTemplateContext?.templateId ||
            "delivery-shape-project",
          projectInspection,
          getRequestedResultFromEntryState(entryState),
        ),
        domainMode: entryState.routing?.domainMode || "development",
        confidence: entryState.routing?.confidence ?? 0.8,
        source: "agent",
        clarification: null,
      }
    },
    [selectedWorkflowTemplateContext?.templateId],
  )
  const handleSelectRouteAlternative = useCallback(
    async (templateId: string) => {
      if (
        !selectedProject ||
        !effectiveEntryState ||
        pendingRouteAlternativeTemplateId
      ) {
        return
      }

      const baseRouteResult = buildActiveRouteResult(effectiveEntryState)
      if (!baseRouteResult) return

      const requestedResult =
        getRequestedResultFromEntryState(effectiveEntryState)
      const currentTemplateId =
        selectedWorkflowTemplateContext?.templateId || null
      const nextAlternateTemplateIds = [
        ...(currentTemplateId ? [currentTemplateId] : []),
        ...routeAlternativeTemplateIds,
      ].filter(
        (candidate, index, values) =>
          candidate !== templateId && values.indexOf(candidate) === index,
      )

      setPendingRouteAlternativeTemplateId(templateId)
      try {
        const availableTemplates =
          routeAlternativeCatalogTemplates.length > 0
            ? routeAlternativeCatalogTemplates
            : packTemplates.length > 0
              ? packTemplates
              : await window.api.listTemplates(selectedProject)
        const nextTemplate =
          availableTemplates.find((template) => template.id === templateId) ||
          null
        if (!nextTemplate) {
          throw new Error("This starting point is no longer available.")
        }

        const nextRouteResult = buildRoutedTemplateResultForTemplate({
          routeResult: baseRouteResult,
          templateId,
          requestedResult,
          alternateTemplateIds: nextAlternateTemplateIds,
        })
        const launch = await prepareRoutedTemplateLaunch({
          projectPath: selectedProject,
          template: nextTemplate,
          webSearchBackend,
          routeResult: nextRouteResult,
          requestedResult,
          sourceArtifacts,
        })

        setWorkflows(launch.refreshedWorkflows)
        setSelectedWorkflowPath(launch.filePath)
        setWorkflowDirect(launch.loadedWorkflow)
        setWorkflowSavedSnapshot(launch.savedSnapshot)
        setInputValue(launch.templateStartState.initialInputValue)
        setInputAttachments(launch.templateStartState.initialAttachments)
        setWorkflowEntryState(launch.templateStartState.entryState)
        setWorkflowContinuationEntryState(
          launch.templateStartState.templateContext?.sourceArtifactIds?.length
            ? launch.templateStartState.entryState
            : null,
        )
        setWorkflowRequestedResultForKey({
          key: toWorkflowExecutionKey(launch.filePath),
          value:
            getRequestedResultFromEntryState(
              launch.templateStartState.entryState,
            ) || null,
        })
        setWorkflowTemplateContextForKey({
          key: toWorkflowExecutionKey(launch.filePath),
          context: launch.templateStartState.templateContext,
        })
        setQueuedAutoRunPath(
          shouldAutoRunCreateStart(nextRouteResult, nextTemplate)
            ? launch.filePath
            : null,
        )
        setSelectedInboxTaskKey(null)
        setSelectedPastRun(null)
        setPrepareNewRun(false)
        setWorkflowReviewMode(false)
        setViewMode("chat")
        setOutputTabRequest(null)
        setMainView("thread")
        setRouteAlternativesOpen(false)
      } catch (error) {
        toastErrorFromCatch("Could not switch starting point", error)
      } finally {
        setPendingRouteAlternativeTemplateId(null)
      }
    },
    [
      buildActiveRouteResult,
      effectiveEntryState,
      packTemplates,
      pendingRouteAlternativeTemplateId,
      routeAlternativeCatalogTemplates,
      routeAlternativeTemplateIds,
      selectedProject,
      selectedWorkflowTemplateContext?.templateId,
      setInputAttachments,
      setInputValue,
      setMainView,
      setOutputTabRequest,
      setPrepareNewRun,
      setQueuedAutoRunPath,
      setRouteAlternativesOpen,
      setSelectedInboxTaskKey,
      setSelectedPastRun,
      setSelectedWorkflowPath,
      setViewMode,
      setWorkflowDirect,
      setWorkflowEntryState,
      setWorkflowContinuationEntryState,
      setWorkflowRequestedResultForKey,
      setWorkflowReviewMode,
      setWorkflowSavedSnapshot,
      setWorkflowTemplateContextForKey,
      setWorkflows,
      sourceArtifacts,
      webSearchBackend,
    ],
  )

  const blockedTaskPanel =
    showBlockedResumeHeader && selectedResumeTask ? (
      <WorkflowBlockedTaskPanel
        panelRef={blockedTaskPanelRef}
        selectedTask={selectedResumeTask}
        taskSubmitting={resumeTaskSubmitting}
        taskAnswers={resumeTaskAnswers}
        selectedTaskStageMeta={selectedResumeTaskStageMeta}
        blockedResumeSummary={blockedResumeSummary}
        showResumeReviewMode={showResumeReviewMode}
        onFieldChange={handleResumeTaskFieldChange}
        onSubmit={() => {
          void handleSubmitResumeTask()
        }}
        onSubmitAndContinue={() => {
          void handleSubmitResumeTaskAndContinue()
        }}
        onReject={() => {
          void handleRejectResumeTask()
        }}
        onInspect={() => requestOutputTab("result")}
      />
    ) : null

  const flowGraphOpen = flowSurfaceMode === "edit" || showEntryEditor
  const showSavedWorkResumeHeader =
    effectiveResumeHeader &&
    primaryScreenState !== "fresh_start" &&
    primaryScreenState !== "cross_flow_handoff" &&
    blockedResumeSummary === null
  const listSurfaceIntent = resolveWorkflowListSurfaceIntent({
    primaryScreenState,
    showResumeHeader: showSavedWorkResumeHeader,
    readyToRun,
  })
  const showInlineProjectArtifactsPanel =
    showProjectArtifactsPanel &&
    primaryScreenState !== "fresh_start" &&
    primaryScreenState !== "cross_flow_handoff"

  const crossFlowTitle =
    primaryScreenState === "cross_flow_handoff"
      ? stageStartFlowName || workflow.name || null
      : null

  useEffect(() => {
    const blockedTaskFocusKey =
      showBlockedResumeHeader && selectedResumeTask
        ? `${selectedResumeTask.workspace}::${selectedResumeTask.taskId}`
        : null

    if (!blockedTaskFocusKey) {
      blockedTaskAutoFocusKeyRef.current = null
      return
    }

    if (blockedTaskAutoFocusKeyRef.current === blockedTaskFocusKey) return
    blockedTaskAutoFocusKeyRef.current = blockedTaskFocusKey

    if (viewMode !== "list") {
      setViewMode("list")
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        focusBlockedTaskPanel()
      })
    })
  }, [
    focusBlockedTaskPanel,
    selectedResumeTask,
    setViewMode,
    showBlockedResumeHeader,
    viewMode,
  ])

  useEffect(() => {
    if (!canShowRouteAlternatives && routeAlternativesOpen) {
      setRouteAlternativesOpen(false)
    }
  }, [canShowRouteAlternatives, routeAlternativesOpen])

  // In chat mode without a workflow, render just the chat (no Toolbar/runtime hooks).
  // This handles "New workflow" from sidebar — user types request → routing creates workflow.
  if (viewMode === "chat" && !selectedWorkflowPath) {
    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <SectionErrorBoundary sectionName="Flow chat">
          <ChatPanel embedded onClose={() => setViewMode("list")} />
        </SectionErrorBoundary>
      </div>
    )
  }

  if (!selectedProject && !hasMeaningfulContent) {
    return (
      <EmptyWorkspaceState
        onOpenProject={() => {
          void window.api.addProject()
        }}
      />
    )
  }

  if (
    !selectedWorkflowPath &&
    !hasMeaningfulContent &&
    viewMode !== "settings"
  ) {
    return (
      <EmptyProjectState
        onOpenTemplates={() => setMainView("templates")}
        onQuickStart={(prompt) => openWorkflowCreate({ prompt })}
      />
    )
  }

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      {/* Main workflow editor area */}
      <div
        role="region"
        aria-label="Flow workspace"
        className="flex-1 min-h-0 flex flex-col overflow-hidden min-w-0"
      >
        <Toolbar
          onRun={handleRunRequest}
          onCancel={handleCancelRequest}
          shellState={shellState}
          entryTitle={effectiveEntryState?.title}
          crossFlowTitle={crossFlowTitle}
          shellDetail={shellDetail}
          runLaunchPending={runLaunchPending}
        />

        {workflowOpenState.status === "loading" ? (
          <WorkflowOpenLoadingState
            flowLabel={workflowTitleFromPath(workflowOpenState.targetPath)}
          />
        ) : viewMode === "chat" ? (
          <SectionErrorBoundary sectionName="Flow chat">
            <ChatPanel
              embedded
              onClose={() => setViewMode("list")}
              routeAlternatives={
                canShowRouteAlternatives ? routeAlternativeOptions : undefined
              }
              pendingRouteAlternativeId={pendingRouteAlternativeTemplateId}
              onSelectRouteAlternative={(templateId) => {
                void handleSelectRouteAlternative(templateId)
              }}
              resultSourceAttachments={resultSourceAttachments}
            />
          </SectionErrorBoundary>
        ) : (
          <>
            {workflowOpenState.status === "error" && (
              <WorkflowOpenErrorBanner
                flowLabel={workflowTitleFromPath(workflowOpenState.targetPath)}
                message={workflowOpenState.message}
                onDismiss={clearWorkflowOpenState}
              />
            )}

            <Tabs
              value={viewMode}
              onValueChange={(next) => setViewMode(next as "list" | "settings")}
              className="flex-1 min-h-0 flex flex-col overflow-hidden"
            >
              {showProcessSpine &&
                processSpineStages &&
                processSpineStages.length > 1 && (
                  <div className="border-b border-hairline">
                    <div className="ui-dialog-gutter py-2">
                      <ProcessSpine
                        stages={processSpineStages}
                        isLive={
                          runStatus === "running" || runStatus === "cancelling"
                        }
                      />
                    </div>
                  </div>
                )}

              <WorkflowSettingsTab
                surfaceNotice={surfaceNotice}
                onSurfaceNoticeAction={handleSurfaceNoticeAction}
                onDismissSurfaceNotice={() => setSurfaceNotice(null)}
              />

              <WorkflowListTab
                listScrollRegionRef={listScrollRegionRef}
                listShellClass={listShellClass}
                showCreateDraftSkeleton={showCreateDraftSkeleton}
                listSurfaceIntent={listSurfaceIntent}
                activeEntryState={effectiveEntryState}
                workflowName={workflow.name}
                readyToRun={readyToRun}
                startApprovalRequired={startApprovalRequired}
                entryStageLabel={effectiveEntryStageLabel}
                resumeEntrySummary={resumeEntrySummary}
                blockedResumeSummary={blockedResumeSummary}
                entryNextStepLabel={entryNextStepLabel}
                stageStartInputLabels={stageStartInputLabels}
                entryFlowRules={entryFlowRules}
                templateToolingRecommendation={templateToolingRecommendation}
                onTemplateToolingAction={
                  templateToolingRecommendation?.action === "switch_to_exa"
                    ? () => setWebSearchBackend("exa")
                    : null
                }
                onPrimaryEntryAction={() => {
                  if (blockedResumeSummary) {
                    focusBlockedTaskPanel()
                    return
                  }
                  if (readyToRun) {
                    void handleRunRequest()
                    return
                  }
                  focusInputPanel()
                }}
                onSecondaryEntryAction={
                  canShowRouteAlternatives
                    ? () => setRouteAlternativesOpen(true)
                    : null
                }
                secondaryEntryActionLabel={
                  canShowRouteAlternatives ? "Other starts" : null
                }
                inputPanelRef={inputPanelRef}
                showProjectArtifactsPanel={showInlineProjectArtifactsPanel}
                combinedArtifactRecords={combinedArtifactRecords}
                projectArtifactsLoading={projectArtifactsLoading}
                projectArtifactsError={projectArtifactsError}
                requiredContracts={selectedWorkflowTemplateContext?.contractIn}
                onOpenArtifact={(artifact) => {
                  void handleOpenArtifact(artifact)
                }}
                idleStageContract={idleStageContract}
                reviewMode={showAnyReviewMode}
                reviewOutputVisible={
                  !showBlockedResumeHeader || blockedInspectionVisible
                }
                terminalResultOwnsLayout={liveTerminalResultOwnsLayout}
                blockedTaskPanel={blockedTaskPanel}
                outputPanelRef={outputPanelRef}
                outputPanelProps={sharedOutputPanelProps}
              />
            </Tabs>
          </>
        )}

        <BatchPanel />
        <WorkflowPanelDialogs
          skillPickerStageLabel={
            effectiveResumeHeader && !showEntryEditor
              ? effectiveEntryStageLabel
              : null
          }
          onAddSkill={handleAddSkillSelection}
          stageStartGateOpen={stageStartGateOpen}
          stageStartFlowName={stageStartFlowName}
          stageStartTitle={stageStartTitle}
          stageLabel={effectiveEntryStageLabel}
          stageStartDescription={stageStartDescription}
          entryFlowRules={entryFlowRules}
          expectedArtifact={
            selectedWorkflowTemplateContext?.outputText ||
            effectiveEntryState?.outputText ||
            "A reviewable result"
          }
          inputPreview={inputValue}
          inputLabels={stageStartInputLabels}
          notes={stageStartPolicyNotes}
          shortcutLabel={`${desktopRuntime.primaryModifierLabel}↵`}
          primaryModifierKey={desktopRuntime.primaryModifierKey}
          onApproveStageStart={handleApproveStageStart}
          onCancelStageStart={handleCancelStageStart}
          cancelConfirmOpen={cancelConfirmOpen}
          onCancelConfirmOpenChange={setCancelConfirmOpen}
          runStartedAt={runStartedAt}
          onConfirmCancel={handleConfirmCancel}
          useInNewFlowOpen={useInNewFlowOpen}
          onUseInNewFlowOpenChange={setUseInNewFlowOpen}
          projectName={
            selectedProject
              ? selectedProject.split(/[\\/]/).pop() || selectedProject
              : null
          }
          sourceLabel={resultSourceLabel}
          suggestedTemplates={suggestedUseInNewFlowTemplates}
          selectedTemplateId={selectedUseInNewFlowTemplateId}
          onSelectTemplate={(templateId) => {
            setSelectedUseInNewFlowTemplateId(templateId)
            if (templateId) {
              setUseInNewFlowIntent("")
            }
          }}
          intent={useInNewFlowIntent}
          onIntentChange={(value) => {
            setUseInNewFlowIntent(value)
            if (value.trim()) {
              setSelectedUseInNewFlowTemplateId(null)
            }
          }}
          loading={useInNewFlowLoading}
          pending={useInNewFlowPending}
          onConfirmUseInNewFlow={() => {
            void handleConfirmUseInNewFlow()
          }}
          flowGraphOpen={flowGraphOpen}
          onFlowGraphOpenChange={(open) => {
            setFlowSurfaceMode(open ? "edit" : "outline")
            if (open) {
              void window.api
                .trackUiEvent("graph_editor_opened")
                .catch(() => undefined)
            }
            if (!open) {
              setShowEntryEditor(false)
            }
          }}
          routeAlternativesOpen={routeAlternativesOpen}
          onRouteAlternativesOpenChange={setRouteAlternativesOpen}
          routeAlternativeOptions={routeAlternativeOptions}
          pendingRouteAlternativeTemplateId={pendingRouteAlternativeTemplateId}
          onSelectRouteAlternative={(templateId) => {
            void handleSelectRouteAlternative(templateId)
          }}
          integrationSetupOpen={integrationSetupOpen}
          onIntegrationSetupOpenChange={onIntegrationSetupOpenChange}
          integrationSetupStatus={integrationSetupStatus}
          integrationSetupValues={integrationSetupValues}
          onIntegrationSetupValueChange={onIntegrationSetupValueChange}
          integrationSetupSaving={integrationSetupSaving}
          onConfirmIntegrationSetup={() => {
            void onConfirmIntegrationSetup()
          }}
        />
      </div>
    </div>
  )
}
