import { classifyError } from "./observability.js"
import { getOutgoingEdges } from "./graph-engine.js"
import type {
  ErrorKind,
  LogEntry,
  NodeInput,
  NodeOnErrorPolicy,
  NodeRetryBackoff,
  NodeRuntimeConfig,
  NodeState,
  WorkflowEvent,
  WorkflowNode,
} from "../schema.js"
import type { RuntimeWorkflow } from "./runtime-graph.js"
import type { NodeLifecycleEffect } from "./run-lifecycle.js"
import { buildContinueOutput, buildErrorEnvelopeOutput, writeNodeOutputFile } from "./run-output.js"
import { hasPartialSkillProgress, isMaxTurnsErrorText } from "./run-provider-execution.js"

export interface ResolvedRetryPolicy {
  enabled: boolean
  maxTries: number
  waitMs: number
  backoff: NodeRetryBackoff
  retryOn: Set<ErrorKind>
}

export interface ResolvedRuntimePolicy {
  onError: NodeOnErrorPolicy
  retry: ResolvedRetryPolicy
}

interface FailureLogger {
  warn?(component: string, event: string, context?: Record<string, unknown>): void
}

interface FailureContext {
  runId: string
  node: WorkflowNode
  state: NodeState
  incomingContent: string
  runtimePolicy: ResolvedRuntimePolicy
  runtimeWorkflow: RuntimeWorkflow
  activatedEdges: Set<string>
  error: unknown
  recoverOutputOnError?: () => Promise<NodeInput | undefined>
  logger: FailureLogger
  emitEvent: (event: WorkflowEvent) => Promise<void>
  retryNode: (nodeId: string) => Promise<NodeLifecycleEffect | void>
  sleep?: (ms: number) => Promise<void>
  workspace: string
}

const RETRYABLE_ERROR_KINDS: ErrorKind[] = ["tool", "model", "timeout", "unknown", "policy", "network"]

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getNodeRuntimeConfig(node: WorkflowNode): NodeRuntimeConfig | undefined {
  const config = node.config as { runtime?: NodeRuntimeConfig }
  return config.runtime
}

export function resolveRuntimePolicy(node: WorkflowNode, isRuntimeClone?: boolean): ResolvedRuntimePolicy {
  const runtime = getNodeRuntimeConfig(node)
  const retry = runtime?.retry
  const configuredRetryOn = retry?.retryOn?.filter(Boolean)
  const defaultOnError = isRuntimeClone ? "continue" : "stop"
  return {
    onError: runtime?.execution?.onError || defaultOnError,
    retry: {
      enabled: Boolean(retry?.enabled),
      maxTries: Math.max(1, Math.floor(retry?.maxTries ?? 1)),
      waitMs: Math.max(0, Math.floor(retry?.waitMs ?? 0)),
      backoff: retry?.backoff || "none",
      retryOn: new Set(configuredRetryOn && configuredRetryOn.length > 0 ? configuredRetryOn : RETRYABLE_ERROR_KINDS),
    },
  }
}

export function computeRetryDelayMs(policy: ResolvedRetryPolicy, retriesUsed: number): number {
  const base = Math.max(0, policy.waitMs)
  if (base === 0) return 0
  if (policy.backoff === "linear") return base * Math.max(1, retriesUsed)
  if (policy.backoff === "exponential") return base * (2 ** Math.max(0, retriesUsed - 1))
  return base
}

async function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function isTimedOutError(text: string): boolean {
  return text.includes("timed out")
    || text.includes("ETIMEDOUT")
    || text.includes("timeout")
}

