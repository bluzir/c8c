import type { WorkflowFile } from "@shared/types"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/cn"
import type { SidebarWorkflowNotificationTone } from "./projectSidebarUtils"

interface SidebarWorkflowRowProps {
  workflow: WorkflowFile
  isSelected: boolean
  isDirty: boolean
  unreadNotification: SidebarWorkflowNotificationTone
  unreadNotificationTitle: string | null
  idleMetaLabel: string | null
  statusLabel: string | null
  statusBadgeClass: string | null
  showStatusSpinner: boolean
  progress: number
  progressBarClass: string
  runStatus: string
  showProgressTrack: boolean
  onOpen: () => void
  onRename: () => void
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void
}

export function SidebarWorkflowRow({
  workflow,
  isSelected,
  isDirty,
  unreadNotification,
  unreadNotificationTitle,
  idleMetaLabel,
  statusLabel,
  statusBadgeClass,
  showStatusSpinner,
  progress,
  progressBarClass,
  runStatus,
  showProgressTrack,
  onOpen,
  onRename,
  onContextMenu,
}: SidebarWorkflowRowProps) {
  const unreadDotClass =
    unreadNotification === "success"
      ? "bg-status-success"
      : unreadNotification === "warning"
        ? "bg-status-warning"
        : unreadNotification === "error"
          ? "bg-status-danger"
          : "bg-transparent"

  return (
    <div
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onContextMenu(event)
      }}
      className={cn(
        "sidebar-thread-row group",
        isSelected && "sidebar-thread-row--active",
      )}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-current={isSelected ? "page" : undefined}
          data-sidebar-item="true"
          data-workflow-path={workflow.path}
          onClick={onOpen}
          onDoubleClick={(event) => {
            event.stopPropagation()
            onRename()
          }}
          className={cn(
            "ui-pressable min-w-0 flex-1 rounded-md px-1 py-0.5 text-left ui-transition-colors ui-motion-fast focus-visible:outline-none",
            isSelected ? "hover:bg-transparent" : "hover:bg-sidebar-hover/80",
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                "truncate flex-1 text-sidebar-item",
                isSelected ? "text-foreground" : "text-foreground-subtle",
              )}
            >
              {workflow.name}
            </span>
            {isDirty && (
              <span
                role="img"
                aria-label="Unsaved changes"
                title="Unsaved changes"
                className="inline-flex h-1.5 w-1.5 flex-shrink-0 rounded-full bg-status-warning"
              >
                <span className="sr-only">Unsaved changes</span>
              </span>
            )}
          </span>
        </button>

        {(unreadNotification !== "none" || statusLabel || idleMetaLabel) && (
          <span className="flex flex-shrink-0 items-center gap-1.5 pr-1">
            {unreadNotification !== "none" && (
              <span
                title={unreadNotificationTitle || undefined}
                aria-label={unreadNotificationTitle || undefined}
                role="img"
                className={cn(
                  "inline-flex h-2 w-2 shrink-0 rounded-full ui-transition-colors ui-motion-fast",
                  unreadDotClass,
                )}
              />
            )}
            {statusLabel && statusBadgeClass && (
              <span
                className={cn(
                  "ui-status-badge h-control-xs shrink-0 px-2 ui-meta-text font-medium tracking-normal ui-transition-colors ui-motion-fast",
                  statusBadgeClass,
                )}
              >
                {showStatusSpinner ? (
                  <Loader2
                    size={11}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                <span>{statusLabel}</span>
              </span>
            )}
            {!statusLabel && idleMetaLabel && (
              <span
                className={cn(
                  "max-w-[9rem] truncate text-sidebar-meta tabular-nums ui-transition-colors ui-motion-fast",
                  isSelected ? "text-foreground/62" : "text-muted-foreground",
                )}
                title={idleMetaLabel}
              >
                {idleMetaLabel}
              </span>
            )}
          </span>
        )}
      </div>

      <div
        data-visible={showProgressTrack ? "true" : "false"}
        className="ui-inline-presence pointer-events-none absolute inset-x-1 bottom-1"
      >
        <div
          className="sidebar-progress-track"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${workflow.name} execution progress`}
        >
          <div
            className={cn(
              "sidebar-progress-bar",
              progressBarClass,
              runStatus === "running" && "ui-running-pulse",
            )}
            style={{
              transform: `scaleX(${showProgressTrack ? progress / 100 : 0})`,
            }}
          />
        </div>
      </div>
    </div>
  )
}
