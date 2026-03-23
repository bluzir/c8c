import { describe, expect, it } from "vitest"
import type { BatchItemResult, BatchSummary } from "@shared/types"
import {
  mergeBatchItems,
  resolveBatchDoneState,
  summarizeBatchItems,
} from "./useBatchExecution"

function createBatchSummary(
  overrides: Partial<BatchSummary> = {},
): BatchSummary {
  return {
    total: 3,
    processed: 1,
    passed: 1,
    failed: 0,
    cancelled: 2,
    mean_cost_usd: 0.12,
    mean_duration_ms: 1200,
    pass_rate: 1,
    ...overrides,
  }
}

function createBatchItem(
  overrides: Partial<BatchItemResult> = {},
): BatchItemResult {
  return {
    input_index: 0,
    run_id: "run-1",
    status: "completed",
    eval_scores: {},
    cost_usd: 0.12,
    duration_ms: 1200,
    output: "done",
    ...overrides,
  }
}

describe("useBatchExecution helpers", () => {
  it("summarizes cancelled runs from preserved items", () => {
    const summary = summarizeBatchItems(
      [
        createBatchItem(),
        createBatchItem({
          input_index: 1,
          run_id: "run-2",
          status: "cancelled",
          output: undefined,
        }),
      ],
      3,
    )

    expect(summary).toEqual({
      total: 3,
      processed: 2,
      passed: 1,
      failed: 0,
      cancelled: 2,
      mean_cost_usd: 0.12,
      mean_duration_ms: 1200,
      pass_rate: 0.5,
    })
  })

  it("keeps completed items and recomputes summary for cancelled preserve-existing reruns", () => {
    const previousItems = [
      createBatchItem({
        input_index: 0,
        run_id: "run-prev",
        status: "completed",
        output: "existing result",
      }),
    ]
    const incomingItems = [
      createBatchItem({
        input_index: 2,
        run_id: "run-new",
        status: "cancelled",
        cost_usd: 0,
        duration_ms: 0,
        output: undefined,
      }),
    ]

    const resolved = resolveBatchDoneState(
      previousItems,
      incomingItems,
      createBatchSummary(),
      { completed: 1, total: 3, running: 1 },
      {
        preserveExistingItems: true,
        totalInputsOverride: 3,
      },
    )

    expect(resolved.items).toEqual(
      mergeBatchItems(previousItems, incomingItems),
    )
    expect(resolved.summary).toEqual({
      total: 3,
      processed: 2,
      passed: 1,
      failed: 0,
      cancelled: 2,
      mean_cost_usd: 0.06,
      mean_duration_ms: 600,
      pass_rate: 0.5,
    })
    expect(resolved.progress).toEqual({
      completed: 2,
      total: 3,
      running: 0,
    })
    expect(resolved.notification).toEqual({
      title: "Batch run cancelled",
      description: "2/3 processed · 0 failed · 2 cancelled",
      level: "warning",
    })
  })
})
