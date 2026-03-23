import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { toast } from "sonner"
import { errorToUserMessage } from "@/lib/error-message"
import { toastError } from "@/lib/toast-error"
import { createWorkflowExecutionController } from "./controller"
import type { WorkflowExecutionController } from "./controller"
import { DEFAULT_EXECUTION_IPC_TIMEOUT_MS, withIpcTimeout } from "./commands"
import { getRuntimeStagePresentation } from "@/lib/runtime-flow-labels"
import type {
  ApprovalRequest,
  ExecutionRunStatus,
  ExecutionSurfaceNotice,
  WorkflowExecutionState,
  WorkflowNode,
} from "@/lib/workflow-execution"
import {
  hasCompletedFirstFlowAtom,
  inboxNotificationsAtom,
  workflowTemplateContextsAtom,
  type CreateInboxNotification,
} from "@/lib/store"
import type {
  ActiveExecutionSnapshot,
  RunResult,
  WorkflowEvent,
} from "@shared/types"
import { useInboxNotifications } from "@/hooks/useInboxNotifications"

type UpdateValue<T> = T | ((prev: T) => T)

interface UseExecutionControllerArgs {
  workflowExecutionStates: Record<string, WorkflowExecutionState>
  selectedProject: string | null
  commitExecutionState: (
    workflowKey: string,
    nextState: WorkflowExecutionState,
  ) => void
  updateApprovalRequests: (update: UpdateValue<ApprovalRequest[]>) => void
  setPastRuns: (runs: RunResult[]) => void
}

function toInboxLevel(
  level: ExecutionSurfaceNotice["level"],
): "info" | "success" | "warning" | "error" {
  if (level === "error") return "error"
  if (level === "warning") return "warning"
  if (level === "success") return "success"
  return "info"
}

function showExecutionToast(notice: ExecutionSurfaceNotice) {
  if (notice.level === "error") {
    toastError(notice.title, { description: notice.description })
    return
  }
  if (notice.level === "success") {
    toast.success(notice.title, { description: notice.description })
    return
  }
  toast(notice.title, { description: notice.description })
}

function getWorkflowNotificationAction(
  state: Pick<
    WorkflowExecutionState,
    "runWorkflowPath" | "runOutcome" | "workspace"
  >,
) {
  if (!state.runWorkflowPath) return undefined
  return {
    kind: "open_workflow" as const,
    workflowPath: state.runWorkflowPath,
    workspace: state.workspace || undefined,
    label: state.runOutcome === "completed" ? "Open flow" : "Inspect flow",
  }
}

const APPROVAL_NOTIFICATION_KEY_PREFIX = "approval-needed:"

function approvalTaskId(nodeId: string): string {
  return `approval-${nodeId.replace(/[^a-zA-Z0-9-]/g, "_")}`
}

function toInboxTaskKey(workspace: string, taskId: string): string {
  return `${workspace}::${taskId}`
}

function isRecoverableApprovalRun(status: ExecutionRunStatus): boolean {
  return (
    status === "starting" ||
    status === "running" ||
    status === "paused" ||
    status === "cancelling"
  )
}

function findWorkflowNode(
  state: WorkflowExecutionState,
  nodeId: string,
): WorkflowNode | null {
  return (
    state.workflowSnapshot?.nodes.find((node) => node.id === nodeId) ||
    state.runtimeNodes.find((node) => node.id === nodeId) ||
    null
  )
}

