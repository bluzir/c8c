import type {
  ArtifactRecord,
  EvaluationResult,
  InputAttachment,
  LoadedRunResult,
  NodeState,
  RunResult,
  RunStatus,
  Workflow,
  WorkflowEdge,
  WorkflowEvent,
  WorkflowNode,
  WorkflowRuntimeMeta,
} from "@shared/types"
import { resolveWorkflowRunDisplayState } from "@/lib/workflow-run-display-state"
import { isRateLimitError } from "@/features/execution/preflight"

export type { EvalCriterion, EvaluationResult } from "@shared/types"

export type ExecutionRunStatus =
  | "idle"
  | "starting"
  | "running"
  | "paused"
  | "cancelling"
  | "done"
  | "error"
export type ArtifactPersistenceStatus = "idle" | "saving" | "saved" | "error"
export type ExecutionSurfaceNoticeLevel =
  | "success"
  | "warning"
  | "error"
  | "info"
export type ExecutionSurfaceNoticeActionTarget = "result" | "activity" | "inbox"

export interface ExecutionSurfaceNotice {
  level: ExecutionSurfaceNoticeLevel
  title: string
  description: string
  actionLabel: string
  actionTarget: ExecutionSurfaceNoticeActionTarget
}

export interface WorkflowExecutionState {
  runStatus: ExecutionRunStatus
  runOutcome: RunStatus | null
  runStartedAt: number | null
  completedAt: number | null
  lastUpdatedAt: number | null
  runId: string | null
  runWorkflowPath: string | null
  workflowName: string
  projectPath: string | null
  lastError: string | null
  workflowSnapshot: Workflow | null
  nodeStates: Record<string, NodeState>
  activeNodeId: string | null
  inspectedNodeId: string | null
  evalResults: Record<string, EvaluationResult[]>
  finalContent: string
  reportPath: string | null
  workspace: string | null
  selectedPastRun: RunResult | null
  runtimeNodes: WorkflowNode[]
  runtimeEdges: WorkflowEdge[]
  runtimeMeta: WorkflowRuntimeMeta
  artifactRecords: ArtifactRecord[]
  artifactPersistenceStatus: ArtifactPersistenceStatus
  artifactPersistenceError: string | null
  surfaceNotice: ExecutionSurfaceNotice | null
  evalOverrideNodeIds: Set<string>
}

export interface ApprovalRequest {
  workflowKey: string
  runId: string
  nodeId: string
  content: string
  message?: string
  allowEdit: boolean
}

export type ApprovalRequestPayload = Omit<ApprovalRequest, "workflowKey">

export interface WorkflowExecutionEventEffects {
  approvalRequest?: ApprovalRequestPayload
  refreshPastRuns?: boolean
  runFinished?: boolean
  runFailedMessage?: string
}

export interface WorkflowExecutionTransition {
  nextState: WorkflowExecutionState
  effects: WorkflowExecutionEventEffects
}

export interface WorkflowInputAttachmentApi {
  readFileContent: (
    path: string,
    projectPath: string,
  ) => Promise<{ content: string; truncated?: boolean }>
  loadRunResult: (workspace: string) => Promise<LoadedRunResult | null>
}

export interface ResetWorkflowExecutionStateOptions {
  clearReportPath?: boolean
  clearSelectedPastRun?: boolean
  preserveCompletedWork?: boolean
}

export interface CreateExecutionStartStateOptions {
  preserveExecutionSnapshot?: boolean
}

export const DRAFT_WORKFLOW_EXECUTION_KEY = "__draft__"

export function createEmptyWorkflowExecutionState(): WorkflowExecutionState {
  return {
    runStatus: "idle",
    runOutcome: null,
    runStartedAt: null,
    completedAt: null,
    lastUpdatedAt: null,
    runId: null,
    runWorkflowPath: null,
    workflowName: "",
    projectPath: null,
    lastError: null,
    workflowSnapshot: null,
    nodeStates: {},
    activeNodeId: null,
    inspectedNodeId: null,
    evalResults: {},
    finalContent: "",
    reportPath: null,
    workspace: null,
    selectedPastRun: null,
    runtimeNodes: [],
    runtimeEdges: [],
    runtimeMeta: {},
    artifactRecords: [],
    artifactPersistenceStatus: "idle",
    artifactPersistenceError: null,
    surfaceNotice: null,
    evalOverrideNodeIds: new Set(),
  }
}

