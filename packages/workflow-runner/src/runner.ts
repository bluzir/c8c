import { execFile as execFileCb } from "node:child_process"
import { access, mkdtemp, mkdir, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { promisify } from "node:util"
import YAML from "yaml"
import { drainExecutionHandle } from "./lib/agent-execution.js"
import { checkOutputHeuristics } from "./lib/output-heuristics.js"
import { withExecutionSlot } from "./lib/execution-pool.js"
import { buildEvaluatorPrompt, parseEvaluatorOutput } from "./lib/evaluator.js"
import {
  getOutgoingEdges,
} from "./lib/graph-engine.js"
import { LogParser } from "./lib/log-parser.js"
import { buildMergerPrompt, mergeResults } from "./lib/node-executors/merger.js"
import {
  buildSplitterPrompt,
  buildSplitterRecoveryPrompt,
  heuristicSplitInput,
  parseSplitterOutput,
  shouldRetrySplitter,
} from "./lib/node-executors/splitter.js"
import { buildNodeMeta, classifyError, collectMetrics, estimateCost } from "./lib/observability.js"
import {
  collapseSplitterExpansion,
  expandSplitter,
  type RuntimeWorkflow,
  type Subtask,
} from "./lib/runtime-graph.js"
import {
  createRunInterruptRegistry,
  persistResolvedApproval,
  readApprovalDecision,
} from "./lib/run-interrupts.js"
import {
  finalizeRunPidManifest,
  initRunPidManifest,
  recordRunPidExit,
  recordRunPidStart,
  type RunPidManifestMode,
} from "./lib/run-pid-manifest.js"
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
import { executeNodeByType } from "./lib/run-node-executors.js"
import { writeFileAtomic } from "./lib/atomic-write.js"
import { cleanupRunWorkspaces } from "./lib/run-workspace-retention.js"
import {
  approvalTaskId,
  getWorkflowHilTask,
  humanTaskId,
  markWorkflowHilTaskConsumed,
  upsertApprovalHilTask,
  upsertHumanHilTask,
} from "./hil-store.js"
import {
  getDefaultModelForProvider,
  resolveNodeProvider,
  resolveWorkflowProvider,
} from "./provider-metadata.js"
import type {
  AgentExecutionHandle,
  AgentExecutionSummary,
  AgentRunOptions,
  ApprovalNodeConfig,
  DiscoveredSkill,
  ErrorKind,
  EvaluatorNodeConfig,
  HumanNodeConfig,
  HumanTaskRequest,
  LogEntry,
  MergerNodeConfig,
  NodeInput,
  NodeOnErrorPolicy,
  NodeRetryBackoff,
  NodeState,
  NodeRuntimeConfig,
  OutputNodeConfig,
  PermissionMode,
  ProviderId,
  RunStatus,
  RuntimeMetaEntry,
  SkillNodeConfig,
  SplitterNodeConfig,
  Workflow,
  WorkflowEdge,
  WorkflowEvent,
  WorkflowInput,
  WorkflowNode,
} from "./schema.js"

export { writeWorkflowApprovalDecision } from "./lib/run-interrupts.js"
export type { PersistedRunManifest, WorkflowRunSnapshot } from "./lib/run-state-store.js"

export type WebSearchBackend = "builtin" | "exa"
export type ApprovalBehavior = "wait" | "suspend"

export interface WorkflowWorkspaceStore {
  createRunWorkspace(runId: string, projectPath?: string): Promise<string>
}

export interface WorkflowLogger {
  info?(component: string, event: string, context?: Record<string, unknown>): void
  warn(component: string, event: string, context?: Record<string, unknown>): void
}

export interface WorkflowTelemetrySink {
  track(event: string, payload: Record<string, unknown>): void | Promise<void>
}

export interface WorkflowRunnerDeps {
  startProviderTask(providerId: ProviderId, options: AgentRunOptions): Promise<AgentExecutionHandle>
  resolveWorkflowProviderId?(workflow: Workflow): Promise<ProviderId>
  resolveNodeProviderId?(node: WorkflowNode, workflow: Workflow): Promise<ProviderId>
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

interface ResolvedRetryPolicy {
  enabled: boolean
  maxTries: number
  waitMs: number
  backoff: NodeRetryBackoff
  retryOn: Set<ErrorKind>
}

interface ResolvedRuntimePolicy {
  onError: NodeOnErrorPolicy
  retry: ResolvedRetryPolicy
}

interface SpawnTrackingContext {
  workspace: string
  runId: string
  mode: RunPidManifestMode
  role: string
  nodeId?: string
}

interface WorkflowRuntimeContext {
  emitEvent: (event: WorkflowEvent) => Promise<void>
  controller: AbortController
}

const execFile = promisify(execFileCb)

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

const RETRYABLE_ERROR_KINDS: ErrorKind[] = ["tool", "model", "timeout", "unknown", "policy", "network"]
const CLAUDE_LIMIT_RE = /\b(rate limit(?:ed)?|usage limit|quota(?: exceeded)?|too many requests|http\s*429|status\s*429|credit balance|billing|exceeded (?:your )?(?:usage|rate|monthly|spend|token) limit|limit reached)\b/i
const MAX_TURNS_RE = /\b(?:error_max_turns|max turns?|turn limit)\b/i
const PARTIAL_PROGRESS_TOOLS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"])

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

async function runGitCommand(args: string[], cwd: string): Promise<string> {
  const { stdout } = await withExecutionSlot(() =>
    execFile("git", args, { cwd, encoding: "utf-8" }),
  )
  return String(stdout || "").trimEnd()
}

export function createFilesystemWorkspaceStore(): WorkflowWorkspaceStore {
  const retentionSweeps = new Map<string, Promise<void>>()

  return {
    async createRunWorkspace(runId: string, projectPath?: string): Promise<string> {
      const workspaceBase = projectPath
        ? join(projectPath, ".c8c", "runs")
        : join(tmpdir(), "c8c-ws")
      await mkdir(workspaceBase, { recursive: true })
      const existingSweep = retentionSweeps.get(workspaceBase)
      if (existingSweep) {
        await existingSweep
      } else {
        const sweep = cleanupRunWorkspaces(workspaceBase).then(() => undefined, () => undefined)
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

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === "string") return code
  }
  return undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sanitizeNodeId(nodeId: string): string {
  return nodeId.replace(/[^a-zA-Z0-9-]/g, "_")
}

function makeRunId(prefix: string): string {
  return `${prefix}-${Date.now()}`
}

function getNodeRuntimeConfig(node: WorkflowNode): NodeRuntimeConfig | undefined {
  const config = node.config as { runtime?: NodeRuntimeConfig }
  return config.runtime
}

function resolveRuntimePolicy(node: WorkflowNode, isRuntimeClone?: boolean): ResolvedRuntimePolicy {
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

function computeRetryDelayMs(policy: ResolvedRetryPolicy, retriesUsed: number): number {
  const base = Math.max(0, policy.waitMs)
  if (base === 0) return 0
  if (policy.backoff === "linear") return base * Math.max(1, retriesUsed)
  if (policy.backoff === "exponential") return base * (2 ** Math.max(0, retriesUsed - 1))
  return base
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeLimitLine(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function collectClaudeFailureEvidence(logParser: LogParser, stderrText: string): string[] {
  const evidence: string[] = []
  if (stderrText.trim()) evidence.push(stderrText)

  for (const entry of logParser.entries) {
    if (entry.type === "error") {
      evidence.push(entry.content)
      continue
    }
    if (entry.type === "tool_result" && entry.status === "error") {
      evidence.push(entry.output)
    }
  }

  if (evidence.length === 0 && logParser.textContent.trim()) {
    evidence.push(logParser.textContent)
  }

  return evidence
}

function detectClaudeLimitEvidence(logParser: LogParser, stderrText: string): string | undefined {
  const evidence = collectClaudeFailureEvidence(logParser, stderrText)
  for (const chunk of evidence) {
    for (const rawLine of chunk.split(/\r?\n/)) {
      const line = normalizeLimitLine(rawLine)
      if (!line) continue
      if (CLAUDE_LIMIT_RE.test(line)) return line.slice(0, 240)
    }

    const collapsed = normalizeLimitLine(chunk)
    if (collapsed && CLAUDE_LIMIT_RE.test(collapsed)) {
      return collapsed.slice(0, 240)
    }
  }
  return undefined
}

function detectMaxTurnsEvidence(logParser: LogParser, stderrText: string): string | undefined {
  const evidence = [
    stderrText,
    ...collectClaudeFailureEvidence(logParser, ""),
    logParser.rawOutput,
  ]

  for (const chunk of evidence) {
    if (!chunk?.trim()) continue

    for (const rawLine of chunk.split(/\r?\n/)) {
      const line = normalizeLimitLine(rawLine)
      if (!line) continue
      if (MAX_TURNS_RE.test(line)) return line.slice(0, 240)
    }

    const collapsed = normalizeLimitLine(chunk)
    if (collapsed && MAX_TURNS_RE.test(collapsed)) {
      return collapsed.slice(0, 240)
    }
  }

  return undefined
}

function hasPartialSkillProgress(log: LogEntry[], partialOutput: NodeInput | undefined): boolean {
  if (partialOutput?.metadata?.output_source && partialOutput.metadata.output_source !== "input_fallback") {
    return true
  }

  return log.some((entry) =>
    entry.type === "tool_result"
    && entry.status === "success"
    && PARTIAL_PROGRESS_TOOLS.has(entry.tool),
  )
}

function buildAgentFailureDetail(
  providerId: ProviderId,
  result: AgentExecutionSummary,
  logParser: LogParser,
  stderrText: string,
): string {
  if (result.exitCode === null) {
    if (result.error?.trim()) return result.error.trim()
    return providerId === "codex"
      ? "Could not start Codex CLI — check that 'codex' is in your PATH and accessible"
      : "Could not start Claude CLI — check that 'claude' is in your PATH and accessible"
  }

  const limitEvidence = providerId === "claude"
    ? detectClaudeLimitEvidence(logParser, stderrText)
    : undefined
  if (limitEvidence && providerId === "claude") {
    return `Claude usage limit reached: ${limitEvidence}. Wait for the limit window to reset or use an account/key with available quota, then rerun.`
  }

  const maxTurnsEvidence = detectMaxTurnsEvidence(logParser, stderrText)
  if (maxTurnsEvidence) {
    return `max turns reached before finishing: ${maxTurnsEvidence}`
  }

  return `exit code ${result.exitCode}`
}

function incomingEdgePriority(type: WorkflowEdge["type"]): number {
  if (type === "fail") return 0
  if (type === "pass") return 1
  return 2
}

function selectIncomingContent(
  incomingEdges: WorkflowEdge[],
  nodeStates: Record<string, NodeState>,
  fallback: string,
): string {
  const incoming = selectIncomingInput(incomingEdges, nodeStates)
  return incoming?.content || fallback
}

function selectIncomingInput(
  incomingEdges: WorkflowEdge[],
  nodeStates: Record<string, NodeState>,
): NodeInput | null {
  const candidates = incomingEdges.flatMap((edge) => {
    const sourceState = nodeStates[edge.source]
    const output = sourceState?.output
    const content = output?.content
    if (!output || typeof content !== "string" || content.length === 0) return []
    return [{
      edge,
      output,
      completedAt: sourceState.completedAt ?? 0,
    }]
  })

  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    if (a.completedAt !== b.completedAt) return b.completedAt - a.completedAt
    const typeDiff = incomingEdgePriority(a.edge.type) - incomingEdgePriority(b.edge.type)
    if (typeDiff !== 0) return typeDiff
    const sourceDiff = a.edge.source.localeCompare(b.edge.source)
    if (sourceDiff !== 0) return sourceDiff
    return a.edge.id.localeCompare(b.edge.id)
  })

  return candidates[0].output
}

function compactArtifactLabel(value: string | undefined | null, maxLength = 48): string | null {
  if (!value) return null
  const normalized = value.replace(/\s+/g, " ").trim()
  if (!normalized) return null
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trimEnd()}...`
}

function humanizeIdentifier(value: string): string {
  const parts = value
    .split(/[-_/]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return value
  return parts
    .map((part) => {
      if (part.length <= 3) return part.toUpperCase()
      return `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`
    })
    .join(" ")
}

function normalizedSkillRef(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : ""
}

function buildArtifactMetadata(
  node: WorkflowNode,
): Pick<NodeInput["metadata"], "artifact_type" | "artifact_label" | "artifact_role"> {
  switch (node.type) {
    case "input":
      return {
        artifact_type: "source_input",
        artifact_label: "Source input",
        artifact_role: "input",
      }
    case "skill": {
      const config = node.config as SkillNodeConfig
      const skillRef = normalizedSkillRef(config.skillRef)
      const skillName = skillRef
        ? humanizeIdentifier(skillRef.split("/").filter(Boolean).pop() || skillRef)
        : humanizeIdentifier(node.id)
      return {
        artifact_type: "stage_output",
        artifact_label: `${skillName} output`,
        artifact_role: "intermediate",
      }
    }
    case "evaluator":
      return {
        artifact_type: "quality_decision",
        artifact_label: "Quality decision",
        artifact_role: "decision",
      }
    case "splitter":
      return {
        artifact_type: "branch_assignments",
        artifact_label: "Branch assignments",
        artifact_role: "intermediate",
      }
    case "merger": {
      const config = node.config as MergerNodeConfig
      const artifactLabel = config.strategy === "summarize"
        ? "Merged summary"
        : config.strategy === "select_best"
          ? "Best branch result"
          : "Merged result"
      return {
        artifact_type: "merged_result",
        artifact_label: artifactLabel,
        artifact_role: "intermediate",
      }
    }
    case "approval":
      return {
        artifact_type: "approved_content",
        artifact_label: "Approved content",
        artifact_role: "decision",
      }
    case "human":
      return {
        artifact_type: "human_response",
        artifact_label: "Human response",
        artifact_role: "decision",
      }
    case "output": {
      const config = node.config as OutputNodeConfig
      return {
        artifact_type: "final_result",
        artifact_label: compactArtifactLabel(config.title, 52) || "Final result",
        artifact_role: "final",
      }
    }
  }

  return {
    artifact_type: "stage_output",
    artifact_label: "Stage output",
    artifact_role: "intermediate",
  }
}

function buildNodeOutputMetadata(
  node: WorkflowNode,
  metadata: Omit<Partial<NodeInput["metadata"]>, "source"> = {},
): NodeInput["metadata"] {
  return {
    source: node.id,
    ...buildArtifactMetadata(node),
    ...metadata,
  }
}

function createNodeOutput(
  node: WorkflowNode,
  content: string,
  metadata: Omit<Partial<NodeInput["metadata"]>, "source"> = {},
): NodeInput {
  return {
    content,
    metadata: buildNodeOutputMetadata(node, metadata),
  }
}

function normalizeDiagnosticSummaryTone(value: unknown): NodeInput["metadata"]["diagnostic_summary"]["tone"] | undefined {
  return value === "neutral" || value === "warning" || value === "danger"
    ? value
    : undefined
}

function normalizeDiagnosticCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined
  return Math.floor(value)
}

function normalizeDiagnosticText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  return normalized || undefined
}

function normalizeDiagnosticCategorySummary(
  value: unknown,
): NonNullable<NodeInput["metadata"]["diagnostic_summary"]>["categories"][number] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const id = normalizeDiagnosticText(record.id)
  const label = normalizeDiagnosticText(record.label)
  if (!id || !label) return null
  return {
    id,
    label,
    detail: normalizeDiagnosticText(record.detail),
    severity: normalizeDiagnosticSummaryTone(record.severity),
    count: normalizeDiagnosticCount(record.count),
  }
}

function normalizeDiagnosticFindingSummary(
  value: unknown,
): NonNullable<NodeInput["metadata"]["diagnostic_summary"]>["topFindings"][number] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const id = normalizeDiagnosticText(record.id)
  const label = normalizeDiagnosticText(record.label)
  if (!id || !label) return null
  return {
    id,
    label,
    detail: normalizeDiagnosticText(record.detail),
    severity: normalizeDiagnosticSummaryTone(record.severity),
  }
}

function normalizeDiagnosticSummary(
  value: unknown,
): NodeInput["metadata"]["diagnostic_summary"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const severityCountsRecord = (record.severity_counts ?? record.severityCounts) as Record<string, unknown> | undefined
  const severityCounts = severityCountsRecord && typeof severityCountsRecord === "object" && !Array.isArray(severityCountsRecord)
    ? {
        critical: normalizeDiagnosticCount(severityCountsRecord.critical),
        high: normalizeDiagnosticCount(severityCountsRecord.high),
        medium: normalizeDiagnosticCount(severityCountsRecord.medium),
        low: normalizeDiagnosticCount(severityCountsRecord.low),
        info: normalizeDiagnosticCount(severityCountsRecord.info),
      }
    : undefined
  const categories = Array.isArray(record.categories)
    ? record.categories
      .map((entry) => normalizeDiagnosticCategorySummary(entry))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : []
  const topFindingsSource = record.top_findings ?? record.topFindings
  const topFindings = Array.isArray(topFindingsSource)
    ? topFindingsSource
      .map((entry) => normalizeDiagnosticFindingSummary(entry))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : []
  const summary: NodeInput["metadata"]["diagnostic_summary"] = {
    headline: normalizeDiagnosticText(record.headline),
    summary: normalizeDiagnosticText(record.summary),
    tone: normalizeDiagnosticSummaryTone(record.tone),
    rootCause: normalizeDiagnosticText(record.root_cause ?? record.rootCause),
    recommendedNextAction: normalizeDiagnosticText(record.recommended_next_action ?? record.recommendedNextAction),
    severityCounts: severityCounts && Object.values(severityCounts).some((entry) => entry !== undefined)
      ? severityCounts
      : undefined,
    categories: categories.length > 0 ? categories : undefined,
    topFindings: topFindings.length > 0 ? topFindings : undefined,
  }

  return Object.values(summary).some((entry) => entry !== undefined) ? summary : undefined
}

function extractDiagnosticSummaryDocument(
  content: string,
): { body: string; diagnosticSummary?: NodeInput["metadata"]["diagnostic_summary"] } {
  if (!content.startsWith("---")) {
    return { body: content }
  }
  const end = content.indexOf("\n---", 3)
  if (end === -1) {
    return { body: content }
  }

  let parsed: unknown
  try {
    parsed = YAML.parse(content.slice(3, end))
  } catch {
    return { body: content }
  }

  const summary = normalizeDiagnosticSummary(
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).diagnostic_summary
      : undefined,
  )
  if (!summary) {
    return { body: content }
  }

  const body = content.slice(end + 4).replace(/^(?:\r?\n)+/, "")
  return { body, diagnosticSummary: summary }
}

function createAgentNodeOutput(
  node: WorkflowNode,
  content: string,
  metadata: Omit<Partial<NodeInput["metadata"]>, "source"> = {},
): NodeInput {
  const structuredDocument = extractDiagnosticSummaryDocument(content)
  return createNodeOutput(node, structuredDocument.body, {
    ...metadata,
    ...(structuredDocument.diagnosticSummary
      ? { diagnostic_summary: structuredDocument.diagnosticSummary }
      : {}),
  })
}

function pickPassThroughMetadata(
  input: NodeInput | null | undefined,
): Pick<Partial<NodeInput["metadata"]>, "diagnostic_summary"> {
  return input?.metadata?.diagnostic_summary
    ? { diagnostic_summary: input.metadata.diagnostic_summary }
    : {}
}

function buildContinueOutput(
  node: WorkflowNode,
  incomingContent: string,
  partialOutput: NodeInput | undefined,
): NodeInput {
  if (partialOutput) {
    return {
      ...partialOutput,
      metadata: {
        ...partialOutput.metadata,
        partial_on_error: true,
        error_policy_applied: "continue",
      },
    }
  }
  return createNodeOutput(node, incomingContent, {
    output_source: "input_fallback",
    partial_on_error: true,
    error_policy_applied: "continue",
  })
}

function buildErrorEnvelopeOutput(
  node: WorkflowNode,
  incomingContent: string,
  partialOutput: NodeInput | undefined,
  errorKind: ErrorKind,
  message: string,
  attempt: number,
): NodeInput {
  const fallback = partialOutput?.content || incomingContent
  return {
    content: JSON.stringify({
      ok: false,
      error: {
        kind: errorKind,
        message,
        nodeId: node.id,
        attempt,
      },
      fallback: {
        content: fallback,
      },
    }, null, 2),
    metadata: buildNodeOutputMetadata(node, {
      partial_on_error: true,
      error_policy_applied: "continue_error_output",
      error_envelope: true,
    }),
  }
}

function collectUpstreamIds(
  nodeId: string,
  edges: { source: string; target: string }[],
  nodeStates: Record<string, { status: string }>,
): string[] {
  const visited = new Set<string>()
  const queue = edges.filter((edge) => edge.target === nodeId).map((edge) => edge.source)
  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    if (nodeStates[id]?.status !== "completed") continue
    visited.add(id)
    for (const edge of edges) {
      if (edge.target === id) queue.push(edge.source)
    }
  }
  return [...visited]
}

function looksLikeJsonDocument(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  const candidate = codeBlockMatch ? codeBlockMatch[1].trim() : trimmed
  if (!candidate.startsWith("{") && !candidate.startsWith("[")) return false
  try {
    JSON.parse(candidate)
    return true
  } catch {
    return false
  }
}

function looksLikeProgressNarration(value: string): boolean {
  const text = value.toLowerCase()
  const markers = [
    "writing the output to the content file",
    "now i have a complete picture",
    "write failed",
    "write result",
    "read result",
    "thinking...",
    "готово.",
    "извлечено",
  ]
  return markers.some((marker) => text.includes(marker))
}

function pickSkillOutput(
  mode: SkillNodeConfig["outputMode"] | undefined,
  stdoutText: string,
  fileContent: string | null,
  effectiveInput: string,
): { content: string; source: "stdout" | "content_file" | "input_fallback" } {
  const effectiveMode = mode || "auto"
  const stdout = stdoutText.trim()
  const fileRaw = fileContent ?? ""
  const file = fileRaw.trim()
  const input = effectiveInput.trim()
  const fileChanged = file.length > 0 && file !== input

  if (effectiveMode === "stdout") {
    if (stdout) return { content: stdout, source: "stdout" }
    if (fileChanged) return { content: fileRaw, source: "content_file" }
    return { content: effectiveInput, source: "input_fallback" }
  }

  if (effectiveMode === "content_file") {
    if (fileChanged) return { content: fileRaw, source: "content_file" }
    if (stdout) return { content: stdout, source: "stdout" }
    return { content: effectiveInput, source: "input_fallback" }
  }

  if (!stdout && fileChanged) return { content: fileRaw, source: "content_file" }
  if (stdout && !fileChanged) return { content: stdout, source: "stdout" }
  if (!stdout && !fileChanged) return { content: effectiveInput, source: "input_fallback" }

  const stdoutJson = looksLikeJsonDocument(stdout)
  const fileJson = looksLikeJsonDocument(fileRaw)
  const stdoutLooksNarrative = looksLikeProgressNarration(stdout)
  const fileSubstantiallyLarger = fileRaw.length > Math.max(stdout.length * 1.25, stdout.length + 200)

  if (
    stdoutLooksNarrative
    || (fileJson && !stdoutJson)
    || (stdout.length < 120 && fileRaw.length > 220)
    || fileSubstantiallyLarger
  ) {
    return { content: fileRaw, source: "content_file" }
  }

  return { content: stdout, source: "stdout" }
}

function hasChangedContent(content: string | null, effectiveInput: string): boolean {
  if (!content) return false
  const trimmed = content.trim()
  if (!trimmed) return false
  return trimmed !== effectiveInput.trim()
}

function pickPreferredContentFile(
  primaryFileContent: string | null,
  mirroredFileContent: string | null,
  effectiveInput: string,
): string | null {
  if (!primaryFileContent && !mirroredFileContent) return null

  const primaryChanged = hasChangedContent(primaryFileContent, effectiveInput)
  const mirroredChanged = hasChangedContent(mirroredFileContent, effectiveInput)

  if (primaryChanged && mirroredChanged) {
    const primaryJson = looksLikeJsonDocument(primaryFileContent || "")
    const mirroredJson = looksLikeJsonDocument(mirroredFileContent || "")
    if (primaryJson !== mirroredJson) {
      return mirroredJson ? mirroredFileContent : primaryFileContent
    }
    return (mirroredFileContent || "").length > (primaryFileContent || "").length
      ? mirroredFileContent
      : primaryFileContent
  }

  if (mirroredChanged) return mirroredFileContent
  if (primaryChanged) return primaryFileContent
  return primaryFileContent || mirroredFileContent
}

function sanitizeInvalidUnicode(value: string): string {
  let out = ""
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    const isHigh = code >= 0xD800 && code <= 0xDBFF
    const isLow = code >= 0xDC00 && code <= 0xDFFF

    if (isHigh) {
      const next = value.charCodeAt(i + 1)
      const nextIsLow = next >= 0xDC00 && next <= 0xDFFF
      if (nextIsLow) {
        out += value[i] + value[i + 1]
        i++
      } else {
        out += "\uFFFD"
      }
      continue
    }

    if (isLow) {
      out += "\uFFFD"
      continue
    }

    out += value[i]
  }
  return out
}

async function buildSkillNodeOutput(
  logger: WorkflowLogger,
  node: WorkflowNode,
  config: SkillNodeConfig,
  stdoutText: string,
  contentFile: string,
  effectiveInput: string,
  partialOnError = false,
): Promise<NodeInput> {
  let primaryFileContent: string | null = null
  try {
    primaryFileContent = await readFile(contentFile, "utf-8")
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      logger.warn("workflow-runner", "skill_content_file_read_failed", {
        contentFile,
        error: errorMessage(error),
      })
    }
  }

  const mirroredContentFile = join(dirname(contentFile), "outputs", basename(contentFile))
  let mirroredFileContent: string | null = null
  if (mirroredContentFile !== contentFile) {
    try {
      mirroredFileContent = await readFile(mirroredContentFile, "utf-8")
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        logger.warn("workflow-runner", "skill_mirrored_content_file_read_failed", {
          contentFile: mirroredContentFile,
          error: errorMessage(error),
        })
      }
    }
  }

  const fileContent = pickPreferredContentFile(primaryFileContent, mirroredFileContent, effectiveInput)
  const selectedOutput = pickSkillOutput(config.outputMode, stdoutText, fileContent, effectiveInput)
  return createAgentNodeOutput(node, selectedOutput.content || effectiveInput, {
    output_source: selectedOutput.source,
    ...(partialOnError ? { partial_on_error: true } : {}),
  })
}

async function writeNodeOutputFile(workspace: string, nodeId: string, content: string): Promise<void> {
  await writeFileAtomic(join(workspace, "outputs", `${sanitizeNodeId(nodeId)}.md`), content)
}

function getClaudeResumeSessionId(
  providerId: ProviderId,
  state: NodeState | undefined,
): string | undefined {
  if (providerId !== "claude") return undefined
  if (state?.meta?.backend !== "claude_sdk") return undefined
  const sessionId = state.meta.provider_session_id?.trim()
  return sessionId ? sessionId : undefined
}


function normalizeSkillRef(ref: string): string {
  return ref.trim().toLowerCase()
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content
  const end = content.indexOf("\n---", 3)
  if (end === -1) return content
  return content.slice(end + 4).trim()
}

function labelFromSkillPath(path: string): string {
  const normalized = path.replace(/\\/g, "/")
  if (normalized.endsWith("/SKILL.md")) {
    return basename(dirname(path))
  }
  if (normalized.endsWith(".md")) {
    return basename(path, ".md")
  }
  return basename(path)
}

function buildSkillPathHint(path: string): string {
  const skillDir = path.endsWith(".md") ? dirname(path) : path
  const lines = [
    `Skill root directory: ${skillDir}`,
    "Use this real directory for any referenced checklists, templates, scripts, or sibling files.",
  ]

  const skillName = basename(skillDir)
  const packDir = dirname(skillDir)
  if (basename(packDir) === "gstack") {
    const reviewDir = join(packDir, "review")
    const qaDir = join(packDir, "qa")
    const browseDir = join(packDir, "browse")
    const binDir = join(packDir, "bin")
    lines.push(
      `If the instructions mention ".claude/skills/${skillName}", ".claude/skills/gstack/${skillName}", or "~/.claude/skills/gstack/${skillName}", use "${skillDir}" instead.`,
    )
    lines.push(
      `If the instructions mention ".claude/skills/gstack" or "~/.claude/skills/gstack", use "${packDir}" instead.`,
    )
    lines.push(`Sibling gstack skill pack directory: ${packDir}`)
    lines.push(
      `Resolve ".claude/skills/review/..." or "review/..." references under "${reviewDir}".`,
    )
    lines.push(`Resolve "qa/..." references under "${qaDir}".`)
    lines.push(`Resolve "browse/..." references under "${browseDir}".`)
    lines.push(`Resolve "bin/..." helper references under "${binDir}".`)
  }

  return lines.join("\n")
}

interface ResolvedSkillContext {
  text: string
  skillPaths: string[]
}

function createSkillContextResolver(
  logger: WorkflowLogger,
  workspace: string,
  projectPath: string | undefined,
  scanSkills?: (scanRoot: string) => Promise<DiscoveredSkill[]>,
) {
  const contextCache = new Map<string, ResolvedSkillContext>()
  const skillBodyCache = new Map<string, string>()
  let scannedSkills: DiscoveredSkill[] | null = null

  const ensureScannedSkills = async () => {
    if (scannedSkills) return scannedSkills
    if (!scanSkills) {
      scannedSkills = []
      return scannedSkills
    }
    const scanRoot = projectPath || workspace
    try {
      scannedSkills = await scanSkills(scanRoot)
    } catch (error) {
      logger.warn("workflow-runner", "skill_context_scan_skills_failed", {
        scanRoot,
        error: errorMessage(error),
      })
      scannedSkills = []
    }
    return scannedSkills
  }

  const readSkillBody = async (path: string): Promise<string> => {
    const cached = skillBodyCache.get(path)
    if (cached !== undefined) return cached
    try {
      const content = await readFile(path, "utf-8")
      const body = stripFrontmatter(content).trim()
      skillBodyCache.set(path, body)
      return body
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        logger.warn("workflow-runner", "skill_context_skill_read_failed", {
          path,
          error: errorMessage(error),
        })
      }
      skillBodyCache.set(path, "")
      return ""
    }
  }

  return async (
    input: {
      skillRefs?: string[]
      skillPaths?: string[]
    },
  ): Promise<ResolvedSkillContext> => {
    const refs = (input.skillRefs || []).map((ref) => ref.trim()).filter(Boolean)
    const skillPaths = (input.skillPaths || []).map((path) => path.trim()).filter(Boolean)
    if (refs.length === 0 && skillPaths.length === 0) return { text: "", skillPaths: [] }

    const cacheKey = [
      ...refs.map((ref) => `ref:${normalizeSkillRef(ref)}`),
      ...skillPaths.map((path) => `path:${path}`),
    ].join("|")
    const cached = contextCache.get(cacheKey)
    if (cached !== undefined) return cached

    const sections: string[] = []
    const seenPaths = new Set<string>()

    for (const skillPath of skillPaths) {
      if (seenPaths.has(skillPath)) continue
      seenPaths.add(skillPath)
      const body = await readSkillBody(skillPath)
      const label = labelFromSkillPath(skillPath)
      if (!body) {
        sections.push(`### Skill: ${label}\nSkill file was found but could not be read.`)
        continue
      }
      sections.push(`### Skill: ${label}\n${buildSkillPathHint(skillPath)}\n\n${body}`)
    }

    const discovered = refs.length > 0 ? await ensureScannedSkills() : []
    for (const ref of refs) {
      const normalizedRef = normalizeSkillRef(ref)
      const found = discovered.find((skill) => (
        normalizeSkillRef(`${skill.category}/${skill.name}`) === normalizedRef
          || normalizeSkillRef(skill.name) === normalizedRef
      ))

      if (!found) {
        sections.push(`### Skill: ${ref}\nSkill not found in scanned project/user skills.`)
        continue
      }
      if (seenPaths.has(found.path)) continue
      seenPaths.add(found.path)

      const body = await readSkillBody(found.path)
      if (!body) {
        sections.push(`### Skill: ${found.category}/${found.name}\nSkill file was found but could not be read.`)
        continue
      }
      sections.push(`### Skill: ${found.category}/${found.name}\n${buildSkillPathHint(found.path)}\n\n${body}`)
    }

    const context = {
      text: sections.join("\n\n"),
      skillPaths: Array.from(seenPaths),
    }
    contextCache.set(cacheKey, context)
    return context
  }
}

async function spawnProviderTracked(
  deps: WorkflowRunnerDeps,
  providerId: ProviderId,
  options: AgentRunOptions,
  tracking: SpawnTrackingContext,
  callbacks: {
    onExecutionStart?: () => void | Promise<void>
    onSpawn?: (pid: number) => void
    onProviderSession?: (sessionId: string) => void | Promise<void>
    onLogEntry?: (entry: LogEntry) => void
    onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void
    onStderr?: (text: string) => void
    onError?: (text: string) => void
  } = {},
): Promise<AgentExecutionSummary> {
  let trackedPid: number | undefined
  const result = await withExecutionSlot(async (ticket) => {
    if (ticket.queueWaitMs > 0) {
      deps.logger?.info?.("workflow-runner", "provider_execution_waited", {
        runId: tracking.runId,
        nodeId: tracking.nodeId,
        providerId,
        role: tracking.role,
        queueWaitMs: ticket.queueWaitMs,
      })
    }

    await callbacks.onExecutionStart?.()
    const handle = await deps.startProviderTask(providerId, options)
    return drainExecutionHandle(handle, {
      onSpawn: (pid) => {
        trackedPid = pid
        callbacks.onSpawn?.(pid)
        void recordRunPidStart(
          tracking.workspace,
          tracking.runId,
          tracking.mode,
          pid,
          tracking.role,
          tracking.nodeId,
        )
      },
      onProviderSession: callbacks.onProviderSession,
      onLogEntry: callbacks.onLogEntry,
      onUsage: callbacks.onUsage,
      onStderr: callbacks.onStderr,
      onError: callbacks.onError,
    })
  })

  const pid = typeof trackedPid === "number" ? trackedPid : result.pid
  if (typeof pid === "number") {
    void recordRunPidExit(
      tracking.workspace,
      tracking.runId,
      tracking.mode,
      pid,
      { exitCode: result.exitCode, signal: result.signal },
    )
  }

  return result
}

function isHumanTaskRequest(value: unknown): value is HumanTaskRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const candidate = value as Partial<HumanTaskRequest>
  return candidate.version === 1
    && (candidate.kind === "form" || candidate.kind === "approval")
    && typeof candidate.title === "string"
    && Array.isArray(candidate.fields)
}

