import type {
  ArtifactRecord,
  InputAttachment,
  ProjectFactoryDefinition,
  WorkflowFile,
  WorkflowTemplate,
} from "@shared/types"
import type { WebSearchBackend } from "@/lib/web-search-backend"
import { resolveTemplateWorkflow } from "@/lib/web-search-backend"
import {
  buildArtifactAttachmentSeedInput,
  buildArtifactInputAttachments,
  buildTemplateRunContext,
  buildTemplateWorkflowEntryState,
  type WorkflowTemplateCaseOverride,
} from "@/lib/workflow-entry"
import { workflowSnapshot } from "@/lib/workflow-snapshot"

export async function prepareTemplateStageLaunch({
  projectPath,
  template,
  webSearchBackend,
  artifacts,
  factory = null,
  caseOverride = null,
  inputSeedPrefix = null,
}: {
  projectPath: string
  template: WorkflowTemplate
  webSearchBackend: WebSearchBackend
  artifacts: ArtifactRecord[]
  factory?: Pick<ProjectFactoryDefinition, "id" | "label"> | null
  caseOverride?: WorkflowTemplateCaseOverride | null
  inputSeedPrefix?: string | null
}): Promise<{
  filePath: string
  loadedWorkflow: WorkflowTemplate["workflow"]
  refreshedWorkflows: WorkflowFile[]
  artifactAttachments: InputAttachment[]
  inputSeed: string
  entryState: ReturnType<typeof buildTemplateWorkflowEntryState>
  templateContext: ReturnType<typeof buildTemplateRunContext>
  savedSnapshot: string
}> {
  const nextWorkflow = resolveTemplateWorkflow(template, webSearchBackend)
  const filePath = await window.api.createWorkflow(
    projectPath,
    template.name,
    nextWorkflow,
  )
  void window.api
    .recordProjectTemplateUsage(projectPath, template.id)
    .catch(() => undefined)
  const [loadedWorkflow, refreshedWorkflows] = await Promise.all([
    window.api.loadWorkflow(filePath),
    window.api.listProjectWorkflows(projectPath),
  ])

  const artifactAttachments: InputAttachment[] =
    buildArtifactInputAttachments(artifacts)
  const hydratedTemplate = {
    ...template,
    workflow: loadedWorkflow,
  }

  const baseInputSeed = buildArtifactAttachmentSeedInput(artifactAttachments)
  const inputSeed = inputSeedPrefix?.trim()
    ? `${inputSeedPrefix.trim()}\n\n---\n\n${baseInputSeed}`
    : baseInputSeed

  return {
    filePath,
    loadedWorkflow,
    refreshedWorkflows,
    artifactAttachments,
    inputSeed,
    entryState: buildTemplateWorkflowEntryState({
      template: hydratedTemplate,
      workflowPath: filePath,
    }),
    templateContext: buildTemplateRunContext({
      template: hydratedTemplate,
      workflowPath: filePath,
      sourceArtifacts: artifacts,
      factory,
      caseOverride,
    }),
    savedSnapshot: workflowSnapshot(loadedWorkflow),
  }
}
