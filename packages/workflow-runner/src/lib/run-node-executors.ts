import { basename, dirname, join } from "node:path"
import type {
  AgentExecutionSummary,
  AgentRunOptions,
  ApprovalNodeConfig,
  EvaluatorNodeConfig,
  HumanNodeConfig,
  HumanTaskRequest,
  LogEntry,
  MergerNodeConfig,
  NodeInput,
  NodeState,
  OutputNodeConfig,
  PermissionMode,
  ProviderId,
  SkillNodeConfig,
  SplitterNodeConfig,
  Workflow,
  WorkflowEdge,
  WorkflowEvent,
  WorkflowInput,
  WorkflowNode,
} from "../schema.js"
import {
  approvalTaskId,
  getWorkflowHilTask,
  markWorkflowHilTaskConsumed,
  upsertApprovalHilTask,
  upsertHumanHilTask,
} from "../hil-store.js"
import { buildEvaluatorPrompt, parseEvaluatorOutput } from "./evaluator.js"
import { getOutgoingEdges } from "./graph-engine.js"
import { LogParser } from "./log-parser.js"
import { buildMergerPrompt, mergeResults } from "./node-executors/merger.js"
import {
  buildSplitterPrompt,
  buildSplitterRecoveryPrompt,
  heuristicSplitInput,
  parseSplitterOutput,
  shouldRetrySplitter,
} from "./node-executors/splitter.js"
import type { NodeLifecycleEffect } from "./run-lifecycle.js"
import { readApprovalDecision } from "./run-interrupts.js"
import {
  collapseSplitterExpansion,
  expandSplitter,
  type RuntimeWorkflow,
  type Subtask,
} from "./runtime-graph.js"

interface RunNodeLogger {
  warn?(
    component: string,
    event: string,
    context?: Record<string, unknown>,
  ): void
}

interface ResolvedSkillContext {
  text: string
  skillPaths: string[]
}

export interface RunNodeExecutorHelpers {
  buildAgentFailureDetail: (
    providerId: ProviderId,
    result: AgentExecutionSummary,
    logParser: LogParser,
    stderrText: string,
  ) => string
  buildContinueOutput: (
    node: WorkflowNode,
    incomingContent: string,
    partialOutput: NodeInput | undefined,
  ) => NodeInput
  buildErrorEnvelopeOutput: (
    node: WorkflowNode,
    incomingContent: string,
    partialOutput: NodeInput | undefined,
    errorKind: NonNullable<NodeState["errorKind"]>,
    message: string,
    attempt: number,
  ) => NodeInput
  buildHumanTaskRequest: (
    node: WorkflowNode,
    config: HumanNodeConfig,
    incomingContent: string,
  ) => HumanTaskRequest
  buildNodeMeta: (
    prompt: string,
    model: string,
    skillRef?: string,
    backend?: AgentExecutionSummary["backend"],
    providerSessionId?: string | null,
  ) => NodeState["meta"]
  buildSkillNodeOutput: (
    logger: RunNodeLogger,
    node: WorkflowNode,
    config: SkillNodeConfig,
    stdoutText: string,
    contentFile: string,
    effectiveInput: string,
    partialOnError?: boolean,
  ) => Promise<NodeInput>
  collectMetrics: (
    logParser: LogParser,
    startedAt: number,
  ) => NodeState["metrics"]
  collectUpstreamIds: (
    nodeId: string,
    edges: { source: string; target: string }[],
    nodeStates: Record<string, { status: string }>,
  ) => string[]
  createAgentNodeOutput: (
    node: WorkflowNode,
    content: string,
    metadata?: Omit<Partial<NodeInput["metadata"]>, "source">,
  ) => NodeInput
  createNodeOutput: (
    node: WorkflowNode,
    content: string,
    metadata?: Omit<Partial<NodeInput["metadata"]>, "source">,
  ) => NodeInput
  errorMessage: (error: unknown) => string
  estimateCost: (model: string, tokensIn: number, tokensOut: number) => number
  getClaudeResumeSessionId: (
    providerId: ProviderId,
    state: NodeState | undefined,
  ) => string | undefined
  getDefaultModelForProvider: (providerId: ProviderId) => string
  hasPartialSkillProgress: (
    log: LogEntry[],
    partialOutput: NodeInput | undefined,
  ) => boolean
  normalizedSkillRef: (value: string | undefined) => string
  pickPassThroughMetadata: (
    input: NodeInput | null | undefined,
  ) => Pick<Partial<NodeInput["metadata"]>, "diagnostic_summary">
  readHumanTaskResponse: (
    workspace: string,
    nodeId: string,
  ) => Promise<{
    taskId: string
    resolution: "submitted" | "rejected" | "timed_out"
    answers: Record<string, unknown>
  } | null>
  runGitCommand: (args: string[], cwd: string) => Promise<string>
  sanitizeInvalidUnicode: (value: string) => string
  sanitizeNodeId: (nodeId: string) => string
  serializeLogExcerpt: (
    log: LogEntry[] | undefined,
    maxLength?: number,
  ) => string
  spawnProviderTracked: (
    providerId: ProviderId,
    options: AgentRunOptions,
    tracking: {
      workspace: string
      runId: string
      mode: "run" | "rerun" | "continue"
      role: string
      nodeId?: string
    },
    callbacks?: {
      onExecutionStart?: () => void | Promise<void>
      onSpawn?: (pid: number) => void
      onProviderSession?: (sessionId: string) => void | Promise<void>
      onLogEntry?: (entry: LogEntry) => void | Promise<void>
      onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void
      onStderr?: (text: string) => void | Promise<void>
      onError?: (text: string) => void
    },
  ) => Promise<AgentExecutionSummary>
  writeFileAtomic: (path: string, content: string) => Promise<void>
  writeNodeOutputFile: (
    workspace: string,
    nodeId: string,
    content: string,
  ) => Promise<void>
}

