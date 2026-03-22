const DEFAULT_EXECUTION_POOL_LIMIT = 8
const DEFAULT_EXECUTION_POOL_WAIT_TIMEOUT_MS = 30 * 60 * 1000

interface PoolWaiter {
  resolve: (ticket: ExecutionPoolTicket) => void
  reject: (error: Error) => void
  enqueuedAt: number
  timeoutHandle?: ReturnType<typeof setTimeout>
}

export interface ExecutionPoolTicket {
  queueWaitMs: number
  release: () => void
}

let activeCount = 0
const queue: PoolWaiter[] = []

function executionPoolLimit(): number {
  const raw = Number(process.env.C8C_EXECUTION_POOL_LIMIT)
  if (Number.isFinite(raw) && raw >= 1) {
    return Math.max(1, Math.floor(raw))
  }
  return DEFAULT_EXECUTION_POOL_LIMIT
}

function executionPoolWaitTimeoutMs(): number {
  const raw = Number(process.env.C8C_EXECUTION_POOL_WAIT_TIMEOUT_MS)
  if (Number.isFinite(raw) && raw >= 1) {
    return Math.max(1, Math.floor(raw))
  }
  return DEFAULT_EXECUTION_POOL_WAIT_TIMEOUT_MS
}

function createTicket(enqueuedAt: number): ExecutionPoolTicket {
  let released = false
  return {
    queueWaitMs: Math.max(0, Date.now() - enqueuedAt),
    release: () => {
      if (released) return
      released = true
      activeCount = Math.max(0, activeCount - 1)
      const next = queue.shift()
      if (!next) return
      if (next.timeoutHandle) {
        clearTimeout(next.timeoutHandle)
      }
      activeCount += 1
      next.resolve(createTicket(next.enqueuedAt))
    },
  }
}

export async function acquireExecutionSlot(): Promise<ExecutionPoolTicket> {
  const enqueuedAt = Date.now()
  if (activeCount < executionPoolLimit()) {
    activeCount += 1
    return createTicket(enqueuedAt)
  }

  return new Promise<ExecutionPoolTicket>((resolve, reject) => {
    const waiter: PoolWaiter = {
      resolve,
      reject,
      enqueuedAt,
    }
    waiter.timeoutHandle = setTimeout(() => {
      const index = queue.indexOf(waiter)
      if (index >= 0) {
        queue.splice(index, 1)
      }
      waiter.reject(new Error(`Timed out waiting for an execution slot after ${executionPoolWaitTimeoutMs()}ms`))
    }, executionPoolWaitTimeoutMs())
    queue.push(waiter)
  })
}

export async function withExecutionSlot<T>(
  task: (ticket: ExecutionPoolTicket) => Promise<T>,
): Promise<T> {
  const ticket = await acquireExecutionSlot()
  try {
    return await task(ticket)
  } finally {
    ticket.release()
  }
}

export function getExecutionPoolSnapshot(): { limit: number; active: number; queued: number } {
  return {
    limit: executionPoolLimit(),
    active: activeCount,
    queued: queue.length,
  }
}
