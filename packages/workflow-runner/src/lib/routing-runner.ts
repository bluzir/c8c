import type {
  ArtifactRecord,
  ChatRunHistory,
  CreateEntryRouteInput,
  CreateEntryRouteResult,
  InputAttachment,
  Workflow,
  WorkflowEntryState,
  WorkflowInput,
  WorkflowTemplate,
  WorkflowTemplateRunContext,
} from "@shared/types"
import type {
  ContractWarning,
  RoutingEvent,
  RoutingHandle,
  RoutingIntent,
  RoutingPhase,
  RunEnvelope,
} from "@shared/routing-types"
import { matchArtifactsToContracts } from "./artifact-resolver.js"
import {
  assembleInputWithAttachments,
  type InputAssemblerDeps,
} from "./input-assembler.js"

// ── Deps ────────────────────────────────────────────────

export interface RoutingRunnerDeps extends InputAssemblerDeps {
  listTemplates: (projectPath?: string) => Promise<WorkflowTemplate[]>
  listProjectArtifacts: (projectPath: string) => Promise<ArtifactRecord[]>
  routeCreateEntry: (
    input: CreateEntryRouteInput,
  ) => Promise<CreateEntryRouteResult>
  createWorkflow: (
    projectPath: string,
    name: string,
    workflow: Workflow,
  ) => Promise<string>
  loadWorkflow: (filePath: string) => Promise<Workflow>
  loadChatRunHistory?: (
    chatId: string,
    projectPath: string,
  ) => Promise<ChatRunHistory | undefined>
}

// ── Generator ───────────────────────────────────────────