export interface RunNodeExecutionContext {
  runId: string
  mode: "run" | "rerun" | "continue"
  workflow: Workflow
  workflowProviderId: ProviderId
  workspace: string
  projectPath?: string
  workflowPath?: string
  inputContent: string
  persistedInput: WorkflowInput
  node: WorkflowNode
  state: NodeState
  runtimeWorkflow: RuntimeWorkflow
  nodeStates: Record<string, NodeState>
  activatedEdges: Set<string>
  incoming: WorkflowEdge[]
  incomingInput: NodeInput | null
  incomingContent: string
  approvalBehavior: "wait" | "suspend"
  mcpConfigPath?: string
  logger: RunNodeLogger
  runtime: {
    emitEvent: (event: WorkflowEvent) => Promise<void>
    controller: AbortController
  }
  beginNodeExecution: () => Promise<void>
  persistCheckpoint: () => Promise<void>
  resolveNodeProviderId: (
    node: WorkflowNode,
    workflow: Workflow,
  ) => Promise<ProviderId>
  resolveSkillContext: (input: {
    skillRefs?: string[]
    skillPaths?: string[]
  }) => Promise<ResolvedSkillContext>
  waitForApproval: (
    runId: string,
    workspace: string,
    nodeId: string,
    timeoutMinutes?: number,
    timeoutAction?: "auto_approve" | "auto_reject" | "skip",
  ) => Promise<{
    approved: boolean
    editedContent?: string
    timedOut?: boolean
  }>
  waitForEvalOverride: (
    runId: string,
    nodeId: string,
    signal: AbortSignal,
  ) => Promise<boolean>
  helpers: RunNodeExecutorHelpers
}

export interface RunNodeExecutionResult {
  output?: NodeInput | null
  effect?: NodeLifecycleEffect
  shortCircuit?: boolean
  recoverOutputOnError?: () => Promise<NodeInput | undefined>
  runtimeWorkflow?: RuntimeWorkflow
}

export class RecoverableNodeExecutionError extends Error {
  readonly recoverOutputOnError?: () => Promise<NodeInput | undefined>

  constructor(
    message: string,
    options: {
      recoverOutputOnError?: () => Promise<NodeInput | undefined>
      cause?: unknown
    } = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined)
    this.name = "RecoverableNodeExecutionError"
    this.recoverOutputOnError = options.recoverOutputOnError
  }
}

export function getRecoverOutputOnError(
  error: unknown,
): (() => Promise<NodeInput | undefined>) | undefined {
  if (!(error instanceof RecoverableNodeExecutionError)) return undefined
  return error.recoverOutputOnError
}

async function executeInputNode(
  context: RunNodeExecutionContext,
): Promise<RunNodeExecutionResult> {
  await context.beginNodeExecution()
  return {
    output: context.helpers.createNodeOutput(
      context.node,
      context.inputContent,
    ),
  }
}

async function executeOutputNode(
  context: RunNodeExecutionContext,
): Promise<RunNodeExecutionResult> {
  await context.beginNodeExecution()
  return {
    output: context.helpers.createNodeOutput(
      context.node,
      context.incomingContent,
      {
        ...context.helpers.pickPassThroughMetadata(context.incomingInput),
      },
    ),
  }
}

