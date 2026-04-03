import {
  useMemo,
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from "react"
import { useAtom, useAtomValue } from "jotai"
import { ChevronDown, Ellipsis, Folder, Send, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PromptComposer } from "@/components/ui/prompt-composer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  chatDraftByWorkflowAtom,
  currentWorkflowAtom,
  defaultProviderAtom,
  desktopRuntimeAtom,
  globalDetailBudgetAtom,
  providerSettingsAtom,
  selectedProjectAtom,
  selectedResultModeIdAtom,
  selectedWorkflowPathAtom,
  selectedWorkflowTemplateContextAtom,
  workflowEntryStateAtom,
} from "@/lib/store"
import {
  runStatusAtom,
  selectedWorkflowExecutionAtom,
} from "@/features/execution"
import { WorkflowExecutionController } from "@/features/execution/controller"
import { currentFlowChatMessagesAtom } from "@/features/execution/flow-chat-state"
import {
  isShortcutConsumed,
  matchesPrimaryShortcut,
} from "@/lib/keyboard-shortcuts"
import { ProviderSelect } from "@/components/provider-controls"
import {
  applyWorkflowDetailBudget,
  DETAIL_BUDGET_PRESETS,
  getDetailBudgetPresetById,
  resolveDetailBudgetPreset,
} from "@/lib/workflow-detail-budget"
import type { CreateEntryHelpModeHint } from "@shared/types"
import { RESULT_MODES, getResultMode } from "@/lib/result-modes"
import { projectFolderName } from "@/components/sidebar/projectSidebarUtils"

interface ChatInputProps {
  onSend: (
    message: string,
    helpModeHint?: CreateEntryHelpModeHint | null,
  ) => void
  onCancel: () => void
  isStreaming?: boolean
  /** When true, show the cancel button (covers both streaming and routing). */
  isCancellable?: boolean
  autoFocus?: boolean
  /** Flow completed — either in-memory or from past runs on disk. */
  effectivelyDone?: boolean
}

