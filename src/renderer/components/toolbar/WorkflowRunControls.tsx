import { Loader2, Pause, Play, Rows3, Square } from "lucide-react"
import type { PermissionMode } from "@shared/types"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/cn"

interface WorkflowRunControlsProps {
  controlGroupClass: string
  isRunning: boolean
  isPaused: boolean
  isCancelling: boolean
  isStarting: boolean
  runControlPending: "pause" | "resume" | null
  runShortcutLabel: string
  canRun: boolean
  runDisabledReason: string | null
  canBatchRun: boolean
  estimatedCostUsd?: number | null
  onPause: () => void
  onResume: () => void
  onCancel: () => void
  onRun: (mode: PermissionMode) => void
  onOpenBatch: () => void
}

export function WorkflowRunControls({
  controlGroupClass,
  isRunning,
  isPaused,
  isCancelling,
  isStarting,
  runControlPending,
  runShortcutLabel,
  canRun,
  runDisabledReason,
  canBatchRun,
  estimatedCostUsd,
  onPause,
  onResume,
  onCancel,
  onRun,
  onOpenBatch,
}: WorkflowRunControlsProps) {
  return (
    <div
      role="group"
      aria-label="Run controls"
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-lg p-1 ui-transition-surface ui-motion-fast",
        isRunning
          ? isPaused
            ? "surface-warning-soft"
            : "surface-info-soft"
          : controlGroupClass,
      )}
    >
      {isRunning ? (
        <>
          {isPaused ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    variant="default"
                    size="sm"
                    className="ui-fade-slide-in-trailing gap-1.5"
                    onClick={onResume}
                    disabled={runControlPending !== null}
                  >
                    {runControlPending === "resume" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Play size={14} />
                    )}
                    {runControlPending === "resume" ? "Resuming..." : "Resume"}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Resume run</TooltipContent>
            </Tooltip>
          ) : !isStarting ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="ui-fade-slide-in-trailing gap-1.5"
                    onClick={onPause}
                    disabled={runControlPending !== null || isStarting}
                  >
                    {runControlPending === "pause" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Pause size={14} />
                    )}
                    {runControlPending === "pause" ? "Pausing..." : "Pause"}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {runControlPending === "pause"
                  ? "Pausing run..."
                  : "Pause after the current step"}
              </TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  variant="outline"
                  size="sm"
                  className="ui-fade-slide-in-trailing gap-1.5 hover:border-status-danger/40 hover:text-status-danger hover:bg-status-danger/5"
                  onClick={onCancel}
                  disabled={isCancelling}
                >
                  {isCancelling ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Square size={14} />
                  )}
                  {isCancelling
                    ? "Stopping..."
                    : isStarting
                      ? "Cancel start"
                      : "Stop"}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {isCancelling
                ? "Stopping run..."
                : isStarting
                  ? "Cancel while the flow is starting"
                  : `Stop run (${runShortcutLabel})`}
            </TooltipContent>
          </Tooltip>
        </>
      ) : (
        <div className="flex items-center gap-0.5 rounded-lg control-cluster p-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onRun("edit")}
                  disabled={!canRun}
                  className="gap-1.5 rounded-md"
                >
                  <Play size={14} />
                  Run
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {runDisabledReason ||
                `Run in edit mode (${runShortcutLabel})${estimatedCostUsd != null && estimatedCostUsd > 0.01 ? ` — ~$${estimatedCostUsd.toFixed(2)}` : ""}`}
            </TooltipContent>
          </Tooltip>
          {canBatchRun ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 rounded-md"
                    onClick={onOpenBatch}
                  >
                    <Rows3 size={14} />
                    Batch
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Run this flow across multiple inputs
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      )}
    </div>
  )
}
