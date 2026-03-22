import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { deriveWorkflowBlockedResumeSummary } from "@/lib/workflow-blocked-resume"
import type { ViewMode } from "@/lib/store"
import { toastErrorFromCatch } from "@/lib/toast-error"
import type { WorkflowEntryState } from "@/lib/workflow-entry"
import type { ExecutionRunStatus } from "@/lib/workflow-execution"
import { getRuntimeStagePresentation } from "@/lib/runtime-flow-labels"
import type {
  ArtifactRecord,
  EvaluationResult,
  HumanTaskField,
  HumanTaskSnapshot,
  NodeState,
  RunResult,
  Workflow,
} from "@shared/types"

import {
  buildInitialHumanTaskAnswers,
  buildSubmitHumanTaskAnswers,
  hasMissingRequiredTaskAnswers,
  taskStageKey,
  toContinuationRun,
  type TaskStageMeta,
} from "@/components/notifications/task-ui"

type SetSelectedInboxTaskKey = (
  value: string | null | ((current: string | null) => string | null)
) => void

export function useWorkflowBlockedResumeTask({
  selectedInboxTaskKey,
  selectedWorkflowPath,
  setSelectedInboxTaskKey,
  combinedArtifactRecords,
  workflow,
  nodeStates,
  evalResults,
  runStatus,
  hasActiveEntryState,
  showCreateDraftSkeleton,
  viewMode,
  onSelectPastRun,
  onPrepareNewRun,
  continueWithWorkflow,
}: {
  selectedInboxTaskKey: string | null
  selectedWorkflowPath: string | null
  setSelectedInboxTaskKey: SetSelectedInboxTaskKey
  combinedArtifactRecords: ArtifactRecord[]
  workflow: Workflow
  nodeStates: Record<string, NodeState>
  evalResults: Record<string, EvaluationResult[]>
  runStatus: ExecutionRunStatus
  hasActiveEntryState: boolean
  showCreateDraftSkeleton: boolean
  viewMode: ViewMode
  onSelectPastRun: (run: RunResult | null) => void
  onPrepareNewRun: () => void
  continueWithWorkflow: (
    run: RunResult,
    workflow: Workflow,
    selectedWorkflowPath: string | null,
  ) => Promise<void>
}) {
  const selectedResumeTaskRequestIdRef = useRef(0)
  const [selectedResumeTask, setSelectedResumeTask] = useState<HumanTaskSnapshot | null>(null)
  const [resumeTaskAnswers, setResumeTaskAnswers] = useState<Record<string, unknown>>({})
  const [resumeTaskSubmitting, setResumeTaskSubmitting] = useState(false)

  const resetBlockedTaskState = useCallback(() => {
    setSelectedResumeTask(null)
    setResumeTaskAnswers({})
  }, [])

  useEffect(() => {
    if (!selectedInboxTaskKey || !selectedWorkflowPath) {
      selectedResumeTaskRequestIdRef.current += 1
      resetBlockedTaskState()
      return
    }

    const separatorIndex = selectedInboxTaskKey.lastIndexOf("::")
    if (separatorIndex <= 0) {
      selectedResumeTaskRequestIdRef.current += 1
      resetBlockedTaskState()
      return
    }

    const workspace = selectedInboxTaskKey.slice(0, separatorIndex)
    const taskId = selectedInboxTaskKey.slice(separatorIndex + 2)
    const taskSelectionKey = selectedInboxTaskKey
    const requestId = selectedResumeTaskRequestIdRef.current + 1
    selectedResumeTaskRequestIdRef.current = requestId

    resetBlockedTaskState()
    void window.api.loadHumanTask(taskId, workspace).then((task) => {
      if (selectedResumeTaskRequestIdRef.current !== requestId) return
      if (!task || task.status !== "open") {
        setSelectedInboxTaskKey((current) => current === taskSelectionKey ? null : current)
        resetBlockedTaskState()
        return
      }
      if (task.workflowPath && task.workflowPath !== selectedWorkflowPath) {
        setSelectedInboxTaskKey((current) => current === taskSelectionKey ? null : current)
        resetBlockedTaskState()
        return
      }
      setSelectedResumeTask(task)
      setResumeTaskAnswers(buildInitialHumanTaskAnswers(task))
    }).catch((error) => {
      if (selectedResumeTaskRequestIdRef.current !== requestId) return
      toastErrorFromCatch("Could not load blocked task", error)
      setSelectedInboxTaskKey((current) => current === taskSelectionKey ? null : current)
      resetBlockedTaskState()
    })

    return () => {
      if (selectedResumeTaskRequestIdRef.current === requestId) {
        selectedResumeTaskRequestIdRef.current += 1
      }
    }
  }, [resetBlockedTaskState, selectedInboxTaskKey, selectedWorkflowPath, setSelectedInboxTaskKey])

  const blockedResumeArtifacts = useMemo(() => {
    if (!selectedResumeTask) return [] as ArtifactRecord[]

    return combinedArtifactRecords
      .filter((artifact) =>
        (selectedResumeTask.workflowPath && artifact.workflowPath === selectedResumeTask.workflowPath)
        || artifact.runId === selectedResumeTask.sourceRunId,
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)
  }, [combinedArtifactRecords, selectedResumeTask])

  const blockedResumeSummary = useMemo(
    () => selectedResumeTask
      ? deriveWorkflowBlockedResumeSummary({
        workflow,
        task: selectedResumeTask,
        sourceArtifacts: blockedResumeArtifacts,
        nodeStates,
        evalResults,
      })
      : null,
    [blockedResumeArtifacts, evalResults, nodeStates, selectedResumeTask, workflow],
  )

  const selectedResumeTaskStageMeta = useMemo<TaskStageMeta | null>(() => {
    if (!selectedResumeTask) return null
    const stageKey = taskStageKey(selectedResumeTask)
    if (!stageKey) return null
    const node = workflow.nodes.find((candidate) => candidate.id === selectedResumeTask.nodeId)
    if (!node) return null
    const presentation = getRuntimeStagePresentation(node, { fallbackId: node.id })
    return {
      title: presentation.title,
      group: presentation.group,
    }
  }, [selectedResumeTask, workflow.nodes])

  const blockedEntryState = useMemo<WorkflowEntryState | null>(
    () => blockedResumeSummary
      ? {
        workflowPath: selectedWorkflowPath,
        workflowName: workflow.name || selectedResumeTask?.workflowName || "Untitled flow",
        source: "generated",
        title: blockedResumeSummary.workLabel,
        summary: blockedResumeSummary.reasonText,
        contractLabel: "",
        contractText: "",
        inputText: "",
        outputText: "",
        readinessText: blockedResumeSummary.statusText,
      }
      : null,
    [blockedResumeSummary, selectedResumeTask?.workflowName, selectedWorkflowPath, workflow.name],
  )

  const hasBlockedResumeState = (
    runStatus === "idle"
    && !hasActiveEntryState
    && !showCreateDraftSkeleton
    && blockedResumeSummary !== null
  )
  const showBlockedResumeHeader = viewMode === "list" && hasBlockedResumeState

  const handleResumeTaskFieldChange = useCallback((field: HumanTaskField, value: unknown) => {
    setResumeTaskAnswers((previous) => ({
      ...previous,
      [field.id]: value,
    }))
  }, [])

  const submitResumeTask = useCallback(async () => {
    if (!selectedResumeTask) return false
    if (hasMissingRequiredTaskAnswers(selectedResumeTask, resumeTaskAnswers)) return false
    return window.api.submitHumanTask(selectedResumeTask.taskId, selectedResumeTask.workspace, {
      answers: buildSubmitHumanTaskAnswers(selectedResumeTask, resumeTaskAnswers),
    })
  }, [resumeTaskAnswers, selectedResumeTask])

  const handleSubmitResumeTask = useCallback(async () => {
    if (!selectedResumeTask) return
    setResumeTaskSubmitting(true)
    try {
      const ok = await submitResumeTask()
      if (!ok) return
      onSelectPastRun(null)
      setSelectedInboxTaskKey(null)
      resetBlockedTaskState()
      onPrepareNewRun()
    } finally {
      setResumeTaskSubmitting(false)
    }
  }, [
    onPrepareNewRun,
    onSelectPastRun,
    resetBlockedTaskState,
    selectedResumeTask,
    setSelectedInboxTaskKey,
    submitResumeTask,
  ])

  const handleSubmitResumeTaskAndContinue = useCallback(async () => {
    if (!selectedResumeTask || !selectedWorkflowPath) return
    setResumeTaskSubmitting(true)
    try {
      const ok = await submitResumeTask()
      if (!ok) return
      const continuationRun = toContinuationRun(selectedResumeTask)
      onSelectPastRun(continuationRun)
      setSelectedInboxTaskKey(null)
      resetBlockedTaskState()
      await continueWithWorkflow(
        continuationRun,
        workflow,
        selectedWorkflowPath,
      )
    } finally {
      setResumeTaskSubmitting(false)
    }
  }, [
    continueWithWorkflow,
    onSelectPastRun,
    resetBlockedTaskState,
    selectedResumeTask,
    selectedWorkflowPath,
    setSelectedInboxTaskKey,
    submitResumeTask,
    workflow,
  ])

  const handleRejectResumeTask = useCallback(async () => {
    if (!selectedResumeTask) return
    setResumeTaskSubmitting(true)
    try {
      const ok = await window.api.rejectHumanTask(selectedResumeTask.taskId, selectedResumeTask.workspace)
      if (!ok) return
      setSelectedInboxTaskKey(null)
      resetBlockedTaskState()
    } finally {
      setResumeTaskSubmitting(false)
    }
  }, [resetBlockedTaskState, selectedResumeTask, setSelectedInboxTaskKey])

  return {
    selectedResumeTask,
    resumeTaskAnswers,
    resumeTaskSubmitting,
    blockedResumeSummary,
    selectedResumeTaskStageMeta,
    blockedEntryState,
    hasBlockedResumeState,
    showBlockedResumeHeader,
    handleResumeTaskFieldChange,
    handleSubmitResumeTask,
    handleSubmitResumeTaskAndContinue,
    handleRejectResumeTask,
  }
}
