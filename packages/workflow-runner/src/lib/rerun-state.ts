import type { NodeState, WorkflowEdge } from "../schema.js"
import { getDownstreamNodeIds } from "./graph-engine.js"

export interface PrepareRerunStateArgs {
  fromNodeId: string
  nodeStates: Record<string, NodeState>
  edges: WorkflowEdge[]
}

export interface PrepareRerunStateResult {
  nodeStates: Record<string, NodeState>
  activatedEdges: Set<string>
  downstreamIds: Set<string>
}

export function prepareRerunState({
  fromNodeId,
  nodeStates: savedNodeStates,
  edges,
}: PrepareRerunStateArgs): PrepareRerunStateResult {
  const nodeStates: Record<string, NodeState> = {}
  for (const [id, state] of Object.entries(savedNodeStates)) {
    nodeStates[id] = { ...state, log: [] }
  }

  const downstreamIds = new Set(getDownstreamNodeIds({ edges }, fromNodeId))
  for (const id of downstreamIds) {
    if (!nodeStates[id]) continue
    const preservedMeta = id === fromNodeId ? nodeStates[id].meta : undefined
    nodeStates[id] = {
      status: "pending",
      attempts: 0,
      log: [],
      ...(preservedMeta ? { meta: preservedMeta } : {}),
    }
  }

  const activatedEdges = new Set<string>()
  for (const edge of edges) {
    if (!downstreamIds.has(edge.source) && nodeStates[edge.source]?.status === "completed") {
      activatedEdges.add(edge.id)
    }
  }

  return {
    nodeStates,
    activatedEdges,
    downstreamIds,
  }
}
