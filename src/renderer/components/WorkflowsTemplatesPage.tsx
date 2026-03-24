import { useCallback, useEffect, useMemo, useState } from "react"
import { useAtom, useSetAtom } from "jotai"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  selectedWorkflowContinuationEntryStateAtom,
  selectedWorkflowTemplateContextAtom,
  setWorkflowContinuationEntryStateForKeyAtom,
  setWorkflowTemplateContextForKeyAtom,
  templateLibraryContextAtom,
  workflowCreateDraftPromptAtom,
  workflowCreateModeConfigsAtom,
  workflowCreatePromptScaffoldAtom,
  workflowCreateSourceArtifactsAtom,
  workflowCreateSourceAttachmentsAtom,
  workflowEntryStateAtom,
  workflowSavedSnapshotAtom,
  webSearchBackendAtom,
  workflowsAtom,
  queuedFollowUpTemplateIdAtom,
  type WorkflowTemplate,
} from "@/lib/store"
import { runStatusAtom, selectedPastRunAtom } from "@/features/execution"
import { toast } from "sonner"
import { toastError, toastErrorFromCatch } from "@/lib/toast-error"
import { Loader2, Sparkles, X } from "lucide-react"
import { PageHeader, PageShell } from "@/components/ui/page-shell"
import { CollectionToolbar } from "@/components/ui/collection-toolbar"
import { resolveTemplateWorkflow } from "@/lib/web-search-backend"
import {
  getTemplateLibraryFilterKey,
  getTemplateLibraryFilterLabel,
  getTemplateSearchScore,
  templateMatchesCategory,
  templateMatchesLibraryFilter,
  type TemplateCategoryKey,
  type TemplateLibraryFilterKey,
} from "@/lib/template-filters"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import { useWorkflowCreateNavigation } from "@/hooks/useWorkflowCreateNavigation"
import {
  resolveProjectRequiredContract,
  splitGuidedTemplateEntryContracts,
  type GuidedTemplateEntryContract,
} from "@/lib/entry-state-contracts"
import {
  deriveTemplateExecutionDisciplineLabels,
  hasSavedWorkContinuationContext,
  mergeInputAttachments,
} from "@/lib/workflow-entry"
import {
  buildResultModeSeedInput,
  countResultModeConfigFields,
  normalizeResultModeConfig,
} from "@/lib/result-mode-config"
import { getResultMode, splitTemplatesForResultMode } from "@/lib/result-modes"
import { buildTemplateStartState } from "@/lib/template-start"
import { hasWorkflowCreatePromptContent } from "@/lib/workflow-create-prompt"
import {
  resolveTemplateLibraryProjectPath,
  templateLibraryRequiresProjectCreation,
} from "@/lib/template-library-context"
import { getReplaceCurrentWorkflowBlockedReason } from "@/lib/run-guards"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import { PendingTemplateDialog } from "@/components/templates/PendingTemplateDialog"
import { TemplateCard } from "@/components/templates/TemplateCard"
import { TemplateDetailPanel } from "@/components/templates/TemplateDetailPanel"
import {
  deriveCreateModeId,
  normalizeTemplateForWorkflowUse,
  resolveHubTemplate,
  TEMPLATE_CATEGORY_META,
  TEMPLATE_CATEGORY_ORDER,
} from "@/components/templates/templateLibraryModel"
import { buildTemplateRoutingPreview } from "@/lib/create-routing-preview"
import { getTemplateSourceLabel } from "@/lib/template-source"

