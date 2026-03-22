import { findReadyNodes, isRunComplete } from "./graph-engine.js"
import type { RuntimeWorkflow } from "./runtime-graph.js"
import type {
  NodeInput,
  NodeState,
  RunStatus,
  WorkflowEvent,
} from "../schema.js"

export interface NodeLifecycleEffect {
  suspendedForApproval?: boolean
  blockedForHuman?: boolean
  approvalRejected?: boolean
  blockedByTaskId?: string
  blockedByNodeId?: string
}

export interface RunLifecycleState {
  suspendedForApproval: boolean
  blockedForHuman: boolean
  approvalRejected: boolean
  blockedByTaskId?: string
  blockedByNodeId?: string
}

export interface RunExecutionLoopParams {
  runId: string
  controller: AbortController
  nodeStates: Record<string, NodeState>
  getRuntimeWorkflow: () => RuntimeWorkflow
  activatedEdges: Set<string>
  maxParallel: number
  stallTimeoutMs: number
  waitIfPaused: (runId: string, signal: AbortSignal) => Promise<void>
  processNode: (nodeId: string) => Promise<NodeLifecycleEffect | void>
  emitEvent: (event: WorkflowEvent) => Promise<void>
  buildSkippedOutput: (nodeId: string) => NodeInput
  describeStalledNode: (nodeId: string) => string
}

export function createInitialRunLifecycleState(): RunLifecycleState {
  return {
    suspendedForApproval: false,
    blockedForHuman: false,
    approvalRejected: false,
  }
}

export function applyNodeLifecycleEffect(
  state: RunLifecycleState,
  effect: NodeLifecycleEffect | void,
): void {
  if (!effect) return
  if (effect.suspendedForApproval) state.suspendedForApproval = true
  if (effect.blockedForHuman) state.blockedForHuman = true
  if (effect.approvalRejected) state.approvalRejected = true
  if (effect.blockedByTaskId) state.blockedByTaskId = effect.blockedByTaskId
  if (effect.blockedByNodeId) state.blockedByNodeId = effect.blockedByNodeId
}

export async function runExecutionLoop(
  params: RunExecutionLoopParams,
): Promise<RunLifecycleState> {
  const lifecycle = createInitialRunLifecycleState()
  const runningPromises = new Map<string, Promise<void>>()
  let activeSplitterNodeId: string | null = null
  let lastProgressAt = Date.now()

  while (!params.controller.signal.aborted) {
    await params.waitIfPaused(params.runId, params.controller.signal)
    if (params.controller.signal.aborted) break
    if (
      (lifecycle.suspendedForApproval || lifecycle.blockedForHuman) &&
      runningPromises.size === 0
    )
      break

    const runtimeWorkflow = params.getRuntimeWorkflow()
    const readyNodes = findReadyNodes(
      runtimeWorkflow,
      params.nodeStates,
      params.activatedEdges,
    )
    const newReady = readyNodes.filter((node) => !runningPromises.has(node.id))
    if (newReady.length === 0 && runningPromises.size === 0) break

    for (const node of newReady) {
      if (params.controller.signal.aborted) break
      if (runningPromises.size >= params.maxParallel) break

      if (node.type === "splitter") {
        if (activeSplitterNodeId && activeSplitterNodeId !== node.id) continue
        if (runningPromises.size > 0) continue
      } else if (activeSplitterNodeId) {
        continue
      }

      if (params.nodeStates[node.id]?.status === "pending") {
        params.nodeStates[node.id].status = "queued"
        await params.emitEvent({
          type: "node-queued",
          runId: params.runId,
          nodeId: node.id,
        })
      }

      if (node.type === "splitter") activeSplitterNodeId = node.id
      const promise = params
        .processNode(node.id)
        .then((effect) => {
          applyNodeLifecycleEffect(lifecycle, effect)
        })
        .finally(() => {
          runningPromises.delete(node.id)
          if (activeSplitterNodeId === node.id) activeSplitterNodeId = null
        })
      runningPromises.set(node.id, promise)
    }

    if (runningPromises.size > 0) {
      const sizeBefore = runningPromises.size
      await Promise.race(runningPromises.values())
      if (runningPromises.size < sizeBefore) lastProgressAt = Date.now()
      if (Date.now() - lastProgressAt > params.stallTimeoutMs) {
        for (const stalledNodeId of runningPromises.keys()) {
          const stalledState = params.nodeStates[stalledNodeId]
          if (!stalledState) continue
          const stallError = `${params.describeStalledNode(stalledNodeId)} stopped responding after ${Math.round((stalledState.startedAt ? Date.now() - stalledState.startedAt : Date.now() - lastProgressAt) / 60_000)} minutes. Run was stopped.`
          stalledState.status = "failed"
          stalledState.completedAt = Date.now()
          stalledState.error = stallError
          await params.emitEvent({
            type: "node-error",
            runId: params.runId,
            nodeId: stalledNodeId,
            error: stallError,
          })
        }
        params.controller.abort()
      }
    }
  }

  return lifecycle
}

export async function skipUnfinishedNodes(
  runId: string,
  nodeStates: Record<string, NodeState>,
  runtimeWorkflow: RuntimeWorkflow,
  emitEvent: (event: WorkflowEvent) => Promise<void>,
  buildSkippedOutput: (nodeId: string) => NodeInput,
): Promise<void> {
  for (const [nodeId, state] of Object.entries(nodeStates)) {
    if (
      state.status === "pending" ||
      state.status === "queued" ||
      state.status === "running" ||
      state.status === "waiting_approval" ||
      state.status === "waiting_human"
    ) {
      state.status = "skipped"
      await emitEvent({
        type: "node-done",
        runId,
        nodeId,
        output: buildSkippedOutput(nodeId),
      })
    }
  }
}

export function deriveRunStatus(
  nodeStates: Record<string, NodeState>,
  runtimeWorkflow: RuntimeWorkflow,
  lifecycle: RunLifecycleState,
  aborted: boolean,
): RunStatus {
  const criticalNodeFailed = Object.entries(nodeStates).some(
    ([nodeId, state]) => {
      if (state.status !== "failed") return false
      if (runtimeWorkflow.runtimeMeta?.[nodeId]) return false
      return true
    },
  )

  if (lifecycle.blockedForHuman) return "blocked"
  if (lifecycle.suspendedForApproval) return "paused"
  if (lifecycle.approvalRejected) return "cancelled"
  if (aborted) return "cancelled"
  return isRunComplete(nodeStates) && !criticalNodeFailed
    ? "completed"
    : "failed"
}
