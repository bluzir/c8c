import { BrowserWindow } from "electron"
import { cancelWorkflowRun, runWorkflow } from "./workflow-runner"
import {
  ensureBatchWorkspace,
  logBatchPersistenceFailure,
  persistBatchState,
  type PersistedBatchState,
} from "./batch-state"
import { logInfo, logWarn } from "./structured-log"
import type {
  Workflow,
  WorkflowInput,
  BatchItemResult,
  BatchSummary,
  BatchEvent,
} from "@shared/types"

const activeBatches = new Map<string, AbortController>()
const activeBatchRuns = new Map<string, Set<string>>()
const activeBatchSnapshots = new Map<string, ActiveBatchSnapshot>()
const DEFAULT_BATCH_ITEM_TIMEOUT_MS = 5 * 60 * 1000
const MAX_BATCH_CONCURRENCY = 10

export interface ActiveBatchSnapshot {
  batchId: string
  workflowName: string
  workflowPath?: string
  projectPath?: string
  workspace: string
  total: number
  completed: number
  running: number
  concurrency: number
  stopOnFailure: boolean
  startedAt: number
  items: BatchItemResult[]
}

function send(window: BrowserWindow, event: BatchEvent) {
  if (!window.isDestroyed()) {
    window.webContents.send("batch:event", event)
  }
}

