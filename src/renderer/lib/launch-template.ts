import type {
  ArtifactRecord,
  CreateEntryRouteResult,
  InputAttachment,
  WorkflowTemplate,
} from "@shared/types"
import type { WebSearchBackend } from "./web-search-backend"
import type {
  WorkflowEntryState,
  WorkflowTemplateRunContext,
} from "./workflow-entry"
import {
  selectArtifactsForTemplateContracts,
  mergeInputAttachments,
} from "./workflow-entry"
import { createEmptyWorkflow } from "./default-workflow"
import { applyWorkflowDetailBudget } from "./workflow-detail-budget"
import { resolveTemplateWorkflow } from "./web-search-backend"
import { buildTemplateStartState } from "./template-start"
import { prepareRoutedTemplateLaunch } from "./routed-template-launch"
import { shouldAutoRunCreateStart } from "./workflow-create-start-policy"
import { getWorkflowTemplateDisplayName } from "./template-display"

// ── Public types ──────────────────────────────────────────

export interface LaunchTemplateParams {
  projectPath: string
  /** null = blank workflow */
  template: WorkflowTemplate | null
  requestedResult: string
  sourceArtifacts?: ArtifactRecord[]
  sourceAttachments?: InputAttachment[]
  routeResult?: CreateEntryRouteResult | null
  detailBudget?: number | null
  webSearchBackend: WebSearchBackend
  awaitingInput?: boolean
}

export interface LaunchTemplateOpenOptions {
  entryState?: WorkflowEntryState
  templateContext?: WorkflowTemplateRunContext
  initialInputValue?: string
  initialAttachments?: InputAttachment[]
  autoRunIfAllowed?: boolean
  pendingMessage?: string
  pendingEntryRequest?: string
}

export interface LaunchTemplateResult {
  filePath: string
  projectPath: string
  openOptions: LaunchTemplateOpenOptions
}

// ── Helpers ───────────────────────────────────────────────

async function resolveHubTemplate(
  template: WorkflowTemplate,
): Promise<WorkflowTemplate> {
  if (template.source !== "hub" || template.workflow.nodes.length > 0)
    return template
  const full = await window.api.fetchHubTemplate(template.id)
  return { ...template, ...full, source: "hub" }
}

function normalizeTemplateForWorkflowUse(
  template: WorkflowTemplate,
): WorkflowTemplate {
  const name = getWorkflowTemplateDisplayName(template)
  if (name === template.name) return template
  return { ...template, name }
}

function applyAwaitingInput(
  entry: WorkflowEntryState,
  awaitingInput: boolean,
): WorkflowEntryState {
  if (!awaitingInput) return entry
  return { ...entry, awaitingInput: true, summary: entry.inputText }
}

// ── Main ──────────────────────────────────────────────────

/**
 * Unified template launch.  ALL workflow creation paths call this.
 *
 * 1. Resolves hub templates if needed
 * 2. Applies contract matching — ALWAYS
 * 3. Creates the workflow file via IPC
 * 4. Builds template start state (routed or non-routed)
 * 5. Returns a structured result — does NOT set atoms
 *
 * The caller (`openWorkflowFile`) applies the result to atoms.
 */
export async function launchTemplate(
  params: LaunchTemplateParams,
): Promise<LaunchTemplateResult> {
  const {
    projectPath,
    template,
    requestedResult,
    sourceArtifacts = [],
    sourceAttachments = [],
    routeResult = null,
    detailBudget = null,
    webSearchBackend,
    awaitingInput = false,
  } = params

  // ── Blank workflow (no template) ──────────────────────
  if (!template) {
    const draftWorkflow = applyWorkflowDetailBudget(
      createEmptyWorkflow(),
      detailBudget,
    )
    const filePath = await window.api.createWorkflow(
      projectPath,
      "new-flow",
      draftWorkflow,
    )
    return {
      filePath,
      projectPath,
      openOptions: {
        pendingMessage: requestedResult,
        pendingEntryRequest: requestedResult,
        initialInputValue: requestedResult,
        initialAttachments: sourceAttachments,
      },
    }
  }

  // ── Contract matching — ALWAYS ────────────────────────
  const selectedArtifacts =
    template.contractIn?.length && sourceArtifacts.length
      ? selectArtifactsForTemplateContracts(
          template.contractIn,
          sourceArtifacts,
        )
      : sourceArtifacts

  // ── Routed template ───────────────────────────────────
  if (routeResult) {
    const launch = await prepareRoutedTemplateLaunch({
      projectPath,
      template,
      webSearchBackend,
      routeResult,
      requestedResult,
      sourceArtifacts: selectedArtifacts,
      detailBudget,
    })

    const entryState = applyAwaitingInput(
      launch.templateStartState.entryState,
      awaitingInput,
    )

    return {
      filePath: launch.filePath,
      projectPath,
      openOptions: {
        entryState,
        templateContext: launch.templateStartState.templateContext,
        initialInputValue: awaitingInput
          ? undefined
          : launch.templateStartState.initialInputValue,
        initialAttachments: mergeInputAttachments(
          sourceAttachments,
          launch.templateStartState.initialAttachments,
        ),
        autoRunIfAllowed: awaitingInput
          ? false
          : shouldAutoRunCreateStart(routeResult, template),
      },
    }
  }

  // ── Non-routed template ───────────────────────────────
  const resolvedTemplate = await resolveHubTemplate(template)
  const templateForWorkflowUse =
    normalizeTemplateForWorkflowUse(resolvedTemplate)
  const nextWorkflow = resolveTemplateWorkflow(
    templateForWorkflowUse,
    webSearchBackend,
    {
      detailBudget,
      templateId: templateForWorkflowUse.id,
    },
  )
  const filePath = await window.api.createWorkflow(
    projectPath,
    templateForWorkflowUse.name,
    nextWorkflow,
  )

  void window.api
    .recordProjectTemplateUsage(projectPath, templateForWorkflowUse.id)
    .catch(() => undefined)

  const hydratedTemplate = { ...templateForWorkflowUse, workflow: nextWorkflow }
  const templateStartState = buildTemplateStartState({
    template: hydratedTemplate,
    workflowPath: filePath,
    projectPath,
    requestedResult,
    sourceArtifacts: selectedArtifacts,
  })

  const entryState = applyAwaitingInput(
    templateStartState.entryState,
    awaitingInput,
  )

  return {
    filePath,
    projectPath,
    openOptions: {
      entryState,
      templateContext: templateStartState.templateContext,
      initialInputValue: awaitingInput
        ? undefined
        : templateStartState.initialInputValue,
      initialAttachments: mergeInputAttachments(
        sourceAttachments,
        templateStartState.initialAttachments,
      ),
      autoRunIfAllowed: awaitingInput
        ? false
        : shouldAutoRunCreateStart(null, hydratedTemplate),
    },
  }
}