function buildStaticApprovalHumanTaskRequest(
  nodeId: string,
  config: HumanNodeConfig,
  incomingContent: string,
): HumanTaskRequest {
  const instructions = typeof config.staticRequest?.instructions === "string"
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
        ? [{
            id: "editedContent",
            type: "textarea" as const,
            label: "Edited content",
            description: "Optional edits to use when continuing this flow.",
          }]
        : []),
    ],
    defaults: {
      approved: true,
      ...(config.staticRequest?.metadata?.allowEdit ? { editedContent: incomingContent } : {}),
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
      return buildStaticApprovalHumanTaskRequest(node.id, config, incomingContent)
    }
    if (!config.staticRequest) {
      throw new Error(`Human node ${node.id} requires staticRequest when requestSource=static`)
    }
    if (!isHumanTaskRequest(config.staticRequest)) {
      throw new Error(`Human node ${node.id} has invalid staticRequest`)
    }
    return {
      ...config.staticRequest,
      metadata: {
        ...config.staticRequest.metadata,
        generatedByNodeId: config.staticRequest.metadata?.generatedByNodeId || node.id,
      },
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(incomingContent)
  } catch {
    throw new Error(`Human node ${node.id} requires valid upstream JSON request`)
  }
  if (!isHumanTaskRequest(parsed)) {
    throw new Error(`Human node ${node.id} upstream JSON is not a valid HumanTaskRequest`)
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
    latestResponse.resolution !== "submitted"
    && latestResponse.resolution !== "rejected"
    && latestResponse.resolution !== "timed_out"
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
  const workspaceStore = deps.workspaceStore || createFilesystemWorkspaceStore()
  const activeRuns = new Map<string, AbortController>()
  const pausedRuns = new Map<string, { paused: boolean; resume: (() => void) | null }>()
  const interrupts = createRunInterruptRegistry()
  const runWorkspaces = new Map<string, string>()

  const resolveWorkflowProviderId = deps.resolveWorkflowProviderId
    || (async (workflow: Workflow) => resolveWorkflowProvider(workflow, "claude"))
  const resolveNodeProviderId = deps.resolveNodeProviderId
    || (async (node: WorkflowNode, workflow: Workflow) => resolveNodeProvider(node, workflow, await resolveWorkflowProviderId(workflow)))

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

  function serializeLogExcerpt(log: LogEntry[] | undefined, maxLength = 500): string {
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
    const persistedInput = {
      ...session.persistedInput,
      value: inputContent,
    }

    await mkdir(join(workspace, "reports"), { recursive: true })
    await mkdir(join(workspace, "outputs"), { recursive: true })
    await mkdir(join(workspace, "logs"), { recursive: true })
    await mkdir(join(workspace, "approvals"), { recursive: true })
    await writeFileAtomic(join(workspace, "content.md"), inputContent)
    await writeFileAtomic(join(workspace, "input.json"), JSON.stringify(persistedInput, null, 2))

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
      ? await deps.prepareWorkspaceMcpConfig(workspace, projectPath, webSearchBackend)
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

    await persistRunState(workspace, nodeStates, runtimeWorkflow, persistedInput)
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
          if (state.metrics) total += state.metrics.tokens_in + state.metrics.tokens_out
        }
        return total
      }

      const processNode = async (nodeId: string): Promise<NodeLifecycleEffect | void> => {
        if (runtime.controller.signal.aborted) return
        const node = runtimeWorkflow.nodes.find((candidate) => candidate.id === nodeId)
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
          await runtime.emitEvent({ type: "node-start", runId, nodeId: node.id })
        }

        if (node.type !== "input" && node.type !== "output") {
          const budgetCost = workflow.defaults?.budget_cost_usd
          const budgetTokens = workflow.defaults?.budget_tokens
          if (budgetCost != null && getAccumulatedCost() >= budgetCost) {
            state.status = "skipped"
            state.completedAt = Date.now()
            state.errorKind = "policy"
            state.error = `Budget exceeded: $${getAccumulatedCost().toFixed(4)} >= $${budgetCost}`
            await runtime.emitEvent({ type: "node-error", runId, nodeId: node.id, error: state.error })
            return
          }
          if (budgetTokens != null && getAccumulatedTokens() >= budgetTokens) {
            state.status = "skipped"
            state.completedAt = Date.now()
            state.errorKind = "policy"
            state.error = `Token budget exceeded: ${getAccumulatedTokens()} >= ${budgetTokens}`
            await runtime.emitEvent({ type: "node-error", runId, nodeId: node.id, error: state.error })
            return
          }
        }

        let recoverOutputOnError: (() => Promise<NodeInput | undefined>) | undefined
        let incomingInput: NodeInput | null = null
        let incomingContent = inputContent

        try {
          const incoming = runtimeWorkflow.edges.filter((edge) => edge.target === node.id)
          incomingInput = selectIncomingInput(incoming, nodeStates)
          incomingContent = incomingInput?.content || inputContent

          let output: NodeInput | null = null

          switch (node.type) {
            case "input":
              await beginNodeExecution()
              output = createNodeOutput(node, inputContent)
              break

            case "skill": {
              const config = node.config as SkillNodeConfig
              const skillRef = normalizedSkillRef(config.skillRef)
              const nodeProviderId = await resolveNodeProviderId(node, workflow)
              const meta = runtimeWorkflow.runtimeMeta?.[node.id]
              const effectiveInputRaw = meta
                ? `Subtask: ${meta.subtaskKey}\n\n${meta.subtaskContent}\n\n--- Original Content ---\n${incomingContent}`
                : incomingContent
              const effectiveInput = sanitizeInvalidUnicode(effectiveInputRaw)
              const contentFile = join(workspace, `content-${sanitizeNodeId(node.id)}.md`)
              await writeFileAtomic(contentFile, effectiveInput)

              const workdir = projectPath || workspace
              const logParser = new LogParser()

              let retryFeedback = ""
              for (const edge of incoming) {
                if (edge.type !== "fail") continue
                const evalOutput = nodeStates[edge.source]?.output
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

              const upstreamIds = collectUpstreamIds(node.id, runtimeWorkflow.edges, nodeStates)
              const manifestLines: string[] = []
              for (const upstreamId of upstreamIds) {
                const upstreamNode = runtimeWorkflow.nodes.find((candidate) => candidate.id === upstreamId)
                const label = (upstreamNode?.config as Record<string, unknown>)?.label || upstreamNode?.type || upstreamId
                manifestLines.push(`- outputs/${sanitizeNodeId(upstreamId)}.md  (${label})`)
              }

              const skillContext = await resolveSkillContext({
                skillRefs: skillRef ? [skillRef] : undefined,
                skillPaths: config.skillPaths,
              })
              const additionalSkillDirs = [...new Set(
                skillContext.skillPaths
                  .map((path) => (path.endsWith(".md") ? dirname(path) : path))
                  .filter(Boolean),
              )]

              const prompt = sanitizeInvalidUnicode([
                `Workspace: ${workspace}`,
                `Content file: ${contentFile}`,
                "",
                ...(manifestLines.length > 0 ? ["Available upstream outputs:", ...manifestLines, ""] : []),
                ...(retryFeedback ? [retryFeedback] : []),
                ...(skillContext.text ? ["Skill instructions:", skillContext.text, ""] : []),
                config.prompt,
              ].join("\n"))
              const skillModel = workflow.defaults?.model || getDefaultModelForProvider(nodeProviderId)
              let skillBackend: AgentExecutionSummary["backend"]
              let skillProviderSessionId: string | null | undefined

              const updateSkillMetricsAndMeta = () => {
                const metrics = collectMetrics(logParser, state.startedAt!)
                metrics.cost_usd = estimateCost(skillModel, metrics.tokens_in, metrics.tokens_out)
                state.metrics = metrics
                state.meta = buildNodeMeta(
                  prompt,
                  skillModel,
                  skillRef || undefined,
                  skillBackend,
                  skillProviderSessionId,
                )
              }

              recoverOutputOnError = async () => {
                const remaining = logParser.flush()
                for (const entry of remaining) {
                  state.log.push(entry)
                  await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry })
                }
                updateSkillMetricsAndMeta()
                return buildSkillNodeOutput(
                  logger,
                  node,
                  config,
                  logParser.textContent,
                  contentFile,
                  effectiveInput,
                  true,
                )
              }

              const effectivePermissionMode: PermissionMode =
                config.permissionMode ?? workflow.defaults?.permissionMode ?? "edit"
              const mergedAllowed = [...new Set([
                ...(workflow.defaults?.allowedTools || []),
                ...(config.allowedTools || []),
              ])]
              const planDisallowed = effectivePermissionMode === "plan"
                ? ["Edit", "Write", "NotebookEdit"]
                : []
              const mergedDisallowed = [...new Set([
                ...(workflow.defaults?.disallowedTools || []),
                ...(config.disallowedTools || []),
                ...planDisallowed,
              ])]

              let preRunHead = ""
              let isGitRepo = false
              if (effectivePermissionMode === "edit") {
                try {
                  await runGitCommand(["rev-parse", "--is-inside-work-tree"], workdir)
                  isGitRepo = true
                } catch {
                  isGitRepo = false
                }
              }

              if (isGitRepo) {
                try {
                  preRunHead = await runGitCommand(["rev-parse", "HEAD"], workdir)
                } catch {
                  // Best effort only.
                }
              }

              let skillStderr = ""
              const skillResumeSessionId = getClaudeResumeSessionId(nodeProviderId, state)
              if (skillResumeSessionId) {
                const resumeEntry = {
                  type: "text" as const,
                  content: `[runtime-resume] resuming Claude session ${skillResumeSessionId.slice(0, 8)} for this node\n`,
                  timestamp: Date.now(),
                }
                state.log.push(resumeEntry)
                await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry: resumeEntry })
              }
              const result = await spawnProviderTracked(
                deps,
                nodeProviderId,
                {
                  workdir,
                  prompt,
                  model: skillModel,
                  maxTurns: config.maxTurns || workflow.defaults?.maxTurns || 120,
                  persistSession: nodeProviderId === "claude",
                  resumeSessionId: skillResumeSessionId,
                  permissionMode: "acceptEdits",
                  executionMode: effectivePermissionMode,
                  mcpConfigPath,
                  addDirs: additionalSkillDirs.length > 0 ? additionalSkillDirs : undefined,
                  allowedTools: mergedAllowed.length > 0 ? mergedAllowed : undefined,
                  disallowedTools: mergedDisallowed.length > 0 ? mergedDisallowed : undefined,
                  abortSignal: runtime.controller.signal,
                  timeout: (workflow.defaults?.timeout_minutes || 30) * 60 * 1000,
                },
                {
                  workspace,
                  runId,
                  mode,
                  role: "skill",
                  nodeId: node.id,
                },
                {
                  onExecutionStart: beginNodeExecution,
                  onProviderSession: async (sessionId) => {
                    skillBackend = "claude_sdk"
                    skillProviderSessionId = sessionId
                    updateSkillMetricsAndMeta()
                    await persistRunState(workspace, nodeStates, runtimeWorkflow, persistedInput)
                  },
                  onLogEntry: async (entry) => {
                    logParser.appendEntry(entry)
                    state.log.push(entry)
                    await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry })
                  },
                  onUsage: (usage) => {
                    logParser.applyUsage(usage)
                  },
                  onStderr: async (text) => {
                    skillStderr += text
                    const entry = { type: "error" as const, content: text, timestamp: Date.now() }
                    state.log.push(entry)
                    await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry })
                  },
                },
              )
              skillBackend = result.backend
              skillProviderSessionId = result.providerSessionId

              for (const entry of logParser.flush()) {
                state.log.push(entry)
                await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry })
              }

              updateSkillMetricsAndMeta()

              if (isGitRepo && preRunHead) {
                try {
                  const postRunHead = await runGitCommand(["rev-parse", "HEAD"], workdir)
                  if (postRunHead !== preRunHead) {
                    const revisionRange = `${preRunHead}..${postRunHead}`
                    const postRunDiff = await runGitCommand(["diff", revisionRange], workdir)
                    if (postRunDiff.trim()) {
                      const fileLines = await runGitCommand(["diff", "--name-only", revisionRange], workdir)
                      const diffEntry = {
                        type: "diff" as const,
                        content: postRunDiff,
                        files: fileLines.trim().split("\n").filter(Boolean),
                        timestamp: Date.now(),
                      }
                      state.log.push(diffEntry)
                      await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry: diffEntry })
                    }
                  }
                } catch {
                  // Best effort only.
                }
              }

              if (!result.success && !runtime.controller.signal.aborted) {
                const detail = buildAgentFailureDetail(nodeProviderId, result, logParser, skillStderr)
                throw new Error(`Skill node failed: ${detail}`)
              }

              output = await buildSkillNodeOutput(
                logger,
                node,
                config,
                logParser.textContent,
                contentFile,
                effectiveInput,
              )
              recoverOutputOnError = undefined
              break
            }

            case "evaluator": {
              const evalConfig = node.config as EvaluatorNodeConfig
              const logParser = new LogParser()
              let evaluatorStderr = ""
              const evalSkillContext = await resolveSkillContext({ skillRefs: evalConfig.skillRefs })
              const evalProviderId = workflowProviderId
              const evalPrompt = sanitizeInvalidUnicode(
                buildEvaluatorPrompt(evalConfig.criteria, incomingContent, evalSkillContext.text),
              )
              const evalAdditionalDirs = [...new Set(
                evalSkillContext.skillPaths
                  .map((path) => (path.endsWith(".md") ? dirname(path) : path))
                  .filter(Boolean),
              )]

              const evalModel = workflow.defaults?.model || getDefaultModelForProvider(evalProviderId)
              const evalResumeSessionId = getClaudeResumeSessionId(evalProviderId, state)
              const evalSpawnResult = await spawnProviderTracked(
                deps,
                evalProviderId,
                {
                  workdir: projectPath || workspace,
                  prompt: evalPrompt,
                  model: evalModel,
                  maxTurns: 1,
                  persistSession: evalProviderId === "claude",
                  resumeSessionId: evalResumeSessionId,
                  executionMode: workflow.defaults?.permissionMode,
                  mcpConfigPath,
                  disableBuiltInTools: evalProviderId === "claude",
                  addDirs: evalAdditionalDirs.length > 0 ? evalAdditionalDirs : undefined,
                  abortSignal: runtime.controller.signal,
                  timeout: 120_000,
                },
                {
                  workspace,
                  runId,
                  mode,
                  role: "evaluator",
                  nodeId: node.id,
                },
                {
                  onExecutionStart: beginNodeExecution,
                  onProviderSession: async (sessionId) => {
                    state.meta = buildNodeMeta(
                      evalPrompt,
                      evalModel,
                      undefined,
                      "claude_sdk",
                      sessionId,
                    )
                    await persistRunState(workspace, nodeStates, runtimeWorkflow, persistedInput)
                  },
                  onLogEntry: async (entry) => {
                    logParser.appendEntry(entry)
                    state.log.push(entry)
                    await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry })
                  },
                  onUsage: (usage) => {
                    logParser.applyUsage(usage)
                  },
                  onStderr: async (text) => {
                    evaluatorStderr += text
                    const entry = { type: "error" as const, content: text, timestamp: Date.now() }
                    state.log.push(entry)
                    await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry })
                  },
                },
              )

              if (!evalSpawnResult.success && !runtime.controller.signal.aborted) {
                const detail = buildAgentFailureDetail(evalProviderId, evalSpawnResult, logParser, evaluatorStderr)
                throw new Error(`Evaluator node failed: ${detail}`)
              }

              for (const entry of logParser.flush()) {
                state.log.push(entry)
                await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry })
              }

              const evalMetrics = collectMetrics(logParser, state.startedAt!)
              evalMetrics.cost_usd = estimateCost(evalModel, evalMetrics.tokens_in, evalMetrics.tokens_out)
              state.metrics = evalMetrics
              state.meta = buildNodeMeta(
                evalPrompt,
                evalModel,
                undefined,
                evalSpawnResult.backend,
                evalSpawnResult.providerSessionId,
              )

              const evalResult = parseEvaluatorOutput(state.log)
              if (!evalResult) {
                const rawExcerpt = serializeLogExcerpt(state.log)
                throw new Error(`Evaluator output parse failed. Expected JSON with numeric 'score' field. Actual output: ${rawExcerpt}`)
              }

              const score = evalResult.score
              const reason = evalResult.reason
              const fixInstructions = evalResult.fix_instructions
              const evalCriteria = evalResult.criteria
              const passed = score >= evalConfig.threshold

              await runtime.emitEvent({
                type: "eval-result",
                runId,
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
                ...pickPassThroughMetadata(incomingInput),
              }

              if (passed) {
                output = createNodeOutput(node, incomingContent, evalMetadata)
                for (const edge of getOutgoingEdges(runtimeWorkflow, node.id)) {
                  if (edge.type === "pass" || edge.type === "default") activatedEdges.add(edge.id)
                }
              } else if (state.attempts < evalConfig.maxRetries && evalConfig.retryFrom) {
                const retryTargetId = evalConfig.retryFrom
                const retryTargetState = nodeStates[retryTargetId]

                if (!retryTargetState || retryTargetState.status === "running") {
                  output = createNodeOutput(node, incomingContent, evalMetadata)
                  for (const edge of getOutgoingEdges(runtimeWorkflow, node.id)) {
                    if (edge.type === "pass" || edge.type === "default") activatedEdges.add(edge.id)
                  }
                  break
                }

                state.output = createNodeOutput(node, incomingContent, evalMetadata)

                const toReset = new Set<string>()
                const resetQueue = [retryTargetId]
                while (resetQueue.length > 0) {
                  const id = resetQueue.shift()!
                  if (toReset.has(id) || id === node.id) continue
                  toReset.add(id)
                  for (const edge of getOutgoingEdges(runtimeWorkflow, id)) {
                    resetQueue.push(edge.target)
                  }
                }

                for (const id of toReset) {
                  for (const edge of getOutgoingEdges(runtimeWorkflow, id)) {
                    activatedEdges.delete(edge.id)
                  }
                  if (nodeStates[id]) {
                    const preservedMeta = id === retryTargetId ? nodeStates[id].meta : undefined
                    nodeStates[id] = {
                      status: "pending",
                      attempts: nodeStates[id].attempts,
                      log: [],
                      output: undefined,
                      ...(preservedMeta ? { meta: preservedMeta } : {}),
                    }
                  }
                }

                for (const edge of getOutgoingEdges(runtimeWorkflow, node.id)) {
                  activatedEdges.delete(edge.id)
                }
                for (const edge of getOutgoingEdges(runtimeWorkflow, node.id)) {
                  if (edge.type === "fail") activatedEdges.add(edge.id)
                }

                state.status = "pending"
                state.log = []
                return
              } else {
                // Retries exhausted (or no retryFrom configured) — pause for user override
                await runtime.emitEvent({
                  type: "eval-exhausted",
                  runId,
                  nodeId: node.id,
                  score,
                  threshold: evalConfig.threshold,
                  attempt: state.attempts,
                })

                const overridden = await interrupts.waitForEvalOverride(runId, node.id, runtime.controller.signal)

                if (overridden) {
                  await runtime.emitEvent({ type: "eval-overridden", runId, nodeId: node.id })
                  output = createNodeOutput(node, incomingContent, {
                    ...evalMetadata,
                    overridden: true,
                  })
                  for (const edge of getOutgoingEdges(runtimeWorkflow, node.id)) {
                    if (edge.type === "pass" || edge.type === "default") activatedEdges.add(edge.id)
                  }
                } else {
                  // Not overridden (run cancelled or aborted) — activate fail edges if any
                  output = createNodeOutput(node, incomingContent, evalMetadata)
                  const failEdges = getOutgoingEdges(runtimeWorkflow, node.id).filter((e) => e.type === "fail")
                  if (failEdges.length > 0) {
                    for (const edge of failEdges) activatedEdges.add(edge.id)
                  } else {
                    // No fail edges — continue on pass/default to avoid hanging the flow
                    for (const edge of getOutgoingEdges(runtimeWorkflow, node.id)) {
                      if (edge.type === "pass" || edge.type === "default") activatedEdges.add(edge.id)
                    }
                  }
                }
              }
              break
            }

            case "splitter": {
              const splitterConfig = node.config as SplitterNodeConfig
              const splitterProviderId = await resolveNodeProviderId(node, workflow)
              const splitterModel = workflow.defaults?.model || getDefaultModelForProvider(splitterProviderId)
              const maxBranches = splitterConfig.maxBranches || 8
              const splitterMaxTurns = Math.max(2, Math.min(4, workflow.defaults?.maxTurns || 4))
              const splitterAllowedTools = workflow.defaults?.allowedTools
              const splitterDisallowedTools = workflow.defaults?.disallowedTools
              const splitterResumeSessionId = getClaudeResumeSessionId(splitterProviderId, state)
              const splitterPrompts: string[] = []
              let splitterBackend: AgentExecutionSummary["backend"]
              let splitterProviderSessionId: string | null | undefined
              let totalTokensIn = 0
              let totalTokensOut = 0
              let totalCostUsd = 0

              const runSplitterAttempt = async (prompt: string): Promise<string> => {
                const logParser = new LogParser()
                const sanitizedPrompt = sanitizeInvalidUnicode(prompt)
                splitterPrompts.push(sanitizedPrompt)

                const result = await spawnProviderTracked(
                  deps,
                  splitterProviderId,
                  {
                    workdir: projectPath || workspace,
                    prompt: sanitizedPrompt,
                    model: splitterModel,
                    maxTurns: splitterMaxTurns,
                    persistSession: splitterProviderId === "claude",
                    resumeSessionId: splitterPrompts.length === 1 ? splitterResumeSessionId : undefined,
                    executionMode: workflow.defaults?.permissionMode,
                    mcpConfigPath,
                    allowedTools: splitterAllowedTools?.length ? splitterAllowedTools : undefined,
                    disallowedTools: splitterDisallowedTools?.length ? splitterDisallowedTools : undefined,
                    addDirs: [],
                    abortSignal: runtime.controller.signal,
                    timeout: 2 * 60 * 1000,
                  },
                  {
                    workspace,
                    runId,
                    mode,
                    role: "splitter",
                    nodeId: node.id,
                  },
                  {
                    onExecutionStart: beginNodeExecution,
                    onProviderSession: async (sessionId) => {
                      splitterBackend = "claude_sdk"
                      splitterProviderSessionId = sessionId
                      state.meta = buildNodeMeta(
                        sanitizedPrompt,
                        splitterModel,
                        undefined,
                        splitterBackend,
                        splitterProviderSessionId,
                      )
                      await persistRunState(workspace, nodeStates, runtimeWorkflow, persistedInput)
                    },
                    onLogEntry: async (entry) => {
                      logParser.appendEntry(entry)
                      state.log.push(entry)
                      await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry })
                    },
                    onUsage: (usage) => {
                      logParser.applyUsage(usage)
                    },
                    onStderr: async (text) => {
                      const entry = { type: "error" as const, content: text, timestamp: Date.now() }
                      state.log.push(entry)
                      await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry })
                    },
                  },
                )
                splitterProviderSessionId = result.providerSessionId

                for (const entry of logParser.flush()) {
                  state.log.push(entry)
                  await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry })
                }

                const attemptMetrics = collectMetrics(logParser, state.startedAt!)
                totalTokensIn += attemptMetrics.tokens_in
                totalTokensOut += attemptMetrics.tokens_out
                totalCostUsd += estimateCost(splitterModel, attemptMetrics.tokens_in, attemptMetrics.tokens_out)

                if (runtime.controller.signal.aborted) {
                  throw new Error("Splitter aborted")
                }

                if (!result.success) {
                  const entry = {
                    type: "error" as const,
                    content: `[splitter] ${splitterProviderId} attempt failed (exitCode=${String(result.exitCode)}) - falling back\n`,
                    timestamp: Date.now(),
                  }
                  state.log.push(entry)
                  await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry })
                }
                splitterBackend = result.backend
                return logParser.textContent
              }

              let subtasks: Subtask[]
              const splitterPrompt = buildSplitterPrompt(splitterConfig.strategy, incomingContent, maxBranches)
              let splitterRawOutput = await runSplitterAttempt(splitterPrompt)
              subtasks = parseSplitterOutput(splitterRawOutput)

              if (maxBranches > 1 && shouldRetrySplitter(subtasks, splitterRawOutput, incomingContent, maxBranches)) {
                const recoveryPrompt = buildSplitterRecoveryPrompt(splitterConfig.strategy, incomingContent, maxBranches)
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
                await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry })
              }

              const shouldFallbackToHeuristic = subtasks.length === 0
                || (maxBranches > 1 && shouldRetrySplitter(subtasks, splitterRawOutput, incomingContent, maxBranches))
              if (shouldFallbackToHeuristic) {
                subtasks = heuristicSplitInput(incomingContent, maxBranches)
                const entry = {
                  type: "text" as const,
                  content: `[splitter] ai split was invalid, falling back to heuristic split (${subtasks.length} subtasks)\n`,
                  timestamp: Date.now(),
                }
                state.log.push(entry)
                await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry })
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
                await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry })
              }

              state.metrics = {
                tokens_in: totalTokensIn,
                tokens_out: totalTokensOut,
                cost_usd: totalCostUsd,
                latency_ms: Date.now() - state.startedAt!,
              }
              state.meta = buildNodeMeta(
                splitterPrompts.join("\n\n--- RETRY ---\n\n"),
                splitterModel,
                undefined,
                splitterBackend,
                splitterProviderSessionId,
              )

              const collapsed = collapseSplitterExpansion(runtimeWorkflow, workflow, node.id)
              runtimeWorkflow = collapsed.workflow
              const removedCloneIds = collapsed.removedIds
              for (const id of removedCloneIds) {
                delete nodeStates[id]
              }

              const expanded = expandSplitter(runtimeWorkflow, node.id, usedSubtasks)
              runtimeWorkflow = expanded

              const newNodeIds: string[] = []
              const runtimeMeta: Record<string, { subtaskKey: string; branchIndex: number; totalBranches: number; templateId: string }> = {}
              for (const runtimeNode of expanded.nodes) {
                if (!nodeStates[runtimeNode.id]) {
                  nodeStates[runtimeNode.id] = { status: "pending", attempts: 0, log: [] }
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

              await runtime.emitEvent({
                type: "nodes-expanded",
                runId,
                newNodeIds,
                runtimeMeta,
                nodes: expanded.nodes.map((runtimeNode) => ({
                  id: runtimeNode.id,
                  type: runtimeNode.type,
                  position: runtimeNode.position,
                  config: runtimeNode.config,
                }) as WorkflowNode),
                edges: expanded.edges.map((edge) => ({
                  id: edge.id,
                  source: edge.source,
                  target: edge.target,
                  type: edge.type,
                })),
              })

              output = createNodeOutput(node, JSON.stringify(usedSubtasks), {
                splitter_total_subtasks: totalSubtasks,
                splitter_used_subtasks: usedSubtasks.length,
                splitter_truncated: totalSubtasks > usedSubtasks.length,
              })
              break
            }

            case "merger": {
              const mergerConfig = node.config as MergerNodeConfig
              const incomingEdges = runtimeWorkflow.edges.filter((edge) => edge.target === node.id)
              const branchOutputs: NodeInput[] = []
              for (const edge of incomingEdges) {
                const sourceState = nodeStates[edge.source]
                if (sourceState?.output) branchOutputs.push(sourceState.output)
              }
              if (incomingEdges.length > 0 && branchOutputs.length === 0) {
                throw new Error("Merger has no branch outputs to combine")
              }

              const failedBranches = incomingEdges.filter((edge) => nodeStates[edge.source]?.status === "failed")
              if (failedBranches.length > 0) {
                const entry = {
                  type: "text" as const,
                  content: `[merger] ${failedBranches.length}/${incomingEdges.length} branches failed, merging ${branchOutputs.length} successful outputs\n`,
                  timestamp: Date.now(),
                }
                state.log.push(entry)
                await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry })
              }

              if (mergerConfig.strategy === "concatenate") {
                await beginNodeExecution()
                const mergerModel = workflow.defaults?.model || getDefaultModelForProvider(workflowProviderId)
                state.metrics = {
                  tokens_in: 0,
                  tokens_out: 0,
                  cost_usd: 0,
                  latency_ms: Date.now() - state.startedAt!,
                }
                state.meta = buildNodeMeta("[merger concatenate]", mergerModel)
                output = createNodeOutput(node, mergeResults(branchOutputs, "concatenate"))
              } else {
                const mergePrompt = sanitizeInvalidUnicode(
                  buildMergerPrompt(branchOutputs, mergerConfig.strategy, mergerConfig.prompt),
                )
                const logParser = new LogParser()
                let mergerStderr = ""
                const mergerProviderId = workflowProviderId
                const mergerModel = workflow.defaults?.model || getDefaultModelForProvider(mergerProviderId)
                const mergerResumeSessionId = getClaudeResumeSessionId(mergerProviderId, state)

                const result = await spawnProviderTracked(
                  deps,
                  mergerProviderId,
                  {
                    workdir: projectPath || workspace,
                    prompt: mergePrompt,
                    model: mergerModel,
                    maxTurns: 20,
                    persistSession: mergerProviderId === "claude",
                    resumeSessionId: mergerResumeSessionId,
                    executionMode: workflow.defaults?.permissionMode,
                    mcpConfigPath,
                    disableBuiltInTools: mergerProviderId === "claude",
                    addDirs: [],
                    abortSignal: runtime.controller.signal,
                    timeout: 10 * 60 * 1000,
                  },
                  {
                    workspace,
                    runId,
                    mode,
                    role: "merger",
                    nodeId: node.id,
                  },
                  {
                    onExecutionStart: beginNodeExecution,
                    onProviderSession: async (sessionId) => {
                      state.meta = buildNodeMeta(
                        mergePrompt,
                        mergerModel,
                        undefined,
                        "claude_sdk",
                        sessionId,
                      )
                      await persistRunState(workspace, nodeStates, runtimeWorkflow, persistedInput)
                    },
                    onLogEntry: async (entry) => {
                      logParser.appendEntry(entry)
                      state.log.push(entry)
                      await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry })
                    },
                    onUsage: (usage) => {
                      logParser.applyUsage(usage)
                    },
                    onStderr: async (text) => {
                      mergerStderr += text
                      const entry = { type: "error" as const, content: text, timestamp: Date.now() }
                      state.log.push(entry)
                      await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry })
                    },
                  },
                )

                for (const entry of logParser.flush()) {
                  state.log.push(entry)
                  await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry })
                }

                if (!result.success && !runtime.controller.signal.aborted) {
                  const detail = buildAgentFailureDetail(mergerProviderId, result, logParser, mergerStderr)
                  throw new Error(`Merger failed: ${detail}`)
                }

                const mergerMetrics = collectMetrics(logParser, state.startedAt!)
                mergerMetrics.cost_usd = estimateCost(mergerModel, mergerMetrics.tokens_in, mergerMetrics.tokens_out)
                state.metrics = mergerMetrics
                state.meta = buildNodeMeta(
                  mergePrompt,
                  mergerModel,
                  undefined,
                  result.backend,
                  result.providerSessionId,
                )
                output = createAgentNodeOutput(node, logParser.textContent)
              }
              break
            }

            case "approval": {
              await beginNodeExecution()
              const approvalConfig = node.config as ApprovalNodeConfig
              state.status = "waiting_approval"
              const approvalContent = approvalConfig.show_content ? incomingContent : ""
              let decision = await readApprovalDecision(workspace, node.id)
              const approvalTask = !decision
                ? await upsertApprovalHilTask({
                    workspace,
                    runId,
                    workflowName: workflow.name,
                    workflowPath,
                    projectPath,
                    nodeId: node.id,
                    title: approvalConfig.message || `Approval required for ${node.id}`,
                    message: approvalConfig.message,
                    content: approvalContent,
                    allowEdit: approvalConfig.allow_edit,
                  })
                : await getWorkflowHilTask(workspace, approvalTaskId(node.id))

              if (approvalTask) {
                state.humanTask = {
                  taskId: approvalTask.taskId,
                  status: approvalTask.state.status,
                }
              }

              if (!decision) {
                await persistRunState(workspace, nodeStates, runtimeWorkflow, persistedInput)
                if (approvalTask) {
                  await runtime.emitEvent({
                    type: "human-task-created",
                    runId,
                    nodeId: node.id,
                    taskId: approvalTask.taskId,
                    title: approvalTask.state.title,
                  })
                }
                await runtime.emitEvent({
                  type: "approval-requested",
                  runId,
                  nodeId: node.id,
                  content: approvalContent,
                  message: approvalConfig.message,
                  allowEdit: approvalConfig.allow_edit,
                })

                if (approvalBehavior === "suspend") {
                  return { suspendedForApproval: true }
                }

                decision = await interrupts.waitForApproval(
                  runId,
                  workspace,
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
                await runtime.emitEvent({
                  type: "human-task-resolved",
                  runId,
                  nodeId: node.id,
                  taskId: approvalTask.taskId,
                  resolution,
                })
              }

              if (decision.timedOut) {
                const action = approvalConfig.timeout_action ?? "auto_reject"
                const minutes = approvalConfig.timeout_minutes ?? 60
                await runtime.emitEvent({
                  type: "node-log",
                  runId,
                  nodeId: node.id,
                  entry: {
                    type: "text",
                    content: `Approval timed out after ${minutes} minutes. Auto-${action.replace("auto_", "")} applied.\n`,
                    timestamp: Date.now(),
                  },
                })
              }

              if (decision.approved) {
                output = createNodeOutput(node, decision.editedContent ?? incomingContent, {
                  ...pickPassThroughMetadata(incomingInput),
                })
              } else {
                state.status = "failed"
                state.completedAt = Date.now()
                state.error = decision.timedOut
                  ? `Approval timed out (${approvalConfig.timeout_action ?? "auto_reject"})`
                  : "Rejected by user"
                await runtime.emitEvent({ type: "node-error", runId, nodeId: node.id, error: state.error })
                if (approvalTask) {
                  await markWorkflowHilTaskConsumed(workspace, approvalTask.taskId)
                }
                return !decision.timedOut
                  ? { approvalRejected: true }
                  : undefined
              }
              if (approvalTask) {
                await markWorkflowHilTaskConsumed(workspace, approvalTask.taskId)
              }
              break
            }

            case "human": {
              await beginNodeExecution()
              const humanConfig = node.config as HumanNodeConfig
              state.status = "waiting_human"
              const resolvedTask = await readHumanTaskResponse(workspace, node.id)

              if (!resolvedTask) {
                const taskRequest = buildHumanTaskRequest(node, humanConfig, incomingContent)
                const taskRecord = await upsertHumanHilTask({
                  workspace,
                  runId,
                  workflowName: workflow.name,
                  workflowPath,
                  projectPath,
                  nodeId: node.id,
                  request: taskRequest,
                })
                state.humanTask = {
                  taskId: taskRecord.taskId,
                  status: taskRecord.state.status,
                }
                await persistRunState(workspace, nodeStates, runtimeWorkflow, persistedInput)
                await runtime.emitEvent({
                  type: "human-task-created",
                  runId,
                  nodeId: node.id,
                  taskId: taskRecord.taskId,
                  title: taskRecord.state.title,
                })
                return {
                  blockedForHuman: true,
                  blockedByTaskId: taskRecord.taskId,
                  blockedByNodeId: node.id,
                }
              }

              await runtime.emitEvent({
                type: "human-task-resolved",
                runId,
                nodeId: node.id,
                taskId: resolvedTask.taskId,
                resolution: resolvedTask.resolution,
              })

              state.humanTask = {
                taskId: resolvedTask.taskId,
                status: resolvedTask.resolution === "submitted"
                  ? "answered"
                  : resolvedTask.resolution,
              }

              const buildHumanEnvelope = (ok: boolean) => createNodeOutput(
                node,
                JSON.stringify({
                  ok,
                  taskId: resolvedTask.taskId,
                  resolution: resolvedTask.resolution,
                  answers: resolvedTask.answers,
                }, null, 2),
                {
                  ...pickPassThroughMetadata(incomingInput),
                },
              )

              if (resolvedTask.resolution === "submitted") {
                output = buildHumanEnvelope(true)
              } else if (
                resolvedTask.resolution === "rejected"
                && humanConfig.rejectAction === "complete_with_reject_response"
              ) {
                output = buildHumanEnvelope(false)
              } else if (
                resolvedTask.resolution === "timed_out"
                && humanConfig.timeoutAction === "complete_with_timeout_response"
              ) {
                output = buildHumanEnvelope(false)
              } else {
                state.status = "failed"
                state.completedAt = Date.now()
                state.error = resolvedTask.resolution === "timed_out"
                  ? "Human task timed out"
                  : "Rejected by human reviewer"
                await runtime.emitEvent({ type: "node-error", runId, nodeId: node.id, error: state.error })
                await markWorkflowHilTaskConsumed(workspace, resolvedTask.taskId)
                return
              }

              await markWorkflowHilTaskConsumed(workspace, resolvedTask.taskId)
              break
            }

            case "output":
              await beginNodeExecution()
              output = createNodeOutput(node, incomingContent, {
                ...pickPassThroughMetadata(incomingInput),
              })
              break
          }

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

          await runtime.emitEvent({ type: "node-done", runId, nodeId: node.id, output: completedOutput })

          // Soft heuristic checks on skill node output — non-blocking warnings
          if (node.type === "skill" && completedOutput.content) {
            const heuristicWarnings = checkOutputHeuristics(completedOutput.content, node.id)
            for (const hw of heuristicWarnings) {
              logger.warn("workflow-runner", "output_heuristic_warning", {
                runId,
                nodeId: node.id,
                kind: hw.kind,
                message: hw.message,
              })
              await runtime.emitEvent({
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

          let partialOutput: NodeInput | undefined
          if (recoverOutputOnError) {
            try {
              partialOutput = await recoverOutputOnError()
            } catch (recoveryError) {
              logger.warn("workflow-runner", "recover_partial_output_failed", {
                nodeId: node.id,
                error: errorMessage(recoveryError),
              })
            }
          }

          const errorText = String(error)
          const timedOut = errorText.includes("timed out")
            || errorText.includes("ETIMEDOUT")
            || errorText.includes("timeout")
          state.completedAt = Date.now()
          state.error = errorText
          state.errorKind = classifyError(error, timedOut)

          if (
            node.type === "skill"
            && MAX_TURNS_RE.test(errorText)
            && hasPartialSkillProgress(state.log, partialOutput)
          ) {
            const output = buildContinueOutput(node, incomingContent, partialOutput)
            const recoveryLog = {
              type: "text" as const,
              content: "[runtime-recovery] max turns reached after partial progress; continuing with recovered output\n",
              timestamp: Date.now(),
            }
            state.log.push(recoveryLog)
            await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry: recoveryLog })

            state.status = "completed"
            state.error = undefined
            state.errorKind = undefined
            state.policyApplied = "continue"
            state.output = output
            await writeNodeOutputFile(workspace, node.id, output.content)
            for (const edge of getOutgoingEdges(runtimeWorkflow, node.id)) {
              activatedEdges.add(edge.id)
            }
            await runtime.emitEvent({ type: "node-done", runId, nodeId: node.id, output })
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
            const retryLog = {
              type: "text" as const,
              content: `[runtime-retry] attempt ${state.retriesUsed + 1}/${runtimePolicy.retry.maxTries} in ${retryDelayMs}ms after ${retryErrorKind} error\n`,
              timestamp: Date.now(),
            }
            state.log.push(retryLog)
            await runtime.emitEvent({ type: "node-log", runId, nodeId: node.id, entry: retryLog })
            state.attempts = Math.max(0, state.attempts - 1)
            await sleep(retryDelayMs)
            return processNode(node.id)
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
                logger.warn("workflow-runner", "persist_partial_output_failed", {
                  nodeId: node.id,
                  error: errorMessage(writeError),
                })
              }
              await runtime.emitEvent({ type: "node-done", runId, nodeId: node.id, output: partialOutput })
            }
            await runtime.emitEvent({ type: "node-error", runId, nodeId: node.id, error: errorText })
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
            logger.warn("workflow-runner", "persist_policy_output_failed", {
              nodeId: node.id,
              error: errorMessage(writeError),
            })
          }

          for (const edge of getOutgoingEdges(runtimeWorkflow, node.id)) {
            activatedEdges.add(edge.id)
          }

          await runtime.emitEvent({ type: "node-done", runId, nodeId: node.id, output })
          await runtime.emitEvent({ type: "node-error", runId, nodeId: node.id, error: errorText })
        } finally {
          try {
            await persistRunState(workspace, nodeStates, runtimeWorkflow, persistedInput)
          } catch (error) {
            logger.warn("workflow-runner", "persist_run_state_checkpoint_failed", {
              runId,
              workspace,
              nodeId: node.id,
              error: errorMessage(error),
            })
          }
        }
      }

      const stallTimeoutMs = (workflow.defaults?.timeout_minutes || 30) * 60 * 1000 + 60_000
      const lifecycle = await runExecutionLoop({
        runId,
        controller: runtime.controller,
        nodeStates,
        runtimeWorkflow,
        activatedEdges,
        maxParallel,
        stallTimeoutMs,
        waitIfPaused,
        processNode,
        emitEvent: runtime.emitEvent,
        buildSkippedOutput: (nodeId) => {
          const runtimeNode = runtimeWorkflow.nodes.find((candidate) => candidate.id === nodeId)
          return runtimeNode
            ? createNodeOutput(runtimeNode, "", { skipped: true })
            : { content: "", metadata: { source: nodeId, skipped: true } }
        },
        describeStalledNode: (nodeId) => {
          const stalledNode = runtimeWorkflow.nodes.find((candidate) => candidate.id === nodeId)
          if (!stalledNode) return `Node '${nodeId}'`
          const nodeLabel = stalledNode.type === "skill"
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
          runtime.emitEvent,
          (nodeId) => {
            const runtimeNode = runtimeWorkflow.nodes.find((candidate) => candidate.id === nodeId)
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

      const outputNode = runtimeWorkflow.nodes.find((node) => node.type === "output")
      if (outputNode && nodeStates[outputNode.id]?.output?.content) {
        const outputReport = join(workspace, "report.md")
        await writeFileAtomic(outputReport, nodeStates[outputNode.id].output!.content)
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
      await persistRunState(workspace, nodeStates, runtimeWorkflow, persistedInput)
      await writeManifest(workspace, {
        ...manifestBase,
        status: finalStatus,
        updatedAt: Date.now(),
        blockedByTaskId,
        lastBlockingNodeId: blockedByNodeId,
      })

      await runtime.emitEvent({ type: "run-done", runId, status: finalStatus, reportPath, workspace })

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
      const fallbackStatus: RunStatus = runtime.controller.signal.aborted ? "cancelled" : "failed"
      await finalizeRunPidManifest(
        workspace,
        runId,
        mode,
        manifestStatus === "interrupted" ? fallbackStatus : manifestStatus,
      )
      await writeManifest(workspace, {
        ...manifestBase,
        status: manifestStatus === "interrupted" ? fallbackStatus : manifestStatus,
        updatedAt: Date.now(),
        blockedByTaskId,
        lastBlockingNodeId: blockedByNodeId,
      })
      interrupts.resolvePendingApprovalsForRun(runId, false)
      interrupts.resolvePendingEvalOverridesForRun(runId)
      activeRuns.delete(runId)
      pausedRuns.delete(runId)
    }
  }

  async function createHandle(
    runId: string,
    workspace: string,
    executor: (runtime: WorkflowRuntimeContext) => Promise<WorkflowRunSummary>,
  ): Promise<WorkflowRunHandle> {
    const queue = new AsyncEventQueue<WorkflowEvent>()
    const controller = new AbortController()
    const emit = async (event: WorkflowEvent) => emitEvent(queue, workspace, event)

    const result = executor({ emitEvent: emit, controller }).catch(async (error) => {
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
    }).finally(() => {
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
    async startRun(request: StartWorkflowRunRequest): Promise<WorkflowRunHandle> {
      const runId = request.runId || makeRunId("run")
      const workspace = await workspaceStore.createRunWorkspace(runId, request.projectPath)
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

      return createHandle(runId, workspace, (runtime) => executeWorkflowSession(session, runtime))
    },

    async resumeRun(request: ResumeWorkflowRunRequest): Promise<WorkflowRunHandle> {
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

    async rerunFromNode(request: RerunFromNodeRequest): Promise<WorkflowRunHandle> {
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

      const handle = await createHandle(runId, request.workspace, async (runtime) =>
        executeWorkflowSession(session, runtime),
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
          await persistResolvedApproval(workspace, decision.nodeId, persistedDecision, "runtime")
        } catch (error) {
          logger.warn("workflow-runner", "persist_approval_decision_failed", {
            runId: decision.runId,
            nodeId: decision.nodeId,
            error: errorMessage(error),
          })
        }
      }

      if (interrupts.resolveApproval(decision.runId, decision.nodeId, {
        approved: decision.approved,
        editedContent: decision.editedContent,
      })) {
        return true
      }

      return Boolean(workspace)
    },

    async resolveEvalOverride(decision: EvalOverrideDecision): Promise<boolean> {
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
