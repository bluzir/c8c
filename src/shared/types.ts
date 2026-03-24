// ── Node Types ──────────────────────────────────────────

export type NodeType =
  | "input"
  | "skill"
  | "evaluator"
  | "splitter"
  | "merger"
  | "output"
  | "approval"
  | "human"

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
export type AgentPermissionMode =
  | PermissionMode
  | "default"
  | "acceptEdits"
  | "dontAsk"
  | "bypassPermissions"
export type ProviderId = "claude" | "codex"
export type AgentExecutionBackend =
  | "claude_sdk"
  | "claude_cli"
  | "codex_acp"
  | "codex_exec"
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

export interface ProviderSettings {
  defaultProvider: ProviderId
  safetyProfile: SafetyProfile
  features: {
    codexProvider: boolean
  }
}

export interface ProviderDiagnostics {
  settings: ProviderSettings
  health: Record<ProviderId, ProviderHealth>
  auth: Record<ProviderId, ProviderAuthStatus>
}

export interface AgentRunOptions {
  workdir: string
  prompt: string
  model?: string
  maxTurns?: number
  persistSession?: boolean
  resumeSessionId?: string
  permissionMode?: AgentPermissionMode
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
  skillRefs?: string[]
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
  // Optional quality skills to inject as evaluation policy context.
  skillRefs?: string[]
  runtime?: NodeRuntimeConfig
}

export interface SplitterNodeConfig {
  strategy: string
  maxBranches?: number
  runtime?: NodeRuntimeConfig
}

export type MergerStrategy =
  | "concatenate"
  | "summarize"
  | "select_best"
  | "json_array"

export interface MergerNodeConfig {
  strategy: MergerStrategy
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

export type HumanTaskFieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "multiselect"
  | "json"

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
export type EvaluatorWorkflowNode = BaseWorkflowNode<
  "evaluator",
  EvaluatorNodeConfig
>
export type SplitterWorkflowNode = BaseWorkflowNode<
  "splitter",
  SplitterNodeConfig
>
export type MergerWorkflowNode = BaseWorkflowNode<"merger", MergerNodeConfig>
export type OutputWorkflowNode = BaseWorkflowNode<"output", OutputNodeConfig>
export type ApprovalWorkflowNode = BaseWorkflowNode<
  "approval",
  ApprovalNodeConfig
>
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

export type NodeConfig = WorkflowNode["config"]

// ── Edge Types ──────────────────────────────────────────

export type EdgeType = "default" | "pass" | "fail"

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  type: EdgeType
}

// ── Workflow Definition ─────────────────────────────────

