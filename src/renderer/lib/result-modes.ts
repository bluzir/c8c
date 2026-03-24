import type {
  CreateEntryHelpModeHint,
  ProjectInspectionKind,
  ResultModeDefinition,
  ResultModeId,
  WorkflowTemplate,
  WorkflowTemplateStage,
} from "@shared/types"
import { allDomains, getDomain } from "@shared/domains"
import type { WorkflowCreatePromptScaffold } from "@/lib/workflow-create-prompt"
import { initDomains } from "@/lib/domain-init"

// Ensure domains are registered before any module-level constants are built.
initDomains()

export interface WorkflowResultMode extends ResultModeDefinition {
  packIds?: string[]
  templateIds?: string[]
  stagePreferences?: WorkflowTemplateStage[]
  startTemplateId?: string
  startActionLabel?: string
  guidedPath?: string[]
  runtimeLine?: string
  composerPlaceholder: string
  scaffoldPlaceholders: WorkflowCreatePromptScaffold
}

export interface WorkflowResultModeQuickStart {
  templateId: string
  label: string
  summary: string
  intentLabel: string
  intentValues?: CreateEntryHelpModeHint[]
  recommended?: boolean
}

export interface ResolvedWorkflowResultModeQuickStart extends WorkflowResultModeQuickStart {
  template: WorkflowTemplate
}

function getDevelopmentCreateQuickStartPresentation(
  templateId: string,
  projectKind?: ProjectInspectionKind | null,
): Pick<
  WorkflowResultModeQuickStart,
  "label" | "summary" | "intentLabel"
> | null {
  switch (projectKind) {
    case "greenfield_empty":
    case "greenfield_scaffold":
      if (templateId === "delivery-shape-project") {
        return {
          label: "Build from brief",
          summary:
            "Turn the brief into a scoped build path and move toward a working result.",
          intentLabel: "Do it",
        }
      }
      if (templateId === "delivery-plan-phase") {
        return {
          label: "Plan from brief",
          summary:
            "Turn the brief into a concrete plan without forcing implementation.",
          intentLabel: "Plan it",
        }
      }
      return null
    case "existing_repo":
      if (templateId === "delivery-map-codebase") {
        return {
          label: "Understand the current app",
          summary:
            "Orient on the current codebase when you need context before changing it.",
          intentLabel: "Do it",
        }
      }
      if (templateId === "delivery-shape-project") {
        return {
          label: "Change the app",
          summary:
            "Turn the repo context and desired outcome into a concrete change plan.",
          intentLabel: "Do it",
        }
      }
      if (templateId === "delivery-plan-phase") {
        return {
          label: "Plan the change",
          summary:
            "Take the scoped work and turn it into an execution-ready plan.",
          intentLabel: "Plan it",
        }
      }
      return null
    case "review_ready":
      if (templateId === "delivery-review-phase") {
        return {
          label: "Review before ship",
          summary:
            "Check the current work, surface gaps, and decide what must change before verification.",
          intentLabel: "Review it",
        }
      }
      if (templateId === "delivery-map-codebase") {
        return {
          label: "Understand the current app",
          summary:
            "Orient on the current codebase when you need context before changing it.",
          intentLabel: "Do it",
        }
      }
      if (templateId === "delivery-shape-project") {
        return {
          label: "Change the app",
          summary:
            "Turn the repo context and desired outcome into a concrete change plan.",
          intentLabel: "Do it",
        }
      }
      if (templateId === "delivery-plan-phase") {
        return {
          label: "Plan the change",
          summary:
            "Turn the reviewed context into a concrete execution plan before implementation starts.",
          intentLabel: "Plan it",
        }
      }
      return null
    default:
      if (templateId === "delivery-shape-project") {
        return {
          label: "Build from brief",
          summary:
            "Turn the desired outcome into a scoped build path with visible checkpoints.",
          intentLabel: "Do it",
        }
      }
      if (templateId === "delivery-map-codebase") {
        return {
          label: "Understand the current app",
          summary:
            "Orient on the current codebase when you need context before changing it.",
          intentLabel: "Do it",
        }
      }
      if (templateId === "delivery-plan-phase") {
        return {
          label: "Plan the change",
          summary:
            "Turn the desired outcome into a concrete plan without jumping straight to implementation.",
          intentLabel: "Plan it",
        }
      }
      if (templateId === "delivery-review-phase") {
        return {
          label: "Review before ship",
          summary:
            "Review the current work, surface concrete gaps, and prepare it for final verification.",
          intentLabel: "Review it",
        }
      }
      return null
  }
}

export function getResultModeQuickStartOptions(
  modeId: ResultModeId,
): WorkflowResultModeQuickStart[] {
  const domain = getDomain(modeId)
  return [...domain.quickStarts]
}

export function getResultModeRouteDestinations(
  modeId: ResultModeId,
): WorkflowResultModeQuickStart[] {
  const domain = getDomain(modeId)
  return [...(domain.routeDestinations || domain.quickStarts)]
}

export function prioritizeDevelopmentCreateQuickStarts<
  T extends { templateId: string },
