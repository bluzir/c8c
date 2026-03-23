import type { NodeState, Workflow, WorkflowInput } from "../schema.js"
import {
  buildRuntimeWorkflowFromSavedState,
  findResumeNodeId,
  type PersistedRunState,
} from "./persisted-run-state.js"
import { prepareRerunState } from "./rerun-state.js"
import type { RuntimeWorkflow } from "./runtime-graph.js"

export interface PreparedResumeExecution {
  fromNodeId: string
  persistedInput: WorkflowInput
  runtimeWorkflow: RuntimeWorkflow
  nodeStates: Record<string, NodeState>
  activatedEdges: Set<string>
}

export function resolveResumeNodeIdOrThrow(
  savedState: PersistedRunState,
): string {
  const fromNodeId = findResumeNodeId(savedState)
  if (!fromNodeId) {
    throw new Error("Cannot continue: no unfinished nodes found in run state")
  }
  return fromNodeId
}

export function prepareResumeExecution({
  workflow,
  savedState,
  fromNodeId,
}: {
  workflow: Workflow
  savedState: PersistedRunState
  fromNodeId: string
}): PreparedResumeExecution {
  const runtimeWorkflow = buildRuntimeWorkflowFromSavedState(
    workflow,
    savedState,
  )
  const { nodeStates, activatedEdges } = prepareRerunState({
    fromNodeId,
    nodeStates: savedState.nodeStates,
    edges: runtimeWorkflow.edges,
  })

  return {
    fromNodeId,
    persistedInput: savedState.input || { type: "text", value: "" },
    runtimeWorkflow,
    nodeStates,
    activatedEdges,
  }
}
