import type { ReactNode } from "react"

import { LogTab } from "@/components/output/OutputSections"
import { SelectedStepSummaryPanel } from "@/components/output/SelectedStepSummaryPanel"
import { Button } from "@/components/ui/button"
import type { RuntimeStagePresentation } from "@/lib/runtime-flow-labels"
import type { EvaluationResult, NodeState, WorkflowNode } from "@shared/types"

export function OutputPanelLogContent({
  showIdleState,
  canInspectActivity,
  tabOptionsLength,
  onBackToActivity,
  savedRunLoadingNotice,
  savedRunErrorNotice,
  savedRunSnapshotNotice,
  reviewingRunHistory,
  canInspectSavedRun,
  selectedStagePresentation,
  selectedStageContextLabelClass,
  selectedStageContextLabel,
  selectedStageBranchLabel,
  selectedStageBranchDetail,
  selectedStageStatusLabel,
  selectedNodeId,
  nodeStates,
  evalResults,
  workflowNode,
  runId,
  evalOverrideNodeIds,
}: {
  showIdleState: boolean
  canInspectActivity: boolean
  tabOptionsLength: number
  onBackToActivity: () => void
  savedRunLoadingNotice: ReactNode
  savedRunErrorNotice: ReactNode
  savedRunSnapshotNotice: ReactNode
  reviewingRunHistory: boolean
  canInspectSavedRun: boolean
  selectedStagePresentation: RuntimeStagePresentation | null
  selectedStageContextLabelClass: string
  selectedStageContextLabel: string
  selectedStageBranchLabel?: string | null
  selectedStageBranchDetail?: string | null
  selectedStageStatusLabel: string
  selectedNodeId: string | null
  nodeStates: Record<string, NodeState>
  evalResults: Record<string, EvaluationResult[]>
  workflowNode?: WorkflowNode | null
  runId?: string | null
  evalOverrideNodeIds?: Set<string>
}) {
  if (showIdleState) {
    return (
      <div className="px-1 py-2 text-body-sm text-muted-foreground">
        No log yet. Run this flow to see detailed execution logs here.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {canInspectActivity && tabOptionsLength <= 1 ? (
        <div className="border-b border-hairline px-1 pb-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-0 py-0 text-body-sm text-muted-foreground hover:text-foreground"
            onClick={onBackToActivity}
          >
            Back to activity
          </Button>
        </div>
      ) : null}
      {savedRunLoadingNotice}
      {savedRunErrorNotice}
      {savedRunSnapshotNotice}
      {(!reviewingRunHistory || canInspectSavedRun) && (
        <>
          <SelectedStepSummaryPanel
            selectedStagePresentation={selectedStagePresentation}
            selectedStageContextLabelClass={selectedStageContextLabelClass}
            selectedStageContextLabel={selectedStageContextLabel}
            selectedStageBranchLabel={selectedStageBranchLabel}
            selectedStageBranchDetail={selectedStageBranchDetail}
            selectedStageStatusLabel={selectedStageStatusLabel}
          />
          <LogTab
            selectedNodeId={selectedNodeId}
            nodeStates={nodeStates}
            evalResults={evalResults}
            workflowNode={workflowNode}
            runId={runId}
            evalOverrideNodeIds={evalOverrideNodeIds}
          />
        </>
      )}
    </div>
  )
}
