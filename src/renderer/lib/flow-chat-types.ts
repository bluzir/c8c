export interface FlowAction {
  label: string
  variant: "primary" | "secondary" | "destructive" | "ghost"
  action:
    | { type: "approve"; runId: string; nodeId: string }
    | { type: "override"; runId: string; nodeId: string }
    | { type: "reject"; runId: string; nodeId: string }
    | { type: "retry"; runId: string; nodeId: string }
    | { type: "expand-details" }
    | { type: "follow-up"; templateId: string }
    | { type: "open-report"; path: string }
    | { type: "open-all-files" }
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
}

export interface ErrorContent {
  variant: "error" | "cancelled" | "interrupted"
  summary: string
  suggestions: string[]
  actions: FlowAction[]
}

export interface StartContent {
  description: string
}

export interface ProgressStep {
  nodeId: string
  label: string
  status: "pending" | "running" | "done" | "failed"
  summary?: string
  output?: string
  subSteps?: Array<{ key: string; label: string; done: boolean }>
}

export interface ProgressContent {
  steps: ProgressStep[]
  elapsed?: string
  /** Epoch ms when the run started — used for live elapsed timer in the UI */
  startedAt?: number
  collapsed?: boolean
  collapsedLabel?: string
}

export interface RoutingContent {
  userRequest?: string
  steps: Array<{ label: string; status: "pending" | "running" | "done" }>
  selectedTemplate?: {
    name: string
    description: string
    estimatedCost?: string
  }
}

export type FlowChatMessageContent =
  | { type: "start"; data: StartContent }
  | { type: "progress"; data: ProgressContent }
  | { type: "decision"; data: DecisionContent }
  | { type: "complete"; data: CompleteContent }
  | { type: "error"; data: ErrorContent }
  | { type: "routing"; data: RoutingContent }

export interface FlowChatMessage {
  id: string
  flowName: string
  timestamp: number
  content: FlowChatMessageContent
}