export interface WorkflowDefaults {
  provider?: ProviderId
  model?: string
  maxTurns?: number
  maxParallel?: number
  detailBudget?: number
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

export interface WorkflowFile {
  name: string
  path: string
  updatedAt?: number
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

export interface SkillLibrary {
  id: string
  name: string
  description: string
  repo: string
  enabled: boolean
  installed: boolean
}

export type PluginCapability = "skill" | "template" | "mcp"

export interface PluginAssetSummary {
  capability: PluginCapability
  count: number
}

export interface MarketplaceSource {
  id: string
  name: string
  description: string
  repo: string
  installed: boolean
  owner?: string
  version?: string
}

export interface InstalledPlugin {
  id: string
  name: string
  description: string
  version?: string
  marketplaceId: string
  marketplaceName: string
  marketplaceRepo?: string
  pluginPath: string
  manifestPath?: string
  homepage?: string
  repository?: string
  author?: string
  category?: string
  tags?: string[]
  enabled: boolean
  capabilities: PluginCapability[]
  assets: PluginAssetSummary[]
}

export type WorkflowTemplateStage =
  | "research"
  | "strategy"
  | "content"
  | "code"
  | "outreach"
  | "operations"

export type StageFamily =
  | "understand"
  | "design"
  | "execute"
  | "evaluate"
  | "validate"
  | "deliver"

export type KnownArtifactKind =
  | "codebase_map"
  | "project_brief"
  | "requirements_spec"
  | "roadmap"
  | "research_pack"
  | "phase_plan"
  | "implementation_report"
  | "validation_contract"
  | "verification_report"
  | "audit_report"
  | "ux_audit_report"
  | "visual_qa_report"
  | "audience_offer_brief"
  | "curriculum_map"
  | "lesson_system"
  | "launch_asset_bundle"
  | "trend_digest"
  | "idea_backlog"
  | "editorial_calendar"
  | "angle_map"
  | "content_brief"
  | "outline"
  | "draft"
  | "qa_report"
  | "distribution_bundle"
  | "design_brief"
  | "experience_map"
  | "direction_set"
  | "review_notes"
  | "component_spec"
  | "handoff_pack"
  | "decision_record"
  | "missing_input_response"
  | "questionnaire_response"
  | "review_edit"

export type ArtifactKind = KnownArtifactKind | (string & {})

export interface ArtifactContract {
  kind: ArtifactKind
  title?: string
  description?: string
  required?: boolean
}

export interface ArtifactRecord {
  id: string
  kind: ArtifactKind
  title: string
  description?: string
  factoryId?: string
  factoryLabel?: string
  caseId?: string
  caseLabel?: string
  sourceArtifactIds?: string[]
  projectPath: string
  workspace: string
  runId: string
  templateId?: string
  templateName?: string
  workflowPath?: string
  workflowName?: string
  relativePath: string
  contentPath: string
  metadataPath: string
  createdAt: number
  updatedAt: number
}

export type ContinuationStatus =
  | "ready"
  | "missing_result"
  | "blocked_by_check"
  | "awaiting_approval"
  | "superseded"
  | "paused"
  | "completed"

export type DurableGateOutcome =
  | "passed"
  | "returned"
  | "awaiting_human"
  | "rejected"
  | "blocked"

export type DurableGateFamily =
  | "approval"
  | "input"
  | "review_check"
  | "verification_check"
  | "ship_decision"

export interface DurableGateRecord {
  family: DurableGateFamily
  outcome: DurableGateOutcome
  summaryText: string
  reasonText?: string
  stepLabel?: string
  happenedAt: number
}

export interface CaseStateRecord {
  version: 1
  caseId: string
  projectPath: string
  workLabel: string
  caseLabel?: string
  factoryId?: string
  factoryLabel?: string
  workflowPath?: string
  workflowName?: string
  continuationStatus: ContinuationStatus
  nextStepLabel?: string
  artifactIds: string[]
  lastGate: DurableGateRecord | null
  createdAt: number
  updatedAt: number
}

export interface PersistArtifactsFromRunRequest {
  projectPath: string
  workspace: string
  factoryId?: string
  factoryLabel?: string
  caseId?: string
  caseLabel?: string
  sourceArtifactIds?: string[]
  templateId?: string
  templateName?: string
  workflowPath?: string | null
  workflowName?: string
  contracts: ArtifactContract[]
}

export interface PersistArtifactsFromRunResult {
  artifacts: ArtifactRecord[]
}

export interface FactoryOutcomeDefinition {
  title?: string
  statement?: string
  successSignal?: string
  timeHorizon?: string
  windowStart?: string
  windowEnd?: string
  targetCount?: number | null
  targetUnit?: string
  audience?: string
  constraints?: string[]
}

export interface FactoryRecipeDefinition {
  summary?: string
  packIds?: string[]
  stageOrder?: string[]
  artifactContracts?: string[]
  qualityPolicy?: string[]
  strategistCheckpoints?: string[]
  caseGenerationRules?: string[]
}

export interface ProjectFactoryDefinition {
  id: string
  modeId?: ResultModeId
  label: string
  outcome?: FactoryOutcomeDefinition
  recipe?: FactoryRecipeDefinition
  createdAt: number
  updatedAt: number
}

export interface ProjectFactoryBlueprint {
  version: 2
  projectPath: string
  factories: ProjectFactoryDefinition[]
  selectedFactoryId?: string | null
  createdAt: number
  updatedAt: number
}

export interface SaveProjectFactoryBlueprintInput {
  projectPath: string
  blueprint: {
    factories: Array<{
      id?: string
      modeId?: ResultModeId
      label?: string
      outcome?: FactoryOutcomeDefinition
      recipe?: FactoryRecipeDefinition
      createdAt?: number
      updatedAt?: number
    }>
    selectedFactoryId?: string | null
  }
}

export interface FactoryPlannedCase {
  id: string
  factoryId: string
  title: string
  summary?: string
  prompt?: string
  sourceArtifactId?: string
  sourceArtifactTitle?: string
  templateId?: string
  scheduledFor?: string
  position?: number
  createdAt: number
  updatedAt: number
}

export interface ProjectFactoryState {
  version: 1
  projectPath: string
  plannedCases: FactoryPlannedCase[]
  createdAt: number
  updatedAt: number
}

export interface SpawnFactoryCasesFromArtifactInput {
  projectPath: string
  factoryId: string
  artifactId: string
  templateId?: string
}

export interface SpawnFactoryCasesFromArtifactResult {
  state: ProjectFactoryState
  plannedCases: FactoryPlannedCase[]
}

export type ResultModeId =
  | "development"
  | "content"
  | "marketing"
  | "courses"
  | "research"
  | (string & {})

export interface CreateEntryPromptScaffold {
  goal: string
  input: string
  constraints: string
  successCriteria: string
}

export interface ResultModeDefinition {
  id: ResultModeId
  label: string
  emoji: string
  summary: string
  useFor: string
  youProvide: string
  youGetFirst: string
  userRole: string
}

export interface CreateEntryRouteOption {
  templateId: string
  label: string
  intentLabel?: string
  intentValues?: CreateEntryHelpModeHint[]
  recommended?: boolean
}

export type ProjectInspectionKind =
  | "greenfield_empty"
  | "greenfield_scaffold"
  | "existing_repo"
  | "review_ready"
  | "ambiguous"

export interface ProjectInspectionSummary {
  projectPath: string
  git: {
    isRepo: boolean
    branch: string | null
    hasUncommittedDiff: boolean
  }
  manifests: string[]
  codeDirs: string[]
  fileDensity: "empty" | "scaffold" | "active"
  fileCountEstimate: number
  projectKind: ProjectInspectionKind
}

export type CreateEntrySeedInputMode = "text" | "directory" | "branch_or_diff"

export type CreateEntryHelpModeHint = "do" | "plan" | "review"

export interface CreateEntryRouteSeed {
  primaryInputMode: CreateEntrySeedInputMode
  primaryInputValue: string
  attachments: InputAttachment[]
}

export interface ContentDomainContext {
  previousResults: Array<{ kind: string; title: string; ageMs: number }>
  templatesRun: string[]
  availableTools: string[]
}

export interface CreateEntryRouteInput {
  modeId: ResultModeId
  projectPath: string
  fallbackTemplateId?: string
  templateConstraintId?: string
  draftPrompt?: string
  requestedResult?: string
  helpModeHint?: CreateEntryHelpModeHint
  modeConfig?: Record<string, string> | null
  promptScaffold?: CreateEntryPromptScaffold | null
  allowedOptions?: CreateEntryRouteOption[]
  contentContext?: ContentDomainContext
  webSearchBackend?: "builtin" | "exa"
}

export interface CreateEntryHelpModeClarificationOption {
  value: CreateEntryHelpModeHint
  label: string
  description?: string
  disabled?: boolean
}

export interface CreateEntryJobRouteClarificationOption {
  value: string
  label: string
  description?: string
  templateId: string
}

export interface CreateEntryHelpModeClarification {
  kind: "help_mode"
  title: string
  message: string
  options: CreateEntryHelpModeClarificationOption[]
}

export interface CreateEntryJobRouteClarification {
  kind: "job_route"
  title: string
  message: string
  options: CreateEntryJobRouteClarificationOption[]
}

export type CreateEntryRouteClarification =
  | CreateEntryHelpModeClarification
  | CreateEntryJobRouteClarification

export interface CreateEntryRouteResult {
  recommendedTemplateId: string
  alternateTemplateIds: string[]
  reason: string
  projectInspection: ProjectInspectionSummary
  seed: CreateEntryRouteSeed
  domainMode: ResultModeId
  confidence: number
  source: "agent"
  clarification?: CreateEntryRouteClarification | null
}

export type WorkflowTemplateJourneyStage =
  | "map"
  | "intake"
  | "shape"
  | "research"
  | "plan"
  | "execute"
  | "verify"
  | "operate"
  | (string & {})

export interface WorkflowTemplatePackMetadata {
  id: string
  label: string
  journeyStage: WorkflowTemplateJourneyStage
  entrypoint?: boolean
  recommendedNext?: string[]
}

export type ExecutionPolicyTag =
  | "evidence_first"
  | "spec_first"
  | "small_tasks"
  | "fresh_workers"
  | "test_first"
  | "review_gates"
  | "isolated_workspace"
  | "human_gate_required"
  | "voice_locked"
  | "no_slop"
  | "publish_gate"
  | "critique_loops"
  | "variant_exploration"
  | "consistency_checks"
  | (string & {})

export type WorkflowTemplateSuggestedTool = "web_search" | (string & {})

export interface WorkflowExecutionPolicyProfile {
  profileId?: string
  summary?: string
  description?: string
  tags?: ExecutionPolicyTag[]
  notes?: string[]
}

export interface WorkflowTemplateCredit {
  label: string
  href: string
  note?: string
}

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  stage: WorkflowTemplateStage
  stageFamily?: StageFamily
  recommendedNext?: string[]
  suggestedTools?: WorkflowTemplateSuggestedTool[]
  emoji: string
  headline: string
  how: string
  input: string
  output: string
  steps: string[]
  useWhen?: string
  pack?: WorkflowTemplatePackMetadata
  contractIn?: ArtifactContract[]
  contractOut?: ArtifactContract[]
  executionPolicy?: WorkflowExecutionPolicyProfile
  credits?: WorkflowTemplateCredit[]
  workflow: Workflow
  source?: "builtin" | "plugin" | "user" | "hub"
  pluginId?: string
  pluginName?: string
  marketplaceId?: string
  marketplaceName?: string
  pluginVersion?: string
  templatePath?: string
}

// ── Execution State ─────────────────────────────────────

export type HumanTaskLifecycleStatus =
  | "open"
  | "answered"
  | "rejected"
  | "timed_out"
  | "consumed"

export interface HumanTaskPointer {
  taskId: string
  status: HumanTaskLifecycleStatus
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

export type RunStatus =
  | "running"
  | "paused"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"

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

export type ErrorKind =
  | "tool"
  | "model"
  | "timeout"
  | "policy"
  | "network"
  | "unknown"

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
  humanTask?: HumanTaskPointer
  warnings?: Array<{ kind: string; message: string }>
}

export interface WorkflowRun {
  id: string
  workflowId: string
  status: RunStatus
  startedAt: number
  nodeStates: Record<string, NodeState>
}

export interface RuntimeMetaEntry {
  subtaskContent?: string
  subtaskKey: string
  branchIndex: number
  totalBranches: number
  splitterId?: string
  templateId: string
}

export type WorkflowRuntimeMeta = Record<string, RuntimeMetaEntry>

export interface EvalCriterion {
  id: string
  score: number
  weight?: number
}

export interface EvaluationResult {
  attempt: number
  score: number
  reason: string
  passed: boolean
  fix_instructions?: string
  criteria?: EvalCriterion[]
}

export interface HumanTaskResponse {
  version: 1
  taskId: string
  resolution: "submitted" | "rejected" | "timed_out"
  answers: Record<string, unknown>
  comment?: string
  metadata: {
    answeredBy?: string
    answeredAt: number
    revision: number
    idempotencyKey: string
  }
}

export interface HumanTaskSnapshot {
  task: string
  taskId: string
  kind: "approval" | "form"
  status: HumanTaskLifecycleStatus
  workspace: string
  chainId: string
  sourceRunId: string
  nodeId: string
  workflowName: string
  workflowPath?: string
  projectPath?: string
  title: string
  instructions?: string
  summary?: string
  createdAt: number
  updatedAt: number
  consumedAt?: number
  responseRevision: number
  allowEdit?: boolean
  request: HumanTaskRequest
  latestResponse: HumanTaskResponse | null
}

export type HumanTaskSummary = Omit<
  HumanTaskSnapshot,
  "request" | "latestResponse"
>

export interface HumanTaskSubmitInput {
  answers: Record<string, unknown>
  comment?: string
  answeredBy?: string
  idempotencyKey?: string
}

// ── Structured Log ──────────────────────────────────────

export type LogEntry =
  | { type: "thinking"; content: string; timestamp: number }
  | { type: "text"; content: string; timestamp: number }
  | {
      type: "tool_use"
      tool: string
      input: Record<string, unknown>
      timestamp: number
    }
  | {
      type: "tool_result"
      tool: string
      output: string
      status: "success" | "error"
      timestamp: number
    }
  | { type: "error"; content: string; timestamp: number }
  | { type: "diff"; content: string; files: string[]; timestamp: number }

// ── IPC Events ──────────────────────────────────────────

export type WorkflowEvent =
  | { type: "node-queued"; runId: string; nodeId: string }
  | { type: "node-start"; runId: string; nodeId: string }
  | { type: "node-log"; runId: string; nodeId: string; entry: LogEntry }
  | { type: "node-done"; runId: string; nodeId: string; output: NodeInput }
  | { type: "node-error"; runId: string; nodeId: string; error: string }
  | {
      type: "node-warning"
      runId: string
      nodeId: string
      warning: string
      warningKind: "empty" | "repetition" | "refusal" | "length_anomaly"
    }
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
  | {
      type: "approval-requested"
      runId: string
      nodeId: string
      content: string
      message?: string
      allowEdit: boolean
    }
  | {
      type: "human-task-created"
      runId: string
      nodeId: string
      taskId: string
      title: string
    }
  | {
      type: "human-task-resolved"
      runId: string
      nodeId: string
      taskId: string
      resolution: "submitted" | "rejected" | "timed_out"
    }
  | {
      type: "eval-exhausted"
      runId: string
      nodeId: string
      score: number
      threshold: number
      attempt: number
    }
  | { type: "eval-overridden"; runId: string; nodeId: string }
  | {
      type: "run-done"
      runId: string
      status: RunStatus
      reportPath?: string
      workspace?: string
    }

// ── Input ───────────────────────────────────────────────

export type InputAttachment =
  | { kind: "file"; path: string; name: string }
  | { kind: "run"; runId: string; workspace: string; workflowName: string }
  | { kind: "text"; label: string; content: string }

export type WorkflowInput =
  | { type: "text"; value: string; context?: string }
  | { type: "url"; value: string; context?: string }
  | { type: "directory"; value: string; context?: string }

export type GenerationProgressStep =
  | "starting"
  | "thinking"
  | "writing"
  | "parsing"
  | "done"

export interface GenerationProgress {
  step: GenerationProgressStep | string
  count: number
}

export type FlowImprovementRecommendationKind =
  | "prefer_variant"
  | "stabilize_step"
  | "reduce_manual_edits"

export interface FlowImprovementRecommendationVariant {
  modelId: string
  promptHash: string
  skillRef?: string
}

export interface FlowImprovementRecommendationMetrics {
  candidateSuccessRate?: number
  comparisonSuccessRate?: number
  candidateAverageRetries?: number
  comparisonAverageRetries?: number
  candidateEvaluatorPassRate?: number
  comparisonEvaluatorPassRate?: number
  editRate?: number
}

export interface FlowImprovementRecommendation {
  id: string
  workflowName: string
  workflowPath?: string
  nodeId?: string
  nodeLabel?: string
  kind: FlowImprovementRecommendationKind
  summary: string
  evidence: string
  confidence: "medium" | "high"
  supportingRunCount: number
  comparisonRunCount?: number
  updatedAt: number
  candidate?: FlowImprovementRecommendationVariant
  baseline?: FlowImprovementRecommendationVariant
  metrics?: FlowImprovementRecommendationMetrics
}

export interface RunResult {
  runId: string
  status: RunStatus
  workflowName: string
  workflowPath?: string
  startedAt: number
  completedAt: number
  reportPath: string
  workspace: string
  // Iteration 7: enriched metrics for comparison & trends
  totalCost?: number
  totalTokensIn?: number
  totalTokensOut?: number
  evalScores?: Record<string, number>
  durationMs?: number
}

export interface PersistedRunSnapshot {
  nodeStates: Record<string, NodeState>
  runtimeNodes?: WorkflowNode[]
  runtimeEdges?: WorkflowEdge[]
  runtimeMeta?: WorkflowRuntimeMeta
  input?: WorkflowInput
  evalResults?: Record<string, EvaluationResult[]>
  humanTasks?: Record<string, HumanTaskPointer>
}

export interface LoadedRunResult extends RunResult {
  reportContent: string
  snapshot: PersistedRunSnapshot | null
}

export type TerminalRunSnapshot =
  | { status: "completed"; result: RunResult }
  | {
      status: "interrupted"
      snapshot: PersistedRunSnapshot
      resumeNodeId: string | null
    }

export interface InFlightManifestEntry {
  runId: string
  workspace: string
  workflowPath: string | null
  workflowName: string
}

export interface RunWorkspaceDeleteResult {
  runId: string
  deleted: boolean
  reclaimedBytes: number
}

export interface RunWorkspaceCleanupResult {
  deletedRuns: number
  reclaimedBytes: number
  retainedRuns: number
  deletedRunIds: string[]
}

// ── Batch Runs ────────────────────────────────────────

export interface BatchItemResult {
  input_index: number
  run_id: string
  status: RunStatus
  eval_scores: Record<string, number>
  cost_usd: number
  duration_ms: number
  error?: string
  output?: string
}

export interface BatchSummary {
  total: number
  processed: number
  passed: number
  failed: number
  cancelled: number
  mean_cost_usd: number
  mean_duration_ms: number
  pass_rate: number
}

export type BatchEvent =
  | {
      type: "batch-progress"
      batchId: string
      completed: number
      total: number
      running: number
    }
  | { type: "batch-item-done"; batchId: string; item: BatchItemResult }
  | { type: "batch-error"; batchId: string; error: string }
  | {
      type: "batch-done"
      batchId: string
      summary: BatchSummary
      items: BatchItemResult[]
    }

export interface ActiveWorkflowRun {
  kind: "run"
  runId: string
  workflowName: string
  workflowPath: string | null
  projectPath: string | null
  workspace: string
  status: "running" | "paused"
  startedAt: number
  updatedAt: number
  nodeStates: Record<string, NodeState>
  runtimeNodes: WorkflowNode[]
  runtimeEdges: WorkflowEdge[]
  runtimeMeta: WorkflowRuntimeMeta
}

export interface ActiveBatchRun {
  kind: "batch"
  batchId: string
  workflowName: string
  workflowPath: string | null
  projectPath: string | null
  total: number
  completed: number
  running: number
  concurrency: number
  stopOnFailure: boolean
  startedAt: number
  items: BatchItemResult[]
}

export type ActiveExecutionSnapshot = ActiveWorkflowRun | ActiveBatchRun

export interface IpcError {
  code:
    | "NOT_FOUND"
    | "PERMISSION_DENIED"
    | "EXECUTION_FAILED"
    | "INVALID_INPUT"
    | "UNKNOWN"
  message: string
  detail?: string
}

// ── Desktop Runtime ────────────────────────────────────

export type DesktopPlatform = "macos" | "windows" | "linux"

export interface DesktopRuntimeInfo {
  platform: DesktopPlatform
  titlebarHeight: number
  primaryModifierKey: "meta" | "ctrl"
  primaryModifierLabel: "⌘" | "Ctrl"
  isFullscreen: boolean
  isMaximized: boolean
}

export interface ClaudeCodeSubscriptionStatus {
  checkedAt: number
  cliInstalled: boolean
  loggedIn: boolean
  authMethod: string | null
  apiProvider: string | null
  hasSubscription: boolean
  error: string | null
}

// ── Telemetry ───────────────────────────────────────────

export type BuildFlavor = "oss" | "release"

export type TelemetryProvider = "noop" | "posthog"

export interface TelemetrySettings {
  buildFlavor: BuildFlavor
  provider: TelemetryProvider
  enabledInBuild: boolean
  consent: boolean
  telemetryLocalTest: boolean
  configDetected: boolean
}

export type TelemetryUiEvent =
  | "settings_opened"
  | "point_b_entered"
  | "routing_alternative_selected"
  | "graph_editor_opened"
  | "template_chained_manually"
  | "flow_resumed"
  | "continuation_followed"

// ── Auto-Updater ─────────────────────────────────────────

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error"

export interface UpdateInfo {
  status: UpdateStatus
  version?: string
  progress?: number
  error?: string
}

export type UpdateEvent =
  | { type: "checking" }
  | { type: "available"; version: string }
  | { type: "not-available" }
  | { type: "download-progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string }

// ── Chat Pipeline Editor ────────────────────────────────

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "tool_call" | "tool_result"
  content: string
  timestamp: number
  toolName?: string
  toolInput?: Record<string, unknown>
  toolCallId?: string
  toolOutput?: string
  toolError?: string
}

export interface ChatConversation {
  version: 1
  workflowPath: string
  messages: ChatMessage[]
  latestWorkflow?: Workflow | null
  createdAt: number
  updatedAt: number
}

export type ChatSessionStatus = "idle" | "thinking" | "streaming" | "error"

export interface ChatSessionMessage {
  id: string
  role: "user" | "assistant" | "tool_call" | "tool_result"
  content: string
  timestamp: number
  toolName?: string
  toolInput?: Record<string, unknown>
  toolCallId?: string
  toolOutput?: string
  toolError?: string
  streaming?: boolean
}

export interface ChatSessionSnapshot {
  workflowPath: string
  sessionId: string
  status: ChatSessionStatus
  activeToolName: string | null
  workflow: Workflow | null
  messages: ChatSessionMessage[]
  updatedAt: number
}

export type ChatEvent =
  | {
      type: "text-delta"
      sessionId: string
      workflowPath: string
      content: string
    }
  | {
      type: "thinking"
      sessionId: string
      workflowPath: string
      content?: string
    }
  | {
      type: "tool-call"
      sessionId: string
      workflowPath: string
      toolName: string
      toolInput: Record<string, unknown>
      toolCallId: string
    }
  | {
      type: "tool-result"
      sessionId: string
      workflowPath: string
      toolName: string
      toolCallId: string
      toolOutput?: string
      toolError?: string
    }
  | {
      type: "workflow-mutated"
      sessionId: string
      workflowPath: string
      workflow: Workflow
    }
  | {
      type: "message-complete"
      sessionId: string
      workflowPath: string
      message: ChatMessage
    }
  | {
      type: "turn-complete"
      sessionId: string
      workflowPath: string
      workflow: Workflow
    }
  | { type: "error"; sessionId: string; workflowPath: string; content: string }

export type ChatEventType = ChatEvent["type"]

export interface SkillCategoryNode {
  name: string
  path: string
  count: number
  children: SkillCategoryNode[]
  skills?: Array<{ name: string; description: string; skillRef: string }>
}

// ── MCP (Model Context Protocol) ────────────────────────

export type McpTransportType = "stdio" | "http" | "sse"
export type McpServerScope = "local" | "project" | "user"

export interface McpServerInfo {
  name: string
  scope: McpServerScope
  provider?: ProviderId
  projectPath?: string
  type: McpTransportType
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  headers?: Record<string, string>
  disabled?: boolean
  autoApprove?: string[]
}

export interface PluginMcpServerInfo {
  id: string
  name: string
  type: McpTransportType
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  headers?: Record<string, string>
  disabled?: boolean
  autoApprove?: string[]
  approved: boolean
  pluginId: string
  pluginName: string
  pluginVersion?: string
  pluginPath: string
  marketplaceId: string
  marketplaceName: string
}

export type McpIntegrationFieldKind = "text" | "secret"

export interface McpIntegrationField {
  id: string
  label: string
  kind: McpIntegrationFieldKind
  placeholder?: string
  description?: string
}

export interface McpIntegrationPostConfigureAction {
  webSearchBackend?: "builtin" | "exa"
}

export interface McpIntegrationInfo {
  id: string
  label: string
  description: string
  toolIds: string[]
  fields: McpIntegrationField[]
  setupTitle?: string
  setupDescription?: string
  postConfigure?: McpIntegrationPostConfigureAction
}

export type McpIntegrationConfigSource = "none" | "env" | "keyring" | "server"

export interface McpIntegrationStatus {
  integration: McpIntegrationInfo
  configured: boolean
  source: McpIntegrationConfigSource
  keyCount: number
  keyringPath: string
  requestedToolIds: string[]
}

export interface ConfigureMcpIntegrationInput {
  values: Record<string, string>
}

export interface McpIntegrationTestResult {
  healthy: boolean
  error?: string
}

export interface McpToolInfo {
  name: string
  serverName: string
  qualifiedName: string
  provider?: ProviderId
  description?: string
}

export interface McpMutationResult {
  success: boolean
  error?: string
}

export interface McpTestResult {
  healthy: boolean
  tools: McpToolInfo[]
  error?: string
  latencyMs: number
}

export interface McpProvider {
  id: ProviderId
  listServers(
    scope?: McpServerScope,
    projectPath?: string,
  ): Promise<McpServerInfo[]>
  listAllServers?(): Promise<McpServerInfo[]>
  addServer(
    server: McpServerInfo,
    projectPath?: string,
  ): Promise<McpMutationResult>
  updateServer?(
    name: string,
    server: McpServerInfo,
    projectPath?: string,
  ): Promise<McpMutationResult>
  removeServer(
    name: string,
    scope: McpServerScope,
    projectPath?: string,
  ): Promise<McpMutationResult>
  toggleServer(
    name: string,
    scope: McpServerScope,
    disabled: boolean,
    projectPath?: string,
  ): Promise<McpMutationResult>
  testServer(
    name: string,
    scope: McpServerScope,
    projectPath?: string,
  ): Promise<McpTestResult>
  discoverTools(
    serverName?: string,
    projectPath?: string,
  ): Promise<McpToolInfo[]>
}
