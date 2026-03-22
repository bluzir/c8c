import type { ComponentType } from "react"
import { ArrowUpRight, Check, Inbox } from "lucide-react"
import type { InboxNotification } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { SectionHeading } from "@/components/ui/page-shell"
import { cn } from "@/lib/cn"
import { formatRelativeTime } from "@/components/sidebar/projectSidebarUtils"

const SOURCE_LABELS: Record<InboxNotification["source"], string> = {
  workflow: "Workflow",
  batch: "Batch",
  agent: "Agent",
  system: "System",
}

interface RecentEventsSectionProps {
  notifications: InboxNotification[]
  unreadCount: number
  visibleNotifications: InboxNotification[]
  sourceFilter: "all" | InboxNotification["source"]
  emphasized?: boolean
  onSourceFilterChange: (value: "all" | InboxNotification["source"]) => void
  onNotificationAction: (notification: InboxNotification) => void
  onMarkRead: (id: string) => void
  levelMeta: Record<InboxNotification["level"], { icon: ComponentType<{ size?: number; className?: string }>; tone: string; badgeClass: string }>
}

export function RecentEventsSection({
  notifications,
  unreadCount,
  visibleNotifications,
  sourceFilter,
  emphasized = false,
  onSourceFilterChange,
  onNotificationAction,
  onMarkRead,
  levelMeta,
}: RecentEventsSectionProps) {
  return (
    <section className={cn("rounded-xl p-5 space-y-4", emphasized ? "surface-panel" : "border border-hairline/70 bg-surface-1/50")}>
      <SectionHeading
        title="Recent events"
        meta={(
          <span className="control-badge border border-hairline bg-surface-2/70 ui-meta-text text-muted-foreground">
            {notifications.length} total · {unreadCount} unread
          </span>
        )}
      />

      <div className="flex flex-wrap gap-2">
        {(["all", "workflow", "batch", "agent", "system"] as const).map((value) => {
          const active = sourceFilter === value
          const label = value === "all" ? "All" : SOURCE_LABELS[value]
          return (
            <Button
              key={value}
              type="button"
              variant={active ? "secondary" : "outline"}
              size="sm"
              onClick={() => onSourceFilterChange(value)}
            >
              {label}
            </Button>
          )
        })}
      </div>

      {visibleNotifications.length === 0 ? (
        <article className="rounded-lg border border-dashed border-hairline bg-surface-2/30 px-5 py-10 text-center">
          <div className="mx-auto flex h-control-lg w-control-lg items-center justify-center rounded-lg border border-hairline bg-surface-2/80">
            <Inbox size={20} className="text-muted-foreground" />
          </div>
          <p className="mt-4 text-body-md font-medium text-foreground">Inbox is clear</p>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Important confirmations and errors will accumulate here as you work.
          </p>
        </article>
      ) : (
        <div className="overflow-hidden rounded-lg surface-soft">
          {visibleNotifications.map((notification) => {
            const level = levelMeta[notification.level]
            const LevelIcon = level.icon

            return (
              <article
                key={notification.id}
                className={cn(
                  "border-b border-hairline px-4 py-3 last:border-b-0",
                  !notification.read ? "bg-surface-1" : "bg-transparent",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-hairline bg-surface-2/80", level.tone)}>
                    <LevelIcon size={16} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-body-md font-semibold text-foreground">{notification.title}</p>
                      <span className={cn("ui-status-badge ui-meta-text", level.badgeClass)}>
                        {SOURCE_LABELS[notification.source]}
                      </span>
                      <span className="ui-meta-text text-muted-foreground">
                        {formatRelativeTime(notification.createdAt)}
                      </span>
                    </div>

                    {notification.description && (
                      <p className="mt-1 text-body-sm text-muted-foreground whitespace-pre-wrap">
                        {notification.description}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {notification.action && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onNotificationAction(notification)}
                      >
                        <ArrowUpRight size={14} />
                        {notification.action.label || "Open"}
                      </Button>
                    )}
                    {!notification.read && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onMarkRead(notification.id)}
                      >
                        <Check size={14} />
                        Mark read
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