export async function runBatch(
  batchId: string,
  workflow: Workflow,
  inputs: WorkflowInput[],
  concurrency: number,
  stopOnFailure: boolean,
  window: BrowserWindow,
  projectPath?: string,
  workflowPath?: string,
): Promise<void> {
  const requestedConcurrency = Number.isFinite(concurrency)
    ? Math.floor(concurrency)
    : concurrency
  const effectiveConcurrency =
    Number.isFinite(requestedConcurrency) && requestedConcurrency >= 1
      ? Math.max(1, Math.min(MAX_BATCH_CONCURRENCY, requestedConcurrency))
      : requestedConcurrency
  const controller = new AbortController()
  activeBatches.set(batchId, controller)
  activeBatchRuns.set(batchId, new Set<string>())
  const startedAt = Date.now()
  const workspace = await ensureBatchWorkspace(batchId, projectPath)
  const items: BatchItemResult[] = []
  activeBatchSnapshots.set(batchId, {
    batchId,
    workflowName: workflow.name,
    workflowPath,
    projectPath,
    workspace,
    total: inputs.length,
    completed: 0,
    running: 0,
    concurrency: Number.isFinite(effectiveConcurrency)
      ? effectiveConcurrency
      : concurrency,
    stopOnFailure,
    startedAt,
    items,
  })

  const persistSnapshot = async (
    status: PersistedBatchState["status"],
    error?: string,
  ) => {
    const snapshot = activeBatchSnapshots.get(batchId)
    if (!snapshot) return
    try {
      await persistBatchState(snapshot.workspace, {
        batchId: snapshot.batchId,
        workflowName: snapshot.workflowName,
        workflowPath: snapshot.workflowPath,
        projectPath: snapshot.projectPath,
        total: snapshot.total,
        completed: snapshot.completed,
        running: snapshot.running,
        concurrency: snapshot.concurrency,
        stopOnFailure: snapshot.stopOnFailure,
        startedAt: snapshot.startedAt,
        updatedAt: Date.now(),
        status,
        items: snapshot.items,
        error,
      })
    } catch (persistError) {
      logBatchPersistenceFailure(batchId, persistError)
    }
  }

  await persistSnapshot("running")

  try {
    if (!Number.isFinite(effectiveConcurrency) || effectiveConcurrency < 1) {
      send(window, {
        type: "batch-error",
        batchId,
        error: "Batch concurrency must be at least 1.",
      })
      return
    }
    if (effectiveConcurrency !== concurrency) {
      logWarn("batch-runner", "batch_concurrency_clamped", {
        batchId,
        requestedConcurrency: concurrency,
        effectiveConcurrency,
        maxConcurrency: MAX_BATCH_CONCURRENCY,
      })
    }
    if (inputs.length === 0) {
      send(window, {
        type: "batch-error",
        batchId,
        error: "Batch requires at least one input.",
      })
      return
    }
    if (
      workflow.nodes.some(
        (node) => node.type === "approval" || node.type === "human",
      )
    ) {
      send(window, {
        type: "batch-error",
        batchId,
        error:
          "Batch run does not support human review nodes. Remove approval/human steps or run a single execution.",
      })
      return
    }

    let completed = 0
    let running = 0
    let stopped = false

    const queue = inputs.map((input, index) => ({ input, index }))
    let queueIdx = 0

    const emitProgress = () => {
      const snapshot = activeBatchSnapshots.get(batchId)
      if (snapshot) {
        snapshot.completed = completed
        snapshot.running = running
      }
      void persistSnapshot("running")
      send(window, {
        type: "batch-progress",
        batchId,
        completed,
        total: inputs.length,
        running,
      })
    }

    emitProgress()

    const runItem = async (
      input: WorkflowInput,
      index: number,
    ): Promise<BatchItemResult> => {
      const runId = `batch-${batchId}-item-${index}-${Date.now()}`
      const startedAt = Date.now()
      const batchRuns = activeBatchRuns.get(batchId)
      batchRuns?.add(runId)
      const abortRun = () => {
        cancelWorkflowRun(runId)
      }
      controller.signal.addEventListener("abort", abortRun, { once: true })

      const runPromise = runWorkflow(
        runId,
        workflow,
        input,
        window,
        projectPath,
        workflowPath,
      )
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined
      let timedOut = false

      try {
        const timeoutPromise = new Promise<never>((_resolve, reject) => {
          timeoutHandle = setTimeout(() => {
            timedOut = true
            cancelWorkflowRun(runId)
            reject(
              new Error(
                `Batch item timed out after ${DEFAULT_BATCH_ITEM_TIMEOUT_MS}ms`,
              ),
            )
          }, DEFAULT_BATCH_ITEM_TIMEOUT_MS)
        })

        const summary = await Promise.race([runPromise, timeoutPromise])
        if (!summary || typeof summary !== "object") {
          throw new Error("Workflow run returned no result")
        }
        const status: BatchItemResult["status"] =
          summary.status === "completed"
            ? "completed"
            : summary.status === "cancelled"
              ? "cancelled"
              : summary.status === "interrupted"
                ? "interrupted"
                : "failed"

        return {
          input_index: index,
          run_id: runId,
          status,
          eval_scores: summary.evalScores || {},
          cost_usd: summary.totalCost || 0,
          duration_ms: summary.durationMs || Date.now() - startedAt,
          error:
            status === "failed"
              ? `Run finished with status: ${summary.status}`
              : undefined,
        }
      } catch (err) {
        if (timedOut) {
          runPromise.catch((error) => {
            logWarn("batch-runner", "timed_out_run_error_swallowed", {
              batchId,
              runId,
              error: error instanceof Error ? error.message : String(error),
            })
          })
        }
        return {
          input_index: index,
          run_id: runId,
          status: "failed",
          eval_scores: {},
          cost_usd: 0,
          duration_ms: Date.now() - startedAt,
          error: err instanceof Error ? err.message : String(err),
        }
      } finally {
        controller.signal.removeEventListener("abort", abortRun)
        batchRuns?.delete(runId)
        if (timeoutHandle) {
          clearTimeout(timeoutHandle)
        }
      }
    }

    // Pool-based concurrency
    const workers: Promise<void>[] = []

    logInfo("batch-runner", "batch_started", {
      batchId,
      totalInputs: inputs.length,
      concurrency: effectiveConcurrency,
      stopOnFailure,
      workflowPath: workflowPath || null,
      projectPath: projectPath || null,
    })

    for (let i = 0; i < Math.min(effectiveConcurrency, inputs.length); i++) {
      workers.push(
        (async () => {
          while (
            queueIdx < queue.length &&
            !stopped &&
            !controller.signal.aborted
          ) {
            const item = queue[queueIdx++]
            if (!item) break

            running++
            emitProgress()

            const result = await runItem(item.input, item.index)
            items.push(result)
            completed++
            running--
            items.sort((left, right) => left.input_index - right.input_index)

            send(window, { type: "batch-item-done", batchId, item: result })
            emitProgress()

            if (stopOnFailure && result.status !== "completed") {
              stopped = true
              controller.abort()
            }
          }
        })(),
      )
    }

    await Promise.all(workers)

    // Build summary
    const passedItems = items.filter((i) => i.status === "completed")
    const failedItems = items.filter((i) => i.status === "failed")
    const cancelledItems = items.filter(
      (i) => i.status === "cancelled" || i.status === "interrupted",
    )
    const skippedCount = Math.max(0, inputs.length - items.length)
    const cancelledCount = cancelledItems.length + skippedCount
    const totalCostSum = items.reduce((sum, i) => sum + i.cost_usd, 0)
    const totalDurationSum = items.reduce((sum, i) => sum + i.duration_ms, 0)

    const summary: BatchSummary = {
      total: inputs.length,
      processed: items.length,
      passed: passedItems.length,
      failed: failedItems.length,
      cancelled: cancelledCount,
      mean_cost_usd: items.length > 0 ? totalCostSum / items.length : 0,
      mean_duration_ms: items.length > 0 ? totalDurationSum / items.length : 0,
      pass_rate: items.length > 0 ? passedItems.length / items.length : 0,
    }

    send(window, { type: "batch-done", batchId, summary, items })
    await persistSnapshot(controller.signal.aborted ? "cancelled" : "completed")
  } catch (err) {
    logWarn("batch-runner", "batch_failed", {
      batchId,
      error: err instanceof Error ? err.message : String(err),
    })
    send(window, {
      type: "batch-error",
      batchId,
      error: String(err),
    })
    await persistSnapshot(
      "failed",
      err instanceof Error ? err.message : String(err),
    )
  } finally {
    activeBatches.delete(batchId)
    activeBatchRuns.delete(batchId)
    activeBatchSnapshots.delete(batchId)
  }
}

