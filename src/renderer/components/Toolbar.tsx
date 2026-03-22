import { useCallback, useEffect, useRef, useState, type Ref } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import type { InputNodeConfig, PermissionMode } from "@shared/types"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { runIdAtom, runStatusAtom } from "@/features/execution"
import { workflowHistoryRunsAtom } from "@/features/execution"
import { toastError, toastErrorFromCatch } from "@/lib/toast-error"
import {
  WorkflowPrimaryActions,
} from "@/components/toolbar/WorkflowPrimaryActions"
import { WorkflowRunControls } from "@/components/toolbar/WorkflowRunControls"
import { WorkflowRunBlocker } from "@/components/toolbar/WorkflowRunBlocker"
import { WorkflowToolbarDialogs } from "@/components/toolbar/WorkflowToolbarDialogs"
import { useBlankWorkflowCreation } from "@/hooks/useBlankWorkflowCreation"
import { useToolbarCommandBindings } from "@/hooks/useToolbarCommandBindings"
import { useToolbarDesktopMenuState } from "@/hooks/useToolbarDesktopMenuState"
import { useToolbarActions } from "@/hooks/useToolbarActions"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import { useWorkflowCreateNavigation } from "@/hooks/useWorkflowCreateNavigation"
import { resolveWorkflowInput } from "@/lib/input-type"
import {
  currentWorkflowAtom,
  selectedWorkflowPathAtom,
  selectedProjectAtom,
  workflowsAtom,
  inputValueAtom,
  skillsAtom,
  chatPanelOpenAtom,
  desktopRuntimeAtom,
  batchDialogOpenAtom,
  workflowDirtyAtom,
  defaultProviderAtom,
  providerAuthStatusAtom,
  providerAvailabilityAtom,
  providerSettingsAtom,
  workflowSavedSnapshotAtom,
  mainViewAtom,
  projectSidebarOpenAtom,
  workflowReviewModeAtom,
  workflowRunBlockReasonAtom,
  selectedInboxTaskKeyAtom,
  selectedNodeIdAtom,
  validationNavigationTargetAtom,
  viewModeAtom,
  flowSurfaceModeAtom,
  outputSurfaceCommandStateAtom,
} from "@/lib/store"
import { selectedPastRunAtom } from "@/features/execution"
import {
  canUndoAtom,
  canRedoAtom,
  performRedo,
  performUndo,
  redoStackAtom,
  undoStackAtom,
} from "@/lib/undo-manager"
import { resolveValidationNavigationTarget } from "@/lib/validation-navigation"
import { validateWorkflow } from "@/lib/validate-workflow"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { resolveWorkflowRunAvailability } from "@/components/toolbar/run-availability"
import type { WorkflowPanelShellState } from "@/components/workflow-panel/WorkflowPanelChrome"
import { dispatchDesktopCommand } from "@/lib/desktop-command-bus"
import { resolveExecutionStartBlockReason } from "@/features/execution/preflight"
import type { WorkflowActionMenuAction } from "@/components/toolbar/WorkflowActionMenu"