export function toWorkflowExecutionKey(workflowPath: string | null): string {
  return workflowPath?.trim() || DRAFT_WORKFLOW_EXECUTION_KEY
}

export function isRunInFlight(
  status: WorkflowExecutionState["runStatus"],
): boolean {
  return (
    status === "starting" ||
    status === "running" ||
    status === "paused" ||
    status === "cancelling"
  )
}

export function hasWorkflowExecutionInspectableResult(
  state: Pick<
    WorkflowExecutionState,
    "finalContent" | "reportPath" | "nodeStates"
  >,
): boolean {
  if (state.finalContent.trim().length > 0) return true
  if (state.reportPath !== null) return true
  return Object.values(state.nodeStates).some(
    (nodeState) => typeof nodeState.output?.content === "string",
  )
}

export function buildExecutionSurfaceNotice(
  state: WorkflowExecutionState,
): ExecutionSurfaceNotice | null {
  const hasResult = hasWorkflowExecutionInspectableResult(state)
  const runDisplayState = resolveWorkflowRunDisplayState({
    runStatus: state.runStatus,
    runOutcome: state.runOutcome,
    lastError: state.lastError,
  })

  if (runDisplayState.state === "completed") {
    return {
      level: "success",
      title: "Run complete",
      description: hasResult
        ? "Result is ready to review from this flow."
        : "Summary is ready to review from this flow.",
      actionLabel: hasResult ? "View result" : "Open summary",
      actionTarget: hasResult ? "result" : "activity",
    }
  }

  if (runDisplayState.state === "blocked" && runDisplayState.isTerminal) {
    return {
      level: "warning",
      title: "Needs review",
      description:
        "Approval or structured input is required before the flow can continue.",
      actionLabel: "Open inbox",
      actionTarget: "inbox",
    }
  }

  if (runDisplayState.state === "cancelled") {
    return {
      level: "warning",
      title: "Run cancelled",
      description: hasResult
        ? "The flow stopped before it finished, but partial result is still available to review."
        : "The flow stopped before it finished. Inspect summary to review the last completed step.",
      actionLabel: hasResult ? "View partial result" : "Open summary",
      actionTarget: hasResult ? "result" : "activity",
    }
  }

  if (runDisplayState.state === "failed") {
    if (isRateLimitError(state.lastError)) {
      return {
        level: "warning" as const,
        title: "Rate limit reached",
        description:
          "The API is temporarily limiting requests. Wait a few minutes and run again.",
        actionLabel: "Open summary",
        actionTarget: "activity" as const,
      }
    }

    return {
      level: "error",
      title: "Run failed",
      description:
        state.lastError ||
        "The flow did not finish successfully. Inspect summary to review the failure.",
      actionLabel: "Open summary",
      actionTarget: "activity",
    }
  }

  return null
}

function createPendingNodeState(): NodeState {
  return { status: "pending", attempts: 0, log: [] }
}

function getNodeState(
  previousState: WorkflowExecutionState,
  nodeId: string,
): NodeState {
  return previousState.nodeStates[nodeId] ?? createPendingNodeState()
}

export function createExecutionStartState(
  previousState: WorkflowExecutionState,
  workflow: Workflow,
  workflowPath: string | null,
  projectPath: string | null,
  startedAt = Date.now(),
  options: CreateExecutionStartStateOptions = {},
): WorkflowExecutionState {
  const preserveExecutionSnapshot = options.preserveExecutionSnapshot === true
  const nodeStates: Record<string, NodeState> = preserveExecutionSnapshot
    ? structuredClone(previousState.nodeStates)
    : {}

  for (const node of workflow.nodes) {
    if (!nodeStates[node.id]) {
      nodeStates[node.id] = createPendingNodeState()
    }
  }

  return {
    ...previousState,
    runStatus: "starting",
    runOutcome: null,
    runStartedAt: startedAt,
    completedAt: null,
    runId: null,
    runWorkflowPath: workflowPath,
    workflowName: workflow.name?.trim() || "Untitled flow",
    projectPath,
    lastError: null,
    workflowSnapshot: structuredClone(workflow),
    nodeStates,
    activeNodeId: null,
    inspectedNodeId: preserveExecutionSnapshot
      ? previousState.inspectedNodeId
      : null,
    evalResults: preserveExecutionSnapshot ? previousState.evalResults : {},
    finalContent: "",
    reportPath: null,
    runtimeNodes: preserveExecutionSnapshot ? previousState.runtimeNodes : [],
    runtimeEdges: preserveExecutionSnapshot ? previousState.runtimeEdges : [],
    runtimeMeta: preserveExecutionSnapshot ? previousState.runtimeMeta : {},
    artifactRecords: [],
    artifactPersistenceStatus: "idle",
    artifactPersistenceError: null,
    surfaceNotice: null,
    evalOverrideNodeIds: new Set(),
  }
}

