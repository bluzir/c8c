import type { ReactNode } from "react"
import { ArrowRight } from "lucide-react"
import ReactMarkdown from "react-markdown"

import { useVerdictData } from "@/components/output/useVerdictData"
import { Button } from "@/components/ui/button"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import { ExecutionLoopCard } from "@/components/ui/execution-loop-card"
import { FlowRulesPreview } from "@/components/ui/flow-rules-preview"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/cn"
import { deriveExecutionLoopFlowRules } from "@/lib/flow-rules"
import { DEFAULT_MARKDOWN_PROPS } from "@/lib/markdown"
import type { ExecutionLoopSummary } from "@/lib/execution-loops"
import type { RuntimeStagePresentation } from "@/lib/runtime-flow-labels"
import type {
  ArtifactRecord,
  EvaluationResult,
  NodeState,
  RunResult,
} from "@shared/types"

const MARKDOWN_PROSE_CLASS = "prose-c8c"
const RESULT_MARKDOWN_PROPS = DEFAULT_MARKDOWN_PROPS as any

function stripLeadingMarkdownHeading(value: string) {
  return value.replace(/^\s*# .*(?:\r?\n)+(?:\r?\n)*/u, "")
}

function compactLine(items: Array<string | null | undefined>) {
  return items
    .filter((item): item is string => Boolean(item && item.trim()))
    .join(" · ")
}

interface ResultNodeOption {
  id: string
  label: string
  hasContent: boolean
}

export function ResultTab({
  nodeStates,
  evalResults,
  runStatus,
  runOutcome,
  reviewingRunHistory,
  selectedReviewRun,
  selectedResultPresentation,
  selectedResultBranchLabel,
  selectedStagePresentation,
  selectedStageIndex,
  workflowStepCount,
  completedStageCount,
  failedStageCount,
  isDisplayedResultEmpty,
  executionLoopSummary,
  savedRunLoadingNotice,
  savedRunErrorNotice,
  hasMultipleResultOptions,
  resultNodeOptions,
  selectedResultNodeId,
  onSelectResultNode,
  showArtifactContinuation,
  artifactContinuationToneClass,
  artifactPersistenceStatus,
  artifactPersistenceError,
  artifactRecords,
  nextStageRequiresApproval,
  nextStageAutoRuns,
  nextStageLabel,
  nextStageDescription,
  nextStageOutput,
  nextStagePending,
  onRunNextStage,
  visibleArtifactContinuation,
  hiddenArtifactContinuationCount,
  visibleNextStageArtifacts,
  hiddenNextStageArtifactCount,
  primaryModifierLabel,
  displayedResultContent,
  canStartFreshRun,
  onStartNewRun,
  canRerunSelectedStage,
  onRerunSelectedStage,
  onViewActivity,
  onInspectFailure,
  onEditFlow,
  failedNodeErrors,
  failureCategoryLabel,
  failureHint,
  retryStepLabel,
  canUseInNewFlow,
  onUseInNewFlow,
  onOpenArtifact,
  onArtifactContextMenu,
  onContextMenu,
}: {
  nodeStates: Record<string, NodeState>
  evalResults: Record<string, EvaluationResult[]>
  runStatus: string
  runOutcome: string | null
  reviewingRunHistory: boolean
  selectedReviewRun: RunResult | null
  selectedResultPresentation: RuntimeStagePresentation | null
  selectedResultBranchLabel: string | null
  selectedStagePresentation: RuntimeStagePresentation | null
  selectedStageIndex: number | null
  workflowStepCount: number
  completedStageCount: number
  failedStageCount: number
  isDisplayedResultEmpty: boolean
  executionLoopSummary: ExecutionLoopSummary | null
  savedRunLoadingNotice: ReactNode
  savedRunErrorNotice: ReactNode
  hasMultipleResultOptions: boolean
  resultNodeOptions: ResultNodeOption[]
  selectedResultNodeId: string | null
  onSelectResultNode: (nodeId: string) => void
  showArtifactContinuation: boolean
  artifactContinuationToneClass: string
  artifactPersistenceStatus: "idle" | "saving" | "saved" | "error"
  artifactPersistenceError: string | null
  artifactRecords: ArtifactRecord[]
  nextStageRequiresApproval: boolean
  nextStageAutoRuns: boolean
  nextStageLabel: string | null
  nextStageDescription: string | null
  nextStageOutput?: string | null
  nextStagePending: boolean
  onRunNextStage?: (() => Promise<void> | void) | null
  visibleArtifactContinuation: ArtifactRecord[]
  hiddenArtifactContinuationCount: number
  visibleNextStageArtifacts: ArtifactRecord[]
  hiddenNextStageArtifactCount: number
  primaryModifierLabel: string
  displayedResultContent: string
  canStartFreshRun: boolean
  onStartNewRun?: () => void
  canRerunSelectedStage: boolean
  onRerunSelectedStage?: (() => void) | null
  onViewActivity?: (() => void) | null
  onInspectFailure?: (() => void) | null
  onEditFlow?: (() => void) | null
  failedNodeErrors: [string, { error?: string }][]
  failureCategoryLabel?: string | null
  failureHint?: string | null
  retryStepLabel?: string | null
  canUseInNewFlow: boolean
  onUseInNewFlow?: (() => Promise<void> | void) | null
  onOpenArtifact?: ((artifact: ArtifactRecord) => Promise<void> | void) | null
  onArtifactContextMenu?:
    | ((
        event: React.MouseEvent<HTMLButtonElement>,
        artifact: ArtifactRecord,
      ) => void)
    | null
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void
}) {
  const verdictData = useVerdictData({
    nodeStates,
    evalResults,
    selectedResultNodeId,
    selectedResultPresentation,
    selectedResultBranchLabel,
    selectedStagePresentation,
    selectedStageIndex,
    workflowStepCount,
    completedStageCount,
    failedStageCount,
    reviewingRunHistory,
    selectedReviewRun,
    executionLoopSummary,
    runStatus,
    runOutcome,
    hasPrimaryContinuation: showArtifactContinuation,
    isDisplayedResultEmpty,
    failedNodeErrors,
  })
  const loopFlowRules = deriveExecutionLoopFlowRules(executionLoopSummary)
  const terminalVariant = verdictData.terminalVariant
  const isDocumentSurface = verdictData.surfaceMode === "document"
  const isDiagnosticSurface = verdictData.variant === "diagnostic"
  const savedArtifactsLabel =
    artifactRecords.length > 0
      ? compactLine([
          visibleArtifactContinuation
            .map((artifact) => artifact.title)
            .join(" · "),
          hiddenArtifactContinuationCount > 0
            ? `+${hiddenArtifactContinuationCount} more`
            : null,
        ])
      : selectedResultPresentation?.artifactLabel || "Result"
  const continuationReferenceLine = compactLine([
    `Saved: ${savedArtifactsLabel}`,
    nextStageRequiresApproval ? "approval before continue" : null,
    nextStageLabel ? `feeds into ${nextStageLabel}` : null,
  ])
  const hasUseInNewFlowAction = Boolean(
    canUseInNewFlow && onUseInNewFlow && !reviewingRunHistory,
  )
  const actionItems: ReactNode[] = []

  if (showArtifactContinuation && nextStageLabel && onRunNextStage) {
    actionItems.push(
      <Button
        key="continue"
        type="button"
        size="sm"
        title={`${primaryModifierLabel}↵`}
        onClick={() => {
          void Promise.resolve(onRunNextStage())
        }}
        disabled={artifactPersistenceStatus === "saving" || nextStagePending}
      >
        <ArrowRight size={12} />
        {nextStagePending ? "Opening..." : `Continue to ${nextStageLabel}`}
      </Button>,
    )

    if (hasUseInNewFlowAction && onUseInNewFlow) {
      actionItems.push(
        <Button
          key="use-in-new-flow"
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto px-0 py-0 text-body-sm text-muted-foreground hover:text-foreground"
          onClick={() => {
            void Promise.resolve(onUseInNewFlow())
          }}
        >
          {verdictData.followUpLabel || "Continue with Agent"}
        </Button>,
      )
    }

    if (canStartFreshRun && onStartNewRun) {
      actionItems.push(
        <button
          key="start-step-over"
          type="button"
          className="ui-meta-text text-muted-foreground hover:text-foreground ui-motion-fast"
          onClick={onStartNewRun}
        >
          Start this step over
        </button>,
      )
    }
  } else if (terminalVariant === "completed" || terminalVariant === "saved") {
    if (hasUseInNewFlowAction && onUseInNewFlow) {
      actionItems.push(
        <Button
          key="use-in-new-flow"
          type="button"
          size="sm"
          onClick={() => {
            void Promise.resolve(onUseInNewFlow())
          }}
        >
          <ArrowRight size={12} />
          {verdictData.followUpLabel || "Continue with Agent"}
        </Button>,
      )
    }

    if (onViewActivity) {
      actionItems.push(
        <Button
          key="view-activity"
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto px-0 py-0 text-body-sm text-muted-foreground hover:text-foreground"
          onClick={onViewActivity}
        >
          View summary
        </Button>,
      )
    }

    if (canStartFreshRun && onStartNewRun) {
      actionItems.push(
        <Button
          key="start-fresh"
          type="button"
          variant={hasUseInNewFlowAction ? "ghost" : "default"}
          size="sm"
          className={
            hasUseInNewFlowAction
              ? "h-auto px-0 py-0 text-body-sm text-muted-foreground hover:text-foreground"
              : undefined
          }
          onClick={onStartNewRun}
        >
          {hasUseInNewFlowAction ? "Start fresh run" : "Run again"}
        </Button>,
      )
    }
  } else if (terminalVariant === "failed") {
    if (canRerunSelectedStage && onRerunSelectedStage) {
      actionItems.push(
        <Button
          key="retry-step"
          type="button"
          size="sm"
          onClick={onRerunSelectedStage}
        >
          <ArrowRight size={12} />
          Retry step
        </Button>,
      )
    } else if (canStartFreshRun && onStartNewRun) {
      actionItems.push(
        <Button
          key="start-fresh"
          type="button"
          size="sm"
          onClick={onStartNewRun}
        >
          <ArrowRight size={12} />
          Start fresh run
        </Button>,
      )
    }

    if (onInspectFailure) {
      actionItems.push(
        <Button
          key="inspect-failure"
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto px-0 py-0 text-body-sm text-muted-foreground hover:text-foreground"
          onClick={onInspectFailure}
        >
          Inspect step log
        </Button>,
      )
    }

    if (onEditFlow) {
      actionItems.push(
        <Button
          key="edit-flow"
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto px-0 py-0 text-body-sm text-muted-foreground hover:text-foreground"
          onClick={onEditFlow}
        >
          Edit flow graph
        </Button>,
      )
    }
  }
  const verdictToneClass =
    verdictData.tone === "danger"
      ? "surface-danger-soft"
      : verdictData.tone === "warning"
        ? "surface-warning-soft"
        : "bg-surface-1"
  const renderedResultContent = stripLeadingMarkdownHeading(
    displayedResultContent,
  )
  const visibleProvenanceLabel = showArtifactContinuation
    ? null
    : verdictData.provenanceLabel
  const evidenceLine = verdictData.evidenceItems.join(" · ")
  const visibleSavedArtifacts = visibleArtifactContinuation.slice(0, 2)
  const hiddenSavedArtifactCount = Math.max(
    0,
    artifactRecords.length - visibleSavedArtifacts.length,
  )
  const documentMetaLine = compactLine([visibleProvenanceLabel, evidenceLine])
  const failureBridge =
    terminalVariant === "failed" && (failureCategoryLabel || failureHint) ? (
      <div className="space-y-1 ui-section-divider">
        {failureCategoryLabel ? (
          <p className="ui-meta-label text-status-danger">
            {failureCategoryLabel}
          </p>
        ) : null}
        {failureHint ? (
          <p className="text-body-sm text-foreground">{failureHint}</p>
        ) : null}
      </div>
    ) : null
  const nextStageHint =
    showArtifactContinuation && nextStageDescription ? (
      <p className="text-body-sm text-muted-foreground">
        {nextStageDescription}
      </p>
    ) : null
  const artifactPersistenceNotice =
    showArtifactContinuation && artifactPersistenceError ? (
      <p className="ui-section-divider text-body-sm text-status-danger">
        {artifactPersistenceError}
      </p>
    ) : null
  const evidencePanel =
    verdictData.evidencePanelKind === "diagnostic" &&
    verdictData.evidencePanelItems.length > 0 ? (
      <section className="space-y-2 ui-section-divider">
        {verdictData.evidencePanelTitle ? (
          <div className="ui-meta-label text-muted-foreground">
            {verdictData.evidencePanelTitle}
          </div>
        ) : null}
        <div className="space-y-2">
          {verdictData.evidencePanelItems.map((item) => {
            const toneClass =
              item.tone === "danger"
                ? "text-status-danger"
                : item.tone === "warning"
                  ? "text-status-warning"
                  : "text-foreground"
            return (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 ui-evidence-item"
              >
                <div className="min-w-0">
                  <div className="text-body-sm font-medium text-foreground">
                    {item.title}
                  </div>
                  <div className="ui-meta-text text-muted-foreground">
                    {item.detail}
                  </div>
                </div>
                {item.valueLabel ? (
                  <div
                    className={cn(
                      "shrink-0 text-body-sm font-medium",
                      toneClass,
                    )}
                  >
                    {item.valueLabel}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>
    ) : null
  const executionLoopPanel = executionLoopSummary ? (
    <DisclosurePanel
      summary={
        <span className="flex items-center gap-2">
          <span>{executionLoopSummary.loopLabel}</span>
          <span className="text-body-sm font-normal text-foreground">
            {executionLoopSummary.title}
          </span>
        </span>
      }
      surface="plain"
      className="ui-section-divider"
      contentClassName="space-y-3"
      defaultOpen={false}
      unmountWhenClosed
    >
      <ExecutionLoopCard
        summary={executionLoopSummary}
        compact
        surface="flat"
        detailSummary="Technical details"
        showTechnicalBadges={false}
      />
      <FlowRulesPreview
        rules={loopFlowRules}
        surface="flat"
        collapsible
        defaultOpen={false}
      />
    </DisclosurePanel>
  ) : null
  const artifactLinkStrip =
    showArtifactContinuation && visibleSavedArtifacts.length > 0 ? (
      <div className="ui-section-divider">
        <div className="ui-meta-label text-muted-foreground">Saved files</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          {visibleSavedArtifacts.map((artifact) => (
            <button
              key={artifact.id}
              type="button"
              className="ui-meta-text text-foreground-subtle hover:text-foreground ui-pressable"
              onClick={() => {
                if (!onOpenArtifact) return
                void Promise.resolve(onOpenArtifact(artifact))
              }}
              onContextMenu={(event) => {
                if (!onArtifactContextMenu) return
                event.preventDefault()
                onArtifactContextMenu(event, artifact)
              }}
            >
              {artifact.title}
            </button>
          ))}
          {hiddenSavedArtifactCount > 0 ? (
            <span className="ui-meta-text text-muted-foreground">
              +{hiddenSavedArtifactCount} more
            </span>
          ) : null}
        </div>
      </div>
    ) : null

  return (
    <div className="space-y-2" onContextMenu={onContextMenu}>
      {savedRunLoadingNotice}
      {savedRunErrorNotice}

      {isDocumentSurface ? (
        <section className="space-y-3">
          <div className="border-b border-hairline px-1 pb-3">
            <div className="min-w-0">
              <h2 className="truncate text-title-sm font-semibold text-foreground">
                {verdictData.headline}
              </h2>
              {documentMetaLine ? (
                <p className="mt-1 ui-meta-text text-muted-foreground">
                  {documentMetaLine}
                </p>
              ) : null}
            </div>
            {actionItems.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {actionItems}
              </div>
            ) : null}
            {nextStageHint}
            {artifactLinkStrip}
          </div>

          <section className="surface-figure overflow-hidden">
            <div className="px-4 py-4">
              {isDisplayedResultEmpty ? (
                <div className="ui-meta-text text-muted-foreground">
                  {reviewingRunHistory
                    ? "No saved result for this run."
                    : selectedResultNodeId
                      ? "This step finished without a primary result."
                      : "No result yet. Results appear here when the flow completes."}
                </div>
              ) : (
                <div className={MARKDOWN_PROSE_CLASS}>
                  <ReactMarkdown
                    {...RESULT_MARKDOWN_PROPS}
                    children={renderedResultContent}
                  />
                </div>
              )}
            </div>
          </section>
        </section>
      ) : (
        <section
          className={cn(
            "surface-figure px-4 py-4",
            verdictToneClass,
            showArtifactContinuation && artifactContinuationToneClass,
          )}
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <h2 className="text-title-lg text-foreground">
                {verdictData.headline}
              </h2>
              {visibleProvenanceLabel && (
                <p className="ui-meta-text text-muted-foreground">
                  {visibleProvenanceLabel}
                </p>
              )}
            </div>

            {verdictData.evidenceItems.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ui-section-divider text-body-sm text-muted-foreground">
                {verdictData.evidenceItems.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            )}

            {actionItems.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                {actionItems}
              </div>
            )}
            {terminalVariant === "failed" ? failureBridge : nextStageHint}
            {executionLoopPanel}

            {evidencePanel}

            {((showArtifactContinuation && continuationReferenceLine) ||
              verdictData.preservedText) && (
              <p className="ui-section-divider text-body-sm text-muted-foreground">
                {showArtifactContinuation
                  ? continuationReferenceLine
                  : verdictData.preservedText}
              </p>
            )}
            {artifactPersistenceNotice}
            {artifactLinkStrip}
          </div>
        </section>
      )}

      {!reviewingRunHistory && hasMultipleResultOptions && (
        <DisclosurePanel
          summary={`Other results (${resultNodeOptions.length})`}
          surface="plain"
          className="space-y-2"
          contentClassName="space-y-2"
        >
          <div className="space-y-1">
            <Select
              value={selectedResultNodeId || undefined}
              onValueChange={onSelectResultNode}
            >
              <SelectTrigger className="h-control-sm w-full text-body-sm sm:w-[360px]">
                <SelectValue placeholder="Select another result" />
              </SelectTrigger>
              <SelectContent>
                {resultNodeOptions.map((option) => (
                  <SelectItem
                    key={`result-node-${option.id}`}
                    value={option.id}
                  >
                    {option.label}
                    {option.hasContent ? "" : " · empty result"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DisclosurePanel>
      )}

      <div className={isDisplayedResultEmpty ? "px-1 py-1" : "px-4 py-4"}>
        {!isDocumentSurface &&
          (isDisplayedResultEmpty ? (
            <div className="ui-meta-text text-muted-foreground">
              {reviewingRunHistory
                ? "No saved result for this run."
                : selectedResultNodeId
                  ? "This step finished without a primary result."
                  : "No result yet. Results appear here when the flow completes."}
            </div>
          ) : (
            <div
              className={cn(
                MARKDOWN_PROSE_CLASS,
                isDiagnosticSurface && "pt-1",
              )}
            >
              <ReactMarkdown
                {...RESULT_MARKDOWN_PROPS}
                children={renderedResultContent}
              />
            </div>
          ))}
      </div>
    </div>
  )
}
