import { memo } from "react"
import { cn } from "@/lib/cn"
import { entryScanLine, folderName, outcomeClasses, outcomeIcon, outcomeLabel, type DashboardEntry } from "./dashboardModel"

export const MultiRunDashboardSidebarEntry = memo(function MultiRunDashboardSidebarEntry({
  entry,
  isSelected,
  onSelect,
  now,
}: {
  entry: DashboardEntry
  isSelected: boolean
  onSelect: (key: string) => void
  now: number
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(entry.workflowKey)}
      className={cn(
        "ui-pressable w-full rounded-lg px-3 py-3 text-left ui-transition-colors ui-motion-fast",
        isSelected
          ? "bg-surface-2/80 text-foreground"
          : "bg-transparent text-foreground hover:bg-surface-2/50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-body-sm font-medium text-foreground">
            {entry.workflowName || (entry.workflowPath ? "Untitled flow" : "Unsaved draft")}
          </p>
          <p className="mt-0.5 truncate ui-meta-text text-muted-foreground">
            {folderName(entry.projectPath)}
          </p>
        </div>
        <span className={cn("ui-status-badge shrink-0 ui-meta-text", outcomeClasses(entry))}>
          {outcomeIcon(entry)}
          {outcomeLabel(entry)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 ui-meta-text text-muted-foreground">
        <span>{entryScanLine(entry, now)}</span>
      </div>
    </button>
  )
})
