import { Rows3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"
import { MultiRunDashboardSidebarEntry } from "./MultiRunDashboardSidebarEntry"
import type { DashboardEntry } from "./dashboardModel"

export function MultiRunDashboardSidebar({
  entries,
  groupedEntries,
  aggregateCounts,
  selectedEntryKey,
  onSelectEntry,
  now,
  showBatchEntry,
  batchStatus,
  batchProgress,
  batchItemsCount,
  onOpenBatch,
}: {
  entries: DashboardEntry[]
  groupedEntries: Array<{
    id: "needs_action" | "running" | "recent"
    label: string
    entries: DashboardEntry[]
  }>
  aggregateCounts: { needsAction: number; running: number; recent: number }
  selectedEntryKey: string | null
  onSelectEntry: (key: string) => void
  now: number
  showBatchEntry: boolean
  batchStatus: "idle" | "running" | "done" | "error"
  batchProgress: { total: number; completed: number; running: number }
  batchItemsCount: number
  onOpenBatch: () => void
}) {
  return (
    <div className="surface-panel border-b border-hairline lg:border-b-0 lg:border-r min-h-[240px] lg:min-h-0 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
        <div>
          <p className="text-body-sm font-medium text-foreground">
            Session runs
          </p>
          <p className="ui-meta-text text-muted-foreground">
            {aggregateCounts.needsAction} need action ·{" "}
            {aggregateCounts.running} live · {aggregateCounts.recent} recent
          </p>
        </div>
      </div>
      <div className="ui-scroll-region min-h-0 max-h-[320px] overflow-y-auto p-2 lg:max-h-none lg:flex-1">
        {showBatchEntry ? (
          <section className="mb-4 space-y-1.5">
            <div className="px-3">
              <p className="ui-meta-label text-muted-foreground">Batch</p>
            </div>
            <Button
              type="button"
              variant="outline"
              data-sidebar-item="true"
              className="ui-pressable flex h-auto w-full items-center gap-3 rounded-lg border border-hairline bg-surface-2/70 px-3 py-2 text-left ui-transition-colors ui-motion-fast hover:bg-surface-2"
              onClick={onOpenBatch}
            >
              <Rows3 size={15} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm font-medium text-foreground">
                  {batchStatus === "running"
                    ? "Batch run in progress"
                    : batchStatus === "done"
                      ? "Completed batch results"
                      : batchStatus === "error"
                        ? "Batch run needs attention"
                        : "Recent batch results"}
                </span>
                <span className="block truncate ui-meta-text text-muted-foreground">
                  {batchProgress.total > 0
                    ? `${batchProgress.completed}/${batchProgress.total} completed${batchProgress.running > 0 ? ` · ${batchProgress.running} running` : ""}`
                    : `${batchItemsCount} result${batchItemsCount === 1 ? "" : "s"} in session`}
                </span>
              </span>
              <span
                className={cn(
                  "ui-status-badge shrink-0 px-2 ui-meta-text",
                  batchStatus === "running"
                    ? "ui-status-badge-info"
                    : batchStatus === "error"
                      ? "ui-status-badge-danger"
                      : "ui-status-badge-success",
                )}
              >
                {batchStatus === "running"
                  ? "Live"
                  : batchStatus === "error"
                    ? "Error"
                    : "Open"}
              </span>
            </Button>
          </section>
        ) : null}
        {entries.length === 0 ? (
          <div className="p-4 text-body-sm text-muted-foreground">
            {showBatchEntry
              ? "No single-flow runs in this session yet."
              : "No active or recent runs in this session yet."}
          </div>
        ) : (
          <div className="space-y-4">
            {groupedEntries.map((group) => (
              <section key={group.id} className="space-y-1.5">
                <div className="px-3">
                  <p className="ui-meta-label text-muted-foreground">
                    {group.label}
                  </p>
                </div>
                <div className="space-y-1">
                  {group.entries.map((entry) => (
                    <MultiRunDashboardSidebarEntry
                      key={entry.workflowKey}
                      entry={entry}
                      isSelected={selectedEntryKey === entry.workflowKey}
                      onSelect={onSelectEntry}
                      now={now}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
