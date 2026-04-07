import { useEffect, useCallback, useRef } from "react"
import { useStableSubscription } from "./useStableSubscription"
import { useAtom, useSetAtom } from "jotai"
import {
  batchStatusAtom,
  batchIdAtom,
  batchErrorAtom,
  batchItemsAtom,
  batchSummaryAtom,
  batchProgressAtom,
  currentWorkflowAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  validationErrorsAtom,
} from "@/lib/store"
import type { ActiveExecutionSnapshot, BatchEvent } from "@shared/types"
import type {
  BatchItemResult,
  BatchSummary,
  WorkflowInput,
} from "@shared/types"
import { toast } from "sonner"
import { toastError, toastErrorFromCatch } from "@/lib/toast-error"
import { errorToUserMessage } from "@/lib/error-message"
import { useInboxNotifications } from "@/hooks/useInboxNotifications"
import {
  groupValidationIssuesByNode,
  resolveExecutionStartResult,
} from "@/features/execution/commands"

interface BatchRunOptions {
  preserveExistingItems?: boolean
  inputIndexMap?: number[]
  totalInputsOverride?: number
}

export function mergeBatchItems(
  previousItems: BatchItemResult[],
  nextItems: BatchItemResult[],
): BatchItemResult[] {
  const nextByIndex = new Map(nextItems.map((item) => [item.input_index, item]))
  const merged = previousItems
    .map((item) => nextByIndex.get(item.input_index) ?? item)
    .filter(
      (item, index, array) =>
        array.findIndex(
          (candidate) => candidate.input_index === item.input_index,
        ) === index,
    )

  for (const item of nextItems) {
    if (
      !merged.some((candidate) => candidate.input_index === item.input_index)
    ) {
      merged.push(item)
    }
  }

  return merged.sort((left, right) => left.input_index - right.input_index)
}

export function summarizeBatchItems(
  items: BatchItemResult[],
  total: number,
): BatchSummary {
  const passedItems = items.filter((item) => item.status === "completed")
  const failedItems = items.filter((item) => item.status === "failed")
  const cancelledItems = items.filter(
    (item) => item.status === "cancelled" || item.status === "interrupted",
  )
  const processed = items.length
  const cancelled = Math.max(0, total - processed) + cancelledItems.length
  const totalCost = items.reduce((sum, item) => sum + item.cost_usd, 0)
  const totalDuration = items.reduce((sum, item) => sum + item.duration_ms, 0)

  return {
    total,
    processed,
    passed: passedItems.length,
    failed: failedItems.length,
    cancelled,
    mean_cost_usd: processed > 0 ? totalCost / processed : 0,
    mean_duration_ms: processed > 0 ? totalDuration / processed : 0,
    pass_rate: processed > 0 ? passedItems.length / processed : 0,
  }
}

export function resolveBatchDoneState(
  previousItems: BatchItemResult[],
  incomingItems: BatchItemResult[],
  incomingSummary: BatchSummary,
  previousProgress: { completed: number; total: number; running: number },
  options: BatchRunOptions | null,
) {
  const totalInputs = options?.totalInputsOverride ?? incomingSummary.total
  const nextItems = options?.preserveExistingItems
    ? mergeBatchItems(previousItems, incomingItems)
    : incomingItems
  const nextSummary = summarizeBatchItems(nextItems, totalInputs)

  return {
    items: nextItems,
    summary: nextSummary,
    progress: {
      completed: nextSummary.processed,
      total: Math.max(previousProgress.total, totalInputs),
      running: 0,
    },
    notification: {
      title:
        nextSummary.failed > 0
          ? "Batch run finished with failures"
          : nextSummary.cancelled > 0
            ? "Batch run cancelled"
            : "Batch run completed",
      description: `${nextSummary.processed}/${nextSummary.total} processed · ${nextSummary.failed} failed · ${nextSummary.cancelled} cancelled`,
      level:
        nextSummary.failed > 0
          ? ("warning" as const)
          : nextSummary.cancelled > 0
            ? ("warning" as const)
            : ("success" as const),
    },
  }
}

