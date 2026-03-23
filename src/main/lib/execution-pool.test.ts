import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("execution-pool", () => {
  let originalLimit: string | undefined
  let originalWaitTimeout: string | undefined

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    originalLimit = process.env.C8C_EXECUTION_POOL_LIMIT
    originalWaitTimeout = process.env.C8C_EXECUTION_POOL_WAIT_TIMEOUT_MS
  })

  afterEach(() => {
    process.env.C8C_EXECUTION_POOL_LIMIT = originalLimit
    process.env.C8C_EXECUTION_POOL_WAIT_TIMEOUT_MS = originalWaitTimeout
    vi.useRealTimers()
  })

  it("rejects queued waiters after the pool wait timeout and removes them from the queue", async () => {
    process.env.C8C_EXECUTION_POOL_LIMIT = "1"
    process.env.C8C_EXECUTION_POOL_WAIT_TIMEOUT_MS = "25"

    const { acquireExecutionSlot, getExecutionPoolSnapshot } =
      await import("./execution-pool")

    const firstTicket = await acquireExecutionSlot()
    const queuedTicket = acquireExecutionSlot()
    const queuedRejection = expect(queuedTicket).rejects.toThrow(
      "Timed out waiting for an execution slot after 25ms",
    )

    expect(getExecutionPoolSnapshot()).toEqual({
      limit: 1,
      active: 1,
      queued: 1,
    })

    await vi.advanceTimersByTimeAsync(25)
    await queuedRejection

    expect(getExecutionPoolSnapshot()).toEqual({
      limit: 1,
      active: 1,
      queued: 0,
    })

    firstTicket.release()
  })

  it("hands the next waiter a slot when one frees up before the timeout", async () => {
    process.env.C8C_EXECUTION_POOL_LIMIT = "1"
    process.env.C8C_EXECUTION_POOL_WAIT_TIMEOUT_MS = "25"

    const { acquireExecutionSlot, getExecutionPoolSnapshot } =
      await import("./execution-pool")

    const firstTicket = await acquireExecutionSlot()
    const secondTicketPromise = acquireExecutionSlot()
    await vi.advanceTimersByTimeAsync(10)
    firstTicket.release()

    const secondTicket = await secondTicketPromise
    expect(secondTicket.queueWaitMs).toBeGreaterThanOrEqual(10)
    expect(getExecutionPoolSnapshot()).toEqual({
      limit: 1,
      active: 1,
      queued: 0,
    })

    secondTicket.release()
  })
})
