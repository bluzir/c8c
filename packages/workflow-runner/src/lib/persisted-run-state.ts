import type {
  NodeState,
  RuntimeMetaEntry,
  Workflow,
  WorkflowEdge,
  WorkflowEvent,
  WorkflowInput,
  WorkflowNode,
} from "../schema.js"
import type { RuntimeWorkflow } from "./runtime-graph.js"

export interface PersistedEvaluationResult {
  attempt: number
  score: number
  reason: string
  passed: boolean
  fix_instructions?: string
  criteria?: Array<{ id: string; score: number; weight?: number }>
}

export interface PersistedRunState {
  nodeStates: Record<string, NodeState>
  runtimeNodes?: WorkflowNode[]
  runtimeEdges?: WorkflowEdge[]
  runtimeMeta?: Record<string, RuntimeMetaEntry>
  input?: WorkflowInput
  evalResults?: Record<string, PersistedEvaluationResult[]>
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

export function clonePersistedEvalResults(
  evalResults?: PersistedRunState["evalResults"],
): Record<string, PersistedEvaluationResult[]> {
  const cloned: Record<string, PersistedEvaluationResult[]> = {}
  for (const [nodeId, attempts] of Object.entries(evalResults || {})) {
    cloned[nodeId] = Array.isArray(attempts)
      ? attempts.map((attempt) => ({
          ...attempt,
          criteria: attempt.criteria?.map((criterion) => ({ ...criterion })),
        }))
      : []
  }
  return cloned
}

export function appendPersistedEvalResult(
  evalResults: Record<string, PersistedEvaluationResult[]>,
  event: Extract<WorkflowEvent, { type: "eval-result" }>,
): void {
  const attempts = evalResults[event.nodeId] || []
  attempts.push({
    attempt: event.attempt,
    score: event.score,
    reason: event.reason,
    passed: event.passed,
    fix_instructions: event.fix_instructions,
    criteria: event.criteria?.map((criterion) => ({ ...criterion })),
  })
  evalResults[event.nodeId] = attempts
}
