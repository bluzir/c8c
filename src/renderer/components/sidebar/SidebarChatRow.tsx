import type { ChatSummary } from "@shared/types"
import { MessageSquare } from "lucide-react"
import { cn } from "@/lib/cn"
import { formatRelativeTime } from "./projectSidebarUtils"

interface SidebarChatRowProps {
  chat: ChatSummary
  isSelected: boolean
  hasNewRun?: boolean
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

function statusDotClass(status: ChatSummary["latestRunStatus"]): string | null {
  switch (status) {
    case "completed":
      return "bg-status-success"
    case "failed":
      return "bg-status-danger"
    case "running":
      return "bg-status-info"
    case "cancelled":
      return "bg-status-warning"
    default:
      return null
  }
}

export function SidebarChatRow({
  chat,
  isSelected,
  hasNewRun = false,
  onClick,
  onContextMenu,
}: SidebarChatRowProps) {
  const dot = statusDotClass(chat.latestRunStatus)
  const timeLabel = formatRelativeTime(chat.lastActivityAt)

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
        onClick={onClick}
        onContextMenu={onContextMenu}
        className={cn(
          "ui-pressable min-w-0 w-full rounded-md px-1 py-0.5 text-left ui-transition-colors ui-motion-fast focus-visible:outline-none",
          isSelected
            ? "text-foreground hover:bg-transparent"
            : "text-foreground-subtle hover:bg-sidebar-hover/80",
        )}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <MessageSquare
            size={12}
            className="text-muted-foreground flex-shrink-0"
          />
          <span className="min-w-0 flex-1 truncate text-sidebar-item">
            {chat.name}
          </span>
          {hasNewRun && !dot && (
            <span
              role="img"
              aria-label="New run result"
              className="inline-flex h-2 w-2 shrink-0 rounded-full bg-status-info"
            />
          )}
          {dot && (
            <span
              role="img"
              aria-label={hasNewRun ? `New: ${chat.latestRunStatus}` : `Status: ${chat.latestRunStatus}`}
              className={cn(
                "inline-flex h-2 w-2 shrink-0 rounded-full ui-transition-colors ui-motion-fast",
                dot,
                chat.latestRunStatus === "running" && "animate-pulse",
              )}
            />
          )}
          {chat.runCount > 1 && (
            <span className="shrink-0 text-sidebar-meta text-muted-foreground tabular-nums">
              {chat.runCount}
            </span>
          )}
          {timeLabel && (
            <span
              className={cn(
                "min-w-0 max-w-[9rem] truncate text-sidebar-meta tabular-nums ui-transition-colors ui-motion-fast",
                isSelected ? "text-foreground/62" : "text-muted-foreground",
              )}
              title={timeLabel}
            >
              {timeLabel}
            </span>
          )}
        </span>
        {chat.projectName && (
          <span className="ml-[18px] truncate text-sidebar-meta text-muted-foreground">
            {chat.projectName}
          </span>
        )}
      </button>
    </div>
  )
}
