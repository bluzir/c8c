import { useAtomValue } from "jotai"
import { useState, useCallback, useMemo } from "react"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Loader2 } from "lucide-react"
import { desktopRuntimeAtom } from "@/lib/store"
import { useOutputPanel } from "@/hooks/useOutputPanel"
import { ActivityTab } from "@/components/output/ActivityTab"
import { OutputPanelHeader } from "@/components/output/OutputPanelHeader"
import {
  OutputPanelContextMenu,
  type OutputPanelContextMenuState,
} from "@/components/output/OutputPanelContextMenu"
import { OutputPanelHistoryContent } from "@/components/output/OutputPanelHistoryContent"
import { OutputPanelLogContent } from "@/components/output/OutputPanelLogContent"
import { ResultTab } from "@/components/output/ResultTab"
import type { ArtifactRecord, LoadedRunResult, RunResult, WorkflowTemplate } from "@shared/types"
import { ExecutionSurfaceNoticeBanner } from "@/components/ui/execution-surface-notice"
import { useOutputPanelActions } from "@/components/output/useOutputPanelActions"
import { useOutputPanelCommandBindings } from "@/components/output/useOutputPanelCommandBindings"
import { useOutputPanelDerivedState } from "@/components/output/useOutputPanelDerivedState"
import { useOutputPanelSurfaceState } from "@/components/output/useOutputPanelSurfaceState"
import type { OutputTabRequest, OutputTabValue } from "@/components/output/outputPanelTypes"
import { cn } from "@/lib/cn"

// ── Main OutputPanel ─────────────────────────────────────