export function createCancelledExecutionState(
  previousState: WorkflowExecutionState,
  completedAt = Date.now(),
): WorkflowExecutionState {
  const nodeStates = { ...previousState.nodeStates }
  for (const [nodeId, nodeState] of Object.entries(nodeStates)) {
    if (
      nodeState.status === "running" ||
      nodeState.status === "queued" ||
      nodeState.status === "waiting_approval"
    ) {
      nodeStates[nodeId] = { ...nodeState, status: "skipped" }
    } else if (nodeState.status === "waiting_human") {
      nodeStates[nodeId] = { ...nodeState, status: "skipped" }
    }
  }

  const nextState: WorkflowExecutionState = {
    ...previousState,
    runStatus: "done",
    runOutcome: "cancelled",
    runStartedAt: null,
    completedAt,
    runId: null,
    activeNodeId: null,
    nodeStates,
    surfaceNotice: null,
  }

  return {
    ...nextState,
    surfaceNotice: buildExecutionSurfaceNotice(nextState),
  }
}

export function resetWorkflowExecutionState(
  previousState: WorkflowExecutionState,
  {
    clearReportPath = false,
    clearSelectedPastRun = false,
    preserveCompletedWork = false,
  }: ResetWorkflowExecutionStateOptions = {},
): WorkflowExecutionState {
  return {
    ...previousState,
    runStatus: "idle",
    runStartedAt: null,
    runId: null,
    activeNodeId: null,
    surfaceNotice: null,
    runOutcome: preserveCompletedWork ? previousState.runOutcome : null,
    completedAt: preserveCompletedWork ? previousState.completedAt : null,
    runWorkflowPath: preserveCompletedWork
      ? previousState.runWorkflowPath
      : null,
    lastError: preserveCompletedWork ? previousState.lastError : null,
    nodeStates: preserveCompletedWork ? previousState.nodeStates : {},
    inspectedNodeId: preserveCompletedWork
      ? previousState.inspectedNodeId
      : null,
    evalResults: preserveCompletedWork ? previousState.evalResults : {},
    finalContent: preserveCompletedWork ? previousState.finalContent : "",
    reportPath:
      preserveCompletedWork && !clearReportPath
        ? previousState.reportPath
        : null,
    selectedPastRun: clearSelectedPastRun
      ? null
      : previousState.selectedPastRun,
    runtimeNodes: preserveCompletedWork ? previousState.runtimeNodes : [],
    runtimeEdges: preserveCompletedWork ? previousState.runtimeEdges : [],
    runtimeMeta: preserveCompletedWork ? previousState.runtimeMeta : {},
    artifactRecords: preserveCompletedWork ? previousState.artifactRecords : [],
    artifactPersistenceStatus: preserveCompletedWork
      ? previousState.artifactPersistenceStatus
      : "idle",
    artifactPersistenceError: preserveCompletedWork
      ? previousState.artifactPersistenceError
      : null,
    evalOverrideNodeIds: new Set(),
  }
}