async function executeSkillNode(
  context: RunNodeExecutionContext,
): Promise<RunNodeExecutionResult> {
  const node = context.node
  const state = context.state
  const config = node.config as SkillNodeConfig
  const skillRef = context.helpers.normalizedSkillRef(config.skillRef)
  const nodeProviderId = await context.resolveNodeProviderId(
    node,
    context.workflow,
  )
  const meta = context.runtimeWorkflow.runtimeMeta?.[node.id]
  const effectiveInputRaw = meta
    ? `Subtask: ${meta.subtaskKey}\n\n${meta.subtaskContent}\n\n--- Original Content ---\n${context.incomingContent}`
    : context.incomingContent
  const effectiveInput =
    context.helpers.sanitizeInvalidUnicode(effectiveInputRaw)
  const contentFile = join(
    context.workspace,
    `content-${context.helpers.sanitizeNodeId(node.id)}.md`,
  )
  await context.helpers.writeFileAtomic(contentFile, effectiveInput)

  const workdir = context.projectPath || context.workspace
  const logParser = new LogParser()

  let retryFeedback = ""
  for (const edge of context.incoming) {
    if (edge.type !== "fail") continue
    const evalOutput = context.nodeStates[edge.source]?.output
    if (evalOutput?.metadata?.score == null) continue
    const lines = [
      "## Retry Instructions",
      `Your previous output scored ${evalOutput.metadata.score}/10.`,
      `Feedback: ${evalOutput.metadata.reason}`,
    ]
    if (evalOutput.metadata.fix_instructions) {
      lines.push("", "**What to fix:**", evalOutput.metadata.fix_instructions)
    }
    lines.push(
      "",
      `Attempt ${(evalOutput.metadata.iteration || 0) + 1}. Please improve based on this feedback.`,
      "",
    )
    retryFeedback = lines.join("\n")
  }

  const upstreamIds = context.helpers.collectUpstreamIds(
    node.id,
    context.runtimeWorkflow.edges,
    context.nodeStates,
  )
  const manifestLines: string[] = []
  for (const upstreamId of upstreamIds) {
    const upstreamNode = context.runtimeWorkflow.nodes.find(
      (candidate) => candidate.id === upstreamId,
    )
    const label =
      (upstreamNode?.config as Record<string, unknown>)?.label ||
      upstreamNode?.type ||
      upstreamId
    manifestLines.push(
      `- outputs/${context.helpers.sanitizeNodeId(upstreamId)}.md  (${label})`,
    )
  }

  const allSkillRefs = [
    ...(skillRef ? [skillRef] : []),
    ...(config.skillRefs || []),
  ]
  const skillContext = await context.resolveSkillContext({
    skillRefs: allSkillRefs.length > 0 ? allSkillRefs : undefined,
    skillPaths: config.skillPaths,
  })
  const additionalSkillDirs = [
    ...new Set(
      skillContext.skillPaths
        .map((path) => (path.endsWith(".md") ? dirname(path) : path))
        .filter(Boolean),
    ),
  ]

  const intentContext = context.persistedInput.context?.trim()
  const prompt = context.helpers.sanitizeInvalidUnicode(
    [
      `Today: ${new Date().toISOString().slice(0, 10)}`,
      `Workspace: ${context.workspace}`,
      `Content file: ${contentFile}`,
      "",
      ...(intentContext
        ? ["User's goal for this flow:", intentContext, ""]
        : []),
      ...(effectiveInput.trim()
        ? [
            "User request (PRIORITY — follow this exactly):",
            effectiveInput.trim(),
            "",
          ]
        : []),
      ...(manifestLines.length > 0
        ? ["Available upstream outputs:", ...manifestLines, ""]
        : []),
      ...(retryFeedback ? [retryFeedback] : []),
      ...(skillContext.text
        ? ["Skill instructions:", skillContext.text, ""]
        : []),
      config.prompt,
    ].join("\n"),
  )
  const skillModel =
    context.workflow.defaults?.model ||
    context.helpers.getDefaultModelForProvider(nodeProviderId)
  let skillBackend: AgentExecutionSummary["backend"]
  let skillProviderSessionId: string | null | undefined

  const updateSkillMetricsAndMeta = () => {
    const metrics = context.helpers.collectMetrics(logParser, state.startedAt!)
    if (metrics) {
      metrics.cost_usd = context.helpers.estimateCost(
        skillModel,
        metrics.tokens_in,
        metrics.tokens_out,
      )
    }
    state.metrics = metrics
    state.meta = context.helpers.buildNodeMeta(
      prompt,
      skillModel,
      skillRef || undefined,
      skillBackend,
      skillProviderSessionId,
    )
  }

  const recoverOutputOnError = async () => {
    const remaining = logParser.flush()
    for (const entry of remaining) {
      state.log.push(entry)
      await context.runtime.emitEvent({
        type: "node-log",
        runId: context.runId,
        nodeId: node.id,
        entry,
      })
    }
    updateSkillMetricsAndMeta()
    return context.helpers.buildSkillNodeOutput(
      context.logger,
      node,
      config,
      logParser.textContent,
      contentFile,
      effectiveInput,
      true,
    )
  }

  const effectivePermissionMode: PermissionMode =
    config.permissionMode ?? context.workflow.defaults?.permissionMode ?? "edit"
  const mergedAllowed = [
    ...new Set([
      ...(context.workflow.defaults?.allowedTools || []),
      ...(config.allowedTools || []),
    ]),
  ]
  const planDisallowed =
    effectivePermissionMode === "plan" ? ["Edit", "Write", "NotebookEdit"] : []
  const mergedDisallowed = [
    ...new Set([
      ...(context.workflow.defaults?.disallowedTools || []),
      ...(config.disallowedTools || []),
      ...planDisallowed,
    ]),
  ]

  let preRunHead = ""
  let isGitRepo = false
  if (effectivePermissionMode === "edit") {
    try {
      await context.helpers.runGitCommand(
        ["rev-parse", "--is-inside-work-tree"],
        workdir,
      )
      isGitRepo = true
    } catch {
      isGitRepo = false
    }
  }

  if (isGitRepo) {
    try {
      preRunHead = await context.helpers.runGitCommand(
        ["rev-parse", "HEAD"],
        workdir,
      )
    } catch {
      // Best effort only.
    }
  }

  let skillStderr = ""
  const skillResumeSessionId = context.helpers.getClaudeResumeSessionId(
    nodeProviderId,
    state,
  )
  if (skillResumeSessionId) {
    const resumeEntry = {
      type: "text" as const,
      content: `[runtime-resume] resuming Claude session ${skillResumeSessionId.slice(0, 8)} for this node\n`,
      timestamp: Date.now(),
    }
    state.log.push(resumeEntry)
    await context.runtime.emitEvent({
      type: "node-log",
      runId: context.runId,
      nodeId: node.id,
      entry: resumeEntry,
    })
  }
  const result = await context.helpers.spawnProviderTracked(
    nodeProviderId,
    {
      workdir,
      prompt,
      model: skillModel,
      maxTurns: config.maxTurns || context.workflow.defaults?.maxTurns || 120,
      persistSession: nodeProviderId === "claude",
      resumeSessionId: skillResumeSessionId,
      permissionMode: "acceptEdits",
      executionMode: effectivePermissionMode,
      mcpConfigPath: context.mcpConfigPath,
      addDirs: additionalSkillDirs.length > 0 ? additionalSkillDirs : undefined,
      allowedTools: mergedAllowed.length > 0 ? mergedAllowed : undefined,
      disallowedTools:
        mergedDisallowed.length > 0 ? mergedDisallowed : undefined,
      abortSignal: context.runtime.controller.signal,
      timeout: (context.workflow.defaults?.timeout_minutes || 30) * 60 * 1000,
    },
    {
      workspace: context.workspace,
      runId: context.runId,
      mode: context.mode,
      role: "skill",
      nodeId: node.id,
    },
    {
      onExecutionStart: context.beginNodeExecution,
      onProviderSession: async (sessionId) => {
        skillBackend = "claude_sdk"
        skillProviderSessionId = sessionId
        updateSkillMetricsAndMeta()
        await context.persistCheckpoint()
      },
      onLogEntry: async (entry) => {
        logParser.appendEntry(entry)
        state.log.push(entry)
        await context.runtime.emitEvent({
          type: "node-log",
          runId: context.runId,
          nodeId: node.id,
          entry,
        })
      },
      onUsage: (usage) => {
        logParser.applyUsage(usage)
      },
      onStderr: async (text) => {
        skillStderr += text
        const entry = {
          type: "error" as const,
          content: text,
          timestamp: Date.now(),
        }
        state.log.push(entry)
        await context.runtime.emitEvent({
          type: "node-log",
          runId: context.runId,
          nodeId: node.id,
          entry,
        })
      },
    },
  )
  skillBackend = result.backend
  skillProviderSessionId = result.providerSessionId

  for (const entry of logParser.flush()) {
    state.log.push(entry)
    await context.runtime.emitEvent({
      type: "node-log",
      runId: context.runId,
      nodeId: node.id,
      entry,
    })
  }

  updateSkillMetricsAndMeta()

  if (isGitRepo && preRunHead) {
    try {
      const postRunHead = await context.helpers.runGitCommand(
        ["rev-parse", "HEAD"],
        workdir,
      )
      if (postRunHead !== preRunHead) {
        const revisionRange = `${preRunHead}..${postRunHead}`
        const postRunDiff = await context.helpers.runGitCommand(
          ["diff", revisionRange],
          workdir,
        )
        if (postRunDiff.trim()) {
          const fileLines = await context.helpers.runGitCommand(
            ["diff", "--name-only", revisionRange],
            workdir,
          )
          const diffEntry = {
            type: "diff" as const,
            content: postRunDiff,
            files: fileLines.trim().split("\n").filter(Boolean),
            timestamp: Date.now(),
          }
          state.log.push(diffEntry)
          await context.runtime.emitEvent({
            type: "node-log",
            runId: context.runId,
            nodeId: node.id,
            entry: diffEntry,
          })
        }
      }
    } catch {
      // Best effort only.
    }
  }

  if (!result.success && !context.runtime.controller.signal.aborted) {
    const detail = context.helpers.buildAgentFailureDetail(
      nodeProviderId,
      result,
      logParser,
      skillStderr,
    )
    throw new RecoverableNodeExecutionError(`Skill node failed: ${detail}`, {
      recoverOutputOnError,
    })
  }

  return {
    output: await context.helpers.buildSkillNodeOutput(
      context.logger,
      node,
      config,
      logParser.textContent,
      contentFile,
      effectiveInput,
    ),
    recoverOutputOnError,
  }
}

