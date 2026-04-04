import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  NodeState,
} from "@shared/types"
import { validateWorkflowNodeConfigs } from "@shared/workflow-config-validation"

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
  const errors: string[] = []
  const configIssues = validateWorkflowNodeConfigs(workflow)

  for (const issue of configIssues) {
    if (issue.severity === "error") {
      errors.push(`Node "${issue.nodeId}" ${issue.field}: ${issue.message}`)
    }
  }

  if (!workflow.nodes.some((n) => n.type === "input")) {
    errors.push("Workflow must have at least one input node")
  }

  if (!workflow.nodes.some((n) => n.type === "output")) {
    errors.push("Workflow must have at least one output node")
  }

  const nodeIds = new Set(workflow.nodes.map((n) => n.id))
  for (const edge of workflow.edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push(
        `Edge "${edge.id}" references nonexistent source node "${edge.source}"`,
      )
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(
        `Edge "${edge.id}" references nonexistent target node "${edge.target}"`,
      )
    }
  }

  const seen = new Set<string>()
  for (const node of workflow.nodes) {
    if (seen.has(node.id)) {
      errors.push(`Duplicate node ID "${node.id}"`)
    }
    seen.add(node.id)
  }

  // Cycle detection via topological sort (ignoring fail/outcome edges that form valid fallback paths)
  const nonFailEdges = workflow.edges.filter(
    (e) => e.type !== "fail" && e.type !== "on_timeout" && e.type !== "on_error",
  )
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()
  for (const node of workflow.nodes) {
    inDegree.set(node.id, 0)
    adjacency.set(node.id, [])
  }
  for (const edge of nonFailEdges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
      adjacency.get(edge.source)!.push(edge.target)
    }
  }
  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }
  let visited = 0
  while (queue.length > 0) {
    const id = queue.shift()!
    visited++
    for (const target of adjacency.get(id) || []) {
      const newDeg = (inDegree.get(target) || 1) - 1
      inDegree.set(target, newDeg)
      if (newDeg === 0) queue.push(target)
    }
  }
  if (visited < workflow.nodes.length) {
    errors.push(
      "Workflow contains a cycle — nodes would deadlock during execution",
    )
  }

  return errors
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
