import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { errorToUserMessage } from "@/lib/error-message"
import { useAtom, useAtomValue } from "jotai"
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
} from "lucide-react"
import { PageHeader, PageShell } from "@/components/ui/page-shell"
import { buildProjectCaseIndex } from "@/lib/case-summary"
import {
  currentWorkflowAtom,
  desktopRuntimeAtom,
  factoryBetaEnabledAtom,
  inboxNotificationsAtom,
  mainViewAtom,
  selectedFactoryIdAtom,
  selectedProjectAtom,
  selectedFactoryCaseIdAtom,
  selectedInboxTaskKeyAtom,
  selectedWorkflowPathAtom,
  type InboxNotification,
  workflowTemplateContextsAtom,
  workflowSavedSnapshotAtom,
} from "@/lib/store"
import { useInboxNotifications } from "@/hooks/useInboxNotifications"
import { useChainExecution } from "@/hooks/useChainExecution"
import { getRuntimeStagePresentation } from "@/lib/runtime-flow-labels"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { pastRunsAtom, selectedPastRunAtom } from "@/features/execution"
import { consumeShortcut, isShortcutConsumed, matchesPrimaryShortcut } from "@/lib/keyboard-shortcuts"
import type { ArtifactRecord, CaseStateRecord, HumanTaskField, HumanTaskSnapshot, HumanTaskSummary, RunResult, Workflow } from "@shared/types"
import {
  buildInitialHumanTaskAnswers,
  buildSubmitHumanTaskAnswers,
  hasMissingRequiredTaskAnswers,
  sortHumanTasksByActivity,
  type TaskStageMeta,
  taskSelectionKey,
  taskStageKey,
  toContinuationRun,
} from "@/components/notifications/task-ui"
import { HumanTaskInboxSection } from "@/components/notifications/HumanTaskInboxSection"
import { NotificationsHeaderActions } from "@/components/notifications/NotificationsHeaderActions"
import { NotificationsScopeSection } from "@/components/notifications/NotificationsScopeSection"
import { RecentEventsSection } from "@/components/notifications/RecentEventsSection"
import { toast } from "sonner"

const LEVEL_META: Record<InboxNotification["level"], { icon: typeof CheckCircle2; tone: string; badgeClass: string }> = {
  info: {
    icon: Clock3,
    tone: "text-status-info",
    badgeClass: "ui-status-badge-info",
  },
  success: {
    icon: CheckCircle2,
    tone: "text-status-success",
    badgeClass: "ui-status-badge-success",
  },
  warning: {
    icon: AlertTriangle,
    tone: "text-status-warning",
    badgeClass: "ui-status-badge-warning",
  },
  error: {
    icon: AlertTriangle,
    tone: "text-status-danger",
    badgeClass: "ui-status-badge-danger",
  },
}

interface OpenWorkflowPathOptions {
  preserveSelectedTask?: boolean
  pastRun?: RunResult | null
}

function deriveTaskStageMeta(workflow: Workflow, nodeId: string): TaskStageMeta | null {
  const node = workflow.nodes.find((candidate) => candidate.id === nodeId)
  if (!node) return null
  const presentation = getRuntimeStagePresentation(node, { fallbackId: node.id })
  return {
    title: presentation.title,
    group: presentation.group,
  }
}

