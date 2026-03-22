import { createInitialNodeStates } from "./graph-engine.js"
import { prepareResumeExecution, resolveResumeNodeIdOrThrow } from "./run-resume.js"
import { readPersistedRunState } from "./run-state-store.js"
import type { RuntimeWorkflow } from "./runtime-graph.js"
import type {
  NodeState,
  Workflow,
  WorkflowInput,
} from "../schema.js"

export type RunSessionApprovalBehavior = "wait" | "suspend"
export type RunSessionWebSearchBackend = "builtin" | "exa"

export interface WorkflowExecutionSession {
  runId: string
  mode: "run" | "rerun" | "continue"
  workflow: Workflow
  persistedInput: WorkflowInput
  workspace: string
  nodeStates: Record<string, NodeState>
  runtimeWorkflow: RuntimeWorkflow
  activatedEdges: Set<string>
  projectPath?: string
  workflowPath?: string
  webSearchBackend?: RunSessionWebSearchBackend
  approvalBehavior?: RunSessionApprovalBehavior
  chainId: string
}

interface BaseSessionParams {
  runId: string
  workflow: Workflow
  workspace: string
  projectPath?: string
  workflowPath?: string
  webSearchBackend?: RunSessionWebSearchBackend
  approvalBehavior?: RunSessionApprovalBehavior
  chainId?: string
}

interface StartExecutionSessionParams extends BaseSessionParams {
  input: WorkflowInput
}

interface RerunExecutionSessionParams extends BaseSessionParams {
  fromNodeId: string
}

function createFreshRuntimeWorkflow(workflow: Workflow): RuntimeWorkflow {
  return {
    ...workflow,
    nodes: [...workflow.nodes],
    edges: [...workflow.edges],
    runtimeMeta: {},
  }
}

function finalizeSession(
  base: Omit<WorkflowExecutionSession, "chainId"> & { chainId?: string },
): WorkflowExecutionSession {
  return {
    ...base,
    chainId: base.chainId || base.workspace,
  }
}

export function createStartExecutionSession(
  params: StartExecutionSessionParams,
): WorkflowExecutionSession {
  return finalizeSession({
    runId: params.runId,
    mode: "run",
    workflow: params.workflow,
    persistedInput: { ...params.input },
    workspace: params.workspace,
    nodeStates: createInitialNodeStates(params.workflow),
    runtimeWorkflow: createFreshRuntimeWorkflow(params.workflow),
    activatedEdges: new Set<string>(),
    projectPath: params.projectPath,
    workflowPath: params.workflowPath,
    webSearchBackend: params.webSearchBackend,
    approvalBehavior: params.approvalBehavior,
    chainId: params.chainId,
  })
}

export async function createResumeExecutionSession(
  params: BaseSessionParams,
): Promise<WorkflowExecutionSession> {
  const savedState = await readPersistedRunState(params.workspace)
  if (!savedState) {
    throw new Error(`Cannot continue: run state not found in ${params.workspace}`)
  }

  const fromNodeId = resolveResumeNodeIdOrThrow(savedState)
  return createRerunExecutionSession({
    ...params,
    runId: params.runId,
    fromNodeId,
  })
}

export async function createRerunExecutionSession(
  params: RerunExecutionSessionParams,
): Promise<WorkflowExecutionSession> {
  const savedState = await readPersistedRunState(params.workspace)
  if (!savedState) {
    throw new Error(`Cannot rerun: run state not found in ${params.workspace}`)
  }

  const preparedResume = prepareResumeExecution({
    workflow: params.workflow,
    savedState,
    fromNodeId: params.fromNodeId,
  })

  return finalizeSession({
    runId: params.runId,
    mode: "rerun",
    workflow: params.workflow,
    persistedInput: preparedResume.persistedInput,
    workspace: params.workspace,
    nodeStates: preparedResume.nodeStates,
    runtimeWorkflow: preparedResume.runtimeWorkflow,
    activatedEdges: preparedResume.activatedEdges,
    projectPath: params.projectPath,
    workflowPath: params.workflowPath,
    webSearchBackend: params.webSearchBackend,
    approvalBehavior: params.approvalBehavior,
    chainId: params.chainId,
  })
}
