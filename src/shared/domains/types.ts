import type {
  CreateEntryRouteInput,
  CreateEntryRouteOption,
  ResultModeId,
  WorkflowTemplate,
  WorkflowTemplateStage,
} from "../types"

export interface ResultModeConfigField {
  id: string
  label: string
  placeholder: string
  type?: "textarea"
  helpText?: string
}

export interface DomainQuickStart {
  templateId: string
  label: string
  summary: string
  intentLabel: string
}

export interface DomainDefinition {
  id: ResultModeId
  label: string
  emoji: string
  primaryDomain?: boolean

  // Display
  summary: string
  useFor: string
  youProvide: string
  youGetFirst: string
  userRole: string
  composerPlaceholder: string
  scaffoldPlaceholders: Record<string, string>
  guidedPath: string[]
  startTemplateId: string
  startActionLabel: string
  runtimeLine: string

  // Routing
  guidedRouting: boolean
  bannedEntryTemplateIds: Set<string>

  // Templates + Scoring
  packIds: string[]
  templateIds: Set<string>
  metadataTokens: string[]
  stagePreferences: WorkflowTemplateStage[]
  quickStarts: DomainQuickStart[]
  scoreTemplate: (template: WorkflowTemplate) => number

  // Spine
  templateStageOverrides: Record<string, string>
  spinePackIds: Set<string>

  // Intents
  intentsEnabled: boolean

  // Config form
  configFields: ResultModeConfigField[]
  configLabels: Record<string, string>

  // Factory
  factoryFallbackLabel: string
  factoryTitleFieldId: string
  factorySuccessFieldId?: string
  factoryCheckpoints: string[]
  qualityPolicy: string[]
  caseGenerationRule: string
  successSignal: string
  buildOutcomeSections?: (
    values: Record<string, string>,
  ) => Array<{ label: string; value: string }>
  buildConstraints?: (values: Record<string, string>) => string[]
  buildAudience?: (values: Record<string, string>) => string | undefined
}
