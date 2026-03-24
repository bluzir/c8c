import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  currentWorkflowAtom,
  inputAttachmentsAtom,
  inputValueAtom,
  mainViewAtom,
  projectsAtom,
  selectedResultModeIdAtom,
  selectedInboxTaskKeyAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  desktopRuntimeAtom,
  globalDetailBudgetAtom,
  templateLibraryContextAtom,
  viewModeAtom,
  webSearchBackendAtom,
  workflowQueuedAutoRunPathAtom,
  workflowCreateContextAtom,
  workflowCreateDraftPromptAtom,
  workflowCreateModeConfigsAtom,
  workflowCreatePendingEntryAtom,
  workflowCreatePendingMessageAtom,
  workflowCreatePromptScaffoldAtom,
  workflowCreateSourceArtifactsAtom,
  workflowCreateSourceAttachmentsAtom,
  workflowEntryStateAtom,
  setWorkflowContinuationEntryStateForKeyAtom,
  setWorkflowRequestedResultForKeyAtom,
  setWorkflowTemplateContextForKeyAtom,
  workflowDirtyAtom,
  workflowSavedSnapshotAtom,
  workflowsAtom,
} from "@/lib/store"
import { Button } from "@/components/ui/button"
import { ProcessSpine } from "@/components/ui/process-spine"
import { PromptComposer } from "@/components/ui/prompt-composer"
import { PageHeader, PageShell } from "@/components/ui/page-shell"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import { selectedPastRunAtom } from "@/features/execution"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import { resolveTemplateWorkflow } from "@/lib/web-search-backend"
import {
  applyWorkflowDetailBudget,
  clampDetailBudget,
} from "@/lib/workflow-detail-budget"
import {
  EMPTY_WORKFLOW_CREATE_SCAFFOLD,
  hasWorkflowCreatePromptContent,
} from "@/lib/workflow-create-prompt"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { projectFolderName } from "@/components/sidebar/projectSidebarUtils"
import { toast } from "sonner"
import { toastError, toastErrorFromCatch } from "@/lib/toast-error"
import { errorToUserMessage } from "@/lib/error-message"
import { ArrowUp, Check, Loader2 } from "lucide-react"
import type {
  CreateEntryRouteClarification,
  CreateEntryHelpModeHint,
  InputAttachment,
  RunResult,
  WorkflowTemplate,
} from "@shared/types"
import { cn } from "@/lib/cn"
import { matchesPrimaryShortcut } from "@/lib/keyboard-shortcuts"
import {
  buildGeneratedWorkflowEntryState,
  buildTemplateRunContext,
  getRequestedResultFromEntryState,
  hasSavedWorkContinuationContext,
  mergeInputAttachments,
  type WorkflowEntryState,
} from "@/lib/workflow-entry"
import {
  countResultModeConfigFields,
  normalizeResultModeConfig,
} from "@/lib/result-mode-config"
import { getResultMode } from "@/lib/result-modes"
import { sanitizeDirectCreateFallbackTemplateId } from "@shared/create-entry-routing"
import { isGuidedDomain, isIntentEnabledDomain } from "@shared/domains"
import {
  buildCreateRoutingPreview,
  type CreateRoutingPreview,
} from "@/lib/create-routing-preview"
import { getWorkflowTemplateDisplayName } from "@/lib/template-display"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import { prepareTemplateStageLaunch } from "@/lib/factory-launch"
import { buildTemplateStartState } from "@/lib/template-start"
import { prepareRoutedTemplateLaunch } from "@/lib/routed-template-launch"
import { shouldAutoRunCreateStart } from "@/lib/workflow-create-start-policy"
import {
  RouteClarificationDialog,
  WorkflowCreatePendingTemplateDialog,
  type RouteClarificationSelection,
} from "@/components/create/WorkflowCreateDialogs"
import { WorkflowCreateProjectPicker } from "@/components/create/WorkflowCreateProjectPicker"
import { WorkflowCreateDetailsPanel } from "@/components/create/WorkflowCreateDetailsPanel"
import { WorkflowCreateContinuationCard } from "@/components/create/WorkflowCreateContinuationCard"
import { WorkflowCreateSuggestionsSection } from "@/components/create/WorkflowCreateSuggestionsSection"
import { WorkflowCreateComposerFooter } from "@/components/create/WorkflowCreateComposerFooter"
import { useWorkflowCreateContinuation } from "@/components/create/useWorkflowCreateContinuation"
import {
  resolvePendingTemplateIntentLabel,
  useWorkflowCreateDerivedState,
} from "@/components/create/useWorkflowCreateDerivedState"
import { useWorkflowCreateResources } from "@/components/create/useWorkflowCreateResources"
import {
  taskSelectionKey,
  toContinuationRun,
} from "@/components/notifications/task-ui"
import type { WorkflowCreateContinuationCandidate } from "@/lib/workflow-create-continuation"

const POPULAR_TEMPLATE_LIMIT = 12
const CREATE_SURFACE_MAX_WIDTH = "max-w-5xl"
const DEVELOPMENT_ROUTING_MIN_VISIBLE_MS = 550
type WorkflowCreateRoutingPhase = "inspecting" | "opening"

