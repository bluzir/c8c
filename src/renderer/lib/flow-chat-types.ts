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

export type FlowChatMessageContent =
  | { type: "decision"; data: DecisionContent }
  | { type: "complete"; data: CompleteContent }

export interface FlowChatMessage {
  id: string
  flowName: string
  timestamp: number
  content: FlowChatMessageContent
}
