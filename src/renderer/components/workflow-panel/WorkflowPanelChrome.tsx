import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/cn"
import type { ExecutionRunStatus } from "@/lib/workflow-execution"

export type WorkflowPanelShellState =
  | "idle"
  | "ready"
  | "blocked"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"

function shellBadgeVariant(state: WorkflowPanelShellState) {
  switch (state) {
    case "blocked":
      return "warning" as const
    case "running":
      return "info" as const
    case "paused":
      return "info" as const
    case "completed":
      return "success" as const
    case "failed":
      return "destructive" as const
    case "cancelled":
      return "outline" as const
    default:
      return "outline" as const
  }
}

function shellBadgeLabel(
  state: WorkflowPanelShellState,
  runStatus: ExecutionRunStatus,
) {
  switch (state) {
    case "blocked":
      return "Blocked"
    case "running":
      return runStatus === "starting"
        ? "Starting..."
        : runStatus === "cancelling"
          ? "Cancelling..."
          : "Running"
    case "paused":
      return "Paused"
    case "completed":
      return "Completed"
    case "failed":
      return "Failed"
    case "cancelled":
      return "Cancelled"
    default:
      return null
  }
}

export function WorkflowOpenLoadingState({ flowLabel }: { flowLabel: string }) {
  return (
    <div className="flex-1 min-h-0 flex items-center justify-center px-[var(--content-gutter)]">
      <div className="w-full max-w-xl px-2 py-6 ui-fade-slide-in">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center text-status-info">
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="text-title-sm text-foreground">
              Opening {flowLabel}
            </div>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Loading the flow and restoring its step state.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function WorkflowOpenErrorBanner({
  flowLabel,
  message,
  onDismiss,
}: {
  flowLabel: string
  message: string | null
  onDismiss: () => void
}) {
  return (
    <div className="surface-danger-soft px-[var(--content-gutter)] py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="ui-meta-label text-status-danger">
            Could not open flow
          </div>
          <p className="mt-1 text-body-sm text-status-danger">
            Failed to open {flowLabel}. The previous flow remains open.
          </p>
          {message && (
            <p className="mt-1 ui-meta-text text-status-danger">{message}</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}

export function WorkflowPanelHeader({
  runStatus,
  workflowName,
  entryTitle,
  workflowDirty,
  shellState,
  shellDetail,
  onWorkflowNameChange,
}: {
  runStatus: ExecutionRunStatus
  workflowName: string
  entryTitle?: string | null
  workflowDirty: boolean
  shellState: WorkflowPanelShellState
  shellDetail?: string | null
  onWorkflowNameChange: (next: string) => void
}) {
  const badgeLabel = shellBadgeLabel(shellState, runStatus)

  return (
    <div className="border-b border-hairline bg-background">
      <div
        className={cn(
          "ui-dialog-gutter flex flex-wrap items-center gap-3",
          runStatus === "idle" ? "py-2.5" : "py-2",
        )}
      >
        <div className="min-w-72 flex-1">
          {shellState === "idle" ? (
            <>
              <Label htmlFor="workflow-name" className="sr-only">
                Flow name
              </Label>
              <Input
                id="workflow-name"
                type="text"
                value={workflowName}
                onChange={(event) => onWorkflowNameChange(event.target.value)}
                placeholder="Flow name"
                className="h-auto min-w-0 border-none bg-transparent px-0 py-0 text-title-md font-semibold shadow-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
              />
            </>
          ) : (
            <div className="truncate text-title-md font-semibold text-foreground">
              {workflowName || entryTitle || "Untitled flow"}
            </div>
          )}
        </div>

        {workflowDirty && (
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-status-warning"
            title="Unsaved changes"
            aria-label="Unsaved changes"
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          {badgeLabel && (
            <Badge
              variant={shellBadgeVariant(shellState)}
              className="ui-meta-text px-2.5 py-1"
            >
              {badgeLabel}
            </Badge>
          )}
          {shellDetail ? (
            <span className="ui-meta-text tabular-nums whitespace-nowrap text-muted-foreground">
              {shellDetail}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