export async function handleNodeExecutionFailure(
  context: FailureContext,
): Promise<NodeLifecycleEffect | void> {
  const {
    runId,
    node,
    state,
    incomingContent,
    runtimePolicy,
    runtimeWorkflow,
    error,
    recoverOutputOnError,
    logger,
    emitEvent,
    retryNode,
    workspace,
  } = context

  let partialOutput: NodeInput | undefined
  if (recoverOutputOnError) {
    try {
      partialOutput = await recoverOutputOnError()
    } catch (recoveryError) {
      logger.warn?.("workflow-runner", "recover_partial_output_failed", {
        nodeId: node.id,
        error: errorMessage(recoveryError),
      })
    }
  }

  const errorText = String(error)
  state.completedAt = Date.now()
  state.error = errorText
  state.errorKind = classifyError(error, isTimedOutError(errorText))

  if (
    node.type === "skill"
    && isMaxTurnsErrorText(errorText)
    && hasPartialSkillProgress(state.log, partialOutput)
  ) {
    const output = buildContinueOutput(node, incomingContent, partialOutput)
    const recoveryLog: LogEntry = {
      type: "text",
      content: "[runtime-recovery] max turns reached after partial progress; continuing with recovered output\n",
      timestamp: Date.now(),
    }
    state.log.push(recoveryLog)
    await emitEvent({ type: "node-log", runId, nodeId: node.id, entry: recoveryLog })

    state.status = "completed"
    state.error = undefined
    state.errorKind = undefined
    state.policyApplied = "continue"
    state.output = output
    await writeNodeOutputFile(workspace, node.id, output.content)
    for (const edge of getOutgoingEdges(runtimeWorkflow, node.id)) {
      context.activatedEdges.add(edge.id)
    }
    await emitEvent({ type: "node-done", runId, nodeId: node.id, output })
    return
  }

  const canRetry = runtimePolicy.retry.enabled
    && state.retriesUsed! < runtimePolicy.retry.maxTries - 1
    && runtimePolicy.retry.retryOn.has(state.errorKind)
  if (canRetry) {
    state.retriesUsed = (state.retriesUsed || 0) + 1
    const retryDelayMs = computeRetryDelayMs(runtimePolicy.retry, state.retriesUsed)
    const retryErrorKind = state.errorKind
    state.status = "pending"
    state.error = undefined
    state.errorKind = undefined
    state.completedAt = undefined
    const retryLog: LogEntry = {
      type: "text",
      content: `[runtime-retry] attempt ${state.retriesUsed + 1}/${runtimePolicy.retry.maxTries} in ${retryDelayMs}ms after ${retryErrorKind} error\n`,
      timestamp: Date.now(),
    }
    state.log.push(retryLog)
    await emitEvent({ type: "node-log", runId, nodeId: node.id, entry: retryLog })
    state.attempts = Math.max(0, state.attempts - 1)
    await (context.sleep || defaultSleep)(retryDelayMs)
    return retryNode(node.id)
  }

  const onError = runtimePolicy.onError
  state.policyApplied = onError

  if (onError === "stop") {
    state.status = "failed"
    state.output = partialOutput
    if (partialOutput) {
      try {
        await writeNodeOutputFile(workspace, node.id, partialOutput.content)
      } catch (writeError) {
        logger.warn?.("workflow-runner", "persist_partial_output_failed", {
          nodeId: node.id,
          error: errorMessage(writeError),
        })
      }
      await emitEvent({ type: "node-done", runId, nodeId: node.id, output: partialOutput })
    }
    await emitEvent({ type: "node-error", runId, nodeId: node.id, error: errorText })
    return
  }

  const output = onError === "continue_error_output"
    ? buildErrorEnvelopeOutput(node, incomingContent, partialOutput, state.errorKind, errorText, state.attempts)
    : buildContinueOutput(node, incomingContent, partialOutput)

  state.status = "completed"
  state.output = output
  try {
    await writeNodeOutputFile(workspace, node.id, output.content)
  } catch (writeError) {
    logger.warn?.("workflow-runner", "persist_policy_output_failed", {
      nodeId: node.id,
      error: errorMessage(writeError),
    })
  }

  for (const edge of getOutgoingEdges(runtimeWorkflow, node.id)) {
    context.activatedEdges.add(edge.id)
  }
  await emitEvent({ type: "node-done", runId, nodeId: node.id, output })
  await emitEvent({ type: "node-error", runId, nodeId: node.id, error: errorText })
}