export function OutputPanel({
  onOpenReport = (path: string) => { void window.api.openReport(path) },
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
  onRerunFrom?: (nodeId: string, options?: { workspace?: string | null }) => Promise<void> | void
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
  const [outputContextMenu, setOutputContextMenu] = useState<OutputPanelContextMenuState>(null)
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

  const selectedWorkflowNode = useMemo(() => {
    if (!selectedStageId) return null
    return workflow.nodes.find((n) => n.id === selectedStageId) ?? null
  }, [selectedStageId, workflow.nodes])
  const displayNodeIds = useMemo(() => allDisplayNodes.map((node) => node.id), [allDisplayNodes])
  const summaryProgressItems = useMemo(() => ([
    workflowStepCount > 0 ? `${completedStageCount}/${workflowStepCount} done` : null,
    failedStageCount > 0
      ? `${failedStageCount} need${failedStageCount === 1 ? "s" : ""} attention`
      : blockedStageCount > 0
        ? `${blockedStageCount} blocked`
        : runningStageCount > 0
          ? `${runningStageCount} running`
          : pendingStageCount > 0 && completedStageCount === 0
            ? "Ready to run"
            : null,
  ].filter(Boolean) as string[]), [
    blockedStageCount,
    completedStageCount,
    failedStageCount,
    pendingStageCount,
    runningStageCount,
    workflowStepCount,
  ])
  const historyScopeLabel = useMemo(
    () => `History: ${selectedReviewRun?.workflowName || executionWorkflowName || workflow.name || "Flow"}`,
    [executionWorkflowName, selectedReviewRun?.workflowName, workflow.name],
  )

  const handleRerunFrom = useCallback((nodeId: string) => {
    if (!onRerunFrom || !rerunWorkspace) return
    void onRerunFrom(nodeId, { workspace: rerunWorkspace })
  }, [onRerunFrom, rerunWorkspace])
  const canInspectActivity = !showIdleState && (!reviewingRunHistory || canInspectSavedRun)
  const canInspectLog = !showIdleState && Boolean(selectedStageId) && (!reviewingRunHistory || canInspectSavedRun)
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
      nextStageTemplate
      && onRunNextStage
      && artifactPersistenceStatus !== "saving"
      && !nextStagePending,
    ),
    onRunNextStage,
    onUseInNewFlow,
    onActivateResultSurface: activateResultSurface,
    onFocusStageSurface: focusStageSurface,
    onOpenHistory: () => setActiveTab("history"),
    onRerunFrom: handleRerunFrom,
  })

  const savedRunLoadingNotice = reviewingRunHistory && reviewedRunLoading ? (
    <div className="flex items-center gap-2 px-1 py-2 ui-meta-text text-muted-foreground">
      <Loader2 size={14} className="animate-spin shrink-0" />
      Loading saved run details…
    </div>
  ) : null
  const savedRunErrorNotice = reviewingRunHistory && !reviewedRunLoading && reviewedRunError ? (
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
  const savedRunSnapshotNotice = reviewingRunHistory && !reviewedRunLoading && !reviewedRunError && !reviewSnapshot ? (
    <ExecutionSurfaceNoticeBanner
      notice={{
        level: "warning",
        title: "Saved snapshot missing",
        description: "This saved run still has its final result, but the full step snapshot is unavailable.",
        actionLabel: "",
        actionTarget: "result",
      }}
    />
  ) : null
  const runAttentionBanner = !reviewingRunHistory && (runStatus === "error" || runOutcome === "failed" || runOutcome === "interrupted") ? (
    <ExecutionSurfaceNoticeBanner
      notice={{
        level: "error",
        title: "Run needs attention",
        description: failedNodeErrors.length === 0
          ? "Inspect the activity log for the failing step or the last interrupted step."
          : "One or more steps failed during the latest run.",
        actionLabel: "",
        actionTarget: "activity",
      }}
      children={failedNodeErrors.length > 0 ? (
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
                <pre className="mt-1 whitespace-pre-wrap text-status-danger/70 pl-4 text-body-sm">{errorText}</pre>
              </details>
            ) : (
              <div key={id} className="text-status-danger/80">
                <span className="font-medium">{node?.label || id}:</span>{" "}
                {errorText}
              </div>
            )
          })}
        </div>
      ) : null}
    />
  ) : null
  const errorFigureOwnsSurface = !reviewingRunHistory
    && showResultSurface
    && (runStatus === "error" || effectiveRunOutcome === "failed" || effectiveRunOutcome === "interrupted")
  const tabOptions = useMemo(() => {
    const options: Array<{ value: OutputTabValue, label: string }> = []
    if (canInspectActivity) {
      options.push({ value: "nodes", label: "Summary" })
    }
    if (showResultSurface) {
      options.push({ value: "result", label: "Result" })
    }
    if (canInspectLog) {
      options.push({ value: "log", label: "Step log" })
    }
    if (canInspectHistory) {
      options.push({ value: "history", label: "History" })
    }
    return options
  }, [canInspectActivity, canInspectHistory, canInspectLog, showResultSurface])

  const activityOwnsSurface = !showIdleState
    && activeTab === "nodes"
    && !reviewingRunHistory
    && !errorFigureOwnsSurface
  const scopeLabel = activeTab === "nodes"
    ? null
    : activeTab === "result"
    ? selectedResultScopeLabel
    : activeTab === "history"
      ? historyScopeLabel
      : selectedStageScopeLabel

  return (
    <>
      <Tabs
        value={activeTab}
        onValueChange={(next) => setActiveTab(next as OutputTabValue)}
        className={cn(
          "ui-fade-slide-in",
          fillHeight
            ? "flex min-h-0 flex-1 flex-col gap-2.5"
            : "space-y-2.5",
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
        />
        {!reviewingRunHistory
          && !errorFigureOwnsSurface
          && surfaceNotice
          && !(showResultSurface && activeTab === "result")
          && !(activeTab === "nodes" && Boolean(runAttentionBanner)) && (
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
          className={cn("mt-0 ui-fade-slide-in", fillHeight && "min-h-0 flex-1 overflow-y-auto")}
        >
          {savedRunLoadingNotice}
          {savedRunErrorNotice}
          {savedRunSnapshotNotice}
          {(!reviewingRunHistory || canInspectSavedRun) && (
            <div className={cn(activityOwnsSurface && "rounded-lg surface-panel px-4 py-4")}>
              <ActivityTab
                showIdleState={showIdleState}
                selectedStagePresentation={selectedStagePresentation}
                selectedStageContextLabelClass={selectedStageContextLabelClass}
                selectedStageContextLabel={selectedStageContextLabel}
                selectedStageBranchLabel={selectedStageBranchLabel}
                selectedStageBranchDetail={selectedStageBranchDetail}
                runProgressItems={summaryProgressItems}
                resultReadyLabel={hasResult
                  ? (selectedResultScopeLabel.replace(/^Result from:\s*/u, "") || selectedResultPresentation?.artifactLabel || "Result")
                  : null}
                onViewResult={showResultSurface ? activateResultSurface : null}
                selectedStageBranchSummary={selectedStageBranchSummary}
                onOpenBranchLog={canInspectLog ? (nodeId: string) => {
                  setInspectedNodeId(nodeId)
                  setActiveTab("log")
                } : null}
                budgetWarning={budgetWarning}
                budgetWarningClassName={budgetWarningClassName}
                onViewStepLog={canInspectLog ? () => focusStageSurface("log") : null}
                runAttentionNotice={errorFigureOwnsSurface ? null : runAttentionBanner}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent
          value="log"
          className={cn("mt-2 ui-fade-slide-in", fillHeight && "min-h-0 flex-1 overflow-y-auto")}
        >
          <OutputPanelLogContent
            showIdleState={showIdleState}
            canInspectActivity={canInspectActivity}
            tabOptionsLength={tabOptions.length}
            onBackToActivity={() => focusStageSurface("nodes")}
            savedRunLoadingNotice={savedRunLoadingNotice}
            savedRunErrorNotice={savedRunErrorNotice}
            savedRunSnapshotNotice={savedRunSnapshotNotice}
            reviewingRunHistory={reviewingRunHistory}
            canInspectSavedRun={canInspectSavedRun}
            selectedStagePresentation={selectedStagePresentation}
            selectedStageContextLabelClass={selectedStageContextLabelClass}
            selectedStageContextLabel={selectedStageContextLabel}
            selectedStageBranchLabel={selectedStageBranchLabel}
            selectedStageBranchDetail={selectedStageBranchDetail}
            selectedNodeId={selectedStageId}
            nodeStates={displayNodeStates}
            evalResults={displayEvalResults}
            workflowNode={selectedWorkflowNode}
            runId={runId}
            evalOverrideNodeIds={evalOverrideNodeIds}
          />
        </TabsContent>

        <TabsContent
          value="result"
          className={cn("mt-2 ui-fade-slide-in", fillHeight && "min-h-0 flex-1 overflow-y-auto")}
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
              onRerunSelectedStage={selectedStageRerunNodeId && canRerunSelectedStage ? () => handleRerunFrom(selectedStageRerunNodeId) : null}
              onViewActivity={canInspectActivity ? () => focusStageSurface("nodes") : null}
              onEditFlow={onEditFlow}
              failedNodeErrors={failedNodeErrors}
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

        <TabsContent
          value="history"
          className={cn("mt-2 ui-fade-slide-in", fillHeight && "min-h-0 flex-1")}
        >
          <OutputPanelHistoryContent
            fillHeight={fillHeight}
            showResultSurface={showResultSurface}
            canInspectActivity={canInspectActivity}
            tabOptionsLength={tabOptions.length}
            onBackToResult={activateResultSurface}
            onBackToActivity={() => focusStageSurface("nodes")}
            pastRuns={pastRuns}
            runStatus={runStatus}
            onOpenReport={handleOpenReport}
            onContinueRun={onContinueRun}
            selectedRunId={selectedReviewRun?.runId || null}
            onSelectRun={(run) => {
              setSelectedPastRun(run)
              setActiveTab("result")
            }}
          />
        </TabsContent>
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
