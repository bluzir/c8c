import { useEffect, useState } from "react"
import { useAtom, useAtomValue } from "jotai"
import { File, History, Plus, Type, X } from "lucide-react"

import {
  defaultProviderAtom,
  inputAttachmentsAtom,
  inputValueAtom,
  providerSettingsAtom,
  selectedWorkflowPathAtom,
} from "@/lib/store"
import { cn } from "@/lib/cn"
import { resolveWorkflowInput } from "@/lib/input-type"
import {
  getDefaultModelForProvider,
  modelLooksCompatible,
} from "@shared/provider-metadata"
import type { InputNodeConfig } from "@shared/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FilePicker } from "@/components/input/FilePicker"
import {
  ProviderModelSelect,
  ProviderSelect,
} from "@/components/provider-controls"
import { RunPicker } from "@/components/input/RunPicker"
import { TextAttachmentEditor } from "@/components/input/TextAttachmentEditor"
import { Textarea } from "@/components/ui/textarea"
import { useWorkflowWithUndo } from "@/hooks/useWorkflowWithUndo"

export function NodeCardInlineInput({
  nodeId,
  inputConfig,
}: {
  nodeId: string
  inputConfig: InputNodeConfig
}) {
  const { workflow, setWorkflow } = useWorkflowWithUndo()
  const [inputValue, setInputValue] = useAtom(inputValueAtom)
  const [attachments, setAttachments] = useAtom(inputAttachmentsAtom)
  const defaultProvider = useAtomValue(defaultProviderAtom)
  const providerSettings = useAtomValue(providerSettingsAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [inputTouched, setInputTouched] = useState(false)
  const [filePickerOpen, setFilePickerOpen] = useState(false)
  const [runPickerOpen, setRunPickerOpen] = useState(false)
  const [textEditorOpen, setTextEditorOpen] = useState(false)
  const [editingTextIndex, setEditingTextIndex] = useState<number | undefined>(
    undefined,
  )

  const workflowProvider = workflow.defaults?.provider || defaultProvider
  const workflowModel =
    workflow.defaults?.model || getDefaultModelForProvider(workflowProvider)
  const resolvedInput = resolveWorkflowInput(inputValue, {
    inputType: inputConfig.inputType,
    required: inputConfig.required,
    defaultValue: inputConfig.defaultValue,
  })
  const inputTypeLabel = !resolvedInput.value.trim()
    ? "—"
    : resolvedInput.type === "url"
      ? "URL"
      : resolvedInput.type === "directory"
        ? "Directory"
        : "Text"
  const showInlineInputError = inputTouched && !resolvedInput.valid
  const inlineInputPlaceholder =
    inputConfig.placeholder ||
    "Enter your input text, paste a URL, or describe what to run..."

  useEffect(() => {
    setInputTouched(false)
  }, [selectedWorkflowPath, nodeId])

  const updateWorkflowDefaults = (patch: Record<string, unknown>) => {
    setWorkflow(
      (prev) => ({
        ...prev,
        defaults: {
          ...(prev.defaults || {}),
          ...patch,
        },
      }),
      { coalesceKey: "workflow-defaults:node-card" },
    )
  }

  return (
    <div className="ui-section-divider px-2.5 py-2 space-y-1.5">
      <Textarea
        id={`run-input-${nodeId}`}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={() => setInputTouched(true)}
        rows={2}
        placeholder={inlineInputPlaceholder}
        aria-label="Flow input"
        aria-invalid={showInlineInputError || undefined}
        aria-describedby={
          showInlineInputError ? `run-input-error-${nodeId}` : undefined
        }
        className="min-h-[3rem] max-h-[10rem] resize-y bg-surface-2/90 text-body-sm"
      />
      {showInlineInputError && (
        <p
          id={`run-input-error-${nodeId}`}
          className="text-label-xs text-status-danger"
        >
          {resolvedInput.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1">
        {attachments.map((att, i) => (
          <Badge
            key={`${att.kind}-${i}`}
            variant="outline"
            className="gap-1 pl-1.5 pr-1 py-0.5 max-w-[180px] cursor-default text-label-xs"
          >
            {att.kind === "file" && (
              <File
                size={10}
                className="flex-shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            {att.kind === "run" && (
              <History
                size={10}
                className="flex-shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            {att.kind === "text" && (
              <Type
                size={10}
                className="flex-shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <span
              className={cn(
                "truncate",
                att.kind === "text" &&
                  "cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-ring/20",
              )}
              title={
                att.kind === "file"
                  ? att.path
                  : att.kind === "run"
                    ? `${att.workflowName} (${att.runId.slice(0, 8)})`
                    : att.label
              }
              onClick={
                att.kind === "text"
                  ? () => {
                      setEditingTextIndex(i)
                      setTextEditorOpen(true)
                    }
                  : undefined
              }
              role={att.kind === "text" ? "button" : undefined}
              tabIndex={att.kind === "text" ? 0 : undefined}
              aria-label={att.kind === "text" ? `Edit ${att.label}` : undefined}
              onKeyDown={
                att.kind === "text"
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        setEditingTextIndex(i)
                        setTextEditorOpen(true)
                      }
                    }
                  : undefined
              }
            >
              {att.kind === "file" && att.name}
              {att.kind === "run" && att.workflowName}
              {att.kind === "text" && att.label}
            </span>
            <button
              type="button"
              onClick={() =>
                setAttachments((prev) => prev.filter((_, idx) => idx !== i))
              }
              className="ml-0.5 rounded-sm p-0.5 text-muted-foreground hover:text-foreground hover:bg-surface-3 ui-transition-colors ui-motion-fast"
              aria-label={`Remove ${att.kind === "file" ? att.name : att.kind === "run" ? att.workflowName : att.label}`}
            >
              <X size={8} aria-hidden="true" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="control-cluster control-cluster-compact flex flex-wrap items-center gap-1">
        <div className="flex flex-wrap items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                className="control-pill-compact w-control-xs border-hairline bg-surface-1/85 text-muted-foreground hover:bg-surface-1 hover:text-foreground"
                aria-label="Attach context"
              >
                <Plus size={12} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => setFilePickerOpen(true)}>
                <File size={13} className="mr-2" />
                Attach file
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setRunPickerOpen(true)}>
                <History size={13} className="mr-2" />
                Attach run output
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setEditingTextIndex(undefined)
                  setTextEditorOpen(true)
                }}
              >
                <Type size={13} className="mr-2" />
                Add text snippet
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ProviderSelect
            id={`workflow-provider-${nodeId}`}
            value={workflowProvider}
            onValueChange={(provider) =>
              updateWorkflowDefaults({
                provider,
                model: modelLooksCompatible(provider, workflow.defaults?.model)
                  ? workflow.defaults?.model
                  : getDefaultModelForProvider(provider),
              })
            }
            codexEnabled={providerSettings.features.codexProvider}
            labelMode="short"
            className="control-pill-compact w-[96px] border-hairline bg-surface-1/85"
            ariaLabel="Flow provider"
          />
          <ProviderModelSelect
            id={`workflow-model-${nodeId}`}
            provider={workflowProvider}
            value={workflowModel}
            onValueChange={(model) => updateWorkflowDefaults({ model })}
            className="control-pill-compact w-[118px] border-hairline bg-surface-1/85 tabular-nums"
            ariaLabel="Flow model"
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Badge
            variant="outline"
            size="compact"
            className="control-badge control-badge-compact rounded-full border-hairline bg-surface-1/80"
          >
            Type: {inputTypeLabel}
          </Badge>
        </div>
      </div>
      <FilePicker open={filePickerOpen} onOpenChange={setFilePickerOpen} />
      <RunPicker open={runPickerOpen} onOpenChange={setRunPickerOpen} />
      <TextAttachmentEditor
        open={textEditorOpen}
        onOpenChange={setTextEditorOpen}
        editIndex={editingTextIndex}
      />
    </div>
  )
}