async function executeEvaluatorNode(
  context: RunNodeExecutionContext,
): Promise<RunNodeExecutionResult> {
  const node = context.node
  const state = context.state
  const evalConfig = node.config as EvaluatorNodeConfig
  const logParser = new LogParser()
  let evaluatorStderr = ""
  const evalSkillContext = await context.resolveSkillContext({
    skillRefs: evalConfig.skillRefs,
  })
  const evalProviderId = context.workflowProviderId
  const evalIntentContext = context.persistedInput.context?.trim()
  const evalPrompt = context.helpers.sanitizeInvalidUnicode(
    [
      ...(evalIntentContext
        ? [`User's goal for this flow:\n${evalIntentContext}\n`]
        : []),
      buildEvaluatorPrompt(
        evalConfig.criteria,
        context.incomingContent,
        evalSkillContext.text,
      ),
    ].join("\n"),
  )
  const evalAdditionalDirs = [
    ...new Set(
      evalSkillContext.skillPaths
        .map((path) => (path.endsWith(".md") ? dirname(path) : path))
        .filter(Boolean),
    ),
  ]

  const evalModel =
    context.workflow.defaults?.model ||
    context.helpers.getDefaultModelForProvider(evalProviderId)
  const evalResumeSessionId = context.helpers.getClaudeResumeSessionId(
    evalProviderId,
    state,
  )
  const evalSpawnResult = await context.helpers.spawnProviderTracked(
    evalProviderId,
    {
      workdir: context.projectPath || context.workspace,
      prompt: evalPrompt,
      model: evalModel,
      maxTurns: 100,
      persistSession: evalProviderId === "claude",
      resumeSessionId: evalResumeSessionId,
      executionMode: context.workflow.defaults?.permissionMode,
      mcpConfigPath: undefined, // evaluator should only assess text, not use tools
      disableBuiltInTools: evalProviderId === "claude",
      addDirs: evalAdditionalDirs.length > 0 ? evalAdditionalDirs : undefined,
      abortSignal: context.runtime.controller.signal,
      timeout: 120_000,
    },
    {
      workspace: context.workspace,
      runId: context.runId,
      mode: context.mode,
      role: "evaluator",
      nodeId: node.id,
    },
    {
      onExecutionStart: context.beginNodeExecution,
      onProviderSession: async (sessionId) => {
        state.meta = context.helpers.buildNodeMeta(
          evalPrompt,
          evalModel,
          undefined,
          "claude_sdk",
          sessionId,
        )
        await context.persistCheckpoint()
      },
      onLogEntry: async (entry) => {
        logParser.appendEntry(entry)
        state.log.push(entry)
        await context.runtime.emitEvent({
          type: "node-log",
          runId: context.runId,
          nodeId: node.id,
          entry,
        })
      },
      onUsage: (usage) => {
        logParser.applyUsage(usage)
      },
      onStderr: async (text) => {
        evaluatorStderr += text
        const entry = {
          type: "error" as const,
          content: text,
          timestamp: Date.now(),
        }
        state.log.push(entry)
        await context.runtime.emitEvent({
          type: "node-log",
          runId: context.runId,
          nodeId: node.id,
          entry,
        })
      },
    },
  )

  if (!evalSpawnResult.success && !context.runtime.controller.signal.aborted) {
    const detail = context.helpers.buildAgentFailureDetail(
      evalProviderId,
      evalSpawnResult,
      logParser,
      evaluatorStderr,
    )
    throw new Error(`Evaluator node failed: ${detail}`)
  }

  for (const entry of logParser.flush()) {
    state.log.push(entry)
    await context.runtime.emitEvent({
      type: "node-log",
      runId: context.runId,
      nodeId: node.id,
      entry,
    })
  }

  const evalMetrics = context.helpers.collectMetrics(
    logParser,
    state.startedAt!,
  )
  if (evalMetrics) {
    evalMetrics.cost_usd = context.helpers.estimateCost(
      evalModel,
      evalMetrics.tokens_in,
      evalMetrics.tokens_out,
    )
  }
  state.metrics = evalMetrics
  state.meta = context.helpers.buildNodeMeta(
    evalPrompt,
    evalModel,
    undefined,
    evalSpawnResult.backend,
    evalSpawnResult.providerSessionId,
  )

  const evalResult = parseEvaluatorOutput(state.log)
  if (!evalResult) {
    const rawExcerpt = context.helpers.serializeLogExcerpt(state.log)
    throw new Error(
      `Evaluator output parse failed. Expected JSON with numeric 'score' field. Actual output: ${rawExcerpt}`,
    )
  }

  const score = evalResult.score
  const reason = evalResult.reason
  const fixInstructions = evalResult.fix_instructions
  const evalCriteria = evalResult.criteria
  const passed = score >= evalConfig.threshold

  await context.runtime.emitEvent({
    type: "eval-result",
    runId: context.runId,
    nodeId: node.id,
    score,
    reason,
    passed,
    attempt: state.attempts,
    fix_instructions: fixInstructions,
    criteria: evalCriteria,
  })

  const evalMetadata = {
    score,
    reason,
    iteration: state.attempts,
    fix_instructions: fixInstructions,
    criteria: evalCriteria,
    ...context.helpers.pickPassThroughMetadata(context.incomingInput),
  }

  if (passed) {
    const output = context.helpers.createNodeOutput(
      node,
      context.incomingContent,
      evalMetadata,
    )
    for (const edge of getOutgoingEdges(context.runtimeWorkflow, node.id)) {
      if (edge.type === "pass" || edge.type === "default")
        context.activatedEdges.add(edge.id)
    }
    return { output }
  }

  if (state.attempts < evalConfig.maxRetries && evalConfig.retryFrom) {
    const retryTargetId = evalConfig.retryFrom
    const retryTargetState = context.nodeStates[retryTargetId]

    if (!retryTargetState || retryTargetState.status === "running") {
      const output = context.helpers.createNodeOutput(
        node,
        context.incomingContent,
        evalMetadata,
      )
      for (const edge of getOutgoingEdges(context.runtimeWorkflow, node.id)) {
        if (edge.type === "pass" || edge.type === "default")
          context.activatedEdges.add(edge.id)
      }
      return { output }
    }

    state.output = context.helpers.createNodeOutput(
      node,
      context.incomingContent,
      evalMetadata,
    )

    const toReset = new Set<string>()
    const resetQueue = [retryTargetId]
    while (resetQueue.length > 0) {
      const id = resetQueue.shift()!
      if (toReset.has(id) || id === node.id) continue
      toReset.add(id)
      for (const edge of getOutgoingEdges(context.runtimeWorkflow, id)) {
        resetQueue.push(edge.target)
      }
    }

    for (const id of toReset) {
      for (const edge of getOutgoingEdges(context.runtimeWorkflow, id)) {
        context.activatedEdges.delete(edge.id)
      }
      if (context.nodeStates[id]) {
        const preservedMeta =
          id === retryTargetId ? context.nodeStates[id].meta : undefined
        context.nodeStates[id] = {
          status: "pending",
          attempts: context.nodeStates[id].attempts,
          log: [],
          output: undefined,
          ...(preservedMeta ? { meta: preservedMeta } : {}),
        }
      }
    }

    for (const edge of getOutgoingEdges(context.runtimeWorkflow, node.id)) {
      context.activatedEdges.delete(edge.id)
    }
    for (const edge of getOutgoingEdges(context.runtimeWorkflow, node.id)) {
      if (edge.type === "fail") context.activatedEdges.add(edge.id)
    }

    state.status = "pending"
    state.log = []
    return { shortCircuit: true }
  }

  await context.runtime.emitEvent({
    type: "eval-exhausted",
    runId: context.runId,
    nodeId: node.id,
    score,
    threshold: evalConfig.threshold,
    attempt: state.attempts,
  })

  const overridden = await context.waitForEvalOverride(
    context.runId,
    node.id,
    context.runtime.controller.signal,
  )

  if (overridden) {
    await context.runtime.emitEvent({
      type: "eval-overridden",
      runId: context.runId,
      nodeId: node.id,
    })
    const output = context.helpers.createNodeOutput(
      node,
      context.incomingContent,
      {
        ...evalMetadata,
        overridden: true,
      },
    )
    for (const edge of getOutgoingEdges(context.runtimeWorkflow, node.id)) {
      if (edge.type === "pass" || edge.type === "default")
        context.activatedEdges.add(edge.id)
    }
    return { output }
  }

  const output = context.helpers.createNodeOutput(
    node,
    context.incomingContent,
    evalMetadata,
  )
  const failEdges = getOutgoingEdges(context.runtimeWorkflow, node.id).filter(
    (edge) => edge.type === "fail",
  )
  if (failEdges.length > 0) {
    for (const edge of failEdges) context.activatedEdges.add(edge.id)
  } else {
    for (const edge of getOutgoingEdges(context.runtimeWorkflow, node.id)) {
      if (edge.type === "pass" || edge.type === "default")
        context.activatedEdges.add(edge.id)
    }
  }
  return { output }
}

