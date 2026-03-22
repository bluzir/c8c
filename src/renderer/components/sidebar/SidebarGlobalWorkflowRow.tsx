import type { WorkflowFile } from "@shared/types"
import { Globe, Loader2 } from "lucide-react"
import { cn } from "@/lib/cn"

interface SidebarGlobalWorkflowRowProps {
  workflow: WorkflowFile
  isSelected: boolean
  idleMetaLabel: string | null
  statusLabel: string | null
  statusBadgeClass: string | null
  showStatusSpinner: boolean
  onOpen: () => void
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void
}

export function SidebarGlobalWorkflowRow({
  workflow,
  isSelected,
  idleMetaLabel,
  statusLabel,
  statusBadgeClass,
  showStatusSpinner,
  onOpen,
  onContextMenu,
}: SidebarGlobalWorkflowRowProps) {
  return (
    <div
      className={cn(
        "sidebar-thread-row group",
        isSelected && "sidebar-thread-row--active",
      )}
    >
      <button
        type="button"
        aria-current={isSelected ? "page" : undefined}
        data-sidebar-item="true"
        onClick={onOpen}
        onContextMenu={onContextMenu}
        className={cn(
          "ui-pressable min-w-0 w-full rounded-md px-1 py-0.5 text-left text-sidebar-item ui-transition-colors ui-motion-fast focus-visible:outline-none",
          isSelected
            ? "text-foreground hover:bg-transparent"
            : "text-foreground-subtle hover:bg-sidebar-hover/80",
        )}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <Globe size={12} className="text-muted-foreground flex-shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {workflow.name}
          </span>
          {statusLabel && statusBadgeClass ? (
            <span
              className={cn(
                "ui-status-badge h-control-xs shrink-0 px-2 ui-meta-text font-medium tracking-normal ui-transition-colors ui-motion-fast",
                statusBadgeClass,
              )}
            >
              {showStatusSpinner ? <Loader2 size={11} className="animate-spin" aria-hidden="true" /> : null}
              <span>{statusLabel}</span>
            </span>
          ) : idleMetaLabel ? (
            <span
              className={cn(
                "min-w-0 max-w-[9rem] truncate text-sidebar-meta tabular-nums ui-transition-colors ui-motion-fast",
                isSelected ? "text-foreground/62" : "text-muted-foreground",
              )}
              title={idleMetaLabel}
            >
              {idleMetaLabel}
            </span>
          ) : null}
        </span>
      </button>
    </div>
  )
}
