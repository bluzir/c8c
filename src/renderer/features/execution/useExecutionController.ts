import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { useAtomValue, useSetAtom, useStore } from "jotai"
import {
  addFlowChatMessageAtom,
  clearFlowChatMessagesAtom,
  currentRunIndexAtom,
  flowChatMessagesAtom,
  replaceFlowChatMessagesAtom,
  updateFlowProgressAtom,
  updateFlowStepNarrativeAtom,
} from "./flow-chat-state"
import { toast } from "sonner"
import { errorToUserMessage } from "@/lib/error-message"
import { toastError } from "@/lib/toast-error"
import { createWorkflowExecutionController } from "./controller"
import type { WorkflowExecutionController } from "./controller"
import { DEFAULT_EXECUTION_IPC_TIMEOUT_MS, withIpcTimeout } from "./commands"
import { getRuntimeStagePresentation } from "@/lib/runtime-flow-labels"
import { buildTimeoutWarningMessage } from "@/lib/flow-chat-transformer"
import type {
  ApprovalRequest,
  ExecutionRunStatus,
  ExecutionSurfaceNotice,
  WorkflowExecutionState,
} from "@/lib/workflow-execution"
import { isRunInFlight } from "@/lib/workflow-execution"
import type { InFlightManifestEntry } from "@shared/types"
import type { WorkflowNode } from "@shared/types"
import {
  chatRegistryAtom,
  chatRoutingProgressAtom,
  hasCompletedFirstFlowAtom,
  inboxNotificationsAtom,
  selectedChatIdAtom,
  templatesCatalogAtom,
  updateChatInRegistryAtom,
  workflowRequestedResultsAtom,
  workflowTemplateContextsAtom,
  type CreateInboxNotification,
} from "@/lib/store"
import type {
  ActiveExecutionSnapshot,
  Chat,
  ChatRun,
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
    update:
      | WorkflowExecutionState
      | ((prev: WorkflowExecutionState) => WorkflowExecutionState),
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
    label: "Open flow",
  }
}

