import { createEmptyWorkflow } from "@/lib/default-workflow"
import type { Workflow } from "@shared/types"
import { workflowHasMeaningfulContent } from "@/lib/workflow-content"
import { workflowSnapshot } from "@/lib/workflow-snapshot"

interface RestoreSelectedWorkflowIfNeededArgs {
  selectedWorkflowPath: string | null
  currentWorkflow: Workflow
  loadWorkflow: (workflowPath: string) => Promise<Workflow>
}

const EMPTY_DRAFT_WORKFLOW_SNAPSHOT = workflowSnapshot(createEmptyWorkflow())

export function shouldRestoreSelectedWorkflow(
  selectedWorkflowPath: string | null,
  currentWorkflow: Workflow,
): boolean {
  if (!selectedWorkflowPath) return false
  if (!workflowHasMeaningfulContent(currentWorkflow)) return true
  return workflowSnapshot(currentWorkflow) === EMPTY_DRAFT_WORKFLOW_SNAPSHOT
}

export async function restoreSelectedWorkflowIfNeeded({
  selectedWorkflowPath,
  currentWorkflow,
  loadWorkflow,
}: RestoreSelectedWorkflowIfNeededArgs): Promise<Workflow | null> {
  if (!shouldRestoreSelectedWorkflow(selectedWorkflowPath, currentWorkflow))
    return null
  if (!selectedWorkflowPath) return null
  return loadWorkflow(selectedWorkflowPath)
}
