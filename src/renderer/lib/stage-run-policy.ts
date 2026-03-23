import type {
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
) {
  return profileHasTag(context?.executionPolicy, "human_gate_required")
}

export function contextAutoRunsOnContinue(
  context: WorkflowTemplateRunContext | null | undefined,
) {
  return Boolean(context) && !contextRequiresStartApproval(context)
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