const IN_FLIGHT_MANIFEST_KEY = "c8c:in-flight-runs"
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
  const templatesCatalog = useAtomValue(templatesCatalogAtom)
  const setHasCompletedFirstFlow = useSetAtom(hasCompletedFirstFlowAtom)
  const addFlowChatMessage = useSetAtom(addFlowChatMessageAtom)
  const clearFlowChatMessages = useSetAtom(clearFlowChatMessagesAtom)
  const replaceFlowChatMessages = useSetAtom(replaceFlowChatMessagesAtom)
  const setChatRoutingProgress = useSetAtom(chatRoutingProgressAtom)
  const updateFlowProgress = useSetAtom(updateFlowProgressAtom)
  const setStepNarrative = useSetAtom(updateFlowStepNarrativeAtom)
  const selectedChatId = useAtomValue(selectedChatIdAtom)
  const chatRegistry = useAtomValue(chatRegistryAtom)
  const workflowRequestedResults = useAtomValue(workflowRequestedResultsAtom)
  const updateChatInRegistry = useSetAtom(updateChatInRegistryAtom)
  const store = useStore()
  const commitExecutionStateRef = useRef(commitExecutionState)
  const updateApprovalRequestsRef = useRef(updateApprovalRequests)
  const setPastRunsRef = useRef(setPastRuns)
  const addNotificationRef = useRef(addNotification)
  const addFlowChatMessageRef = useRef(addFlowChatMessage)
  const clearFlowChatMessagesRef = useRef(clearFlowChatMessages)
  const replaceFlowChatMessagesRef = useRef(replaceFlowChatMessages)
  const setChatRoutingProgressRef = useRef(setChatRoutingProgress)
  const updateFlowProgressRef = useRef(updateFlowProgress)
  const setStepNarrativeRef = useRef(setStepNarrative)
  const workflowTemplateContextsRef = useRef(workflowTemplateContexts)
  const templatesCatalogRef = useRef(templatesCatalog)
  const workflowExecutionStatesRef = useRef(workflowExecutionStates)
  const selectedChatIdRef = useRef(selectedChatId)
  const chatRegistryRef = useRef(chatRegistry)
  const workflowRequestedResultsRef = useRef(workflowRequestedResults)
  const updateChatInRegistryRef = useRef(updateChatInRegistry)
  const selectedProjectRef = useRef(selectedProject)
  const currentRunIndexRef = useRef(0)
  commitExecutionStateRef.current = commitExecutionState
  updateApprovalRequestsRef.current = updateApprovalRequests
  setPastRunsRef.current = setPastRuns
  addNotificationRef.current = addNotification
  addFlowChatMessageRef.current = addFlowChatMessage
  clearFlowChatMessagesRef.current = clearFlowChatMessages
  replaceFlowChatMessagesRef.current = replaceFlowChatMessages
  setChatRoutingProgressRef.current = setChatRoutingProgress
  updateFlowProgressRef.current = updateFlowProgress
  setStepNarrativeRef.current = setStepNarrative
  workflowTemplateContextsRef.current = workflowTemplateContexts
  templatesCatalogRef.current = templatesCatalog
  workflowExecutionStatesRef.current = workflowExecutionStates
  selectedChatIdRef.current = selectedChatId
  chatRegistryRef.current = chatRegistry
  workflowRequestedResultsRef.current = workflowRequestedResults
  updateChatInRegistryRef.current = updateChatInRegistry
  selectedProjectRef.current = selectedProject

  const pendingApprovalNotifications = useMemo(
    () => buildPendingApprovalNotifications(workflowExecutionStates),
    [workflowExecutionStates],
  )

  if (!controllerRef.current) {
    controllerRef.current = createWorkflowExecutionController({
      commitExecutionState: (workflowKey, update) => {
        commitExecutionStateRef.current(workflowKey, update)
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

        // Save chat timeline to workspace
        if (
          state.workspace &&
          typeof window.api.saveRunChatTimeline === "function"
        ) {
          const allMessages = store.get(flowChatMessagesAtom)
          const messages = allMessages[workflowKey] ?? []
          if (messages.length > 0) {
            void window.api
              .saveRunChatTimeline(state.workspace, {
                version: 1,
                messages,
              })
              .catch((err) => {
                console.error(
                  "[useExecutionController] saveRunChatTimeline failed:",
                  err,
                )
              })
          }
        }

        // Save chat-level timeline (accumulates across runs)
        {
          const timelineChatId = selectedChatIdRef.current
          const timelineChatProject = selectedProjectRef.current
          if (timelineChatId && timelineChatProject) {
            const allMessages = store.get(flowChatMessagesAtom)
            const chatMessages = allMessages[workflowKey] ?? []
            if (chatMessages.length > 0) {
              void window.api
                .saveChatTimeline(
                  timelineChatProject,
                  timelineChatId,
                  {
                    version: 2,
                    messages: chatMessages,
                  },
                )
                .catch((err) => {
                  console.error(
                    "[useExecutionController] saveChatTimeline failed:",
                    err,
                  )
                })
            }
          }
        }

        // Append ChatRun to the active chat
        const chatId = selectedChatIdRef.current
        const chatProject = selectedProjectRef.current
        if (chatId && chatProject) {
          const registry = chatRegistryRef.current
          const chat = registry[chatId]
          if (chat) {
            const userPrompt =
              workflowRequestedResultsRef.current[workflowKey] ?? ""
            // Extract summary from completion message
            const flowMsgs =
              store.get(flowChatMessagesAtom)[workflowKey] ?? []
            const completeMsg = [...flowMsgs]
              .reverse()
              .find((m) => m.content.type === "complete")
            const summary =
              completeMsg?.content.type === "complete"
                ? (completeMsg.content.data as { summary?: string }).summary ??
                  ""
                : ""

            const newRun: ChatRun = {
              runId: state.runId ?? "",
              templateId: templateContext?.templateId ?? "",
              templateName: templateContext?.templateName ?? "",
              workflowPath: state.runWorkflowPath ?? "",
              workspace: state.workspace ?? "",
              startedAt: state.runStartedAt ?? Date.now(),
              completedAt: Date.now(),
              status:
                state.runOutcome === "completed"
                  ? "completed"
                  : state.runOutcome === "cancelled"
                    ? "cancelled"
                    : "failed",
              userPrompt,
              summary,
            }
            const updatedChat: Chat = {
              ...chat,
              runs: [...chat.runs, newRun],
              lastActivityAt: Date.now(),
            }
            updateChatInRegistryRef.current(updatedChat)
            void window.api
              .saveChat(chatProject, updatedChat)
              .catch((err: unknown) => {
                console.error(
                  "[useExecutionController] saveChat failed:",
                  err,
                )
              })
          }
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
          "Result saving timed out. Try again, or restart the app if the problem continues.",
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

            // Append new artifact IDs to the chat's artifact pool
            const artifactChatId = selectedChatIdRef.current
            const artifactProject = selectedProjectRef.current
            if (
              artifactChatId &&
              artifactProject &&
              result.artifacts.length > 0
            ) {
              const latestRegistry = chatRegistryRef.current
              const latestChat = latestRegistry[artifactChatId]
              if (latestChat) {
                const newIds = result.artifacts.map((a) => a.id)
                const updatedPool = [...latestChat.artifactPool, ...newIds]
                const chatWithArtifacts: Chat = {
                  ...latestChat,
                  artifactPool: updatedPool,
                }
                updateChatInRegistryRef.current(chatWithArtifacts)
                void window.api
                  .saveChat(artifactProject, chatWithArtifacts)
                  .catch((err: unknown) => {
                    console.error(
                      "[useExecutionController] saveChat (artifact pool) failed:",
                      err,
                    )
                  })
              }
            }
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
      onFlowChatMessage: ({ workflowKey, message }) => {
        let enrichedMessage = message

        // Enrich Complete messages with follow-ups from template metadata
        if (message.content.type === "complete") {
          const templateContext =
            workflowTemplateContextsRef.current[workflowKey]
          const recommendedNext = templateContext?.recommendedNext ?? []

          if (
            recommendedNext.length > 0 &&
            message.content.data.followUps.length === 0
          ) {
            const catalogTemplatesById = new Map(
              templatesCatalogRef.current.map((t) => [t.id, t]),
            )
            const followUps = recommendedNext.map((templateId: string) => {
              const catalogTemplate = catalogTemplatesById.get(templateId)
              const label =
                catalogTemplate?.name ??
                templateId
                  .split("-")
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(" ")
              return {
                label,
                emoji: catalogTemplate?.emoji ?? "\u2192",
                source: "recommended_next" as const,
                templateId,
              }
            })

            enrichedMessage = {
              ...message,
              content: {
                ...message.content,
                data: {
                  ...message.content.data,
                  followUps,
                },
              },
            }
          }
        }

        // On run start, derive runIndex from the chat's existing run count
        if (message.content.type === "start") {
          const chatId = selectedChatIdRef.current
          const chat = chatId
            ? chatRegistryRef.current[chatId]
            : undefined
          const runIndex = chat?.runs.length ?? 0
          currentRunIndexRef.current = runIndex
          store.set(currentRunIndexAtom, runIndex)
        }

        // Tag message with the current run index
        enrichedMessage = {
          ...enrichedMessage,
          runIndex: currentRunIndexRef.current,
        }

        if (message.content.type === "start") {
          // Atomic replace: clear old messages + insert start in one render
          // Also clear routing progress now that execution has started
          setChatRoutingProgressRef.current(null)
          replaceFlowChatMessagesRef.current({
            workflowKey,
            message: enrichedMessage,
          })
        } else {
          addFlowChatMessageRef.current({
            workflowKey,
            message: enrichedMessage,
          })
        }
      },
      onFlowChatProgressUpdate: ({ workflowKey, messageId, data }) => {
        updateFlowProgressRef.current({ workflowKey, messageId, data })
      },
      onFlowChatStepUpdate: ({ workflowKey, messageId, data }) => {
        setStepNarrativeRef.current({ workflowKey, messageId, data })
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

  // Timeout warning: detect stale running workflows with no events for 10 minutes
  useEffect(() => {
    const TIMEOUT_MS = 10 * 60 * 1000
    const CHECK_INTERVAL_MS = 60 * 1000

    const interval = setInterval(() => {
      const currentStates = workflowExecutionStatesRef.current
      for (const [key, state] of Object.entries(currentStates)) {
        if (state.runStatus !== "running") continue
        const lastEvent = controller.getLastEventTimestamp(key)
        if (lastEvent && Date.now() - lastEvent > TIMEOUT_MS) {
          addFlowChatMessageRef.current({
            workflowKey: key,
            message: buildTimeoutWarningMessage({
              workflowKey: key,
              flowName: state.workflowName,
            }),
          })
          // Reset timestamp so we don't spam warnings every 60s
          controller.lastEventTimestamps.set(key, Date.now())
        }
      }
    }, CHECK_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [controller])

  // Section 1: persist in-flight run manifest on close
  useEffect(() => {
    function handleBeforeUnload() {
      const states = workflowExecutionStatesRef.current
      const manifest: Record<string, InFlightManifestEntry> = {}
      for (const [key, state] of Object.entries(states)) {
        if (!isRunInFlight(state.runStatus) || !state.workspace) continue
        manifest[key] = {
          runId: state.runId!,
          workspace: state.workspace,
          workflowPath: state.runWorkflowPath,
          workflowName: state.workflowName,
        }
      }
      if (Object.keys(manifest).length > 0) {
        localStorage.setItem(IN_FLIGHT_MANIFEST_KEY, JSON.stringify(manifest))
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [])

  return controller
}