export function buildPendingApprovalNotifications(
  workflowExecutionStates: Record<string, WorkflowExecutionState>,
): CreateInboxNotification[] {
  const notifications: CreateInboxNotification[] = []

  for (const [workflowKey, state] of Object.entries(workflowExecutionStates)) {
    if (
      !state.workspace ||
      !state.runId ||
      !isRecoverableApprovalRun(state.runStatus)
    ) {
      continue
    }

    const nodes = state.workflowSnapshot?.nodes ?? state.runtimeNodes
    const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]))
    const pendingApprovals = Object.entries(state.nodeStates)
      .filter(
        ([, nodeState]) =>
          nodeState.status === "waiting_approval" &&
          (!nodeState.humanTask || nodeState.humanTask.status === "open"),
      )
      .sort(
        ([leftNodeId], [rightNodeId]) =>
          (nodeOrder.get(leftNodeId) ?? Number.MAX_SAFE_INTEGER) -
          (nodeOrder.get(rightNodeId) ?? Number.MAX_SAFE_INTEGER),
      )

    for (const [nodeId, nodeState] of pendingApprovals) {
      const node = findWorkflowNode(state, nodeId)
      const presentation = node
        ? getRuntimeStagePresentation(node, { fallbackId: nodeId })
        : null
      const taskId = nodeState.humanTask?.taskId || approvalTaskId(nodeId)
      const taskKey = toInboxTaskKey(state.workspace, taskId)
      const workflowName =
        state.workflowName ||
        (workflowKey === "__draft__" ? "Draft flow" : "Flow")
      const stageTitle = presentation?.title || nodeId
      const stageGroup = presentation?.group

      notifications.push({
        title: `${stageTitle} needs approval`,
        description: stageGroup
          ? `${workflowName} is waiting at ${stageGroup}. Open the inbox task to approve or stop this step.`
          : `${workflowName} is waiting for your approval. Open the inbox task to continue or stop the run.`,
        level: "warning",
        source: "workflow",
        persistentKey: `${APPROVAL_NOTIFICATION_KEY_PREFIX}${taskKey}`,
        action: {
          kind: "open_inbox_task",
          taskKey,
          workflowPath: state.runWorkflowPath || undefined,
          label: "Open approval",
        },
      })
    }
  }

  return notifications
}

export function subscribeWorkflowEventBridge(
  subscribe: (callback: (event: WorkflowEvent) => void) => () => void,
  controller: Pick<WorkflowExecutionController, "processWorkflowEvent">,
): () => void {
  return subscribe((event) => {
    controller.processWorkflowEvent(event)
  })
}

