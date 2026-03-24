import {
  createCancelledExecutionState,
  createEmptyWorkflowExecutionState,
  createExecutionStartState,
  reduceWorkflowExecutionEvent,
  toWorkflowExecutionKey,
  type ApprovalRequest,
  type ExecutionRunStatus,
  type WorkflowExecutionState,
} from "@/lib/workflow-execution"
import type {
  ActiveWorkflowRun,
  ApprovalWorkflowNode,
  RunResult,
  Workflow,
  WorkflowEvent,
  WorkflowNode,
} from "@shared/types"
import type { FlowChatMessage } from "@/lib/flow-chat-types"
import { buildDecisionMessage } from "@/lib/flow-chat-transformer"

type UpdateValue<T> = T | ((prev: T) => T)

interface WorkflowExecutionControllerDeps {
  commitExecutionState: (
    workflowKey: string,
    update:
      | WorkflowExecutionState
      | ((prev: WorkflowExecutionState) => WorkflowExecutionState),
  ) => void
  updateApprovalRequests: (update: UpdateValue<ApprovalRequest[]>) => void
  setPastRuns: (runs: RunResult[]) => void
  listRuns: (projectPath: string) => Promise<RunResult[]>
  onRunFailed: (args: {
    workflowKey: string
    state: WorkflowExecutionState
    message: string
  }) => void
  onRunFinished?: (args: {
    workflowKey: string
    state: WorkflowExecutionState
  }) => void
  onError: (scope: string, error: unknown) => void
  onFlowChatMessage?: (args: {
    workflowKey: string
    message: FlowChatMessage
  }) => void
}

interface SyncExecutionControllerArgs {
  workflowExecutionStates: Record<string, WorkflowExecutionState>
  selectedProject: string | null
}

interface BufferedWorkflowEvents {
  events: WorkflowEvent[]
  lastUpdatedAt: number
}

interface PendingExecutionStart {
  startAttemptId: number
  cancelled: boolean
}

export interface ExecutionStartHandle {
  workflowKey: string
  startAttemptId: number
}

export interface FinishExecutionStartResult {
  accepted: boolean
  shouldCancelRun: boolean
}

const BUFFERED_EVENT_TTL_MS = 60_000
const MAX_BUFFERED_RUNS = 100
const MAX_BUFFERED_EVENTS_PER_RUN = 500

export class WorkflowExecutionController {
  private workflowExecutionStates: Record<string, WorkflowExecutionState> = {}
  private selectedProject: string | null = null
  private approvalRequests: ApprovalRequest[] = []
  private readonly runWorkflowKeys = new Map<string, string>()
  private readonly bufferedEvents = new Map<string, BufferedWorkflowEvents>()
  private readonly previousExecutionSnapshots = new Map<
    string,
    WorkflowExecutionState
  >()
  private readonly workflowSnapshots = new Map<string, Workflow>()
  private readonly pendingStarts = new Map<string, PendingExecutionStart>()
  private nextStartAttemptId = 0
  private listRunsRequestId = 0

  constructor(private readonly deps: WorkflowExecutionControllerDeps) {}

  sync({
    workflowExecutionStates,
    selectedProject,
  }: SyncExecutionControllerArgs) {
    this.workflowExecutionStates = workflowExecutionStates
    this.selectedProject = selectedProject
    this.reconcileApprovalRequests()
  }

  getExecutionState(workflowKey: string): WorkflowExecutionState {
    return (
      this.workflowExecutionStates[workflowKey] ??
      createEmptyWorkflowExecutionState()
    )
  }

  updateExecutionForKey(
    workflowKey: string,
    update:
      | WorkflowExecutionState
      | ((previous: WorkflowExecutionState) => WorkflowExecutionState),
  ) {
    // S-10: Pass updater function through to Jotai so it resolves against the
    // latest atom value, not the potentially-stale local mirror.
    const updater = typeof update === "function" ? update : () => update
    this.deps.commitExecutionState(workflowKey, (prev) => {
      const nextState = updater(prev)
      // Keep local mirror in sync for subsequent synchronous reads within the
      // same event loop turn (before the next sync() from useLayoutEffect).
      this.workflowExecutionStates = {
        ...this.workflowExecutionStates,
        [workflowKey]: nextState,
      }
      return nextState
    })
  }