async function* routeIntentGenerator(
  sessionId: string,
  intent: RoutingIntent,
  deps: RoutingRunnerDeps,
  isCancelled: () => boolean,
): AsyncGenerator<RoutingEvent> {
  yield { type: "routing_started", sessionId, intent }

  // Step 1: Load templates
  let templates: WorkflowTemplate[]
  try {
    templates = await deps.listTemplates(intent.projectPath)
    if (isCancelled()) return
    yield { type: "templates_loaded", sessionId, count: templates.length }
  } catch (error) {
    yield {
      type: "routing_failed",
      sessionId,
      error: String(error),
      phase: "template_load" as RoutingPhase,
    }
    return
  }

  // Step 2: Resolve artifacts
  let sourceArtifacts: ArtifactRecord[] = []
  let contractWarnings: ContractWarning[] = []
  let matchedArtifacts: ArtifactRecord[] = []
  try {
    const projectArtifacts = await deps.listProjectArtifacts(
      intent.projectPath,
    )
    if (isCancelled()) return

    sourceArtifacts = intent.sourceArtifactIds?.length
      ? projectArtifacts.filter((a) =>
          intent.sourceArtifactIds!.includes(a.id),
        )
      : []

    // Find the target template for contract matching
    const constrainedTemplate = intent.templateConstraintId
      ? templates.find((t) => t.id === intent.templateConstraintId)
      : undefined

    const { matched, warnings } = matchArtifactsToContracts(
      constrainedTemplate?.contractIn,
      sourceArtifacts,
    )
    matchedArtifacts = matched
    contractWarnings = warnings

    yield {
      type: "artifacts_resolved",
      sessionId,
      matched: matchedArtifacts,
      warnings: contractWarnings,
    }
  } catch (error) {
    yield {
      type: "routing_failed",
      sessionId,
      error: String(error),
      phase: "artifact_resolution" as RoutingPhase,
    }
    return
  }

  // Step 3: Route via agent (or use constraint)
  let routeResult: CreateEntryRouteResult | null = null
  let selectedTemplate: WorkflowTemplate | undefined
  try {
    if (intent.templateConstraintId) {
      selectedTemplate = templates.find(
        (t) => t.id === intent.templateConstraintId,
      )
    }

    if (!selectedTemplate) {
      yield { type: "route_inspecting", sessionId }

      const routeInput: CreateEntryRouteInput = {
        modeId: (intent.resultModeId as CreateEntryRouteInput["modeId"]) ||
          "dev",
        projectPath: intent.projectPath,
        templateConstraintId: intent.templateConstraintId,
        requestedResult: intent.requestedResult,
        modeConfig: intent.modeConfig,
        webSearchBackend: intent.webSearchBackend,
      }

      routeResult = await deps.routeCreateEntry(routeInput)
      if (isCancelled()) return

      if (routeResult.clarification) {
        yield {
          type: "route_clarification",
          sessionId,
          clarification: routeResult.clarification,
        }
        // Clarification means the user needs to respond — stop here.
        // The caller should re-invoke routeIntent with updated intent.
        return
      }

      selectedTemplate = templates.find(
        (t) => t.id === routeResult!.recommendedTemplateId,
      )
    }

    if (!selectedTemplate) {
      yield {
        type: "routing_failed",
        sessionId,
        error: `No matching template found${routeResult ? ` (recommended: ${routeResult.recommendedTemplateId})` : ""}`,
        phase: "route_selection" as RoutingPhase,
      }
      return
    }

    yield {
      type: "route_selected",
      sessionId,
      templateId: selectedTemplate.id,
      templateName: selectedTemplate.name,
      reason: routeResult?.reason || "Template constraint",
      confidence: routeResult?.confidence ?? 1,
    }
  } catch (error) {
    yield {
      type: "routing_failed",
      sessionId,
      error: String(error),
      phase: "route_selection" as RoutingPhase,
    }
    return
  }

  // Step 4: Create workflow from template
  let workflowPath: string
  let workflow: Workflow
  try {
    workflowPath = await deps.createWorkflow(
      intent.projectPath,
      selectedTemplate.name,
      selectedTemplate.workflow,
    )
    if (isCancelled()) return

    workflow = await deps.loadWorkflow(workflowPath)
    if (isCancelled()) return

    yield {
      type: "workflow_created",
      sessionId,
      workflowPath,
      workflowName: workflow.name,
    }
  } catch (error) {
    yield {
      type: "routing_failed",
      sessionId,
      error: String(error),
      phase: "workflow_creation" as RoutingPhase,
    }
    return
  }

  // Step 4b: Load chat run history (if available)
  let chatRunHistory: ChatRunHistory | undefined
  if (intent.chatId && deps.loadChatRunHistory) {
    try {
      chatRunHistory = await deps.loadChatRunHistory(
        intent.chatId,
        intent.projectPath,
      )
      if (isCancelled()) return
    } catch {
      chatRunHistory = undefined
    }
  }

  // Step 5: Assemble input
  let assembledValue: string
  let attachments: InputAttachment[] = []
  try {
    // Build attachments from matched artifacts — use "run" kind so the
    // assembler loads actual report content from the workspace on disk
    attachments = matchedArtifacts.map(
      (a): InputAttachment => ({
        kind: "run",
        runId: a.runId,
        workspace: a.workspace,
        workflowName: a.workflowName || a.title,
      }),
    )

    // If the route result provided a seed, use its input value and attachments.
    // When matched artifacts exist (cross-flow handoff), the artifacts carry the
    // real content — clear the base value so the template name doesn't pollute input.
    // IMPORTANT: never fall back to intent.requestedResult as baseValue — it may
    // contain a template name / follow-up label (metadata). requestedResult belongs
    // only in the Context section (via assembler's requestedResult parameter).
    const baseValue = matchedArtifacts.length > 0
      ? ""
      : routeResult?.seed?.primaryInputValue || ""
    const seedAttachments = routeResult?.seed?.attachments || []
    const allAttachments = [...seedAttachments, ...attachments]

    assembledValue = await assembleInputWithAttachments(
      baseValue,
      intent.requestedResult,
      allAttachments,
      intent.projectPath,
      deps,
      chatRunHistory,
    )
    if (isCancelled()) return

    // Update attachments to include seed attachments
    attachments = allAttachments

    yield {
      type: "input_assembled",
      sessionId,
      hasArtifactContent: matchedArtifacts.length > 0,
      inputLength: assembledValue.length,
    }
  } catch (error) {
    yield {
      type: "routing_failed",
      sessionId,
      error: String(error),
      phase: "input_assembly" as RoutingPhase,
    }
    return
  }

  // Step 6: Build envelope
  const input: WorkflowInput = { type: "text", value: assembledValue }

  const entryState: WorkflowEntryState = {
    workflowPath,
    workflowName: workflow.name,
    source: "template",
    title: selectedTemplate.name,
    summary: selectedTemplate.description || "",
    contractLabel: selectedTemplate.contractOut?.[0]?.title || "",
    contractText: selectedTemplate.output || "",
    inputText: selectedTemplate.input || "",
    outputText: selectedTemplate.output || "",
    readinessText: "",
    routing: routeResult
      ? {
          source: "agent",
          reason: routeResult.reason,
          confidence: routeResult.confidence,
          domainMode: routeResult.domainMode,
          alternateTemplateIds: routeResult.alternateTemplateIds,
          projectInspection: routeResult.projectInspection,
        }
      : undefined,
  }

  const templateContext: WorkflowTemplateRunContext = {
    templateId: selectedTemplate.id,
    templateName: selectedTemplate.name,
    workflowPath,
    workflowName: workflow.name,
    source: "template",
    recommendedNext: selectedTemplate.recommendedNext,
    suggestedTools: selectedTemplate.suggestedTools,
    useWhen: selectedTemplate.useWhen,
    inputText: selectedTemplate.input,
    outputText: selectedTemplate.output,
    sourceArtifactIds: intent.sourceArtifactIds,
    pack: selectedTemplate.pack,
    contractIn: selectedTemplate.contractIn,
    contractOut: selectedTemplate.contractOut,
    executionPolicy: selectedTemplate.executionPolicy,
  }

  const envelope: RunEnvelope = {
    intent,
    chatId: intent.chatId,
    chatRunHistory,
    workflow,
    workflowPath,
    input,
    resolvedArtifacts: matchedArtifacts,
    attachments,
    entryState,
    templateContext,
    routeResult,
    autoRun: intent.type === "follow_up",
    contractWarnings,
  }

  yield { type: "envelope_ready", sessionId, envelope }
}

