import type {
  ArtifactRecord,
  CreateEntryRouteResult,
  InputAttachment,
  WorkflowTemplate,
} from "@shared/types"
import {
  buildArtifactInputAttachments,
  buildTemplateRunContext,
  buildTemplateWorkflowEntryState,
  mergeInputAttachments,
  type WorkflowEntrySource,
} from "./workflow-entry"

function normalizeRequestedResult(requestedResult: string) {
  return requestedResult.trim()
}

export function buildGuidedStartSeed(
  template: WorkflowTemplate,
  projectPath: string | null,
  requestedResult: string,
): { initialInputValue: string; initialAttachments: InputAttachment[] } {
  const inputNode = template.workflow.nodes.find(
    (node) => node.type === "input",
  )
  const forcedInputType =
    inputNode?.type === "input" ? inputNode.config.inputType : undefined
  const cleanRequestedResult = normalizeRequestedResult(requestedResult)

  if (forcedInputType === "directory") {
    return {
      initialInputValue: projectPath || "",
      initialAttachments: cleanRequestedResult
        ? [
            {
              kind: "text",
              label: "Requested result",
              content: cleanRequestedResult,
            },
          ]
        : [],
    }
  }

  return {
    initialInputValue: cleanRequestedResult,
    initialAttachments: [],
  }
}

export function buildTemplateStartState({
  template,
  workflowPath,
  projectPath,
  requestedResult,
  source = "template",
  sourceArtifacts,
  seedOverride,
}: {
  template: WorkflowTemplate
  workflowPath: string | null
  projectPath: string | null
  requestedResult?: string
  source?: Extract<WorkflowEntrySource, "template" | "template_customize">
  sourceArtifacts?: ArtifactRecord[]
  seedOverride?: {
    initialInputValue: string
    initialAttachments: InputAttachment[]
  } | null
}) {
  const cleanRequestedResult = normalizeRequestedResult(requestedResult || "")
  const seed =
    seedOverride ||
    buildGuidedStartSeed(template, projectPath, cleanRequestedResult)
  const artifactAttachments = buildArtifactInputAttachments(
    sourceArtifacts || [],
  )
  const baseEntryState = buildTemplateWorkflowEntryState({
    template,
    workflowPath,
    source,
  })

  return {
    entryState: cleanRequestedResult
      ? {
          ...baseEntryState,
          contractLabel: "Requested result",
          contractText: cleanRequestedResult,
        }
      : baseEntryState,
    templateContext: buildTemplateRunContext({
      template,
      workflowPath,
      source,
      sourceArtifacts,
    }),
    initialInputValue: seed.initialInputValue,
    initialAttachments: mergeInputAttachments(
      artifactAttachments,
      seed.initialAttachments,
    ),
  }
}

export function buildTemplateStartStateFromRoute({
  template,
  workflowPath,
  projectPath,
  requestedResult,
  routeResult,
  source = "template",
  sourceArtifacts,
}: {
  template: WorkflowTemplate
  workflowPath: string | null
  projectPath: string | null
  requestedResult?: string
  routeResult: CreateEntryRouteResult
  source?: Extract<WorkflowEntrySource, "template" | "template_customize">
  sourceArtifacts?: ArtifactRecord[]
}) {
  const templateStartState = buildTemplateStartState({
    template,
    workflowPath,
    projectPath,
    requestedResult,
    source,
    sourceArtifacts,
    seedOverride: {
      initialInputValue: routeResult.seed.primaryInputValue,
      initialAttachments: routeResult.seed.attachments,
    },
  })

  return {
    ...templateStartState,
    entryState: {
      ...templateStartState.entryState,
      routing: {
        source: routeResult.source,
        reason: routeResult.reason,
        confidence: routeResult.confidence,
      },
    },
  }
}