export function cancelBatch(batchId: string): boolean {
  const controller = activeBatches.get(batchId)
  if (controller) {
    controller.abort()
    const runIds = activeBatchRuns.get(batchId)
    if (runIds) {
      for (const runId of runIds) {
        cancelWorkflowRun(runId)
      }
    }
    activeBatches.delete(batchId)
    activeBatchRuns.delete(batchId)
    const snapshot = activeBatchSnapshots.get(batchId)
    if (snapshot) {
      snapshot.running = 0
      void persistBatchState(snapshot.workspace, {
        batchId: snapshot.batchId,
        workflowName: snapshot.workflowName,
        workflowPath: snapshot.workflowPath,
        projectPath: snapshot.projectPath,
        total: snapshot.total,
        completed: snapshot.completed,
        running: 0,
        concurrency: snapshot.concurrency,
        stopOnFailure: snapshot.stopOnFailure,
        startedAt: snapshot.startedAt,
        updatedAt: Date.now(),
        status: "cancelled",
        items: snapshot.items,
      }).catch((error) => {
        logBatchPersistenceFailure(batchId, error)
      })
    }
    activeBatchSnapshots.delete(batchId)
    return true
  }
  return false
}

export function getActiveBatchSnapshot(
  batchId: string,
): ActiveBatchSnapshot | null {
  const snapshot = activeBatchSnapshots.get(batchId)
  if (!snapshot) return null
  return {
    ...snapshot,
    items: snapshot.items.map((item) => ({ ...item })),
  }
}