  refreshPastRuns() {
    if (!this.selectedProject) return

    const requestId = ++this.listRunsRequestId
    this.deps
      .listRuns(this.selectedProject)
      .then((runs) => {
        if (this.listRunsRequestId !== requestId) return
        this.deps.setPastRuns(runs)
      })
      .catch((error) => {
        if (this.listRunsRequestId !== requestId) return
        this.deps.onError("listRuns", error)
      })
  }

  beginExecution(
    targetWorkflow: Workflow,
    workflowPathForRun: string | null,
    projectPathForRun: string | null,
    options?: {
      preserveExecutionSnapshot?: boolean
    },
  ): ExecutionStartHandle | null {
    const workflowKey = toWorkflowExecutionKey(workflowPathForRun)
    const previousState = this.getExecutionState(workflowKey)
    if (
      this.pendingStarts.has(workflowKey) ||
      previousState.runStatus === "starting" ||
      previousState.runStatus === "running" ||
      previousState.runStatus === "cancelling"
    ) {
      return null
    }

    const startAttemptId = ++this.nextStartAttemptId
    this.pendingStarts.set(workflowKey, {
      startAttemptId,
      cancelled: false,
    })
    this.previousExecutionSnapshots.set(workflowKey, previousState)
    this.workflowSnapshots.set(workflowKey, structuredClone(targetWorkflow))
    this.updateExecutionForKey(workflowKey, (previous) =>
      createExecutionStartState(
        previous,
        targetWorkflow,
        workflowPathForRun,
        projectPathForRun,
        Date.now(),
        {
          preserveExecutionSnapshot: options?.preserveExecutionSnapshot,
        },
      ),
    )
    return {
      workflowKey,
      startAttemptId,
    }
  }

  rollbackExecutionStart(startHandle: ExecutionStartHandle): boolean {
    const pendingStart = this.pendingStarts.get(startHandle.workflowKey)
    if (
      !pendingStart ||
      pendingStart.startAttemptId !== startHandle.startAttemptId
    ) {
      return false
    }

    this.pendingStarts.delete(startHandle.workflowKey)
    if (pendingStart.cancelled) {
      return false
    }

    const previousState =
      this.previousExecutionSnapshots.get(startHandle.workflowKey) ??
      createEmptyWorkflowExecutionState()
    this.previousExecutionSnapshots.delete(startHandle.workflowKey)
    this.workflowSnapshots.delete(startHandle.workflowKey)
    this.updateExecutionForKey(startHandle.workflowKey, previousState)
    return true
  }

  finishStartWithRunId(
    startedRunId: string,
    startHandle: ExecutionStartHandle,
  ): FinishExecutionStartResult {
    const pendingStart = this.pendingStarts.get(startHandle.workflowKey)
    if (
      !pendingStart ||
      pendingStart.startAttemptId !== startHandle.startAttemptId
    ) {
      return {
        accepted: false,
        shouldCancelRun: true,
      }
    }

    this.pendingStarts.delete(startHandle.workflowKey)
    if (pendingStart.cancelled) {
      return {
        accepted: false,
        shouldCancelRun: true,
      }
    }

    this.runWorkflowKeys.set(startedRunId, startHandle.workflowKey)
    this.previousExecutionSnapshots.delete(startHandle.workflowKey)
    this.updateExecutionForKey(startHandle.workflowKey, (previous) => ({
      ...previous,
      runId: startedRunId,
    }))

    const bufferedEvents = this.bufferedEvents.get(startedRunId)?.events ?? []
    this.bufferedEvents.delete(startedRunId)
    for (const event of bufferedEvents) {
      this.processWorkflowEvent(event)
    }

    return {
      accepted: true,
      shouldCancelRun: false,
    }
  }

  rollbackCancellation(
    workflowKey: string,
    fallbackRunStatus: ExecutionRunStatus,
    runIdToRestore?: string | null,
  ) {
    this.updateExecutionForKey(workflowKey, (previous) => {
      if (previous.runStatus !== "cancelling") {
        return previous
      }
      if (
        runIdToRestore &&
        previous.runId &&
        previous.runId !== runIdToRestore
      ) {
        return previous
      }
      return {
        ...previous,
        runStatus: fallbackRunStatus,
      }
    })
  }

