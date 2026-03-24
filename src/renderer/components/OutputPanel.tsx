import { useAtomValue } from "jotai"
import { useState, useCallback, useEffect, useMemo } from "react"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Loader2 } from "lucide-react"
import {
  desktopRuntimeAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
} from "@/lib/store"
import { useOutputPanel } from "@/hooks/useOutputPanel"
import { ActivityTab } from "@/components/output/ActivityTab"
import { OutputPanelHeader } from "@/components/output/OutputPanelHeader"
import {
  OutputPanelContextMenu,
  type OutputPanelContextMenuState,
} from "@/components/output/OutputPanelContextMenu"
// OutputPanelHistoryContent and OutputPanelLogContent removed — history via Runs button, log inline in StepsList
import { StepsList } from "@/components/output/StepsList"
import { ResultTab } from "@/components/output/ResultTab"
import type {
  ArtifactRecord,
  ErrorKind,
  FlowImprovementRecommendation,
  LoadedRunResult,
  RunResult,
  WorkflowTemplate,
} from "@shared/types"
import { ExecutionSurfaceNoticeBanner } from "@/components/ui/execution-surface-notice"
import { dispatchDesktopCommand } from "@/lib/desktop-command-bus"
import { useOutputPanelActions } from "@/components/output/useOutputPanelActions"
import { useOutputPanelCommandBindings } from "@/components/output/useOutputPanelCommandBindings"
import { useOutputPanelDerivedState } from "@/components/output/useOutputPanelDerivedState"
import { useOutputPanelSurfaceState } from "@/components/output/useOutputPanelSurfaceState"
import type {
  OutputTabRequest,
  OutputTabValue,
} from "@/components/output/outputPanelTypes"
import { cn } from "@/lib/cn"

function deriveFailureRecovery(
  errorKind: ErrorKind | null | undefined,
  errorText: string | null | undefined,
) {
  const normalized = (errorText || "").toLowerCase()

  if (
    normalized.includes("api key") ||
    normalized.includes("not authenticated") ||
    normalized.includes("not logged in") ||
    normalized.includes("login required") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden") ||
    normalized.includes("401") ||
    normalized.includes("403")
  ) {
    return {
      categoryLabel: "Authentication issue",
      hint: "Check provider login or API key in Settings, then retry the failing step.",
    }
  }

  if (
    normalized.includes("rate limit") ||
    normalized.includes("too many requests") ||
    normalized.includes("429")
  ) {
    return {
      categoryLabel: "Rate limit",
      hint: "Wait a moment, then retry the failing step.",
    }
  }

  if (
    errorKind === "timeout" ||
    normalized.includes("timed out") ||
    normalized.includes("timeout")
  ) {
    return {
      categoryLabel: "Timeout",
      hint: "Retry the step or raise the timeout if this work usually runs longer.",
    }
  }

  if (
    errorKind === "network" ||
    normalized.includes("network") ||
    normalized.includes("socket") ||
    normalized.includes("dns") ||
    normalized.includes("fetch failed") ||
    normalized.includes("econn")
  ) {
    return {
      categoryLabel: "Connection lost",
      hint: "Check your connection. This step will retry automatically when the connection restores, or you can retry manually.",
    }
  }

  if (
    errorKind === "policy" ||
    normalized.includes("policy") ||
    normalized.includes("blocked by")
  ) {
    return {
      categoryLabel: "Flow rule block",
      hint: "Review the active rules or approval policy, then retry the blocked step.",
    }
  }

  if (errorKind === "tool" || normalized.includes("tool")) {
    return {
      categoryLabel: "Tool failure",
      hint: "Inspect the step log for the failing tool call, then retry this step.",
    }
  }

  if (errorKind === "model") {
    return {
      categoryLabel: "Model error",
      hint: "Retry the step. If it repeats, inspect the prompt or provider state.",
    }
  }

  return {
    categoryLabel: "Execution error",
    hint: "Inspect the failing step, then retry from there if the issue looks transient.",
  }
}

// ── Main OutputPanel ─────────────────────────────────────

