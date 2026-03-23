import { useMemo } from "react"

import { buildArtifactInputAttachments } from "@/lib/workflow-entry"
import { buildRunProgressSummary } from "@/lib/run-progress"
import { getRuntimeStagePresentation } from "@/lib/runtime-flow-labels"
import type { WorkflowPanelShellState } from "@/components/workflow-panel/WorkflowPanelChrome"
import {
  resolveWorkflowPrimaryScreenState,
  shouldShowProcessSpine,
  shouldShowLiveOutputPanel,
  type WorkflowPrimaryScreenState,
} from "@/components/workflow-panel/screen-state"
import { resolveWorkflowRunDisplayState } from "@/lib/workflow-run-display-state"
import type { FlowSurfaceMode, ViewMode } from "@/lib/store"
import type {
  ArtifactRecord,
  InputAttachment,
  NodeState,
  RunStatus,
  Workflow,
  WorkflowNode,
  WorkflowRuntimeMeta,
  WorkflowTemplate,
} from "@shared/types"
import type { ExecutionRunStatus } from "@/lib/workflow-execution"

export function resolveReviewShellState(
  status: RunStatus | null | undefined,
): WorkflowPanelShellState | null {
  if (status === "completed") return "completed"
  if (status === "failed") return "failed"
  if (status === "cancelled" || status === "interrupted") return "cancelled"
  if (status === "blocked") return "blocked"
  return null
}

export function resolveShowIdleStageContract({
  viewMode,
  primaryScreenState,
  showCreateDraftSkeleton,
  showAnyReviewMode,
  idleStageContract,
  effectiveResumeHeader,
}: {
  viewMode: ViewMode
  primaryScreenState: WorkflowPrimaryScreenState
  showCreateDraftSkeleton: boolean
  showAnyReviewMode: boolean
  idleStageContract: unknown
  effectiveResumeHeader: boolean
}) {
  return (
    viewMode === "list" &&
    (primaryScreenState === "fresh_start" ||
      primaryScreenState === "cross_flow_handoff") &&
    !showCreateDraftSkeleton &&
    !showAnyReviewMode &&
    !effectiveResumeHeader &&
    idleStageContract !== null
  )
}