  rehydrateActiveRun(snapshot: ActiveWorkflowRun) {
    const workflowKey = toWorkflowExecutionKey(snapshot.workflowPath)
    this.pendingStarts.delete(workflowKey)
    this.runWorkflowKeys.set(snapshot.runId, workflowKey)
    this.workflowSnapshots.set(workflowKey, {
      version: 1,
      name: snapshot.workflowName,
      nodes: snapshot.runtimeNodes,
      edges: snapshot.runtimeEdges,
    } as Workflow)
    this.updateExecutionForKey(workflowKey, (previous) => ({
      ...previous,
      runStatus: snapshot.status === "paused" ? "paused" : "running",
      runOutcome: null,
      runStartedAt: snapshot.startedAt,
      lastUpdatedAt: snapshot.updatedAt,
      completedAt: null,
      runId: snapshot.runId,
      runWorkflowPath: snapshot.workflowPath,
      workflowName: snapshot.workflowName,
      projectPath: snapshot.projectPath,
      workflowSnapshot: {
        version: 1,
        name: snapshot.workflowName,
        nodes: snapshot.runtimeNodes,
        edges: snapshot.runtimeEdges,
      } as Workflow,
      nodeStates: snapshot.nodeStates,
      activeNodeId:
        Object.entries(snapshot.nodeStates).find(
          ([, nodeState]) => nodeState.status === "running",
        )?.[0] ?? null,
      workspace: snapshot.workspace,
      runtimeNodes: snapshot.runtimeNodes,
      runtimeEdges: snapshot.runtimeEdges,
      runtimeMeta: snapshot.runtimeMeta,
      lastError: previous.lastError,
    }))
    this.reconcileApprovalRequests()
  }

  processWorkflowEvent(event: WorkflowEvent) {
    const workflowKey = this.resolveWorkflowKeyForRun(event.runId)
    if (!workflowKey) {
      this.bufferWorkflowEvent(event)
      return
    }

    const workflowSnapshot = this.workflowSnapshots.get(workflowKey)
    const previousState = this.getExecutionState(workflowKey)
    const transition = reduceWorkflowExecutionEvent(
      previousState,
      event,
      workflowSnapshot,
    )
    this.updateExecutionForKey(workflowKey, transition.nextState)

    if (transition.effects.approvalRequest) {
      const approvalPayload = transition.effects.approvalRequest
      this.commitApprovalRequests((previous) => {
        const nextRequest: ApprovalRequest = {
          workflowKey,
          ...approvalPayload,
        }
        const existingIndex = previous.findIndex(
          (request) =>
            request.workflowKey === workflowKey &&
            request.nodeId === approvalPayload.nodeId,
        )
        if (existingIndex === -1) {
          return [...previous, nextRequest]
        }
        const next = [...previous]
        next[existingIndex] = nextRequest
        return next
      })

      // Approval → Decision message
      if (event.type === "approval-requested") {
        const msg = buildDecisionMessage({
          type: "approval",
          runId: event.runId,
          nodeId: event.nodeId,
          flowName: transition.nextState.workflowName,
          content: event.content,
          message: event.message,
        })
        this.deps.onFlowChatMessage?.({ workflowKey, message: msg })
      }
    }

    // Eval exhausted → Decision message
    if (event.type === "eval-exhausted") {
      const evalResults = transition.nextState.evalResults[event.nodeId] ?? []
      const lastResult = evalResults[evalResults.length - 1]
      const msg = buildDecisionMessage({
        type: "eval-exhausted",
        runId: event.runId,
        nodeId: event.nodeId,
        flowName: transition.nextState.workflowName,
        score: event.score,
        threshold: event.threshold,
        attempt: event.attempt,
        reason: lastResult?.reason,
        fixInstructions: lastResult?.fix_instructions,
        criteria: lastResult?.criteria,
      })
      this.deps.onFlowChatMessage?.({ workflowKey, message: msg })
    }

    this.reconcileApprovalRequests()

    if (transition.effects.runFailedMessage) {
      this.deps.onRunFailed({
        workflowKey,
        state: transition.nextState,
        message: transition.effects.runFailedMessage,
      })
    }

    if (transition.effects.runFinished) {
      this.deps.onRunFinished?.({ workflowKey, state: transition.nextState })
      this.pendingStarts.delete(workflowKey)
      this.clearRunTracking(event.runId)
      this.previousExecutionSnapshots.delete(workflowKey)
      this.workflowSnapshots.delete(workflowKey)
      this.refreshPastRuns()
    }
  }

