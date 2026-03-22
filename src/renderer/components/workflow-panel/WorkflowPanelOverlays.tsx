import { StageStartApprovalDialog } from "@/components/workflow-panel/WorkflowPanelInlineSections"
import type { FlowRulePreview } from "@/lib/flow-rules"

export function WorkflowPanelOverlays({
  stageStartGateOpen,
  stageStartFlowName,
  stageStartTitle,
  stageLabel,
  stageStartDescription,
  entryFlowRules,
  expectedArtifact,
  inputPreview,
  inputLabels,
  notes,
  shortcutLabel,
  primaryModifierKey,
  onApproveStageStart,
  onCancelStageStart,
}: {
  stageStartGateOpen: boolean
  stageStartFlowName: string | null
  stageStartTitle: string
  stageLabel: string | null
  stageStartDescription: string | null
  entryFlowRules: FlowRulePreview[]
  expectedArtifact: string
  inputPreview: string
  inputLabels: string[]
  notes: string[]
  shortcutLabel: string
  primaryModifierKey: "meta" | "ctrl"
  onApproveStageStart: () => void | Promise<void>
  onCancelStageStart: () => void
}) {
  return (
    <>
      <StageStartApprovalDialog
        open={stageStartGateOpen}
        flowName={stageStartFlowName || "This flow"}
        title={stageStartTitle}
        stageLabel={stageLabel}
        stepDescription={stageStartDescription}
        flowRules={entryFlowRules}
        expectedArtifact={expectedArtifact}
        inputPreview={inputPreview}
        inputLabels={inputLabels}
        notes={notes}
        shortcutLabel={shortcutLabel}
        approveConsequence="Runs this step with the current input."
        rejectConsequence="Keeps the flow in edit mode."
        primaryModifierKey={primaryModifierKey}
        onApprove={onApproveStageStart}
        onCancel={onCancelStageStart}
      />
    </>
  )
}
