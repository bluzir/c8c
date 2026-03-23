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

const DEFAULT_TEMPLATE_ROUTING_PRESENTATIONS: Record<
  string,
  { title: string; helpModeLabel?: string | null }
> = {
  "delivery-map-codebase": {
    title: "Understand the current app",
    helpModeLabel: "Do it",
  },
  "delivery-shape-project": {
    title: "Build from brief",
    helpModeLabel: "Do it",
  },
  "delivery-plan-phase": {
    title: "Plan the change",
    helpModeLabel: "Plan it",
  },
  "delivery-review-phase": {
    title: "Review before ship",
    helpModeLabel: "Review it",
  },
  "full-stack-code-audit": {
    title: "Audit codebase risks",
    helpModeLabel: "Review it",
  },
  "ux-ui-polish-audit": {
    title: "Audit and polish this UI",
    helpModeLabel: "Review it",
  },
  "impeccable-ui-pipeline": {
    title: "Improve this UI flow",
    helpModeLabel: "Do it",
  },
  "playwright-visual-audit": {
    title: "Audit this UI in browser",
    helpModeLabel: "Review it",
  },
  "cto-optimise-audit": {
    title: "Run a full CTO-grade audit",
    helpModeLabel: "Review it",
  },
  "delivery-investigate-bug": {
    title: "Investigate a bug",
    helpModeLabel: "Do it",
  },
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
  const defaultPresentation =
    DEFAULT_TEMPLATE_ROUTING_PRESENTATIONS[template.id] || null
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
      normalize(defaultPresentation?.title) ||
      normalize(deriveTemplateJobLabel(template)) ||
      template.name,
    helpModeLabel:
      normalize(helpModeLabel) || normalize(defaultPresentation?.helpModeLabel),
    stageLabel: deriveTemplateJourneyStageLabel(template),
    stages,
  }
}
