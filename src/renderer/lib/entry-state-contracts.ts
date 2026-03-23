import type { WorkflowTemplate } from "@shared/types"
import { getWorkflowTemplateDisplayName } from "@/lib/template-display"
import {
  deriveTemplateCardCopy,
  deriveTemplateJobLabel,
  deriveTemplateJourneyStageLabel,
  deriveTemplatePackStagePath,
  deriveTemplateUseWhen,
} from "@/lib/workflow-entry"

export interface ProjectRequiredContract {
  projectRequired: boolean
  resolvedProjectPath: string | null
  blockerStatement: string
  actionInstruction: string
  primaryActionLabel: string
}

export function resolveProjectRequiredContract({
  resolvedProjectPath,
  supportsProjectlessCreation = false,
  primaryActionLabel,
}: {
  resolvedProjectPath: string | null
  supportsProjectlessCreation?: boolean
  primaryActionLabel?: string
}): ProjectRequiredContract {
  const projectRequired = !supportsProjectlessCreation && !resolvedProjectPath

  return {
    projectRequired,
    resolvedProjectPath,
    blockerStatement: "A project is required before this flow can start.",
    actionInstruction: "Select or add one now.",
    primaryActionLabel: primaryActionLabel || "Choose folder",
  }
}

export type GuidedEntryKind = "guided" | "isolated"

export interface GuidedTemplateEntryContract {
  template: WorkflowTemplate
  entryKind: GuidedEntryKind
  jobLabel: string
  jobSummary: string
  primaryActionLabel: string
  useWhen: string
  youProvide: string
  youGetFirst: string
  stagePath: string[]
  stagePathLabel: string | null
  firstStageLabel: string | null
}

function isGuidedTemplate(template: WorkflowTemplate) {
  return template.pack?.entrypoint === true
}

export function resolveGuidedTemplateEntryContract(
  template: WorkflowTemplate,
  catalog: WorkflowTemplate[],
): GuidedTemplateEntryContract {
  const stagePath = template.pack?.id
    ? deriveTemplatePackStagePath(catalog, template.pack.id)
    : []
  const firstStageLabel =
    stagePath[0] || deriveTemplateJourneyStageLabel(template)
  const jobLabel =
    deriveTemplateJobLabel(template) || getWorkflowTemplateDisplayName(template)
  const entryKind: GuidedEntryKind = isGuidedTemplate(template)
    ? "guided"
    : "isolated"

  return {
    template,
    entryKind,
    jobLabel,
    jobSummary: template.headline || deriveTemplateCardCopy(template),
    primaryActionLabel:
      entryKind === "guided" ? "Start first stage" : "Start this flow",
    useWhen: deriveTemplateUseWhen(template),
    youProvide: template.input,
    youGetFirst: template.output,
    stagePath,
    stagePathLabel: stagePath.length > 0 ? stagePath.join(" -> ") : null,
    firstStageLabel,
  }
}

export function splitGuidedTemplateEntryContracts(
  templates: WorkflowTemplate[],
  catalog: WorkflowTemplate[] = templates,
) {
  const entries = templates.map((template) =>
    resolveGuidedTemplateEntryContract(template, catalog),
  )
  return {
    entries,
    guidedEntries: entries.filter((entry) => entry.entryKind === "guided"),
    isolatedEntries: entries.filter((entry) => entry.entryKind === "isolated"),
  }
}

export type DemotedDestinationKey =
  | "starting_points"
  | "skills"
  | "lab"
  | "settings"

export interface DemotedDestinationAccessContract {
  key: DemotedDestinationKey
  label: string
  commandPaletteLabel: string
  keyboardShortcutLabel: string | null
  sidebarAccessible: boolean
  commandPaletteAccessible: boolean
}

export const DEMOTED_DESTINATION_ACCESS_CONTRACTS: Record<
  DemotedDestinationKey,
  DemotedDestinationAccessContract
> = {
  starting_points: {
    key: "starting_points",
    label: "Starting points",
    commandPaletteLabel: "Starting points",
    keyboardShortcutLabel: null,
    sidebarAccessible: true,
    commandPaletteAccessible: true,
  },
  skills: {
    key: "skills",
    label: "Skills",
    commandPaletteLabel: "Skills",
    keyboardShortcutLabel: null,
    sidebarAccessible: true,
    commandPaletteAccessible: true,
  },
  lab: {
    key: "lab",
    label: "Lab",
    commandPaletteLabel: "Lab",
    keyboardShortcutLabel: null,
    sidebarAccessible: false,
    commandPaletteAccessible: true,
  },
  settings: {
    key: "settings",
    label: "Settings",
    commandPaletteLabel: "Settings",
    keyboardShortcutLabel: "Cmd/Ctrl+,",
    sidebarAccessible: true,
    commandPaletteAccessible: true,
  },
}
