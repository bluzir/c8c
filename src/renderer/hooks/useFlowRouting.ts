import { useState, useCallback, useRef } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  currentWorkflowAtom,
  globalDetailBudgetAtom,
  inputAttachmentsAtom,
  inputValueAtom,
  mainViewAtom,
  selectedProjectAtom,
  selectedResultModeIdAtom,
  selectedWorkflowPathAtom,
  viewModeAtom,
  webSearchBackendAtom,
  workflowCreateContextAtom,
  workflowCreateDraftPromptAtom,
  workflowCreateModeConfigsAtom,
  workflowCreatePendingEntryAtom,
  workflowCreatePendingMessageAtom,
  workflowCreatePromptScaffoldAtom,
  workflowCreateSourceArtifactsAtom,
  workflowCreateSourceAttachmentsAtom,
  workflowEntryStateAtom,
  workflowQueuedAutoRunPathAtom,
  workflowSavedSnapshotAtom,
  workflowsAtom,
  selectedInboxTaskKeyAtom,
  setWorkflowContinuationEntryStateForKeyAtom,
  setWorkflowRequestedResultForKeyAtom,
  setWorkflowTemplateContextForKeyAtom,
  chatRoutingProgressAtom,
} from "@/lib/store"
import { selectedPastRunAtom } from "@/features/execution"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import { resolveTemplateWorkflow } from "@/lib/web-search-backend"
import { applyWorkflowDetailBudget } from "@/lib/workflow-detail-budget"
import { EMPTY_WORKFLOW_CREATE_SCAFFOLD } from "@/lib/workflow-create-prompt"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { toast } from "sonner"
import { toastError } from "@/lib/toast-error"
import { errorToUserMessage } from "@/lib/error-message"
import type {
  CreateEntryHelpModeHint,
  CreateEntryRouteClarification,
  InputAttachment,
  WorkflowTemplate,
} from "@shared/types"
import {
  buildGeneratedWorkflowEntryState,
  buildTemplateRunContext,
  getRequestedResultFromEntryState,
  hasSavedWorkContinuationContext,
  mergeInputAttachments,
  type WorkflowEntryState,
} from "@/lib/workflow-entry"
import { normalizeResultModeConfig } from "@/lib/result-mode-config"
import { buildResultModeSeedInput } from "@/lib/result-mode-config"
import {
  getResultMode,
  getResultModeRouteDestinations,
} from "@/lib/result-modes"
import { sanitizeDirectCreateFallbackTemplateId } from "@shared/create-entry-routing"
import { isGuidedDomain, isIntentEnabledDomain } from "@shared/domains"
import {
  buildCreateRoutingPreview,
  type CreateRoutingPreview,
} from "@/lib/create-routing-preview"
import { getWorkflowTemplateDisplayName } from "@/lib/template-display"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import { buildTemplateStartState } from "@/lib/template-start"
import { prepareRoutedTemplateLaunch } from "@/lib/routed-template-launch"
import { shouldAutoRunCreateStart } from "@/lib/workflow-create-start-policy"
import type { RouteClarificationSelection } from "@/components/create/WorkflowCreateDialogs"
import { filterDirectCreateEntryOptions } from "@shared/create-entry-routing"

export type FlowRoutingPhase = "inspecting" | "opening"

const ROUTING_MIN_VISIBLE_MS = 550