export function ChatInput({
  onSend,
  onCancel,
  isStreaming,
  isCancellable,
  autoFocus = false,
  effectivelyDone = false,
}: ChatInputProps) {
  const [value, setValue] = useState("")
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [selectedResultModeId, setSelectedResultModeId] = useAtom(
    selectedResultModeIdAtom,
  )
  const selectedProject = useAtomValue(selectedProjectAtom)
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const [globalDetailBudget, setGlobalDetailBudget] = useAtom(
    globalDetailBudgetAtom,
  )
  const [defaultProvider] = useAtom(defaultProviderAtom)
  const [providerSettings] = useAtom(providerSettingsAtom)
  const [chatDraftByWorkflow, setChatDraftByWorkflow] = useAtom(
    chatDraftByWorkflowAtom,
  )
  const desktopRuntime = useAtomValue(desktopRuntimeAtom)
  const templateContext = useAtomValue(selectedWorkflowTemplateContextAtom)
  const entryState = useAtomValue(workflowEntryStateAtom)
  const runStatus = useAtomValue(runStatusAtom)
  const executionState = useAtomValue(selectedWorkflowExecutionAtom)
  const flowMessages = useAtomValue(currentFlowChatMessagesAtom)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const activeWorkflowDraft = selectedWorkflowPath
    ? chatDraftByWorkflow[selectedWorkflowPath] || ""
    : ""
  const sendShortcutLabel = `${desktopRuntime.primaryModifierLabel}↵`
  const sendShortcutAriaLabel =
    desktopRuntime.primaryModifierKey === "meta"
      ? "Command Enter"
      : "Control Enter"
  const activeProvider = workflow.defaults?.provider || defaultProvider
  const detailBudget = workflow.defaults?.detailBudget ?? globalDetailBudget
  const selectedDetailBudgetPreset = resolveDetailBudgetPreset(detailBudget)
  const isDone = runStatus === "done" || effectivelyDone
  const placeholder =
    runStatus === "idle" &&
    selectedWorkflowPath &&
    !effectivelyDone &&
    entryState?.awaitingInput
      ? "Describe what you need \u2014 your message starts the flow..."
      : runStatus === "idle" && selectedWorkflowPath && !effectivelyDone
        ? "Add input to run this flow..."
        : !selectedWorkflowPath || isDone
          ? "Start a new flow or follow up on the results..."
          : "Send a message to refine this running flow..."
  useEffect(() => {
    if (!selectedWorkflowPath) {
      setValue("")
      return
    }
    setValue(activeWorkflowDraft)
  }, [activeWorkflowDraft, selectedWorkflowPath])

  const selectedResultMode = useMemo(
    () => getResultMode(selectedResultModeId),
    [selectedResultModeId],
  )
  const projectName = useMemo(
    () => (selectedProject ? projectFolderName(selectedProject) : null),
    [selectedProject],
  )

  // Live elapsed timer for running state
  const [elapsed, setElapsed] = useState<string | null>(null)
  const progressMsg = useMemo(
    () =>
      [...flowMessages].reverse().find((m) => m.content.type === "progress"),
    [flowMessages],
  )
  const progressData =
    progressMsg?.content.type === "progress"
      ? progressMsg.content.data
      : undefined

  useEffect(() => {
    const startedAt = progressData?.startedAt
    if (!startedAt || runStatus !== "running") {
      setElapsed(null)
      return
    }
    const fmt = (ts: number) => {
      const s = Math.round((Date.now() - ts) / 1000)
      return s < 60 ? `${s}s` : `${Math.round(s / 60)}m`
    }
    setElapsed(fmt(startedAt))
    const interval = setInterval(() => setElapsed(fmt(startedAt)), 1_000)
    return () => clearInterval(interval)
  }, [progressData?.startedAt, runStatus])

  const statusHeader = useMemo((): ReactNode => {
    if (runStatus === "running" && progressData && !progressData.collapsed) {
      const doneCount = progressData.steps.filter(
        (s) => s.status === "done",
      ).length
      const totalCount = progressData.steps.length
      const runningStep = progressData.steps.find((s) => s.status === "running")
      return (
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full bg-status-info animate-pulse shrink-0"
            aria-hidden="true"
          />
          <span className="flex-1 min-w-0 truncate text-body-sm text-foreground">
            {runningStep?.label ?? "Running\u2026"}
          </span>
          <span className="shrink-0 ui-meta-text text-muted-foreground whitespace-nowrap">
            {doneCount}/{totalCount} steps{elapsed ? ` \u00b7 ${elapsed}` : ""}
          </span>
        </div>
      )
    }

    if (isDone) {
      const flowName = executionState.workflowName || workflow?.name || "Flow"
      const doneCount = progressData?.steps.filter(
        (s) => s.status === "done",
      ).length
      const totalCount = progressData?.steps.length
      const hasSteps = totalCount != null && totalCount > 0
      let durationStr: string | null = null
      if (executionState.completedAt && executionState.runStartedAt) {
        const seconds = Math.round(
          (executionState.completedAt - executionState.runStartedAt) / 1000,
        )
        durationStr =
          seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)}m`
      }
      return (
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full bg-status-success shrink-0"
            aria-hidden="true"
          />
          <span className="flex-1 min-w-0 truncate text-body-sm text-foreground">
            {flowName}
          </span>
          <span className="shrink-0 ui-meta-text text-muted-foreground whitespace-nowrap">
            {hasSteps ? `${doneCount}/${totalCount} steps` : ""}
            {durationStr ? `${hasSteps ? " · " : ""}${durationStr}` : ""}
          </span>
        </div>
      )
    }

    return null
  }, [runStatus, isDone, progressData, elapsed, executionState, workflow?.name])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || isStreaming || isCancellable) return
    onSend(trimmed)
    setValue("")
    if (selectedWorkflowPath) {
      setChatDraftByWorkflow((prev) => ({
        ...prev,
        [selectedWorkflowPath]: "",
      }))
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [
    isCancellable,
    isStreaming,
    onSend,
    selectedWorkflowPath,
    setChatDraftByWorkflow,
    value,
  ])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isShortcutConsumed(e.nativeEvent)) return
    if (
      matchesPrimaryShortcut(e, {
        key: "Enter",
        primaryModifierKey: desktopRuntime.primaryModifierKey,
      })
    ) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === "Escape" && (isStreaming || isCancellable)) {
      e.preventDefault()
      onCancel()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = e.target.value
    setValue(nextValue)
    if (selectedWorkflowPath) {
      setChatDraftByWorkflow((prev) => ({
        ...prev,
        [selectedWorkflowPath]: nextValue,
      }))
    }
  }

  const handleDetailBudgetChange = (value: string) => {
    const nextPreset = getDetailBudgetPresetById(value)
    if (!nextPreset) return
    setGlobalDetailBudget(nextPreset.value)
    setWorkflow((prev) => applyWorkflowDetailBudget(prev, nextPreset.value))
  }

  return (
    <div className="max-w-3xl mx-auto w-full shrink-0 px-4 pb-4 pt-2">
      {statusHeader &&
        !(
          WorkflowExecutionController.USE_STEP_NARRATIVES &&
          runStatus !== "idle"
        ) && (
          <div className="mb-1.5 ui-inset-well rounded-2xl px-4 py-2.5 ui-fade-slide-in">
            {statusHeader}
          </div>
        )}
      <PromptComposer
        ref={textareaRef}
        id="chat-input"
        aria-label="Message input"
        aria-busy={isStreaming}
        autoFocus={autoFocus}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        spellCheck
        autoCorrect="on"
        maxHeight={200}
        shellClassName="rounded-2xl"
        textareaClassName="min-h-0"
        action={
          isStreaming || isCancellable ? (
            <button
              type="button"
              onClick={onCancel}
              aria-label={isStreaming ? "Cancel generation" : "Cancel"}
              title="Cancel (Esc)"
              className="ui-icon-button h-control-lg w-control-lg rounded-full bg-surface-2 ui-fade-slide-in"
            >
              <Square size={14} aria-hidden="true" />
            </button>
          ) : (
            <Button
              type="button"
              onClick={handleSend}
              disabled={!value.trim() || isStreaming || isCancellable}
              aria-label="Send message"
              title={`Send (${sendShortcutLabel})`}
              className="h-control-lg w-control-lg rounded-full"
              variant="send"
              size="icon"
            >
              <Send size={16} aria-hidden="true" />
            </Button>
          )
        }
        toolbar={
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="gap-1.5 text-muted-foreground"
                >
                  <span aria-hidden>{selectedResultMode.emoji}</span>
                  {selectedResultMode.label}
                  <ChevronDown size={12} aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {RESULT_MODES.map((mode) => (
                  <DropdownMenuItem
                    key={mode.id}
                    onSelect={() => setSelectedResultModeId(mode.id)}
                  >
                    <span className="mr-2" aria-hidden>
                      {mode.emoji}
                    </span>
                    {mode.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <ProviderSelect
              value={activeProvider}
              onValueChange={(provider) =>
                setWorkflow((prev) => ({
                  ...prev,
                  defaults: {
                    ...(prev.defaults || {}),
                    provider,
                  },
                }))
              }
              codexEnabled={providerSettings.features.codexProvider}
              labelMode="short"
              className="h-control-sm w-32 rounded-md border-0 bg-surface-2 shadow-none"
            />
            {projectName && (
              <span className="ui-meta-text flex items-center gap-1 text-muted-foreground truncate max-w-32">
                <Folder size={11} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{projectName}</span>
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground"
                  aria-label="More options"
                >
                  <Ellipsis size={15} aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Exploration depth</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={selectedDetailBudgetPreset.id}
                  onValueChange={handleDetailBudgetChange}
                >
                  {DETAIL_BUDGET_PRESETS.map((preset) => (
                    <DropdownMenuRadioItem key={preset.id} value={preset.id}>
                      {preset.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />
      <span className="sr-only">
        Press {sendShortcutAriaLabel} to send, Enter for a new line, Escape to
        cancel generation
      </span>
    </div>
  )
}
