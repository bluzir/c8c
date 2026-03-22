import type { WorkflowTemplate } from "@shared/types"
import { SkillPicker } from "@/components/SkillPicker"
import { UseInNewFlowDialog } from "@/components/output/UseInNewFlowDialog"
import { CancelFlowConfirmDialog } from "@/components/workflow-panel/CancelFlowConfirmDialog"
import { WorkflowPanelOverlays } from "@/components/workflow-panel/WorkflowPanelOverlays"
import type { FlowRulePreview } from "@/lib/flow-rules"

interface WorkflowPanelDialogsProps {
  skillPickerStageLabel: string | null
  onAddSkill: (skill: import("@shared/types").DiscoveredSkill) => void
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
  cancelConfirmOpen: boolean
  onCancelConfirmOpenChange: (open: boolean) => void
  runStartedAt: number | null
  onConfirmCancel: () => void
  useInNewFlowOpen: boolean
  onUseInNewFlowOpenChange: (open: boolean) => void
  projectName: string | null
  sourceLabel: string
  suggestedTemplates: WorkflowTemplate[]
  selectedTemplateId: string | null
  onSelectTemplate: (templateId: string | null) => void
  intent: string
  onIntentChange: (value: string) => void
  loading: boolean
  pending: boolean
  onConfirmUseInNewFlow: () => void
}

export function WorkflowPanelDialogs({
  skillPickerStageLabel,
  onAddSkill,
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
  cancelConfirmOpen,
  onCancelConfirmOpenChange,
  runStartedAt,
  onConfirmCancel,
  useInNewFlowOpen,
  onUseInNewFlowOpenChange,
  projectName,
  sourceLabel,
  suggestedTemplates,
  selectedTemplateId,
  onSelectTemplate,
  intent,
  onIntentChange,
  loading,
  pending,
  onConfirmUseInNewFlow,
}: WorkflowPanelDialogsProps) {
  return (
    <>
      <SkillPicker
        onAddSkill={onAddSkill}
        stageLabel={skillPickerStageLabel}
        attachTargetLabel="this flow"
      />

      <WorkflowPanelOverlays
        stageStartGateOpen={stageStartGateOpen}
        stageStartFlowName={stageStartFlowName}
        stageStartTitle={stageStartTitle}
        stageLabel={stageLabel}
        stageStartDescription={stageStartDescription}
        entryFlowRules={entryFlowRules}
        expectedArtifact={expectedArtifact}
        inputPreview={inputPreview}
        inputLabels={inputLabels}
        notes={notes}
        shortcutLabel={shortcutLabel}
        primaryModifierKey={primaryModifierKey}
        onApproveStageStart={onApproveStageStart}
        onCancelStageStart={onCancelStageStart}
      />

      <CancelFlowConfirmDialog
        open={cancelConfirmOpen}
        onOpenChange={onCancelConfirmOpenChange}
        runStartedAt={runStartedAt}
        onConfirmCancel={onConfirmCancel}
      />

      <UseInNewFlowDialog
        open={useInNewFlowOpen}
        onOpenChange={onUseInNewFlowOpenChange}
        projectName={projectName}
        sourceLabel={sourceLabel}
        suggestedTemplates={suggestedTemplates}
        selectedTemplateId={selectedTemplateId}
        onSelectTemplate={onSelectTemplate}
        intent={intent}
        onIntentChange={onIntentChange}
        loading={loading}
        pending={pending}
        onConfirm={onConfirmUseInNewFlow}
      />
    </>
  )
}
