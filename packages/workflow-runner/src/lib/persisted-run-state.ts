import type {
  NodeState,
  RuntimeMetaEntry,
  Workflow,
  WorkflowEdge,
  WorkflowInput,
  WorkflowNode,
} from "../schema.js"
import type { RuntimeWorkflow } from "./runtime-graph.js"

export interface PersistedRunState {
  nodeStates: Record<string, NodeState>
  runtimeNodes?: WorkflowNode[]
  runtimeEdges?: WorkflowEdge[]
  runtimeMeta?: Record<string, RuntimeMetaEntry>
  input?: WorkflowInput
  humanTasks?: Record<string, NodeState["humanTask"]>
}

const RESUMABLE_NODE_STATUSES = new Set([
  "pending",
  "queued",
  "running",
  "waiting_approval",
  "waiting_human",
])

export function findResumeNodeId(savedState: PersistedRunState): string | null {
  const runtimeOrder = (savedState.runtimeNodes || []).map((node) => node.id)
  const knownIds = new Set(runtimeOrder)
  const remainingIds = Object.keys(savedState.nodeStates).filter(
    (id) => !knownIds.has(id),
  )
  const orderedIds = [...runtimeOrder, ...remainingIds]

  for (const nodeId of orderedIds) {
    const status = savedState.nodeStates[nodeId]?.status
    if (status && RESUMABLE_NODE_STATUSES.has(status)) return nodeId
  }
  return null
}

export function buildRuntimeWorkflowFromSavedState(
  workflow: Workflow,
  savedState: PersistedRunState,
): RuntimeWorkflow {
  return {
    ...workflow,
    nodes: savedState.runtimeNodes || [...workflow.nodes],
    edges: savedState.runtimeEdges || [...workflow.edges],
    runtimeMeta: (savedState.runtimeMeta ||
      {}) as RuntimeWorkflow["runtimeMeta"],
  }
}