>(quickStarts: T[], projectKind?: ProjectInspectionKind | null): T[] {
  if (quickStarts.length === 0) return []

  const templateIds =
    projectKind === "review_ready"
      ? [
          "delivery-review-phase",
          "delivery-shape-project",
          "delivery-plan-phase",
          "delivery-map-codebase",
        ]
      : projectKind === "existing_repo"
        ? [
            "delivery-shape-project",
            "delivery-plan-phase",
            "delivery-map-codebase",
          ]
        : projectKind === "greenfield_empty" ||
            projectKind === "greenfield_scaffold"
          ? ["delivery-shape-project", "delivery-plan-phase"]
          : [
              "delivery-shape-project",
              "delivery-map-codebase",
              "delivery-plan-phase",
            ]

  const quickStartById = new Map(
    quickStarts.map((quickStart) => [quickStart.templateId, quickStart]),
  )
  return templateIds.flatMap((templateId) => {
    const quickStart = quickStartById.get(templateId)
    return quickStart ? [quickStart] : []
  })
}

export function presentDevelopmentCreateQuickStarts<
  T extends WorkflowResultModeQuickStart,
>(quickStarts: T[], projectKind?: ProjectInspectionKind | null): T[] {
  return quickStarts.map((quickStart) => {
    const presentation = getDevelopmentCreateQuickStartPresentation(
      quickStart.templateId,
      projectKind,
    )
    if (!presentation) return quickStart
    return {
      ...quickStart,
      ...presentation,
    } as T
  })
}

export function presentDevelopmentCreateRouteOptions<
  T extends { templateId: string; label: string; intentLabel?: string },
>(options: T[], projectKind?: ProjectInspectionKind | null): T[] {
  return options.map((option) => {
    const presentation = getDevelopmentCreateQuickStartPresentation(
      option.templateId,
      projectKind,
    )
    if (!presentation) return option
    return {
      ...option,
      label: presentation.label,
      intentLabel: presentation.intentLabel,
    }
  })
}

export const RESULT_MODES: WorkflowResultMode[] = allDomains().map(
  (domain) => ({
    id: domain.id,
    label: domain.label,
    emoji: domain.emoji,
    summary: domain.summary,
    useFor: domain.useFor,
    youProvide: domain.youProvide,
    youGetFirst: domain.youGetFirst,
    userRole: domain.userRole,
    composerPlaceholder: domain.composerPlaceholder,
    scaffoldPlaceholders:
      domain.scaffoldPlaceholders as unknown as WorkflowCreatePromptScaffold,
    packIds: domain.packIds,
    templateIds: Array.from(domain.templateIds),
    stagePreferences: domain.stagePreferences,
    startTemplateId: domain.startTemplateId,
    startActionLabel: domain.startActionLabel,
    guidedPath: domain.guidedPath,
    runtimeLine: domain.runtimeLine,
  }),
)

const MODE_BY_ID = new Map<ResultModeId, WorkflowResultMode>(
  RESULT_MODES.map((mode) => [mode.id, mode]),
)

export function getResultMode(modeId: ResultModeId): WorkflowResultMode {
  return MODE_BY_ID.get(modeId) || RESULT_MODES[0]
}

export function getResultModeQuickStarts(
  templates: WorkflowTemplate[],
  modeId: ResultModeId,
): ResolvedWorkflowResultModeQuickStart[] {
  const quickStarts = getResultModeQuickStartOptions(modeId)
  if (quickStarts.length === 0) return []

  const templatesById = new Map(
    templates.map((template) => [template.id, template]),
  )
  return quickStarts.flatMap((quickStart) => {
    const template = templatesById.get(quickStart.templateId)
    return template ? [{ ...quickStart, template }] : []
  })
}

function templateScoreForMode(
  template: WorkflowTemplate,
  modeId: ResultModeId,
): number {
  return getDomain(modeId).scoreTemplate(template)
}

export function templateMatchesResultMode(
  template: WorkflowTemplate,
  modeId: ResultModeId,
): boolean {
  return templateScoreForMode(template, modeId) > 0
}

export function filterTemplatesForResultMode(
  templates: WorkflowTemplate[],
  modeId: ResultModeId,
): WorkflowTemplate[] {
  return templates.filter((template) =>
    templateMatchesResultMode(template, modeId),
  )
}

export function prioritizeTemplatesForResultMode(
  templates: WorkflowTemplate[],
  modeId: ResultModeId,
): WorkflowTemplate[] {
  return templates
    .map((template, index) => ({
      template,
      index,
      score: templateScoreForMode(template, modeId),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return left.index - right.index
    })
    .map((entry) => entry.template)
}

export function splitTemplatesForResultMode(
  templates: WorkflowTemplate[],
  modeId: ResultModeId,
) {
  const prioritizedModeTemplates = prioritizeTemplatesForResultMode(
    templates,
    modeId,
  )
  const quickStarts = getResultModeQuickStarts(prioritizedModeTemplates, modeId)
  const quickStartIds = new Set(
    quickStarts.map((quickStart) => quickStart.template.id),
  )
  const modeTemplates = prioritizedModeTemplates.filter(
    (template) => !quickStartIds.has(template.id),
  )
  const otherTemplates = templates.filter(
    (template) => !templateMatchesResultMode(template, modeId),
  )

  return {
    quickStarts,
    modeTemplates,
    otherTemplates,
  }
}
