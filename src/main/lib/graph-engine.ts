import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  NodeState,
} from "@shared/types"
import {
  formatWorkflowExecutionIssue,
  validateWorkflowForExecution,
} from "@shared/workflow-execution-validation"

export function findNodeById(
  workflow: Workflow,
  nodeId: string,
): WorkflowNode | undefined {
  return workflow.nodes.find((n) => n.id === nodeId)
}

export function getIncomingEdges(
  workflow: Workflow,
  nodeId: string,
): WorkflowEdge[] {
  return workflow.edges.filter((e) => e.target === nodeId)
}

export function getOutgoingEdges(
  workflow: Workflow,
  nodeId: string,
): WorkflowEdge[] {
  return workflow.edges.filter((e) => e.source === nodeId)
}

export function findReadyNodes(
  workflow: Workflow,
  nodeStates: Record<string, NodeState>,
  activatedEdges?: Set<string>,
): WorkflowNode[] {
  const ready: WorkflowNode[] = []

  for (const node of workflow.nodes) {
    const state = nodeStates[node.id]

    // Only pending nodes can be scheduled.
    // "queued" nodes are already accepted by the scheduler and must not be redispatched.
    if (state && state.status !== "pending") {
      continue
    }

    const incoming = getIncomingEdges(workflow, node.id)

    // Nodes with no incoming edges (e.g. input nodes) are immediately ready
    if (incoming.length === 0) {
      ready.push(node)
      continue
    }

    if (activatedEdges) {
      if (node.type === "merger") {
        // Merger nodes wait for ALL incoming edges to be activated and source nodes resolved.
        const allResolved = incoming.every((edge) => {
          const sourceState = nodeStates[edge.source]
          return (
            activatedEdges.has(edge.id) &&
            sourceState &&
            (sourceState.status === "completed" ||
              sourceState.status === "failed" ||
              sourceState.status === "skipped")
          )
        })
        if (allResolved) {
          ready.push(node)
        }
      } else {
        // Other nodes: ready when at least one incoming edge is activated
        const hasReadyEdge = incoming.some((edge) => {
          const sourceState = nodeStates[edge.source]
          return (
            activatedEdges.has(edge.id) &&
            sourceState &&
            sourceState.status === "completed"
          )
        })
        if (hasReadyEdge) {
          ready.push(node)
        }
      }
    } else {
      // Legacy mode: a node is ready when all its source nodes have completed
      const allSourcesCompleted = incoming.every((edge) => {
        const sourceState = nodeStates[edge.source]
        return sourceState && sourceState.status === "completed"
      })
      if (allSourcesCompleted) {
        ready.push(node)
      }
    }
  }

  return ready
}

/** BFS: find all nodes downstream of the given nodeId (inclusive) */
export function getDownstreamNodeIds(
  workflow: Pick<Workflow, "edges">,
  nodeId: string,
): string[] {
  const visited = new Set<string>()
  const queue = [nodeId]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    for (const edge of workflow.edges) {
      if (edge.source === id) queue.push(edge.target)
    }
  }
  return [...visited]
}

export function validateWorkflow(workflow: Workflow): string[] {
  return validateWorkflowForExecution(workflow)
    .filter((issue) => issue.severity === "error")
    .map((issue) => formatWorkflowExecutionIssue(issue))
}

export function createInitialNodeStates(
  workflow: Workflow,
): Record<string, NodeState> {
  const states: Record<string, NodeState> = {}
  for (const node of workflow.nodes) {
    states[node.id] = {
      status: "pending",
      attempts: 0,
      log: [],
    }
  }
  return states
}

export function isRunComplete(nodeStates: Record<string, NodeState>): boolean {
  return Object.values(nodeStates).every(
    (s) =>
      s.status === "completed" ||
      s.status === "failed" ||
      s.status === "skipped",
  )
}
