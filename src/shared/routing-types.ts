import type {
  ArtifactRecord,
  CreateEntryRouteClarification,
  CreateEntryRouteResult,
  InputAttachment,
  Workflow,
  WorkflowInput,
  WorkflowEntryState,
  WorkflowTemplateRunContext,
} from "./types"

export interface RoutingIntent {
  type: "new_flow" | "follow_up" | "retry"
  projectPath: string
  requestedResult: string
  resultModeId?: string
  templateConstraintId?: string
  sourceRunId?: string
  sourceArtifactIds?: string[]
  sourceWorkflowKey?: string
  modeConfig?: Record<string, string> | null
  detailBudget?: number | null
  webSearchBackend?: "builtin" | "exa"
}

export interface RunEnvelope {
  intent: RoutingIntent
  workflow: Workflow
  workflowPath: string
  input: WorkflowInput
  resolvedArtifacts: ArtifactRecord[]
  attachments: InputAttachment[]
  entryState: WorkflowEntryState
  templateContext: WorkflowTemplateRunContext
  routeResult: CreateEntryRouteResult | null
  autoRun: boolean
  contractWarnings: ContractWarning[]
}

export type RoutingEvent =
  | { type: "routing_started"; sessionId: string; intent: RoutingIntent }
  | { type: "templates_loaded"; sessionId: string; count: number }
  | { type: "route_inspecting"; sessionId: string }
  | {
      type: "route_selected"
      sessionId: string
      templateId: string
      templateName: string
      reason: string
      confidence: number
    }
  | {
      type: "route_clarification"
      sessionId: string
      clarification: CreateEntryRouteClarification
    }
  | {
      type: "artifacts_resolved"
      sessionId: string
      matched: ArtifactRecord[]
      warnings: ContractWarning[]
    }
  | {
      type: "workflow_created"
      sessionId: string
      workflowPath: string
      workflowName: string
    }
  | {
      type: "input_assembled"
      sessionId: string
      hasArtifactContent: boolean
      inputLength: number
    }
  | { type: "envelope_ready"; sessionId: string; envelope: RunEnvelope }
  | {
      type: "routing_failed"
      sessionId: string
      error: string
      phase: RoutingPhase
    }

export type RoutingPhase =
  | "template_load"
  | "route_selection"
  | "artifact_resolution"
  | "workflow_creation"
  | "input_assembly"

export interface ContractWarning {
  kind: "missing_artifact" | "kind_mismatch" | "empty_content"
  contractKind: string
  message: string
}

export interface RoutingHandle {
  events: AsyncIterable<RoutingEvent>
  envelope: Promise<RunEnvelope>
  cancel: () => void
}