// ── Public API ──────────────────────────────────────────

export function createRoutingRunner(deps: RoutingRunnerDeps) {
  return {
    routeIntent(
      intent: RoutingIntent,
      options?: { sessionId?: string },
    ): RoutingHandle {
      let cancelled = false
      const sessionId = options?.sessionId || `routing-${Date.now()}`

      let resolveEnvelope!: (env: RunEnvelope) => void
      let rejectEnvelope!: (err: Error) => void
      const envelopePromise = new Promise<RunEnvelope>((res, rej) => {
        resolveEnvelope = res
        rejectEnvelope = rej
      })

      const generator = routeIntentGenerator(
        sessionId,
        intent,
        deps,
        () => cancelled,
      )

      // Wrap generator to capture envelope_ready / routing_failed
      let envelopeSettled = false
      const wrappedEvents = (async function* () {
        try {
          for await (const event of generator) {
            if (event.type === "envelope_ready") {
              envelopeSettled = true
              resolveEnvelope(event.envelope)
            }
            if (event.type === "routing_failed") {
              envelopeSettled = true
              rejectEnvelope(new Error(event.error))
            }
            yield event
          }
          // If generator completes without envelope_ready or routing_failed
          // (e.g. clarification path), reject so callers don't hang forever
          if (!envelopeSettled) {
            envelopeSettled = true
            rejectEnvelope(
              new Error("Routing ended without producing an envelope"),
            )
          }
        } catch (error) {
          if (!envelopeSettled) {
            envelopeSettled = true
            rejectEnvelope(
              error instanceof Error ? error : new Error(String(error)),
            )
          }
          const failEvent: RoutingEvent = {
            type: "routing_failed",
            sessionId,
            error: String(error),
            phase: "input_assembly",
          }
          yield failEvent
        }
      })()

      return {
        events: wrappedEvents,
        envelope: envelopePromise,
        cancel: () => {
          cancelled = true
        },
      }
    },
  }
}
