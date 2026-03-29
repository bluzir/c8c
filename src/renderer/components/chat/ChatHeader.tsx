import { useState } from "react"
import { Undo2, Trash2, PanelRightClose, Loader2 } from "lucide-react"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
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
  showClose?: boolean
}

export function ChatHeader({
  onClose,
  onUndo,
  onClear,
  canUndo,
  messageCount,
  status,
  activeToolName,
  title = "Thread",
  showClose = true,
}: ChatHeaderProps) {
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const canUndoAction = canUndo && status === "idle"
  const canClearAction = messageCount > 0 && status === "idle"
  const statusLabel =
    status === "error"
      ? "Error"
      : activeToolName
        ? "Editing\u2026"
        : status === "streaming"
          ? "Responding"
          : status === "thinking"
            ? "Thinking"
            : null

  return (
    <div className="surface-depth-header flex items-center gap-2 px-3 py-2">
      <span className="text-body-sm font-semibold text-foreground flex-1">
        {title}
      </span>

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
          <span className="truncate" title={statusLabel}>
            {statusLabel}
          </span>
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
            aria-label="Clear thread history"
            className="ui-icon-button"
          >
            <Trash2 size={13} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Clear thread history</TooltipContent>
      </Tooltip>

      {showClose && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              className="ui-icon-button"
            >
              <PanelRightClose size={13} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Close panel</TooltipContent>
        </Tooltip>
      )}

      <SingleDecisionDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title="Clear thread history?"
        description={
          messageCount > 0
            ? `Clear ${messageCount} message${messageCount === 1 ? "" : "s"}?`
            : "Clear the current thread?"
        }
        note="This cannot be undone."
        noteTone="danger"
        confirmLabel="Clear"
        onConfirm={onClear}
        confirmVariant="destructive"
      />
    </div>
  )
}