function waitForMs(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

function normalizeTemplateForWorkflowUse(
  template: WorkflowTemplate,
): WorkflowTemplate {
  const name = getWorkflowTemplateDisplayName(template)
  if (name === template.name) return template
  return { ...template, name }
}

async function resolveHubTemplate(
  template: WorkflowTemplate,
): Promise<WorkflowTemplate> {
  if (template.source !== "hub" || template.workflow.nodes.length > 0)
    return template
  const full = await window.api.fetchHubTemplate(template.id)
  return { ...template, ...full, source: "hub" }
}

export interface FlowRoutingState {
  submitting: boolean
  routingPhase: FlowRoutingPhase
  routingPreview: CreateRoutingPreview | null
  routeClarification: CreateEntryRouteClarification | null
  submitError: string | null
}

export interface UseFlowRoutingReturn extends FlowRoutingState {
  startRouting: (
    message: string,
    options?: {
      helpModeOverride?: CreateEntryHelpModeHint | null
      templateConstraintId?: string | null
      useCurrentHelpMode?: boolean
    },
  ) => Promise<void>
  selectClarification: (selection: RouteClarificationSelection) => void
  resetRoutingState: () => void
}

export function useFlowRouting(): UseFlowRoutingReturn {
  const [submitting, setSubmitting] = useState(false)
  const [routingPhase, setRoutingPhase] =
    useState<FlowRoutingPhase>("inspecting")
  const [routingPreview, setRoutingPreview] =
    useState<CreateRoutingPreview | null>(null)
  const [routeClarification, setRouteClarification] =
    useState<CreateEntryRouteClarification | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Atom reads
  const selectedResultModeId = useAtomValue(selectedResultModeIdAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const webSearchBackend = useAtomValue(webSearchBackendAtom)
  const detailBudget = useAtomValue(globalDetailBudgetAtom)
  const createContext = useAtomValue(workflowCreateContextAtom)
  const draftPrompt = useAtomValue(workflowCreateDraftPromptAtom)
  const modeConfigs = useAtomValue(workflowCreateModeConfigsAtom)
  const promptScaffold = useAtomValue(workflowCreatePromptScaffoldAtom)
  const sourceArtifacts = useAtomValue(workflowCreateSourceArtifactsAtom)
  const sourceAttachments = useAtomValue(workflowCreateSourceAttachmentsAtom)

  // Atom writes
  const setSelectedProject = useSetAtom(selectedProjectAtom)
  const setSelectedResultModeId = useSetAtom(selectedResultModeIdAtom)
  const setWorkflows = useSetAtom(workflowsAtom)
  const setSelectedWorkflowPath = useSetAtom(selectedWorkflowPathAtom)
  const setWorkflow = useSetAtom(currentWorkflowAtom)
  const setWorkflowSavedSnapshot = useSetAtom(workflowSavedSnapshotAtom)
  const setMainView = useSetAtom(mainViewAtom)
  const setViewMode = useSetAtom(viewModeAtom)
  const setInputValue = useSetAtom(inputValueAtom)
  const setInputAttachments = useSetAtom(inputAttachmentsAtom)
  const setSelectedInboxTaskKey = useSetAtom(selectedInboxTaskKeyAtom)
  const setSelectedPastRun = useSetAtom(selectedPastRunAtom)
  const setPendingCreateMessage = useSetAtom(workflowCreatePendingMessageAtom)
  const setPendingCreateEntry = useSetAtom(workflowCreatePendingEntryAtom)
  const setWorkflowEntryState = useSetAtom(workflowEntryStateAtom)
  const setQueuedAutoRunPath = useSetAtom(workflowQueuedAutoRunPathAtom)
  const setWorkflowContinuationEntryStateForKey = useSetAtom(
    setWorkflowContinuationEntryStateForKeyAtom,
  )
  const setWorkflowRequestedResultForKey = useSetAtom(
    setWorkflowRequestedResultForKeyAtom,
  )
  const setChatRoutingProgress = useSetAtom(chatRoutingProgressAtom)
  const setWorkflowTemplateContextForKey = useSetAtom(
    setWorkflowTemplateContextForKeyAtom,
  )
  const setDraftPrompt = useSetAtom(workflowCreateDraftPromptAtom)
  const setPromptScaffold = useSetAtom(workflowCreatePromptScaffoldAtom)
  const setSourceArtifacts = useSetAtom(workflowCreateSourceArtifactsAtom)
  const setSourceAttachments = useSetAtom(workflowCreateSourceAttachmentsAtom)

  // Track help mode hint across clarification rounds
  const helpModeHintRef = useRef<CreateEntryHelpModeHint | null>(null)

  const resetRoutingState = useCallback(() => {
    setRouteClarification(null)
    setRoutingPreview(null)
    setSubmitError(null)
    setRoutingPhase("inspecting")
  }, [])

  const resetCreateSurfaceState = useCallback(() => {
    setDraftPrompt("")
    setPromptScaffold(EMPTY_WORKFLOW_CREATE_SCAFFOLD)
    setRouteClarification(null)
    setRoutingPreview(null)
    setSubmitError(null)
    setSourceArtifacts([])
    setSourceAttachments([])
    setRoutingPhase("inspecting")
  }, [
    setDraftPrompt,
    setPromptScaffold,
    setSourceArtifacts,
    setSourceAttachments,
  ])

  const openWorkflowFile = useCallback(
    async (
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
      setViewMode("chat")
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
    },
    [
      resetCreateSurfaceState,
      setInputAttachments,
      setInputValue,
      setMainView,
      setPendingCreateEntry,
      setPendingCreateMessage,
      setQueuedAutoRunPath,
      setSelectedInboxTaskKey,
      setSelectedPastRun,
      setSelectedProject,
      setSelectedWorkflowPath,
      setViewMode,
      setWorkflow,
      setWorkflowContinuationEntryStateForKey,
      setWorkflowEntryState,
      setWorkflowRequestedResultForKey,
      setWorkflowSavedSnapshot,
      setWorkflowTemplateContextForKey,
      setWorkflows,
    ],
  )

  const startRouting = useCallback(
    async (
      message: string,
      options?: {
        helpModeOverride?: CreateEntryHelpModeHint | null
        templateConstraintId?: string | null
        useCurrentHelpMode?: boolean
      },
    ) => {
      if (!message || submitting) return

      const targetProjectPath = createContext.projectPath
      if (!targetProjectPath) {
        const errorMessage = "Choose a project before starting a new flow."
        setSubmitError(errorMessage)
        toastError(errorMessage)
        return
      }

      setSubmitting(true)
      setSubmitError(null)
      setRouteClarification(null)
      setRoutingPreview(null)
      // Immediately switch to chat so routing progress is visible there
      setMainView("thread")
      setViewMode("chat")
      void window.api.trackUiEvent("point_b_entered").catch(() => undefined)

      const selectedResultMode = getResultMode(selectedResultModeId)
      const isGuidedRouting = isGuidedDomain(selectedResultMode.id)
      if (isGuidedRouting) {
        setRoutingPhase("inspecting")
        setChatRoutingProgress({ phase: "inspecting" })
      }
      const submitStartedAt = Date.now()
      let minimumRoutingVisibilityPromise: Promise<void> | null = null
      const ensureMinimumRoutingVisibility = () => {
        if (!isGuidedRouting) return Promise.resolve()
        if (!minimumRoutingVisibilityPromise) {
          const elapsed = Date.now() - submitStartedAt
          minimumRoutingVisibilityPromise =
            elapsed >= ROUTING_MIN_VISIBLE_MS
              ? Promise.resolve()
              : waitForMs(ROUTING_MIN_VISIBLE_MS - elapsed)
        }
        return minimumRoutingVisibilityPromise
      }

      const currentModeConfig = normalizeResultModeConfig(
        selectedResultModeId,
        modeConfigs[selectedResultModeId],
      )
      const currentPromptScaffold = promptScaffold
      const currentSourceArtifacts = sourceArtifacts
      const currentSourceAttachments = sourceAttachments

      // Compute route options from available templates
      const allTemplates = await window.api.listTemplates()
      const availableTemplateIds = new Set(allTemplates.map((t) => t.id))
      const routeDestinations = getResultModeRouteDestinations(
        selectedResultMode.id,
      )
      const selectedDestinations =
        allTemplates.length > 0
          ? routeDestinations.filter((qs) =>
              availableTemplateIds.has(qs.templateId),
            )
          : routeDestinations
      const basePrimaryOptions = selectedDestinations.map((qs) => ({
        templateId: qs.templateId,
        label: qs.label,
        intentLabel: qs.intentLabel,
        intentValues: qs.intentValues,
        recommended: qs.recommended,
      }))
      const routeOptions = filterDirectCreateEntryOptions(
        selectedResultMode.id,
        basePrimaryOptions,
      )

      try {
        const intentSelectionEnabled = isIntentEnabledDomain(
          selectedResultMode.id,
        )
        const effectiveHelpModeHint = isGuidedRouting
          ? (options?.helpModeOverride ??
            (intentSelectionEnabled && options?.useCurrentHelpMode !== false
              ? helpModeHintRef.current
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
              projectPath: targetProjectPath,
              fallbackTemplateId: sanitizeDirectCreateFallbackTemplateId(
                selectedResultMode.id,
                selectedResultMode.startTemplateId,
              ),
              draftPrompt,
              requestedResult: message,
              helpModeHint: effectiveHelpModeHint,
              templateConstraintId: options?.templateConstraintId || undefined,
              modeConfig: currentModeConfig,
              promptScaffold: currentPromptScaffold,
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
          allTemplates.length > 0
            ? allTemplates
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

        if (isGuidedRouting && startTemplate) {
          setChatRoutingProgress({
            phase: "opening",
            templateName: getWorkflowTemplateDisplayName(startTemplate),
            templateDescription: startTemplate.how || null,
          })
        }

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
              projectPath: targetProjectPath,
              template: startTemplate,
              webSearchBackend,
              routeResult,
              requestedResult: message,
              sourceArtifacts: currentSourceArtifacts,
              detailBudget,
            })
            await openWorkflowFile(launch.filePath, targetProjectPath, {
              entryState: launch.templateStartState.entryState,
              templateContext: launch.templateStartState.templateContext,
              initialInputValue: launch.templateStartState.initialInputValue,
              initialAttachments: mergeInputAttachments(
                currentSourceAttachments,
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
            targetProjectPath,
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
            projectPath: targetProjectPath,
            requestedResult: message,
            sourceArtifacts: currentSourceArtifacts,
          })

          await window.api
            .recordProjectTemplateUsage(targetProjectPath, startTemplate.id)
            .catch(() => undefined)
          await openWorkflowFile(filePath, targetProjectPath, {
            entryState: templateStartState.entryState,
            templateContext: templateStartState.templateContext,
            initialInputValue: templateStartState.initialInputValue,
            initialAttachments: mergeInputAttachments(
              currentSourceAttachments,
              templateStartState.initialAttachments,
            ),
            autoRunIfAllowed: shouldAutoRunCreateStart(routeResult, template),
          })
          return
        }

        // No template found — create a blank workflow
        const draftWorkflow = applyWorkflowDetailBudget(
          createEmptyWorkflow(),
          detailBudget,
        )
        if (isGuidedRouting) {
          setRoutingPhase("opening")
          setChatRoutingProgress({ phase: "opening" })
        }
        const filePath = await window.api.createWorkflow(
          targetProjectPath,
          "new-flow",
          draftWorkflow,
        )
        await openWorkflowFile(filePath, targetProjectPath, {
          pendingMessage: message,
          pendingEntryRequest: message,
          initialInputValue: message,
          initialAttachments: currentSourceAttachments,
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
        setChatRoutingProgress(null)
      }
    },
    [
      submitting,
      createContext.projectPath,
      selectedResultModeId,
      modeConfigs,
      promptScaffold,
      sourceArtifacts,
      sourceAttachments,
      draftPrompt,
      webSearchBackend,
      detailBudget,
      setSelectedResultModeId,
      setChatRoutingProgress,
      openWorkflowFile,
    ],
  )

  const selectClarification = useCallback(
    (selection: RouteClarificationSelection) => {
      setRouteClarification(null)
      if (selection.kind === "job_route") {
        // Build the seed message from current state
        const selectedResultMode = getResultMode(selectedResultModeId)
        const currentModeConfig = normalizeResultModeConfig(
          selectedResultModeId,
          modeConfigs[selectedResultModeId],
        )
        const message = buildResultModeSeedInput(
          selectedResultMode,
          currentModeConfig,
          draftPrompt,
          promptScaffold,
        )
        void startRouting(message, {
          templateConstraintId: selection.templateId,
          useCurrentHelpMode: false,
        })
        return
      }
      helpModeHintRef.current = selection.helpMode
      const selectedResultMode = getResultMode(selectedResultModeId)
      const currentModeConfig = normalizeResultModeConfig(
        selectedResultModeId,
        modeConfigs[selectedResultModeId],
      )
      const message = buildResultModeSeedInput(
        selectedResultMode,
        currentModeConfig,
        draftPrompt,
        promptScaffold,
      )
      void startRouting(message, {
        helpModeOverride: selection.helpMode,
      })
    },
    [
      selectedResultModeId,
      modeConfigs,
      draftPrompt,
      promptScaffold,
      startRouting,
    ],
  )

  return {
    submitting,
    routingPhase,
    routingPreview,
    routeClarification,
    submitError,
    startRouting,
    selectClarification,
    resetRoutingState,
  }
}