async function executeSplitterNode(
  context: RunNodeExecutionContext,
): Promise<RunNodeExecutionResult> {
  const node = context.node
  const state = context.state
  const splitterConfig = node.config as SplitterNodeConfig
  const splitterProviderId = await context.resolveNodeProviderId(
    node,
    context.workflow,
  )
  const splitterModel =
    context.workflow.defaults?.model ||
    context.helpers.getDefaultModelForProvider(splitterProviderId)
  const maxBranches = splitterConfig.maxBranches || 8
  const splitterMaxTurns = Math.max(
    2,
    Math.min(4, context.workflow.defaults?.maxTurns || 4),
  )
  const splitterAllowedTools = context.workflow.defaults?.allowedTools
  const splitterDisallowedTools = context.workflow.defaults?.disallowedTools
  const splitterResumeSessionId = context.helpers.getClaudeResumeSessionId(
    splitterProviderId,
    state,
  )
  const splitterPrompts: string[] = []
  let splitterBackend: AgentExecutionSummary["backend"]
  let splitterProviderSessionId: string | null | undefined
  let totalTokensIn = 0
  let totalTokensOut = 0
  let totalCostUsd = 0

  const runSplitterAttempt = async (prompt: string): Promise<string> => {
    const logParser = new LogParser()
    const sanitizedPrompt = context.helpers.sanitizeInvalidUnicode(prompt)
    splitterPrompts.push(sanitizedPrompt)

    const result = await context.helpers.spawnProviderTracked(
      splitterProviderId,
      {
        workdir: context.projectPath || context.workspace,
        prompt: sanitizedPrompt,
        model: splitterModel,
        maxTurns: splitterMaxTurns,
        persistSession: splitterProviderId === "claude",
        resumeSessionId:
          splitterPrompts.length === 1 ? splitterResumeSessionId : undefined,
        executionMode: context.workflow.defaults?.permissionMode,
        mcpConfigPath: context.mcpConfigPath,
        allowedTools: splitterAllowedTools?.length
          ? splitterAllowedTools
          : undefined,
        disallowedTools: splitterDisallowedTools?.length
          ? splitterDisallowedTools
          : undefined,
        addDirs: [],
        abortSignal: context.runtime.controller.signal,
        timeout: 2 * 60 * 1000,
      },
      {
        workspace: context.workspace,
        runId: context.runId,
        mode: context.mode,
        role: "splitter",
        nodeId: node.id,
      },
      {
        onExecutionStart: context.beginNodeExecution,
        onProviderSession: async (sessionId) => {
          splitterBackend = "claude_sdk"
          splitterProviderSessionId = sessionId
          state.meta = context.helpers.buildNodeMeta(
            sanitizedPrompt,
            splitterModel,
            undefined,
            splitterBackend,
            splitterProviderSessionId,
          )
          await context.persistCheckpoint()
        },
        onLogEntry: async (entry) => {
          logParser.appendEntry(entry)
          state.log.push(entry)
          await context.runtime.emitEvent({
            type: "node-log",
            runId: context.runId,
            nodeId: node.id,
            entry,
          })
        },
        onUsage: (usage) => {
          logParser.applyUsage(usage)
        },
        onStderr: async (text) => {
          const entry = {
            type: "error" as const,
            content: text,
            timestamp: Date.now(),
          }
          state.log.push(entry)
          await context.runtime.emitEvent({
            type: "node-log",
            runId: context.runId,
            nodeId: node.id,
            entry,
          })
        },
      },
    )
    splitterProviderSessionId = result.providerSessionId

    for (const entry of logParser.flush()) {
      state.log.push(entry)
      await context.runtime.emitEvent({
        type: "node-log",
        runId: context.runId,
        nodeId: node.id,
        entry,
      })
    }

    const attemptMetrics = context.helpers.collectMetrics(
      logParser,
      state.startedAt!,
    )
    if (attemptMetrics) {
      totalTokensIn += attemptMetrics.tokens_in
      totalTokensOut += attemptMetrics.tokens_out
      totalCostUsd += context.helpers.estimateCost(
        splitterModel,
        attemptMetrics.tokens_in,
        attemptMetrics.tokens_out,
      )
    }

    if (context.runtime.controller.signal.aborted) {
      throw new Error("Splitter aborted")
    }

    if (!result.success) {
      const entry = {
        type: "error" as const,
        content: `[splitter] ${splitterProviderId} attempt failed (exitCode=${String(result.exitCode)}) - falling back\n`,
        timestamp: Date.now(),
      }
      state.log.push(entry)
      await context.runtime.emitEvent({
        type: "node-log",
        runId: context.runId,
        nodeId: node.id,
        entry,
      })
    }
    splitterBackend = result.backend
    return logParser.textContent
  }

  let subtasks: Subtask[]
  const splitterIntentContext = context.persistedInput.context?.trim()
  const splitterInputContent = splitterIntentContext
    ? `User's goal for this flow:\n${splitterIntentContext}\n\n---\n\n${context.incomingContent}`
    : context.incomingContent
  const splitterPrompt = buildSplitterPrompt(
    splitterConfig.strategy,
    splitterInputContent,
    maxBranches,
  )
  let splitterRawOutput = await runSplitterAttempt(splitterPrompt)
  subtasks = parseSplitterOutput(splitterRawOutput)

  if (
    maxBranches > 1 &&
    shouldRetrySplitter(
      subtasks,
      splitterRawOutput,
      context.incomingContent,
      maxBranches,
    )
  ) {
    const recoveryPrompt = buildSplitterRecoveryPrompt(
      splitterConfig.strategy,
      splitterInputContent,
      maxBranches,
    )
    splitterRawOutput = await runSplitterAttempt(recoveryPrompt)
    subtasks = parseSplitterOutput(splitterRawOutput)
  }

  const beforeFilterCount = subtasks.length
  subtasks = subtasks.filter((subtask) => subtask.content.trim().length > 0)
  if (beforeFilterCount !== subtasks.length) {
    const entry = {
      type: "text" as const,
      content: `[splitter] dropped ${beforeFilterCount - subtasks.length} empty subtasks\n`,
      timestamp: Date.now(),
    }
    state.log.push(entry)
    await context.runtime.emitEvent({
      type: "node-log",
      runId: context.runId,
      nodeId: node.id,
      entry,
    })
  }

  // Heuristic fallback only when LLM produced nothing at all
  if (subtasks.length === 0) {
    subtasks = heuristicSplitInput(context.incomingContent, maxBranches)
    const entry = {
      type: "text" as const,
      content: `[splitter] ai produced no subtasks, falling back to heuristic split (${subtasks.length} subtasks)\n`,
      timestamp: Date.now(),
    }
    state.log.push(entry)
    await context.runtime.emitEvent({
      type: "node-log",
      runId: context.runId,
      nodeId: node.id,
      entry,
    })
  }

  const totalSubtasks = subtasks.length
  const usedSubtasks = subtasks.slice(0, maxBranches)
  if (totalSubtasks > usedSubtasks.length) {
    const entry = {
      type: "text" as const,
      content: `[splitter] produced ${totalSubtasks} subtasks, limited to ${usedSubtasks.length} by maxBranches=${maxBranches}\n`,
      timestamp: Date.now(),
    }
    state.log.push(entry)
    await context.runtime.emitEvent({
      type: "node-log",
      runId: context.runId,
      nodeId: node.id,
      entry,
    })
  }

  state.metrics = {
    tokens_in: totalTokensIn,
    tokens_out: totalTokensOut,
    cost_usd: totalCostUsd,
    latency_ms: Date.now() - state.startedAt!,
  }
  state.meta = context.helpers.buildNodeMeta(
    splitterPrompts.join("\n\n--- RETRY ---\n\n"),
    splitterModel,
    undefined,
    splitterBackend,
    splitterProviderSessionId,
  )

  const collapsed = collapseSplitterExpansion(
    context.runtimeWorkflow,
    context.workflow,
    node.id,
  )
  let nextRuntimeWorkflow = collapsed.workflow
  const removedCloneIds = collapsed.removedIds
  for (const id of removedCloneIds) {
    delete context.nodeStates[id]
  }

  const expanded = expandSplitter(nextRuntimeWorkflow, node.id, usedSubtasks)
  nextRuntimeWorkflow = expanded

  const newNodeIds: string[] = []
  const runtimeMeta: Record<
    string,
    {
      subtaskKey: string
      branchIndex: number
      totalBranches: number
      templateId: string
    }
  > = {}
  for (const runtimeNode of expanded.nodes) {
    if (!context.nodeStates[runtimeNode.id]) {
      context.nodeStates[runtimeNode.id] = {
        status: "pending",
        attempts: 0,
        log: [],
      }
      newNodeIds.push(runtimeNode.id)
      if (expanded.runtimeMeta[runtimeNode.id]) {
        runtimeMeta[runtimeNode.id] = {
          subtaskKey: expanded.runtimeMeta[runtimeNode.id].subtaskKey,
          branchIndex: expanded.runtimeMeta[runtimeNode.id].branchIndex,
          totalBranches: expanded.runtimeMeta[runtimeNode.id].totalBranches,
          templateId: expanded.runtimeMeta[runtimeNode.id].templateId,
        }
      }
    }
  }

  await context.runtime.emitEvent({
    type: "nodes-expanded",
    runId: context.runId,
    newNodeIds,
    runtimeMeta,
    nodes: expanded.nodes.map(
      (runtimeNode) =>
        ({
          id: runtimeNode.id,
          type: runtimeNode.type,
          position: runtimeNode.position,
          config: runtimeNode.config,
        }) as WorkflowNode,
    ),
    edges: expanded.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
    })),
  })

  return {
    output: context.helpers.createNodeOutput(
      node,
      JSON.stringify(usedSubtasks),
      {
        splitter_total_subtasks: totalSubtasks,
        splitter_used_subtasks: usedSubtasks.length,
        splitter_truncated: totalSubtasks > usedSubtasks.length,
      },
    ),
    runtimeWorkflow: nextRuntimeWorkflow,
  }
}

