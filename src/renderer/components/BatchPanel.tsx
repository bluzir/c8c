import { useState, useCallback } from "react"
import { useAtom } from "jotai"
import {
  batchDialogOpenAtom,
  batchStatusAtom,
  batchErrorAtom,
  batchItemsAtom,
  batchSummaryAtom,
  batchProgressAtom,
  type BatchItemResult,
  type BatchSummary,
} from "@/lib/store"
import { useBatchExecution } from "@/hooks/useBatchExecution"
import { cn } from "@/lib/cn"
import {
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Play,
  Square,
  Check,
  X,
  Loader2,
  Download,
  ChevronRight,
} from "lucide-react"

function downloadText(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function csvCell(value: unknown): string {
  const text = String(value ?? "")
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

function toBatchCsv(items: BatchItemResult[], inputs?: string[]): string {
  const evalIds = Array.from(
    new Set(items.flatMap((item) => Object.keys(item.eval_scores || {}))),
  ).sort()
  const header = [
    "input_index",
    "input_value",
    "run_id",
    "status",
    "cost_usd",
    "duration_ms",
    "error",
    ...evalIds.map((id) => `eval:${id}`),
  ]
  const rows = items.map((item) => [
    item.input_index + 1,
    inputs?.[item.input_index] ?? "",
    item.run_id,
    item.status,
    typeof item.cost_usd === "number" ? item.cost_usd.toFixed(6) : "",
    item.duration_ms,
    item.error || "",
    ...evalIds.map((id) => item.eval_scores?.[id] ?? ""),
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")
}

function toBatchJson(items: BatchItemResult[], summary: BatchSummary | null) {
  return JSON.stringify({ summary, items }, null, 2)
}

export function BatchPanel() {
  const [open, setOpen] = useAtom(batchDialogOpenAtom)
  const [batchStatus, setBatchStatus] = useAtom(batchStatusAtom)
  const [batchError, setBatchError] = useAtom(batchErrorAtom)
  const [batchItems, setBatchItems] = useAtom(batchItemsAtom)
  const [batchSummary, setBatchSummary] = useAtom(batchSummaryAtom)
  const [batchProgress, setBatchProgress] = useAtom(batchProgressAtom)
  const { runBatch, cancelBatch } = useBatchExecution()

  const [inputText, setInputText] = useState("")
  const [concurrency, setConcurrency] = useState(2)
  const [stopOnFailure, setStopOnFailure] = useState(false)
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)

  const inputs = inputText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  const failedItems = batchItems.filter((i) => i.status !== "completed")
  const failedCount = failedItems.length

  const handleRetryFailed = useCallback(() => {
    if (failedCount === 0) return
    const failedInputs = failedItems
      .map((item) => inputs[item.input_index])
      .filter((v): v is string => v != null)
    if (failedInputs.length === 0) return
    const workflowInputs = failedInputs.map((value) => ({
      type: "text" as const,
      value,
    }))
    setBatchSummary(null)
    runBatch(workflowInputs, concurrency, stopOnFailure, {
      preserveExistingItems: true,
      inputIndexMap: failedItems.map((item) => item.input_index),
      totalInputsOverride: inputs.length,
    })
  }, [
    failedItems,
    failedCount,
    inputs,
    concurrency,
    stopOnFailure,
    runBatch,
    setBatchSummary,
  ])

  const handleRun = useCallback(() => {
    if (inputs.length === 0) return
    const workflowInputs = inputs.map((value) => ({
      type: "text" as const,
      value,
    }))
    runBatch(workflowInputs, concurrency, stopOnFailure)
  }, [inputs, concurrency, stopOnFailure, runBatch])

  const isRunning = batchStatus === "running"
  const isDone = batchStatus === "done"
  const isError = batchStatus === "error"

  const handleExportJson = useCallback(() => {
    if (batchItems.length === 0) return
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    downloadText(
      `batch-results-${stamp}.json`,
      toBatchJson(batchItems, batchSummary),
      "application/json",
    )
  }, [batchItems, batchSummary])

  const handleExportCsv = useCallback(() => {
    if (batchItems.length === 0) return
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    downloadText(
      `batch-results-${stamp}.csv`,
      toBatchCsv(batchItems, inputs),
      "text/csv;charset=utf-8",
    )
  }, [batchItems, inputs])

  const resetBatchState = useCallback(() => {
    setInputText("")
    setBatchStatus("idle")
    setBatchError(null)
    setBatchItems([])
    setBatchSummary(null)
    setBatchProgress({ completed: 0, total: 0, running: 0 })
    setConfirmResetOpen(false)
  }, [
    setBatchError,
    setBatchItems,
    setBatchProgress,
    setBatchStatus,
    setBatchSummary,
  ])

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <CanvasDialogContent
          size="xl"
          showCloseButton={true}
          className="w-[min(100%-2rem,42rem)] max-h-[80vh] flex flex-col p-0 gap-0"
        >
          <CanvasDialogHeader className="surface-depth-header">
            <DialogTitle>Run on multiple inputs</DialogTitle>
            <DialogDescription>
              Run this flow on multiple inputs. Enter one input per line.
            </DialogDescription>
          </CanvasDialogHeader>

          <CanvasDialogBody className="ui-scroll-region flex-1 min-h-0 overflow-y-auto py-4">
            {!isRunning && !isDone && (
              <div className="space-y-3 ui-fade-slide-in">
                {isError && (
                  <div
                    role="alert"
                    className="ui-alert-danger ui-meta-text text-status-danger"
                  >
                    {batchError ||
                      "Batch run failed. Check configuration and try again."}
                  </div>
                )}
                <Textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(event) => {
                    if (
                      (event.metaKey || event.ctrlKey) &&
                      event.key === "Enter" &&
                      inputs.length > 0
                    ) {
                      event.preventDefault()
                      handleRun()
                    }
                  }}
                  placeholder={"Topic 1\nTopic 2\nTopic 3"}
                  rows={8}
                  className="font-mono text-body-sm"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="batch-concurrency">
                        Concurrency (max 10)
                      </Label>
                      <Input
                        id="batch-concurrency"
                        type="number"
                        min={1}
                        max={10}
                        value={concurrency}
                        onChange={(e) =>
                          setConcurrency(
                            Math.max(
                              1,
                              Math.min(10, parseInt(e.target.value) || 1),
                            ),
                          )
                        }
                        className="w-16 h-control-sm ui-meta-text"
                      />
                    </div>
                    <p className="ui-meta-text text-muted-foreground">
                      Up to 10 inputs run in parallel.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="batch-stop-on-failure"
                      className="flex items-center gap-1.5 cursor-pointer"
                    >
                      <Checkbox
                        id="batch-stop-on-failure"
                        checked={stopOnFailure}
                        onChange={(e) => setStopOnFailure(e.target.checked)}
                      />
                      Stop on first failure
                    </Label>
                    <p className="ui-meta-text text-muted-foreground">
                      Stops queueing new items after the first failure.
                      In-flight items still finish.
                    </p>
                  </div>
                </div>
                <div className="ui-meta-text text-muted-foreground">
                  {inputs.length} input{inputs.length !== 1 ? "s" : ""} detected
                </div>
                <div className="ui-meta-text text-muted-foreground">
                  Shortcut: press Cmd/Ctrl+Enter to start batch run.
                </div>
              </div>
            )}

            {isRunning && (
              <div className="space-y-3 ui-fade-slide-in">
                <div
                  className="flex items-center gap-2 text-body-sm"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 size={14} className="animate-spin" />
                  <span>
                    Running: {batchProgress.completed}/{batchProgress.total}{" "}
                    completed
                    {batchProgress.running > 0 &&
                      `, ${batchProgress.running} in progress`}
                  </span>
                </div>
                <p className="ui-meta-text text-muted-foreground">
                  Closing this panel does not stop the batch. You can reopen it
                  from the toolbar or status bar.
                </p>
                <div className="ui-progress-track">
                  <div
                    className="ui-progress-bar ui-running-pulse"
                    style={{
                      transform: `scaleX(${batchProgress.total > 0 ? batchProgress.completed / batchProgress.total : 0})`,
                    }}
                  />
                </div>
                <BatchItemList items={batchItems} inputs={inputs} />
              </div>
            )}

            {isDone && !batchSummary && (
              <div
                role="status"
                className="rounded-md border border-hairline bg-surface-2/70 px-3 py-2 ui-meta-text text-muted-foreground"
              >
                Batch completed, but summary is unavailable.
              </div>
            )}

            {isDone && batchSummary && (
              <div className="space-y-3 ui-fade-slide-in">
                <div className="grid grid-cols-3 gap-2">
                  <SummaryCard
                    label="Pass Rate"
                    value={`${(batchSummary.pass_rate * 100).toFixed(0)}%`}
                    staggerIndex={0}
                  />
                  <SummaryCard
                    label="Passed"
                    value={`${batchSummary.passed}/${batchSummary.processed}`}
                    staggerIndex={1}
                  />
                  <SummaryCard
                    label="Failed"
                    value={String(batchSummary.failed)}
                    variant={batchSummary.failed > 0 ? "danger" : "default"}
                    staggerIndex={2}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <SummaryCard
                    label="Cancelled"
                    value={String(batchSummary.cancelled)}
                    staggerIndex={3}
                  />
                  <SummaryCard
                    label="Mean Cost"
                    value={`$${batchSummary.mean_cost_usd.toFixed(4)}`}
                    staggerIndex={4}
                  />
                  <SummaryCard
                    label={
                      batchSummary.total !== batchSummary.processed
                        ? `Mean Duration (${batchSummary.processed} completed)`
                        : "Mean Duration"
                    }
                    value={`${(batchSummary.mean_duration_ms / 1000).toFixed(1)}s`}
                    staggerIndex={5}
                  />
                </div>
                {batchSummary.cancelled > 0 && (
                  <div className="ui-alert-warning ui-meta-text text-status-warning">
                    Batch was cancelled before all items finished. Completed
                    results are still available below.
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportCsv}
                    disabled={batchItems.length === 0}
                  >
                    <Download size={14} />
                    Export CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportJson}
                    disabled={batchItems.length === 0}
                  >
                    <Download size={14} />
                    Export JSON
                  </Button>
                </div>
                <BatchItemList items={batchItems} inputs={inputs} />
              </div>
            )}
          </CanvasDialogBody>

          <CanvasDialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                {isRunning ? "Hide" : "Close"}
              </Button>
            </DialogClose>
            {isRunning ? (
              <Button variant="destructive" size="sm" onClick={cancelBatch}>
                <Square size={14} />
                Cancel
              </Button>
            ) : isDone ? (
              <>
                {failedCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetryFailed}
                  >
                    <Play size={14} />
                    Retry {failedCount} Incomplete
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => {
                    if (batchItems.length > 0) {
                      setConfirmResetOpen(true)
                      return
                    }
                    resetBatchState()
                  }}
                >
                  New Batch
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="default"
                onClick={handleRun}
                disabled={inputs.length === 0}
              >
                <Play size={14} />
                Run {inputs.length} Item{inputs.length !== 1 ? "s" : ""}
              </Button>
            )}
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>
      <Dialog open={confirmResetOpen} onOpenChange={setConfirmResetOpen}>
        <CanvasDialogContent size="md" showCloseButton={false}>
          <CanvasDialogHeader>
            <DialogTitle>Discard this batch?</DialogTitle>
            <DialogDescription>
              Starting a new batch will discard these {batchItems.length} result
              {batchItems.length === 1 ? "" : "s"} from the current session
              view.
            </DialogDescription>
          </CanvasDialogHeader>
          <CanvasDialogBody className="space-y-2">
            <p className="ui-meta-text text-muted-foreground">
              Export the results first if you still need them outside this
              session.
            </p>
          </CanvasDialogBody>
          <CanvasDialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={batchItems.length === 0}
            >
              <Download size={14} />
              Export CSV
            </Button>
            <Button size="sm" onClick={resetBatchState}>
              New batch
            </Button>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>
    </>
  )
}

