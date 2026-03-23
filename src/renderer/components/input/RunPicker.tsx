import { useState, useMemo } from "react"
import { useAtom } from "jotai"
import { inputAttachmentsAtom } from "@/lib/store"
import { pastRunsAtom } from "@/features/execution"
import type { RunResult } from "@shared/types"
import { Search, History } from "lucide-react"
import {
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogHeader,
  Dialog,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

function formatRelativeDate(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatCost(cost: number | undefined): string {
  if (cost == null) return ""
  return `$${cost.toFixed(3)}`
}

interface RunPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RunPicker({ open, onOpenChange }: RunPickerProps) {
  const [pastRuns] = useAtom(pastRunsAtom)
  const [attachments, setAttachments] = useAtom(inputAttachmentsAtom)
  const [search, setSearch] = useState("")

  const completedRuns = useMemo(
    () => pastRuns.filter((r) => r.status === "completed"),
    [pastRuns],
  )

  const filtered = useMemo(() => {
    if (!search) return completedRuns
    const q = search.toLowerCase()
    return completedRuns.filter((r) => r.workflowName.toLowerCase().includes(q))
  }, [completedRuns, search])

  const existingRunIds = useMemo(
    () =>
      new Set(attachments.filter((a) => a.kind === "run").map((a) => a.runId)),
    [attachments],
  )

  const handleSelect = (run: RunResult) => {
    if (existingRunIds.has(run.runId)) return
    setAttachments((prev) => [
      ...prev,
      {
        kind: "run" as const,
        runId: run.runId,
        workspace: run.workspace,
        workflowName: run.workflowName,
      },
    ])
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent
        className="p-0 gap-0 max-h-[75vh] flex flex-col"
        showCloseButton
      >
        <CanvasDialogHeader className="surface-depth-header">
          <DialogTitle>Attach Saved Result</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a previous saved result to attach as context
          </DialogDescription>
        </CanvasDialogHeader>

        <CanvasDialogBody className="flex flex-col min-h-0 p-0">
          <div className="ui-dialog-gutter py-3 border-b border-hairline">
            <div className="relative">
              <Search
                size={14}
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by flow name..."
                aria-label="Search runs"
                autoFocus
                className="pl-8"
              />
            </div>
          </div>

          <div className="ui-slab ui-scroll-region flex-1 overflow-y-auto px-3 py-2">
            {completedRuns.length === 0 && (
              <div className="ui-empty-state text-body-md text-muted-foreground">
                No completed runs found.
              </div>
            )}
            {completedRuns.length > 0 && filtered.length === 0 && (
              <div className="ui-empty-state text-body-md text-muted-foreground">
                No results for &ldquo;{search}&rdquo;
              </div>
            )}
            {filtered.map((run) => {
              const alreadyAdded = existingRunIds.has(run.runId)
              return (
                <Button
                  type="button"
                  key={run.runId}
                  onClick={() => handleSelect(run)}
                  disabled={alreadyAdded}
                  aria-label={`Attach result from ${run.workflowName}`}
                  variant="ghost"
                  size="auto"
                  className="ui-interactive-card-subtle h-auto w-full justify-start items-center gap-3 rounded-md px-2 py-2 text-left whitespace-normal disabled:opacity-40"
                >
                  <History
                    size={14}
                    aria-hidden="true"
                    className="text-muted-foreground flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="ui-badge-row">
                      <span className="text-body-sm font-medium truncate">
                        {run.workflowName}
                      </span>
                      <span className="control-badge control-badge-compact border border-border bg-surface-1/70 ui-meta-text text-muted-foreground">
                        {run.runId.slice(0, 8)}
                      </span>
                      <span className="ui-status-badge ui-status-badge-success ui-meta-text">
                        Completed
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 ui-meta-text text-muted-foreground">
                      <span>{formatRelativeDate(run.startedAt)}</span>
                      {run.totalCost != null && (
                        <span>{formatCost(run.totalCost)}</span>
                      )}
                    </div>
                  </div>
                  {alreadyAdded && (
                    <span className="control-badge control-badge-compact surface-success-soft ui-meta-text text-status-success">
                      Added
                    </span>
                  )}
                </Button>
              )
            })}
          </div>
        </CanvasDialogBody>
      </CanvasDialogContent>
    </Dialog>
  )
}