async function executeMergerNode(
  context: RunNodeExecutionContext,
): Promise<RunNodeExecutionResult> {
  const node = context.node
  const state = context.state
  const mergerConfig = node.config as MergerNodeConfig
  const incomingEdges = context.runtimeWorkflow.edges.filter(
    (edge) => edge.target === node.id,
  )
  const branchOutputs: NodeInput[] = []
  for (const edge of incomingEdges) {
    const sourceState = context.nodeStates[edge.source]
    if (sourceState?.output) branchOutputs.push(sourceState.output)
  }
  if (incomingEdges.length > 0 && branchOutputs.length === 0) {
    throw new Error("Merger has no branch outputs to combine")
  }

  const failedBranches = incomingEdges.filter(
    (edge) => context.nodeStates[edge.source]?.status === "failed",
  )
  if (failedBranches.length > 0) {
    const entry = {
      type: "text" as const,
      content: `[merger] ${failedBranches.length}/${incomingEdges.length} branches failed, merging ${branchOutputs.length} successful outputs\n`,
      timestamp: Date.now(),
    }
    state.log.push(entry)
    await context.runtime.emitEvent({
      type: "node-log",
      runId: context.runId,
      nodeId: node.id,
      entry,
    })
  }

  if (
    mergerConfig.strategy === "concatenate" ||
    mergerConfig.strategy === "json_array"
  ) {
    await context.beginNodeExecution()
    const mergerModel =
      context.workflow.defaults?.model ||
      context.helpers.getDefaultModelForProvider(context.workflowProviderId)
    state.metrics = {
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      latency_ms: Date.now() - state.startedAt!,
    }
    state.meta = context.helpers.buildNodeMeta(
      `[merger ${mergerConfig.strategy}]`,
      mergerModel,
    )
    return {
      output: context.helpers.createNodeOutput(
        node,
        mergeResults(branchOutputs, mergerConfig.strategy),
      ),
    }
  }

  const mergerIntentContext = context.persistedInput.context?.trim()
  const mergePrompt = context.helpers.sanitizeInvalidUnicode(
    [
      ...(mergerIntentContext
        ? [`User's goal for this flow:\n${mergerIntentContext}\n`]
        : []),
      buildMergerPrompt(
        branchOutputs,
        mergerConfig.strategy,
        mergerConfig.prompt,
      ),
    ].join("\n"),
  )
  const logParser = new LogParser()
  let mergerStderr = ""
  const mergerProviderId = context.workflowProviderId
  const mergerModel =
    context.workflow.defaults?.model ||
    context.helpers.getDefaultModelForProvider(mergerProviderId)
  const mergerResumeSessionId = context.helpers.getClaudeResumeSessionId(
    mergerProviderId,
    state,
  )

  const result = await context.helpers.spawnProviderTracked(
    mergerProviderId,
    {
      workdir: context.projectPath || context.workspace,
      prompt: mergePrompt,
      model: mergerModel,
      maxTurns: 20,
      persistSession: mergerProviderId === "claude",
      resumeSessionId: mergerResumeSessionId,
      executionMode: context.workflow.defaults?.permissionMode,
      mcpConfigPath: context.mcpConfigPath,
      disableBuiltInTools: mergerProviderId === "claude",
      addDirs: [],
      abortSignal: context.runtime.controller.signal,
      timeout: 10 * 60 * 1000,
    },
    {
      workspace: context.workspace,
      runId: context.runId,
      mode: context.mode,
      role: "merger",
      nodeId: node.id,
    },
    {
      onExecutionStart: context.beginNodeExecution,
      onProviderSession: async (sessionId) => {
        state.meta = context.helpers.buildNodeMeta(
          mergePrompt,
          mergerModel,
          undefined,
          "claude_sdk",
          sessionId,
        )
        await context.persistCheckpoint()
      },
      onLogEntry: async (entry) => {
        logParser.appendEntry(entry)
        state.log.push(entry)
        await context.runtime.emitEvent({
          type: "node-log",
          runId: context.runId,
          nodeId: node.id,
          entry,
        })
      },
      onUsage: (usage) => {
        logParser.applyUsage(usage)
      },
      onStderr: async (text) => {
        mergerStderr += text
        const entry = {
          type: "error" as const,
          content: text,
          timestamp: Date.now(),
        }
        state.log.push(entry)
        await context.runtime.emitEvent({
          type: "node-log",
          runId: context.runId,
          nodeId: node.id,
          entry,
        })
      },
    },
  )

  for (const entry of logParser.flush()) {
    state.log.push(entry)
    await context.runtime.emitEvent({
      type: "node-log",
      runId: context.runId,
      nodeId: node.id,
      entry,
    })
  }

  if (!result.success && !context.runtime.controller.signal.aborted) {
    const detail = context.helpers.buildAgentFailureDetail(
      mergerProviderId,
      result,
      logParser,
      mergerStderr,
    )
    throw new Error(`Merger failed: ${detail}`)
  }

  const mergerMetrics = context.helpers.collectMetrics(
    logParser,
    state.startedAt!,
  )
  if (mergerMetrics) {
    mergerMetrics.cost_usd = context.helpers.estimateCost(
      mergerModel,
      mergerMetrics.tokens_in,
      mergerMetrics.tokens_out,
    )
  }
  state.metrics = mergerMetrics
  state.meta = context.helpers.buildNodeMeta(
    mergePrompt,
    mergerModel,
    undefined,
    result.backend,
    result.providerSessionId,
  )
  return {
    output: context.helpers.createAgentNodeOutput(node, logParser.textContent),
  }
}

