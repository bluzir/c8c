import { useState, useEffect, useCallback, useMemo } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  templateBrowserOpenAtom,
  currentWorkflowAtom,
  inputAttachmentsAtom,
  inputValueAtom,
  selectedInboxTaskKeyAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  selectedResultModeIdAtom,
  selectedWorkflowTemplateContextAtom,
  setWorkflowTemplateContextForKeyAtom,
  workflowEntryStateAtom,
  webSearchBackendAtom,
  type WorkflowTemplate,
} from "@/lib/store"
import { runStatusAtom, selectedPastRunAtom } from "@/features/execution"
import {
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  Dialog,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import { cn } from "@/lib/cn"
import { AlertTriangle, Layers, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast-error"
import { cloneWorkflow } from "@/lib/workflow-graph-utils"
import { resolveTemplateWorkflow } from "@/lib/web-search-backend"
import { getTemplateSourceKind, getTemplateSourceLabel } from "@/lib/template-source"
import {
  deriveTemplateCardCopy,
  deriveTemplateExecutionDisciplineLabels,
  deriveTemplateUseWhen,
} from "@/lib/workflow-entry"
import { getResultMode, splitTemplatesForResultMode } from "@/lib/result-modes"
import { getReplaceCurrentWorkflowBlockedReason } from "@/lib/run-guards"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import { buildTemplateStartState } from "@/lib/template-start"

interface TemplateBrowserProps {
  onApply?: (template: WorkflowTemplate, previousWorkflow: unknown) => void
  initialTemplates?: WorkflowTemplate[]
}

export function TemplateBrowser({ onApply, initialTemplates }: TemplateBrowserProps = {}) {
  const [open, setOpen] = useAtom(templateBrowserOpenAtom)
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const [inputAttachments, setInputAttachments] = useAtom(inputAttachmentsAtom)
  const [inputValue, setInputValue] = useAtom(inputValueAtom)
  const [selectedInboxTaskKey, setSelectedInboxTaskKey] = useAtom(selectedInboxTaskKeyAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [selectedResultModeId] = useAtom(selectedResultModeIdAtom)
  const [selectedPastRun, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const [workflowEntryState, setWorkflowEntryState] = useAtom(workflowEntryStateAtom)
  const [selectedWorkflowTemplateContext] = useAtom(selectedWorkflowTemplateContextAtom)
  const setWorkflowTemplateContextForKey = useSetAtom(setWorkflowTemplateContextForKeyAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
  const [runStatus] = useAtom(runStatusAtom)
  const [templates, setTemplates] = useState<WorkflowTemplate[]>(initialTemplates ?? [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirmPending, setConfirmPending] = useState<WorkflowTemplate | null>(null)

  const loadTemplates = useCallback(async () => {
    if (initialTemplates) {
      setTemplates(initialTemplates)
      setLoadError(null)
      return
    }

    setIsLoading(true)
    setLoadError(null)
    try {
      void window.api.refreshCatalog().catch(() => undefined)
      setTemplates(await window.api.listTemplates())
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error("Failed to load library:", err)
      setTemplates([])
      setLoadError(message || "Could not load starting points.")
    } finally {
      setIsLoading(false)
    }
  }, [initialTemplates])

  const selectedMode = useMemo(
    () => getResultMode(selectedResultModeId),
    [selectedResultModeId],
  )
  const templateSplit = useMemo(
    () => splitTemplatesForResultMode(templates, selectedResultModeId),
    [selectedResultModeId, templates],
  )
  const quickStartById = useMemo(
    () => new Map(templateSplit.quickStarts.map((entry) => [entry.template.id, entry])),
    [templateSplit.quickStarts],
  )
  const orderedTemplates = useMemo(
    () => [
      ...templateSplit.quickStarts.map((entry) => entry.template),
      ...templateSplit.modeTemplates,
      ...templateSplit.otherTemplates,
    ],
    [templateSplit.modeTemplates, templateSplit.otherTemplates, templateSplit.quickStarts],
  )

  useEffect(() => {
    if (!open) return
    void loadTemplates()
  }, [loadTemplates, open])

  const selected = orderedTemplates.find((t) => t.id === selectedId)
  const selectedOptionId = selectedId ? `template-option-${selectedId}` : undefined
  const selectedQuickStart = selected ? quickStartById.get(selected.id) || null : null
  const selectedDisciplineLabels = selected ? deriveTemplateExecutionDisciplineLabels(selected) : []
  const selectedSourceKind = selected ? getTemplateSourceKind(selected) : null
  const selectedSourceLabel = selected ? getTemplateSourceLabel(selected) : null
  const selectedExecutionSummary = selected
    ? selected.executionPolicy?.summary?.trim()
      || (selectedDisciplineLabels.length > 0 ? selectedDisciplineLabels.join(", ") : null)
    : null
  const selectedExecutionDescription = selected?.executionPolicy?.description?.trim() || null
  const selectedPrimaryActionLabel = selectedQuickStart
    ? `Start ${selectedQuickStart.label}`
    : "Start with this"

  const closeBrowser = useCallback(() => {
    setOpen(false)
    setConfirmPending(null)
    setSelectedId(null)
  }, [setOpen])
  const replaceCurrentBlockedReason = getReplaceCurrentWorkflowBlockedReason(runStatus)

  const doApply = (previousWorkflow: unknown, templateToApply: WorkflowTemplate) => {
    if (replaceCurrentBlockedReason) {
      toastError("Cannot replace the current flow while a run is active", {
        description: replaceCurrentBlockedReason,
      })
      return
    }

    const nextWorkflow = resolveTemplateWorkflow(templateToApply, webSearchBackend)
    const resolvedTemplate: WorkflowTemplate = {
      ...templateToApply,
      workflow: nextWorkflow,
    }
    const previousState = {
      inputValue,
      inputAttachments,
      workflowEntryState,
      templateContext: selectedWorkflowTemplateContext,
      selectedInboxTaskKey,
      selectedPastRun,
    }
    if (onApply) {
      onApply(resolvedTemplate, previousWorkflow)
    } else {
      setWorkflow(nextWorkflow)
    }
    setSelectedInboxTaskKey(null)
    setSelectedPastRun(null)
    const templateStartState = buildTemplateStartState({
      template: resolvedTemplate,
      workflowPath: selectedWorkflowPath,
      projectPath: selectedProject,
    })
    const workflowKey = toWorkflowExecutionKey(selectedWorkflowPath)
    setInputValue(templateStartState.initialInputValue)
    setInputAttachments(templateStartState.initialAttachments)
    setWorkflowEntryState(templateStartState.entryState)
    setWorkflowTemplateContextForKey({
      key: workflowKey,
      context: templateStartState.templateContext,
    })
    setOpen(false)
    setSelectedId(null)
    setConfirmPending(null)
    toast.success(`"${templateToApply.name}" is ready in the current flow`, {
      action: {
        label: "Undo",
        onClick: () => {
          setWorkflow(previousWorkflow as typeof workflow)
          setInputValue(previousState.inputValue)
          setInputAttachments(previousState.inputAttachments)
          setSelectedInboxTaskKey(previousState.selectedInboxTaskKey)
          setSelectedPastRun(previousState.selectedPastRun)
          setWorkflowEntryState(previousState.workflowEntryState)
          setWorkflowTemplateContextForKey({ key: workflowKey, context: previousState.templateContext })
        },
      },
    })
  }

  const applyTemplate = (templateToApply: WorkflowTemplate | null = selected ?? null) => {
    if (!templateToApply) return
    const previousWorkflow = cloneWorkflow(workflow)
    const nextWorkflow = resolveTemplateWorkflow(templateToApply, webSearchBackend)
    const replacingCurrentWorkflow =
      JSON.stringify(previousWorkflow) !== JSON.stringify(nextWorkflow)
    if (replacingCurrentWorkflow) {
      setConfirmPending(templateToApply)
      return
    }
    doApply(previousWorkflow, templateToApply)
  }

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (orderedTemplates.length === 0) return
    const idx = orderedTemplates.findIndex((t) => t.id === selectedId)
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedId(orderedTemplates[Math.min(idx + 1, orderedTemplates.length - 1)]?.id ?? null)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedId(orderedTemplates[Math.max(idx - 1, 0)]?.id ?? null)
    } else if (e.key === "Enter" && selectedId) {
      e.preventDefault()
      applyTemplate(orderedTemplates[idx])
    } else if (e.key === "Escape") {
      e.preventDefault()
      closeBrowser()
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setOpen(true)
          return
        }
        closeBrowser()
      }}
    >
        <CanvasDialogContent size="xl" className="max-h-[80vh] flex flex-col p-0 gap-0" showCloseButton={false}>
        <CanvasDialogHeader className="surface-depth-header">
          <DialogTitle>Browse starting points</DialogTitle>
          <DialogDescription className="sr-only">
            Browse ready-to-run flows, preview their fit, and apply one to the current flow.
          </DialogDescription>
        </CanvasDialogHeader>

        <CanvasDialogBody className="grid grid-cols-1 lg:grid-cols-[1.4fr,1fr] gap-3 flex-1 min-h-0 pt-4 surface-soft">
          <div
            role="listbox"
            aria-label="Flow library"
            aria-activedescendant={selectedOptionId}
            tabIndex={0}
            className="overflow-y-auto ui-scroll-region space-y-2 pr-1 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/14 focus-visible:rounded-lg"
            onKeyDown={handleListKeyDown}
          >
            {isLoading && (
              <p className="text-body-md text-muted-foreground px-1 py-4 text-center">Loading library…</p>
            )}
            {!isLoading && loadError && (
                <div className="rounded-lg surface-danger-soft px-4 py-4 text-center">
                  <div className="ui-status-halo-danger mx-auto flex h-control-lg w-control-lg items-center justify-center rounded-full">
                    <AlertTriangle size={18} />
                  </div>
                <p className="mt-3 ui-body-text-medium text-foreground">Could not load starting points</p>
                <p className="mt-1 text-body-sm text-status-danger">{loadError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void loadTemplates()}
                >
                  <RefreshCw size={14} />
                  Retry
                </Button>
              </div>
            )}
            {!isLoading && !loadError && templates.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <Layers size={24} className="opacity-40" />
                <p className="text-body-md">No starting points available</p>
              </div>
            )}
            {!isLoading && !loadError && (
              <>
                {templateSplit.quickStarts.length > 0 && (
                  <div className="space-y-2">
                    <p className="px-1 ui-meta-label text-muted-foreground">
                      Suggested for {selectedMode.label}
                    </p>
                    {templateSplit.quickStarts.map((entry) => {
                      const template = entry.template
                      const isSelected = selectedId === template.id
                      return (
                        <Button
                          type="button"
                          role="option"
                          key={template.id}
                          id={`template-option-${template.id}`}
                          aria-selected={isSelected}
                          variant="ghost"
                          size="auto"
                          className={cn(
                            "ui-interactive-card h-auto w-full justify-start rounded-md surface-soft p-3 text-left whitespace-normal",
                            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                            isSelected && "surface-inset-card ring-2 ring-foreground/20 shadow-inset-highlight",
                          )}
                          onClick={() => setSelectedId(template.id)}
                          onDoubleClick={() => {
                            setSelectedId(template.id)
                            applyTemplate(template)
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 text-lg flex-shrink-0" aria-hidden>{template.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant="outline" size="compact">
                                  {entry.intentLabel}
                                </Badge>
                                {entry.recommended ? (
                                  <Badge variant="secondary" size="compact">
                                    Recommended
                                  </Badge>
                                ) : null}
                              </div>
                              <span className="mt-2 ui-body-text-medium block truncate">{entry.label}</span>
                              <p className="ui-meta-text mt-1">{entry.summary}</p>
                              <p className="mt-2 ui-meta-text text-muted-foreground">
                                {template.headline || getTemplateSourceLabel(template)}
                              </p>
                            </div>
                          </div>
                        </Button>
                      )
                    })}
                  </div>
                )}

                {templateSplit.modeTemplates.length > 0 && (
                  <div className="space-y-2">
                    <p className="px-1 ui-meta-label text-muted-foreground">
                      More ways to start
                    </p>
                    {templateSplit.modeTemplates.map((template) => {
                      const isSelected = selectedId === template.id
                      const sourceKind = getTemplateSourceKind(template)

                      return (
                        <Button
                          type="button"
                          role="option"
                          key={template.id}
                          id={`template-option-${template.id}`}
                          aria-selected={isSelected}
                          variant="ghost"
                          size="auto"
                          className={cn(
                            "ui-interactive-card h-auto w-full justify-start rounded-md surface-soft p-3 text-left whitespace-normal",
                            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                            isSelected && "surface-inset-card ring-2 ring-foreground/20 shadow-inset-highlight",
                          )}
                          onClick={() => setSelectedId(template.id)}
                          onDoubleClick={() => {
                            setSelectedId(template.id)
                            applyTemplate(template)
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-lg mt-0.5 flex-shrink-0" aria-hidden>{template.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <span className="ui-body-text-medium block truncate">{template.headline}</span>
                              <p className="ui-meta-text mt-1">
                                {deriveTemplateCardCopy(template)}
                              </p>
                              {(sourceKind === "plugin" || sourceKind === "user" || sourceKind === "hub") && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  <Badge variant="secondary" size="compact">
                                    {getTemplateSourceLabel(template)}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </div>
                        </Button>
                      )
                    })}
                  </div>
                )}

                {templateSplit.otherTemplates.length > 0 && (
                  <div className="space-y-2">
                    <p className="px-1 ui-meta-label text-muted-foreground">Also available</p>
                    {templateSplit.otherTemplates.map((template) => {
                      const isSelected = selectedId === template.id
                      const sourceKind = getTemplateSourceKind(template)

                      return (
                        <Button
                          type="button"
                          role="option"
                          key={template.id}
                          id={`template-option-${template.id}`}
                          aria-selected={isSelected}
                          variant="ghost"
                          size="auto"
                          className={cn(
                            "ui-interactive-card h-auto w-full justify-start rounded-md surface-soft p-3 text-left whitespace-normal",
                            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                            isSelected && "surface-inset-card ring-2 ring-foreground/20 shadow-inset-highlight",
                          )}
                          onClick={() => setSelectedId(template.id)}
                          onDoubleClick={() => {
                            setSelectedId(template.id)
                            applyTemplate(template)
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-lg mt-0.5 flex-shrink-0" aria-hidden>{template.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <span className="ui-body-text-medium block truncate">{template.headline}</span>
                              <p className="ui-meta-text mt-1">
                                {deriveTemplateCardCopy(template)}
                              </p>
                              {(sourceKind === "plugin" || sourceKind === "user" || sourceKind === "hub") && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  <Badge variant="secondary" size="compact">
                                    {getTemplateSourceLabel(template)}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </div>
                        </Button>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="rounded-lg surface-soft min-h-44 overflow-y-auto p-3 ui-scroll-region">
            {!selected ? (
              <p className="text-body-md text-muted-foreground">
                {loadError
                  ? "Retry loading the library to preview details before starting."
                  : "Select a flow to preview it before starting."}
              </p>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="ui-body-text-medium">{selectedQuickStart?.label || selected.name}</h4>
                    <Badge size="compact" variant="secondary">
                      {getTemplateSourceLabel(selected)}
                    </Badge>
                    {selectedQuickStart ? (
                      <Badge size="compact" variant="outline">
                        {selectedQuickStart.intentLabel}
                      </Badge>
                    ) : null}
                  </div>
                  {selected.description ? (
                    <p className="ui-meta-text mt-1">
                      {selected.description}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <div>
                    <span className="ui-meta-label text-muted-foreground">Best when</span>
                    <p className="text-body-sm">{deriveTemplateUseWhen(selected)}</p>
                  </div>
                  <div>
                    <span className="ui-meta-label text-muted-foreground">You'll give</span>
                    <p className="text-body-sm">{selected.input}</p>
                  </div>
                  <div>
                    <span className="ui-meta-label text-muted-foreground">You'll get</span>
                    <p className="text-body-sm">{selected.output}</p>
                  </div>
                </div>

                {(selectedExecutionSummary || selectedExecutionDescription) && (
                  <div>
                    <span className="ui-meta-label text-muted-foreground">Flow rules</span>
                    {selectedExecutionSummary ? (
                      <p className="text-body-sm text-foreground">{selectedExecutionSummary}</p>
                    ) : null}
                    {selectedExecutionDescription && selectedExecutionDescription !== selectedExecutionSummary ? (
                      <p className="mt-2 text-body-sm text-muted-foreground">{selectedExecutionDescription}</p>
                    ) : null}
                  </div>
                )}

                {selected.how ? (
                  <DisclosurePanel summary="Why this start works">
                    <p className="mt-3 text-body-sm text-muted-foreground">{selected.how}</p>
                  </DisclosurePanel>
                ) : null}

                {(selectedSourceKind === "plugin" || selectedSourceKind === "user" || selectedSourceKind === "hub") && (
                  <div>
                    <span className="ui-meta-label text-muted-foreground">Source</span>
                    <p className="text-body-sm text-foreground">
                      {selectedSourceLabel}
                      {selected.marketplaceName ? ` via ${selected.marketplaceName}` : ""}
                    </p>
                  </div>
                )}

                <DisclosurePanel summary="Inside this flow">
                  <ol className="list-decimal list-inside space-y-1 mt-3 text-muted-foreground">
                    {selected.steps.map((step, i) => (
                      <li key={i} className="text-body-sm">{step}</li>
                    ))}
                  </ol>
                </DisclosurePanel>
              </div>
            )}
          </div>
        </CanvasDialogBody>

        {confirmPending ? (
          <div className="mx-6 mt-2 rounded-lg surface-warning-soft p-3">
            <p className="text-body-md">
              Replace the current flow with <strong>{confirmPending.name}</strong>?
            </p>
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                onClick={() => doApply(cloneWorkflow(workflow), confirmPending)}
              >
                Replace
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmPending(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <CanvasDialogFooter className="surface-panel">
            <Button variant="outline" onClick={closeBrowser}>
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={() => applyTemplate()}
              disabled={!selected || Boolean(loadError)}
            >
              {selectedPrimaryActionLabel}
            </Button>
          </CanvasDialogFooter>
        )}
      </CanvasDialogContent>
    </Dialog>
  )
}