export function NotificationsPage() {
  const [notifications] = useAtom(inboxNotificationsAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const desktopRuntime = useAtomValue(desktopRuntimeAtom)
  const [factoryBetaEnabled] = useAtom(factoryBetaEnabledAtom)
  const [selectedFactoryId] = useAtom(selectedFactoryIdAtom)
  const [selectedCaseId, setSelectedCaseId] = useAtom(selectedFactoryCaseIdAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setWorkflow] = useAtom(currentWorkflowAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const pastRuns = useAtomValue(pastRunsAtom)
  const [, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const workflowTemplateContexts = useAtomValue(workflowTemplateContextsAtom)
  const { continueWithWorkflow } = useChainExecution()
  const { markRead, markAllRead, clearAll } = useInboxNotifications()
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)
  const [sourceFilter, setSourceFilter] = useState<"all" | InboxNotification["source"]>("all")
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([])
  const [caseStates, setCaseStates] = useState<CaseStateRecord[]>([])
  const [artifactsLoading, setArtifactsLoading] = useState(false)
  const [humanTasks, setHumanTasks] = useState<HumanTaskSummary[]>([])
  const [humanTasksLoading, setHumanTasksLoading] = useState(false)
  const [humanTasksError, setHumanTasksError] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useAtom(selectedInboxTaskKeyAtom)
  const [selectedTask, setSelectedTask] = useState<HumanTaskSnapshot | null>(null)
  const [taskAnswers, setTaskAnswers] = useState<Record<string, unknown>>({})
  const [taskLoading, setTaskLoading] = useState(false)
  const [taskSubmitting, setTaskSubmitting] = useState(false)
  const [taskStageMetaByKey, setTaskStageMetaByKey] = useState<Record<string, TaskStageMeta>>({})
  const humanTasksRequestIdRef = useRef(0)
  const artifactsRequestIdRef = useRef(0)
  const selectedTaskRequestIdRef = useRef(0)
  const taskStageMetaRequestIdRef = useRef(0)

  useEffect(() => {
    markAllRead()
  }, [markAllRead])

  const refreshHumanTasks = useCallback(async () => {
    const requestId = humanTasksRequestIdRef.current + 1
    humanTasksRequestIdRef.current = requestId
    setHumanTasksLoading(true)
    setHumanTasksError(null)
    try {
      const tasks = await window.api.listHumanTasks(selectedProject || undefined)
      if (humanTasksRequestIdRef.current !== requestId) return
      setHumanTasks(tasks)
    } catch (error) {
      if (humanTasksRequestIdRef.current !== requestId) return
      setHumanTasksError(errorToUserMessage(error))
      setHumanTasks([])
    } finally {
      if (humanTasksRequestIdRef.current !== requestId) return
      setHumanTasksLoading(false)
    }
  }, [selectedProject])

  const refreshArtifacts = useCallback(async () => {
    const requestId = artifactsRequestIdRef.current + 1
    artifactsRequestIdRef.current = requestId
    if (!selectedProject) {
      setArtifacts([])
      setCaseStates([])
      setArtifactsLoading(false)
      return
    }
    setArtifactsLoading(true)
    try {
      const [nextArtifacts, nextCaseStates] = await Promise.all([
        window.api.listProjectArtifacts(selectedProject),
        window.api.listProjectCaseStates(selectedProject).catch(() => [] as CaseStateRecord[]),
      ])
      if (artifactsRequestIdRef.current !== requestId) return
      setArtifacts(nextArtifacts)
      setCaseStates(nextCaseStates)
    } catch {
      if (artifactsRequestIdRef.current !== requestId) return
      setArtifacts([])
      setCaseStates([])
    } finally {
      if (artifactsRequestIdRef.current !== requestId) return
      setArtifactsLoading(false)
    }
  }, [selectedProject])

  useEffect(() => {
    void refreshHumanTasks()
    void refreshArtifacts()
    // selectedTask is intentionally excluded so project changes don't retrigger on local detail updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, refreshArtifacts, refreshHumanTasks])

  const caseIndex = useMemo(
    () => buildProjectCaseIndex({
      artifacts,
      caseStates,
      workflowTemplateContexts,
    }),
    [artifacts, caseStates, workflowTemplateContexts],
  )

  const visibleCaseOptions = useMemo(
    () => selectedFactoryId
      ? caseIndex.caseOptions.filter((entry) => entry.factoryId === selectedFactoryId)
      : caseIndex.caseOptions,
    [caseIndex.caseOptions, selectedFactoryId],
  )

  const selectedFactoryLabel = useMemo(() => {
    if (!selectedFactoryId) return null
    return visibleCaseOptions[0]?.factoryLabel
      || artifacts.find((artifact) => artifact.factoryId === selectedFactoryId)?.factoryLabel
      || (selectedFactoryId.startsWith("pack:") ? selectedFactoryId.replace(/^pack:/, "") : "Lab")
  }, [artifacts, selectedFactoryId, visibleCaseOptions])

  const caseIdByTaskKey = useMemo(() => {
    const next = new Map<string, string>()
    for (const task of humanTasks) {
      const caseId = (task.workflowPath && caseIndex.caseByWorkflowPath.get(task.workflowPath))
        || caseIndex.caseByRunId.get(task.sourceRunId)
      if (!caseId) continue
      next.set(taskSelectionKey(task), caseId)
    }
    return next
  }, [caseIndex.caseByRunId, caseIndex.caseByWorkflowPath, humanTasks])

  const caseLabelById = useMemo(
    () => new Map(caseIndex.caseOptions.map((entry) => [entry.id, entry.label])),
    [caseIndex.caseOptions],
  )

  const visibleHumanTasks = useMemo(() => {
    const filteredTasks = humanTasks.filter((task) => {
      const taskCaseId = caseIdByTaskKey.get(taskSelectionKey(task)) || null
      if (selectedFactoryId) {
        const taskCase = taskCaseId ? caseIndex.caseById.get(taskCaseId) || null : null
        if (!taskCase || taskCase.factoryId !== selectedFactoryId) return false
      }
      if (selectedCaseId) {
        return taskCaseId === selectedCaseId
      }
      return true
    })
    return sortHumanTasksByActivity(filteredTasks)
  }, [caseIdByTaskKey, caseIndex.caseById, humanTasks, selectedCaseId, selectedFactoryId])

  const selectedCaseOption = useMemo(
    () => visibleCaseOptions.find((entry) => entry.id === selectedCaseId) || null,
    [selectedCaseId, visibleCaseOptions],
  )
  const primaryActionShortcutLabel = `${desktopRuntime.primaryModifierLabel}↵`

  useEffect(() => {
    if (!selectedCaseId) return
    if (!visibleCaseOptions.some((entry) => entry.id === selectedCaseId)) {
      setSelectedCaseId(null)
    }
  }, [selectedCaseId, setSelectedCaseId, visibleCaseOptions])

  useEffect(() => {
    if (selectedTaskId && visibleHumanTasks.some((task) => taskSelectionKey(task) === selectedTaskId)) {
      return
    }
    setSelectedTaskId(visibleHumanTasks[0] ? taskSelectionKey(visibleHumanTasks[0]) : null)
  }, [selectedTaskId, setSelectedTaskId, visibleHumanTasks])

  useEffect(() => {
    const summary = selectedTaskId
      ? visibleHumanTasks.find((task) => taskSelectionKey(task) === selectedTaskId) || null
      : null
    if (!summary) {
      selectedTaskRequestIdRef.current += 1
      setSelectedTask(null)
      setTaskAnswers({})
      setTaskLoading(false)
      return
    }

    const requestId = selectedTaskRequestIdRef.current + 1
    selectedTaskRequestIdRef.current = requestId

    setSelectedTask(null)
    setTaskAnswers({})
    setTaskLoading(true)
    setHumanTasksError(null)
    void window.api.loadHumanTask(summary.taskId, summary.workspace).then((task) => {
      if (selectedTaskRequestIdRef.current !== requestId) return
      setSelectedTask(task)
      setTaskAnswers(buildInitialHumanTaskAnswers(task))
    }).catch((error) => {
      if (selectedTaskRequestIdRef.current !== requestId) return
      setHumanTasksError(errorToUserMessage(error))
      setSelectedTask(null)
      setTaskAnswers({})
    }).finally(() => {
      if (selectedTaskRequestIdRef.current !== requestId) return
      setTaskLoading(false)
    })

    return () => {
      if (selectedTaskRequestIdRef.current === requestId) {
        selectedTaskRequestIdRef.current += 1
      }
    }
  }, [selectedTaskId, visibleHumanTasks])

  useEffect(() => {
    const workflowPaths = Array.from(new Set(
      humanTasks
        .map((task) => task.workflowPath)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ))
    if (workflowPaths.length === 0) {
      taskStageMetaRequestIdRef.current += 1
      setTaskStageMetaByKey({})
      return
    }

    const requestId = taskStageMetaRequestIdRef.current + 1
    taskStageMetaRequestIdRef.current = requestId
    void Promise.all(
      workflowPaths.map(async (workflowPath) => ({
        workflowPath,
        workflow: await window.api.loadWorkflow(workflowPath),
      })),
    ).then((loaded) => {
      if (taskStageMetaRequestIdRef.current !== requestId) return
      const next: Record<string, TaskStageMeta> = {}
      for (const task of humanTasks) {
        const key = taskStageKey(task)
        if (!key || !task.workflowPath) continue
        const workflow = loaded.find((entry) => entry.workflowPath === task.workflowPath)?.workflow
        if (!workflow) continue
        const meta = deriveTaskStageMeta(workflow, task.nodeId)
        if (meta) next[key] = meta
      }
      setTaskStageMetaByKey(next)
    }).catch((error) => {
      if (taskStageMetaRequestIdRef.current !== requestId) return
      console.error("[notifications] Could not load task stage metadata", error)
      setTaskStageMetaByKey({})
    })

    return () => {
      if (taskStageMetaRequestIdRef.current === requestId) {
        taskStageMetaRequestIdRef.current += 1
      }
    }
  }, [humanTasks])

  const visibleNotifications = useMemo(
    () =>
      notifications.filter((notification) => {
        if (showUnreadOnly && notification.read) return false
        if (sourceFilter !== "all" && notification.source !== sourceFilter) return false
        return true
      }),
    [notifications, showUnreadOnly, sourceFilter],
  )

  const unreadCount = notifications.filter((notification) => !notification.read).length
  const pastRunByWorkspace = useMemo(
    () =>
      new Map(
        pastRuns
          .filter(
            (run): run is RunResult & { workspace: string } =>
              typeof run.workspace === "string" &&
              run.workspace.trim().length > 0,
          )
          .map((run) => [run.workspace, run] as const),
      ),
    [pastRuns],
  )
  const openHumanTaskCount = visibleHumanTasks.length
  const selectedTaskStageMeta = selectedTask ? taskStageMetaByKey[taskStageKey(selectedTask) || ""] || null : null
  const openWorkflowPath = useCallback(async (workflowPath: string, options?: OpenWorkflowPathOptions) => {
    const workflow = await window.api.loadWorkflow(workflowPath)
    setWorkflow(workflow)
    setWorkflowSavedSnapshot(workflowSnapshot(workflow))
    setSelectedWorkflowPath(workflowPath)
    if (!options?.preserveSelectedTask) {
      setSelectedTaskId(null)
    }
    setSelectedPastRun(options?.pastRun ?? null)
    setMainView("thread")
    return workflow
  }, [setMainView, setSelectedPastRun, setSelectedTaskId, setSelectedWorkflowPath, setWorkflow, setWorkflowSavedSnapshot])

  const handleOpenWorkflow = async () => {
    if (!selectedTask?.workflowPath) return
    await openWorkflowPath(selectedTask.workflowPath, {
      preserveSelectedTask: true,
      pastRun: toContinuationRun(selectedTask),
    })
  }

  const handleNotificationAction = async (notification: InboxNotification) => {
    if (!notification.action) return
    if (notification.action.kind === "open_workflow") {
      await openWorkflowPath(notification.action.workflowPath, {
        pastRun: notification.action.workspace
          ? pastRunByWorkspace.get(notification.action.workspace) || null
          : null,
      })
      markRead(notification.id)
      return
    }
    if (notification.action.kind === "open_inbox_task") {
      setSelectedTaskId(notification.action.taskKey)
      setMainView("inbox")
      markRead(notification.id)
    }
  }

  const handleTaskFieldChange = (field: HumanTaskField, value: unknown) => {
    setTaskAnswers((previous) => ({
      ...previous,
      [field.id]: value,
    }))
  }

  const submitSelectedTask = async () => {
    if (!selectedTask) return false
    if (hasMissingRequiredTaskAnswers(selectedTask, taskAnswers)) return false
    const ok = await window.api.submitHumanTask(selectedTask.taskId, selectedTask.workspace, {
      answers: buildSubmitHumanTaskAnswers(selectedTask, taskAnswers),
    })
    return ok
  }

  const handleSubmitHumanTask = async () => {
    if (!selectedTask) return
    setTaskSubmitting(true)
    try {
      const ok = await submitSelectedTask()
      if (ok) {
        toast.success(selectedTask.kind === "approval" ? "Decision recorded" : "Response submitted")
        await refreshHumanTasks()
      }
    } finally {
      setTaskSubmitting(false)
    }
  }

  const handleSubmitAndContinue = async () => {
    if (!selectedTask?.workflowPath) return
    setTaskSubmitting(true)
    try {
      const ok = await submitSelectedTask()
      if (!ok) return
      toast.success(selectedTask.kind === "approval" ? "Decision recorded" : "Response submitted", {
        description: "Returning to the flow.",
      })
      const continuationRun = toContinuationRun(selectedTask)
      const workflow = await openWorkflowPath(selectedTask.workflowPath, {
        pastRun: continuationRun,
      })
      const started = await continueWithWorkflow(
        continuationRun,
        workflow,
        selectedTask.workflowPath,
      )
      if (started) {
        setMainView("thread")
        return
      }
      await refreshHumanTasks()
    } finally {
      setTaskSubmitting(false)
    }
  }

  const handleRejectHumanTask = async () => {
    if (!selectedTask) return
    setTaskSubmitting(true)
    try {
      const ok = await window.api.rejectHumanTask(selectedTask.taskId, selectedTask.workspace)
      if (ok) {
        toast.success(selectedTask.kind === "approval" ? "Decision rejected" : "Task rejected")
        await refreshHumanTasks()
      }
    } finally {
      setTaskSubmitting(false)
    }
  }

  useEffect(() => {
    if (!selectedTask || taskSubmitting || taskLoading) return

    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isShortcutConsumed(event)) return
      if (!matchesPrimaryShortcut(event, { key: "Enter", primaryModifierKey: desktopRuntime.primaryModifierKey })) return
      consumeShortcut(event)
      if (selectedTask.workflowPath) {
        void handleSubmitAndContinue()
        return
      }
      void handleSubmitHumanTask()
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [
    desktopRuntime.primaryModifierKey,
    selectedTask,
    taskLoading,
    taskSubmitting,
    handleSubmitAndContinue,
    handleSubmitHumanTask,
  ])

  return (
    <PageShell>
      <PageHeader
        title="Inbox"
        subtitle="Pending decisions and recent activity."
        actions={(
          <NotificationsHeaderActions
            selectedCaseId={selectedCaseId}
            factoryBetaEnabled={factoryBetaEnabled}
            showUnreadOnly={showUnreadOnly}
            unreadCount={unreadCount}
            hasNotifications={notifications.length > 0}
            onBackToTrack={() => setMainView("factory")}
            onRefresh={() => { void refreshHumanTasks() }}
            onToggleUnreadOnly={() => setShowUnreadOnly((value) => !value)}
            onMarkAllRead={markAllRead}
            onClearAll={clearAll}
          />
        )}
      />

      <NotificationsScopeSection
        selectedFactoryLabel={selectedFactoryLabel}
        selectedCaseLabel={selectedCaseOption?.label || null}
        visibleCaseOptions={visibleCaseOptions.map((entry) => ({ id: entry.id, label: entry.label }))}
        selectedCaseId={selectedCaseId}
        openHumanTaskCount={openHumanTaskCount}
        artifactsLoading={artifactsLoading}
        factoryBetaEnabled={factoryBetaEnabled}
        onOpenFactory={() => setMainView("factory")}
        onClearCase={() => setSelectedCaseId(null)}
        onSelectCase={setSelectedCaseId}
      />

      <HumanTaskInboxSection
        humanTasksLoading={humanTasksLoading}
        humanTasksError={humanTasksError}
        openHumanTaskCount={openHumanTaskCount}
        visibleHumanTasks={visibleHumanTasks}
        selectedTaskId={selectedTaskId}
        selectedCaseId={selectedCaseId}
        taskStageMetaByKey={taskStageMetaByKey}
        caseIdByTaskKey={caseIdByTaskKey}
        caseLabelById={caseLabelById}
        latestArtifactByCaseId={caseIndex.latestArtifactByCaseId}
        onSelectTaskId={setSelectedTaskId}
        selectedTask={selectedTask}
        taskLoading={taskLoading}
        taskSubmitting={taskSubmitting}
        taskAnswers={taskAnswers}
        selectedTaskStageMeta={selectedTaskStageMeta}
        primaryActionShortcutLabel={primaryActionShortcutLabel}
        onOpenWorkflow={() => { void handleOpenWorkflow() }}
        onFieldChange={handleTaskFieldChange}
        onSubmit={() => { void handleSubmitHumanTask() }}
        onSubmitAndContinue={() => { void handleSubmitAndContinue() }}
        onReject={() => { void handleRejectHumanTask() }}
        onClearCaseFilter={selectedCaseId ? () => setSelectedCaseId(null) : null}
      />

      <RecentEventsSection
        notifications={notifications}
        unreadCount={unreadCount}
        visibleNotifications={visibleNotifications}
        sourceFilter={sourceFilter}
        emphasized={openHumanTaskCount === 0}
        onSourceFilterChange={setSourceFilter}
        onNotificationAction={(notification) => { void handleNotificationAction(notification) }}
        onMarkRead={markRead}
        levelMeta={LEVEL_META}
      />
    </PageShell>
  )
}