export function WorkflowsTemplatesPage() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")
  const [activeCategory, setActiveCategory] =
    useState<TemplateCategoryKey>("all")
  const [activeFilter, setActiveFilter] =
    useState<TemplateLibraryFilterKey>("all")
  const [selectedResultModeId] = useAtom(selectedResultModeIdAtom)
  const [draftPrompt, setDraftPrompt] = useAtom(workflowCreateDraftPromptAtom)
  const [modeConfigs] = useAtom(workflowCreateModeConfigsAtom)
  const [promptScaffold] = useAtom(workflowCreatePromptScaffoldAtom)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  )
  const [pendingTemplate, setPendingTemplate] =
    useState<WorkflowTemplate | null>(null)
  const [pendingTemplateDecision, setPendingTemplateDecision] = useState<
    "create" | "replace"
  >("create")
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const [inputAttachments, setInputAttachments] = useAtom(inputAttachmentsAtom)
  const [inputValue, setInputValue] = useAtom(inputValueAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
  const [projects] = useAtom(projectsAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(
    selectedWorkflowPathAtom,
  )
  const [selectedInboxTaskKey, setSelectedInboxTaskKey] = useAtom(
    selectedInboxTaskKeyAtom,
  )
  const [selectedWorkflowContinuationEntryState] = useAtom(
    selectedWorkflowContinuationEntryStateAtom,
  )
  const [selectedWorkflowTemplateContext] = useAtom(
    selectedWorkflowTemplateContextAtom,
  )
  const [templateLibraryContext, setTemplateLibraryContext] = useAtom(
    templateLibraryContextAtom,
  )
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [selectedPastRun, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const [workflowEntryState, setWorkflowEntryState] = useAtom(
    workflowEntryStateAtom,
  )
  const [sourceArtifacts] = useAtom(workflowCreateSourceArtifactsAtom)
  const [sourceAttachments] = useAtom(workflowCreateSourceAttachmentsAtom)
  const setWorkflowTemplateContextForKey = useSetAtom(
    setWorkflowTemplateContextForKeyAtom,
  )
  const setWorkflowContinuationEntryStateForKey = useSetAtom(
    setWorkflowContinuationEntryStateForKeyAtom,
  )
  const [, setMainView] = useAtom(mainViewAtom)
  const [runStatus] = useAtom(runStatusAtom)
  const [queuedFollowUpTemplateId, setQueuedFollowUpTemplateId] = useAtom(
    queuedFollowUpTemplateIdAtom,
  )
  const [targetProjectPath, setTargetProjectPath] = useState<string | null>(
    selectedProject,
  )
  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()
  const { openWorkflowCreate } = useWorkflowCreateNavigation()
  const replaceCurrentBlockedReason =
    getReplaceCurrentWorkflowBlockedReason(runStatus)
  const preferredProjectPath = useMemo(
    () =>
      resolveTemplateLibraryProjectPath(
        projects,
        selectedProject,
        templateLibraryContext,
      ),
    [projects, selectedProject, templateLibraryContext],
  )
  const createInProjectOnly = templateLibraryRequiresProjectCreation(
    templateLibraryContext,
  )
  const projectRequired = useMemo(
    () =>
      resolveProjectRequiredContract({
        resolvedProjectPath: preferredProjectPath,
        primaryActionLabel: "Choose folder",
      }),
    [preferredProjectPath],
  )

  useEffect(() => {
    return () => {
      setTemplateLibraryContext(null)
      setQueuedFollowUpTemplateId(null)
    }
  }, [setTemplateLibraryContext, setQueuedFollowUpTemplateId])

  useEffect(() => {
    if (!pendingTemplate) return
    setTargetProjectPath(preferredProjectPath)
  }, [pendingTemplate, preferredProjectPath])

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    try {
      // Trigger background catalog refresh, then load templates
      void window.api.refreshCatalog().catch(() => undefined)
      const loaded = await window.api.listTemplates()
      setTemplates(loaded)
    } catch (error) {
      toastErrorFromCatch("Could not load starting points", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  // Auto-apply a queued follow-up template from the chat timeline
  useEffect(() => {
    if (!queuedFollowUpTemplateId || templates.length === 0 || loading) return
    const template = templates.find((t) => t.id === queuedFollowUpTemplateId)
    setQueuedFollowUpTemplateId(null)
    if (!template) {
      toastError("Could not find the suggested flow")
      return
    }
    if (preferredProjectPath) {
      void doCreateFromTemplate(template, preferredProjectPath)
    } else {
      void doApplyTemplate(template)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedFollowUpTemplateId, templates, loading])

  const searchFilteredTemplates = useMemo(() => {
    const q = query.trim()
    if (!q) return templates

    return templates
      .map((template, index) => ({
        template,
        index,
        score: getTemplateSearchScore(
          template,
          q,
          getTemplateSourceLabel(template),
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((entry) => entry.template)
  }, [query, templates])

  const categoryFilteredTemplates = useMemo(
    () =>
      searchFilteredTemplates.filter((template) =>
        templateMatchesCategory(template, activeCategory),
      ),
    [activeCategory, searchFilteredTemplates],
  )

  const availableGoalFilters = useMemo(
    () =>
      Array.from(
        categoryFilteredTemplates.reduce(
          (filters, template) => {
            const key = getTemplateLibraryFilterKey(template)
            const existing = filters.get(key)
            if (existing) {
              existing.count += 1
              return filters
            }
            filters.set(key, {
              key,
              label: getTemplateLibraryFilterLabel(template),
              count: 1,
            })
            return filters
          },
          new Map<
            TemplateLibraryFilterKey,
            {
              key: TemplateLibraryFilterKey
              label: string
              count: number
            }
          >(),
        ),
      )
        .map(([, entry]) => entry)
        .sort(
          (left, right) =>
            right.count - left.count || left.label.localeCompare(right.label),
        ),
    [categoryFilteredTemplates],
  )

  const filteredTemplates = useMemo(() => {
    return categoryFilteredTemplates.filter((template) =>
      templateMatchesLibraryFilter(template, activeFilter),
    )
  }, [activeFilter, categoryFilteredTemplates])
  const filteredTemplateEntries = useMemo(
    () => splitGuidedTemplateEntryContracts(filteredTemplates, templates),
    [filteredTemplates, templates],
  )
  const templateSplit = useMemo(
    () => splitTemplatesForResultMode(templates, selectedResultModeId),
    [selectedResultModeId, templates],
  )
  const quickStartById = useMemo(
    () =>
      new Map(
        templateSplit.quickStarts.map((entry) => [entry.template.id, entry]),
      ),
    [templateSplit.quickStarts],
  )

  const selectedTemplateEntry = useMemo(
    () =>
      filteredTemplateEntries.entries.find(
        (entry) => entry.template.id === selectedTemplateId,
      ) ?? null,
    [filteredTemplateEntries.entries, selectedTemplateId],
  )
  const selectedTemplate = selectedTemplateEntry?.template ?? null
  const selectedQuickStart = selectedTemplate
    ? quickStartById.get(selectedTemplate.id) || null
    : null
  const selectedRoutingPreview = useMemo(() => {
    if (selectedResultModeId !== "development" || !selectedTemplate) return null
    return buildTemplateRoutingPreview({
      template: selectedTemplate,
      templates,
      title: selectedQuickStart?.label,
      helpModeLabel: selectedQuickStart?.intentLabel,
    })
  }, [selectedQuickStart, selectedResultModeId, selectedTemplate, templates])
  const pendingTemplateQuickStart = pendingTemplate
    ? quickStartById.get(pendingTemplate.id) || null
    : null
  const pendingTemplateRoutingPreview = useMemo(() => {
    if (selectedResultModeId !== "development" || !pendingTemplate) return null
    return buildTemplateRoutingPreview({
      template: pendingTemplate,
      templates,
      title: pendingTemplateQuickStart?.label,
      helpModeLabel: pendingTemplateQuickStart?.intentLabel,
    })
  }, [
    pendingTemplate,
    pendingTemplateQuickStart,
    selectedResultModeId,
    templates,
  ])
  const pendingTemplateExecutionSummary = useMemo(() => {
    if (!pendingTemplate) return null
    const disciplineLabels =
      deriveTemplateExecutionDisciplineLabels(pendingTemplate)
    return (
      pendingTemplate.executionPolicy?.summary?.trim() ||
      (disciplineLabels.length > 0 ? disciplineLabels.join(", ") : null)
    )
  }, [pendingTemplate])

  const selectedCategoryMeta = TEMPLATE_CATEGORY_META[activeCategory]
  const createModeId = useMemo(
    () =>
      deriveCreateModeId(
        activeCategory,
        selectedResultModeId,
        selectedTemplateEntry?.template ?? null,
      ),
    [activeCategory, selectedResultModeId, selectedTemplateEntry?.template],
  )
  const selectedResultMode = useMemo(
    () => getResultMode(selectedResultModeId),
    [selectedResultModeId],
  )
  const selectedModeConfig = useMemo(
    () =>
      normalizeResultModeConfig(
        selectedResultModeId,
        modeConfigs[selectedResultModeId],
      ),
    [modeConfigs, selectedResultModeId],
  )
  const selectedModeConfigFieldCount = useMemo(
    () => countResultModeConfigFields(selectedResultModeId, selectedModeConfig),
    [selectedModeConfig, selectedResultModeId],
  )
  const requestedResult = useMemo(() => {
    if (!templateLibraryContext) return ""
    const canSeedIntent =
      hasWorkflowCreatePromptContent(draftPrompt, promptScaffold) ||
      selectedModeConfigFieldCount > 0
    if (!canSeedIntent) return ""
    return buildResultModeSeedInput(
      selectedResultMode,
      selectedModeConfig,
      draftPrompt,
      promptScaffold,
    )
  }, [
    draftPrompt,
    promptScaffold,
    selectedModeConfig,
    selectedModeConfigFieldCount,
    selectedResultMode,
    templateLibraryContext,
  ])
  const sourceAttachmentSummary = useMemo(() => {
    if (sourceArtifacts.length > 0) {
      const titles = sourceArtifacts
        .slice(0, 2)
        .map((artifact) => artifact.title)
      if (sourceArtifacts.length > 2) {
        titles.push(`+${sourceArtifacts.length - 2} more`)
      }
      return titles.join(" · ")
    }
    if (sourceAttachments.length > 0) {
      const labels = sourceAttachments.slice(0, 2).map((attachment) => {
        if (attachment.kind === "file") return attachment.name
        if (attachment.kind === "run") return attachment.workflowName
        return attachment.label
      })
      if (sourceAttachments.length > 2) {
        labels.push(`+${sourceAttachments.length - 2} more`)
      }
      return labels.join(" · ")
    }
    return null
  }, [sourceArtifacts, sourceAttachments])
  const hasActiveFilters =
    activeCategory !== "all" ||
    activeFilter !== "all" ||
    query.trim().length > 0

  useEffect(() => {
    if (selectedTemplateId === null) return
    if (
      filteredTemplates.some((template) => template.id === selectedTemplateId)
    )
      return
    setSelectedTemplateId(null)
  }, [filteredTemplates, selectedTemplateId])

  useEffect(() => {
    if (activeFilter === "all") return
    if (availableGoalFilters.some((entry) => entry.key === activeFilter)) return
    setActiveFilter("all")
  }, [activeFilter, availableGoalFilters])

  useEffect(() => {
    if (!pendingTemplate) return
    setPendingTemplateDecision(preferredProjectPath ? "create" : "replace")
  }, [pendingTemplate, preferredProjectPath])

  const clearFilters = () => {
    setQuery("")
    setActiveCategory("all")
    setActiveFilter("all")
  }

  const replaceOptionAvailable = !replaceCurrentBlockedReason
  const canContinuePendingTemplate =
    pendingTemplateDecision === "create"
      ? Boolean(targetProjectPath)
      : replaceOptionAvailable

  const confirmApplyTemplate = (template: WorkflowTemplate) => {
    if (createInProjectOnly) {
      if (projectRequired.projectRequired) {
        toastError(
          `${projectRequired.blockerStatement} ${projectRequired.actionInstruction}`,
        )
        return
      }
      void doCreateFromTemplate(template, preferredProjectPath!)
      return
    }

    const nextWorkflow = resolveTemplateWorkflow(template, webSearchBackend)
    const replacingCurrent =
      JSON.stringify(workflow) !== JSON.stringify(nextWorkflow)
    if (replacingCurrent) {
      setPendingTemplate(template)
      return
    }
    doApplyTemplate(template)
  }

  const doApplyTemplate = async (template: WorkflowTemplate) => {
    if (replaceCurrentBlockedReason) {
      toastError("Cannot replace the current flow while a run is active", {
        description: replaceCurrentBlockedReason,
      })
      return
    }

    const resolved = await resolveHubTemplate(template)
    const previousWorkflow = structuredClone(workflow)
    const previousState = {
      inputValue,
      inputAttachments,
      workflowEntryState,
      workflowContinuationEntryState: selectedWorkflowContinuationEntryState,
      templateContext: selectedWorkflowTemplateContext,
      selectedInboxTaskKey,
      selectedPastRun,
    }
    const templateForWorkflowUse = normalizeTemplateForWorkflowUse(resolved)
    const nextWorkflow = resolveTemplateWorkflow(
      templateForWorkflowUse,
      webSearchBackend,
    )
    const templateStartState = buildTemplateStartState({
      template: {
        ...templateForWorkflowUse,
        workflow: nextWorkflow,
      },
      workflowPath: selectedWorkflowPath,
      projectPath: preferredProjectPath,
      requestedResult,
      sourceArtifacts,
    })
    const workflowKey = toWorkflowExecutionKey(selectedWorkflowPath)
    setWorkflow(nextWorkflow)
    setInputValue(templateStartState.initialInputValue)
    setInputAttachments(
      mergeInputAttachments(
        sourceAttachments,
        templateStartState.initialAttachments,
      ),
    )
    setSelectedInboxTaskKey(null)
    setSelectedPastRun(null)
    setWorkflowEntryState(templateStartState.entryState)
    setWorkflowContinuationEntryStateForKey({
      key: workflowKey,
      entryState: hasSavedWorkContinuationContext(
        templateStartState.templateContext,
      )
        ? templateStartState.entryState
        : null,
    })
    setWorkflowTemplateContextForKey({
      key: workflowKey,
      context: templateStartState.templateContext,
    })
    setMainView("thread")
    setPendingTemplate(null)
    toast.success(
      `"${templateForWorkflowUse.name}" is ready in the current flow`,
      {
        action: {
          label: "Undo",
          onClick: () => {
            setWorkflow(previousWorkflow)
            setInputValue(previousState.inputValue)
            setInputAttachments(previousState.inputAttachments)
            setSelectedInboxTaskKey(previousState.selectedInboxTaskKey)
            setSelectedPastRun(previousState.selectedPastRun)
            setWorkflowEntryState(previousState.workflowEntryState)
            setWorkflowContinuationEntryStateForKey({
              key: workflowKey,
              entryState: previousState.workflowContinuationEntryState,
            })
            setWorkflowTemplateContextForKey({
              key: workflowKey,
              context: previousState.templateContext,
            })
          },
        },
      },
    )
  }

  const doCreateFromTemplate = async (
    template: WorkflowTemplate,
    projectPath: string,
  ) => {
    const resolved = await resolveHubTemplate(template)
    const templateForWorkflowUse = normalizeTemplateForWorkflowUse(resolved)
    const nextWorkflow = resolveTemplateWorkflow(
      templateForWorkflowUse,
      webSearchBackend,
    )
    try {
      const filePath = await window.api.createWorkflow(
        projectPath,
        templateForWorkflowUse.name,
        nextWorkflow,
      )
      const loadedWorkflow = await window.api.loadWorkflow(filePath)
      const templateStartState = buildTemplateStartState({
        template: {
          ...templateForWorkflowUse,
          workflow: loadedWorkflow,
        },
        workflowPath: filePath,
        projectPath,
        requestedResult,
        sourceArtifacts,
      })
      const refreshed = await window.api.listProjectWorkflows(projectPath)
      await window.api
        .recordProjectTemplateUsage(projectPath, template.id)
        .catch(() => undefined)
      setWorkflows(refreshed)
      setSelectedProject(projectPath)
      setSelectedWorkflowPath(filePath)
      setSelectedInboxTaskKey(null)
      setWorkflow(loadedWorkflow)
      setInputValue(templateStartState.initialInputValue)
      setInputAttachments(
        mergeInputAttachments(
          sourceAttachments,
          templateStartState.initialAttachments,
        ),
      )
      setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
      setSelectedPastRun(null)
      setWorkflowEntryState(templateStartState.entryState)
      setWorkflowContinuationEntryStateForKey({
        key: toWorkflowExecutionKey(filePath),
        entryState: hasSavedWorkContinuationContext(
          templateStartState.templateContext,
        )
          ? templateStartState.entryState
          : null,
      })
      setWorkflowTemplateContextForKey({
        key: toWorkflowExecutionKey(filePath),
        context: templateStartState.templateContext,
      })
      setMainView("thread")
      setPendingTemplate(null)
      toast.success(
        `"${loadedWorkflow.name || templateForWorkflowUse.name}" is ready in ${projectPath.split(/[\\/]/).pop() || "project"}`,
      )
    } catch (error) {
      toastErrorFromCatch("Could not create flow", error)
    }
  }

  const renderTemplateGrid = (items: GuidedTemplateEntryContract[]) => (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {items.map((entry) => (
        <TemplateCard
          key={entry.template.id}
          entry={entry}
          isSelected={selectedTemplateId === entry.template.id}
          onSelect={(template) =>
            setSelectedTemplateId((current) =>
              current === template.id ? null : template.id,
            )
          }
        />
      ))}
    </div>
  )

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          openWorkflowCreate({
            modeId: createModeId,
            projectPath: preferredProjectPath,
            locked: createInProjectOnly,
            prompt: templateLibraryContext ? draftPrompt : "",
            sourceArtifacts,
            initialAttachments: sourceAttachments,
          })
        }
      >
        <Sparkles size={14} />
        {templateLibraryContext ? "Back to create" : "Create with agent"}
      </Button>
    </div>
  )

  return (
    <PageShell>
      <PageHeader
        title="Starting points"
        subtitle="Guided starting points first, one-off flows second."
        actions={headerActions}
      />

      <section aria-label="Starting points intro" className="space-y-2 px-1">
        <p className="text-body-sm text-muted-foreground">
          Start broad, then narrow the list only if that helps.
        </p>
        <p className="text-body-sm text-foreground">
          {selectedCategoryMeta.summary}
        </p>
        {templateLibraryContext && requestedResult ? (
          <p className="text-body-sm text-muted-foreground">
            Current goal: {requestedResult}
          </p>
        ) : null}
        {sourceAttachmentSummary ? (
          <div className="border-b border-hairline/70 pb-3">
            <div className="ui-meta-label text-muted-foreground">
              Using result
            </div>
            <p className="mt-1 text-body-sm text-foreground">
              {sourceAttachmentSummary}
            </p>
          </div>
        ) : null}
      </section>

      <CollectionToolbar
        ariaLabel="Library controls"
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search starting points"
        searchAriaLabel="Search starting points"
        surface="flat"
        summary={`${filteredTemplates.length} starting point${filteredTemplates.length === 1 ? "" : "s"}`}
        filters={
          <>
            <Select
              value={activeCategory}
              onValueChange={(value) =>
                setActiveCategory(value as TemplateCategoryKey)
              }
            >
              <SelectTrigger className="h-control-sm min-w-[11rem]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_CATEGORY_ORDER.map((category) => (
                  <SelectItem key={category} value={category}>
                    {TEMPLATE_CATEGORY_META[category].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableGoalFilters.length > 1 ? (
              <Select
                value={activeFilter}
                onValueChange={(value) =>
                  setActiveFilter(value as TemplateLibraryFilterKey)
                }
              >
                <SelectTrigger className="h-control-sm min-w-[12rem]">
                  <SelectValue placeholder="Goal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All goals</SelectItem>
                  {availableGoalFilters.map(({ key, label }) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {hasActiveFilters && (
              <Button variant="ghost" size="xs" onClick={clearFilters}>
                <X size={12} />
                Clear
              </Button>
            )}
          </>
        }
      />

      <section aria-busy={loading} aria-live="polite">
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* Main grid */}
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={`skeleton-${idx}`}
                    className="rounded-lg border border-hairline/70 p-4 flex items-start gap-3"
                    aria-hidden="true"
                  >
                    <Skeleton className="h-6 w-6 flex-shrink-0" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="ui-empty-state px-4 text-body-sm text-muted-foreground">
                <p>
                  {activeCategory === "all"
                    ? "No starting points match these filters."
                    : `No ${selectedCategoryMeta.label.toLowerCase()} starting points match these filters.`}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {filteredTemplateEntries.guidedEntries.length > 0 ? (
                  <section
                    className="space-y-3"
                    aria-label="Guided starting points"
                  >
                    <div className="px-1">
                      <p className="section-kicker">Guided starting points</p>
                      <p className="mt-1 text-body-sm text-muted-foreground">
                        Start with the first step, then continue through saved
                        work as the path progresses.
                      </p>
                    </div>
                    {renderTemplateGrid(filteredTemplateEntries.guidedEntries)}
                  </section>
                ) : null}

                {filteredTemplateEntries.isolatedEntries.length > 0 ? (
                  <section
                    className="space-y-3"
                    aria-label={
                      filteredTemplateEntries.guidedEntries.length > 0
                        ? "More starts"
                        : "All starts"
                    }
                  >
                    {filteredTemplateEntries.guidedEntries.length > 0 ? (
                      <div className="px-1">
                        <p className="section-kicker">More starts</p>
                        <p className="mt-1 text-body-sm text-muted-foreground">
                          One-off flows that do not open a larger guided path.
                        </p>
                      </div>
                    ) : null}
                    {renderTemplateGrid(
                      filteredTemplateEntries.isolatedEntries,
                    )}
                  </section>
                ) : null}
              </div>
            )}
          </div>

          {/* Side panel */}
          {selectedTemplateEntry && (
            <TemplateDetailPanel
              entry={selectedTemplateEntry}
              routingPreview={selectedRoutingPreview}
              onUse={confirmApplyTemplate}
              disabled={createInProjectOnly && !preferredProjectPath}
              onClose={() => setSelectedTemplateId(null)}
            />
          )}
        </div>
      </section>

      <PendingTemplateDialog
        pendingTemplate={pendingTemplate}
        routingPreview={pendingTemplateRoutingPreview}
        executionSummary={pendingTemplateExecutionSummary}
        projects={projects}
        targetProjectPath={targetProjectPath}
        onTargetProjectPathChange={setTargetProjectPath}
        blockerStatement={projectRequired.blockerStatement}
        actionInstruction={projectRequired.actionInstruction}
        pendingTemplateDecision={pendingTemplateDecision}
        onPendingTemplateDecisionChange={setPendingTemplateDecision}
        replaceOptionAvailable={replaceOptionAvailable}
        canContinue={canContinuePendingTemplate}
        onClose={() => setPendingTemplate(null)}
        onContinue={() => {
          if (!pendingTemplate) return
          if (pendingTemplateDecision === "replace") {
            void doApplyTemplate(pendingTemplate)
            return
          }
          if (!targetProjectPath) return
          void doCreateFromTemplate(pendingTemplate, targetProjectPath)
        }}
      />
      {unsavedChangesDialog}
    </PageShell>
  )
}