async function executeApprovalNode(
  context: RunNodeExecutionContext,
): Promise<RunNodeExecutionResult> {
  const node = context.node
  const state = context.state
  await context.beginNodeExecution()
  const approvalConfig = node.config as ApprovalNodeConfig
  state.status = "waiting_approval"
  const approvalContent = approvalConfig.show_content
    ? context.incomingContent
    : ""
  let decision = await readApprovalDecision(context.workspace, node.id)
  const approvalTask = !decision
    ? await upsertApprovalHilTask({
        workspace: context.workspace,
        runId: context.runId,
        workflowName: context.workflow.name,
        workflowPath: context.workflowPath,
        projectPath: context.projectPath,
        nodeId: node.id,
        title: approvalConfig.message || `Approval required for ${node.id}`,
        message: approvalConfig.message,
        content: approvalContent,
        allowEdit: approvalConfig.allow_edit,
      })
    : await getWorkflowHilTask(context.workspace, approvalTaskId(node.id))

  if (approvalTask) {
    state.humanTask = {
      taskId: approvalTask.taskId,
      status: approvalTask.state.status,
    }
  }

  if (!decision) {
    await context.persistCheckpoint()
    if (approvalTask) {
      await context.runtime.emitEvent({
        type: "human-task-created",
        runId: context.runId,
        nodeId: node.id,
        taskId: approvalTask.taskId,
        title: approvalTask.state.title,
      })
    }
    await context.runtime.emitEvent({
      type: "approval-requested",
      runId: context.runId,
      nodeId: node.id,
      content: approvalContent,
      message: approvalConfig.message,
      allowEdit: approvalConfig.allow_edit,
    })

    if (context.approvalBehavior === "suspend") {
      return { shortCircuit: true, effect: { suspendedForApproval: true } }
    }

    decision = await context.waitForApproval(
      context.runId,
      context.workspace,
      node.id,
      approvalConfig.timeout_minutes,
      approvalConfig.timeout_action ?? "auto_reject",
    )
  }

  if (approvalTask) {
    const resolution = decision.timedOut
      ? "timed_out"
      : decision.approved
        ? "submitted"
        : "rejected"
    state.humanTask = {
      taskId: approvalTask.taskId,
      status: resolution === "submitted" ? "answered" : resolution,
    }
    await context.runtime.emitEvent({
      type: "human-task-resolved",
      runId: context.runId,
      nodeId: node.id,
      taskId: approvalTask.taskId,
      resolution,
    })
  }

  if (decision.timedOut) {
    const action = approvalConfig.timeout_action ?? "auto_reject"
    const minutes = approvalConfig.timeout_minutes ?? 60
    await context.runtime.emitEvent({
      type: "node-log",
      runId: context.runId,
      nodeId: node.id,
      entry: {
        type: "text",
        content: `Approval timed out after ${minutes} minutes. Auto-${action.replace("auto_", "")} applied.\n`,
        timestamp: Date.now(),
      },
    })
  }

  if (decision.approved) {
    if (approvalTask) {
      await markWorkflowHilTaskConsumed(context.workspace, approvalTask.taskId)
    }
    return {
      output: context.helpers.createNodeOutput(
        node,
        decision.editedContent ?? context.incomingContent,
        {
          ...context.helpers.pickPassThroughMetadata(context.incomingInput),
        },
      ),
    }
  }

  state.status = "failed"
  state.completedAt = Date.now()
  state.error = decision.timedOut
    ? `Approval timed out (${approvalConfig.timeout_action ?? "auto_reject"})`
    : "Rejected by user"
  await context.runtime.emitEvent({
    type: "node-error",
    runId: context.runId,
    nodeId: node.id,
    error: state.error,
  })
  if (approvalTask) {
    await markWorkflowHilTaskConsumed(context.workspace, approvalTask.taskId)
  }
  return {
    shortCircuit: true,
    effect: !decision.timedOut ? { approvalRejected: true } : undefined,
  }
}

