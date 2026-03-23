import type { Workflow } from "@shared/types"

export function workflowHasMeaningfulContent(workflow: Workflow): boolean {
  return (
    workflow.nodes.length > 0 ||
    workflow.name.trim().length > 0 ||
    (workflow.description || "").trim().length > 0
  )
}