export function reduceWorkflowExecutionEvent(
  previousState: WorkflowExecutionState,
  event: WorkflowEvent,
  workflowSnapshot?: Workflow | null,
  completedAt = Date.now(),
): WorkflowExecutionTransition {
  switch (event.type) {
    case "node-queued":
      return {
        nextState: {
          ...previousState,
          nodeStates: {
            ...previousState.nodeStates,
            [event.nodeId]: {
              ...getNodeState(previousState, event.nodeId),
              status: "queued",
            },
          },
        },
        effects: {},
      }

    case "node-start":
      return {
        nextState: {
          ...previousState,
          runStatus:
            previousState.runStatus === "cancelling" ? "cancelling" : "running",
          activeNodeId: event.nodeId,
          nodeStates: {
            ...previousState.nodeStates,
            [event.nodeId]: {
              ...getNodeState(previousState, event.nodeId),
              status: "running",
            },
          },
        },
        effects: {},
      }

    case "node-log":
      return {
        nextState: {
          ...previousState,
          nodeStates: {
            ...previousState.nodeStates,
            [event.nodeId]: {
              ...getNodeState(previousState, event.nodeId),
              log: [
                ...getNodeState(previousState, event.nodeId).log,
                event.entry,
              ],
            },
          },
        },
        effects: {},
      }

    case "node-done": {
      const isOutputNode =
        workflowSnapshot?.nodes.some(
          (node) => node.id === event.nodeId && node.type === "output",
        ) ?? false
      return {
        nextState: {
          ...previousState,
          finalContent:
            isOutputNode && event.output?.content
              ? event.output.content
              : previousState.finalContent,
          nodeStates: {
            ...previousState.nodeStates,
            [event.nodeId]: {
              ...getNodeState(previousState, event.nodeId),
              status: "completed",
              output: event.output,
            },
          },
        },
        effects: {},
      }
    }

    case "node-error":
      if (event.nodeId === "__global") {
        const nextState: WorkflowExecutionState = {
          ...previousState,
          runStatus: "error",
          activeNodeId: null,
          lastError: event.error || "Workflow execution failed.",
          surfaceNotice: null,
        }
        return {
          nextState: {
            ...nextState,
            surfaceNotice: buildExecutionSurfaceNotice(nextState),
          },
          effects: {
            runFailedMessage: event.error || "Workflow execution failed.",
          },
        }
      }

      return {
        nextState: {
          ...previousState,
          lastError: event.error || previousState.lastError,
          nodeStates: {
            ...previousState.nodeStates,
            [event.nodeId]: {
              ...getNodeState(previousState, event.nodeId),
              status: "failed",
              error: event.error,
            },
          },
        },
        effects: {},
      }

    case "eval-result":
      return {
        nextState: {
          ...previousState,
          evalResults: {
            ...previousState.evalResults,
            [event.nodeId]: [
              ...(previousState.evalResults[event.nodeId] || []),
              {
                attempt: event.attempt,
                score: event.score,
                reason: event.reason,
                passed: event.passed,
                fix_instructions: event.fix_instructions,
                criteria: event.criteria,
              },
            ],
          },
        },
        effects: {},
      }

    case "eval-exhausted": {
      const nextOverrideIds = new Set(previousState.evalOverrideNodeIds)
      nextOverrideIds.add(event.nodeId)
      return {
        nextState: {
          ...previousState,
          evalOverrideNodeIds: nextOverrideIds,
        },
        effects: {},
      }
    }

    case "eval-overridden": {
      const nextOverrideIds = new Set(previousState.evalOverrideNodeIds)
      nextOverrideIds.delete(event.nodeId)
      return {
        nextState: {
          ...previousState,
          evalOverrideNodeIds: nextOverrideIds,
        },
        effects: {},
      }
    }

    case "nodes-expanded": {
      const graphNodeIds = new Set(event.nodes.map((node) => node.id))
      const nodeStates = { ...previousState.nodeStates }

      for (const nodeId of Object.keys(nodeStates)) {
        if (!graphNodeIds.has(nodeId)) {
          delete nodeStates[nodeId]
        }
      }

      for (const nodeId of event.newNodeIds) {
        if (!nodeStates[nodeId]) {
          nodeStates[nodeId] = createPendingNodeState()
        }
      }

      return {
        nextState: {
          ...previousState,
          nodeStates,
          runtimeNodes: event.nodes,
          runtimeEdges: event.edges,
          runtimeMeta: event.runtimeMeta,
        },
        effects: {},
      }
    }

    case "approval-requested":
      return {
        nextState: {
          ...previousState,
          nodeStates: {
            ...previousState.nodeStates,
            [event.nodeId]: {
              ...getNodeState(previousState, event.nodeId),
              status: "waiting_approval",
            },
          },
        },
        effects: {
          approvalRequest: {
            runId: event.runId,
            nodeId: event.nodeId,
            content: event.content,
            message: event.message,
            allowEdit: event.allowEdit,
          },
        },
      }

    case "human-task-created":
      return {
        nextState: {
          ...previousState,
          nodeStates: {
            ...previousState.nodeStates,
            [event.nodeId]: {
              ...getNodeState(previousState, event.nodeId),
              status: "waiting_human",
              humanTask: {
                taskId: event.taskId,
                status: "open",
              },
            },
          },
        },
        effects: {},
      }

    case "human-task-resolved":
      return {
        nextState: {
          ...previousState,
          nodeStates: {
            ...previousState.nodeStates,
            [event.nodeId]: {
              ...getNodeState(previousState, event.nodeId),
              humanTask: {
                taskId: event.taskId,
                status:
                  event.resolution === "submitted"
                    ? "answered"
                    : event.resolution,
              },
            },
          },
        },
        effects: {},
      }

    case "node-warning": {
      const currentNodeState = getNodeState(previousState, event.nodeId)
      return {
        nextState: {
          ...previousState,
          nodeStates: {
            ...previousState.nodeStates,
            [event.nodeId]: {
              ...currentNodeState,
              warnings: [
                ...(currentNodeState.warnings ?? []),
                { kind: event.warningKind, message: event.warning },
              ],
            },
          },
        },
        effects: {},
      }
    }

    case "run-done":
      const nextState: WorkflowExecutionState = {
        ...previousState,
        runStatus:
          event.status === "completed" ||
          event.status === "cancelled" ||
          event.status === "blocked"
            ? "done"
            : "error",
        runOutcome: event.status,
        runStartedAt: null,
        completedAt,
        runId: null,
        runWorkflowPath: previousState.runWorkflowPath,
        activeNodeId: null,
        reportPath: event.reportPath || previousState.reportPath,
        workspace: event.workspace || previousState.workspace,
        surfaceNotice: null,
      }
      return {
        nextState: {
          ...nextState,
          surfaceNotice: buildExecutionSurfaceNotice(nextState),
        },
        effects: {
          refreshPastRuns: true,
          runFinished: true,
        },
      }
  }
}