async function executeHumanNode(
  context: RunNodeExecutionContext,
): Promise<RunNodeExecutionResult> {
  const node = context.node
  const state = context.state
  await context.beginNodeExecution()
  const humanConfig = node.config as HumanNodeConfig
  state.status = "waiting_human"
  const resolvedTask = await context.helpers.readHumanTaskResponse(
    context.workspace,
    node.id,
  )

  if (!resolvedTask) {
    const taskRequest = context.helpers.buildHumanTaskRequest(
      node,
      humanConfig,
      context.incomingContent,
    )
    const taskRecord = await upsertHumanHilTask({
      workspace: context.workspace,
      runId: context.runId,
      workflowName: context.workflow.name,
      workflowPath: context.workflowPath,
      projectPath: context.projectPath,
      nodeId: node.id,
      request: taskRequest,
    })
    state.humanTask = {
      taskId: taskRecord.taskId,
      status: taskRecord.state.status,
    }
    await context.persistCheckpoint()
    await context.runtime.emitEvent({
      type: "human-task-created",
      runId: context.runId,
      nodeId: node.id,
      taskId: taskRecord.taskId,
      title: taskRecord.state.title,
    })
    return {
      shortCircuit: true,
      effect: {
        blockedForHuman: true,
        blockedByTaskId: taskRecord.taskId,
        blockedByNodeId: node.id,
      },
    }
  }

  await context.runtime.emitEvent({
    type: "human-task-resolved",
    runId: context.runId,
    nodeId: node.id,
    taskId: resolvedTask.taskId,
    resolution: resolvedTask.resolution,
  })

  state.humanTask = {
    taskId: resolvedTask.taskId,
    status:
      resolvedTask.resolution === "submitted"
        ? "answered"
        : resolvedTask.resolution,
  }

  const buildHumanEnvelope = (ok: boolean) =>
    context.helpers.createNodeOutput(
      node,
      JSON.stringify(
        {
          ok,
          taskId: resolvedTask.taskId,
          resolution: resolvedTask.resolution,
          answers: resolvedTask.answers,
        },
        null,
        2,
      ),
      {
        ...context.helpers.pickPassThroughMetadata(context.incomingInput),
      },
    )

  if (resolvedTask.resolution === "submitted") {
    await markWorkflowHilTaskConsumed(context.workspace, resolvedTask.taskId)
    return { output: buildHumanEnvelope(true) }
  }
  if (
    resolvedTask.resolution === "rejected" &&
    humanConfig.rejectAction === "complete_with_reject_response"
  ) {
    await markWorkflowHilTaskConsumed(context.workspace, resolvedTask.taskId)
    return { output: buildHumanEnvelope(false) }
  }
  if (
    resolvedTask.resolution === "timed_out" &&
    humanConfig.timeoutAction === "complete_with_timeout_response"
  ) {
    await markWorkflowHilTaskConsumed(context.workspace, resolvedTask.taskId)
    return { output: buildHumanEnvelope(false) }
  }

  state.status = "failed"
  state.completedAt = Date.now()
  state.error =
    resolvedTask.resolution === "timed_out"
      ? "Human task timed out"
      : "Rejected by human reviewer"
  await context.runtime.emitEvent({
    type: "node-error",
    runId: context.runId,
    nodeId: node.id,
    error: state.error,
  })
  await markWorkflowHilTaskConsumed(context.workspace, resolvedTask.taskId)
  return { shortCircuit: true }
}

export async function executeNodeByType(
  context: RunNodeExecutionContext,
): Promise<RunNodeExecutionResult> {
  switch (context.node.type) {
    case "input":
      return executeInputNode(context)
    case "skill":
      return executeSkillNode(context)
    case "evaluator":
      return executeEvaluatorNode(context)
    case "splitter":
      return executeSplitterNode(context)
    case "merger":
      return executeMergerNode(context)
    case "approval":
      return executeApprovalNode(context)
    case "human":
      return executeHumanNode(context)
    case "output":
      return executeOutputNode(context)
    default:
      throw new Error(
        `Node executor not yet extracted for ${(context.node as { type: string }).type}`,
      )
  }
}
