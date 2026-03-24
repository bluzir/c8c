import { mkdtemp, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { checkOutputHeuristics } from "./lib/output-heuristics.js"
import { getOutgoingEdges } from "./lib/graph-engine.js"
import {
  buildNodeMeta,
  collectMetrics,
  estimateCost,
} from "./lib/observability.js"
import {
  resolveNodeProvider,
  resolveWorkflowProvider,
} from "./provider-metadata.js"
import {
  createRunInterruptRegistry,
  persistResolvedApproval,
} from "./lib/run-interrupts.js"
import {
  finalizeRunPidManifest,
  initRunPidManifest,
} from "./lib/run-pid-manifest.js"
import { persistProjectImprovementEvidence } from "./lib/improvement-store.js"
import {
  persistRunState,
  readWorkflowRunSnapshot,
  type PersistedRunManifest,
  type WorkflowRunSnapshot,
  writeManifest,
  writeRunResultSnapshot,
  appendEventLog,
} from "./lib/run-state-store.js"
import {
  appendPersistedEvalResult,
  clonePersistedEvalResults,
} from "./lib/persisted-run-state.js"
import {
  createResumeExecutionSession,
  createRerunExecutionSession,
  createStartExecutionSession,
  type WorkflowExecutionSession,
} from "./lib/run-session.js"
import {
  deriveRunStatus,
  runExecutionLoop,
  skipUnfinishedNodes,
  type NodeLifecycleEffect,
} from "./lib/run-lifecycle.js"
import {
  handleNodeExecutionFailure,
  resolveRuntimePolicy,
} from "./lib/run-node-failure.js"
import { executeNodeByType } from "./lib/run-node-executors.js"
import { getRecoverOutputOnError } from "./lib/run-node-executors.js"
import { writeFileAtomic } from "./lib/atomic-write.js"
import {
  buildContinueOutput,
  buildErrorEnvelopeOutput,
  buildSkillNodeOutput,
  collectUpstreamIds,
  createAgentNodeOutput,
  createNodeOutput,
  getClaudeResumeSessionId,
  normalizedSkillRef,
  pickPassThroughMetadata,
  sanitizeInvalidUnicode,
  sanitizeNodeId,
  selectIncomingInput,
  writeNodeOutputFile,
} from "./lib/run-output.js"
import {
  buildAgentFailureDetail,
  hasPartialSkillProgress,
  runGitCommand,
  spawnProviderTracked,
} from "./lib/run-provider-execution.js"
import { createSkillContextResolver } from "./lib/run-skill-context.js"
import { cleanupRunWorkspaces } from "./lib/run-workspace-retention.js"
import { getWorkflowHilTask, humanTaskId } from "./hil-store.js"
import { getDefaultModelForProvider } from "./provider-metadata.js"
import type {
  AgentExecutionHandle,
  AgentRunOptions,
  DiscoveredSkill,
  HumanNodeConfig,
  HumanTaskRequest,
  LogEntry,
  NodeInput,
  NodeState,
  ProviderId,
  RunStatus,
  SkillNodeConfig,
  Workflow,
  WorkflowEvent,
  WorkflowInput,
  WorkflowNode,
} from "./schema.js"

export { writeWorkflowApprovalDecision } from "./lib/run-interrupts.js"
export type {
  PersistedRunManifest,
  WorkflowRunSnapshot,
} from "./lib/run-state-store.js"

export type WebSearchBackend = "builtin" | "exa"
export type ApprovalBehavior = "wait" | "suspend"

export interface WorkflowWorkspaceStore {
  createRunWorkspace(runId: string, projectPath?: string): Promise<string>
}

export interface WorkflowLogger {
  info?(
    component: string,
    event: string,
    context?: Record<string, unknown>,
  ): void
  warn(
    component: string,
    event: string,
    context?: Record<string, unknown>,
  ): void
}

export interface WorkflowTelemetrySink {
  track(event: string, payload: Record<string, unknown>): void | Promise<void>
}

export interface WorkflowRunnerDeps {
  startProviderTask(
    providerId: ProviderId,
    options: AgentRunOptions,
  ): Promise<AgentExecutionHandle>
  resolveWorkflowProviderId?(workflow: Workflow): Promise<ProviderId>
  resolveNodeProviderId?(
    node: WorkflowNode,
    workflow: Workflow,
  ): Promise<ProviderId>
  prepareWorkspaceMcpConfig?(
    workspace: string,
    projectPath?: string,
    webSearchBackend?: WebSearchBackend,
  ): Promise<string | undefined>
  scanSkills?(scanRoot: string): Promise<DiscoveredSkill[]>
  workspaceStore?: WorkflowWorkspaceStore
  logger?: WorkflowLogger
  telemetry?: WorkflowTelemetrySink
}

export interface WorkflowRunSummary {
  runId: string
  status: RunStatus
  workspace: string
  reportPath?: string
  totalCost: number
  totalTokensIn: number
  totalTokensOut: number
  evalScores: Record<string, number>
  durationMs: number
}

export interface StartWorkflowRunRequest {
  runId?: string
  workflow: Workflow
  input: WorkflowInput
  projectPath?: string
  workflowPath?: string
  webSearchBackend?: WebSearchBackend
  approvalBehavior?: ApprovalBehavior
}

export interface ResumeWorkflowRunRequest {
  runId?: string
  workflow: Workflow
  workspace: string
  projectPath?: string
  workflowPath?: string
  webSearchBackend?: WebSearchBackend
  approvalBehavior?: ApprovalBehavior
}

export interface RerunFromNodeRequest extends ResumeWorkflowRunRequest {
  fromNodeId: string
}

export interface ApprovalDecision {
  runId: string
  nodeId: string
  approved: boolean
  editedContent?: string
  workspace?: string
}

export interface WorkflowRunHandle {
  runId: string
  workspace: string
  events: AsyncIterable<WorkflowEvent>
  result: Promise<WorkflowRunSummary>
  cancel(reason?: string): void
  pause(): boolean
  resume(): boolean
}

export interface EvalOverrideDecision {
  runId: string
  nodeId: string
}

export interface WorkflowRunner {
  startRun(request: StartWorkflowRunRequest): Promise<WorkflowRunHandle>
  resumeRun(request: ResumeWorkflowRunRequest): Promise<WorkflowRunHandle>
  rerunFromNode(request: RerunFromNodeRequest): Promise<WorkflowRunHandle>
  resolveApproval(decision: ApprovalDecision): Promise<boolean>
  resolveEvalOverride(decision: EvalOverrideDecision): Promise<boolean>
  getSnapshot(runId: string): Promise<WorkflowRunSnapshot | null>
}

interface WorkflowRuntimeContext {
  emitEvent: (event: WorkflowEvent) => Promise<void>
  controller: AbortController
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
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
      this.resolvers.shift()?.({ value: undefined as T, done: true })
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.items.length > 0) {
          return Promise.resolve({
            value: this.items.shift() as T,
            done: false,
          })
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

function createDefaultLogger(): WorkflowLogger {
  return {
    info(component: string, event: string, context?: Record<string, unknown>) {
      const payload = {
        ts: new Date().toISOString(),
        level: "info",
        component,
        event,
        ...(context || {}),
      }
      console.log(JSON.stringify(payload))
    },
    warn(component: string, event: string, context?: Record<string, unknown>) {
      const payload = {
        ts: new Date().toISOString(),
        level: "warn",
        component,
        event,
        ...(context || {}),
      }
      console.warn(JSON.stringify(payload))
    },
  }
}

export function createFilesystemWorkspaceStore(
  activeWorkspacePaths?: () => ReadonlySet<string>,
): WorkflowWorkspaceStore {
  const retentionSweeps = new Map<string, Promise<void>>()

  return {
    async createRunWorkspace(
      runId: string,
      projectPath?: string,
    ): Promise<string> {
      const workspaceBase = projectPath
        ? join(projectPath, ".c8c", "runs")
        : join(tmpdir(), "c8c-ws")
      await mkdir(workspaceBase, { recursive: true })
      const existingSweep = retentionSweeps.get(workspaceBase)
      if (existingSweep) {
        await existingSweep
      } else {
        const sweep = cleanupRunWorkspaces(
          workspaceBase,
          undefined,
          undefined,
          activeWorkspacePaths?.() ?? new Set(),
        ).then(
          () => undefined,
          () => undefined,
        )
        retentionSweeps.set(workspaceBase, sweep)
        await sweep
        if (retentionSweeps.get(workspaceBase) === sweep) {
          retentionSweeps.delete(workspaceBase)
        }
      }
      return mkdtemp(join(workspaceBase, `${runId}-`))
    },
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function makeRunId(prefix: string): string {
  return `${prefix}-${Date.now()}`
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isHumanTaskRequest(value: unknown): value is HumanTaskRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false
  const candidate = value as Partial<HumanTaskRequest>
  return (
    candidate.version === 1 &&
    (candidate.kind === "form" || candidate.kind === "approval") &&
    typeof candidate.title === "string" &&
    Array.isArray(candidate.fields)
  )
}

function buildStaticApprovalHumanTaskRequest(
  nodeId: string,
  config: HumanNodeConfig,
  incomingContent: string,
): HumanTaskRequest {
  const instructions =
    typeof config.staticRequest?.instructions === "string"
      ? config.staticRequest.instructions
      : undefined
  const title = config.staticRequest?.title || `Review ${nodeId}`
  return {
    version: 1,
    kind: "approval",
    title,
    instructions,
    summary: config.staticRequest?.summary,
    fields: [
      {
        id: "approved",
        type: "boolean",
        label: "Approve and continue",
        required: true,
      },
      ...(config.staticRequest?.metadata?.allowEdit
        ? [
            {
              id: "editedContent",
              type: "textarea" as const,
              label: "Edited content",
              description: "Optional edits to use when continuing this flow.",
            },
          ]
        : []),
    ],
    defaults: {
      approved: true,
      ...(config.staticRequest?.metadata?.allowEdit
        ? { editedContent: incomingContent }
        : {}),
    },
    metadata: {
      ...config.staticRequest?.metadata,
      generatedByNodeId: nodeId,
    },
  }
}

function buildHumanTaskRequest(
  node: WorkflowNode,
  config: HumanNodeConfig,
  incomingContent: string,
): HumanTaskRequest {
  if (config.requestSource === "static") {
    if (config.mode === "approval") {
      return buildStaticApprovalHumanTaskRequest(
        node.id,
        config,
        incomingContent,
      )
    }
    if (!config.staticRequest) {
      throw new Error(
        `Human node ${node.id} requires staticRequest when requestSource=static`,
      )
    }
    if (!isHumanTaskRequest(config.staticRequest)) {
      throw new Error(`Human node ${node.id} has invalid staticRequest`)
    }
    return {
      ...config.staticRequest,
      metadata: {
        ...config.staticRequest.metadata,
        generatedByNodeId:
          config.staticRequest.metadata?.generatedByNodeId || node.id,
      },
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(incomingContent)
  } catch {
    throw new Error(
      `Human node ${node.id} requires valid upstream JSON request`,
    )
  }
  if (!isHumanTaskRequest(parsed)) {
    throw new Error(
      `Human node ${node.id} upstream JSON is not a valid HumanTaskRequest`,
    )
  }
  return {
    ...parsed,
    metadata: {
      ...parsed.metadata,
      generatedByNodeId: parsed.metadata?.generatedByNodeId || node.id,
    },
  }
}

async function readHumanTaskResponse(
  workspace: string,
  nodeId: string,
): Promise<{
  taskId: string
  resolution: "submitted" | "rejected" | "timed_out"
  answers: Record<string, unknown>
} | null> {
  const record = await getWorkflowHilTask(workspace, humanTaskId(nodeId))
  if (!record?.latestResponse) return null
  const { latestResponse } = record
  if (
    latestResponse.resolution !== "submitted" &&
    latestResponse.resolution !== "rejected" &&
    latestResponse.resolution !== "timed_out"
  ) {
    return null
  }
  return {
    taskId: record.taskId,
    resolution: latestResponse.resolution,
    answers: latestResponse.answers,
  }
}

export function createWorkflowRunner(deps: WorkflowRunnerDeps): WorkflowRunner {
  const logger = deps.logger || createDefaultLogger()
  const activeRuns = new Map<string, AbortController>()
  const pausedRuns = new Map<
    string,
    { paused: boolean; resume: (() => void) | null }
  >()
  const interrupts = createRunInterruptRegistry()
  const runWorkspaces = new Map<string, string>()
  const workspaceStore =
    deps.workspaceStore ||
    createFilesystemWorkspaceStore(() => new Set(runWorkspaces.values()))

  const resolveWorkflowProviderId =
    deps.resolveWorkflowProviderId ||
    (async (workflow: Workflow) => resolveWorkflowProvider(workflow, "claude"))
  const resolveNodeProviderId =
    deps.resolveNodeProviderId ||
    (async (node: WorkflowNode, workflow: Workflow) =>
      resolveNodeProvider(
        node,
        workflow,
        await resolveWorkflowProviderId(workflow),
      ))

  function pauseRun(runId: string): boolean {
    const state = pausedRuns.get(runId)
    if (!state) return false
    if (state.paused) return true
    state.paused = true
    return true
  }

  function resumeRunInternal(runId: string): boolean {
    const state = pausedRuns.get(runId)
    if (!state) return false
    if (!state.paused) return true
    state.paused = false
    if (state.resume) {
      state.resume()
      state.resume = null
    }
    return true
  }

  function waitIfPaused(runId: string, signal: AbortSignal): Promise<void> {
    const state = pausedRuns.get(runId)
    if (!state || !state.paused || signal.aborted) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const finish = () => {
        signal.removeEventListener("abort", onAbort)
        resolve()
      }
      state.resume = () => {
        state.resume = null
        finish()
      }
      const onAbort = () => {
        state.resume = null
        finish()
      }
      signal.addEventListener("abort", onAbort, { once: true })
    })
  }

  function serializeLogExcerpt(
    log: LogEntry[] | undefined,
    maxLength = 500,
  ): string {
    if (!Array.isArray(log) || log.length === 0) return ""
    try {
      return JSON.stringify(log.slice(-5)).slice(0, maxLength)
    } catch {
      return String(log.slice(-5)).slice(0, maxLength)
    }
  }

  async function emitEvent(
    queue: AsyncEventQueue<WorkflowEvent>,
    workspace: string,
    event: WorkflowEvent,
  ): Promise<void> {
    queue.push(event)
    try {
      await appendEventLog(workspace, event)
    } catch (error) {
      logger.warn("workflow-runner", "append_event_log_failed", {
        workspace,
        eventType: event.type,
        error: errorMessage(error),
      })
    }
  }

  async function executeWorkflowSession(
    session: WorkflowExecutionSession,
    runtime: WorkflowRuntimeContext,
  ): Promise<WorkflowRunSummary> {
    const {
      runId,
      mode,
      workflow,
      workspace,
      nodeStates,
      projectPath,
      workflowPath,
      webSearchBackend,
      approvalBehavior = "wait",
      activatedEdges,
      chainId,
    } = session

    activeRuns.set(runId, runtime.controller)
    pausedRuns.set(runId, { paused: false, resume: null })
    runWorkspaces.set(runId, workspace)

    let runtimeWorkflow = session.runtimeWorkflow
    const workflowProviderId = await resolveWorkflowProviderId(workflow)
    const startedAt = Date.now()
    const inputContent = sanitizeInvalidUnicode(session.persistedInput.value)
    const evalResults = clonePersistedEvalResults(session.evalResults)
    const persistedInput = {
      ...session.persistedInput,
      value: inputContent,
    }
    const emitRuntimeEvent = async (event: WorkflowEvent): Promise<void> => {
      if (event.type === "eval-result") {
        appendPersistedEvalResult(evalResults, event)
      }
      await runtime.emitEvent(event)
    }
    const runtimeContext: WorkflowRuntimeContext = {
      ...runtime,
      emitEvent: emitRuntimeEvent,
    }

    await mkdir(join(workspace, "reports"), { recursive: true })
    await mkdir(join(workspace, "outputs"), { recursive: true })
    await mkdir(join(workspace, "logs"), { recursive: true })
    await mkdir(join(workspace, "approvals"), { recursive: true })
    await writeFileAtomic(join(workspace, "content.md"), inputContent)
    await writeFileAtomic(
      join(workspace, "input.json"),
      JSON.stringify(persistedInput, null, 2),
    )

    const manifestBase: Omit<PersistedRunManifest, "status" | "updatedAt"> = {
      schemaVersion: 1,
      runId,
      workflowName: workflow.name,
      workflowPath,
      workspace,
      startedAt,
      mode,
      chainId,
    }

    await writeManifest(workspace, {
      ...manifestBase,
      status: "running",
      updatedAt: Date.now(),
    })

    const mcpConfigPath = deps.prepareWorkspaceMcpConfig
      ? await deps.prepareWorkspaceMcpConfig(
          workspace,
          projectPath,
          webSearchBackend,
        )
      : undefined
    const resolveSkillContext = createSkillContextResolver(
      logger,
      workspace,
      projectPath,
      deps.scanSkills,
    )

    await writeRunResultSnapshot(workspace, {
      runId,
      status: "running",
      workflowName: workflow.name,
      workflowPath: workflowPath || "",
      startedAt,
      completedAt: 0,
      reportPath: "",
      workspace,
      totalCost: 0,
      totalTokensIn: 0,
      totalTokensOut: 0,
      evalScores: {},
      durationMs: 0,
    })

    await persistRunState(
      workspace,
      nodeStates,
      runtimeWorkflow,
      persistedInput,
      evalResults,
    )
    await initRunPidManifest(workspace, runId, mode)

    let manifestStatus: RunStatus = "interrupted"
    let blockedByTaskId: string | undefined
    let blockedByNodeId: string | undefined

    try {
      const maxParallel = workflow.defaults?.maxParallel || 8

      const getAccumulatedCost = (): number => {
        let total = 0
        for (const state of Object.values(nodeStates)) {
          if (state.metrics?.cost_usd) total += state.metrics.cost_usd
        }
        return total
      }

      const getAccumulatedTokens = (): number => {
        let total = 0
        for (const state of Object.values(nodeStates)) {
          if (state.metrics)
            total += state.metrics.tokens_in + state.metrics.tokens_out
        }
        return total
      }

      const processNode = async (
        nodeId: string,
      ): Promise<NodeLifecycleEffect | void> => {
        if (runtime.controller.signal.aborted) return
        const node = runtimeWorkflow.nodes.find(
          (candidate) => candidate.id === nodeId,
        )
        if (!node) return
        const isRuntimeClone = Boolean(runtimeWorkflow.runtimeMeta?.[node.id])
        const runtimePolicy = resolveRuntimePolicy(node, isRuntimeClone)
        const state = nodeStates[node.id]
        state.policyApplied = undefined
        state.retriesUsed = state.retriesUsed || 0
        let executionStarted = false
        const beginNodeExecution = async (): Promise<void> => {
          if (executionStarted) return
          executionStarted = true
          state.status = "running"
          state.startedAt = Date.now()
          state.attempts++
          await runtimeContext.emitEvent({
            type: "node-start",
            runId,
            nodeId: node.id,
          })
        }

        if (node.type !== "input" && node.type !== "output") {
          const budgetCost = workflow.defaults?.budget_cost_usd
          const budgetTokens = workflow.defaults?.budget_tokens
          if (budgetCost != null && getAccumulatedCost() >= budgetCost) {
            state.status = "skipped"
            state.completedAt = Date.now()
            state.errorKind = "policy"
            state.error = `Budget exceeded: $${getAccumulatedCost().toFixed(4)} >= $${budgetCost}`
            await runtimeContext.emitEvent({
              type: "node-error",
              runId,
              nodeId: node.id,
              error: state.error,
            })
            return
          }
          if (budgetTokens != null && getAccumulatedTokens() >= budgetTokens) {
            state.status = "skipped"
            state.completedAt = Date.now()
            state.errorKind = "policy"
            state.error = `Token budget exceeded: ${getAccumulatedTokens()} >= ${budgetTokens}`
            await runtimeContext.emitEvent({
              type: "node-error",
              runId,
              nodeId: node.id,
              error: state.error,
            })
            return
          }
        }

        let recoverOutputOnError:
          | (() => Promise<NodeInput | undefined>)
          | undefined
        let incomingInput: NodeInput | null = null
        let incomingContent = inputContent

        try {
          const incoming = runtimeWorkflow.edges.filter(
            (edge) => edge.target === node.id,
          )
          incomingInput = selectIncomingInput(incoming, nodeStates)
          incomingContent = incomingInput?.content || inputContent

          let output: NodeInput | null = null
          const executionResult = await executeNodeByType({
            runId,
            mode,
            workflow,
            workflowProviderId,
            workspace,
            projectPath,
            workflowPath,
            inputContent,
            persistedInput,
            node,
            state,
            runtimeWorkflow,
            nodeStates,
            activatedEdges,
            incoming,
            incomingInput,
            incomingContent,
            approvalBehavior,
            mcpConfigPath,
            logger,
            runtime: runtimeContext,
            beginNodeExecution,
            persistCheckpoint: () =>
              persistRunState(
                workspace,
                nodeStates,
                runtimeWorkflow,
                persistedInput,
                evalResults,
              ),
            resolveNodeProviderId,
            resolveSkillContext,
            waitForApproval: interrupts.waitForApproval,
            waitForEvalOverride: interrupts.waitForEvalOverride,
            helpers: {
              buildAgentFailureDetail,
              buildContinueOutput,
              buildErrorEnvelopeOutput,
              buildHumanTaskRequest,
              buildNodeMeta,
              buildSkillNodeOutput,
              collectMetrics,
              collectUpstreamIds,
              createAgentNodeOutput,
              createNodeOutput,
              errorMessage,
              estimateCost,
              getClaudeResumeSessionId,
              getDefaultModelForProvider,
              hasPartialSkillProgress,
              normalizedSkillRef,
              pickPassThroughMetadata,
              readHumanTaskResponse,
              runGitCommand,
              sanitizeInvalidUnicode,
              sanitizeNodeId,
              serializeLogExcerpt,
              spawnProviderTracked: (
                providerId,
                options,
                tracking,
                callbacks,
              ) =>
                spawnProviderTracked(
                  deps,
                  providerId,
                  options,
                  tracking,
                  callbacks,
                ),
              writeFileAtomic,
              writeNodeOutputFile,
            },
          })
          if (executionResult.runtimeWorkflow) {
            runtimeWorkflow = executionResult.runtimeWorkflow
          }
          recoverOutputOnError = executionResult.recoverOutputOnError
          if (executionResult.shortCircuit) {
            return executionResult.effect
          }
          output = executionResult.output ?? null

          if (!output) {
            throw new Error(`Node '${node.id}' did not produce output`)
          }

          const completedOutput = output

          state.status = "completed"
          state.completedAt = Date.now()
          state.output = completedOutput

          await writeNodeOutputFile(workspace, node.id, completedOutput.content)
          if (node.type !== "evaluator") {
            for (const edge of getOutgoingEdges(runtimeWorkflow, node.id)) {
              activatedEdges.add(edge.id)
            }
          }

          await runtimeContext.emitEvent({
            type: "node-done",
            runId,
            nodeId: node.id,
            output: completedOutput,
          })

          // Soft heuristic checks on skill node output — non-blocking warnings
          if (node.type === "skill" && completedOutput.content) {
            const heuristicWarnings = checkOutputHeuristics(
              completedOutput.content,
              node.id,
            )
            for (const hw of heuristicWarnings) {
              logger.warn("workflow-runner", "output_heuristic_warning", {
                runId,
                nodeId: node.id,
                kind: hw.kind,
                message: hw.message,
              })
              await runtimeContext.emitEvent({
                type: "node-warning",
                runId,
                nodeId: node.id,
                warning: hw.message,
                warningKind: hw.kind,
              })
            }
          }
        } catch (error) {
          if (runtime.controller.signal.aborted) {
            state.status = "failed"
            return
          }
          const recoverOutputOnFailure =
            recoverOutputOnError ?? getRecoverOutputOnError(error)
          return handleNodeExecutionFailure({
            runId,
            node,
            state,
            incomingContent,
            runtimePolicy,
            runtimeWorkflow,
            activatedEdges,
            error,
            recoverOutputOnError: recoverOutputOnFailure,
            logger,
            emitEvent: runtimeContext.emitEvent,
            retryNode: processNode,
            sleep,
            workspace,
          })
        } finally {
          try {
            await persistRunState(
              workspace,
              nodeStates,
              runtimeWorkflow,
              persistedInput,
              evalResults,
            )
          } catch (error) {
            logger.warn(
              "workflow-runner",
              "persist_run_state_checkpoint_failed",
              {
                runId,
                workspace,
                nodeId: node.id,
                error: errorMessage(error),
              },
            )
          }
        }
      }

      const stallTimeoutMs =
        (workflow.defaults?.timeout_minutes || 30) * 60 * 1000 + 60_000
      const lifecycle = await runExecutionLoop({
        runId,
        controller: runtimeContext.controller,
        nodeStates,
        getRuntimeWorkflow: () => runtimeWorkflow,
        activatedEdges,
        maxParallel,
        stallTimeoutMs,
        waitIfPaused,
        processNode,
        emitEvent: runtimeContext.emitEvent,
        buildSkippedOutput: (nodeId) => {
          const runtimeNode = runtimeWorkflow.nodes.find(
            (candidate) => candidate.id === nodeId,
          )
          return runtimeNode
            ? createNodeOutput(runtimeNode, "", { skipped: true })
            : { content: "", metadata: { source: nodeId, skipped: true } }
        },
        describeStalledNode: (nodeId) => {
          const stalledNode = runtimeWorkflow.nodes.find(
            (candidate) => candidate.id === nodeId,
          )
          if (!stalledNode) return `Node '${nodeId}'`
          const nodeLabel =
            stalledNode.type === "skill"
              ? (stalledNode.config as SkillNodeConfig).skillRef || "skill"
              : stalledNode.type
          return `Node '${nodeLabel}' (${stalledNode.type})`
        },
      })

      blockedByTaskId = lifecycle.blockedByTaskId
      blockedByNodeId = lifecycle.blockedByNodeId

      if (!lifecycle.suspendedForApproval && !lifecycle.blockedForHuman) {
        await skipUnfinishedNodes(
          runId,
          nodeStates,
          runtimeWorkflow,
          runtimeContext.emitEvent,
          (nodeId) => {
            const runtimeNode = runtimeWorkflow.nodes.find(
              (candidate) => candidate.id === nodeId,
            )
            return runtimeNode
              ? createNodeOutput(runtimeNode, "", { skipped: true })
              : { content: "", metadata: { source: nodeId, skipped: true } }
          },
        )
      }

      const finalStatus: RunStatus = deriveRunStatus(
        nodeStates,
        runtimeWorkflow,
        lifecycle,
        runtime.controller.signal.aborted,
      )
      manifestStatus = finalStatus

      let reportPath: string | undefined
      let totalCost = 0
      let totalTokensIn = 0
      let totalTokensOut = 0
      const evalScores: Record<string, number> = {}
      let completedAt = Date.now()
      let durationMs = completedAt - startedAt

      const outputNode = runtimeWorkflow.nodes.find(
        (node) => node.type === "output",
      )
      if (outputNode && nodeStates[outputNode.id]?.output?.content) {
        const outputReport = join(workspace, "report.md")
        await writeFileAtomic(
          outputReport,
          nodeStates[outputNode.id].output!.content,
        )
        reportPath = outputReport
      }

      for (const [nodeId, state] of Object.entries(nodeStates)) {
        if (state.metrics) {
          totalCost += state.metrics.cost_usd
          totalTokensIn += state.metrics.tokens_in
          totalTokensOut += state.metrics.tokens_out
        }
        if (state.output?.metadata?.score != null) {
          evalScores[nodeId] = state.output.metadata.score
        }
      }

      completedAt = Date.now()
      durationMs = completedAt - startedAt

      await writeRunResultSnapshot(workspace, {
        runId,
        status: finalStatus,
        workflowName: workflow.name,
        workflowPath: workflowPath || "",
        startedAt,
        completedAt,
        reportPath: reportPath || "",
        workspace,
        totalCost,
        totalTokensIn,
        totalTokensOut,
        evalScores,
        durationMs,
      })
      await persistRunState(
        workspace,
        nodeStates,
        runtimeWorkflow,
        persistedInput,
        evalResults,
      )
      await writeManifest(workspace, {
        ...manifestBase,
        status: finalStatus,
        updatedAt: Date.now(),
        blockedByTaskId,
        lastBlockingNodeId: blockedByNodeId,
      })

      if (projectPath) {
        try {
          await persistProjectImprovementEvidence({
            projectPath,
            runId,
            chainId,
            workflowName: workflow.name,
            workflowPath,
            workspace,
            status: finalStatus,
            startedAt,
            completedAt,
            durationMs,
            runtimeNodes: runtimeWorkflow.nodes,
            nodeStates,
          })
        } catch (error) {
          logger.warn(
            "workflow-runner",
            "persist_improvement_evidence_failed",
            {
              runId,
              projectPath,
              error: errorMessage(error),
            },
          )
        }
      }

      await runtimeContext.emitEvent({
        type: "run-done",
        runId,
        status: finalStatus,
        reportPath,
        workspace,
      })

      return {
        runId,
        status: finalStatus,
        workspace,
        reportPath,
        totalCost,
        totalTokensIn,
        totalTokensOut,
        evalScores,
        durationMs,
      }
    } finally {
      const fallbackStatus: RunStatus = runtime.controller.signal.aborted
        ? "cancelled"
        : "failed"
      await finalizeRunPidManifest(
        workspace,
        runId,
        mode,
        manifestStatus === "interrupted" ? fallbackStatus : manifestStatus,
      )
      await writeManifest(workspace, {
        ...manifestBase,
        status:
          manifestStatus === "interrupted" ? fallbackStatus : manifestStatus,
        updatedAt: Date.now(),
        blockedByTaskId,
        lastBlockingNodeId: blockedByNodeId,
      })
      interrupts.resolvePendingApprovalsForRun(runId, false)
      interrupts.resolvePendingEvalOverridesForRun(runId)
      activeRuns.delete(runId)
      pausedRuns.delete(runId)
      runWorkspaces.delete(runId)
    }
  }

  async function createHandle(
    runId: string,
    workspace: string,
    executor: (runtime: WorkflowRuntimeContext) => Promise<WorkflowRunSummary>,
  ): Promise<WorkflowRunHandle> {
    const queue = new AsyncEventQueue<WorkflowEvent>()
    const controller = new AbortController()
    const emit = async (event: WorkflowEvent) =>
      emitEvent(queue, workspace, event)

    const result = executor({ emitEvent: emit, controller })
      .catch(async (error) => {
        const summary: WorkflowRunSummary = {
          runId,
          status: controller.signal.aborted ? "cancelled" : "failed",
          workspace,
          reportPath: undefined,
          totalCost: 0,
          totalTokensIn: 0,
          totalTokensOut: 0,
          evalScores: {},
          durationMs: 0,
        }
        try {
          await emit({
            type: "node-error",
            runId,
            nodeId: "__global",
            error: errorMessage(error),
          })
          await emit({
            type: "run-done",
            runId,
            status: summary.status,
            workspace,
          })
        } catch {
          // Ignore secondary failures while reporting top-level failure.
        }
        return summary
      })
      .finally(() => {
        queue.close()
      })

    return {
      runId,
      workspace,
      events: queue,
      result,
      cancel() {
        interrupts.resolvePendingApprovalsForRun(runId, false)
        interrupts.resolvePendingEvalOverridesForRun(runId)
        controller.abort()
      },
      pause() {
        return pauseRun(runId)
      },
      resume() {
        return resumeRunInternal(runId)
      },
    }
  }

  return {
    async startRun(
      request: StartWorkflowRunRequest,
    ): Promise<WorkflowRunHandle> {
      const runId = request.runId || makeRunId("run")
      const workspace = await workspaceStore.createRunWorkspace(
        runId,
        request.projectPath,
      )
      const session = createStartExecutionSession({
        runId,
        workflow: request.workflow,
        input: request.input,
        workspace,
        projectPath: request.projectPath,
        workflowPath: request.workflowPath,
        webSearchBackend: request.webSearchBackend,
        approvalBehavior: request.approvalBehavior,
        chainId: workspace,
      })

      return createHandle(runId, workspace, (runtime) =>
        executeWorkflowSession(session, runtime),
      )
    },

    async resumeRun(
      request: ResumeWorkflowRunRequest,
    ): Promise<WorkflowRunHandle> {
      const runId = request.runId || makeRunId("continue")
      const session = await createResumeExecutionSession({
        runId,
        workflow: request.workflow,
        workspace: request.workspace,
        projectPath: request.projectPath,
        workflowPath: request.workflowPath,
        webSearchBackend: request.webSearchBackend,
        approvalBehavior: request.approvalBehavior,
        chainId: request.workspace,
      })

      return createHandle(runId, request.workspace, async (runtime) =>
        executeWorkflowSession(session, runtime),
      )
    },

    async rerunFromNode(
      request: RerunFromNodeRequest,
    ): Promise<WorkflowRunHandle> {
      const runId = request.runId || makeRunId("rerun")
      const session = await createRerunExecutionSession({
        runId,
        workflow: request.workflow,
        workspace: request.workspace,
        fromNodeId: request.fromNodeId,
        projectPath: request.projectPath,
        workflowPath: request.workflowPath,
        webSearchBackend: request.webSearchBackend,
        approvalBehavior: request.approvalBehavior,
        chainId: request.workspace,
      })

      const handle = await createHandle(
        runId,
        request.workspace,
        async (runtime) => executeWorkflowSession(session, runtime),
      )

      return handle
    },

    async resolveApproval(decision: ApprovalDecision): Promise<boolean> {
      const workspace = decision.workspace || runWorkspaces.get(decision.runId)
      if (workspace) {
        try {
          const persistedDecision = {
            approved: decision.approved,
            editedContent: decision.editedContent,
          }
          await persistResolvedApproval(
            workspace,
            decision.nodeId,
            persistedDecision,
            "runtime",
          )
        } catch (error) {
          logger.warn("workflow-runner", "persist_approval_decision_failed", {
            runId: decision.runId,
            nodeId: decision.nodeId,
            error: errorMessage(error),
          })
        }
      }

      if (
        interrupts.resolveApproval(decision.runId, decision.nodeId, {
          approved: decision.approved,
          editedContent: decision.editedContent,
        })
      ) {
        return true
      }

      return Boolean(workspace)
    },

    async resolveEvalOverride(
      decision: EvalOverrideDecision,
    ): Promise<boolean> {
      if (interrupts.resolveEvalOverride(decision.runId, decision.nodeId)) {
        return true
      }
      return false
    },

    async getSnapshot(runId: string): Promise<WorkflowRunSnapshot | null> {
      const workspace = runWorkspaces.get(runId)
      if (!workspace) return null
      return readWorkflowRunSnapshot(workspace)
    },
  }
}