export function OutputPanel({
  onOpenReport = (path: string) => {
    void window.api.openReport(path)
  },
  onRerunFrom,
  onContinueRun,
  requestedTab,
  reviewingPastRun = false,
  reviewedRun = null,
  reviewedRunDetails = null,
  reviewedRunLoading = false,
  reviewedRunError = null,
  onStartNewRun,
  onOpenInbox,
  onOpenArtifacts,
  onEditFlow,
  nextStageTemplate = null,
  nextStageArtifacts = [],
  onRunNextStage,
  nextStagePending = false,
  fillHeight = false,
  onUseInNewFlow = null,
}: {
  onOpenReport?: (path: string) => void | Promise<void>
  onRerunFrom?: (
    nodeId: string,
    options?: { workspace?: string | null },
  ) => Promise<void> | void
  onContinueRun?: (run: RunResult) => Promise<void> | void
  requestedTab?: OutputTabRequest | null
  reviewingPastRun?: boolean
  reviewedRun?: RunResult | null
  reviewedRunDetails?: LoadedRunResult | null
  reviewedRunLoading?: boolean
  reviewedRunError?: string | null
  onStartNewRun?: () => void
  onOpenInbox?: () => void
  onOpenArtifacts?: () => void
  onEditFlow?: () => void
  nextStageTemplate?: WorkflowTemplate | null
  nextStageArtifacts?: ArtifactRecord[]
  onRunNextStage?: (() => Promise<void> | void) | null
  nextStagePending?: boolean
  fillHeight?: boolean
  onUseInNewFlow?: (() => Promise<void> | void) | null
}) {
  const desktopRuntime = useAtomValue(desktopRuntimeAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)
  const selectedWorkflowPath = useAtomValue(selectedWorkflowPathAtom)
  const {
    runStatus,
    runOutcome,
    runStartedAt,
    completedAt,
    executionWorkflowName,
    nodeStates,
    activeNodeId,
    selectedNodeId: inspectedNodeId,
    setSelectedNodeId: setInspectedNodeId,
    finalContent,
    workflow,
    evalResults,
    runtimeMeta,
    reportPath,
    pastRuns,
    selectedPastRun,
    setSelectedPastRun,
    workspace,
    artifactRecords,
    artifactPersistenceStatus,
    artifactPersistenceError,
    surfaceNotice,
    setSurfaceNotice,
    runId,
    evalOverrideNodeIds,
  } = useOutputPanel()
  const [improvementRecommendations, setImprovementRecommendations] = useState<
    FlowImprovementRecommendation[]
  >([])
  const [outputContextMenu, setOutputContextMenu] =
    useState<OutputPanelContextMenuState>(null)
  const {
    selectedReviewRun,
    rerunWorkspace,
    reviewingRunHistory,
    reviewSnapshot,
    displayNodeStates,
    displayEvalResults,
    allDisplayNodes,
    displayActiveNodeId,
    resultNodeOptions,
    budgetWarning,
    budgetWarningClassName,
    hasResult,
    displayedResultContent,
    resultCopyTextWithHeader,
    isDisplayedResultEmpty,
    canCopyResult,
    hasMultipleResultOptions,
    showIdleState,
    selectedResultNodeId,
    selectedResultPresentation,
    selectedResultBranchLabel,
    selectedResultScopeLabel,
    selectedStageId,
    selectedStageRerunNodeId,
    selectedStageIndex,
    selectedStagePresentation,
    selectedStageBranchLabel,
    selectedStageBranchDetail,
    selectedStageBranchSummary,
    selectedStageScopeLabel,
    selectedStageResourceLabel,
    selectedStageResourceItems,
    workflowStepCount,
    completedStageCount,
    runningStageCount,
    blockedStageCount,
    pendingStageCount,
    failedStageCount,
    selectedStageContextLabel,
    selectedStageContextLabelClass,
    selectedRunLabel,
    canInspectSavedRun,
    canStartFreshRun,
    canRerunSelectedStage,
    showResultSurface,
    showArtifactContinuation,
    failedNodeErrors,
    artifactContinuationToneClass,
    nextStageRequiresApproval,
    nextStageAutoRuns,
    nextStageLabel,
    nextStageDescription,
    visibleArtifactContinuation,
    hiddenArtifactContinuationCount,
    visibleNextStageArtifacts,
    hiddenNextStageArtifactCount,
    executionLoopSummary,
    effectiveRunOutcome,
  } = useOutputPanelDerivedState({
    runStatus,
    runOutcome,
    runStartedAt,
    completedAt,
    executionWorkflowName,
    nodeStates,
    activeNodeId,
    inspectedNodeId,
    finalContent,
    workflow,
    evalResults,
    runtimeMeta,
    pastRuns,
    reviewedRun: reviewedRun || selectedPastRun || null,
    reviewedRunDetails,
    reviewingPastRun,
    artifactRecords,
    artifactPersistenceStatus,
    artifactPersistenceError,
    workspace,
    onStartNewRun,
    onContinueRun,
    onRerunFrom,
    nextStageTemplate,
    nextStageArtifacts,
    nextStagePending,
  })

  useEffect(() => {
    if (!selectedProject || !workflow.name.trim()) {
      setImprovementRecommendations([])
      return
    }
    if (!window.api?.listFlowImprovementRecommendations) {
      setImprovementRecommendations([])
      return
    }

    let cancelled = false
    window.api
      .listFlowImprovementRecommendations(
        selectedProject,
        selectedWorkflowPath,
        workflow.name,
      )
      .then((recommendations) => {
        if (cancelled) return
        setImprovementRecommendations(recommendations.slice(0, 3))
      })
      .catch((error) => {
        console.error(
          "[OutputPanel] load improvement recommendations failed:",
          error,
        )
        if (!cancelled) setImprovementRecommendations([])
      })

    return () => {
      cancelled = true
    }
  }, [selectedProject, selectedWorkflowPath, workflow.name])

  const selectedWorkflowNode = useMemo(() => {
    if (!selectedStageId) return null
    return workflow.nodes.find((n) => n.id === selectedStageId) ?? null
  }, [selectedStageId, workflow.nodes])
  const displayNodeIds = useMemo(
    () => allDisplayNodes.map((node) => node.id),
    [allDisplayNodes],
  )
  const summaryProgressItems = useMemo(
    () =>
      [
        workflowStepCount > 0
          ? `${completedStageCount}/${workflowStepCount} done`
          : null,
        failedStageCount > 0
          ? `${failedStageCount} need${failedStageCount === 1 ? "s" : ""} attention`
          : blockedStageCount > 0
            ? `${blockedStageCount} blocked`
            : runningStageCount > 0
              ? `${runningStageCount} running`
              : pendingStageCount > 0 && completedStageCount === 0
                ? "Ready to run"
                : null,
      ].filter(Boolean) as string[],
    [
      blockedStageCount,
      completedStageCount,
      failedStageCount,
      pendingStageCount,
      runningStageCount,
      workflowStepCount,
    ],
  )
  const historyScopeLabel = useMemo(
    () =>
      `History: ${selectedReviewRun?.workflowName || executionWorkflowName || workflow.name || "Flow"}`,
    [executionWorkflowName, selectedReviewRun?.workflowName, workflow.name],
  )
  const primaryFailedStep = useMemo(() => {
    const [nodeId, state] = failedNodeErrors[0] || []
    if (!nodeId || !state) return null
    const node =
      allDisplayNodes.find((candidate) => candidate.id === nodeId) || null
    return {
      id: nodeId,
      label: node?.label || nodeId,
      error: state.error || null,
      errorKind: displayNodeStates[nodeId]?.errorKind || null,
    }
  }, [allDisplayNodes, displayNodeStates, failedNodeErrors])
  const failureRecovery = useMemo(
    () =>
      deriveFailureRecovery(
        primaryFailedStep?.errorKind,
        primaryFailedStep?.error,
      ),
    [primaryFailedStep?.error, primaryFailedStep?.errorKind],
  )
  const retryStepLabel =
    selectedStagePresentation?.title || primaryFailedStep?.label || null

  const handleRerunFrom = useCallback(
    (nodeId: string) => {
      if (!onRerunFrom || !rerunWorkspace) return
      void onRerunFrom(nodeId, { workspace: rerunWorkspace })
    },
    [onRerunFrom, rerunWorkspace],
  )
  const canInspectActivity =
    !showIdleState && (!reviewingRunHistory || canInspectSavedRun)
  const canInspectLog =
    !showIdleState &&
    Boolean(selectedStageId) &&
    (!reviewingRunHistory || canInspectSavedRun)
  const failureTargetNodeId = primaryFailedStep?.id || selectedStageId || null
  const canInspectFailureLog =
    !showIdleState &&
    Boolean(failureTargetNodeId) &&
    (!reviewingRunHistory || canInspectSavedRun)
  const canInspectHistory = pastRuns.length > 0
  const {
    activeTab,
    setActiveTab,
    resultReadyPulse,
    focusStageSurface,
    activateResultSurface,
    handleSurfaceNoticeAction,
  } = useOutputPanelSurfaceState({
    requestedTab,
    showResultSurface,
    reviewingRunHistory,
    pastRunCount: pastRuns.length,
    canInspectActivity,
    canInspectLog,
    runStatus,
    effectiveRunOutcome,
    runId,
    surfaceNotice,
    selectedStageId,
    selectedResultNodeId,
    displayNodeIds,
    setInspectedNodeId,
    setSurfaceNotice,
    onOpenInbox,
  })
  const inspectFailure = useCallback(() => {
    const failureNodeId = failureTargetNodeId
    if (!failureNodeId) return
    setInspectedNodeId(failureNodeId)
    if (canInspectFailureLog) {
      setActiveTab("nodes")
      return
    }
    if (canInspectActivity) {
      setActiveTab("nodes")
    }
  }, [
    canInspectActivity,
    canInspectFailureLog,
    failureTargetNodeId,
    setInspectedNodeId,
    setActiveTab,
  ])
  const {
    handleCopyResult,
    handleOpenReport,
    handleOpenArtifact,
    handleCopyArtifactPath,
  } = useOutputPanelActions({
    canCopyResult,
    resultCopyTextWithHeader,
    onOpenReport,
  })
  useOutputPanelCommandBindings({
    primaryModifierKey: desktopRuntime.primaryModifierKey,
    activeTab,
    showResultSurface,
    canInspectActivity,
    canInspectLog,
    canInspectHistory,
    canRerunSelectedStage,
    reviewingRunHistory,
    selectedStageId: selectedStageRerunNodeId,
    showArtifactContinuation,
    canTriggerNextStageShortcut: Boolean(
      nextStageTemplate &&
      onRunNextStage &&
      artifactPersistenceStatus !== "saving" &&
      !nextStagePending,
    ),
    onRunNextStage,
    onUseInNewFlow,
    onActivateResultSurface: activateResultSurface,
    onFocusStageSurface: focusStageSurface,
    onOpenHistory: () => dispatchDesktopCommand("flow.history"),
    onRerunFrom: handleRerunFrom,
  })

  const savedRunLoadingNotice =
    reviewingRunHistory && reviewedRunLoading ? (
      <div className="flex items-center gap-2 px-1 py-2 ui-meta-text text-muted-foreground">
        <Loader2 size={14} className="animate-spin shrink-0" />
        Loading saved run details…
      </div>
    ) : null
  const savedRunErrorNotice =
    reviewingRunHistory && !reviewedRunLoading && reviewedRunError ? (
      <ExecutionSurfaceNoticeBanner
        notice={{
          level: "error",
          title: "Saved run unavailable",
          description: reviewedRunError,
          actionLabel: "",
          actionTarget: "result",
        }}
      />
    ) : null
  const savedRunSnapshotNotice =
    reviewingRunHistory &&
    !reviewedRunLoading &&
    !reviewedRunError &&
    !reviewSnapshot ? (
      <ExecutionSurfaceNoticeBanner
        notice={{
          level: "warning",
          title: "Saved snapshot missing",
          description:
            "This saved run still has its final result, but the full step snapshot is unavailable.",
          actionLabel: "",
          actionTarget: "result",
        }}
      />
    ) : null
  const runAttentionBanner =
    !reviewingRunHistory &&
    (runStatus === "error" ||
      runOutcome === "failed" ||
      runOutcome === "interrupted") ? (
      <ExecutionSurfaceNoticeBanner
        notice={{
          level: "error",
          title: "Run failed",
          description:
            failedNodeErrors.length === 0
              ? "Inspect the activity log for the failing step or the last interrupted step."
              : `${failureRecovery.categoryLabel}. ${failureRecovery.hint}`,
          actionLabel: canInspectFailureLog
            ? "Inspect step log"
            : "Inspect summary",
          actionTarget: "activity",
        }}
        onAction={failedNodeErrors.length > 0 ? inspectFailure : null}
        children={
          failedNodeErrors.length > 0 ? (
            <div className="space-y-1 text-body-sm text-status-danger">
              {failedNodeErrors.map(([id, s]) => {
                const node = allDisplayNodes.find((n) => n.id === id)
                const errorText = s.error || "Unknown error"
                const isLong = errorText.length > 140
                return isLong ? (
                  <details key={id} className="text-status-danger/80">
                    <summary className="cursor-pointer list-none">
                      <span className="font-medium">{node?.label || id}:</span>{" "}
                      {errorText.slice(0, 140)}…
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap text-status-danger/70 pl-4 text-body-sm">
                      {errorText}
                    </pre>
                  </details>
                ) : (
                  <div key={id} className="text-status-danger/80">
                    <span className="font-medium">{node?.label || id}:</span>{" "}
                    {errorText}
                  </div>
                )
              })}
            </div>
          ) : null
        }
      />
    ) : null
  const errorFigureOwnsSurface =
    !reviewingRunHistory &&
    showResultSurface &&
    (runStatus === "error" ||
      effectiveRunOutcome === "failed" ||
      effectiveRunOutcome === "interrupted")
  const tabOptions = useMemo(() => {
    const options: Array<{ value: OutputTabValue; label: string }> = []
    if (canInspectActivity) {
      options.push({ value: "nodes", label: "Progress" })
    }
    if (showResultSurface) {
      options.push({ value: "result", label: "Result" })
    }
    // Step log is now inline in StepsList accordion — no separate tab
    // History moved to separate Runs button in toolbar
    return options
  }, [canInspectActivity, showResultSurface])

  const activityOwnsSurface =
    !showIdleState && activeTab === "nodes" && !errorFigureOwnsSurface
  const scopeLabel =
    activeTab === "nodes"
      ? selectedStageScopeLabel || null
      : activeTab === "result"
        ? selectedResultScopeLabel
        : selectedStageScopeLabel

  return (
    <>
      <Tabs
        value={activeTab}
        onValueChange={(next) => setActiveTab(next as OutputTabValue)}
        className={cn(
          "ui-fade-slide-in",
          fillHeight ? "flex min-h-0 flex-1 flex-col gap-2.5" : "space-y-2.5",
        )}
      >
        <OutputPanelHeader
          activeTab={activeTab}
          hasResult={hasResult}
          resultReadyPulse={resultReadyPulse}
          scopeLabel={scopeLabel}
          reviewingRunHistory={reviewingRunHistory}
          selectedRunLabel={selectedRunLabel}
          selectedReviewStatus={selectedReviewRun?.status || null}
          tabOptions={tabOptions}
          onExitReview={
            reviewingRunHistory && onStartNewRun
              ? () => {
                  onStartNewRun()
                }
              : null
          }
        />
        {!reviewingRunHistory &&
          !errorFigureOwnsSurface &&
          surfaceNotice &&
          !(showResultSurface && activeTab === "result") &&
          !(activeTab === "nodes" && Boolean(runAttentionBanner)) && (
            <ExecutionSurfaceNoticeBanner
              notice={surfaceNotice}
              onAction={
                surfaceNotice.actionTarget === "inbox" && !onOpenInbox
                  ? null
                  : handleSurfaceNoticeAction
              }
              onDismiss={() => setSurfaceNotice(null)}
            />
          )}

        <TabsContent
          value="nodes"
          className={cn(
            "mt-0 ui-fade-slide-in",
            fillHeight && "min-h-0 flex-1 overflow-y-auto",
          )}
        >
          {savedRunLoadingNotice}
          {savedRunErrorNotice}
          {savedRunSnapshotNotice}
          {(!reviewingRunHistory || canInspectSavedRun) && (
            <StepsList
              nodes={allDisplayNodes as any}
              nodeStates={displayNodeStates}
              evalResults={displayEvalResults}
              activeNodeId={displayActiveNodeId}
              runtimeMeta={runtimeMeta}
              workflow={workflow}
              runId={runId}
              evalOverrideNodeIds={evalOverrideNodeIds}
              onRerunFrom={onRerunFrom ? handleRerunFrom : undefined}
            />
          )}
        </TabsContent>

        <TabsContent
          value="result"
          className={cn(
            "mt-2 ui-fade-slide-in",
            fillHeight && "min-h-0 flex-1 overflow-y-auto",
          )}
        >
          {showResultSurface ? (
            <ResultTab
              nodeStates={displayNodeStates}
              evalResults={displayEvalResults}
              runStatus={runStatus}
              runOutcome={effectiveRunOutcome}
              reviewingRunHistory={reviewingRunHistory}
              selectedReviewRun={selectedReviewRun}
              selectedResultPresentation={selectedResultPresentation}
              selectedResultBranchLabel={selectedResultBranchLabel}
              selectedStagePresentation={selectedStagePresentation}
              selectedStageIndex={selectedStageIndex}
              workflowStepCount={workflowStepCount}
              completedStageCount={completedStageCount}
              failedStageCount={failedStageCount}
              isDisplayedResultEmpty={isDisplayedResultEmpty}
              executionLoopSummary={executionLoopSummary}
              savedRunLoadingNotice={savedRunLoadingNotice}
              savedRunErrorNotice={savedRunErrorNotice}
              hasMultipleResultOptions={hasMultipleResultOptions}
              resultNodeOptions={resultNodeOptions}
              selectedResultNodeId={selectedResultNodeId}
              onSelectResultNode={setInspectedNodeId}
              showArtifactContinuation={showArtifactContinuation}
              artifactContinuationToneClass={artifactContinuationToneClass}
              artifactPersistenceStatus={artifactPersistenceStatus}
              artifactPersistenceError={artifactPersistenceError}
              artifactRecords={artifactRecords}
              nextStageRequiresApproval={nextStageRequiresApproval}
              nextStageAutoRuns={nextStageAutoRuns}
              nextStageLabel={nextStageLabel}
              nextStageDescription={nextStageDescription}
              nextStageOutput={nextStageTemplate?.output}
              nextStagePending={nextStagePending}
              onRunNextStage={onRunNextStage}
              visibleArtifactContinuation={visibleArtifactContinuation}
              hiddenArtifactContinuationCount={hiddenArtifactContinuationCount}
              visibleNextStageArtifacts={visibleNextStageArtifacts}
              hiddenNextStageArtifactCount={hiddenNextStageArtifactCount}
              primaryModifierLabel={desktopRuntime.primaryModifierLabel}
              displayedResultContent={displayedResultContent}
              canStartFreshRun={canStartFreshRun}
              onStartNewRun={onStartNewRun}
              canRerunSelectedStage={canRerunSelectedStage}
              onRerunSelectedStage={
                selectedStageRerunNodeId && canRerunSelectedStage
                  ? () => handleRerunFrom(selectedStageRerunNodeId)
                  : null
              }
              onViewActivity={
                canInspectActivity ? () => focusStageSurface("nodes") : null
              }
              onInspectFailure={
                failedNodeErrors.length > 0 && canInspectFailureLog
                  ? inspectFailure
                  : null
              }
              onEditFlow={onEditFlow}
              failedNodeErrors={failedNodeErrors}
              failureCategoryLabel={
                failedNodeErrors.length > 0
                  ? failureRecovery.categoryLabel
                  : null
              }
              failureHint={
                failedNodeErrors.length > 0 ? failureRecovery.hint : null
              }
              retryStepLabel={retryStepLabel}
              canUseInNewFlow={Boolean(onUseInNewFlow) && !reviewingRunHistory}
              onUseInNewFlow={onUseInNewFlow}
              onOpenArtifact={handleOpenArtifact}
              onArtifactContextMenu={(event, artifact) => {
                setOutputContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  scope: "artifact",
                  artifact,
                })
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                setOutputContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  scope: "result",
                })
              }}
            />
          ) : null}
        </TabsContent>

        {/* History moved to Runs button in toolbar — see WorkflowPanel */}
      </Tabs>

      <OutputPanelContextMenu
        contextMenu={outputContextMenu}
        onOpenChange={(open) => {
          if (!open) setOutputContextMenu(null)
        }}
        onUseInNewFlow={onUseInNewFlow}
        canCopyResult={canCopyResult}
        onCopyResult={handleCopyResult}
        reportPath={reportPath}
        onOpenReport={handleOpenReport}
        onOpenArtifacts={onOpenArtifacts}
        hasArtifacts={artifactRecords.length > 0}
        onOpenArtifact={handleOpenArtifact}
        onCopyArtifactPath={handleCopyArtifactPath}
      />
    </>
  )
}
