import { useMemo } from "react"

import type {
  CreateEntryRouteOption,
  ResultModeId,
  WorkflowTemplate,
} from "@shared/types"

import { projectFolderName } from "@/components/sidebar/projectSidebarUtils"
import { resolveProjectRequiredContract, resolveGuidedTemplateEntryContract, splitGuidedTemplateEntryContracts } from "@/lib/entry-state-contracts"
import {
  buildResultModeSeedInput,
  countResultModeConfigFields,
  getResultModeConfigFields,
  normalizeResultModeConfig,
} from "@/lib/result-mode-config"
import {
  getResultMode,
  getResultModeQuickStartOptions,
  presentDevelopmentCreateQuickStarts,
  presentDevelopmentCreateRouteOptions,
  prioritizeDevelopmentCreateQuickStarts,
  prioritizeTemplatesForResultMode,
  splitTemplatesForResultMode,
} from "@/lib/result-modes"
import { STAGE_META } from "@/lib/template-stages"
import { countWorkflowCreateScaffoldFields, hasWorkflowCreatePromptContent, type WorkflowCreatePromptScaffold } from "@/lib/workflow-create-prompt"
import { deriveTemplateExecutionDisciplineLabels } from "@/lib/workflow-entry"
import { filterDirectCreateEntryOptions } from "@shared/create-entry-routing"

const POPULAR_TEMPLATE_LIMIT = 12
const DEVELOPMENT_CREATE_QUICK_START_IDS = new Set([
  "delivery-map-codebase",
  "delivery-shape-project",
  "delivery-plan-phase",
  "delivery-review-phase",
])
const DEVELOPMENT_CONTEXTUAL_ROUTE_OPTIONS: CreateEntryRouteOption[] = [
  {
    templateId: "full-stack-code-audit",
    label: "Audit codebase risks",
    intentLabel: "Review it",
  },
  {
    templateId: "ux-ui-polish-audit",
    label: "Audit and polish this UI",
    intentLabel: "Review it",
  },
  {
    templateId: "impeccable-ui-pipeline",
    label: "Improve this UI flow",
    intentLabel: "Do it",
  },
  {
    templateId: "playwright-visual-audit",
    label: "Audit this UI in browser",
    intentLabel: "Review it",
  },
  {
    templateId: "cto-optimise-audit",
    label: "Run a full CTO-grade audit",
    intentLabel: "Review it",
  },
  {
    templateId: "delivery-investigate-bug",
    label: "Investigate a bug",
    intentLabel: "Do it",
  },
]

