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
  globalWorkspacePathAtom,
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
  projectWorkflowsCacheAtom,
  selectedInboxTaskKeyAtom,
  setWorkflowContinuationEntryStateForKeyAtom,
  setWorkflowRequestedResultForKeyAtom,
  setWorkflowTemplateContextForKeyAtom,
  chatRoutingProgressAtom,
  templatesCatalogAtom,
  selectedChatIdAtom,
} from "@/lib/store"
import { selectedPastRunAtom } from "@/features/execution"
import { EMPTY_WORKFLOW_CREATE_SCAFFOLD } from "@/lib/workflow-create-prompt"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { toast } from "sonner"
import { errorToUserMessage } from "@/lib/error-message"
import type {
  ArtifactRecord,
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
import { launchTemplate } from "@/lib/launch-template"
import type { RouteClarificationSelection } from "@/components/create/WorkflowCreateDialogs"
import { filterDirectCreateEntryOptions } from "@shared/create-entry-routing"

export type FlowRoutingPhase = "inspecting" | "opening"

const ROUTING_MIN_VISIBLE_MS = 550

function waitForMs(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
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
      awaitingInput?: boolean
      sourceArtifacts?: ArtifactRecord[]
      sourceAttachments?: InputAttachment[]
      chatId?: string
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
  const globalWorkspacePath = useAtomValue(globalWorkspacePathAtom)
  const draftPrompt = useAtomValue(workflowCreateDraftPromptAtom)
  const modeConfigs = useAtomValue(workflowCreateModeConfigsAtom)
  const promptScaffold = useAtomValue(workflowCreatePromptScaffoldAtom)
  const sourceArtifacts = useAtomValue(workflowCreateSourceArtifactsAtom)
  const sourceAttachments = useAtomValue(workflowCreateSourceAttachmentsAtom)

  // Atom writes
  const setSelectedProject = useSetAtom(selectedProjectAtom)
  const setSelectedResultModeId = useSetAtom(selectedResultModeIdAtom)
  const setWorkflows = useSetAtom(workflowsAtom)
  const setProjectWorkflowsCache = useSetAtom(projectWorkflowsCacheAtom)
  const setSelectedWorkflowPath = useSetAtom(selectedWorkflowPathAtom)
  const setSelectedChatId = useSetAtom(selectedChatIdAtom)
  const selectedChatId = useAtomValue(selectedChatIdAtom)
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
  const setTemplatesCatalog = useSetAtom(templatesCatalogAtom)
  const setDraftPrompt = useSetAtom(workflowCreateDraftPromptAtom)
  const setPromptScaffold = useSetAtom(workflowCreatePromptScaffoldAtom)
  const setSourceArtifacts = useSetAtom(workflowCreateSourceArtifactsAtom)
  const setSourceAttachments = useSetAtom(workflowCreateSourceAttachmentsAtom)

  // Track help mode hint across clarification rounds
  const helpModeHintRef = useRef<CreateEntryHelpModeHint | null>(null)
  // Flag to prevent finally block from clearing clarification progress
  const clarificationActiveRef = useRef(false)
  // Monotonic session counter — incremented on each startRouting call so
  // earlier (stale) async continuations silently abort.
  const routingSessionRef = useRef(0)

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
        chatId?: string
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
      setProjectWorkflowsCache((prev) => ({
        ...prev,
        [projectPath]: refreshedWorkflows,
      }))
      setSelectedWorkflowPath(filePath)
      if (options?.chatId) {
        setSelectedChatId(options.chatId)
      }
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
      setProjectWorkflowsCache,
      setQueuedAutoRunPath,
      setSelectedInboxTaskKey,
      setSelectedPastRun,
      setSelectedChatId,
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
        awaitingInput?: boolean
        sourceArtifacts?: ArtifactRecord[]
        sourceAttachments?: InputAttachment[]
        chatId?: string
      },
    ) => {
      if (!message || submitting) return

      const sessionId = ++routingSessionRef.current

      const targetProjectPath =
        createContext.projectPath || selectedProject || globalWorkspacePath

      setSubmitting(true)
      setSubmitError(null)
      setRouteClarification(null)
      setRoutingPreview(null)
      clarificationActiveRef.current = false
      // Immediately show routing progress BEFORE any async work
      setChatRoutingProgress({ phase: "inspecting", userRequest: message })
      setRoutingPhase("inspecting")
      // Immediately switch to chat so routing progress is visible there
      setMainView("thread")
      setViewMode("chat")
      void window.api.trackUiEvent("point_b_entered").catch(() => undefined)

      const selectedResultMode = getResultMode(selectedResultModeId)
      const isGuidedRouting = isGuidedDomain(selectedResultMode.id)
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
      const currentSourceArtifacts = options?.sourceArtifacts ?? sourceArtifacts
      const currentSourceAttachments =
        options?.sourceAttachments ?? sourceAttachments

      const sourceContext =
        currentSourceArtifacts.length > 0
          ? (() => {
              const flowName =
                currentSourceArtifacts[0]?.workflowName ||
                currentSourceArtifacts[0]?.templateName ||
                "flow"
              const maxItems = 10
              const items = currentSourceArtifacts.slice(0, maxItems)
              const list = items
                .map((a) => `${a.relativePath} (${a.title})`)
                .join(", ")
              const suffix =
                currentSourceArtifacts.length > maxItems
                  ? ` and ${currentSourceArtifacts.length - maxItems} more`
                  : ""
              return `Previous run completed: ${flowName} — produced ${list}${suffix}`
            })()
          : undefined

      // Compute route options from available templates
      const allTemplates = await window.api.listTemplates(targetProjectPath)
      if (routingSessionRef.current !== sessionId) return
      if (allTemplates.length > 0) setTemplatesCatalog(allTemplates)
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
      let routeOptions = filterDirectCreateEntryOptions(
        selectedResultMode.id,
        basePrimaryOptions,
      )

      // When a follow-up constrains to a specific template that lives in a
      // different domain (e.g. Content Post Drafter while Research is active),
      // inject it from the full catalog so the router can select it.
      if (options?.templateConstraintId) {
        const cid = options.templateConstraintId
        if (!routeOptions.some((o) => o.templateId === cid)) {
          const t = allTemplates.find((tpl) => tpl.id === cid)
          if (t) {
            routeOptions = [
              ...routeOptions,
              {
                templateId: t.id,
                label: t.name,
                intentLabel: "",
                intentValues: undefined,
                recommended: undefined,
              },
            ]
          }
        }
      }

      let routingSucceeded = false

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
              sourceContext,
            })
          : null
        if (routingSessionRef.current !== sessionId) return
        await ensureMinimumRoutingVisibility()
        if (routingSessionRef.current !== sessionId) return
        if (routeResult?.clarification) {
          setRouteClarification(routeResult.clarification)
          // Also surface in chat timeline so the clarification appears inline
          setChatRoutingProgress({
            phase: "clarifying",
            userRequest: message,
            clarification: routeResult.clarification,
          })
          clarificationActiveRef.current = true
          setSubmitting(false)
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
            : await window.api.listTemplates(targetProjectPath)
        if (catalog.length > 0) setTemplatesCatalog(catalog)
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
            userRequest: message,
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
          const result = await launchTemplate({
            projectPath: targetProjectPath,
            template: startTemplate,
            requestedResult: message,
            sourceArtifacts: currentSourceArtifacts,
            sourceAttachments: currentSourceAttachments,
            routeResult: routeResult ?? null,
            detailBudget,
            webSearchBackend,
            awaitingInput: options?.awaitingInput,
          })
          if (routingSessionRef.current !== sessionId) return
          await openWorkflowFile(
            result.filePath,
            result.projectPath,
            { ...result.openOptions, chatId: options?.chatId },
          )
          routingSucceeded = true
          return
        }

        // No template found — create a blank workflow
        if (isGuidedRouting) {
          setRoutingPhase("opening")
          setChatRoutingProgress({ phase: "opening", userRequest: message })
        }
        const blankResult = await launchTemplate({
          projectPath: targetProjectPath,
          template: null,
          requestedResult: message,
          sourceAttachments: currentSourceAttachments,
          detailBudget,
          webSearchBackend,
        })
        if (routingSessionRef.current !== sessionId) return
        await openWorkflowFile(
          blankResult.filePath,
          blankResult.projectPath,
          { ...blankResult.openOptions, chatId: options?.chatId },
        )
        routingSucceeded = true
      } catch (error) {
        await ensureMinimumRoutingVisibility()
        const userMessage = errorToUserMessage(error).replace(
          /^Error: Error invoking remote method '[^']+': Error: /,
          "",
        )
        setSubmitError(userMessage)
        // Persist error in chat routing progress so the timeline renders it
        setChatRoutingProgress({
          phase: "error",
          userRequest: message,
          errorMessage: userMessage,
        })
        clarificationActiveRef.current = true // prevent finally from clearing
      } finally {
        setSubmitting(false)
        if (!clarificationActiveRef.current && !routingSucceeded) {
          setChatRoutingProgress(null)
          setRoutingPreview(null)
        }
      }
    },
    [
      submitting,
      createContext.projectPath,
      globalWorkspacePath,
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
          chatId: selectedChatId ?? undefined,
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
        chatId: selectedChatId ?? undefined,
      })
    },
    [
      selectedResultModeId,
      modeConfigs,
      draftPrompt,
      promptScaffold,
      startRouting,
      selectedChatId,
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