function SummaryCard({
  label,
  value,
  variant = "default",
  staggerIndex = 0,
}: {
  label: string
  value: string
  variant?: "default" | "danger"
  staggerIndex?: number
}) {
  return (
    <div
      className="rounded-md border border-hairline bg-surface-2 px-3 py-2 ui-fade-slide-in"
      style={{
        animationDelay: `${staggerIndex * 35}ms`,
        animationFillMode: "both",
      }}
    >
      <div className="ui-meta-text text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-body-sm font-mono font-medium",
          variant === "danger" ? "text-status-danger" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  )
}

function BatchItemList({
  items,
  inputs,
}: {
  items: BatchItemResult[]
  inputs?: string[]
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  if (items.length === 0) return null
  return (
    <div className="border border-hairline rounded-md divide-y divide-hairline max-h-64 overflow-y-auto ui-scroll-region">
      {items.map((item) => {
        const evalSummary = Object.entries(item.eval_scores || {})
          .map(([id, score]) => `${id}:${score}`)
          .join(" · ")
        const isExpanded = expandedIndex === item.input_index
        return (
          <div
            key={`${item.input_index}-${item.run_id}`}
            className="ui-fade-slide-in"
          >
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-1.5 ui-meta-text hover:bg-surface-2/50 ui-pressable text-left"
              onClick={() =>
                setExpandedIndex(isExpanded ? null : item.input_index)
              }
            >
              <ChevronRight
                size={10}
                className={cn(
                  "shrink-0 text-muted-foreground ui-chevron",
                  isExpanded && "rotate-90",
                )}
              />
              <span className="text-muted-foreground w-8">
                #{item.input_index + 1}
              </span>
              {item.status === "completed" ? (
                <Check size={12} className="text-status-success" />
              ) : item.status === "cancelled" ||
                item.status === "interrupted" ? (
                <Square size={12} className="text-status-warning" />
              ) : (
                <X size={12} className="text-status-danger" />
              )}
              <span
                className={cn(
                  item.status === "completed"
                    ? "text-foreground"
                    : item.status === "cancelled" ||
                        item.status === "interrupted"
                      ? "text-status-warning"
                      : "text-status-danger",
                )}
              >
                {item.status === "completed"
                  ? "Completed"
                  : item.status === "cancelled" || item.status === "interrupted"
                    ? "Cancelled"
                    : item.error || "Failed"}
              </span>
              <span className="text-muted-foreground font-mono">
                {typeof item.cost_usd === "number"
                  ? `$${item.cost_usd.toFixed(4)}`
                  : "n/a"}
              </span>
              {evalSummary && (
                <span
                  className="truncate text-muted-foreground"
                  title={evalSummary}
                >
                  {evalSummary}
                </span>
              )}
              <span className="ml-auto text-muted-foreground">
                {((item.duration_ms ?? 0) / 1000).toFixed(1)}s
              </span>
            </button>
            <div className="ui-collapsible" data-open={String(isExpanded)}>
              <div className="ui-collapsible-inner">
                <div className="px-3 pb-2 space-y-1.5 border-t border-hairline bg-surface-2/50">
                  {inputs?.[item.input_index] && (
                    <div className="pt-1.5">
                      <div className="ui-meta-label text-muted-foreground mb-0.5">
                        Input
                      </div>
                      <pre className="ui-meta-text font-mono bg-surface-3/50 border border-hairline rounded px-2 py-1 max-h-20 overflow-y-auto whitespace-pre-wrap">
                        {inputs[item.input_index]}
                      </pre>
                    </div>
                  )}
                  {item.output && (
                    <div>
                      <div className="ui-meta-label text-muted-foreground mb-0.5">
                        Output
                      </div>
                      <pre className="ui-meta-text font-mono bg-surface-3/50 border border-hairline rounded px-2 py-1 max-h-32 overflow-y-auto whitespace-pre-wrap">
                        {item.output}
                      </pre>
                    </div>
                  )}
                  {item.error && (
                    <div>
                      <div className="ui-meta-label text-status-danger mb-0.5">
                        Error
                      </div>
                      <pre className="ui-meta-text font-mono surface-danger-soft text-status-danger rounded px-2 py-1 max-h-20 overflow-y-auto whitespace-pre-wrap">
                        {item.error}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