function waitForMs(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

function WorkflowCreateRoutingState({
  targetProjectName,
  phase,
  routingPreview,
}: {
  targetProjectName: string | null
  phase: WorkflowCreateRoutingPhase
  routingPreview: CreateRoutingPreview | null
}) {
  const steps = [
    "Read your goal",
    targetProjectName
      ? `Inspect ${targetProjectName}`
      : "Inspect project context",
    routingPreview?.title
      ? `Open ${routingPreview.title}`
      : "Open the best starting point",
  ]
  const activeStepIndex = phase === "opening" ? 2 : 1
  const routingMeta = [
    routingPreview?.helpModeLabel,
    routingPreview?.stageLabel
      ? `First step: ${routingPreview.stageLabel}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="space-y-3 ui-fade-slide-in px-4 py-4">
      <div className="min-w-0">
        <p className="text-body-sm font-medium text-foreground">
          Choosing the best start
        </p>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Using your request and project context to pick the best starting
          point. Nothing runs until you approve.
        </p>
      </div>
      <div className="mt-4 space-y-0" aria-live="polite">
        {steps.map((step, index) => (
          <div
            key={step}
            className={cn(
              "flex items-center gap-3 py-3",
              index > 0 && "ui-section-divider",
            )}
          >
            {index < activeStepIndex ? (
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-status-success/15 text-status-success">
                <Check size={11} aria-hidden="true" />
              </span>
            ) : index === activeStepIndex ? (
              <Loader2
                size={14}
                className="animate-spin text-status-info"
                aria-hidden="true"
              />
            ) : (
              <span
                className="inline-flex h-2.5 w-2.5 rounded-full bg-muted-foreground/30"
                aria-hidden="true"
              />
            )}
            <div
              className={cn(
                "text-body-sm",
                index < activeStepIndex
                  ? "text-muted-foreground"
                  : "text-foreground",
              )}
            >
              {step}
            </div>
          </div>
        ))}
      </div>
      {phase === "opening" && routingPreview ? (
        <div className="space-y-3 ui-section-divider pt-4">
          <div className="space-y-1">
            <p className="ui-meta-text text-muted-foreground">Starting point</p>
            <p className="text-body-sm font-medium text-foreground">
              {routingPreview.title}
            </p>
            {routingMeta ? (
              <p className="text-body-sm text-muted-foreground">
                {routingMeta}
              </p>
            ) : null}
          </div>
          {routingPreview.stages.length > 0 ? (
            <ProcessSpine stages={routingPreview.stages} />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function buildTemplateCustomizationPrompt(
  template: WorkflowTemplate,
  requestedResult?: string,
): string {
  const lines = [
    `Use the existing "${getWorkflowTemplateDisplayName(template)}" flow as the base flow.`,
    template.how,
    "Adapt it to this project and update only the steps that need to change.",
  ]

  const cleanRequest = requestedResult?.trim()
  if (cleanRequest) {
    lines.push(`Requested result: ${cleanRequest}`)
  }

  return lines.join(" ")
}

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

export function WorkflowCreatePage() {
  const [projects, setProjects] = useAtom(projectsAtom)
  const [, setInputAttachments] = useAtom(inputAttachmentsAtom)
  const [, setInputValue] = useAtom(inputValueAtom)
  const [selectedResultModeId, setSelectedResultModeId] = useAtom(
    selectedResultModeIdAtom,
  )
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setWorkflow] = useAtom(currentWorkflowAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [, setViewMode] = useAtom(viewModeAtom)
  const [, setSelectedInboxTaskKey] = useAtom(selectedInboxTaskKeyAtom)
  const [, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
  const [desktopRuntime] = useAtom(desktopRuntimeAtom)
  const [detailBudget, setDetailBudget] = useAtom(globalDetailBudgetAtom)
  const [workflowDirty] = useAtom(workflowDirtyAtom)
  const [createContext, setCreateContext] = useAtom(workflowCreateContextAtom)
  const [developmentHelpModeHint, setDevelopmentHelpModeHint] =
    useState<CreateEntryHelpModeHint | null>(null)
  const [draftPrompt, setDraftPrompt] = useAtom(workflowCreateDraftPromptAtom)
  const [modeConfigs, setModeConfigs] = useAtom(workflowCreateModeConfigsAtom)
  const [promptScaffold, setPromptScaffold] = useAtom(
    workflowCreatePromptScaffoldAtom,
  )
  const [sourceArtifacts, setSourceArtifacts] = useAtom(
    workflowCreateSourceArtifactsAtom,
  )
  const [sourceAttachments, setSourceAttachments] = useAtom(
    workflowCreateSourceAttachmentsAtom,
  )
  const [, setPendingCreateEntry] = useAtom(workflowCreatePendingEntryAtom)
  const [, setPendingCreateMessage] = useAtom(workflowCreatePendingMessageAtom)
  const [, setQueuedAutoRunPath] = useAtom(workflowQueuedAutoRunPathAtom)
  const [, setWorkflowEntryState] = useAtom(workflowEntryStateAtom)
  const setWorkflowContinuationEntryStateForKey = useSetAtom(
    setWorkflowContinuationEntryStateForKeyAtom,
  )
  const setWorkflowRequestedResultForKey = useSetAtom(
    setWorkflowRequestedResultForKeyAtom,
  )
  const setWorkflowTemplateContextForKey = useSetAtom(
    setWorkflowTemplateContextForKeyAtom,
  )
  const setTemplateLibraryContext = useSetAtom(templateLibraryContextAtom)
  const [promptHelperOpen, setPromptHelperOpen] = useState(false)
  const [preferNewFlow, setPreferNewFlow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [openingProject, setOpeningProject] = useState(false)
  const [projectPickerOpen, setProjectPickerOpen] = useState(false)
  const [pendingTemplate, setPendingTemplate] =
    useState<WorkflowTemplate | null>(null)
  const [routeClarification, setRouteClarification] =
    useState<CreateEntryRouteClarification | null>(null)
  const [routingPreview, setRoutingPreview] =
    useState<CreateRoutingPreview | null>(null)
  const [templateAction, setTemplateAction] = useState<
    "create" | "customize" | null
  >(null)
  const [continuationPending, setContinuationPending] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [routingPhase, setRoutingPhase] =
    useState<WorkflowCreateRoutingPhase>("inspecting")
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const composerRef = useRef<HTMLDivElement | null>(null)
  const promptHelperRef = useRef<HTMLDivElement | null>(null)
  const promptHelperScrollRef = useRef<HTMLDivElement | null>(null)
  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()

  const targetProjectPath = createContext.projectPath
  const primaryActionShortcutLabel = `${desktopRuntime.primaryModifierLabel}↵`
  const createShortcutHint = `${primaryActionShortcutLabel} start · Enter newline`
  const {
    projectInspection,
    popularTemplates,
    availableTemplates,
    loadingTemplates,
  } = useWorkflowCreateResources({
    targetProjectPath,
    popularTemplateLimit: POPULAR_TEMPLATE_LIMIT,
  })

  useEffect(() => {
    if (
      !createContext.locked &&
      selectedProject &&
      projects.includes(selectedProject) &&
      selectedProject !== targetProjectPath
    ) {
      setCreateContext({ projectPath: selectedProject, locked: false })
      return
    }

    if (targetProjectPath && projects.includes(targetProjectPath)) return

    if (selectedProject && projects.includes(selectedProject)) {
      setCreateContext({ projectPath: selectedProject, locked: false })
      return
    }

    if (projects.length === 1) {
      setCreateContext({ projectPath: projects[0], locked: false })
      return
    }

    if (projects.length > 1) {
      if (targetProjectPath !== null || createContext.locked) {
        setCreateContext({ projectPath: null, locked: false })
      }
      return
    }

    if (targetProjectPath !== null || createContext.locked) {
      setCreateContext({ projectPath: null, locked: false })
    }
  }, [
    createContext.locked,
    projects,
    selectedProject,
    setCreateContext,
    targetProjectPath,
  ])

  useEffect(() => {
    setPreferNewFlow(false)
  }, [targetProjectPath])

  useEffect(() => {
    if (!promptHelperOpen) return

    const frame = window.requestAnimationFrame(() => {
      promptHelperRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      })
      promptHelperScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      composerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [promptHelperOpen])

  const openTemplateLibrary = () => {
    setTemplateLibraryContext({
      projectPath: targetProjectPath,
      createOnly: Boolean(targetProjectPath),
    })
    setMainView("templates")
  }
  const preSelectedResultMode = getResultMode(selectedResultModeId)
  const preSelectedModeConfig = normalizeResultModeConfig(
    selectedResultModeId,
    modeConfigs[selectedResultModeId],
  )
  const preSelectedModeConfigFieldCount = countResultModeConfigFields(
    selectedResultModeId,
    preSelectedModeConfig,
  )
  const preCanSubmitPrompt =
    hasWorkflowCreatePromptContent(draftPrompt, promptScaffold) ||
    preSelectedModeConfigFieldCount > 0
  const preRoutingActive =
    submitting && isGuidedDomain(preSelectedResultMode.id)
  const {
    loading: continuationLoading,
    primaryContinuation,
    secondaryContinuations,
    presentation: continuationPresentation,
  } = useWorkflowCreateContinuation({
    projectPath: targetProjectPath,
    templates: availableTemplates,
    templatesLoading: loadingTemplates,
    hasStartedNewRequest: preCanSubmitPrompt || preferNewFlow,
    routingInProgress: preRoutingActive,
    clarificationInProgress: routeClarification !== null,
  })
  const {
    targetProjectName,
    projectRequired,
    sourceAttachmentSummary,
    selectedResultMode,
    selectedModeConfig,
    selectedModeConfigFields,
    optionalDetailCount,
    canSubmitPrompt,
    routingActive,
    createSeedMessage,
    routeOptions,
    suggestedTemplatesTitle,
    pendingQuickStart,
    pendingPrimaryActionLabel,
    pendingTemplateExecutionSummary,
    showComposer,
    figureOwner,
    showDetailsPanel,
    showRoutingState,
    showStartError,
    showContinuationCard,
    showSuggestions,
    visibleSuggestions,
  } = useWorkflowCreateDerivedState({
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
    projectKind: projectInspection?.projectKind,
    continuationPresentation,
    preferNewFlow,
    submitError,
    promptHelperOpen,
  })
  const jobRouteMetaByTemplateId = useMemo(() => {
    if (routeClarification?.kind !== "job_route") return {}

    return Object.fromEntries(
      routeClarification.options.map((option) => {
        const preview = buildCreateRoutingPreview({
          templateId: option.templateId,
          templates: availableTemplates,
          routeOptions,
        })
        return [
          option.templateId,
          {
            helpModeLabel: preview?.helpModeLabel ?? null,
            stageLabel: preview?.stageLabel
              ? `First step: ${preview.stageLabel}`
              : null,
          },
        ]
      }),
    )
  }, [availableTemplates, routeClarification, routeOptions])
  const pendingTemplateRoutingPreview = useMemo(() => {
    if (!pendingTemplate) return null

    const previewCatalog = availableTemplates.some(
      (template) => template.id === pendingTemplate.id,
    )
      ? availableTemplates
      : [...availableTemplates, pendingTemplate]

    return buildCreateRoutingPreview({
      templateId: pendingTemplate.id,
      templates: previewCatalog,
      routeOptions,
    })
  }, [availableTemplates, pendingTemplate, routeOptions])

  const resetCreateSurfaceState = () => {
    setDraftPrompt("")
    setPromptScaffold(EMPTY_WORKFLOW_CREATE_SCAFFOLD)
    setPromptHelperOpen(false)
    setPreferNewFlow(false)
    setRouteClarification(null)
    setRoutingPreview(null)
    setSubmitError(null)
    setSourceArtifacts([])
    setSourceAttachments([])
    setRoutingPhase("inspecting")
  }

  const openWorkflowFile = async (
    filePath: string,
    projectPath: string,
    options?: {
      pendingMessage?: string
      pendingEntryRequest?: string
      entryState?: WorkflowEntryState
      templateContext?: ReturnType<typeof buildTemplateRunContext>
      initialInputValue?: string
      initialAttachments?: InputAttachment[]
      autoRunIfAllowed?: boolean
    },
  ) => {
    const loadedWorkflow = await window.api.loadWorkflow(filePath)
    const refreshedWorkflows =
      await window.api.listProjectWorkflows(projectPath)
    const nextEntryState =
      options?.entryState ??
      (options?.pendingEntryRequest
        ? buildGeneratedWorkflowEntryState({
            workflow: loadedWorkflow,
            workflowPath: filePath,
            request: options.pendingEntryRequest,
            source: "agent_create",
          })
        : null)

    setSelectedProject(projectPath)
    setWorkflows(refreshedWorkflows)
    setSelectedWorkflowPath(filePath)
    setWorkflow(loadedWorkflow)
    setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
    setSelectedPastRun(null)
    setSelectedInboxTaskKey(null)
    setViewMode(
      options?.pendingMessage || options?.entryState ? "chat" : "list",
    )
    if (typeof options?.initialInputValue === "string") {
      setInputValue(options.initialInputValue)
    }
    if (Array.isArray(options?.initialAttachments)) {
      setInputAttachments(options.initialAttachments)
    }
    setPendingCreateMessage((prev) =>
      options?.pendingMessage
        ? { ...prev, [filePath]: options.pendingMessage }
        : prev,
    )
    setPendingCreateEntry((prev) =>
      options?.pendingEntryRequest
        ? { ...prev, [filePath]: options.pendingEntryRequest }
        : prev,
    )
    setWorkflowEntryState(nextEntryState)
    setWorkflowContinuationEntryStateForKey({
      key: toWorkflowExecutionKey(filePath),
      entryState:
        nextEntryState &&
        hasSavedWorkContinuationContext(options?.templateContext)
          ? nextEntryState
          : null,
    })
    setWorkflowRequestedResultForKey({
      key: toWorkflowExecutionKey(filePath),
      value: getRequestedResultFromEntryState(nextEntryState) || null,
    })
    setWorkflowTemplateContextForKey({
      key: toWorkflowExecutionKey(filePath),
      context: options?.templateContext ?? null,
    })
    setQueuedAutoRunPath(options?.autoRunIfAllowed ? filePath : null)
    resetCreateSurfaceState()
    setMainView("thread")
    return loadedWorkflow
  }

  const openExistingWorkflowFile = async (
    filePath: string,
    projectPath: string | null,
    options?: {
      pastRun?: RunResult | null
    },
  ) => {
    const loadedWorkflow = await window.api.loadWorkflow(filePath)
    if (projectPath) {
      const refreshedWorkflows =
        await window.api.listProjectWorkflows(projectPath)
      setSelectedProject(projectPath)
      setWorkflows(refreshedWorkflows)
    }
    setSelectedWorkflowPath(filePath)
    setWorkflow(loadedWorkflow)
    setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
    setWorkflowEntryState(null)
    setQueuedAutoRunPath(null)
    setSelectedPastRun(options?.pastRun ?? null)
    setViewMode("chat")
    resetCreateSurfaceState()
    setMainView("thread")
    return loadedWorkflow
  }

  const handleContinueSavedWork = async (
    continuation: WorkflowCreateContinuationCandidate,
  ) => {
    if (continuationPending) return
    if (!(await confirmDiscard("continue saved work", workflowDirty))) {
      return
    }

    setContinuationPending(true)
    void window.api.trackUiEvent("flow_resumed").catch(() => undefined)
    try {
      if (continuation.action.kind === "open_blocked_work") {
        const task = continuation.action.task
        const projectPath = task.projectPath || targetProjectPath
        setSelectedInboxTaskKey(taskSelectionKey(task))

        if (task.workflowPath) {
          await openExistingWorkflowFile(task.workflowPath, projectPath, {
            pastRun: toContinuationRun(task),
          })
          return
        }

        if (projectPath) {
          setSelectedProject(projectPath)
        }
        resetCreateSurfaceState()
        setMainView("inbox")
        return
      }

      if (projectRequired.projectRequired) {
        toastError(
          `${projectRequired.blockerStatement} ${projectRequired.actionInstruction}`,
        )
        return
      }
      const ensuredProjectPath = targetProjectPath
      if (!ensuredProjectPath) {
        toastError("Choose a project before continuing saved work.")
        return
      }

      const launch = await prepareTemplateStageLaunch({
        projectPath: ensuredProjectPath,
        template: continuation.action.template,
        webSearchBackend,
        artifacts: continuation.action.artifacts,
        factory: continuation.action.factoryId
          ? {
              id: continuation.action.factoryId,
              label: continuation.action.factoryLabel || "Lab",
            }
          : null,
        caseOverride: {
          caseId: continuation.action.caseId,
          caseLabel: continuation.action.caseLabel || continuation.title,
        },
      })

      await openWorkflowFile(launch.filePath, ensuredProjectPath, {
        entryState: launch.entryState,
        templateContext: launch.templateContext,
        initialInputValue: launch.inputSeed,
        initialAttachments: launch.artifactAttachments,
      })
    } catch (error) {
      toastErrorFromCatch("Could not continue saved work", error)
    } finally {
      setContinuationPending(false)
    }
  }

  const handleOpenProject = async () => {
    if (openingProject) return
    setOpeningProject(true)
    try {
      const projectPath = await window.api.addProject()
      if (!projectPath) return
      setProjects((prev) =>
        prev.includes(projectPath) ? prev : [...prev, projectPath],
      )
      setSelectedProject(projectPath)
      setCreateContext({ projectPath, locked: false })
    } catch (error) {
      toastErrorFromCatch("Could not add project", error)
    } finally {
      setOpeningProject(false)
    }
  }

  const handleTemplateSelect = (template: WorkflowTemplate) => {
    setPendingTemplate(template)
    setSubmitError(null)
  }

  const handleModeConfigChange = (fieldId: string, value: string) => {
    setModeConfigs((previous) => ({
      ...previous,
      [selectedResultModeId]: {
        ...(previous[selectedResultModeId] || {}),
        [fieldId]: value,
      },
    }))
  }

  const clearModeConfig = () => {
    setModeConfigs((previous) => ({
      ...previous,
      [selectedResultModeId]: normalizeResultModeConfig(selectedResultModeId),
    }))
  }

  const clearOptionalDetails = () => {
    clearModeConfig()
    setPromptScaffold(EMPTY_WORKFLOW_CREATE_SCAFFOLD)
  }

  const handleCreateFromTemplate = async (template: WorkflowTemplate) => {
    if (!targetProjectPath || templateAction) return
    if (
      !(await confirmDiscard("create a flow from the library", workflowDirty))
    ) {
      return
    }

    setTemplateAction("create")
    try {
      const resolved = await resolveHubTemplate(template)
      const templateForWorkflowUse = normalizeTemplateForWorkflowUse(resolved)
      const nextWorkflow = resolveTemplateWorkflow(
        templateForWorkflowUse,
        webSearchBackend,
        {
          detailBudget,
          templateId: templateForWorkflowUse.id,
        },
      )
      const filePath = await window.api.createWorkflow(
        targetProjectPath,
        templateForWorkflowUse.name,
        nextWorkflow,
      )
      const templateStartState = buildTemplateStartState({
        template: {
          ...templateForWorkflowUse,
          workflow: nextWorkflow,
        },
        workflowPath: filePath,
        projectPath: targetProjectPath,
        requestedResult: createSeedMessage,
        sourceArtifacts,
      })
      await window.api
        .recordProjectTemplateUsage(targetProjectPath, template.id)
        .catch(() => undefined)
      const loadedWorkflow = await openWorkflowFile(
        filePath,
        targetProjectPath,
        {
          entryState: templateStartState.entryState,
          templateContext: templateStartState.templateContext,
          initialInputValue: templateStartState.initialInputValue,
          initialAttachments: mergeInputAttachments(
            sourceAttachments,
            templateStartState.initialAttachments,
          ),
        },
      )
      setPendingTemplate(null)
      toast.success(
        `"${loadedWorkflow.name || templateForWorkflowUse.name}" is ready in ${targetProjectName || "your project"}`,
      )
    } catch (error) {
      toastErrorFromCatch("Could not create flow", error)
    } finally {
      setTemplateAction(null)
    }
  }

  const handleCustomizeTemplate = async (template: WorkflowTemplate) => {
    if (!targetProjectPath || templateAction) return
    if (
      !(await confirmDiscard(
        "customize a library flow with agent",
        workflowDirty,
      ))
    ) {
      return
    }

    setTemplateAction("customize")
    try {
      const resolved = await resolveHubTemplate(template)
      const templateForWorkflowUse = normalizeTemplateForWorkflowUse(resolved)
      const nextWorkflow = resolveTemplateWorkflow(
        templateForWorkflowUse,
        webSearchBackend,
        {
          detailBudget,
          templateId: templateForWorkflowUse.id,
        },
      )
      const filePath = await window.api.createWorkflow(
        targetProjectPath,
        templateForWorkflowUse.name,
        nextWorkflow,
      )
      const templateStartState = buildTemplateStartState({
        template: {
          ...templateForWorkflowUse,
          workflow: nextWorkflow,
        },
        workflowPath: filePath,
        projectPath: targetProjectPath,
        requestedResult: createSeedMessage,
        source: "template_customize",
        sourceArtifacts,
      })
      await window.api
        .recordProjectTemplateUsage(targetProjectPath, template.id)
        .catch(() => undefined)
      await openWorkflowFile(filePath, targetProjectPath, {
        pendingMessage: buildTemplateCustomizationPrompt(
          templateForWorkflowUse,
          createSeedMessage,
        ),
        entryState: templateStartState.entryState,
        templateContext: templateStartState.templateContext,
        initialInputValue: templateStartState.initialInputValue,
        initialAttachments: mergeInputAttachments(
          sourceAttachments,
          templateStartState.initialAttachments,
        ),
      })
      setPendingTemplate(null)
      toast.success(
        `"${templateForWorkflowUse.name}" is ready for agent refinement`,
      )
    } catch (error) {
      toastErrorFromCatch("Could not customize flow", error)
    } finally {
      setTemplateAction(null)
    }
  }

  const handleSend = async ({
    helpModeOverride = null,
    skipDiscardConfirm = false,
    templateConstraintId = null,
    useCurrentHelpMode = true,
  }: {
    helpModeOverride?: CreateEntryHelpModeHint | null
    skipDiscardConfirm?: boolean
    templateConstraintId?: string | null
    useCurrentHelpMode?: boolean
  } = {}) => {
    const message = createSeedMessage
    if (!message || submitting) return
    if (projectRequired.projectRequired) {
      const errorMessage = `${projectRequired.blockerStatement} ${projectRequired.actionInstruction}`
      setSubmitError(errorMessage)
      toastError(errorMessage)
      return
    }
    const ensuredProjectPath = targetProjectPath
    if (!ensuredProjectPath) {
      const errorMessage = "Choose a project before starting a new flow."
      setSubmitError(errorMessage)
      toastError(errorMessage)
      return
    }

    if (
      !skipDiscardConfirm &&
      !(await confirmDiscard("start a new flow", workflowDirty))
    ) {
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    setRouteClarification(null)
    setRoutingPreview(null)
    void window.api.trackUiEvent("point_b_entered").catch(() => undefined)
    const isGuidedRouting = isGuidedDomain(selectedResultMode.id)
    if (isGuidedRouting) {
      setRoutingPhase("inspecting")
    }
    const submitStartedAt = Date.now()
    let minimumRoutingVisibilityPromise: Promise<void> | null = null
    const ensureMinimumRoutingVisibility = () => {
      if (!isGuidedRouting) return Promise.resolve()
      if (!minimumRoutingVisibilityPromise) {
        const elapsed = Date.now() - submitStartedAt
        minimumRoutingVisibilityPromise =
          elapsed >= DEVELOPMENT_ROUTING_MIN_VISIBLE_MS
            ? Promise.resolve()
            : waitForMs(DEVELOPMENT_ROUTING_MIN_VISIBLE_MS - elapsed)
      }
      return minimumRoutingVisibilityPromise
    }

    try {
      const intentSelectionEnabled = isIntentEnabledDomain(
        selectedResultMode.id,
      )
      const effectiveHelpModeHint = isGuidedRouting
        ? (helpModeOverride ??
          (intentSelectionEnabled && useCurrentHelpMode
            ? developmentHelpModeHint
            : null) ??
          undefined)
        : undefined
      const routeCreateEntry = isGuidedRouting
        ? (
            window.api as typeof window.api & {
              routeCreateEntry?: typeof window.api.routeCreateEntry
            }
          ).routeCreateEntry
        : null
      if (isGuidedRouting && !routeCreateEntry) {
        throw new Error("The AI router is not available in this build.")
      }
      const routeResult = routeCreateEntry
        ? await routeCreateEntry({
            modeId: selectedResultMode.id,
            projectPath: ensuredProjectPath,
            fallbackTemplateId: sanitizeDirectCreateFallbackTemplateId(
              selectedResultMode.id,
              selectedResultMode.startTemplateId,
            ),
            draftPrompt,
            requestedResult: message,
            helpModeHint: effectiveHelpModeHint,
            templateConstraintId: templateConstraintId || undefined,
            modeConfig: selectedModeConfig,
            promptScaffold,
            allowedOptions: routeOptions,
            webSearchBackend,
          })
        : null
      await ensureMinimumRoutingVisibility()
      if (routeResult?.clarification) {
        setRouteClarification(routeResult.clarification)
        return
      }
      if (
        routeResult?.domainMode &&
        routeResult.domainMode !== selectedResultMode.id
      ) {
        setSelectedResultModeId(routeResult.domainMode)
      }
      if (isGuidedRouting) {
        setRoutingPhase("opening")
      }
      const catalog =
        availableTemplates.length > 0
          ? availableTemplates
          : await window.api.listTemplates()
      const startTemplate =
        (routeResult
          ? catalog.find(
              (template) => template.id === routeResult.recommendedTemplateId,
            )
          : null) ||
        catalog.find(
          (template) => template.id === selectedResultMode.startTemplateId,
        ) ||
        null

      if (!startTemplate && routeResult?.recommendedTemplateId) {
        toast.warning("This starting point is no longer available.", {
          description:
            "The composer is ready for you to describe what you want to build.",
        })
      }

      if (startTemplate) {
        setRoutingPreview(
          buildCreateRoutingPreview({
            templateId: startTemplate.id,
            templates: catalog,
            routeOptions,
          }),
        )
        if (routeResult) {
          const launch = await prepareRoutedTemplateLaunch({
            projectPath: ensuredProjectPath,
            template: startTemplate,
            webSearchBackend,
            routeResult,
            requestedResult: message,
            sourceArtifacts,
            detailBudget,
          })
          await openWorkflowFile(launch.filePath, ensuredProjectPath, {
            entryState: launch.templateStartState.entryState,
            templateContext: launch.templateStartState.templateContext,
            initialInputValue: launch.templateStartState.initialInputValue,
            initialAttachments: mergeInputAttachments(
              sourceAttachments,
              launch.templateStartState.initialAttachments,
            ),
            autoRunIfAllowed: shouldAutoRunCreateStart(
              routeResult,
              startTemplate,
            ),
          })
          return
        }

        const resolvedStartTemplate = await resolveHubTemplate(startTemplate)
        const templateForWorkflowUse = normalizeTemplateForWorkflowUse(
          resolvedStartTemplate,
        )
        const nextWorkflow = resolveTemplateWorkflow(
          templateForWorkflowUse,
          webSearchBackend,
          {
            detailBudget,
            templateId: templateForWorkflowUse.id,
          },
        )
        const filePath = await window.api.createWorkflow(
          ensuredProjectPath,
          templateForWorkflowUse.name,
          nextWorkflow,
        )
        const template = {
          ...templateForWorkflowUse,
          workflow: nextWorkflow,
        }
        const templateStartState = buildTemplateStartState({
          template,
          workflowPath: filePath,
          projectPath: ensuredProjectPath,
          requestedResult: message,
          sourceArtifacts,
        })

        await window.api
          .recordProjectTemplateUsage(ensuredProjectPath, startTemplate.id)
          .catch(() => undefined)
        await openWorkflowFile(filePath, ensuredProjectPath, {
          entryState: templateStartState.entryState,
          templateContext: templateStartState.templateContext,
          initialInputValue: templateStartState.initialInputValue,
          initialAttachments: mergeInputAttachments(
            sourceAttachments,
            templateStartState.initialAttachments,
          ),
          autoRunIfAllowed: shouldAutoRunCreateStart(routeResult, template),
        })
        return
      }

      const draftWorkflow = applyWorkflowDetailBudget(
        createEmptyWorkflow(),
        detailBudget,
      )
      if (isGuidedRouting) {
        setRoutingPhase("opening")
      }
      const filePath = await window.api.createWorkflow(
        ensuredProjectPath,
        "new-flow",
        draftWorkflow,
      )
      await openWorkflowFile(filePath, ensuredProjectPath, {
        pendingMessage: message,
        pendingEntryRequest: message,
        initialInputValue: message,
        initialAttachments: sourceAttachments,
      })
    } catch (error) {
      await ensureMinimumRoutingVisibility()
      setSubmitError(
        errorToUserMessage(error).replace(
          /^Error: Error invoking remote method '[^']+': Error: /,
          "",
        ),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      matchesPrimaryShortcut(event, {
        key: "Enter",
        primaryModifierKey: desktopRuntime.primaryModifierKey,
      })
    ) {
      event.preventDefault()
      void handleSend()
    }
  }

  const handleClarificationSelect = (
    selection: RouteClarificationSelection,
  ) => {
    setRouteClarification(null)
    if (selection.kind === "job_route") {
      void handleSend({
        skipDiscardConfirm: true,
        templateConstraintId: selection.templateId,
        useCurrentHelpMode: false,
      })
      return
    }
    setDevelopmentHelpModeHint(selection.helpMode)
    void handleSend({
      helpModeOverride: selection.helpMode,
      skipDiscardConfirm: true,
    })
  }

  return (
    <PageShell className="flex min-h-full flex-col space-y-6">
      <PageHeader
        title="Start a flow"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <WorkflowCreateProjectPicker
              open={projectPickerOpen}
              onOpenChange={setProjectPickerOpen}
              targetProjectName={targetProjectName}
              projects={projects}
              targetProjectPath={targetProjectPath}
              openingProject={openingProject}
              projectNameForPath={projectFolderName}
              onSelectProject={(projectPath) =>
                setCreateContext({ projectPath, locked: false })
              }
              onAddProject={() => {
                void handleOpenProject()
              }}
            />
          </div>
        }
      />

      <div
        className={cn(
          "mx-auto flex w-full flex-1 flex-col gap-5 pb-8",
          CREATE_SURFACE_MAX_WIDTH,
        )}
      >
        <div ref={composerRef} className="mx-auto w-full space-y-4">
          {figureOwner === "no_project" ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-hairline surface-panel px-4 py-4 ui-fade-slide-in">
                <p className="text-body-sm font-medium text-foreground">
                  Choose project
                </p>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  {projectRequired.blockerStatement}
                </p>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  {projectRequired.actionInstruction}
                </p>
                <div className="mt-4">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleOpenProject()}
                    disabled={openingProject}
                  >
                    {openingProject ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : null}
                    {projectRequired.primaryActionLabel}
                  </Button>
                </div>
              </div>
              <p className="px-1 text-body-sm text-muted-foreground">
                Start something new once a project is selected.
              </p>
            </div>
          ) : null}

          {showComposer ? (
            <>
              <PromptComposer
                ref={textareaRef}
                aria-label="Flow request"
                value={draftPrompt}
                onFocus={() => {
                  if (figureOwner === "continue_first") {
                    setPreferNewFlow(true)
                    setRouteClarification(null)
                  }
                }}
                onChange={(event) => {
                  setPreferNewFlow(true)
                  setRouteClarification(null)
                  setDraftPrompt(event.target.value)
                }}
                onKeyDown={handleTextareaKeyDown}
                placeholder={selectedResultMode.composerPlaceholder}
                rows={1}
                maxHeight={220}
                shellClassName="rounded-2xl"
                textareaClassName="min-h-28 text-[1.02rem] leading-7"
                header={
                  sourceAttachmentSummary ? (
                    <div className="ui-fade-slide-in">
                      <div className="ui-meta-label text-muted-foreground">
                        Using result
                      </div>
                      <div className="mt-1 text-body-sm text-foreground">
                        {sourceAttachmentSummary}
                      </div>
                    </div>
                  ) : null
                }
                action={
                  <Button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={!canSubmitPrompt || submitting}
                    variant="send"
                    size="icon"
                    className="h-11 w-11 rounded-full"
                    aria-label={
                      selectedResultMode.startActionLabel || "Start flow"
                    }
                    title={`${selectedResultMode.startActionLabel || "Start flow"} (${primaryActionShortcutLabel}) · Enter for newline`}
                  >
                    {submitting ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ArrowUp size={16} />
                    )}
                  </Button>
                }
                footer={
                  <>
                    <WorkflowCreateComposerFooter
                      selectedResultMode={selectedResultMode}
                      developmentHelpModeHint={developmentHelpModeHint}
                      showSupportControls={showComposer}
                      shortcutHint={createShortcutHint}
                      onSelectMode={(modeId) => {
                        setPreferNewFlow(true)
                        setSelectedResultModeId(modeId)
                      }}
                      onToggleHelpMode={(helpMode) => {
                        setPreferNewFlow(true)
                        setRouteClarification(null)
                        setDevelopmentHelpModeHint(helpMode)
                      }}
                      promptHelperOpen={promptHelperOpen}
                      onTogglePromptHelper={() => {
                        setPreferNewFlow(true)
                        setPromptHelperOpen((prev) => !prev)
                      }}
                      optionalDetailCount={optionalDetailCount}
                      detailBudget={detailBudget}
                      onDetailBudgetChange={(value) => {
                        setPreferNewFlow(true)
                        setDetailBudget(clampDetailBudget(value))
                      }}
                    />
                    <WorkflowCreateDetailsPanel
                      open={showDetailsPanel}
                      helperRef={promptHelperRef}
                      scrollRef={promptHelperScrollRef}
                      optionalDetailCount={optionalDetailCount}
                      modeConfigFields={selectedModeConfigFields}
                      modeConfig={selectedModeConfig}
                      onModeConfigChange={handleModeConfigChange}
                      promptScaffold={promptScaffold}
                      scaffoldPlaceholders={
                        selectedResultMode.scaffoldPlaceholders
                      }
                      onPromptScaffoldChange={setPromptScaffold}
                      onClearOptionalDetails={clearOptionalDetails}
                    />
                  </>
                }
              />
            </>
          ) : null}

          {showRoutingState ? (
            <WorkflowCreateRoutingState
              targetProjectName={targetProjectName}
              phase={routingPhase}
              routingPreview={routingPreview}
            />
          ) : null}

          {showStartError ? (
            <div className="ui-alert-danger ui-fade-slide-in">
              <p className="text-body-sm font-medium text-status-danger">
                Could not start this flow
              </p>
              <p className="mt-1 text-body-sm text-status-danger/90">
                {submitError}
              </p>
              <div className="mt-4">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleSend()}
                >
                  Try again
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {showContinuationCard ? (
          <WorkflowCreateContinuationCard
            continuation={primaryContinuation}
            secondaryContinuations={secondaryContinuations}
            loading={continuationLoading}
            pending={continuationPending}
            onContinue={(continuation) => {
              void handleContinueSavedWork(continuation)
            }}
          />
        ) : null}

        {showSuggestions ? (
          <WorkflowCreateSuggestionsSection
            loading={loadingTemplates}
            title={suggestedTemplatesTitle}
            suggestions={visibleSuggestions}
            emptyPrompt={`Describe what you want to accomplish above, then press ${primaryActionShortcutLabel}.`}
            onBrowseLibrary={openTemplateLibrary}
            onSelectTemplate={handleTemplateSelect}
          />
        ) : null}
      </div>

      {unsavedChangesDialog}
      <RouteClarificationDialog
        clarification={routeClarification}
        jobRouteMetaByTemplateId={jobRouteMetaByTemplateId}
        onClose={() => setRouteClarification(null)}
        onSelect={handleClarificationSelect}
      />
      <WorkflowCreatePendingTemplateDialog
        pendingTemplate={pendingTemplate}
        pendingQuickStartLabel={pendingQuickStart?.label || null}
        targetProjectPath={targetProjectPath}
        targetProjectName={targetProjectName}
        pendingTemplateIntentLabel={resolvePendingTemplateIntentLabel({
          routingHelpModeLabel: pendingTemplateRoutingPreview?.helpModeLabel,
          quickStartIntentLabel: pendingQuickStart?.intentLabel,
        })}
        pendingTemplateStartStageLabel={
          pendingTemplateRoutingPreview?.stageLabel || null
        }
        pendingTemplateExecutionSummary={pendingTemplateExecutionSummary}
        pendingTemplateProcessStages={
          pendingTemplateRoutingPreview?.stages || null
        }
        openingProject={openingProject}
        templateAction={templateAction}
        pendingPrimaryActionLabel={pendingPrimaryActionLabel}
        onClose={() => setPendingTemplate(null)}
        onOpenProject={() => void handleOpenProject()}
        onCustomize={(template) => {
          void handleCustomizeTemplate(template)
        }}
        onCreate={(template) => {
          void handleCreateFromTemplate(template)
        }}
      />
    </PageShell>
  )
}
