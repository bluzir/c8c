export type NodeType = "input" | "skill" | "evaluator" | "splitter" | "merger" | "output" | "approval" | "human"

export interface NodePosition {
  x: number
  y: number
}

export type NodeOnErrorPolicy = "stop" | "continue" | "continue_error_output"
export type NodeRetryBackoff = "none" | "linear" | "exponential"

export interface NodeRetryPolicy {
  enabled?: boolean
  maxTries?: number
  waitMs?: number
  backoff?: NodeRetryBackoff
  retryOn?: Array<ErrorKind>
}

export interface NodeExecutionPolicy {
  onError?: NodeOnErrorPolicy
  alwaysOutputData?: boolean
  executeOnce?: boolean
}

export interface NodeRuntimeConfig {
  retry?: NodeRetryPolicy
  execution?: NodeExecutionPolicy
}

export type PermissionMode = "plan" | "edit"
export type ProviderId = "claude" | "codex"
export type AgentExecutionBackend = "claude_sdk" | "claude_cli" | "codex_acp" | "codex_exec"
export type SafetyProfile =
  | "safe_readonly"
  | "workspace_auto"
  | "workspace_untrusted"
  | "ci_readonly"
  | "dangerous"

export interface ProviderHealth {
  provider: ProviderId
  available: boolean
  executablePath?: string
  version?: string
  error?: string | null
}

export type ProviderAuthState = "authenticated" | "unauthenticated" | "unknown"

export interface ProviderAuthStatus {
  provider: ProviderId
  state: ProviderAuthState
  authenticated: boolean
  authMethod?: string | null
  accountLabel?: string | null
  apiKeyConfigured?: boolean
  error?: string | null
}

export interface AgentRunOptions {
  workdir: string
  prompt: string
  model?: string
  maxTurns?: number
  persistSession?: boolean
  resumeSessionId?: string
  permissionMode?: string
  executionMode?: PermissionMode
  safetyProfile?: SafetyProfile
  systemPrompts?: string[]
  allowedTools?: string[]
  disallowedTools?: string[]
  settingSources?: string[]
  addDirs?: string[]
  mcpConfigPath?: string
  disableBuiltInTools?: boolean
  disableSlashCommands?: boolean
  extraArgs?: string[]
  extraEnv?: Record<string, string>
  timeout?: number
  abortSignal?: AbortSignal
  onSpawn?: (pid: number) => void
  onStdout?: (data: Buffer) => void
  onStderr?: (data: Buffer) => void
}

export interface AgentRunResult {
  success: boolean
  exitCode: number | null
  signal: string | null
  killed: boolean
  aborted: boolean
  durationMs: number
  pid?: number
}

export interface AgentUsage {
  inputTokens: number
  outputTokens: number
}

export interface AgentExecutionSummary extends AgentRunResult {
  error?: string | null
  providerSessionId?: string | null
  backend?: AgentExecutionBackend
}

export type LogEntry =
  | { type: "thinking"; content: string; timestamp: number }
  | { type: "text"; content: string; timestamp: number }
  | { type: "tool_use"; tool: string; input: Record<string, unknown>; timestamp: number }
  | { type: "tool_result"; tool: string; output: string; status: "success" | "error"; timestamp: number }
  | { type: "error"; content: string; timestamp: number }
  | { type: "diff"; content: string; files: string[]; timestamp: number }

export type AgentExecutionEvent =
  | { type: "start" }
  | { type: "spawn"; pid: number }
  | { type: "provider-session"; sessionId: string }
  | { type: "log-entry"; entry: LogEntry }
  | { type: "usage"; usage: AgentUsage }
  | { type: "stderr"; text: string }
  | { type: "error"; text: string }
  | { type: "finish"; summary: AgentExecutionSummary }

export interface AgentExecutionHandle {
  provider: ProviderId
  backend?: AgentExecutionBackend
  events: AsyncIterable<AgentExecutionEvent>
  abort(): void
  done: Promise<AgentExecutionSummary>
}

export interface AgentProvider {
  id: ProviderId
  checkAvailability(): Promise<ProviderHealth>
  getAuthStatus(): Promise<ProviderAuthStatus>
  executeInteractive(options: AgentRunOptions): Promise<AgentExecutionHandle>
  executeTask(options: AgentRunOptions): Promise<AgentExecutionHandle>
  cancel(sessionId: string): Promise<boolean> | boolean
}

export interface SkillNodeConfig {
  skillRef?: string
  prompt: string
  outputMode?: "auto" | "stdout" | "content_file"
  maxTurns?: number
  permissionMode?: PermissionMode
  skillPaths?: string[]
  allowedTools?: string[]
  disallowedTools?: string[]
  runtime?: NodeRuntimeConfig
}

export interface EvaluatorNodeConfig {
  criteria: string
  threshold: number
  maxRetries: number
  retryFrom?: string
  skillRefs?: string[]
  runtime?: NodeRuntimeConfig
}