export function useBatchExecution() {
  const [batchStatus, setBatchStatus] = useAtom(batchStatusAtom)
  const [batchId, setBatchId] = useAtom(batchIdAtom)
  const [batchItems] = useAtom(batchItemsAtom)
  const setBatchError = useSetAtom(batchErrorAtom)
  const setBatchItems = useSetAtom(batchItemsAtom)
  const setBatchSummary = useSetAtom(batchSummaryAtom)
  const setBatchProgress = useSetAtom(batchProgressAtom)
  const setValidationErrors = useSetAtom(validationErrorsAtom)
  const [workflow] = useAtom(currentWorkflowAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const { addNotification } = useInboxNotifications()
  const batchIdRef = useRef<string | null>(batchId)
  const pendingBatchRef = useRef(false)
  const pendingBatchEventsRef = useRef<BatchEvent[]>([])
  const batchItemsRef = useRef<BatchItemResult[]>([])
  const currentRunOptionsRef = useRef<BatchRunOptions | null>(null)
  batchIdRef.current = batchId

  useEffect(() => {
    batchItemsRef.current = batchItems
  }, [batchItems])

  const clearBatchTracking = useCallback(() => {
    batchIdRef.current = null
    pendingBatchRef.current = false
    pendingBatchEventsRef.current = []
    currentRunOptionsRef.current = null
  }, [])

  const applyBatchItems = useCallback(
    (
      updater:
        | BatchItemResult[]
        | ((prev: BatchItemResult[]) => BatchItemResult[]),
    ) => {
      setBatchItems((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater
        batchItemsRef.current = next
        return next
      })
    },
    [setBatchItems],
  )

  const normalizeIncomingItem = useCallback(
    (item: BatchItemResult): BatchItemResult => {
      const inputIndexMap = currentRunOptionsRef.current?.inputIndexMap
      if (!inputIndexMap) return item
      const mappedIndex = inputIndexMap[item.input_index]
      return {
        ...item,
        input_index: mappedIndex ?? item.input_index,
      }
    },
    [],
  )

  const processBatchEvent = useCallback(
    (event: BatchEvent) => {
      switch (event.type) {
        case "batch-progress":
          setBatchProgress({
            completed: event.completed,
            total: event.total,
            running: event.running,
          })
          break

        case "batch-item-done":
          applyBatchItems((prev) => {
            const nextItem = normalizeIncomingItem(event.item)
            const shouldMerge =
              currentRunOptionsRef.current?.preserveExistingItems
            return shouldMerge
              ? mergeBatchItems(prev, [nextItem])
              : [...prev, nextItem].sort(
                  (left, right) => left.input_index - right.input_index,
                )
          })
          break

        case "batch-error":
          clearBatchTracking()
          setBatchError(event.error)
          setBatchStatus("error")
          setBatchId(null)
          setBatchSummary(null)
          setBatchProgress((prev) => ({
            completed: prev.completed,
            total: prev.total,
            running: 0,
          }))
          addNotification({
            title: "Batch run failed",
            description: event.error,
            level: "error",
            source: "batch",
          })
          break

        case "batch-done":
          const normalizedItems = event.items.map((item) =>
            normalizeIncomingItem(item),
          )
          const resolved = resolveBatchDoneState(
            batchItemsRef.current,
            normalizedItems,
            event.summary,
            {
              completed: 0,
              total: event.summary.total,
              running: 0,
            },
            currentRunOptionsRef.current,
          )
          clearBatchTracking()
          setBatchError(null)
          setBatchSummary(resolved.summary)
          applyBatchItems(resolved.items)
          setBatchStatus("done")
          setBatchId(null)
          setBatchProgress((prev) => ({
            ...resolved.progress,
            total: Math.max(prev.total, resolved.progress.total),
          }))
          addNotification({
            title: resolved.notification.title,
            description: resolved.notification.description,
            level: resolved.notification.level,
            source: "batch",
          })
          break
      }
    },
    [
      addNotification,
      applyBatchItems,
      clearBatchTracking,
      normalizeIncomingItem,
      setBatchError,
      setBatchId,
      setBatchProgress,
      setBatchStatus,
      setBatchSummary,
    ],
  )

  useStableSubscription(window.api.onBatchEvent, (event: BatchEvent) => {
    const currentBatchId = batchIdRef.current
    if (currentBatchId) {
      if (event.batchId !== currentBatchId) return
      processBatchEvent(event)
      return
    }
    if (pendingBatchRef.current) pendingBatchEventsRef.current.push(event)
  })

  useEffect(() => {
    let cancelled = false
    window.api
      .getActiveExecutions()
      .then((executions: ActiveExecutionSnapshot[]) => {
        if (cancelled) return
        const activeBatch = executions.find(
          (execution) =>
            execution.kind === "batch" &&
            ((selectedWorkflowPath &&
              execution.workflowPath === selectedWorkflowPath) ||
              (!selectedWorkflowPath &&
                selectedProject &&
                execution.projectPath === selectedProject)),
        )
        if (!activeBatch || activeBatch.kind !== "batch") return

        batchIdRef.current = activeBatch.batchId
        pendingBatchRef.current = false
        pendingBatchEventsRef.current = []
        setBatchId(activeBatch.batchId)
        setBatchStatus("running")
        setBatchError(null)
        batchItemsRef.current = activeBatch.items
        setBatchItems(activeBatch.items)
        setBatchSummary(null)
        setBatchProgress({
          completed: activeBatch.completed,
          total: activeBatch.total,
          running: activeBatch.running,
        })
      })
      .catch((error) => {
        if (!cancelled)
          console.error(
            "[useBatchExecution] getActiveExecutions failed:",
            error,
          )
      })
    return () => {
      cancelled = true
    }
  }, [
    selectedProject,
    selectedWorkflowPath,
    setBatchError,
    setBatchId,
    setBatchItems,
    setBatchProgress,
    setBatchStatus,
    setBatchSummary,
  ])

  const runBatch = useCallback(
    async (
      inputs: WorkflowInput[],
      concurrency: number,
      stopOnFailure: boolean,
      options?: BatchRunOptions,
    ) => {
      if (!workflow.nodes.length || inputs.length === 0) return
      if (
        pendingBatchRef.current ||
        batchIdRef.current ||
        batchStatus === "running"
      ) {
        toastError("Batch run is already in progress")
        return
      }

      clearBatchTracking()
      pendingBatchRef.current = true
      currentRunOptionsRef.current = options ?? null
      if (!options?.preserveExistingItems) {
        batchItemsRef.current = []
        setBatchItems([])
      }
      setBatchSummary(null)
      setBatchError(null)
      setBatchProgress({ completed: 0, total: inputs.length, running: 0 })
      setBatchStatus("running")
      setBatchId(null)

      try {
        const result = await window.api.runBatch(
          workflow,
          inputs,
          concurrency,
          stopOnFailure,
          selectedProject ?? undefined,
          selectedWorkflowPath ?? undefined,
        )
        const { startedRunId, errorMessage, validationIssues } =
          resolveExecutionStartResult(result, "Failed to start batch run.")
        if (!startedRunId) {
          clearBatchTracking()
          if (validationIssues.length > 0) {
            setValidationErrors(groupValidationIssuesByNode(validationIssues))
          }
          setBatchError(errorMessage || "Failed to start batch run.")
          setBatchStatus("error")
          setBatchId(null)
          addNotification({
            title: "Batch run failed to start",
            description: errorMessage || "Failed to start batch run.",
            level: "error",
            source: "batch",
          })
          return
        }
        batchIdRef.current = startedRunId
        setBatchId(startedRunId)
        const bufferedEvents = pendingBatchEventsRef.current
        pendingBatchRef.current = false
        pendingBatchEventsRef.current = []
        for (const event of bufferedEvents) {
          if (event.batchId === startedRunId) {
            processBatchEvent(event)
          }
        }
      } catch (err) {
        clearBatchTracking()
        setBatchError(errorToUserMessage(err))
        setBatchStatus("error")
        setBatchId(null)
        addNotification({
          title: "Batch run failed to start",
          description: errorToUserMessage(err),
          level: "error",
          source: "batch",
        })
      }
    },
    [
      addNotification,
      workflow,
      selectedProject,
      selectedWorkflowPath,
      setBatchItems,
      setBatchSummary,
      setBatchError,
      setBatchProgress,
      setBatchStatus,
      setBatchId,
      setValidationErrors,
      clearBatchTracking,
      processBatchEvent,
      batchStatus,
    ],
  )

  const cancelBatch = useCallback(async () => {
    const currentBatchId = batchIdRef.current ?? batchId
    if (!currentBatchId) return

    try {
      await window.api.cancelBatch(currentBatchId)
    } catch (err) {
      console.error("[useBatchExecution] cancelBatch failed:", err)
      setBatchError("Could not cancel batch run. It may still be running.")
      toastErrorFromCatch("Could not cancel batch run", err)
      addNotification({
        title: "Could not cancel batch run",
        description: errorToUserMessage(err),
        level: "error",
        source: "batch",
      })
      return
    }

    toast.success("Cancelling batch run", {
      description: "Completed results will remain available.",
    })
  }, [addNotification, batchId, setBatchError])

  return { batchStatus, runBatch, cancelBatch }
}
