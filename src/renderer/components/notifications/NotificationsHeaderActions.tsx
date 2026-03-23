import {
  ArrowUpRight,
  BellRing,
  CheckCheck,
  MoreHorizontal,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface NotificationsHeaderActionsProps {
  selectedCaseId: string | null
  factoryBetaEnabled: boolean
  showUnreadOnly: boolean
  unreadCount: number
  hasNotifications: boolean
  onBackToTrack: () => void
  onRefresh: () => void
  onToggleUnreadOnly: () => void
  onMarkAllRead: () => void
  onClearAll: () => void
}

export function NotificationsHeaderActions({
  selectedCaseId,
  factoryBetaEnabled,
  showUnreadOnly,
  unreadCount,
  hasNotifications,
  onBackToTrack,
  onRefresh,
  onToggleUnreadOnly,
  onMarkAllRead,
  onClearAll,
}: NotificationsHeaderActionsProps) {
  return (
    <>
      {selectedCaseId && factoryBetaEnabled ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onBackToTrack}
        >
          <ArrowUpRight size={14} />
          Back to track
        </Button>
      ) : null}

      <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
        <RefreshCw size={14} />
        Refresh
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onToggleUnreadOnly}
      >
        <BellRing size={14} />
        {showUnreadOnly ? "Show all" : "Unread only"}
      </Button>

      {unreadCount > 0 || hasNotifications ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="More inbox actions"
            >
              <MoreHorizontal size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {unreadCount > 0 ? (
              <DropdownMenuItem onSelect={onMarkAllRead}>
                <CheckCheck size={14} />
                Mark all read
              </DropdownMenuItem>
            ) : null}
            {hasNotifications ? (
              <DropdownMenuItem onSelect={onClearAll}>
                <Trash2 size={14} />
                Clear events
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  )
}