export function useWorkflowCreateDerivedState({
  targetProjectPath,
  sourceArtifacts,
  sourceAttachments,
  selectedResultModeId,
  modeConfigs,
  pendingTemplate,
  promptScaffold,
  draftPrompt,
  submitting,
  availableTemplates,
  popularTemplates,
  projectKind,
  continuationPresentation,
  preferNewFlow,
  submitError,
  promptHelperOpen,
}: {
  targetProjectPath: string | null
  sourceArtifacts: Array<{ title: string }>
  sourceAttachments: Array<{ kind: string; name?: string; workflowName?: string; label?: string }>
  selectedResultModeId: ResultModeId
  modeConfigs: Record<string, Record<string, string> | undefined>
  pendingTemplate: WorkflowTemplate | null
  promptScaffold: WorkflowCreatePromptScaffold
  draftPrompt: string
  submitting: boolean
  availableTemplates: WorkflowTemplate[]
  popularTemplates: WorkflowTemplate[]
  projectKind?: string | null
  continuationPresentation: "hidden" | "supporting" | "dominant"
  preferNewFlow: boolean
  submitError: string | null
  promptHelperOpen: boolean
}) {
  const targetProjectName = useMemo(
    () => (targetProjectPath ? projectFolderName(targetProjectPath) : null),
    [targetProjectPath],
  )
  const projectRequired = useMemo(
    () => resolveProjectRequiredContract({
      resolvedProjectPath: targetProjectPath,
      primaryActionLabel: "Choose folder",
    }),
    [targetProjectPath],
  )
  const sourceAttachmentSummary = useMemo(() => {
    if (sourceArtifacts.length > 0) {
      const titles = sourceArtifacts.slice(0, 2).map((artifact) => artifact.title)
      if (sourceArtifacts.length > 2) {
        titles.push(`+${sourceArtifacts.length - 2} more`)
      }
      return titles.join(" · ")
    }
    if (sourceAttachments.length > 0) {
      const labels = sourceAttachments.slice(0, 2).map((attachment) => {
        if (attachment.kind === "file") return attachment.name || attachment.label || "File"
        if (attachment.kind === "run") return attachment.workflowName || attachment.label || "Run"
        return attachment.label || attachment.name || "Attachment"
      })
      if (sourceAttachments.length > 2) {
        labels.push(`+${sourceAttachments.length - 2} more`)
      }
      return labels.join(" · ")
    }
    return null
  }, [sourceArtifacts, sourceAttachments])

  const selectedResultMode = useMemo(
    () => getResultMode(selectedResultModeId),
    [selectedResultModeId],
  )
  const selectedModeConfig = useMemo(
    () => normalizeResultModeConfig(selectedResultModeId, modeConfigs[selectedResultModeId]),
    [modeConfigs, selectedResultModeId],
  )
  const selectedModeConfigFields = useMemo(
    () => getResultModeConfigFields(selectedResultModeId),
    [selectedResultModeId],
  )
  const selectedModeConfigFieldCount = useMemo(
    () => countResultModeConfigFields(selectedResultModeId, selectedModeConfig),
    [selectedModeConfig, selectedResultModeId],
  )
  const pendingTemplateDisciplineLabels = pendingTemplate ? deriveTemplateExecutionDisciplineLabels(pendingTemplate) : []
  const pendingTemplateCategoryLabel = pendingTemplate ? STAGE_META[pendingTemplate.stage].label : null
  const pendingTemplateExecutionSummary = pendingTemplate
    ? pendingTemplate.executionPolicy?.summary?.trim()
      || (pendingTemplateDisciplineLabels.length > 0 ? pendingTemplateDisciplineLabels.join(", ") : null)
    : null
  const scaffoldFieldCount = useMemo(
    () => countWorkflowCreateScaffoldFields(promptScaffold),
    [promptScaffold],
  )
  const optionalDetailCount = selectedModeConfigFieldCount + scaffoldFieldCount
  const canSubmitPrompt = hasWorkflowCreatePromptContent(draftPrompt, promptScaffold)
    || selectedModeConfigFieldCount > 0
  const routingActive = submitting && selectedResultMode.id === "development"
  const createSeedMessage = useMemo(
    () => (
      canSubmitPrompt
        ? buildResultModeSeedInput(
          selectedResultMode,
          selectedModeConfig,
          draftPrompt,
          promptScaffold,
        )
        : ""
    ),
    [canSubmitPrompt, draftPrompt, promptScaffold, selectedModeConfig, selectedResultMode],
  )
  const modeTemplateSplit = useMemo(
    () => splitTemplatesForResultMode(availableTemplates, selectedResultModeId),
    [availableTemplates, selectedResultModeId],
  )
  const visibleQuickStarts = modeTemplateSplit.quickStarts
  const quickStartOptions = useMemo(
    () => getResultModeQuickStartOptions(selectedResultMode.id),
    [selectedResultMode.id],
  )
  const routeOptions = useMemo<CreateEntryRouteOption[]>(
    () => {
      const basePrimaryOptions = (visibleQuickStarts.length > 0 ? visibleQuickStarts : quickStartOptions).map((quickStart) => ({
        templateId: quickStart.templateId,
        label: quickStart.label,
        intentLabel: quickStart.intentLabel,
        recommended: quickStart.recommended,
      }))
      const primaryOptions = filterDirectCreateEntryOptions(
        selectedResultMode.id,
        selectedResultMode.id === "development"
          ? presentDevelopmentCreateRouteOptions(basePrimaryOptions, projectKind)
          : basePrimaryOptions,
      )
      if (selectedResultMode.id !== "development") return primaryOptions

      const availableTemplateIds = new Set(availableTemplates.map((template) => template.id))
      const contextualOptions = filterDirectCreateEntryOptions(
        selectedResultMode.id,
        DEVELOPMENT_CONTEXTUAL_ROUTE_OPTIONS.filter((option) => availableTemplateIds.has(option.templateId)),
      )

      return [...primaryOptions, ...contextualOptions].filter((option, index, array) =>
        array.findIndex((candidate) => candidate.templateId === option.templateId) === index)
    },
    [availableTemplates, projectKind, quickStartOptions, selectedResultMode.id, visibleQuickStarts],
  )
  const displayQuickStarts = useMemo(() => {
    if (visibleQuickStarts.length === 0) return []
    if (selectedResultMode.id !== "development") return visibleQuickStarts
    const entryQuickStarts = visibleQuickStarts.filter((quickStart) =>
      DEVELOPMENT_CREATE_QUICK_START_IDS.has(quickStart.template.id))
    const prioritizedQuickStarts = prioritizeDevelopmentCreateQuickStarts(
      entryQuickStarts.length > 0 ? entryQuickStarts : visibleQuickStarts,
      projectKind,
    )
    const primaryQuickStarts = prioritizedQuickStarts.length > 0 ? prioritizedQuickStarts : visibleQuickStarts.slice(0, 3)
    return presentDevelopmentCreateQuickStarts(primaryQuickStarts, projectKind)
  }, [projectKind, selectedResultMode.id, visibleQuickStarts])
  const visiblePopularTemplates = useMemo(() => {
    const modeTemplates = prioritizeTemplatesForResultMode(popularTemplates, selectedResultModeId)
    return (modeTemplates.length > 0 ? modeTemplates : popularTemplates).slice(0, POPULAR_TEMPLATE_LIMIT)
  }, [popularTemplates, selectedResultModeId])
  const visiblePopularTemplateEntries = useMemo(
    () => splitGuidedTemplateEntryContracts(visiblePopularTemplates, availableTemplates),
    [availableTemplates, visiblePopularTemplates],
  )
  const suggestedTemplates = useMemo(() => {
    if (displayQuickStarts.length > 0) {
      return displayQuickStarts.map((quickStart) => ({
        template: quickStart.template,
        title: resolveGuidedTemplateEntryContract(quickStart.template, availableTemplates).jobLabel,
        summary: quickStart.summary,
        eyebrow: quickStart.intentLabel,
        recommended: quickStart.recommended,
      }))
    }

    return [...visiblePopularTemplateEntries.guidedEntries, ...visiblePopularTemplateEntries.isolatedEntries]
      .slice(0, 6)
      .map((entry) => ({
        template: entry.template,
        title: entry.jobLabel,
        summary: entry.entryKind === "guided" ? entry.useWhen : entry.jobSummary,
        eyebrow: entry.entryKind === "guided"
          ? (entry.firstStageLabel ? `Guided · ${entry.firstStageLabel}` : "Guided path")
          : undefined,
        recommended: false,
      }))
  }, [availableTemplates, displayQuickStarts, visiblePopularTemplateEntries.guidedEntries, visiblePopularTemplateEntries.isolatedEntries])
  const suggestedTemplatesTitle = useMemo(() => {
    if (selectedResultMode.id === "development") return "Suggested ways to start"
    return `Suggested ${selectedResultMode.label.toLowerCase()} starts`
  }, [selectedResultMode.id, selectedResultMode.label])
  const pendingQuickStart = useMemo(
    () => displayQuickStarts.find((quickStart) => quickStart.template.id === pendingTemplate?.id) || null,
    [displayQuickStarts, pendingTemplate?.id],
  )
  const pendingPrimaryActionLabel = pendingQuickStart?.intentLabel
    ? `Start ${pendingQuickStart.label}`
    : "Start with this"
  const figureOwner = projectRequired.projectRequired
    ? "no_project"
    : submitError
      ? "start_error"
      : routingActive
        ? "routing"
        : continuationPresentation === "dominant"
          ? "continue_first"
          : (canSubmitPrompt || preferNewFlow)
            ? "new_flow"
            : "browse_for_start"
  const showComposer = figureOwner === "browse_for_start" || figureOwner === "new_flow" || figureOwner === "continue_first"
  const showDetailsPanel = promptHelperOpen && showComposer
  const showRoutingState = figureOwner === "routing"
  const showStartError = figureOwner === "start_error"
  const showContinuationCard = figureOwner === "continue_first"
  const showSuggestions = figureOwner === "browse_for_start"
  const visibleSuggestions = showSuggestions ? suggestedTemplates.slice(0, 2) : []

  return {
    targetProjectName,
    projectRequired,
    sourceAttachmentSummary,
    selectedResultMode,
    selectedModeConfig,
    selectedModeConfigFields,
    selectedModeConfigFieldCount,
    pendingTemplateCategoryLabel,
    pendingTemplateExecutionSummary,
    optionalDetailCount,
    canSubmitPrompt,
    routingActive,
    createSeedMessage,
    routeOptions,
    suggestedTemplatesTitle,
    pendingQuickStart,
    pendingPrimaryActionLabel,
    showComposer,
    figureOwner,
    showDetailsPanel,
    showRoutingState,
    showStartError,
    showContinuationCard,
    showSuggestions,
    visibleSuggestions,
  }
}
