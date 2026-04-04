export interface FlowAction {
  label: string
  variant: "primary" | "secondary" | "destructive" | "ghost"
  action:
    | { type: "approve"; runId: string; nodeId: string }
    | { type: "override"; runId: string; nodeId: string }
    | { type: "reject"; runId: string; nodeId: string }
    | { type: "retry"; runId: string; nodeId: string }
    | { type: "continue"; runId: string }
    | { type: "expand-details" }
    | { type: "follow-up"; templateId: string }
    | { type: "open-report"; path: string }
    | { type: "open-all-files" }
    | { type: "cancel" }
}

export interface FlowResultFile {
  name: string
  path: string
  kind: string
  sizeLabel?: string
}

export interface FlowFollowUp {
  label: string
  emoji: string
  source: "recommended_next" | "contextual"
  templateId?: string
}

export interface DecisionContent {
  tone: "approval" | "eval-exhausted"
  summary: string
  resultFacts: string[]
  issues: string[]
  question: string
  actions: FlowAction[]
  editableContent?: string
  nodeId: string
  runId: string
}

export interface CompleteContent {
  summary: string
  findings: string[]
  limitations: string[]
  artifacts: FlowResultFile[]
  followUps: FlowFollowUp[]
  metrics: { duration: string; cost: string }
  runId: string
  /** Derived tone: success (clean), warning (has limitations), neutral (has findings only) */
  tone?: "success" | "warning" | "neutral"
  stepCount?: number
  heroArtifactContent?: string | null
  /** When true, render as a compact one-liner (earlier run in a multi-run thread) */
  compact?: boolean
}

export interface ErrorContent {
  variant: "error" | "cancelled" | "interrupted" | "timeout"
  tone: "danger" | "warning" | "info"
  summary: string
  suggestions: string[]
  actions: FlowAction[]
  flowName?: string
}

export interface StartContent {
  description: string
}

export interface ToolDigestEntry {
  tool: string // Normalized: "Read", "Bash", "web_search", etc.
  count: number
}

export interface ToolActionEntry {
  kind: "search" | "read" | "write" | "command" | "edit" | "browse" | "other"
  label: string
}

export interface RetryInfo {
  attempt: number
  maxAttempts: number
  kind: "network" | "rate-limit" | "eval" | "other"
}

export interface ProgressStep {
  nodeId: string
  label: string
  status: "pending" | "running" | "done" | "failed"
  summary?: string
  output?: string
  costUsd?: number
  retryInfo?: RetryInfo
  toolDigest?: ToolDigestEntry[]
  toolActions?: ToolActionEntry[]
  searchQueries?: string[] // Human-readable query text, max 5
  subSteps?: Array<{
    key: string
    label: string
    done: boolean
    status?: "pending" | "running" | "done" | "failed"
    toolDigest?: ToolDigestEntry[]
    toolActions?: ToolActionEntry[]
    searchQueries?: string[]
  }>
}

export interface ProgressContent {
  steps: ProgressStep[]
  elapsed?: string
  /** Epoch ms when the run started — used for live elapsed timer in the UI */
  startedAt?: number
  collapsed?: boolean
  collapsedLabel?: string
}

export interface RoutingClarification {
  kind: "help_mode" | "job_route"
  title: string
  message: string
  options: Array<{
    value: string
    label: string
    description?: string
    templateId?: string
  }>
}

export interface RoutingContent {
  userRequest?: string
  steps: Array<{ label: string; status: "pending" | "running" | "done" }>
  selectedTemplate?: {
    name: string
    description: string
  }
  clarification?: RoutingClarification
  error?: string
}

export interface StepNarrativeContent {
  nodeId: string
  label: string
  status: "pending" | "running" | "done" | "failed" | "skipped"
  nodeType: "skill" | "evaluator" | "splitter" | "approval" | "merger" | "human"
  summary?: string
  output?: string
  error?: string
  toolDigest?: ToolDigestEntry[]
  toolActions?: ToolActionEntry[]
  searchQueries?: string[]
  costUsd?: number
  duration?: string
  retryInfo?: RetryInfo
  branches?: StepNarrativeBranch[]
  startedAt?: number
  completedAt?: number
}

export interface StepNarrativeBranch {
  nodeId: string
  label: string
  status: "pending" | "running" | "done" | "failed" | "skipped"
  toolDigest?: ToolDigestEntry[]
  toolActions?: ToolActionEntry[]
  summary?: string
  output?: string
}

export type FlowChatMessageContent =
  | { type: "start"; data: StartContent }
  | { type: "progress"; data: ProgressContent }
  | { type: "decision"; data: DecisionContent }
  | { type: "complete"; data: CompleteContent }
  | { type: "error"; data: ErrorContent }
  | { type: "routing"; data: RoutingContent }
  | { type: "step-narrative"; data: StepNarrativeContent }

export interface FlowChatMessage {
  id: string
  flowName: string
  timestamp: number
  content: FlowChatMessageContent
  runIndex?: number | null
}
