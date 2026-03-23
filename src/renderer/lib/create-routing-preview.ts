import type { CreateEntryRouteOption, WorkflowTemplate } from "@shared/types"
import { buildProcessSpine, type ProcessSpineStage } from "@/lib/process-spine"
import {
  deriveTemplateJobLabel,
  deriveTemplateJourneyStageLabel,
} from "@/lib/workflow-entry"

export interface CreateRoutingPreview {
  templateId: string
  title: string
  helpModeLabel: string | null
  stageLabel: string | null
  stages: ProcessSpineStage[]
}

function normalize(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

export function buildCreateRoutingPreview({
  templateId,
  templates,
  routeOptions,
}: {
  templateId: string
  templates: WorkflowTemplate[]
  routeOptions: CreateEntryRouteOption[]
}): CreateRoutingPreview | null {
  const template = templates.find((entry) => entry.id === templateId) || null
  if (!template) return null

  const routeOption =
    routeOptions.find((option) => option.templateId === templateId) || null
  return buildTemplateRoutingPreview({
    template,
    templates,
    title: routeOption?.label,
    helpModeLabel: routeOption?.intentLabel,
  })
}

export function buildTemplateRoutingPreview({
  template,
  templates,
  title,
  helpModeLabel,
}: {
  template: WorkflowTemplate
  templates: WorkflowTemplate[]
  title?: string | null
  helpModeLabel?: string | null
}): CreateRoutingPreview {
  const stages =
    buildProcessSpine({
      context: {
        templateId: template.id,
        templateName: template.name,
        workflowPath: null,
        workflowName: template.name,
        source: "template",
        pack: template.pack,
      },
      templates,
      runStatus: "idle",
      runOutcome: null,
    }) || []

  return {
    templateId: template.id,
    title:
      normalize(title) ||
      normalize(deriveTemplateJobLabel(template)) ||
      template.name,
    helpModeLabel: normalize(helpModeLabel),
    stageLabel: deriveTemplateJourneyStageLabel(template),
    stages,
  }
}