export function useWorkflowPanelShellDerivations({
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
  selectedPastRunStatus,
  showCreateDraftSkeleton,
  prepareNewRun,
  finalContent,
  reportPath,
  artifactRecords,
  runId,
  workspace,
  selectedProject,
  effectiveResumeHeaderVisible,
  hasActiveEntryState,
  hasSourceArtifacts,
  nextStageTemplate,
  stageStartTitle,
  stageStartDescription,
  stageStartContextLine,
  stageStartProvenanceLabel,
  stageStartInputLabels,
  templateOutputText,
  workflowName,
  elapsed,
}: {
  workflow: Workflow
  runtimeNodes: WorkflowNode[]
  runtimeMeta: WorkflowRuntimeMeta
  nodeStates: Record<string, NodeState>
  runStatus: ExecutionRunStatus
  runOutcome: RunStatus | null
  activeNodeId: string | null
  hasBlockedResumeState: boolean
  effectiveResumeHeader: boolean
  viewMode: ViewMode
  flowSurfaceMode: FlowSurfaceMode
  showAnyReviewMode: boolean
  selectedPastRunStatus: RunStatus | null | undefined
  showCreateDraftSkeleton: boolean
  prepareNewRun: boolean
  finalContent: string
  reportPath: string | null
  artifactRecords: ArtifactRecord[]
  runId: string | null
  workspace: string | null
  selectedProject: string | null
  effectiveResumeHeaderVisible: boolean
  hasActiveEntryState: boolean
  hasSourceArtifacts: boolean
  nextStageTemplate: WorkflowTemplate | null
  stageStartTitle: string
  stageStartDescription: string | null
  stageStartContextLine: string | null
  stageStartProvenanceLabel: string | null
  stageStartInputLabels: string[]
  templateOutputText?: string | null
  workflowName: string
  elapsed: string
}) {
  const hasResult =
    finalContent.trim().length > 0 ||
    reportPath !== null ||
    Object.values(nodeStates).some(
      (state) => typeof state.output?.content === "string",
    )

  const runSummary = useMemo(
    () =>
      buildRunProgressSummary({
        workflow,
        runtimeNodes,
        runtimeMeta,
        nodeStates,
        runStatus,
        runOutcome,
        activeNodeId,
      }),
    [
      activeNodeId,
      nodeStates,
      runOutcome,
      runStatus,
      runtimeMeta,
      runtimeNodes,
      workflow,
    ],
  )

  const runDisplayState = useMemo(
    () =>
      resolveWorkflowRunDisplayState({
        runStatus,
        runOutcome,
      }),
    [runOutcome, runStatus],
  )

  const shellState = useMemo<WorkflowPanelShellState>(() => {
    const reviewShellState =
      showAnyReviewMode && runStatus === "idle"
        ? resolveReviewShellState(selectedPastRunStatus)
        : null
    if (reviewShellState) return reviewShellState
    if (runDisplayState.state === "paused") return "paused"
    if (
      runDisplayState.state === "starting" ||
      runDisplayState.state === "running" ||
      runDisplayState.state === "cancelling"
    )
      return "running"
    if (hasBlockedResumeState || runDisplayState.state === "blocked")
      return "blocked"
    if (runDisplayState.state === "failed") return "failed"
    if (runDisplayState.state === "completed") return "completed"
    if (runDisplayState.state === "cancelled") return "cancelled"
    if (effectiveResumeHeader) return "ready"
    return "idle"
  }, [
    effectiveResumeHeader,
    hasBlockedResumeState,
    runDisplayState.state,
    runStatus,
    selectedPastRunStatus,
    showAnyReviewMode,
  ])

  const shellDetail = useMemo(() => {
    if (shellState !== "running" && shellState !== "paused") return null

    const progressLabel =
      runSummary.branchLabel ||
      (runSummary.totalSteps > 0
        ? `${Math.min(runSummary.completedSteps, runSummary.totalSteps)}/${runSummary.totalSteps}`
        : null)
    const detailParts = [
      runStatus === "starting"
        ? "Preparing run"
        : runStatus === "running" || runStatus === "paused"
          ? runSummary.activeStepLabel
          : null,
      progressLabel,
      elapsed || null,
    ].filter((value): value is string => Boolean(value))

    return detailParts.length > 0 ? detailParts.join(" · ") : null
  }, [elapsed, runStatus, runSummary, shellState])

  const isRuntimeFlowView = viewMode === "list" && runStatus !== "idle"
  const listShellClass = isRuntimeFlowView
    ? "flex min-h-full w-full flex-col gap-3 px-[var(--content-gutter)] py-4"
    : "ui-content-shell py-3 space-y-3"

  const firstRunnableNode = useMemo(
    () =>
      workflow.nodes.find(
        (node) => node.type !== "input" && node.type !== "output",
      ) || null,
    [workflow.nodes],
  )

  const canShowTerminalResultSurface =
    hasResult ||
    runStatus === "error" ||
    (runStatus === "done" && runOutcome !== "blocked")
  const primaryScreenState = useMemo<WorkflowPrimaryScreenState>(
    () =>
      resolveWorkflowPrimaryScreenState({
        runStatus,
        runOutcome,
        showAnyReviewMode,
        hasBlockedResumeState,
        hasActiveEntryState,
        hasSourceArtifacts,
        canShowTerminalResultSurface,
        nextStageTemplate,
        prepareNewRun,
      }),
    [
      canShowTerminalResultSurface,
      hasActiveEntryState,
      hasBlockedResumeState,
      hasSourceArtifacts,
      nextStageTemplate,
      prepareNewRun,
      runOutcome,
      runStatus,
      showAnyReviewMode,
    ],
  )

  const idleStageContract = useMemo(() => {
    if (!firstRunnableNode) return null

    const presentation = getRuntimeStagePresentation(firstRunnableNode, {
      fallbackId: firstRunnableNode.id,
    })
    const isEntryContractState =
      primaryScreenState === "fresh_start" ||
      primaryScreenState === "cross_flow_handoff"
    return {
      title: isEntryContractState ? stageStartTitle : presentation.title,
      resultLabel: templateOutputText?.trim() || presentation.artifactLabel,
      summary: stageStartDescription || presentation.outcomeText,
      inputLabels: stageStartInputLabels,
      contextLine: isEntryContractState ? stageStartContextLine : null,
      provenanceLabel: isEntryContractState ? stageStartProvenanceLabel : null,
      showNeeds: !isEntryContractState,
    }
  }, [
    firstRunnableNode,
    primaryScreenState,
    stageStartContextLine,
    stageStartDescription,
    stageStartInputLabels,
    stageStartProvenanceLabel,
    stageStartTitle,
    templateOutputText,
  ])

  const liveTerminalResultOwnsLayout =
    viewMode === "list" &&
    runStatus === "idle" &&
    canShowTerminalResultSurface &&
    !showAnyReviewMode &&
    !prepareNewRun
  const showOutputPanel =
    showAnyReviewMode ||
    runStatus !== "idle" ||
    (liveTerminalResultOwnsLayout &&
      shouldShowLiveOutputPanel(primaryScreenState))

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

  const resultSourceAttachments = useMemo<InputAttachment[]>(() => {
    if (artifactRecords.length > 0) {
      return buildArtifactInputAttachments(artifactRecords)
    }
    if (runId && workspace) {
      return [
        {
          kind: "run",
          runId,
          workspace,
          workflowName: workflowName || "Current flow",
        },
      ]
    }
    if (resultSourceText) {
      return [
        {
          kind: "text",
          label: workflowName ? `${workflowName} result` : "Current result",
          content: resultSourceText,
        },
      ]
    }
    return []
  }, [artifactRecords, resultSourceText, runId, workflowName, workspace])

  const resultSourceLabel = useMemo(() => {
    if (artifactRecords.length > 0) {
      const visibleTitles = artifactRecords
        .slice(0, 2)
        .map((artifact) => artifact.title)
      if (artifactRecords.length > 2) {
        visibleTitles.push(`+${artifactRecords.length - 2} more`)
      }
      return visibleTitles.join(" · ")
    }
    return workflowName ? `${workflowName} result` : "Current result"
  }, [artifactRecords, workflowName])

  const canUseInNewFlow = Boolean(
    selectedProject &&
    canShowTerminalResultSurface &&
    resultSourceAttachments.length > 0,
  )

  const showIdleStageContract = resolveShowIdleStageContract({
    viewMode,
    primaryScreenState,
    showCreateDraftSkeleton,
    showAnyReviewMode,
    idleStageContract,
    effectiveResumeHeader,
  })
  const showFlowEditor =
    shellState === "running" ||
    shellState === "paused" ||
    (shellState === "idle" &&
      flowSurfaceMode === "edit" &&
      !showAnyReviewMode &&
      primaryScreenState !== "cross_flow_handoff" &&
      primaryScreenState !== "blocked_decision")

  return {
    primaryScreenState,
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
    showProcessSpine: shouldShowProcessSpine(primaryScreenState),
    reviewFlowHasSnapshot: showAnyReviewMode && effectiveResumeHeaderVisible,
  }
}
