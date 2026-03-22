import type {
  AgentExecutionBackend,
  AgentExecutionEvent,
  AgentExecutionHandle,
  AgentExecutionSummary,
  AgentRunOptions,
  AgentRunResult,
  ProviderId,
} from "@shared/types"
import { LogParser } from "./log-parser"

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class AsyncEventQueue<T> implements AsyncIterable<T> {
  private items: T[] = []
  private resolvers: Array<(result: IteratorResult<T>) => void> = []
  private closed = false

  push(item: T): void {
    if (this.closed) return
    const resolver = this.resolvers.shift()
    if (resolver) {
      resolver({ value: item, done: false })
      return
    }
    this.items.push(item)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    while (this.resolvers.length > 0) {
      const resolver = this.resolvers.shift()
      resolver?.({ value: undefined as T, done: true })
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.items.length > 0) {
          return Promise.resolve({ value: this.items.shift() as T, done: false })
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as T, done: true })
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolvers.push(resolve)
        })
      },
    }
  }
}

export interface ExecutionEventSinks {
  onStart?: () => void
  onSpawn?: (pid: number) => void
  onProviderSession?: (sessionId: string) => void
  onLogEntry?: (event: Extract<AgentExecutionEvent, { type: "log-entry" }>["entry"]) => void
  onUsage?: (usage: Extract<AgentExecutionEvent, { type: "usage" }>["usage"]) => void
  onStderr?: (text: string) => void
  onError?: (text: string) => void
  onFinish?: (summary: AgentExecutionSummary) => void
}

function emitUsageIfChanged(
  parser: LogParser,
  queue: AsyncEventQueue<AgentExecutionEvent>,
  lastUsage: { inputTokens: number; outputTokens: number },
): void {
  const usage = parser.usage
  const nextUsage = {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
  }
  if (
    nextUsage.inputTokens === lastUsage.inputTokens
    && nextUsage.outputTokens === lastUsage.outputTokens
  ) {
    return
  }

  lastUsage.inputTokens = nextUsage.inputTokens
  lastUsage.outputTokens = nextUsage.outputTokens
  queue.push({ type: "usage", usage: nextUsage })
}

function buildErrorSummary(
  backend: AgentExecutionBackend,
  pid: number | undefined,
  startedAt: number,
  aborted: boolean,
  error: unknown,
): AgentExecutionSummary {
  return {
    success: false,
    exitCode: null,
    signal: null,
    killed: false,
    aborted,
    durationMs: Date.now() - startedAt,
    pid,
    error: errorMessage(error),
    providerSessionId: null,
    backend,
  }
}

function withMergedAbortSignal(
  externalSignal?: AbortSignal,
): {
  signal: AbortSignal
  abort: () => void
  cleanup: () => void
} {
  const controller = new AbortController()
  let cleanup = () => {}
  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort()
    }
  }

  if (externalSignal) {
    if (externalSignal.aborted) {
      abort()
    } else {
      externalSignal.addEventListener("abort", abort, { once: true })
      cleanup = () => {
        externalSignal.removeEventListener("abort", abort)
      }
    }
  }

  return {
    signal: controller.signal,
    abort,
    cleanup,
  }
}

export function createLegacyExecutionHandle(
  provider: ProviderId,
  backend: AgentExecutionBackend,
  options: AgentRunOptions,
  runner: (options: AgentRunOptions) => Promise<AgentRunResult>,
): AgentExecutionHandle {
  const queue = new AsyncEventQueue<AgentExecutionEvent>()
  const parser = new LogParser()
  const lastUsage = { inputTokens: 0, outputTokens: 0 }
  const startedAt = Date.now()
  const mergedAbort = withMergedAbortSignal(options.abortSignal)
  let spawnedPid: number | undefined

  queue.push({ type: "start" })

  const done = runner({
    ...options,
    abortSignal: mergedAbort.signal,
    onSpawn: (pid: number) => {
      spawnedPid = pid
      options.onSpawn?.(pid)
      queue.push({ type: "spawn", pid })
    },
    onStdout: (data: Buffer) => {
      options.onStdout?.(data)
      const entries = parser.feedChunk(data.toString())
      for (const entry of entries) {
        queue.push({ type: "log-entry", entry })
      }
      emitUsageIfChanged(parser, queue, lastUsage)
    },
    onStderr: (data: Buffer) => {
      options.onStderr?.(data)
      queue.push({ type: "stderr", text: data.toString() })
    },
  }).then((result) => {
    const remaining = parser.flush()
    for (const entry of remaining) {
      queue.push({ type: "log-entry", entry })
    }
    emitUsageIfChanged(parser, queue, lastUsage)

    const summary: AgentExecutionSummary = {
      ...result,
      pid: spawnedPid ?? result.pid,
      error: null,
      providerSessionId: null,
      backend,
    }
    queue.push({ type: "finish", summary })
    queue.close()
    mergedAbort.cleanup()
    return summary
  }).catch((error) => {
    const remaining = parser.flush()
    for (const entry of remaining) {
      queue.push({ type: "log-entry", entry })
    }
    emitUsageIfChanged(parser, queue, lastUsage)

    const summary = buildErrorSummary(
      backend,
      spawnedPid,
      startedAt,
      mergedAbort.signal.aborted,
      error,
    )
    queue.push({ type: "error", text: summary.error || "Execution failed." })
    queue.push({ type: "finish", summary })
    queue.close()
    mergedAbort.cleanup()
    return summary
  })

  return {
    provider,
    backend,
    events: queue,
    abort: mergedAbort.abort,
    done,
  }
}

export function createErroredExecutionHandle(
  provider: ProviderId,
  backend: AgentExecutionBackend,
  message: string,
): AgentExecutionHandle {
  const queue = new AsyncEventQueue<AgentExecutionEvent>()
  const startedAt = Date.now()

  queue.push({ type: "start" })
  queue.push({ type: "error", text: message })

  const summary: AgentExecutionSummary = {
    success: false,
    exitCode: null,
    signal: null,
    killed: false,
    aborted: false,
    durationMs: Date.now() - startedAt,
    pid: undefined,
    error: message,
    providerSessionId: null,
    backend,
  }

  queue.push({ type: "finish", summary })
  queue.close()

  return {
    provider,
    backend,
    events: queue,
    abort: () => {},
    done: Promise.resolve(summary),
  }
}

export async function drainExecutionHandle(
  handle: AgentExecutionHandle,
  sinks: ExecutionEventSinks = {},
): Promise<AgentExecutionSummary> {
  const consumeEvents = (async () => {
    for await (const event of handle.events) {
      switch (event.type) {
        case "start":
          sinks.onStart?.()
          break
        case "spawn":
          sinks.onSpawn?.(event.pid)
          break
        case "provider-session":
          sinks.onProviderSession?.(event.sessionId)
          break
        case "log-entry":
          sinks.onLogEntry?.(event.entry)
          break
        case "usage":
          sinks.onUsage?.(event.usage)
          break
        case "stderr":
          sinks.onStderr?.(event.text)
          break
        case "error":
          sinks.onError?.(event.text)
          break
        case "finish":
          sinks.onFinish?.(event.summary)
          break
      }
    }
  })()

  const summary = await handle.done
  await consumeEvents
  return summary
}