export function Toolbar({
  onRun,
  onCancel,
  shellState,
  entryTitle,
  shellDetail,
  agentToggleRef,
}: {
  onRun: (mode?: PermissionMode) => Promise<void> | void
  onCancel: () => Promise<void> | void
  shellState: WorkflowPanelShellState
  entryTitle?: string | null
  shellDetail?: string | null
  agentToggleRef?: Ref<HTMLButtonElement>
}) {
  const [workflow] = useAtom(currentWorkflowAtom)
  const [workflowPath] = useAtom(selectedWorkflowPathAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [inputValue] = useAtom(inputValueAtom)
  const defaultProvider = useAtomValue(defaultProviderAtom)
  const providerSettings = useAtomValue(providerSettingsAtom)
  const providerAvailability = useAtomValue(providerAvailabilityAtom)
  const providerAuthStatus = useAtomValue(providerAuthStatusAtom)
  const [workflowDirty] = useAtom(workflowDirtyAtom)
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [, setSkills] = useAtom(skillsAtom)
  const [, setCurrentWorkflow] = useAtom(currentWorkflowAtom)
  const [, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [runStatus, setRunStatus] = useAtom(runStatusAtom)
  const [runId] = useAtom(runIdAtom)
  const [chatOpen, setChatOpen] = useAtom(chatPanelOpenAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [viewMode, setViewMode] = useAtom(viewModeAtom)
  const [flowSurfaceMode] = useAtom(flowSurfaceModeAtom)
  const [, setSelectedInboxTaskKey] = useAtom(selectedInboxTaskKeyAtom)
  const [, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const [desktopRuntime] = useAtom(desktopRuntimeAtom)
  const [sidebarOpen] = useAtom(projectSidebarOpenAtom)
  const [workflowReviewMode] = useAtom(workflowReviewModeAtom)
  const [workflowRunBlockReason] = useAtom(workflowRunBlockReasonAtom)
  const [workflowPastRuns] = useAtom(workflowHistoryRunsAtom)
  const setSelectedNodeId = useSetAtom(selectedNodeIdAtom)
  const setValidationNavigationTarget = useSetAtom(validationNavigationTargetAtom)
  const setBatchOpen = useSetAtom(batchDialogOpenAtom)
  const outputSurfaceCommandState = useAtomValue(outputSurfaceCommandStateAtom)
  const [undoStack, setUndoStack] = useAtom(undoStackAtom)
  const [redoStack, setRedoStack] = useAtom(redoStackAtom)
  const canUndo = useAtomValue(canUndoAtom)
  const canRedo = useAtomValue(canRedoAtom)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameInput, setRenameInput] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [templateNameInput, setTemplateNameInput] = useState("")
  const [saveFlash, setSaveFlash] = useState<"saved" | "imported" | "exported" | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [runControlPending, setRunControlPending] = useState<"pause" | "resume" | null>(null)
  const flashTimerRef = useRef<number | null>(null)
  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()
  const { openWorkflowCreate } = useWorkflowCreateNavigation()
  const { createBlankWorkflow } = useBlankWorkflowCreation({ confirmDiscard })
  const {
    refreshProjectData,
    deriveTitleFromPath,
    save,
    saveAs,
    exportCopy,
    openFile,
    renameWorkflow,
    deleteWorkflow,
  } = useToolbarActions({
    workflow,
    workflowPath,
    selectedProject,
    setWorkflows,
    setSkills,
    setCurrentWorkflow,
    setSelectedWorkflowPath,
    setWorkflowSavedSnapshot,
  })

  const openRenameDialog = () => {
    if (!workflowPath) return
    const currentName = (workflow.name || "").trim() || deriveTitleFromPath(workflowPath)
    setRenameInput(currentName)
    setRenameDialogOpen(true)
  }

  const commitRename = async () => {
    if (!workflowPath) return
    if (!renameInput.trim()) {
      toastError("Flow name cannot be empty")
      return
    }
    await renameWorkflow(renameInput)
    setRenameDialogOpen(false)
  }

  const openTemplateDialog = () => {
    setTemplateNameInput((workflow.name || "").trim())
    setTemplateDialogOpen(true)
  }

  const commitSaveAsTemplate = async () => {
    const name = templateNameInput.trim()
    if (!name) {
      toastError("Library name cannot be empty")
      return
    }
    try {
      const filePath = await window.api.saveAsTemplate(name, workflow)
      setTemplateDialogOpen(false)
      toast.success("Saved to library", { description: filePath })
    } catch (err) {
      toastErrorFromCatch("Failed to save to library", err)
    }
  }

  const commitDelete = async () => {
    if (!workflowPath) return
    setDeleteDialogOpen(false)
    await deleteWorkflow()
  }

  const isRunning = runStatus === "running" || runStatus === "starting" || runStatus === "cancelling" || runStatus === "paused"
  const isStarting = runStatus === "starting"
  const isCancelling = runStatus === "cancelling"
  const isPaused = runStatus === "paused"
  const primaryShortcutLabel = desktopRuntime.primaryModifierLabel
  const runShortcutLabel = `${primaryShortcutLabel}↵`
  const chatShortcutLabel = `${primaryShortcutLabel}⇧K`
  const sidebarShortcutLabel = `${primaryShortcutLabel}B`
  const settingsShortcutLabel = `${primaryShortcutLabel},`
  const redoShortcutLabel = `${primaryShortcutLabel}⇧Z`

  const hasSkillNodes = workflow.nodes.some((node) => node.type === "skill")
  const inputNode = workflow.nodes.find((node) => node.type === "input")
  const inputConfig = (inputNode?.config || {}) as InputNodeConfig
  const inputValidation = resolveWorkflowInput(inputValue, {
    inputType: inputConfig.inputType,
    required: inputConfig.required,
    defaultValue: inputConfig.defaultValue,
  })
  const workflowValidation = validateWorkflow(workflow, defaultProvider)
  const hasBlockingErrors = workflowValidation.some((issue) => issue.severity === "error")
  const blockingValidationCount = workflowValidation.filter((issue) => issue.severity === "error").length
  const providerRunBlockReason = resolveExecutionStartBlockReason(workflow, {
    settings: providerSettings,
    availability: providerAvailability,
    auth: providerAuthStatus,
  })
  const {
    canRun,
    runDisabledReason,
    canBatchRun,
  } = resolveWorkflowRunAvailability({
    hasSkillNodes,
    inputValid: inputValidation.valid,
    inputValidationMessage: inputValidation.message || null,
    hasBlockingErrors,
    blockingValidationCount,
    workflowRunBlockReason: workflowRunBlockReason || providerRunBlockReason,
  })
  const hasProviderRunBlock = providerRunBlockReason !== null && workflowRunBlockReason === null
  const navigateToValidationIssue = useCallback((issue: (typeof workflowValidation)[number]) => {
    const target = resolveValidationNavigationTarget(workflow, issue, viewMode)
    setViewMode(target.viewMode)
    setSelectedNodeId(target.nodeId)
    setValidationNavigationTarget(
      target.fieldId
        ? {
            nodeId: target.nodeId,
            fieldId: target.fieldId,
            requestId: Date.now(),
          }
        : null,
    )
  }, [setSelectedNodeId, setValidationNavigationTarget, setViewMode, viewMode, workflow])

  const handleRunWithValidation = useCallback(async (mode: PermissionMode = "edit") => {
    const currentValidation = validateWorkflow(workflow, defaultProvider)
    const blockingIssues = currentValidation.filter((issue) => issue.severity === "error")
    if (blockingIssues.length > 0) {
      const firstBlockingIssue = blockingIssues[0] || null
      toast.warning("Run blocked", {
        description: firstBlockingIssue?.message || "Fix the flow before running it.",
      })
      if (firstBlockingIssue) {
        navigateToValidationIssue(firstBlockingIssue)
      }
      return
    }

    const warnings = currentValidation.filter((issue) => issue.severity === "warning")
    if (warnings.length > 0) {
      toast.warning(`${warnings.length} warning(s)`, {
        description: warnings.map((warning) => warning.message).join(" "),
      })
    }
    await onRun(mode)
  }, [defaultProvider, navigateToValidationIssue, onRun, workflow])

  const revealRunBlocker = useCallback(() => {
    if (!runDisabledReason) return
    const firstBlockingIssue = workflowValidation.find((issue) => issue.severity === "error") || null
    toast.warning("Run blocked", {
      description: firstBlockingIssue?.message || runDisabledReason,
    })
    if (firstBlockingIssue) {
      navigateToValidationIssue(firstBlockingIssue)
    }
  }, [navigateToValidationIssue, runDisabledReason, workflowValidation])

  const deleteLabel = workflowPath ? (workflow.name || "").trim() || deriveTitleFromPath(workflowPath) : "this flow"
  const controlGroupClass = "control-cluster flex items-center gap-1 rounded-lg p-1"
  const terminalResultOwnsPrimaryAction = outputSurfaceCommandState.useInNewFlow
    || (outputSurfaceCommandState.result && (
      shellState === "completed"
      || shellState === "failed"
      || shellState === "cancelled"
      || workflowReviewMode
    ))
  const showRunControls = (
    shellState === "idle"
    || shellState === "running"
    || shellState === "paused"
  ) && !terminalResultOwnsPrimaryAction
  const runShortcutEnabled = (shellState === "idle" || shellState === "ready") && !workflowReviewMode
  const reviewingHistory = workflowReviewMode && (shellState === "idle" || shellState === "ready")
  const macToolbarLeadingInset = desktopRuntime.platform === "macos" && desktopRuntime.titlebarHeight > 0 && !sidebarOpen
    ? 108
    : 0
  const shellBadgeLabel = reviewingHistory
    ? "Reviewing"
    : shellState === "blocked"
    ? "Blocked"
    : shellState === "running"
      ? runStatus === "starting"
        ? "Starting..."
        : runStatus === "cancelling"
          ? "Cancelling..."
          : "Running"
      : shellState === "paused"
        ? "Paused"
        : shellState === "completed"
          ? "Completed"
          : shellState === "failed"
            ? "Failed"
            : shellState === "cancelled"
              ? "Cancelled"
              : null
  const shellBadgeVariant = reviewingHistory
    ? "outline"
    : shellState === "blocked"
    ? "warning"
    : shellState === "running" || shellState === "paused"
      ? "info"
      : shellState === "completed"
        ? "success"
        : shellState === "failed"
          ? "destructive"
          : "outline"

  const flashToolbarStatus = useCallback((status: "saved" | "imported" | "exported") => {
    setSaveFlash(status)
    if (flashTimerRef.current) {
      window.clearTimeout(flashTimerRef.current)
    }
    flashTimerRef.current = window.setTimeout(() => {
      setSaveFlash(null)
      flashTimerRef.current = null
    }, 1800)
  }, [])

  const handlePrimarySave = useCallback(async () => {
    if (!workflowDirty || isSaving || isRunning) return

    setIsSaving(true)
    try {
      if (workflowPath) {
        const saved = await save()
        if (saved) flashToolbarStatus("saved")
        return
      }

      const saved = await saveAs()
      if (saved) flashToolbarStatus("saved")
    } finally {
      setIsSaving(false)
    }
  }, [flashToolbarStatus, isRunning, isSaving, save, saveAs, workflowDirty, workflowPath])

  const handleUndo = useCallback(() => {
    const restored = performUndo(workflow, undoStack, setUndoStack, setRedoStack)
    if (restored) {
      setCurrentWorkflow(restored)
    }
  }, [setCurrentWorkflow, setRedoStack, setUndoStack, undoStack, workflow])

  const handleRedo = useCallback(() => {
    const restored = performRedo(workflow, redoStack, setUndoStack, setRedoStack)
    if (restored) {
      setCurrentWorkflow(restored)
    }
  }, [redoStack, setCurrentWorkflow, setRedoStack, setUndoStack, workflow])

  const openFlowDefaults = useCallback(() => {
    if (runStatus !== "idle" || workflowReviewMode) return
    setViewMode("settings")
  }, [runStatus, setViewMode, workflowReviewMode])

  const toggleChatPanel = useCallback(() => {
    setChatOpen((open) => !open)
  }, [setChatOpen])

  const handleResumeRun = useCallback(async () => {
    if (!runId || runControlPending) return

    setRunControlPending("resume")
    try {
      const resumed = await window.api.resumeRun(runId)
      if (!resumed) {
        toastError("Could not resume run")
        return
      }
      setRunStatus("running")
      toast.success("Flow resumed")
    } catch (error) {
      toastErrorFromCatch("Could not resume run", error)
    } finally {
      setRunControlPending(null)
    }
  }, [runControlPending, runId, setRunStatus])

  const handlePauseRun = useCallback(async () => {
    if (!runId || runControlPending) return

    setRunControlPending("pause")
    try {
      const paused = await window.api.pauseRun(runId)
      if (!paused) {
        toastError("Could not pause run")
        return
      }
      setRunStatus("paused")
      toast.success("Paused", {
        description: "The current step will finish before the flow stops.",
      })
    } catch (error) {
      toastErrorFromCatch("Could not pause run", error)
    } finally {
      setRunControlPending(null)
    }
  }, [runControlPending, runId, setRunStatus])

  const handleActionMenu = async (value: WorkflowActionMenuAction) => {
    switch (value) {
      case "save_as":
        if (await saveAs()) {
          flashToolbarStatus("saved")
        }
        return
      case "export_copy":
        if (await exportCopy()) {
          flashToolbarStatus("exported")
        }
        return
      case "import":
        if (!(await confirmDiscard("import another flow", workflowDirty))) {
          return
        }
        if (await openFile()) {
          flashToolbarStatus("imported")
        }
        return
      case "refresh":
        await refreshProjectData()
        return
      case "templates":
        setMainView("templates")
        return
      case "blank":
        await createBlankWorkflow()
        return
      case "generate":
        openWorkflowCreate()
        return
      case "save_as_template":
        openTemplateDialog()
        return
      case "duplicate":
        if (workflowPath) {
          try {
            const newPath = await window.api.duplicateWorkflow(workflowPath)
            const loadedWorkflow = await window.api.loadWorkflow(newPath)
            setSelectedWorkflowPath(newPath)
            setCurrentWorkflow(loadedWorkflow)
            setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
            setSelectedInboxTaskKey(null)
            setSelectedPastRun(null)
            await refreshProjectData()
            toast.success("Flow duplicated")
          } catch (err) {
            toastErrorFromCatch("Failed to duplicate flow", err)
          }
        }
        return
      case "rename":
        openRenameDialog()
        return
      case "delete":
        if (workflowPath) {
          if (runStatus === "running" || runStatus === "starting" || runStatus === "cancelling" || runStatus === "paused") {
            toastError("Stop the flow before deleting it")
            return
          }
          setDeleteDialogOpen(true)
        }
        return
      default:
        return
    }
  }

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) {
        window.clearTimeout(flashTimerRef.current)
      }
    }
  }, [])

  useToolbarDesktopMenuState({
    runStatus,
    workflowReviewMode,
    isRunning,
    isSaving,
    workflowDirty,
    canUndo,
    canRedo,
    viewMode,
    flowSurfaceMode,
    chatOpen,
    runShortcutEnabled,
    canRun,
    canBatchRun,
    workflowPastRunsCount: workflowPastRuns.length,
    canRerunFromStep: outputSurfaceCommandState.rerunFromStep,
  })

  useToolbarCommandBindings({
    primaryModifierKey: desktopRuntime.primaryModifierKey,
    workflowDirty,
    workflowReviewMode,
    isRunning,
    runShortcutEnabled,
    canRun,
    canBatchRun,
    onSave: handlePrimarySave,
    onSaveAs: saveAs,
    onExport: exportCopy,
    onImport: () => handleActionMenu("import"),
    onUndo: handleUndo,
    onRedo: handleRedo,
    onOpenDefaults: openFlowDefaults,
    onToggleChat: toggleChatPanel,
    onRun: () => handleRunWithValidation("edit"),
    onRevealRunBlocker: revealRunBlocker,
    onCancel,
    onOpenBatch: () => setBatchOpen(true),
    onOpenSettings: () => setMainView("settings"),
  })

  return (
    <>
      <div className="border-b border-hairline bg-gradient-to-b from-surface-1/96 to-surface-1/84 shadow-[0_1px_0_hsl(var(--hairline)/0.7),0_2px_6px_hsl(var(--foreground)/0.04)] backdrop-blur-md">
        <div
          className="flex items-center gap-2 ui-content-gutter py-2 no-drag overflow-x-auto"
          style={macToolbarLeadingInset > 0
            ? { paddingLeft: `calc(var(--content-gutter) + ${macToolbarLeadingInset}px)` }
            : undefined}
        >
          <div className="min-w-[220px] flex-1 px-1">
            {shellState === "idle" ? (
              <>
                <Label htmlFor="toolbar-workflow-name" className="sr-only">Flow name</Label>
                <Input
                  id="toolbar-workflow-name"
                  type="text"
                  value={workflow.name || ""}
                  onChange={(event) => setCurrentWorkflow((prev) => ({ ...prev, name: event.target.value }), { coalesceKey: "workflow-name" })}
                  placeholder="Flow name"
                  className="h-auto min-w-0 border-none bg-transparent px-0 py-0 text-title-md font-semibold shadow-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                />
              </>
            ) : (
              <div className="truncate text-title-md font-semibold text-foreground">
                {workflow.name || entryTitle || "Untitled flow"}
              </div>
            )}
          </div>

          {workflowDirty && (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-status-warning"
              title={`Unsaved changes — ${primaryShortcutLabel}S to save`}
              aria-label={`Unsaved changes — ${primaryShortcutLabel}S to save`}
            />
          )}

          {(shellBadgeLabel || shellDetail) && (
            <div className="flex shrink-0 items-center gap-2">
              {shellBadgeLabel && (
                <Badge variant={shellBadgeVariant} className="ui-meta-text px-2.5 py-1">
                  {shellBadgeLabel}
                </Badge>
              )}
              {shellDetail ? (
                <span className="ui-meta-text tabular-nums whitespace-nowrap text-muted-foreground">
                  {shellDetail}
                </span>
              ) : null}
            </div>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {reviewingHistory && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => dispatchDesktopCommand("flow.run_again")}
              >
                New run
              </Button>
            )}

            {showRunControls && (
              <WorkflowRunControls
                controlGroupClass={controlGroupClass}
                isRunning={isRunning}
                isPaused={isPaused}
                isCancelling={isCancelling}
                isStarting={isStarting}
                runControlPending={runControlPending}
                runShortcutLabel={runShortcutLabel}
                canRun={canRun}
                runDisabledReason={runDisabledReason}
                canBatchRun={canBatchRun}
                onPause={() => void handlePauseRun()}
                onResume={() => void handleResumeRun()}
                onCancel={() => void onCancel()}
                onRun={(mode) => void handleRunWithValidation(mode)}
                onOpenBatch={() => setBatchOpen(true)}
              />
            )}

            <WorkflowPrimaryActions
              controlGroupClass={controlGroupClass}
              isRunning={isRunning}
              isSaving={isSaving}
              showSave={workflowDirty || isSaving || saveFlash === "saved"}
              saveFlash={saveFlash}
              primaryShortcutLabel={primaryShortcutLabel}
              chatOpen={chatOpen}
              chatShortcutLabel={chatShortcutLabel}
              agentToggleRef={agentToggleRef}
              actionMenuDisabled={isRunning}
              canManageCurrentFlow={Boolean(workflowPath)}
              canDeleteCurrentFlow={Boolean(workflowPath) && !isRunning}
              canDuplicateCurrentFlow={Boolean(workflowPath)}
              onSave={() => void handlePrimarySave()}
              onToggleChat={toggleChatPanel}
              onActionMenu={(action) => { void handleActionMenu(action) }}
            />
          </div>
        </div>
      </div>

      <WorkflowRunBlocker
        suppressed={shellState !== "idle"}
        isRunning={isRunning}
        workflowReviewMode={workflowReviewMode}
        runDisabledReason={runDisabledReason}
        workflowValidation={workflowValidation}
        hasBlockingErrors={hasBlockingErrors}
        showOpenSettingsAction={hasProviderRunBlock}
        onOpenSettings={() => setMainView("settings")}
        onNavigateToValidationIssue={navigateToValidationIssue}
      />

      <span className="sr-only">
        Keyboard shortcuts: {primaryShortcutLabel} Z to undo, {redoShortcutLabel} to redo, {primaryShortcutLabel} S to save, {runShortcutLabel} to run or stop, {chatShortcutLabel} to toggle Agent panel, {sidebarShortcutLabel} to show or hide the sidebar, {settingsShortcutLabel} to open settings, question mark to open shortcuts help.
      </span>

      <WorkflowToolbarDialogs
        renameDialogOpen={renameDialogOpen}
        onRenameDialogOpenChange={setRenameDialogOpen}
        renameInput={renameInput}
        onRenameInputChange={setRenameInput}
        onCommitRename={() => void commitRename()}
        deleteDialogOpen={deleteDialogOpen}
        onDeleteDialogOpenChange={setDeleteDialogOpen}
        deleteLabel={deleteLabel}
        workflowDirty={workflowDirty}
        onCommitDelete={() => void commitDelete()}
        templateDialogOpen={templateDialogOpen}
        onTemplateDialogOpenChange={setTemplateDialogOpen}
        templateNameInput={templateNameInput}
        onTemplateNameInputChange={setTemplateNameInput}
        onCommitSaveAsTemplate={() => void commitSaveAsTemplate()}
      />

      {unsavedChangesDialog}
    </>
  )
}
