import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAtom } from "jotai"
import { useWorkflowWithUndo } from "@/hooks/useWorkflowWithUndo"
import {
  chatStatusAtom,
  selectedProjectAtom,
  selectedInboxTaskKeyAtom,
  selectedWorkflowPathAtom,
  inputAttachmentsAtom,
  inputValueAtom,
  viewModeAtom,
  flowSurfaceModeAtom,
  chatPanelOpenAtom,
  workflowDirtyAtom,
  mainViewAtom,
  selectedWorkflowTemplateContextAtom,
  setWorkflowTemplateContextForKeyAtom,
  workflowCreatePendingMessageAtom,
  workflowEntryStateAtom,
  workflowQueuedAutoRunPathAtom,
  setWorkflowRequestedResultForKeyAtom,
  workflowSavedSnapshotAtom,
  chatPanelWidthAtom,
  workflowReviewModeAtom,
  workflowRunBlockReasonAtom,
  workflowOpenStateAtom,
  webSearchBackendAtom,
  workflowsAtom,
  desktopRuntimeAtom,
  openSkillPickerAtom,
  selectedNodeIdAtom,
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
import {
  buildProcessSpine,
  selectProcessSpineFactory,
} from "@/lib/process-spine"
import { Tabs } from "@/components/ui/tabs"
import type { Workflow } from "@shared/types"
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
import { WorkflowChatPanelShell } from "./workflow-panel/WorkflowChatPanelShell"
import {
  resolveSavedRunReviewRequested,
  resolveWorkflowReviewModes,
} from "./workflow-panel/review-mode"
import { WorkflowBlockedTaskPanel } from "./workflow-panel/WorkflowBlockedTaskPanel"
import { WorkflowPanelDialogs } from "./workflow-panel/WorkflowPanelDialogs"

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
  const [chatOpen, setChatOpen] = useAtom(chatPanelOpenAtom)
  const [chatPanelWidth] = useAtom(chatPanelWidthAtom)
  const [chatStatus] = useAtom(chatStatusAtom)
  const [workflowDirty] = useAtom(workflowDirtyAtom)
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
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
  const [showSavedRunReview, setShowSavedRunReview] = useState(false)

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
    listScrollRegionRef,
    outputPanelRef,
    chatPanelShellRef,
    chatPanelToggleRef,
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
    chatOpen,
    selectedWorkflowPath,
    workflowEntryState,
    setWorkflowOpenState,
    setWorkflowEntryState,
    setShowEntryEditor,
    setPrepareNewRun,
    setShowSavedRunReview,
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
    stageStartTitle,
    stageStartFlowName,
    stageStartDescription,
    stageStartContextLine,
    stageStartProvenanceLabel,
    showCreateDraftSkeleton,
    showResumeHeader: showEntryResumeHeader,
    showIdleReviewMode,
    showIdleInputPanel,
    showProjectArtifactsPanel,
  } = useWorkflowPanelEntryState({
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
  })
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
  const canShowAgentPanel = Boolean(selectedWorkflowPath)
  const {
    shellState,
    shellDetail,
    isRuntimeFlowView,
    listShellClass,
    idleStageContract,
    canShowTerminalResultSurface,
    liveTerminalResultOwnsLayout,
    showOutputPanel,
    resultSourceAttachments,
    resultSourceLabel,
    canUseInNewFlow,
    showIdleStageContract,
    showFlowEditor,
    showProcessSpine,
    primaryScreenState,
    reviewFlowHasSnapshot,
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
    flowSurfaceMode,
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
    effectiveResumeHeaderVisible: !!reviewedRunDetails?.snapshot,
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
    focusStageDetails,
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
    setWorkflowEntryState,
  })

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

  const isFlowEditing = effectiveResumeHeader
    ? showEntryEditor
    : flowSurfaceMode === "edit"
  const chainBuilderMode =
    shellState === "running" || shellState === "paused"
      ? "monitor"
      : reviewFlowHasSnapshot
        ? "monitor"
        : isFlowEditing
          ? "edit"
          : "outline"
  const showInlineProjectArtifactsPanel =
    showProjectArtifactsPanel &&
    primaryScreenState !== "fresh_start" &&
    primaryScreenState !== "cross_flow_handoff"

  const crossFlowTitle =
    primaryScreenState === "cross_flow_handoff"
      ? stageStartFlowName || workflow.name || null
      : null
  const crossFlowProvenanceLabel =
    primaryScreenState === "cross_flow_handoff"
      ? stageStartContextLine || null
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

  if (!selectedProject && !hasMeaningfulContent) {
    return (
      <EmptyWorkspaceState
        onOpenProject={() => {
          void window.api.addProject()
        }}
      />
    )
  }

  if (!selectedWorkflowPath && !hasMeaningfulContent) {
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
          agentToggleRef={chatPanelToggleRef}
        />

        {workflowOpenState.status === "loading" ? (
          <WorkflowOpenLoadingState
            flowLabel={workflowTitleFromPath(workflowOpenState.targetPath)}
          />
        ) : (
          <>
            {workflowOpenState.status === "error" && (
              <WorkflowOpenErrorBanner
                flowLabel={workflowTitleFromPath(workflowOpenState.targetPath)}
                message={workflowOpenState.message}
                onDismiss={clearWorkflowOpenState}
              />
            )}

            {crossFlowProvenanceLabel && (
              <div className="border-b border-hairline px-[var(--content-gutter)] py-1.5">
                <span className="ui-meta-text text-muted-foreground">
                  {crossFlowProvenanceLabel}
                </span>
              </div>
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
                showResumeHeader={
                  effectiveResumeHeader &&
                  primaryScreenState !== "fresh_start" &&
                  primaryScreenState !== "cross_flow_handoff"
                }
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
                inputPanelRef={inputPanelRef}
                showProjectArtifactsPanel={showInlineProjectArtifactsPanel}
                combinedArtifactRecords={combinedArtifactRecords}
                projectArtifactsLoading={projectArtifactsLoading}
                projectArtifactsError={projectArtifactsError}
                requiredContracts={selectedWorkflowTemplateContext?.contractIn}
                onOpenArtifact={(artifact) => {
                  void handleOpenArtifact(artifact)
                }}
                showIdleStageContract={showIdleStageContract}
                idleStageContract={idleStageContract}
                showIdleInputPanel={
                  showIdleInputPanel &&
                  primaryScreenState !== "blocked_decision"
                }
                showFlowEditor={showFlowEditor}
                chainBuilderMode={chainBuilderMode}
                onFocusStageDetails={focusStageDetails}
                reviewSnapshot={
                  showAnyReviewMode
                    ? (reviewedRunDetails?.snapshot ?? null)
                    : null
                }
                showReviewOutputMode={showAnyReviewMode}
                showReviewOutputPanel={
                  !showBlockedResumeHeader || blockedInspectionVisible
                }
                showLiveOutputPanel={showOutputPanel}
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
        />
      </div>

      {canShowAgentPanel && (
        <WorkflowChatPanelShell
          shellRef={chatPanelShellRef}
          open={chatOpen}
          width={chatPanelWidth}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  )
}
