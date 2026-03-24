import type {
  ExecutionAutonomyPreset,
  ExecutionPolicyTag,
  WorkflowExecutionPolicyProfile,
  WorkflowTemplate,
} from "@shared/types"
import type { WorkflowTemplateRunContext } from "./workflow-entry"

function profileHasTag(
  profile: WorkflowExecutionPolicyProfile | null | undefined,
  tag: ExecutionPolicyTag,
) {
  return Boolean(profile?.tags?.includes(tag))
}

export function contextRequiresStartApproval(
  context: WorkflowTemplateRunContext | null | undefined,
  autonomyPreset?: ExecutionAutonomyPreset | null,
) {
  if (autonomyPreset === "conservative") return true
  if (autonomyPreset === "autonomous") return false
  return profileHasTag(context?.executionPolicy, "human_gate_required")
}

export function contextAutoRunsOnContinue(
  context: WorkflowTemplateRunContext | null | undefined,
  autonomyPreset?: ExecutionAutonomyPreset | null,
) {
  return (
    Boolean(context) && !contextRequiresStartApproval(context, autonomyPreset)
  )
}

export function templateRequiresStartApproval(
  template: WorkflowTemplate | null | undefined,
) {
  return profileHasTag(template?.executionPolicy, "human_gate_required")
}

export function templateAutoRunsOnContinue(
  template: WorkflowTemplate | null | undefined,
) {
  return Boolean(template) && !templateRequiresStartApproval(template)
}
