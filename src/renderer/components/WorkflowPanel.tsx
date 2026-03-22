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
  workflowSavedSnapshotAtom,
  chatPanelWidthAtom,
  workflowReviewModeAtom,
  workflowRunBlockReasonAtom,
  workflowOpenStateAtom,
  webSearchBackendAtom,
  workflowsAtom,
  desktopRuntimeAtom,
  skillPickerOpenAtom,
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
  type WorkflowPanelShellState,
} from "./workflow-panel/WorkflowPanelChrome"
import { workflowHasMeaningfulContent } from "@/lib/workflow-content"
import { useWorkflowReset } from "@/hooks/useWorkflowReset"
import { useExecutionReset } from "@/hooks/useExecutionReset"
import { useWorkflowValidation } from "@/hooks/useWorkflowValidation"
import { useUndoRedo } from "@/hooks/useUndoRedo"
import { useChainExecution } from "@/hooks/useChainExecution"
import { useSelectedRunReview } from "@/hooks/useSelectedRunReview"
import { useWorkflowCreateNavigation } from "@/hooks/useWorkflowCreateNavigation"
import { prepareTemplateStageLaunch } from "@/lib/factory-launch"
import { buildProcessSpine, selectProcessSpineFactory } from "@/lib/process-spine"
import { toast } from "sonner"
import { toastError, toastErrorFromCatch } from "@/lib/toast-error"
import { Tabs } from "@/components/ui/tabs"
import {
  contextAutoRunsOnContinue,
  contextRequiresStartApproval,
} from "@/lib/stage-run-policy"
import {
  buildArtifactInputAttachments,
  deriveTemplateContinuationLabel,
  deriveTemplateDisplayLabel,
  deriveTemplateJobLabel,
  selectArtifactsForTemplateContracts,
} from "@/lib/workflow-entry"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import type {
  ArtifactRecord,
  HumanTaskField,
  HumanTaskSnapshot,
  PermissionMode,
  Workflow,
  WorkflowTemplate,
} from "@shared/types"
import { buildRunProgressSummary, formatElapsedTime } from "@/lib/run-progress"
import { ProcessSpine } from "@/components/ui/process-spine"
import { addSkillNodeToWorkflow } from "@/lib/workflow-mutations"
import type { DiscoveredSkill } from "@shared/types"
import { CancelFlowConfirmDialog } from "./workflow-panel/CancelFlowConfirmDialog"
import { useWorkflowPanelResources } from "./workflow-panel/useWorkflowPanelResources"
import { useWorkflowPanelEntryState } from "./workflow-panel/useWorkflowPanelEntryState"
import { WorkflowPanelOverlays } from "./workflow-panel/WorkflowPanelOverlays"
import { WorkflowChatPanelShell } from "./workflow-panel/WorkflowChatPanelShell"
import { resolveWorkflowReviewModes } from "./workflow-panel/review-mode"
import { deriveWorkflowBlockedResumeSummary } from "@/lib/workflow-blocked-resume"
import { getRuntimeStagePresentation } from "@/lib/runtime-flow-labels"
import { SelectedTaskPanel } from "@/components/notifications/SelectedTaskPanel"
import { subscribeDesktopCommands } from "@/lib/desktop-command-bus"
import { UseInNewFlowDialog } from "@/components/output/UseInNewFlowDialog"
import { selectTemplatesForResultChaining } from "@/lib/result-flow-chaining"
import {
  buildSubmitHumanTaskAnswers,
  buildInitialHumanTaskAnswers,
  hasMissingRequiredTaskAnswers,
  taskStageKey,
  toContinuationRun,
  type TaskStageMeta,
} from "@/components/notifications/task-ui"

