import { useState } from "react"
import { Undo2, Trash2, PanelRightClose, Loader2 } from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/cn"
import { SingleDecisionDialog } from "@/components/ui/single-decision-dialog"

interface ChatHeaderProps {
  onClose: () => void
  onUndo: () => void
  onClear: () => void
  canUndo: boolean
  messageCount: number
  status: "idle" | "thinking" | "streaming" | "error"
  activeToolName: string | null
  title?: string
}

export function ChatHeader({
  onClose,
  onUndo,
  onClear,
  canUndo,
  messageCount,
  status,
  activeToolName,
  title = "Agent",
}: ChatHeaderProps) {
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const canUndoAction = canUndo && status === "idle"
  const canClearAction = messageCount > 0 && status === "idle"
  const statusLabel = status === "error"
    ? "Error"
    : activeToolName
      ? `Editing: ${activeToolName}`
      : status === "streaming"
        ? "Responding"
        : status === "thinking"
          ? "Thinking"
          : null

  return (
    <div className="surface-depth-header flex items-center gap-2 px-3 py-2 backdrop-blur-sm">
      <span className="text-body-sm font-semibold text-foreground flex-1">{title}</span>

      {statusLabel && (
        <span
          key={statusLabel}
          role="status"
          aria-live="polite"
          className={cn(
            "ui-status-badge ui-meta-text max-w-[170px] truncate ui-fade-slide-in-trailing",
            status === "error"
              ? "ui-status-badge-danger"
              : "ui-status-badge-info",
          )}
        >
          {status === "error" ? (
            <span className="font-semibold">!</span>
          ) : (
            <Loader2 size={11} className="animate-spin" />
          )}
          <span className="truncate" title={statusLabel}>{statusLabel}</span>
        </span>
      )}

      {messageCount > 0 && (
        <span
          className="ui-meta-text text-muted-foreground/50 tabular-nums"
          aria-label={`${messageCount} messages`}
        >
          {messageCount}
        </span>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndoAction}
            aria-label="Undo last change"
            className="ui-icon-button"
          >
            <Undo2 size={13} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Undo last change</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setConfirmClearOpen(true)}
            disabled={!canClearAction}
            aria-label="Clear Agent history"
            className="ui-icon-button"
          >
            <Trash2 size={13} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Clear Agent history</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Agent panel"
            className="ui-icon-button"
          >
            <PanelRightClose size={13} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Close Agent panel</TooltipContent>
      </Tooltip>

      <SingleDecisionDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title="Clear Agent history?"
        description="Clear the current conversation?"
        note="This cannot be undone."
        noteTone="danger"
        confirmLabel="Clear"
        onConfirm={onClear}
        confirmVariant="destructive"
      />
    </div>
  )
}
