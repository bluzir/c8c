import { buildCreateEntryRouteSeed } from "@shared/create-entry-routing"
import type {
  ArtifactRecord,
  CreateEntryRouteResult,
  WorkflowFile,
  WorkflowTemplate,
} from "@shared/types"
import { getWorkflowTemplateDisplayName } from "@/lib/template-display"
import { buildTemplateStartStateFromRoute } from "@/lib/template-start"
import {
  resolveTemplateWorkflow,
  type WebSearchBackend,
} from "@/lib/web-search-backend"
import { selectArtifactsForTemplateContracts } from "@/lib/workflow-entry"
import { workflowSnapshot } from "@/lib/workflow-snapshot"

export function buildRoutedTemplateResultForTemplate({
  routeResult,
  templateId,
  requestedResult,
  alternateTemplateIds,
}: {
  routeResult: CreateEntryRouteResult
  templateId: string
  requestedResult: string
  alternateTemplateIds?: string[]
}): CreateEntryRouteResult {
  return {
    ...routeResult,
    recommendedTemplateId: templateId,
    alternateTemplateIds:
      alternateTemplateIds ?? routeResult.alternateTemplateIds,
    seed: buildCreateEntryRouteSeed(
      templateId,
      routeResult.projectInspection,
      requestedResult,
    ),
    clarification: null,
  }
}

async function resolveTemplateForWorkflowUse(
  template: WorkflowTemplate,
): Promise<WorkflowTemplate> {
  const resolvedTemplate =
    template.source === "hub" && template.workflow.nodes.length === 0
      ? {
          ...template,
          ...(await window.api.fetchHubTemplate(template.id)),
          source: "hub" as const,
        }
      : template

  const displayName = getWorkflowTemplateDisplayName(resolvedTemplate)
  if (displayName === resolvedTemplate.name) {
    return resolvedTemplate
  }

  return {
    ...resolvedTemplate,
    name: displayName,
  }
}

export async function prepareRoutedTemplateLaunch({
  projectPath,
  template,
  webSearchBackend,
  routeResult,
  requestedResult,
  sourceArtifacts,
  detailBudget = null,
  alternateTemplateIds,
}: {
  projectPath: string
  template: WorkflowTemplate
  webSearchBackend: WebSearchBackend
  routeResult: CreateEntryRouteResult
  requestedResult: string
  sourceArtifacts?: ArtifactRecord[]
  detailBudget?: number | null
  alternateTemplateIds?: string[]
}): Promise<{
  filePath: string
  loadedWorkflow: WorkflowTemplate["workflow"]
  refreshedWorkflows: WorkflowFile[]
  templateStartState: ReturnType<typeof buildTemplateStartStateFromRoute>
  savedSnapshot: string
}> {
  const templateForWorkflowUse = await resolveTemplateForWorkflowUse(template)
  const nextWorkflow = resolveTemplateWorkflow(
    templateForWorkflowUse,
    webSearchBackend,
    {
      detailBudget,
      templateId: templateForWorkflowUse.id,
    },
  )
  const workflowName = routeResult.suggestedTitle || templateForWorkflowUse.name
  const namedWorkflow =
    workflowName !== nextWorkflow.name
      ? { ...nextWorkflow, name: workflowName }
      : nextWorkflow
  const filePath = await window.api.createWorkflow(
    projectPath,
    workflowName,
    namedWorkflow,
  )
  void window.api
    .recordProjectTemplateUsage(projectPath, templateForWorkflowUse.id)
    .catch(() => undefined)
  const [loadedWorkflow, refreshedWorkflows] = await Promise.all([
    window.api.loadWorkflow(filePath),
    window.api.listProjectWorkflows(projectPath),
  ])
  const hydratedTemplate = {
    ...templateForWorkflowUse,
    workflow: loadedWorkflow,
  }
  const hydratedRouteResult = buildRoutedTemplateResultForTemplate({
    routeResult,
    templateId: hydratedTemplate.id,
    requestedResult,
    alternateTemplateIds,
  })

  // When the template declares contractIn and source artifacts satisfy it,
  // filter artifacts via contract matching so only relevant ones are attached.
  // This mirrors the factory-launch path used by "Use in new flow".
  const contractIn = hydratedTemplate.contractIn ?? template.contractIn
  const selectedArtifacts =
    contractIn && contractIn.length > 0 && sourceArtifacts?.length
      ? selectArtifactsForTemplateContracts(contractIn, sourceArtifacts)
      : sourceArtifacts

  return {
    filePath,
    loadedWorkflow,
    refreshedWorkflows,
    templateStartState: buildTemplateStartStateFromRoute({
      template: hydratedTemplate,
      workflowPath: filePath,
      projectPath,
      requestedResult,
      routeResult: hydratedRouteResult,
      sourceArtifacts: selectedArtifacts,
    }),
    savedSnapshot: workflowSnapshot(loadedWorkflow),
  }
}