export function WorkflowPanel() {
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [selectedInboxTaskKey, setSelectedInboxTaskKey] = useAtom(selectedInboxTaskKeyAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
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
  const [selectedWorkflowTemplateContext] = useAtom(selectedWorkflowTemplateContextAtom)
  const [, setWorkflowTemplateContextForKey] = useAtom(setWorkflowTemplateContextForKeyAtom)
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
  const [workflowEntryState, setWorkflowEntryState] = useAtom(workflowEntryStateAtom)
  const [queuedAutoRunPath, setQueuedAutoRunPath] = useAtom(workflowQueuedAutoRunPathAtom)
  const [, setWorkflowReviewMode] = useAtom(workflowReviewModeAtom)
  const [, setWorkflowRunBlockReason] = useAtom(workflowRunBlockReasonAtom)
  const [workflowOpenState, setWorkflowOpenState] = useAtom(workflowOpenStateAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [selectedPastRun, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const [workflowPastRuns] = useAtom(workflowHistoryRunsAtom)
  const { run, cancel, rerunFrom, continueRun, continueWithWorkflow } = useChainExecution()
  const { openWorkflowCreate } = useWorkflowCreateNavigation()
  const listScrollRegionRef = useRef<HTMLDivElement | null>(null)
  const outputPanelRef = useRef<HTMLDivElement | null>(null)
  const chatPanelShellRef = useRef<HTMLDivElement | null>(null)
  const chatPanelToggleRef = useRef<HTMLButtonElement | null>(null)
  const inputPanelRef = useRef<HTMLDivElement | null>(null)
  const blockedTaskPanelRef = useRef<HTMLDivElement | null>(null)
  const selectedResumeTaskRequestIdRef = useRef(0)
  const [showEntryEditor, setShowEntryEditor] = useState(false)
  const [prepareNewRun, setPrepareNewRun] = useState(false)
  const [launchingNextStage, setLaunchingNextStage] = useState(false)
  const [elapsed, setElapsed] = useState("")
  const [outputTabRequest, setOutputTabRequest] = useState<{ tab: "nodes" | "log" | "result" | "history"; nodeId?: string; nonce: number } | null>(null)
  const [selectedResumeTask, setSelectedResumeTask] = useState<HumanTaskSnapshot | null>(null)
  const [resumeTaskAnswers, setResumeTaskAnswers] = useState<Record<string, unknown>>({})
  const [resumeTaskSubmitting, setResumeTaskSubmitting] = useState(false)
  const [flowSurfaceMode, setFlowSurfaceMode] = useAtom(flowSurfaceModeAtom)
  const [desktopRuntime] = useAtom(desktopRuntimeAtom)
  const [, setSkillPickerOpen] = useAtom(skillPickerOpenAtom)
  const [, setSelectedNodeId] = useAtom(selectedNodeIdAtom)
  const previousRunStatusRef = useRef(runStatus)
  const lastRunInputRef = useRef(inputValue)
  const completionSurfaceRef = useRef<string | null>(null)
  const pendingListAutoScrollRef = useRef(false)
  const idleReviewAutoScrollKeyRef = useRef<string | null>(null)
  const resetExecution = useExecutionReset({ preserveCompletedWork: true })
  const [stageStartGateOpen, setStageStartGateOpen] = useState(false)
  const [pendingRunMode, setPendingRunMode] = useState<PermissionMode>("edit")
  const [pendingAutoRunPath, setPendingAutoRunPath] = useState<string | null>(null)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [blockedInspectionVisible, setBlockedInspectionVisible] = useState(false)
  const [useInNewFlowOpen, setUseInNewFlowOpen] = useState(false)
  const [useInNewFlowLoading, setUseInNewFlowLoading] = useState(false)
  const useInNewFlowTemplatesRequestIdRef = useRef(0)
  const [useInNewFlowPending, setUseInNewFlowPending] = useState(false)
  const [useInNewFlowTemplates, setUseInNewFlowTemplates] = useState<WorkflowTemplate[]>([])
  const [selectedUseInNewFlowTemplateId, setSelectedUseInNewFlowTemplateId] = useState<string | null>(null)
  const [useInNewFlowIntent, setUseInNewFlowIntent] = useState("")
  const [showSavedRunReview, setShowSavedRunReview] = useState(false)

  const LONG_RUNNING_THRESHOLD_MS = 2 * 60 * 1000

  const handleCancelRequest = useCallback(() => {
    if (runStartedAt && Date.now() - runStartedAt >= LONG_RUNNING_THRESHOLD_MS) {
      setCancelConfirmOpen(true)
      return
    }
    void cancel()
  }, [cancel, runStartedAt])

  const handleConfirmCancel = useCallback(() => {
    setCancelConfirmOpen(false)
    void cancel()
  }, [cancel])

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
    entryStageLabel,
    resumeEntrySummary,
    entryFlowRules,
    startApprovalRequired,
    entryNextStepLabel,
    stageStartInputLabels,
    stageStartPolicyNotes,
    stageStartFlowName,
    stageStartDescription,
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
    prepareNewRun,
    projectArtifactsLoading,
    projectArtifactsError,
    selectedProject,
  })

  useEffect(() => {
    if (!selectedInboxTaskKey || !selectedWorkflowPath) {
      selectedResumeTaskRequestIdRef.current += 1
      setSelectedResumeTask(null)
      setResumeTaskAnswers({})
      return
    }

    const separatorIndex = selectedInboxTaskKey.lastIndexOf("::")
    if (separatorIndex <= 0) {
      selectedResumeTaskRequestIdRef.current += 1
      setSelectedResumeTask(null)
      setResumeTaskAnswers({})
      return
    }

    const workspace = selectedInboxTaskKey.slice(0, separatorIndex)
    const taskId = selectedInboxTaskKey.slice(separatorIndex + 2)
    const taskSelectionKey = selectedInboxTaskKey
    const requestId = selectedResumeTaskRequestIdRef.current + 1
    selectedResumeTaskRequestIdRef.current = requestId

    setSelectedResumeTask(null)
    setResumeTaskAnswers({})
    void window.api.loadHumanTask(taskId, workspace).then((task) => {
      if (selectedResumeTaskRequestIdRef.current !== requestId) return
      if (!task || task.status !== "open") {
        setSelectedInboxTaskKey((current) => current === taskSelectionKey ? null : current)
        setSelectedResumeTask(null)
        setResumeTaskAnswers({})
        return
      }
      if (task.workflowPath && task.workflowPath !== selectedWorkflowPath) {
        setSelectedInboxTaskKey((current) => current === taskSelectionKey ? null : current)
        setSelectedResumeTask(null)
        setResumeTaskAnswers({})
        return
      }
      setSelectedResumeTask(task)
      setResumeTaskAnswers(buildInitialHumanTaskAnswers(task))
    }).catch((error) => {
      if (selectedResumeTaskRequestIdRef.current !== requestId) return
      toastErrorFromCatch("Could not load blocked task", error)
      setSelectedInboxTaskKey((current) => current === taskSelectionKey ? null : current)
      setSelectedResumeTask(null)
      setResumeTaskAnswers({})
    })

    return () => {
      if (selectedResumeTaskRequestIdRef.current === requestId) {
        selectedResumeTaskRequestIdRef.current += 1
      }
    }
  }, [selectedInboxTaskKey, selectedWorkflowPath, setSelectedInboxTaskKey])

  const blockedResumeArtifacts = useMemo(() => {
    if (!selectedResumeTask) return [] as ArtifactRecord[]

    return combinedArtifactRecords
      .filter((artifact) =>
        (selectedResumeTask.workflowPath && artifact.workflowPath === selectedResumeTask.workflowPath)
        || artifact.runId === selectedResumeTask.sourceRunId,
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)
  }, [combinedArtifactRecords, selectedResumeTask])

  const blockedResumeSummary = useMemo(
    () => selectedResumeTask
      ? deriveWorkflowBlockedResumeSummary({
        workflow,
        task: selectedResumeTask,
        sourceArtifacts: blockedResumeArtifacts,
        nodeStates,
        evalResults,
      })
      : null,
    [blockedResumeArtifacts, evalResults, nodeStates, selectedResumeTask, workflow],
  )
  const selectedResumeTaskStageMeta = useMemo<TaskStageMeta | null>(() => {
    if (!selectedResumeTask) return null
    const stageKey = taskStageKey(selectedResumeTask)
    if (!stageKey) return null
    const node = workflow.nodes.find((candidate) => candidate.id === selectedResumeTask.nodeId)
    if (!node) return null
    const presentation = getRuntimeStagePresentation(node, { fallbackId: node.id })
    return {
      title: presentation.title,
      group: presentation.group,
    }
  }, [selectedResumeTask, workflow.nodes])

  const blockedEntryState = useMemo(
    () => blockedResumeSummary
      ? {
        workflowPath: selectedWorkflowPath,
        workflowName: workflow.name || selectedResumeTask?.workflowName || "Untitled flow",
        source: "generated" as const,
        title: blockedResumeSummary.workLabel,
        summary: blockedResumeSummary.reasonText,
        contractLabel: "",
        contractText: "",
        inputText: "",
        outputText: "",
        readinessText: blockedResumeSummary.statusText,
      }
      : null,
    [blockedResumeSummary, selectedResumeTask?.workflowName, selectedWorkflowPath, workflow.name],
  )

  const hasBlockedResumeState = (
    runStatus === "idle"
    && activeEntryState === null
    && !showCreateDraftSkeleton
    && blockedResumeSummary !== null
  )
  const showBlockedResumeHeader = viewMode === "list" && hasBlockedResumeState
  const effectiveEntryState = activeEntryState || blockedEntryState
  const effectiveResumeHeader = showEntryResumeHeader || showBlockedResumeHeader
  const effectiveEntryStageLabel = blockedResumeSummary?.currentStepLabel || entryStageLabel
  const {
    showAnyReviewMode,
    showResumeReviewMode,
    showStandaloneIdleReviewMode,
  } = resolveWorkflowReviewModes({
    showIdleReviewMode: showIdleReviewMode && showSavedRunReview,
    showBlockedResumeHeader,
    selectedPastRunStatus: selectedPastRun?.status,
  })
  const processSpineFactory = useMemo(
    () => selectProcessSpineFactory(factoryBlueprint, selectedWorkflowTemplateContext),
    [factoryBlueprint, selectedWorkflowTemplateContext],
  )
  const processSpineStages = useMemo(
    () => buildProcessSpine({
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

  useEffect(() => {
    const previousRunStatus = previousRunStatusRef.current
    if (runStatus === "running" && previousRunStatus !== "running") {
      pendingListAutoScrollRef.current = true
    }
    if (runStatus !== "running") {
      pendingListAutoScrollRef.current = false
    }
    // Snapshot the input when a run begins so "Run again" can restore it
    if (previousRunStatus === "idle" && runStatus !== "idle") {
      lastRunInputRef.current = inputValue
    }
    previousRunStatusRef.current = runStatus
  }, [inputValue, runStatus])

  const clearWorkflowOpenState = useCallback(() => {
    setWorkflowOpenState({
      status: "idle",
      targetPath: null,
      message: null,
    })
  }, [setWorkflowOpenState])

  const workflowTitleFromPath = useCallback((path: string | null) => {
    if (!path) return "flow"
    return path.split(/[\\/]/).pop()?.replace(/\.(chain|yaml|yml)$/i, "") || "flow"
  }, [])

  const scrollOutputPanelIntoListViewport = useCallback((padding = 12) => {
    const listScrollRegion = listScrollRegionRef.current
    const outputPanel = outputPanelRef.current
    if (!listScrollRegion || !outputPanel) return false

    const regionRect = listScrollRegion.getBoundingClientRect()
    const panelRect = outputPanel.getBoundingClientRect()
    const panelAboveViewport = panelRect.top < regionRect.top + padding
    const panelBelowViewport = panelRect.bottom > regionRect.bottom - padding

    if (!panelAboveViewport && !panelBelowViewport) {
      return true
    }

    const nextTop = panelAboveViewport
      ? listScrollRegion.scrollTop + panelRect.top - regionRect.top - padding
      : listScrollRegion.scrollTop + panelRect.bottom - regionRect.bottom + padding

    listScrollRegion.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" })
    return true
  }, [])

  const scrollOutputPanelToListViewportStart = useCallback((padding = 12) => {
    const listScrollRegion = listScrollRegionRef.current
    const outputPanel = outputPanelRef.current
    if (!listScrollRegion || !outputPanel) return false

    const nextTop = outputPanel.offsetTop - listScrollRegion.offsetTop - padding

    listScrollRegion.scrollTo({ top: Math.max(0, nextTop), behavior: "auto" })
    return true
  }, [])

  useEffect(() => {
    if (!runStartedAt || (runStatus !== "running" && runStatus !== "starting" && runStatus !== "cancelling" && runStatus !== "paused")) {
      setElapsed("")
      return
    }

    const tick = () => setElapsed(formatElapsedTime(runStartedAt))
    tick()
    const timerId = window.setInterval(tick, 1000)
    return () => window.clearInterval(timerId)
  }, [runStartedAt, runStatus])

  useEffect(() => {
    if (viewMode === "list" && runStatus === "running" && pendingListAutoScrollRef.current) {
      scrollOutputPanelIntoListViewport(16)
      pendingListAutoScrollRef.current = false
    }
  }, [runStatus, scrollOutputPanelIntoListViewport, viewMode])

  useEffect(() => {
    if (chatOpen) return
    const activeElement = document.activeElement as HTMLElement | null
    if (activeElement && chatPanelShellRef.current?.contains(activeElement)) {
      window.requestAnimationFrame(() => {
        chatPanelToggleRef.current?.focus()
      })
    }
  }, [chatOpen])

  useEffect(() => {
    setShowEntryEditor(false)
    setPrepareNewRun(false)
    setShowSavedRunReview(true)
    setOutputTabRequest(null)
    pendingListAutoScrollRef.current = false
    idleReviewAutoScrollKeyRef.current = null
    listScrollRegionRef.current?.scrollTo({ top: 0, behavior: "auto" })
  }, [selectedWorkflowPath])

  useEffect(() => {
    if (runStatus !== "idle" && workflowEntryState) {
      setWorkflowEntryState(null)
    }
  }, [runStatus, setWorkflowEntryState, workflowEntryState])

  const hasMeaningfulContent = workflowHasMeaningfulContent(workflow)
  const {
    reviewedRun,
    reviewedRunDetails,
    reviewedRunLoading,
    reviewedRunError,
  } = useSelectedRunReview(showAnyReviewMode)
  const canShowAgentPanel = Boolean(selectedWorkflowPath)
  const hasResult = finalContent.trim().length > 0
    || reportPath !== null
    || Object.values(nodeStates).some((state) => typeof state.output?.content === "string")
  const runSummary = useMemo(() => buildRunProgressSummary({
    workflow,
    runtimeNodes,
    runtimeMeta,
    nodeStates,
    runStatus,
    runOutcome,
    activeNodeId,
  }), [activeNodeId, nodeStates, runOutcome, runStatus, runtimeMeta, runtimeNodes, workflow])
  const shellState = useMemo<WorkflowPanelShellState>(() => {
    if (runStatus === "paused") return "paused"
    if (runStatus === "starting" || runStatus === "running" || runStatus === "cancelling") return "running"
    if (hasBlockedResumeState || (runStatus === "done" && runOutcome === "blocked")) return "blocked"
    if (runStatus === "error" || runOutcome === "failed" || runOutcome === "interrupted") return "failed"
    if (runStatus === "done" && runOutcome === "completed") return "completed"
    if (runStatus === "done" && runOutcome === "cancelled") return "cancelled"
    if (effectiveResumeHeader) return "ready"
    return "idle"
  }, [effectiveResumeHeader, hasBlockedResumeState, runOutcome, runStatus])
  const shellDetail = useMemo(() => {
    if (shellState !== "running" && shellState !== "paused") return null

    const progressLabel = runSummary.totalSteps > 0
      ? `${Math.min(runSummary.completedSteps, runSummary.totalSteps)}/${runSummary.totalSteps}`
      : null
    const detailParts = [
      progressLabel,
      runStatus === "running" || runStatus === "paused" ? runSummary.activeStepLabel : null,
      elapsed || null,
    ].filter((value): value is string => Boolean(value))

    return detailParts.length > 0 ? detailParts.join(" · ") : null
  }, [elapsed, runStatus, runSummary, shellState])
  const isRuntimeFlowView = viewMode === "list" && runStatus !== "idle"
  const listShellClass = isRuntimeFlowView
    ? "flex min-h-full w-full flex-col px-[var(--content-gutter)] py-4 space-y-3"
    : "ui-content-shell py-3 space-y-3"
  const reviewFlowHasSnapshot = showAnyReviewMode && !!reviewedRunDetails?.snapshot
  const firstRunnableNode = useMemo(
    () => workflow.nodes.find((node) => node.type !== "input" && node.type !== "output") || null,
    [workflow.nodes],
  )
  const idleStageContract = useMemo(() => {
    if (!firstRunnableNode) return null

    const presentation = getRuntimeStagePresentation(firstRunnableNode, { fallbackId: firstRunnableNode.id })
    return {
      title: presentation.title,
      resultLabel: selectedWorkflowTemplateContext?.outputText?.trim() || presentation.artifactLabel,
      summary: stageStartDescription || presentation.outcomeText,
      inputLabels: stageStartInputLabels,
    }
  }, [firstRunnableNode, selectedWorkflowTemplateContext?.outputText, stageStartDescription, stageStartInputLabels])
  const canShowTerminalResultSurface = hasResult || runStatus === "error" || (runStatus === "done" && runOutcome !== "blocked")
  const liveTerminalResultOwnsLayout = (
    viewMode === "list"
    && runStatus === "idle"
    && canShowTerminalResultSurface
    && !showAnyReviewMode
    && !prepareNewRun
  )
  const showOutputPanel = showAnyReviewMode || runStatus !== "idle" || liveTerminalResultOwnsLayout
  const resultSourceText = useMemo(() => {
    const trimmedFinalContent = finalContent.trim()
    if (trimmedFinalContent) {
      return trimmedFinalContent
    }

    const orderedNodeIds = [
      ...workflow.nodes
        .filter((node) => node.type === "output")
        .map((node) => node.id),
      ...workflow.nodes.map((node) => node.id),
      ...Object.keys(nodeStates),
    ]

    const seen = new Set<string>()
    for (const nodeId of orderedNodeIds) {
      if (!nodeId || seen.has(nodeId)) continue
      seen.add(nodeId)
      const content = nodeStates[nodeId]?.output?.content
      if (typeof content === "string" && content.trim()) {
        return content
      }
    }

    return ""
  }, [finalContent, nodeStates, workflow.nodes])
  const resultSourceAttachments = useMemo(() => {
    if (artifactRecords.length > 0) {
      return buildArtifactInputAttachments(artifactRecords)
    }
    if (runId && workspace) {
      return [{
        kind: "run" as const,
        runId,
        workspace,
        workflowName: workflow.name || "Current flow",
      }]
    }
    if (resultSourceText) {
      return [{
        kind: "text" as const,
        label: workflow.name
          ? `${workflow.name} result`
          : "Current result",
        content: resultSourceText,
      }]
    }
    return []
  }, [artifactRecords, resultSourceText, runId, workflow.name, workspace])
  const resultSourceLabel = useMemo(() => {
    if (artifactRecords.length > 0) {
      const visibleTitles = artifactRecords.slice(0, 2).map((artifact) => artifact.title)
      if (artifactRecords.length > 2) {
        visibleTitles.push(`+${artifactRecords.length - 2} more`)
      }
      return visibleTitles.join(" · ")
    }
    return workflow.name
      ? `${workflow.name} result`
      : "Current result"
  }, [artifactRecords, workflow.name])
  const canUseInNewFlow = Boolean(selectedProject && canShowTerminalResultSurface && resultSourceAttachments.length > 0)
  const suggestedUseInNewFlowTemplates = useMemo(
    () => selectTemplatesForResultChaining({
      templates: useInNewFlowTemplates,
      sourceArtifacts: artifactRecords,
    }),
    [artifactRecords, useInNewFlowTemplates],
  )
  const showIdleStageContract = (
    viewMode === "list"
    && shellState === "idle"
    && !showCreateDraftSkeleton
    && !showAnyReviewMode
    && idleStageContract !== null
  )
  const showFlowEditor = (
    shellState === "running"
    || shellState === "paused"
    || (shellState === "idle" && flowSurfaceMode === "edit" && !showAnyReviewMode)
  )
  const requestOutputTab = useCallback((tab: "nodes" | "log" | "result" | "history", nodeId?: string) => {
    setViewMode("list")
    if (showBlockedResumeHeader) {
      setBlockedInspectionVisible(true)
    }
    setOutputTabRequest({ tab, nodeId, nonce: Date.now() })
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (scrollOutputPanelIntoListViewport()) {
          return
        }
        outputPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
      })
    })
  }, [scrollOutputPanelIntoListViewport, setViewMode, showBlockedResumeHeader])

  useEffect(() => {
    if (!showBlockedResumeHeader) {
      setBlockedInspectionVisible(false)
      return
    }
    setBlockedInspectionVisible(false)
  }, [selectedResumeTask?.taskId, selectedResumeTask?.sourceRunId, showBlockedResumeHeader])

  const openActivity = useCallback(() => {
    requestOutputTab("nodes")
  }, [requestOutputTab])

  const openResult = useCallback(() => {
    requestOutputTab(canShowTerminalResultSurface ? "result" : "nodes")
  }, [canShowTerminalResultSurface, requestOutputTab])

  const handleSurfaceNoticeAction = useCallback(() => {
    if (!surfaceNotice) return
    if (surfaceNotice.actionTarget === "result") {
      openResult()
      setSurfaceNotice(null)
      return
    }
    if (surfaceNotice.actionTarget === "activity") {
      openActivity()
      setSurfaceNotice(null)
      return
    }
    if (surfaceNotice.actionTarget === "inbox") {
      setMainView("inbox")
      setSurfaceNotice(null)
    }
  }, [openActivity, openResult, setMainView, setSurfaceNotice, surfaceNotice])

  const focusInputPanel = useCallback(() => {
    const inputPanel = inputPanelRef.current
    if (!inputPanel) return
    inputPanel.scrollIntoView({ behavior: "smooth", block: "start" })
    window.requestAnimationFrame(() => {
      const focusTarget = inputPanel.querySelector<HTMLElement>("textarea, input, [contenteditable='true']")
      focusTarget?.focus()
    })
  }, [])

  const focusBlockedTaskPanel = useCallback(() => {
    const panel = blockedTaskPanelRef.current
    if (!panel) return
    panel.scrollIntoView({ behavior: "smooth", block: "start" })
    window.requestAnimationFrame(() => {
      const focusTarget = panel.querySelector<HTMLElement>("button, textarea, input, select, [contenteditable='true']")
      focusTarget?.focus()
    })
  }, [])

  const handleOpenArtifact = async (artifact: ArtifactRecord) => {
    const openError = await window.api.openPath(artifact.contentPath)
    if (!openError) return
    toastError("Could not open result", {
      description: openError,
    })
  }

  const handleResumeTaskFieldChange = useCallback((field: HumanTaskField, value: unknown) => {
    setResumeTaskAnswers((previous) => ({
      ...previous,
      [field.id]: value,
    }))
  }, [])

  const submitResumeTask = useCallback(async () => {
    if (!selectedResumeTask) return false
    if (hasMissingRequiredTaskAnswers(selectedResumeTask, resumeTaskAnswers)) return false
    return window.api.submitHumanTask(selectedResumeTask.taskId, selectedResumeTask.workspace, {
      answers: buildSubmitHumanTaskAnswers(selectedResumeTask, resumeTaskAnswers),
    })
  }, [resumeTaskAnswers, selectedResumeTask])

  const handleSubmitResumeTask = useCallback(async () => {
    if (!selectedResumeTask) return
    setResumeTaskSubmitting(true)
    try {
      const ok = await submitResumeTask()
      if (!ok) return
      setSelectedPastRun(null)
      setSelectedInboxTaskKey(null)
      setSelectedResumeTask(null)
      setResumeTaskAnswers({})
      setPrepareNewRun(true)
      setViewMode("list")
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          focusInputPanel()
        })
      })
    } finally {
      setResumeTaskSubmitting(false)
    }
  }, [focusInputPanel, selectedResumeTask, setSelectedInboxTaskKey, setSelectedPastRun, setViewMode, submitResumeTask])

  const handleSubmitResumeTaskAndContinue = useCallback(async () => {
    if (!selectedResumeTask || !selectedWorkflowPath) return
    setResumeTaskSubmitting(true)
    try {
      const ok = await submitResumeTask()
      if (!ok) return
      setSelectedPastRun(toContinuationRun(selectedResumeTask))
      setSelectedInboxTaskKey(null)
      setSelectedResumeTask(null)
      setResumeTaskAnswers({})
      await continueWithWorkflow(
        toContinuationRun(selectedResumeTask),
        workflow,
        selectedWorkflowPath,
      )
    } finally {
      setResumeTaskSubmitting(false)
    }
  }, [
    continueWithWorkflow,
    selectedResumeTask,
    selectedWorkflowPath,
    setSelectedInboxTaskKey,
    setSelectedPastRun,
    submitResumeTask,
    workflow,
  ])

  const handleRejectResumeTask = useCallback(async () => {
    if (!selectedResumeTask) return
    setResumeTaskSubmitting(true)
    try {
      const ok = await window.api.rejectHumanTask(selectedResumeTask.taskId, selectedResumeTask.workspace)
      if (!ok) return
      setSelectedInboxTaskKey(null)
      setSelectedResumeTask(null)
      setResumeTaskAnswers({})
    } finally {
      setResumeTaskSubmitting(false)
    }
  }, [selectedResumeTask, setSelectedInboxTaskKey])

  const handleRunRequest = useCallback(async (mode: PermissionMode = "edit") => {
    if (startApprovalRequired) {
      setPendingRunMode(mode)
      setStageStartGateOpen(true)
      return
    }
    await run(mode)
  }, [run, startApprovalRequired])

  const handleApproveStageStart = useCallback(async () => {
    const mode = pendingRunMode
    setStageStartGateOpen(false)
    await run(mode)
  }, [pendingRunMode, run])

  const handleCancelStageStart = useCallback(() => {
    setStageStartGateOpen(false)
    setPendingRunMode("edit")
  }, [])

  const openPreparedTemplateStage = useCallback((
    launch: Awaited<ReturnType<typeof prepareTemplateStageLaunch>>,
    options: {
      autoRunIfAllowed: boolean
      successMessage: string
      approvalMessage?: string
    },
  ) => {
    setWorkflows(launch.refreshedWorkflows)
    setSelectedWorkflowPath(launch.filePath)
    setWorkflowDirect(launch.loadedWorkflow)
    setWorkflowSavedSnapshot(launch.savedSnapshot)
    setInputValue(launch.inputSeed)
    setWorkflowEntryState(launch.entryState)
    setWorkflowTemplateContextForKey({
      key: toWorkflowExecutionKey(launch.filePath),
      context: launch.templateContext,
    })
    setSelectedInboxTaskKey(null)
    setSelectedPastRun(null)
    setPrepareNewRun(false)
    setWorkflowReviewMode(false)
    setMainView("thread")
    setViewMode("list")
    setOutputTabRequest(null)
    setInputAttachments(launch.artifactAttachments)
    const nextStageNeedsApproval = contextRequiresStartApproval(launch.templateContext)
    setPendingAutoRunPath(options.autoRunIfAllowed && !nextStageNeedsApproval ? launch.filePath : null)

    toast.success(nextStageNeedsApproval ? (options.approvalMessage || options.successMessage) : options.successMessage)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (nextStageNeedsApproval) {
          focusInputPanel()
        }
      })
    })
  }, [
    focusInputPanel,
    setInputAttachments,
    setInputValue,
    setMainView,
    setOutputTabRequest,
    setPrepareNewRun,
    setSelectedWorkflowPath,
    setSelectedInboxTaskKey,
    setSelectedPastRun,
    setViewMode,
    setWorkflowDirect,
    setWorkflowEntryState,
    setWorkflowReviewMode,
    setWorkflowSavedSnapshot,
    setWorkflowTemplateContextForKey,
    setWorkflows,
  ])

  const handleRunNextStage = useCallback(async () => {
    if (!selectedProject || !nextStageTemplate || launchingNextStage) return

    setLaunchingNextStage(true)
    try {
      const launch = await prepareTemplateStageLaunch({
        projectPath: selectedProject,
        template: nextStageTemplate,
        webSearchBackend,
        artifacts: nextStageArtifacts,
      })
      openPreparedTemplateStage(launch, {
        autoRunIfAllowed: true,
        successMessage: `Continuing to ${deriveTemplateContinuationLabel(nextStageTemplate) || deriveTemplateJobLabel(nextStageTemplate) || deriveTemplateDisplayLabel(nextStageTemplate) || nextStageTemplate.name}`,
        approvalMessage: `Opened step awaiting approval: ${deriveTemplateContinuationLabel(nextStageTemplate) || deriveTemplateJobLabel(nextStageTemplate) || deriveTemplateDisplayLabel(nextStageTemplate) || nextStageTemplate.name}`,
      })
    } catch (error) {
      toastErrorFromCatch("Could not open the next step", error)
    } finally {
      setLaunchingNextStage(false)
    }
  }, [
    launchingNextStage,
    nextStageArtifacts,
    nextStageTemplate,
    openPreparedTemplateStage,
    selectedProject,
    webSearchBackend,
  ])

  const handleOpenUseInNewFlow = useCallback(() => {
    if (!selectedProject || !canUseInNewFlow) {
      toastError("Open a project and finish a result before starting a new flow from it.")
      return
    }
    if (artifactRecords.length === 0) {
      openWorkflowCreate({
        projectPath: selectedProject,
        sourceArtifacts: [],
        initialAttachments: resultSourceAttachments,
      })
      return
    }
    setUseInNewFlowIntent("")
    setSelectedUseInNewFlowTemplateId(null)
    setUseInNewFlowOpen(true)
  }, [artifactRecords.length, canUseInNewFlow, openWorkflowCreate, resultSourceAttachments, selectedProject])

  const handleConfirmUseInNewFlow = useCallback(async () => {
    if (!selectedProject || useInNewFlowPending) return

    const selectedTemplate = suggestedUseInNewFlowTemplates.find((template) => template.id === selectedUseInNewFlowTemplateId) || null
    if (!selectedTemplate && !useInNewFlowIntent.trim()) return

    setUseInNewFlowPending(true)
    try {
      if (selectedTemplate) {
        const launch = await prepareTemplateStageLaunch({
          projectPath: selectedProject,
          template: selectedTemplate,
          webSearchBackend,
          artifacts: selectArtifactsForTemplateContracts(selectedTemplate.contractIn, artifactRecords),
        })
        openPreparedTemplateStage(launch, {
          autoRunIfAllowed: false,
          successMessage: `Opened ${selectedTemplate.name} from this result`,
          approvalMessage: `Opened ${selectedTemplate.name} from this result and paused for approval`,
        })
      } else {
        openWorkflowCreate({
          projectPath: selectedProject,
          prompt: useInNewFlowIntent.trim(),
          sourceArtifacts: artifactRecords,
          initialAttachments: resultSourceAttachments,
        })
      }

      setUseInNewFlowOpen(false)
    } catch (error) {
      toastErrorFromCatch("Could not start the next flow", error)
    } finally {
      setUseInNewFlowPending(false)
    }
  }, [
    artifactRecords,
    openPreparedTemplateStage,
    openWorkflowCreate,
    resultSourceAttachments,
    selectedProject,
    selectedUseInNewFlowTemplateId,
    suggestedUseInNewFlowTemplates,
    useInNewFlowIntent,
    useInNewFlowPending,
    webSearchBackend,
  ])

  useEffect(() => {
    if (runStatus === "idle") return
    setStageStartGateOpen(false)
  }, [runStatus])

  useEffect(() => {
    if (!stageStartGateOpen) return
    if (startApprovalRequired) return
    setStageStartGateOpen(false)
    setPendingRunMode("edit")
  }, [stageStartGateOpen, startApprovalRequired])

  useEffect(() => {
    if (!pendingAutoRunPath) return
    if (selectedWorkflowPath !== pendingAutoRunPath) return
    if (runStatus !== "idle") return
    if (!contextAutoRunsOnContinue(selectedWorkflowTemplateContext)) return

    setPendingAutoRunPath(null)
    void handleRunRequest()
  }, [handleRunRequest, pendingAutoRunPath, runStatus, selectedWorkflowPath, selectedWorkflowTemplateContext])

  useEffect(() => {
    if (!queuedAutoRunPath || !selectedWorkflowPath) return
    if (selectedWorkflowPath === queuedAutoRunPath) return
    setQueuedAutoRunPath(null)
  }, [queuedAutoRunPath, selectedWorkflowPath, setQueuedAutoRunPath])

  useEffect(() => {
    if (!queuedAutoRunPath) return
    if (selectedWorkflowPath !== queuedAutoRunPath) return
    if (runStatus !== "idle") return
    if (!selectedWorkflowTemplateContext) return

    setQueuedAutoRunPath(null)
    if (!contextAutoRunsOnContinue(selectedWorkflowTemplateContext)) return
    void handleRunRequest()
  }, [
    handleRunRequest,
    queuedAutoRunPath,
    runStatus,
    selectedWorkflowPath,
    selectedWorkflowTemplateContext,
    setQueuedAutoRunPath,
  ])

  useEffect(() => {
    if (!useInNewFlowOpen) {
      useInNewFlowTemplatesRequestIdRef.current += 1
      return
    }

    const requestId = useInNewFlowTemplatesRequestIdRef.current + 1
    useInNewFlowTemplatesRequestIdRef.current = requestId
    setUseInNewFlowLoading(true)

    void window.api.listTemplates()
      .then((templates) => {
        if (useInNewFlowTemplatesRequestIdRef.current !== requestId) return
        setUseInNewFlowTemplates(templates)
      })
      .catch((error) => {
        if (useInNewFlowTemplatesRequestIdRef.current !== requestId) return
        setUseInNewFlowTemplates([])
        toastErrorFromCatch("Could not load flow suggestions", error)
      })
      .finally(() => {
        if (useInNewFlowTemplatesRequestIdRef.current === requestId) {
          setUseInNewFlowLoading(false)
        }
      })

    return () => {
      if (useInNewFlowTemplatesRequestIdRef.current === requestId) {
        useInNewFlowTemplatesRequestIdRef.current += 1
      }
    }
  }, [useInNewFlowOpen])

  useEffect(() => {
    const isTerminalResultState = runStatus === "error" || (runStatus === "done" && runOutcome !== "blocked")
    if (!isTerminalResultState || !canShowTerminalResultSurface || viewMode !== "list") {
      completionSurfaceRef.current = null
      return
    }
    setShowSavedRunReview(false)
    const completionKey = `${selectedWorkflowPath ?? "__draft__"}:${runId || runOutcome || runStatus}`
    if (completionSurfaceRef.current === completionKey) return
    completionSurfaceRef.current = completionKey
    openResult()
  }, [canShowTerminalResultSurface, openResult, runId, runOutcome, runStatus, selectedWorkflowPath, setShowSavedRunReview, viewMode])

  const handleStartNewRun = () => {
    // Preserve the previous input so the user can edit rather than retype
    const previousInput = inputValue || lastRunInputRef.current
    if (runStatus !== "idle") {
      resetExecution()
      setOutputTabRequest(null)
    }
    // Restore the input value in case execution reset or any other effect cleared it
    if (!inputValue && previousInput) {
      setInputValue(previousInput)
    }
    setShowSavedRunReview(false)
    setPrepareNewRun(true)
    setViewMode("list")
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => focusInputPanel())
    })
  }

  const openRunHistory = useCallback(() => {
    if (runStatus !== "idle" || workflowPastRuns.length === 0) return
    setPrepareNewRun(false)
    setShowSavedRunReview(true)
    if (!selectedPastRun) {
      setSelectedPastRun(workflowPastRuns[0] || null)
    }
    setViewMode("list")
    setOutputTabRequest({ tab: "history", nonce: Date.now() })
  }, [runStatus, selectedPastRun, setSelectedPastRun, setShowSavedRunReview, setViewMode, workflowPastRuns])

  const sharedOutputPanelProps = useMemo(() => ({
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
    onEditFlow: () => {
      setViewMode("list")
      setFlowSurfaceMode("edit")
    },
    onUseInNewFlow: canUseInNewFlow ? handleOpenUseInNewFlow : null,
    nextStageTemplate,
    nextStageArtifacts,
    onRunNextStage: selectedProject && nextStageTemplate ? handleRunNextStage : null,
    nextStagePending: launchingNextStage,
  }), [
    canUseInNewFlow,
    handleOpenUseInNewFlow,
    continueRun,
    setFlowSurfaceMode,
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
    selectedProject,
    setMainView,
    setViewMode,
  ])

  useEffect(() => {
    if (runStatus !== "idle") return
    if (workflowPastRuns.length === 0) {
      if (selectedPastRun) {
        setSelectedPastRun(null)
      }
      return
    }
    if (prepareNewRun) return
    const preferredBlockedRun = selectedResumeTask
      ? workflowPastRuns.find((run) => run.runId === selectedResumeTask.sourceRunId) || null
      : null
    if (preferredBlockedRun) {
      if (selectedPastRun?.runId === preferredBlockedRun.runId) return
      setSelectedPastRun(preferredBlockedRun)
      return
    }
    if (!showSavedRunReview) {
      if (selectedPastRun) {
        setSelectedPastRun(null)
      }
      return
    }
    if (selectedPastRun && workflowPastRuns.some((run) => run.runId === selectedPastRun.runId)) return
    setSelectedPastRun(workflowPastRuns[0])
  }, [
    prepareNewRun,
    runStatus,
    selectedPastRun,
    selectedResumeTask,
    setSelectedPastRun,
    setShowSavedRunReview,
    showSavedRunReview,
    workflowPastRuns,
  ])

  useEffect(() => {
    if (showAnyReviewMode) {
      setWorkflowReviewMode(true)
      setOutputTabRequest((previous) => {
        if (previous?.tab === "result") return previous
        return { tab: "result", nonce: Date.now() }
      })
      return
    }
    setWorkflowReviewMode(false)
  }, [setWorkflowReviewMode, showAnyReviewMode])

  useEffect(() => {
    return subscribeDesktopCommands((commandId) => {
      if (commandId === "view.edit_flow") {
        if (runStatus !== "idle" || showAnyReviewMode) return
        setViewMode("list")
        setFlowSurfaceMode("edit")
        return
      }
      if (commandId === "flow.run_again") {
        if (runStatus !== "idle" || workflowPastRuns.length === 0) return
        handleStartNewRun()
        return
      }
      if (commandId === "flow.history") {
        openRunHistory()
      }
    })
  }, [
    handleStartNewRun,
    openRunHistory,
    runStatus,
    setFlowSurfaceMode,
    setViewMode,
    showAnyReviewMode,
    workflowPastRuns.length,
  ])

  useEffect(() => {
    if (!hasBlockedResumeState || !selectedResumeTask) {
      setWorkflowRunBlockReason(null)
      return
    }

    setWorkflowRunBlockReason(
      selectedResumeTask.kind === "approval"
        ? "Complete the open approval before running this step."
        : "Provide the requested input before running this step.",
    )

    return () => {
      setWorkflowRunBlockReason(null)
    }
  }, [hasBlockedResumeState, selectedResumeTask, setWorkflowRunBlockReason])

  useEffect(() => {
    if (!showAnyReviewMode || viewMode !== "list") return

    const reviewKey = `${selectedWorkflowPath || "no-flow"}::${selectedPastRun?.runId || "latest"}`
    if (idleReviewAutoScrollKeyRef.current === reviewKey) return

    idleReviewAutoScrollKeyRef.current = reviewKey
    const tryScroll = () => {
      if (scrollOutputPanelToListViewportStart(16)) return
      outputPanelRef.current?.scrollIntoView({ behavior: "auto", block: "start" })
    }

    window.requestAnimationFrame(() => {
      tryScroll()
      window.requestAnimationFrame(() => {
        tryScroll()
      })
    })
  }, [scrollOutputPanelToListViewportStart, selectedPastRun?.runId, selectedWorkflowPath, showAnyReviewMode, viewMode])

  useEffect(() => {
    if (runStatus !== "idle" && prepareNewRun) {
      setPrepareNewRun(false)
    }
  }, [prepareNewRun, runStatus])

  const handleAttachCapability = useCallback(() => {
    setSkillPickerOpen(true)
  }, [setSkillPickerOpen])

  const handleDismissEntry = useCallback(() => {
    setPrepareNewRun(true)
    if (blockedResumeSummary) {
      setSelectedInboxTaskKey(null)
      return
    }
    setWorkflowEntryState(null)
  }, [blockedResumeSummary, setSelectedInboxTaskKey, setWorkflowEntryState])

  const handleAttachCapabilitySelection = useCallback((skill: DiscoveredSkill) => {
    let nextSelectedId: string | null = null
    setWorkflow((prev) => {
      const previousNodeIds = new Set(prev.nodes.map((node) => node.id))
      const next = addSkillNodeToWorkflow(prev, skill)
      nextSelectedId = next.nodes.find((node) => !previousNodeIds.has(node.id))?.id ?? null
      return next
    })
    if (nextSelectedId) {
      setSelectedNodeId(nextSelectedId)
    }
    setShowEntryEditor(true)
    setFlowSurfaceMode("edit")
    toast.success(`Attached ${skill.name}`, {
      description: "Added to this flow. Review the new skill in Edit flow.",
    })
  }, [setFlowSurfaceMode, setSelectedNodeId, setWorkflow])

  const focusStageDetails = ({ nodeId, preferredTab }: { nodeId: string; preferredTab: "nodes" | "log" | "result" }) => {
    if (runStatus === "idle" && !showAnyReviewMode) return
    requestOutputTab(preferredTab, nodeId)
  }

  const blockedTaskPanel = showBlockedResumeHeader && selectedResumeTask ? (
    <div ref={blockedTaskPanelRef} data-blocked-task-panel="true">
      <SelectedTaskPanel
        selectedTask={selectedResumeTask}
        taskLoading={false}
        taskSubmitting={resumeTaskSubmitting}
        taskAnswers={resumeTaskAnswers}
        selectedTaskStageMeta={selectedResumeTaskStageMeta}
        blockedSummary={blockedResumeSummary ? {
          statusText: blockedResumeSummary.statusText,
          reasonText: blockedResumeSummary.reasonText,
          inputText: blockedResumeSummary.attachText,
          latestResultText: blockedResumeSummary.latestResultText,
          findings: blockedResumeSummary.findings,
          approveText: selectedResumeTask.kind === "approval"
            ? "Continue this flow after approval."
            : "Submit the requested input and continue the flow.",
          rejectText: "Stop the flow. Saved results stay available for later review.",
        } : null}
        showOpenWorkflowButton={false}
        className="rounded-lg border border-hairline bg-surface-1 px-5 py-4"
        inspectLabel={showResumeReviewMode ? "Inspect saved run" : null}
        onOpenWorkflow={() => {}}
        onFieldChange={handleResumeTaskFieldChange}
        onSubmit={() => { void handleSubmitResumeTask() }}
        onSubmitAndContinue={() => { void handleSubmitResumeTaskAndContinue() }}
        onReject={() => { void handleRejectResumeTask() }}
        onInspect={showResumeReviewMode ? () => requestOutputTab("result") : null}
      />
    </div>
  ) : null

  const isFlowEditing = effectiveResumeHeader ? showEntryEditor : flowSurfaceMode === "edit"
  const chainBuilderMode = shellState === "running" || shellState === "paused"
    ? "monitor"
    : reviewFlowHasSnapshot
      ? "monitor"
      : isFlowEditing
        ? "edit"
        : "outline"
  if (!selectedProject && !hasMeaningfulContent) {
    return (
      <EmptyWorkspaceState onOpenProject={() => { void window.api.addProject() }} />
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
      <div role="region" aria-label="Flow workspace" className="flex-1 min-h-0 flex flex-col overflow-hidden min-w-0">
        <Toolbar
          onRun={handleRunRequest}
          onCancel={handleCancelRequest}
          shellState={shellState}
          entryTitle={effectiveEntryState?.title}
          shellDetail={shellDetail}
          agentToggleRef={chatPanelToggleRef}
        />

        {workflowOpenState.status === "loading" ? (
          <WorkflowOpenLoadingState flowLabel={workflowTitleFromPath(workflowOpenState.targetPath)} />
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
              {processSpineStages && processSpineStages.length > 1 && (
                <div className="border-b border-hairline bg-surface-1/80">
                  <div className="ui-content-gutter py-2">
                    <ProcessSpine stages={processSpineStages} />
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
                showResumeHeader={effectiveResumeHeader}
                activeEntryState={effectiveEntryState}
                workflowName={workflow.name}
                readyToRun={readyToRun}
                startApprovalRequired={startApprovalRequired}
                entryStageLabel={effectiveEntryStageLabel}
                resumeEntrySummary={resumeEntrySummary}
                blockedResumeSummary={blockedResumeSummary}
                entryNextStepLabel={entryNextStepLabel}
                stageStartInputLabels={stageStartInputLabels}
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
                showProjectArtifactsPanel={showProjectArtifactsPanel}
                combinedArtifactRecords={combinedArtifactRecords}
                projectArtifactsLoading={projectArtifactsLoading}
                projectArtifactsError={projectArtifactsError}
                requiredContracts={selectedWorkflowTemplateContext?.contractIn}
                onOpenArtifact={(artifact) => { void handleOpenArtifact(artifact) }}
                showIdleStageContract={showIdleStageContract}
                idleStageContract={idleStageContract}
                showIdleInputPanel={showIdleInputPanel}
                showFlowEditor={showFlowEditor}
                chainBuilderMode={chainBuilderMode}
                onFocusStageDetails={focusStageDetails}
              reviewSnapshot={showAnyReviewMode ? reviewedRunDetails?.snapshot ?? null : null}
              showReviewOutputMode={showAnyReviewMode}
              showReviewOutputPanel={!showBlockedResumeHeader || blockedInspectionVisible}
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
        <WorkflowPanelOverlays
          showResumeHeader={effectiveResumeHeader}
          showEntryEditor={showEntryEditor}
          entryStageLabel={effectiveEntryStageLabel}
          onAttachCapabilitySelection={handleAttachCapabilitySelection}
          stageStartGateOpen={stageStartGateOpen}
          stageStartFlowName={stageStartFlowName}
          stageStartTitle={effectiveEntryState?.title || workflow.name || selectedWorkflowTemplateContext?.templateName || "This step"}
          stageLabel={effectiveEntryStageLabel}
          stageStartDescription={stageStartDescription}
          entryFlowRules={entryFlowRules}
          expectedArtifact={selectedWorkflowTemplateContext?.outputText || effectiveEntryState?.outputText || "A reviewable result"}
          inputPreview={inputValue}
          inputLabels={stageStartInputLabels}
          notes={stageStartPolicyNotes}
          shortcutLabel={`${desktopRuntime.primaryModifierLabel}↵`}
          primaryModifierKey={desktopRuntime.primaryModifierKey}
          onApproveStageStart={handleApproveStageStart}
          onCancelStageStart={handleCancelStageStart}
        />
        <CancelFlowConfirmDialog
          open={cancelConfirmOpen}
          onOpenChange={setCancelConfirmOpen}
          runStartedAt={runStartedAt}
          onConfirmCancel={handleConfirmCancel}
        />
        <UseInNewFlowDialog
          open={useInNewFlowOpen}
          onOpenChange={setUseInNewFlowOpen}
          projectName={selectedProject ? selectedProject.split(/[\\/]/).pop() || selectedProject : null}
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
          onConfirm={() => { void handleConfirmUseInNewFlow() }}
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