export interface SplitterNodeConfig {
  strategy: string
  maxBranches?: number
  runtime?: NodeRuntimeConfig
}

export interface MergerNodeConfig {
  strategy: "concatenate" | "summarize" | "select_best"
  prompt?: string
  runtime?: NodeRuntimeConfig
}

export interface ApprovalNodeConfig {
  message?: string
  show_content: boolean
  allow_edit: boolean
  timeout_minutes?: number
  timeout_action?: "auto_approve" | "auto_reject" | "skip"
  runtime?: NodeRuntimeConfig
}

export type HumanTaskFieldType = "text" | "textarea" | "number" | "boolean" | "select" | "multiselect" | "json"

export interface HumanTaskFieldOption {
  value: string
  label: string
}

export interface HumanTaskField {
  id: string
  type: HumanTaskFieldType
  label: string
  description?: string
  required?: boolean
  options?: HumanTaskFieldOption[]
  placeholder?: string
  min?: number
  max?: number
}

export interface HumanTaskRequest {
  version: 1
  kind: "form" | "approval"
  title: string
  instructions?: string
  summary?: string
  fields: HumanTaskField[]
  defaults?: Record<string, unknown>
  metadata?: {
    externalRef?: string
    generatedByNodeId?: string
    suggestedAssignee?: string
    priority?: "low" | "normal" | "high"
    allowEdit?: boolean
  }
}

export interface HumanNodeConfig {
  mode: "form" | "approval"
  requestSource: "upstream_json" | "static"
  staticRequest?: HumanTaskRequest
  timeoutMinutes?: number
  timeoutAction?: "fail_node" | "complete_with_timeout_response"
  submitAction?: "complete_node"
  rejectAction?: "fail_node" | "complete_with_reject_response"
  allowRevisions?: boolean
  autoContinue?: boolean
  runtime?: NodeRuntimeConfig
}

export interface InputNodeConfig {
  inputType?: "auto" | "text" | "url" | "directory"
  required?: boolean
  defaultValue?: string
  placeholder?: string
  runtime?: NodeRuntimeConfig
}

export interface OutputNodeConfig {
  title?: string
  format?: "markdown" | "text"
  runtime?: NodeRuntimeConfig
}

interface BaseWorkflowNode<TType extends NodeType, TConfig> {
  id: string
  type: TType
  position: NodePosition
  config: TConfig
}

export type InputWorkflowNode = BaseWorkflowNode<"input", InputNodeConfig>
export type SkillWorkflowNode = BaseWorkflowNode<"skill", SkillNodeConfig>
export type EvaluatorWorkflowNode = BaseWorkflowNode<"evaluator", EvaluatorNodeConfig>
export type SplitterWorkflowNode = BaseWorkflowNode<"splitter", SplitterNodeConfig>
export type MergerWorkflowNode = BaseWorkflowNode<"merger", MergerNodeConfig>
export type OutputWorkflowNode = BaseWorkflowNode<"output", OutputNodeConfig>
export type ApprovalWorkflowNode = BaseWorkflowNode<"approval", ApprovalNodeConfig>
export type HumanWorkflowNode = BaseWorkflowNode<"human", HumanNodeConfig>

export type WorkflowNode =
  | InputWorkflowNode
  | SkillWorkflowNode
  | EvaluatorWorkflowNode
  | SplitterWorkflowNode
  | MergerWorkflowNode
  | OutputWorkflowNode
  | ApprovalWorkflowNode
  | HumanWorkflowNode

export type EdgeType = "default" | "pass" | "fail"

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  type: EdgeType
}

export interface WorkflowDefaults {
  provider?: ProviderId
  model?: string
  maxTurns?: number
  maxParallel?: number
  timeout_minutes?: number
  allowedTools?: string[]
  disallowedTools?: string[]
  permissionMode?: PermissionMode
  budget_tokens?: number
  budget_cost_usd?: number
  stop_on?: Array<"budget_exceeded" | "mandatory_node_failed">
}