  cancelExecution(
    workflowKey: string,
    runIdToClear: string | null | undefined,
  ) {
    const cancelledState = createCancelledExecutionState(
      this.getExecutionState(workflowKey),
    )
    if (!runIdToClear) {
      const pendingStart = this.pendingStarts.get(workflowKey)
      if (pendingStart) {
        this.pendingStarts.set(workflowKey, {
          ...pendingStart,
          cancelled: true,
        })
      }
    }

    this.clearRunTracking(runIdToClear)
    this.pendingStarts.delete(workflowKey)
    this.previousExecutionSnapshots.delete(workflowKey)
    this.workflowSnapshots.delete(workflowKey)
    this.updateExecutionForKey(workflowKey, cancelledState)
    this.reconcileApprovalRequests()
    this.deps.onRunFinished?.({ workflowKey, state: cancelledState })
    if (runIdToClear) {
      this.refreshPastRuns()
    }
  }

  private clearRunTracking(runIdToClear: string | null | undefined) {
    if (!runIdToClear) return
    this.runWorkflowKeys.delete(runIdToClear)
    this.bufferedEvents.delete(runIdToClear)
  }

  private resolveWorkflowKeyForRun(runId: string): string | null {
    const mappedWorkflowKey = this.runWorkflowKeys.get(runId)
    if (
      mappedWorkflowKey &&
      this.workflowExecutionStates[mappedWorkflowKey]?.runId === runId
    ) {
      return mappedWorkflowKey
    }

    const matchingWorkflowEntry = Object.entries(
      this.workflowExecutionStates,
    ).find(([, state]) => state.runId === runId)
    if (!matchingWorkflowEntry) {
      if (mappedWorkflowKey) {
        this.runWorkflowKeys.delete(runId)
      }
      return null
    }

    const [resolvedWorkflowKey] = matchingWorkflowEntry
    if (mappedWorkflowKey && mappedWorkflowKey !== resolvedWorkflowKey) {
      this.moveTrackedWorkflowKey(mappedWorkflowKey, resolvedWorkflowKey)
    }
    this.runWorkflowKeys.set(runId, resolvedWorkflowKey)
    return resolvedWorkflowKey
  }

  private bufferWorkflowEvent(event: WorkflowEvent) {
    this.pruneBufferedEvents()

    const existing = this.bufferedEvents.get(event.runId)
    const events = existing ? [...existing.events] : []
    if (events.length >= MAX_BUFFERED_EVENTS_PER_RUN) {
      events.shift()
    }
    events.push(event)
    this.bufferedEvents.set(event.runId, {
      events,
      lastUpdatedAt: Date.now(),
    })

    while (this.bufferedEvents.size > MAX_BUFFERED_RUNS) {
      const oldestRunId = this.bufferedEvents.keys().next().value
      if (!oldestRunId) break
      this.bufferedEvents.delete(oldestRunId)
    }
  }

  private pruneBufferedEvents(now = Date.now()) {
    for (const [runId, buffered] of this.bufferedEvents.entries()) {
      if (now - buffered.lastUpdatedAt > BUFFERED_EVENT_TTL_MS) {
        this.bufferedEvents.delete(runId)
      }
    }
  }

  private moveTrackedWorkflowKey(fromKey: string, toKey: string) {
    if (fromKey === toKey) return

    const workflowSnapshot = this.workflowSnapshots.get(fromKey)
    if (workflowSnapshot) {
      this.workflowSnapshots.set(toKey, workflowSnapshot)
      this.workflowSnapshots.delete(fromKey)
    }

    const previousSnapshot = this.previousExecutionSnapshots.get(fromKey)
    if (previousSnapshot) {
      this.previousExecutionSnapshots.set(toKey, previousSnapshot)
      this.previousExecutionSnapshots.delete(fromKey)
    }
  }

