import type { Workflow, WorkflowEdge, WorkflowNode } from "@shared/types"

export interface InsertionPoint {
  outputNode: Extract<WorkflowNode, { type: "output" }>
  prevNodeId: string
  filteredEdges: WorkflowEdge[]
}

export function findInsertionPoint(workflow: Workflow): InsertionPoint | null {
  const outputNode = workflow.nodes.find(
    (node): node is Extract<WorkflowNode, { type: "output" }> =>
      node.type === "output",
  )
  if (!outputNode) return null

  const edgeToOutput = workflow.edges.find(
    (edge) => edge.target === outputNode.id,
  )
  const prevNodeId = edgeToOutput?.source ?? "input-1"
  const filteredEdges = workflow.edges.filter(
    (edge) => edge.id !== edgeToOutput?.id,
  )

  return { outputNode, prevNodeId, filteredEdges }
}

export function cloneWorkflow<T>(value: T): T {
  return structuredClone(value)
}
