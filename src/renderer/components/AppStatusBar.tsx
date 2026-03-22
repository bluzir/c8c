import { useEffect, useMemo, useState } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  activeExecutionProviderAtom,
  batchDialogOpenAtom,
  batchProgressAtom,
  batchStatusAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  desktopRuntimeAtom,
  defaultProviderAtom,
  multiRunDashboardOpenAtom,
  currentWorkflowAtom,
} from "@/lib/store"
import {
  activeNodeIdAtom,
  nodeStatesAtom,
  runOutcomeAtom,
  runStartedAtAtom,
  runStatusAtom,
  runtimeMetaAtom,
  runtimeNodesAtom,
  toWorkflowExecutionKey,
  workflowExecutionStatesAtom,
} from "@/features/execution"
import { cn } from "@/lib/cn"
import { buildRunProgressSummary } from "@/lib/run-progress"
import { PROVIDER_LABELS } from "@shared/provider-metadata"
import { Activity, GitBranch, Keyboard, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { isEditableKeyboardTarget } from "@/lib/keyboard-shortcuts"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

function folderName(projectPath: string | null) {
  if (!projectPath) return null
  return projectPath.split("/").pop() || projectPath
}

function isRunInFlight(status: string) {
  return status === "starting" || status === "running" || status === "paused" || status === "cancelling"
}

function isDashboardVisibleState(state: { runStatus: string; runOutcome?: string | null; workspace?: string | null; reportPath?: string | null; finalContent?: string; lastError?: string | null; nodeStates?: Record<string, unknown> }) {
  return isRunInFlight(state.runStatus)
    || !!state.runOutcome
    || !!state.workspace
    || !!state.reportPath
    || !!state.lastError
    || !!state.finalContent?.trim()
    || Object.keys(state.nodeStates || {}).length > 0
}

export function AppStatusBar() {
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [desktopRuntime] = useAtom(desktopRuntimeAtom)
  const [batchStatus] = useAtom(batchStatusAtom)
  const [batchProgress] = useAtom(batchProgressAtom)
  const [defaultProvider] = useAtom(defaultProviderAtom)
  const [activeExecutionProvider] = useAtom(activeExecutionProviderAtom)
  const [runStatus] = useAtom(runStatusAtom)
  const [runOutcome] = useAtom(runOutcomeAtom)
  const [runStartedAt] = useAtom(runStartedAtAtom)
  const [nodeStates] = useAtom(nodeStatesAtom)
  const [activeNodeId] = useAtom(activeNodeIdAtom)
  const [runtimeMeta] = useAtom(runtimeMetaAtom)
  const [workflow] = useAtom(currentWorkflowAtom)
  const [runtimeNodes] = useAtom(runtimeNodesAtom)
  const [workflowExecutionStates] = useAtom(workflowExecutionStatesAtom)
  const setMultiRunDashboardOpen = useSetAtom(multiRunDashboardOpenAtom)
  const setBatchDialogOpen = useSetAtom(batchDialogOpenAtom)
  // undefined = loading, null = no git, string = branch name
  const [branch, setBranch] = useState<string | null | undefined>(undefined)
  const [elapsed, setElapsed] = useState("")
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false)

  useEffect(() => {
    if (!runStartedAt || (runStatus !== "running" && runStatus !== "starting" && runStatus !== "cancelling")) {
      setElapsed("")
      return
    }
    const tick = () => {
      const delta = Math.floor((Date.now() - runStartedAt) / 1000)
      const m = Math.floor(delta / 60)
      const s = delta % 60
      setElapsed(m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`)
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [runStartedAt, runStatus])
  const primaryShortcutLabel = desktopRuntime.primaryModifierLabel
  const runShortcutLabel = `${primaryShortcutLabel}↵`
  const commandPaletteShortcutLabel = `${primaryShortcutLabel}K`
  const newProcessShortcutLabel = `${primaryShortcutLabel}N`
  const chatShortcutLabel = `${primaryShortcutLabel}⇧K`
  const sidebarShortcutLabel = `${primaryShortcutLabel}B`
  const settingsShortcutLabel = `${primaryShortcutLabel},`
  const redoShortcutLabel = `${primaryShortcutLabel}⇧Z`
  const selectedWorkflowKey = toWorkflowExecutionKey(selectedWorkflowPath)
  const trackedRunCount = Object.values(workflowExecutionStates).filter(isDashboardVisibleState).length
  const isBatchRunning = batchStatus === "running"
  const workflowProvider = workflow.defaults?.provider || defaultProvider
  const displayedProvider = isRunInFlight(runStatus) ? activeExecutionProvider : workflowProvider
  const backgroundRunCount = Object.entries(workflowExecutionStates).reduce((count, [workflowKey, state]) => {
    if (!isRunInFlight(state.runStatus) || workflowKey === selectedWorkflowKey) return count
    return count + 1
  }, 0)
  const runSummary = useMemo(() => buildRunProgressSummary({
    workflow,
    runtimeNodes,
    runtimeMeta,
    nodeStates,
    runStatus,
    runOutcome,
    activeNodeId,
  }), [activeNodeId, nodeStates, runOutcome, runStatus, runtimeMeta, runtimeNodes, workflow])
  const progressLabel = runSummary.branchLabel || (
    runSummary.totalSteps > 0
      ? `${Math.min(runSummary.completedSteps, runSummary.totalSteps)}/${runSummary.totalSteps}`
      : null
  )
  const progressDetail = [
    runSummary.activeStepLabel,
    progressLabel,
    elapsed || null,
  ].filter((value): value is string => Boolean(value)).join(" · ")
  const showRunProgress = runStatus !== "idle" && (runSummary.totalSteps > 0 || runStatus === "starting" || runStatus === "cancelling")
  const runPhaseLabel = runStatus === "starting"
    ? "connecting to CLI..."
    : runStatus === "cancelling"
      ? "stopping..."
      : runStatus === "paused"
        ? "paused"
        : runStatus === "running"
          ? runSummary.waitingApprovalSteps > 0
            ? "waiting for input"
            : runSummary.failedSteps > 0
              ? "errors detected"
              : runSummary.runningSteps > 0
                ? "running"
                : "waiting"
          : runStatus === "done"
            ? runOutcome === "cancelled" || runOutcome === "interrupted"
              ? "stopped"
              : "completed"
            : "failed"
  const runProgressClass = runStatus === "done"
    ? runOutcome === "cancelled" || runOutcome === "interrupted"
      ? "ui-status-badge-warning"
      : "ui-status-badge-success"
    : runStatus === "error"
      ? "ui-status-badge-danger"
      : runStatus === "paused"
        ? "ui-status-badge-warning"
        : runSummary.failedSteps > 0
          ? "ui-status-badge-danger"
        : runSummary.waitingApprovalSteps > 0
          ? "ui-status-badge-warning"
          : "ui-status-badge-info"

  useEffect(() => {
    if (!selectedProject) {
      setBranch(null)
      return
    }
    let cancelled = false
    setBranch(undefined)
    window.api.getProjectStatus(selectedProject).then((status) => {
      if (cancelled) return
      setBranch(status.branch)
    }).catch(console.error)
    return () => {
      cancelled = true
    }
  }, [selectedProject])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isEditable = isEditableKeyboardTarget(event.target as HTMLElement | null)

      if (
        !event.metaKey
        && !event.ctrlKey
        && !event.altKey
        && !isEditable
        && (event.key === "?" || (event.key === "/" && event.shiftKey))
      ) {
        event.preventDefault()
        setShortcutsDialogOpen((open) => !open)
      }
    }

    window.addEventListener("keydown", handler)
    return () => {
      window.removeEventListener("keydown", handler)
    }
  }, [])

  return (
    <>
      <footer
        aria-label="Application status bar"
        className="surface-depth-footer h-control-sm shrink-0"
      >
        <div className="h-full px-6 flex items-center justify-between ui-meta-text text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="control-badge border border-hairline bg-surface-1/70 text-muted-foreground">
              {PROVIDER_LABELS[displayedProvider]}
            </span>
            {selectedProject ? (
              <span className="control-badge max-w-56 truncate border border-hairline bg-surface-1/70 text-muted-foreground">
                {folderName(selectedProject)}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            {showRunProgress && (
              <span
                role="status"
                aria-live="polite"
                className={cn(
                  "ui-status-badge h-control-xs gap-1.5 px-2",
                  runProgressClass,
                )}
              >
                {(runStatus === "running" || runStatus === "starting" || runStatus === "cancelling") && <Loader2 size={11} className="animate-spin" aria-hidden="true" />}
                <span className="text-current/80">{runPhaseLabel}</span>
                {progressDetail && <span className="ui-meta-text text-current/70">{progressDetail}</span>}
              </span>
            )}
            {backgroundRunCount > 0 && (
              <span className="ui-status-badge ui-status-badge-info h-control-xs px-2">
                {backgroundRunCount} run{backgroundRunCount === 1 ? "" : "s"} in background
              </span>
            )}
            {isBatchRunning && (
              <Button
                variant="ghost"
                size="xs"
                className="gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setBatchDialogOpen(true)}
              >
                <Loader2 size={12} className="animate-spin" />
                Batch
                <span className="tabular-nums">
                  {batchProgress.completed}/{batchProgress.total}
                </span>
              </Button>
            )}
            {trackedRunCount > 0 && (
              <Button
                variant="ghost"
                size="xs"
                className="gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setMultiRunDashboardOpen(true)}
              >
                <Activity size={12} />
                Runs
                <span className="tabular-nums">{trackedRunCount}</span>
              </Button>
            )}
            {selectedProject && typeof branch === "string" && branch.length > 0 && (
              <span className="control-badge gap-2 border border-hairline bg-surface-1/70 text-muted-foreground">
                <GitBranch size={12} aria-hidden="true" />
                {branch}
              </span>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="ui-icon-button"
                  onClick={() => setShortcutsDialogOpen(true)}
                  aria-label="Open keyboard shortcuts"
                >
                  <Keyboard size={13} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </footer>

      <Dialog open={shortcutsDialogOpen} onOpenChange={setShortcutsDialogOpen}>
        <CanvasDialogContent showCloseButton={false}>
          <CanvasDialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>High-value commands across the shell and active flow.</DialogDescription>
          </CanvasDialogHeader>
          <CanvasDialogBody>
            <div className="space-y-2">
              {[
                { keys: commandPaletteShortcutLabel, label: "Open command palette / quick switch" },
                { keys: `${primaryShortcutLabel}1…5`, label: "Quick-switch flows" },
                { keys: newProcessShortcutLabel, label: "Start a new flow" },
                { keys: `${primaryShortcutLabel}⇧S`, label: "Attach a skill to the current flow" },
                { keys: `A / ${primaryShortcutLabel}⇧A`, label: "Add a skill step in the active editor" },
                { keys: "↑ / ↓ / Home / End", label: "Move selection through steps in list view" },
                { keys: "Alt+↑ / Alt+↓", label: "Move the selected step in list view" },
                { keys: "Delete", label: "Remove the selected step or connection" },
                { keys: `${primaryShortcutLabel}Z`, label: "Undo last structural change" },
                { keys: redoShortcutLabel, label: "Redo last undone change" },
                { keys: `${primaryShortcutLabel}S`, label: "Save current flow" },
                { keys: runShortcutLabel, label: isRunInFlight(runStatus) ? "Stop current run" : "Run current flow" },
                { keys: chatShortcutLabel, label: "Toggle Agent panel" },
                { keys: sidebarShortcutLabel, label: "Show or hide the sidebar" },
                { keys: settingsShortcutLabel, label: "Open global settings" },
                { keys: "?", label: "Open this shortcuts guide" },
              ].map((shortcut) => (
                <div
                  key={shortcut.keys}
                  className="surface-inset-card flex items-center justify-between gap-4 px-3 py-2"
                >
                  <span className="text-body-sm text-foreground">{shortcut.label}</span>
                  <code className="inline-code">
                    {shortcut.keys}
                  </code>
                </div>
              ))}
            </div>
          </CanvasDialogBody>
          <CanvasDialogFooter>
            <DialogClose asChild>
              <Button size="sm">Close</Button>
            </DialogClose>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>
    </>
  )
}