  private commitApprovalRequests(update: UpdateValue<ApprovalRequest[]>) {
    const next =
      typeof update === "function" ? update(this.approvalRequests) : update
    if (areApprovalRequestsEqual(this.approvalRequests, next)) return
    this.approvalRequests = next
    this.deps.updateApprovalRequests(next)
  }

  private reconcileApprovalRequests() {
    const next = this.buildCanonicalApprovalRequests()
    this.commitApprovalRequests(next)
  }

  private buildCanonicalApprovalRequests(): ApprovalRequest[] {
    const existingByKey = new Map(
      this.approvalRequests.map((request, index) => [
        approvalRequestKey(request.workflowKey, request.nodeId),
        { request, index },
      ]),
    )
    const derived: Array<{
      request: ApprovalRequest
      existingIndex: number
      runStartedAt: number
      nodeOrder: number
      nodeId: string
    }> = []

    for (const [workflowKey, state] of Object.entries(
      this.workflowExecutionStates,
    )) {
      const orderedNodes =
        state.runtimeNodes.length > 0
          ? state.runtimeNodes
          : (state.workflowSnapshot?.nodes ?? [])
      const nodeOrder = new Map(
        orderedNodes.map((node, index) => [node.id, index]),
      )

      for (const [nodeId, nodeState] of Object.entries(state.nodeStates)) {
        if (nodeState.status !== "waiting_approval" || !state.runId) continue

        const existing = existingByKey.get(
          approvalRequestKey(workflowKey, nodeId),
        )
        const request =
          existing?.request ??
          synthesizeApprovalRequest(workflowKey, state, nodeId)
        if (!request) continue

        derived.push({
          request,
          existingIndex: existing?.index ?? Number.MAX_SAFE_INTEGER,
          runStartedAt: state.runStartedAt ?? Number.MAX_SAFE_INTEGER,
          nodeOrder: nodeOrder.get(nodeId) ?? Number.MAX_SAFE_INTEGER,
          nodeId,
        })
      }
    }

    derived.sort((left, right) => {
      if (left.existingIndex !== right.existingIndex) {
        return left.existingIndex - right.existingIndex
      }
      if (left.runStartedAt !== right.runStartedAt) {
        return left.runStartedAt - right.runStartedAt
      }
      if (left.nodeOrder !== right.nodeOrder) {
        return left.nodeOrder - right.nodeOrder
      }
      return left.nodeId.localeCompare(right.nodeId)
    })

    return derived.map((entry) => entry.request)
  }
}

export function createWorkflowExecutionController(
  deps: WorkflowExecutionControllerDeps,
) {
  return new WorkflowExecutionController(deps)
}

function approvalRequestKey(workflowKey: string, nodeId: string) {
  return `${workflowKey}::${nodeId}`
}

function isApprovalNode(
  node: WorkflowNode | null | undefined,
): node is ApprovalWorkflowNode {
  return node?.type === "approval"
}

function synthesizeApprovalRequest(
  workflowKey: string,
  state: WorkflowExecutionState,
  nodeId: string,
): ApprovalRequest | null {
  if (!state.runId) return null
  const workflowNode =
    state.workflowSnapshot?.nodes.find((node) => node.id === nodeId) || null
  const nodeState = state.nodeStates[nodeId]
  const approvalConfig = isApprovalNode(workflowNode)
    ? workflowNode.config
    : null

  return {
    workflowKey,
    runId: state.runId,
    nodeId,
    content:
      typeof nodeState?.output?.content === "string"
        ? nodeState.output.content
        : "",
    message: approvalConfig?.message,
    allowEdit: approvalConfig?.allow_edit ?? false,
  }
}

function areApprovalRequestsEqual(
  left: ApprovalRequest[],
  right: ApprovalRequest[],
): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    const leftRequest = left[index]
    const rightRequest = right[index]
    if (
      leftRequest.workflowKey !== rightRequest.workflowKey ||
      leftRequest.runId !== rightRequest.runId ||
      leftRequest.nodeId !== rightRequest.nodeId ||
      leftRequest.content !== rightRequest.content ||
      leftRequest.message !== rightRequest.message ||
      leftRequest.allowEdit !== rightRequest.allowEdit
    ) {
      return false
    }
  }
  return true
}