export async function assembleInputWithAttachments(
  baseValue: string,
  requestedResult: string,
  attachments: InputAttachment[],
  selectedProject: string | null,
  api: WorkflowInputAttachmentApi,
): Promise<string> {
  const normalizedRequestedResult = requestedResult.trim()
  const effectiveAttachments = normalizedRequestedResult
    ? attachments.filter(
        (attachment) =>
          !(
            attachment.kind === "text" &&
            attachment.label.trim().toLowerCase() === "requested result"
          ),
      )
    : attachments
  if (effectiveAttachments.length === 0 && !normalizedRequestedResult)
    return baseValue

  const sections = await Promise.all(
    effectiveAttachments.map(async (attachment) => {
      if (attachment.kind === "file") {
        if (!selectedProject) {
          return `## Attached File: ${attachment.name}\n\n[Cannot read file: no project selected]`
        }
        try {
          const result = await api.readFileContent(
            attachment.path,
            selectedProject,
          )
          return `## Attached File: ${attachment.name}\nPath: ${attachment.path}\n\`\`\`\n${result.content}${result.truncated ? "\n[truncated]" : ""}\n\`\`\``
        } catch {
          return `## Attached File: ${attachment.name}\n\n[Could not read file]`
        }
      }

      if (attachment.kind === "run") {
        try {
          const result = await api.loadRunResult(attachment.workspace)
          return `## Previous Run Output: ${attachment.workflowName}\nRun workspace: ${attachment.workspace}\n\n${result?.reportContent || "[No output available]"}`
        } catch {
          return `## Previous Run Output: ${attachment.workflowName}\n\n[Could not load run output]`
        }
      }

      return `## ${attachment.label}\n\n${attachment.content}`
    }),
  )

  const contextSections = normalizedRequestedResult
    ? [`## Requested Result\n\n${normalizedRequestedResult}`, ...sections]
    : sections

  return [baseValue, "\n---\n# Context\n", ...contextSections].join("\n\n")
}