export function useExecutionController({
  workflowExecutionStates,
  selectedProject,
  commitExecutionState,
  updateApprovalRequests,
  setPastRuns,
}: UseExecutionControllerArgs): WorkflowExecutionController {
  const controllerRef = useRef<WorkflowExecutionController | null>(null)
  const { addNotification, removeByPersistentKeys } = useInboxNotifications()
  const inboxNotifications = useAtomValue(inboxNotificationsAtom)
  const workflowTemplateContexts = useAtomValue(workflowTemplateContextsAtom)
  const setHasCompletedFirstFlow = useSetAtom(hasCompletedFirstFlowAtom)
  const commitExecutionStateRef = useRef(commitExecutionState)
  const updateApprovalRequestsRef = useRef(updateApprovalRequests)
  const setPastRunsRef = useRef(setPastRuns)
  const addNotificationRef = useRef(addNotification)
  const workflowTemplateContextsRef = useRef(workflowTemplateContexts)
  commitExecutionStateRef.current = commitExecutionState
  updateApprovalRequestsRef.current = updateApprovalRequests
  setPastRunsRef.current = setPastRuns
  addNotificationRef.current = addNotification
  workflowTemplateContextsRef.current = workflowTemplateContexts

  const pendingApprovalNotifications = useMemo(
    () => buildPendingApprovalNotifications(workflowExecutionStates),
    [workflowExecutionStates],
  )

  if (!controllerRef.current) {
    controllerRef.current = createWorkflowExecutionController({
      commitExecutionState: (workflowKey, nextState) => {
        commitExecutionStateRef.current(workflowKey, nextState)
      },
      updateApprovalRequests: (update) => {
        updateApprovalRequestsRef.current(update)
      },
      setPastRuns: (runs) => {
        setPastRunsRef.current(runs)
      },
      listRuns: (projectPath) => window.api.listRuns(projectPath),
      onRunFailed: ({ state, message }) => {
        const notice = state.surfaceNotice
        if (notice) {
          showExecutionToast(notice)
        } else {
          toastError("Run failed", {
            description: message,
          })
        }
        addNotificationRef.current({
          title: notice?.title || "Run failed",
          description: notice?.description || message,
          level: notice ? toInboxLevel(notice.level) : "error",
          source: "workflow",
          action: getWorkflowNotificationAction(state),
        })
      },
      onRunFinished: ({ workflowKey, state }) => {
        const templateContext = workflowTemplateContextsRef.current[workflowKey]
        const notice = state.surfaceNotice
        if (notice) {
          showExecutionToast(notice)
        }
        addNotificationRef.current({
          title: notice?.title || state.workflowName || "Flow",
          description:
            notice?.description ||
            state.lastError ||
            state.workspace ||
            undefined,
          level: notice ? toInboxLevel(notice.level) : "info",
          source: "workflow",
          action: getWorkflowNotificationAction(state),
        })

        if (state.runOutcome === "completed") {
          setHasCompletedFirstFlow(true)
        }

        if (
          state.runOutcome !== "completed" ||
          !state.projectPath ||
          !state.workspace ||
          !templateContext?.contractOut?.length
        ) {
          return
        }

        controllerRef.current?.updateExecutionForKey(
          workflowKey,
          (previous) => ({
            ...previous,
            artifactRecords: [],
            artifactPersistenceStatus: "saving",
            artifactPersistenceError: null,
          }),
        )

        void withIpcTimeout(
          window.api.persistArtifactsFromRun({
            projectPath: state.projectPath,
            workspace: state.workspace,
            factoryId: templateContext.factoryId,
            factoryLabel: templateContext.factoryLabel,
            caseId: templateContext.caseId,
            caseLabel: templateContext.caseLabel,
            sourceArtifactIds: templateContext.sourceArtifactIds,
            templateId: templateContext.templateId,
            templateName: templateContext.templateName,
            workflowPath: templateContext.workflowPath,
            workflowName: state.workflowName,
            contracts: templateContext.contractOut,
          }),
          DEFAULT_EXECUTION_IPC_TIMEOUT_MS,
          "Result saving timed out. Check the main flow and try again.",
        )
          .then((result) => {
            controllerRef.current?.updateExecutionForKey(
              workflowKey,
              (previous) => ({
                ...previous,
                artifactRecords: result.artifacts,
                artifactPersistenceStatus: "saved",
                artifactPersistenceError: null,
              }),
            )
          })
          .catch((error) => {
            const message = errorToUserMessage(error)
            controllerRef.current?.updateExecutionForKey(
              workflowKey,
              (previous) => ({
                ...previous,
                artifactPersistenceStatus: "error",
                artifactPersistenceError: message,
              }),
            )
            addNotificationRef.current({
              title: `Result saving failed: ${state.workflowName || "Flow"}`,
              description: message,
              level: "error",
              source: "workflow",
            })
          })
      },
      onError: (scope, error) => {
        console.error(`[useChainExecution] ${scope} failed:`, error)
      },
    })
  }

  const controller = controllerRef.current

  useLayoutEffect(() => {
    controller.sync({ workflowExecutionStates, selectedProject })
  }, [controller, selectedProject, workflowExecutionStates])

  useEffect(() => {
    return subscribeWorkflowEventBridge(window.api.onWorkflowEvent, controller)
  }, [controller])

  useEffect(() => {
    controller.refreshPastRuns()
  }, [controller, selectedProject])

  useEffect(() => {
    for (const notification of pendingApprovalNotifications) {
      addNotification(notification)
    }

    const activeKeys = new Set(
      pendingApprovalNotifications
        .map((notification) => notification.persistentKey)
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        ),
    )
    const staleKeys = inboxNotifications
      .map((notification) => notification.persistentKey)
      .filter(
        (value): value is string =>
          typeof value === "string" &&
          value.startsWith(APPROVAL_NOTIFICATION_KEY_PREFIX) &&
          !activeKeys.has(value),
      )

    if (staleKeys.length > 0) {
      removeByPersistentKeys(staleKeys)
    }
  }, [
    addNotification,
    inboxNotifications,
    pendingApprovalNotifications,
    removeByPersistentKeys,
  ])

  useEffect(() => {
    let cancelled = false
    window.api
      .getActiveExecutions()
      .then((executions: ActiveExecutionSnapshot[]) => {
        if (cancelled) return
        for (const execution of executions) {
          if (execution.kind !== "run") continue
          controller.rehydrateActiveRun(execution)
        }
      })
      .catch((error) => {
        if (!cancelled)
          console.error(
            "[useExecutionController] getActiveExecutions failed:",
            error,
          )
      })
    return () => {
      cancelled = true
    }
  }, [controller])

  return controller
}
