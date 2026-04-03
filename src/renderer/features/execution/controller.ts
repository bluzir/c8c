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
import type {
  FlowChatMessage,
  ProgressContent,
  ProgressStep,
  StepNarrativeContent,
} from "@/lib/flow-chat-types"
import {
  buildDecisionMessage,
  buildCompleteMessage,
  buildErrorMessage,
  buildStartMessage,
  buildProgressMessage,
  buildStepNarrativeMessage,
} from "@/lib/flow-chat-transformer"
import { buildProgressStepsFromSnapshot } from "@/lib/flow-chat-synthesis"
import {
  seedStepNarratives,
  seedNarrativesFromSnapshot,
  updateNarrativeForNodeStart,
  updateNarrativeForNodeDone,
  updateNarrativeForNodeError,
  markPendingNarrativesSkipped,
  addBranchesToParentNarrative,
  updateNarrativeToolDigest,
  setNarrativeRetryInfo,
  type StepNarrativeMaps,
} from "./controller-narrative-helpers"
import { formatElapsedCompact } from "@/components/output/outputFormatters"
import {
  addToolToDigest,
  extractSearchQuery,
  buildToolAction,
  pushToolAction,
} from "@/lib/tool-digest"
import { toast } from "sonner"
import { getRuntimeStagePresentation } from "@/lib/runtime-flow-labels"

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
  onFlowChatProgressUpdate?: (args: {
    workflowKey: string
    messageId: string
    data: ProgressContent
  }) => void
  onFlowChatStepUpdate?: (args: {
    workflowKey: string
    messageId: string
    data: StepNarrativeContent
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
  static readonly USE_STEP_NARRATIVES = true

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
  /** Tracks the progress chat message ID per workflow key */
  private readonly progressMessageIds = new Map<string, string>()
  /** Tracks the current progress steps per workflow key */
  private readonly progressSteps = new Map<string, ProgressStep[]>()
  /** Tracks when the run started for elapsed calculation */
  private readonly progressStartTimes = new Map<string, number>()
  /** Debounce timers for digest updates — avoids re-render storms during rapid tool calls */
  private readonly pendingDigestFlush = new Map<
    string,
    ReturnType<typeof setTimeout>
  >()
  /** Tracks the last event timestamp per workflow key for timeout detection */
  readonly lastEventTimestamps = new Map<string, number>()
  /** Step-narrative message IDs: workflowKey → (nodeId → messageId) */
  private readonly stepNarrativeIds = new Map<string, Map<string, string>>()
  /** Step-narrative contents: workflowKey → (nodeId → content) */
  private readonly stepNarratives = new Map<
    string,
    Map<string, StepNarrativeContent>
  >()
  /** Debounce timers for step-narrative digest updates */
  private readonly pendingNarrativeDigestFlush = new Map<
    string,
    ReturnType<typeof setTimeout>
  >()
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

  getLastEventTimestamp(workflowKey: string): number | undefined {
    return this.lastEventTimestamps.get(workflowKey)
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
    this.synthesizeProgressFromSnapshot(workflowKey, snapshot)
  }

  /**
   * Rebuild chat progress messages from a rehydrated snapshot so that
   * the chat view shows correct statuses and nested branches even when
   * the renderer was restarted mid-run.
   */
  private synthesizeProgressFromSnapshot(
    workflowKey: string,
    snapshot: ActiveWorkflowRun,
  ) {
    const flowName = snapshot.workflowName || "Flow"

    if (WorkflowExecutionController.USE_STEP_NARRATIVES) {
      // Step-narrative path: emit Start + individual step-narrative messages
      const { description } = buildProgressStepsFromSnapshot({
        nodes: snapshot.runtimeNodes,
        nodeStates: snapshot.nodeStates,
        runtimeMeta: snapshot.runtimeMeta,
      })

      // Emit Start message
      const startMsg = buildStartMessage({ flowName, description })
      this.deps.onFlowChatMessage?.({ workflowKey, message: startMsg })

      // Seed narratives from snapshot state
      const workflowForSeed: Workflow = {
        version: 1,
        name: flowName,
        nodes: snapshot.runtimeNodes,
        edges: snapshot.runtimeEdges,
      }
      const maps = this.getOrCreateNarrativeMaps(workflowKey)
      seedNarrativesFromSnapshot({
        workflow: workflowForSeed,
        flowName,
        nodeStates: snapshot.nodeStates,
        runtimeMeta: snapshot.runtimeMeta,
        maps,
        emitMessage: (msg) => {
          this.deps.onFlowChatMessage?.({ workflowKey, message: msg })
        },
      })
      return
    }

    const { steps, description } = buildProgressStepsFromSnapshot({
      nodes: snapshot.runtimeNodes,
      nodeStates: snapshot.nodeStates,
      runtimeMeta: snapshot.runtimeMeta,
    })

    if (steps.length === 0) return

    // Emit Start message
    const startMsg = buildStartMessage({ flowName, description })
    this.deps.onFlowChatMessage?.({ workflowKey, message: startMsg })

    // Emit Progress message
    const startedAt = snapshot.startedAt ?? Date.now()
    const progressMsg = buildProgressMessage({ flowName, steps, startedAt })
    this.progressMessageIds.set(workflowKey, progressMsg.id)
    this.progressSteps.set(workflowKey, steps)
    this.progressStartTimes.set(workflowKey, startedAt)
    this.deps.onFlowChatMessage?.({ workflowKey, message: progressMsg })
  }

  processWorkflowEvent(event: WorkflowEvent) {
    const workflowKey = this.resolveWorkflowKeyForRun(event.runId)
    if (!workflowKey) {
      this.bufferWorkflowEvent(event)
      return
    }

    this.lastEventTimestamps.set(workflowKey, Date.now())

    const workflowSnapshot = this.workflowSnapshots.get(workflowKey)
    const previousState = this.getExecutionState(workflowKey)
    const transition = reduceWorkflowExecutionEvent(
      previousState,
      event,
      workflowSnapshot,
    )
    this.updateExecutionForKey(workflowKey, transition.nextState)

    // ── Progress tracking ──────────────────────────────────
    this.handleProgressEvent(workflowKey, event, transition.nextState)

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
      // Emit Complete message for successful runs before cleanup
      if (event.type === "run-done") {
        const finishedState = transition.nextState
        const startedAt = finishedState.runStartedAt ?? Date.now()
        const durationMs = Date.now() - startedAt
        const costUsd = Object.values(finishedState.nodeStates).reduce(
          (sum, ns) => sum + (ns.metrics?.cost_usd ?? 0),
          0,
        )

        if (finishedState.runOutcome === "completed") {
          const msg = buildCompleteMessage({
            runId: event.runId,
            flowName: finishedState.workflowName,
            summary: extractFlowSummary(finishedState),
            findings: [],
            limitations: [],
            artifacts: event.reportPath
              ? [
                  {
                    name: "report.md",
                    path: event.reportPath,
                    kind: "report",
                  },
                ]
              : [],
            followUps: [],
            durationMs,
            costUsd,
          })
          this.deps.onFlowChatMessage?.({ workflowKey, message: msg })
          const duration = formatElapsedCompact(startedAt)
          toast.success("Flow completed", {
            description: `Duration: ${duration}`,
          })
        } else if (finishedState.runOutcome) {
          const variant =
            finishedState.runOutcome === "cancelled" ? "cancelled" : "error"
          const failedNode = Object.entries(finishedState.nodeStates).find(
            ([, ns]) => ns.status === "failed",
          )
          const errorDetail = finishedState.lastError || failedNode?.[1]?.error
          const msg = buildErrorMessage({
            runId: event.runId,
            flowName: finishedState.workflowName,
            variant,
            errorMessage: errorDetail,
            failedNodeLabel: failedNode?.[0],
            failedNodeId: failedNode?.[0],
            errorKind: failedNode?.[1]?.errorKind,
          })
          this.deps.onFlowChatMessage?.({ workflowKey, message: msg })
          if (variant === "cancelled") {
            toast("Flow stopped")
          } else {
            toast.error("Flow failed", {
              description: errorDetail
                ? errorDetail.length > 80
                  ? errorDetail.slice(0, 77) + "..."
                  : errorDetail
                : undefined,
            })
          }
        }
      }

      this.deps.onRunFinished?.({ workflowKey, state: transition.nextState })
      this.pendingStarts.delete(workflowKey)
      this.clearRunTracking(event.runId)
      this.previousExecutionSnapshots.delete(workflowKey)
      this.workflowSnapshots.delete(workflowKey)
      this.lastEventTimestamps.delete(workflowKey)
      this.refreshPastRuns()
    }
  }

  private handleProgressEvent(
    workflowKey: string,
    event: WorkflowEvent,
    state: WorkflowExecutionState,
  ) {
    if (WorkflowExecutionController.USE_STEP_NARRATIVES) {
      this.handleStepNarrativeEvent(workflowKey, event, state)
      return
    }

    const flowName = state.workflowName || "Flow"

    const getNodeLabel = (nodeId: string): string => {
      const nodes =
        state.runtimeNodes.length > 0
          ? state.runtimeNodes
          : (state.workflowSnapshot?.nodes ?? [])
      const node = nodes.find((n) => n.id === nodeId)
      if (!node) return nodeId
      const presentation = getRuntimeStagePresentation(node, {
        fallbackId: nodeId,
      })
      return presentation.title
    }

    const formatElapsed = formatElapsedCompact

    // On first node-start for this workflow key, emit Start + initial Progress
    if (
      event.type === "node-start" &&
      !this.progressMessageIds.has(workflowKey)
    ) {
      const allNodes =
        state.runtimeNodes.length > 0
          ? state.runtimeNodes
          : (state.workflowSnapshot?.nodes ?? [])

      const { steps: initialSteps, description } =
        buildProgressStepsFromSnapshot({
          nodes: allNodes,
          nodeStates: state.nodeStates,
          runtimeMeta: state.runtimeMeta,
          activeNodeId: event.nodeId,
        })

      // Emit Start message
      const startMsg = buildStartMessage({ flowName, description })
      this.deps.onFlowChatMessage?.({ workflowKey, message: startMsg })

      // Emit initial Progress message
      const startedAt = state.runStartedAt ?? Date.now()
      const progressMsg = buildProgressMessage({
        flowName,
        steps: initialSteps,
        startedAt,
      })
      this.progressMessageIds.set(workflowKey, progressMsg.id)
      this.progressSteps.set(workflowKey, initialSteps)
      this.progressStartTimes.set(workflowKey, startedAt)
      this.deps.onFlowChatMessage?.({ workflowKey, message: progressMsg })
      return
    }

    // Debug: log all node-log events
    if (event.type === "node-log") {
      console.log(
        "[tool-digest] node-log event:",
        event.nodeId,
        event.entry.type,
        "hasProgress:",
        this.progressMessageIds.has(workflowKey),
      )
    }

    // Accumulate tool digest + actions from node-log events
    if (
      event.type === "node-log" &&
      this.progressMessageIds.has(workflowKey) &&
      event.entry.type === "tool_use"
    ) {
      const steps = this.progressSteps.get(workflowKey) ?? []
      const action = buildToolAction(event.entry.tool, event.entry.input)
      console.log(
        "[tool-digest] node-log tool_use:",
        event.nodeId,
        event.entry.tool,
        action,
        "steps:",
        steps.map((s) => s.nodeId),
        "sub-steps:",
        steps.flatMap((s) => s.subSteps?.map((ss) => ss.key) ?? []),
      )

      // Try top-level step first
      const step = steps.find((s) => s.nodeId === event.nodeId)
      if (step) {
        step.toolDigest = addToolToDigest(step.toolDigest, event.entry.tool)
        step.toolActions = pushToolAction(step.toolActions, action)
        const query = extractSearchQuery(event.entry.tool, event.entry.input)
        if (query) {
          if (!step.searchQueries) step.searchQueries = []
          if (step.searchQueries.length < 5) step.searchQueries.push(query)
        }
        this.progressSteps.set(workflowKey, steps)
        this.scheduleDigestFlush(workflowKey)
        return
      }

      // Try sub-steps (splitter branches)
      for (const parent of steps) {
        const sub = parent.subSteps?.find((s) => s.key === event.nodeId)
        if (sub) {
          sub.toolDigest = addToolToDigest(sub.toolDigest, event.entry.tool)
          sub.toolActions = pushToolAction(sub.toolActions, action)
          const query = extractSearchQuery(event.entry.tool, event.entry.input)
          if (query) {
            if (!sub.searchQueries) sub.searchQueries = []
            if (sub.searchQueries.length < 5) sub.searchQueries.push(query)
          }
          this.progressSteps.set(workflowKey, steps)
          this.scheduleDigestFlush(workflowKey)
          break
        }
      }
      return
    }

    // Update existing progress on node-start
    if (
      event.type === "node-start" &&
      this.progressMessageIds.has(workflowKey)
    ) {
      this.flushDigestNow(workflowKey)
      const steps = this.progressSteps.get(workflowKey) ?? []

      // Check if this node is a subStep of another step
      const isSubStep = steps.some((s) =>
        s.subSteps?.some((sub) => sub.key === event.nodeId),
      )
      let updatedSteps: ProgressStep[]
      if (isSubStep) {
        updatedSteps = steps.map((s) =>
          s.subSteps?.some((sub) => sub.key === event.nodeId)
            ? {
                ...s,
                subSteps: s.subSteps.map((sub) =>
                  sub.key === event.nodeId
                    ? { ...sub, status: "running" as const }
                    : sub,
                ),
              }
            : s,
        )
      } else {
        // If node not in the list yet (could happen from expansion), add it
        const existingStep = steps.find((s) => s.nodeId === event.nodeId)
        if (existingStep) {
          updatedSteps = steps.map((s) =>
            s.nodeId === event.nodeId
              ? { ...s, status: "running" as const }
              : s,
          )
        } else {
          updatedSteps = [
            ...steps,
            {
              nodeId: event.nodeId,
              label: getNodeLabel(event.nodeId),
              status: "running" as const,
            },
          ]
        }
      }

      this.progressSteps.set(workflowKey, updatedSteps)
      this.emitProgressUpdate(workflowKey, updatedSteps)
      return
    }

    // Update progress on node-done
    if (
      event.type === "node-done" &&
      this.progressMessageIds.has(workflowKey)
    ) {
      this.flushDigestNow(workflowKey)
      const steps = this.progressSteps.get(workflowKey) ?? []
      const outputContent =
        typeof event.output?.content === "string"
          ? event.output.content
          : undefined

      // Extract a brief summary from output (first sentence, max 120 chars)
      let summary: string | undefined
      if (outputContent) {
        const firstSentence = outputContent.split(/[.!?\n]/)[0]?.trim()
        if (firstSentence) {
          summary =
            firstSentence.length > 120
              ? firstSentence.slice(0, 117) + "..."
              : firstSentence
        }
      }

      // Extract cost from the execution state's node metrics
      const nodeCostUsd = state.nodeStates[event.nodeId]?.metrics?.cost_usd

      const updatedSteps = steps.map((s) => {
        // Direct match — this node completed
        if (s.nodeId === event.nodeId) {
          return {
            ...s,
            status: "done" as const,
            summary,
            output: outputContent,
            ...(nodeCostUsd != null && nodeCostUsd > 0
              ? { costUsd: nodeCostUsd }
              : {}),
          }
        }
        // Check if the completed node is a subStep of this step
        if (s.subSteps?.some((sub) => sub.key === event.nodeId)) {
          return {
            ...s,
            subSteps: s.subSteps.map((sub) =>
              sub.key === event.nodeId
                ? { ...sub, done: true, status: "done" as const }
                : sub,
            ),
          }
        }
        return s
      })

      this.progressSteps.set(workflowKey, updatedSteps)
      this.emitProgressUpdate(workflowKey, updatedSteps)
      return
    }

    // Update progress on node-error
    if (
      event.type === "node-error" &&
      this.progressMessageIds.has(workflowKey)
    ) {
      const steps = this.progressSteps.get(workflowKey) ?? []
      const isSubStep = steps.some((s) =>
        s.subSteps?.some((sub) => sub.key === event.nodeId),
      )
      const updatedSteps = isSubStep
        ? steps.map((s) =>
            s.subSteps?.some((sub) => sub.key === event.nodeId)
              ? {
                  ...s,
                  subSteps: s.subSteps.map((sub) =>
                    sub.key === event.nodeId
                      ? { ...sub, status: "failed" as const }
                      : sub,
                  ),
                }
              : s,
          )
        : steps.map((s) =>
            s.nodeId === event.nodeId ? { ...s, status: "failed" as const } : s,
          )
      this.progressSteps.set(workflowKey, updatedSteps)
      this.emitProgressUpdate(workflowKey, updatedSteps)
      return
    }

    // Handle fan-out: nodes-expanded adds sub-steps to the parent step
    if (
      event.type === "nodes-expanded" &&
      this.progressMessageIds.has(workflowKey)
    ) {
      const steps = this.progressSteps.get(workflowKey) ?? []

      // Find the parent splitter node — the new node IDs came from it
      // New nodes are added as sub-steps of the last running/pending step, or as new top-level steps
      const newSteps = event.newNodeIds.map((nodeId) => ({
        nodeId,
        label: getNodeLabel(nodeId),
        status: "pending" as const,
      }))

      // Try to find the parent splitter — the runtimeMeta for new nodes contains splitterId
      const runtimeMeta = event.runtimeMeta
      let parentSplitterId: string | undefined
      if (runtimeMeta) {
        for (const newId of event.newNodeIds) {
          const meta = runtimeMeta[newId]
          if (meta?.splitterId) {
            parentSplitterId = meta.splitterId
            break
          }
        }
      }

      let updatedSteps: ProgressStep[]
      if (parentSplitterId) {
        const parentStep = steps.find((s) => s.nodeId === parentSplitterId)
        if (parentStep) {
          updatedSteps = steps.map((s) =>
            s.nodeId === parentSplitterId
              ? {
                  ...s,
                  subSteps: [
                    ...(s.subSteps ?? []),
                    ...event.newNodeIds.map((nodeId) => ({
                      key: nodeId,
                      label: getNodeLabel(nodeId),
                      done: false,
                      status: "pending" as const,
                    })),
                  ],
                }
              : s,
          )
        } else {
          updatedSteps = [...steps, ...newSteps]
        }
      } else {
        // No clear parent — add as top-level steps
        updatedSteps = [...steps, ...newSteps]
      }

      this.progressSteps.set(workflowKey, updatedSteps)
      this.emitProgressUpdate(workflowKey, updatedSteps)
      return
    }

    // Collapse on run-done
    if (event.type === "run-done" && this.progressMessageIds.has(workflowKey)) {
      const steps = this.progressSteps.get(workflowKey) ?? []
      const startTime = this.progressStartTimes.get(workflowKey) ?? Date.now()
      const elapsed = formatElapsed(startTime)
      const doneCount = steps.filter((s) => s.status === "done").length

      const messageId = this.progressMessageIds.get(workflowKey)!
      const collapsedData: ProgressContent = {
        steps,
        elapsed,
        startedAt: startTime,
        collapsed: true,
        collapsedLabel: `All ${doneCount} steps completed \u00b7 ${elapsed}`,
      }

      this.deps.onFlowChatProgressUpdate?.({
        workflowKey,
        messageId,
        data: collapsedData,
      })

      // Clean up tracking
      this.progressMessageIds.delete(workflowKey)
      this.progressSteps.delete(workflowKey)
      this.progressStartTimes.delete(workflowKey)
    }
  }

  private emitProgressUpdate(workflowKey: string, steps: ProgressStep[]) {
    const messageId = this.progressMessageIds.get(workflowKey)
    if (!messageId) return

    const startTime = this.progressStartTimes.get(workflowKey) ?? Date.now()
    const seconds = Math.round((Date.now() - startTime) / 1000)
    const elapsed =
      seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)} min`

    // Also update sub-steps done status based on node-done events
    const data: ProgressContent = { steps, elapsed, startedAt: startTime }
    this.deps.onFlowChatProgressUpdate?.({
      workflowKey,
      messageId,
      data,
    })
  }

  /** Schedule a debounced progress emit for digest-only changes (500ms) */
  private scheduleDigestFlush(workflowKey: string) {
    if (this.pendingDigestFlush.has(workflowKey)) return
    const timer = setTimeout(() => {
      this.pendingDigestFlush.delete(workflowKey)
      const steps = this.progressSteps.get(workflowKey)
      if (steps) this.emitProgressUpdate(workflowKey, steps)
    }, 500)
    this.pendingDigestFlush.set(workflowKey, timer)
  }

  /** Immediately flush any pending digest update (called before node-start/node-done) */
  private flushDigestNow(workflowKey: string) {
    const timer = this.pendingDigestFlush.get(workflowKey)
    if (timer) {
      clearTimeout(timer)
      this.pendingDigestFlush.delete(workflowKey)
    }
  }

  // ── Step-narrative event handler ─────────────────────────

  private getOrCreateNarrativeMaps(workflowKey: string): StepNarrativeMaps {
    let ids = this.stepNarrativeIds.get(workflowKey)
    let narratives = this.stepNarratives.get(workflowKey)
    if (!ids) {
      ids = new Map()
      this.stepNarrativeIds.set(workflowKey, ids)
    }
    if (!narratives) {
      narratives = new Map()
      this.stepNarratives.set(workflowKey, narratives)
    }
    return { ids, narratives }
  }

  private emitNarrativeUpdate(
    workflowKey: string,
    messageId: string,
    data: StepNarrativeContent,
  ) {
    this.deps.onFlowChatStepUpdate?.({ workflowKey, messageId, data })
  }

  private scheduleNarrativeDigestFlush(workflowKey: string, nodeId: string) {
    // Use a composite key so each node gets its own debounce timer
    const flushKey = `${workflowKey}::${nodeId}`
    if (this.pendingNarrativeDigestFlush.has(flushKey)) return
    const timer = setTimeout(() => {
      this.pendingNarrativeDigestFlush.delete(flushKey)
      const maps = this.getOrCreateNarrativeMaps(workflowKey)
      const messageId = maps.ids.get(nodeId)
      const narrative = maps.narratives.get(nodeId)
      if (messageId && narrative) {
        this.emitNarrativeUpdate(workflowKey, messageId, narrative)
      }
    }, 500)
    this.pendingNarrativeDigestFlush.set(flushKey, timer)
  }

  private flushNarrativeDigestNow(workflowKey: string, nodeId: string) {
    const flushKey = `${workflowKey}::${nodeId}`
    const timer = this.pendingNarrativeDigestFlush.get(flushKey)
    if (timer) {
      clearTimeout(timer)
      this.pendingNarrativeDigestFlush.delete(flushKey)
    }
  }

  private handleStepNarrativeEvent(
    workflowKey: string,
    event: WorkflowEvent,
    state: WorkflowExecutionState,
  ) {
    const flowName = state.workflowName || "Flow"
    const maps = this.getOrCreateNarrativeMaps(workflowKey)

    const getNodeLabel = (nodeId: string): string => {
      const nodes =
        state.runtimeNodes.length > 0
          ? state.runtimeNodes
          : (state.workflowSnapshot?.nodes ?? [])
      const node = nodes.find((n) => n.id === nodeId)
      if (!node) return nodeId
      return getRuntimeStagePresentation(node, { fallbackId: nodeId }).title
    }

    // ── First node-start: seed all narratives ──────────────
    if (event.type === "node-start" && maps.narratives.size === 0) {
      const workflowSnapshot = this.workflowSnapshots.get(workflowKey)
      if (!workflowSnapshot) return

      // Build description from buildProgressStepsFromSnapshot for the start message
      const allNodes =
        state.runtimeNodes.length > 0
          ? state.runtimeNodes
          : (workflowSnapshot.nodes ?? [])
      const { description } = buildProgressStepsFromSnapshot({
        nodes: allNodes,
        nodeStates: state.nodeStates,
        runtimeMeta: state.runtimeMeta,
        activeNodeId: event.nodeId,
      })

      // Emit Start message
      const startMsg = buildStartMessage({ flowName, description })
      this.deps.onFlowChatMessage?.({ workflowKey, message: startMsg })

      // Seed step-narrative messages for all trackable nodes
      seedStepNarratives({
        workflow: workflowSnapshot,
        workflowKey,
        flowName,
        activeNodeId: event.nodeId,
        maps,
        emitMessage: (msg) => {
          this.deps.onFlowChatMessage?.({ workflowKey, message: msg })
        },
      })
      return
    }

    // ── Subsequent node-start ──────────────────────────────
    if (event.type === "node-start") {
      this.flushNarrativeDigestNow(workflowKey, event.nodeId)

      // Check if this is a branch node (update parent's branches instead)
      const branchParentUpdate = this.updateBranchStatus(
        workflowKey,
        event.nodeId,
        "running",
        state,
      )
      if (branchParentUpdate) return

      const result = updateNarrativeForNodeStart(maps, event.nodeId)
      if (result) {
        this.emitNarrativeUpdate(workflowKey, result.messageId, result.narrative)
      } else {
        // Dynamically discovered node — create a new narrative
        const narrative: StepNarrativeContent = {
          nodeId: event.nodeId,
          label: getNodeLabel(event.nodeId),
          status: "running",
          nodeType: "skill",
          startedAt: Date.now(),
        }
        const msg = buildStepNarrativeMessage({ flowName, data: narrative })
        maps.ids.set(event.nodeId, msg.id)
        maps.narratives.set(event.nodeId, narrative)
        this.deps.onFlowChatMessage?.({ workflowKey, message: msg })
      }
      return
    }

    // ── node-log (tool_use) → accumulate tool digest ───────
    if (
      event.type === "node-log" &&
      event.entry.type === "tool_use" &&
      maps.narratives.size > 0
    ) {
      const toolEntry = event.entry // Capture narrowed type
      const action = buildToolAction(toolEntry.tool, toolEntry.input)

      // Check if this is a branch node
      const branchDigestUpdated = this.updateBranchToolDigest(
        workflowKey,
        event.nodeId,
        toolEntry.tool,
        action,
        state,
      )
      if (branchDigestUpdated) return

      const updated = updateNarrativeToolDigest(
        maps,
        event.nodeId,
        (narrative) => ({
          ...narrative,
          toolDigest: addToolToDigest(narrative.toolDigest, toolEntry.tool),
          toolActions: pushToolAction(narrative.toolActions, action),
          searchQueries: (() => {
            const query = extractSearchQuery(toolEntry.tool, toolEntry.input)
            if (!query) return narrative.searchQueries
            const queries = narrative.searchQueries
              ? [...narrative.searchQueries]
              : []
            if (queries.length < 5) queries.push(query)
            return queries
          })(),
        }),
      )
      if (updated) {
        this.scheduleNarrativeDigestFlush(workflowKey, event.nodeId)
      }
      return
    }

    // ── node-done ──────────────────────────────────────────
    if (event.type === "node-done" && maps.narratives.size > 0) {
      this.flushNarrativeDigestNow(workflowKey, event.nodeId)

      // Check if this is a branch node
      const branchParentUpdate = this.updateBranchStatus(
        workflowKey,
        event.nodeId,
        "done",
        state,
      )
      if (branchParentUpdate) return

      const outputContent =
        typeof event.output?.content === "string"
          ? event.output.content
          : undefined

      let summary: string | undefined
      if (outputContent) {
        const firstSentence = outputContent.split(/[.!?\n]/)[0]?.trim()
        if (firstSentence) {
          summary =
            firstSentence.length > 120
              ? firstSentence.slice(0, 117) + "..."
              : firstSentence
        }
      }

      const nodeCostUsd = state.nodeStates[event.nodeId]?.metrics?.cost_usd

      const result = updateNarrativeForNodeDone(maps, event.nodeId, {
        summary,
        output: outputContent,
        costUsd: nodeCostUsd,
      })
      if (result) {
        this.emitNarrativeUpdate(workflowKey, result.messageId, result.narrative)
      }
      return
    }

    // ── node-error ─────────────────────────────────────────
    if (event.type === "node-error" && maps.narratives.size > 0) {
      // Check branch node
      const branchParentUpdate = this.updateBranchStatus(
        workflowKey,
        event.nodeId,
        "failed",
        state,
      )
      if (branchParentUpdate) return

      const result = updateNarrativeForNodeError(
        maps,
        event.nodeId,
        event.error,
      )
      if (result) {
        this.emitNarrativeUpdate(workflowKey, result.messageId, result.narrative)
      }
      return
    }

    // ── nodes-expanded → add branches to parent ────────────
    if (event.type === "nodes-expanded" && maps.narratives.size > 0) {
      const result = addBranchesToParentNarrative({
        maps,
        newNodeIds: event.newNodeIds,
        runtimeMeta: event.runtimeMeta,
        getNodeLabel,
      })
      if (result) {
        this.emitNarrativeUpdate(workflowKey, result.messageId, result.narrative)
      }
      return
    }

    // ── eval-result (not passed) → set retry info ──────────
    if (
      event.type === "eval-result" &&
      !event.passed &&
      maps.narratives.size > 0
    ) {
      const evalResult = setNarrativeRetryInfo(maps, event.nodeId, {
        attempt: event.attempt,
        maxAttempts: event.attempt + 1, // Best available info
        kind: "eval",
      })
      if (evalResult) {
        this.emitNarrativeUpdate(
          workflowKey,
          evalResult.messageId,
          evalResult.narrative,
        )
      }

      // Find the retry-from node from evaluator config and reset its narrative
      const evaluatorNode = (state.workflowSnapshot?.nodes ?? []).find(
        (n) => n.id === event.nodeId && n.type === "evaluator",
      ) as import("@shared/types").EvaluatorWorkflowNode | undefined
      const retryFromId = evaluatorNode?.config?.retryFrom
      if (retryFromId) {
        const retryResult = updateNarrativeForNodeStart(maps, retryFromId)
        if (retryResult) {
          this.emitNarrativeUpdate(
            workflowKey,
            retryResult.messageId,
            retryResult.narrative,
          )
        }
      }
      return
    }

    // ── run-done → skip remaining pending, clean up ────────
    if (event.type === "run-done" && maps.narratives.size > 0) {
      // Mark pending steps as skipped if the run ended with error/cancelled
      if (event.status !== "completed") {
        const skipped = markPendingNarrativesSkipped(maps)
        for (const update of skipped) {
          this.emitNarrativeUpdate(
            workflowKey,
            update.messageId,
            update.narrative,
          )
        }
      }

      // Clean up tracking
      this.stepNarrativeIds.delete(workflowKey)
      this.stepNarratives.delete(workflowKey)
      // Clean up debounce timers
      for (const [key, timer] of this.pendingNarrativeDigestFlush) {
        if (key.startsWith(`${workflowKey}::`)) {
          clearTimeout(timer)
          this.pendingNarrativeDigestFlush.delete(key)
        }
      }
    }
  }

  /**
   * Update a branch node's status on its parent narrative.
   * Returns true if the node was found as a branch and the parent was updated.
   */
  private updateBranchStatus(
    workflowKey: string,
    nodeId: string,
    status: "running" | "done" | "failed",
    state: WorkflowExecutionState,
  ): boolean {
    const runtimeMeta = state.runtimeMeta
    const meta = runtimeMeta?.[nodeId]
    if (!meta?.splitterId) return false

    const maps = this.getOrCreateNarrativeMaps(workflowKey)
    const parentId = meta.splitterId
    const messageId = maps.ids.get(parentId)
    const parentNarrative = maps.narratives.get(parentId)
    if (!messageId || !parentNarrative || !parentNarrative.branches) return false

    const updatedBranches = parentNarrative.branches.map((b) =>
      b.nodeId === nodeId ? { ...b, status } : b,
    )
    const updated: StepNarrativeContent = {
      ...parentNarrative,
      branches: updatedBranches,
    }
    maps.narratives.set(parentId, updated)
    this.emitNarrativeUpdate(workflowKey, messageId, updated)
    return true
  }

  /**
   * Update tool digest on a branch node's parent narrative.
   * Returns true if the node was found as a branch and the parent was updated.
   */
  private updateBranchToolDigest(
    workflowKey: string,
    nodeId: string,
    toolName: string,
    action: import("@/lib/flow-chat-types").ToolActionEntry,
    state: WorkflowExecutionState,
  ): boolean {
    const meta = state.runtimeMeta?.[nodeId]
    if (!meta?.splitterId) return false

    const maps = this.getOrCreateNarrativeMaps(workflowKey)
    const parentId = meta.splitterId
    const messageId = maps.ids.get(parentId)
    const parentNarrative = maps.narratives.get(parentId)
    if (!messageId || !parentNarrative || !parentNarrative.branches) return false

    const updatedBranches = parentNarrative.branches.map((b) =>
      b.nodeId === nodeId
        ? {
            ...b,
            toolDigest: addToolToDigest(b.toolDigest, toolName),
            toolActions: pushToolAction(b.toolActions, action),
          }
        : b,
    )
    const updated: StepNarrativeContent = {
      ...parentNarrative,
      branches: updatedBranches,
    }
    maps.narratives.set(parentId, updated)
    this.scheduleNarrativeDigestFlush(workflowKey, parentId)
    return true
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
    this.lastEventTimestamps.delete(workflowKey)
    this.progressMessageIds.delete(workflowKey)
    this.progressSteps.delete(workflowKey)
    this.progressStartTimes.delete(workflowKey)
    const digestTimer = this.pendingDigestFlush.get(workflowKey)
    if (digestTimer) clearTimeout(digestTimer)
    this.pendingDigestFlush.delete(workflowKey)
    // Clean up step-narrative tracking
    this.stepNarrativeIds.delete(workflowKey)
    this.stepNarratives.delete(workflowKey)
    for (const [key, timer] of this.pendingNarrativeDigestFlush) {
      if (key.startsWith(`${workflowKey}::`)) {
        clearTimeout(timer)
        this.pendingNarrativeDigestFlush.delete(key)
      }
    }
    this.updateExecutionForKey(workflowKey, cancelledState)
    this.reconcileApprovalRequests()

    // Emit cancelled error message
    const msg = buildErrorMessage({
      runId: runIdToClear ?? "",
      flowName: cancelledState.workflowName,
      variant: "cancelled",
    })
    this.deps.onFlowChatMessage?.({ workflowKey, message: msg })
    toast("Flow stopped")

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

/**
 * Extract a human-readable summary from the last completed node's output.
 * Prefers the output node, falls back to the last completed skill node.
 */
function extractFlowSummary(state: WorkflowExecutionState): string {
  const nodes = state.workflowSnapshot?.nodes ?? state.runtimeNodes ?? []
  const outputNodeIds = new Set(
    nodes.filter((n) => n.type === "output").map((n) => n.id),
  )

  // Try the output node first
  let lastContent: string | undefined
  for (const nodeId of outputNodeIds) {
    const ns = state.nodeStates[nodeId]
    if (ns?.status === "completed" && ns.output?.content) {
      lastContent = ns.output.content
      break
    }
  }

  // Fall back to last completed node with output (by completedAt)
  if (!lastContent) {
    const completedNodes = Object.values(state.nodeStates)
      .filter(
        (ns): ns is typeof ns & { output: { content: string } } =>
          ns.status === "completed" &&
          typeof ns.output?.content === "string" &&
          ns.output.content.length > 0,
      )
      .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0))

    lastContent = completedNodes[completedNodes.length - 1]?.output?.content
  }

  if (!lastContent) {
    return "Flow completed."
  }

  // Take first 2-3 sentences (up to 300 chars)
  const sentences = lastContent
    .split(/(?<=[.!?])\s+/)
    .slice(0, 3)
    .join(" ")
  if (!sentences) return "Flow completed."
  return sentences.length > 300 ? sentences.slice(0, 297) + "..." : sentences
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