export interface Workflow {
  id?: string
  version: number
  name: string
  description?: string
  defaults?: WorkflowDefaults
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export interface DiscoveredSkill {
  type: "skill" | "agent" | "command"
  name: string
  description: string
  category: string
  path: string
  format?: "claude-markdown" | "codex-skill"
  sourceScope?: "project" | "user" | "library" | "plugin"
  model?: string
  tools?: string[]
  maxTurns?: number
  allowedTools?: string[]
  disallowedTools?: string[]
  library?: string
  pluginId?: string
  pluginName?: string
  marketplaceId?: string
  marketplaceName?: string
  pluginVersion?: string
}

export type NodeStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "waiting_approval"
  | "waiting_human"

export type RunStatus = "running" | "paused" | "blocked" | "completed" | "failed" | "cancelled" | "interrupted"

export type DiagnosticSummaryTone = "neutral" | "warning" | "danger"

export interface DiagnosticSeverityCounts {
  critical?: number
  high?: number
  medium?: number
  low?: number
  info?: number
}

export interface DiagnosticCategorySummary {
  id: string
  label: string
  detail?: string
  severity?: DiagnosticSummaryTone
  count?: number
}

export interface DiagnosticFindingSummary {
  id: string
  label: string
  detail?: string
  severity?: DiagnosticSummaryTone
}

export interface DiagnosticSummary {
  headline?: string
  summary?: string
  tone?: DiagnosticSummaryTone
  rootCause?: string
  recommendedNextAction?: string
  severityCounts?: DiagnosticSeverityCounts
  categories?: DiagnosticCategorySummary[]
  topFindings?: DiagnosticFindingSummary[]
}

export interface NodeInput {
  content: string
  metadata: {
    source: string
    artifact_type?: string
    artifact_label?: string
    artifact_role?: "input" | "intermediate" | "decision" | "final"
    score?: number
    reason?: string
    iteration?: number
    fix_instructions?: string
    criteria?: Array<{ id: string; score: number; weight?: number }>
    diagnostic_summary?: DiagnosticSummary
    output_source?: "stdout" | "content_file" | "input_fallback"
    partial_on_error?: boolean
    splitter_total_subtasks?: number
    splitter_used_subtasks?: number
    splitter_truncated?: boolean
    error_policy_applied?: NodeOnErrorPolicy
    error_envelope?: boolean
    skipped?: boolean
  }
}

export type ErrorKind = "tool" | "model" | "timeout" | "policy" | "unknown"

export interface NodeMetrics {
  tokens_in: number
  tokens_out: number
  cost_usd: number
  latency_ms: number
}

export interface NodeMeta {
  model_id: string
  prompt_hash: string
  skill_ref?: string
  backend?: AgentExecutionBackend
  provider_session_id?: string
}

export interface NodeState {
  status: NodeStatus
  attempts: number
  retriesUsed?: number
  policyApplied?: NodeOnErrorPolicy
  output?: NodeInput
  error?: string
  log: LogEntry[]
  startedAt?: number
  completedAt?: number
  metrics?: NodeMetrics
  errorKind?: ErrorKind
  meta?: NodeMeta
  humanTask?: {
    taskId: string
    status: "open" | "answered" | "rejected" | "timed_out" | "consumed"
  }
  warnings?: Array<{ kind: string; message: string }>
}

export interface RuntimeMetaEntry {
  subtaskKey: string
  branchIndex: number
  totalBranches: number
  templateId: string
}

export type WorkflowRuntimeMeta = Record<string, RuntimeMetaEntry>

export type WorkflowEvent =
  | { type: "node-queued"; runId: string; nodeId: string }
  | { type: "node-start"; runId: string; nodeId: string }
  | { type: "node-log"; runId: string; nodeId: string; entry: LogEntry }
  | { type: "node-done"; runId: string; nodeId: string; output: NodeInput }
  | { type: "node-error"; runId: string; nodeId: string; error: string }
  | { type: "node-warning"; runId: string; nodeId: string; warning: string; warningKind: "empty" | "repetition" | "refusal" | "length_anomaly" }
  | {
      type: "eval-result"
      runId: string
      nodeId: string
      score: number
      reason: string
      passed: boolean
      attempt: number
      fix_instructions?: string
      criteria?: Array<{ id: string; score: number; weight?: number }>
    }
  | {
      type: "nodes-expanded"
      runId: string
      newNodeIds: string[]
      runtimeMeta: WorkflowRuntimeMeta
      nodes: WorkflowNode[]
      edges: WorkflowEdge[]
    }
  | { type: "approval-requested"; runId: string; nodeId: string; content: string; message?: string; allowEdit: boolean }
  | { type: "human-task-created"; runId: string; nodeId: string; taskId: string; title: string }
  | {
      type: "human-task-resolved"
      runId: string
      nodeId: string
      taskId: string
      resolution: "submitted" | "rejected" | "timed_out"
    }
  | { type: "eval-exhausted"; runId: string; nodeId: string; score: number; threshold: number; attempt: number }
  | { type: "eval-overridden"; runId: string; nodeId: string }
  | { type: "run-done"; runId: string; status: RunStatus; reportPath?: string; workspace?: string }

export type WorkflowInput =
  | { type: "text"; value: string }
  | { type: "url"; value: string }
  | { type: "directory"; value: string }

export interface RunResult {
  runId: string
  status: RunStatus
  workflowName: string
  workflowPath?: string
  startedAt: number
  completedAt: number
  reportPath: string
  workspace: string
  totalCost?: number
  totalTokensIn?: number
  totalTokensOut?: number
  evalScores?: Record<string, number>
  durationMs?: number
}
