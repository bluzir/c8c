import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/cn"
import type { ProgressContent, ProgressStep } from "@/lib/flow-chat-types"

interface FlowProgressMessageProps {
  data: ProgressContent
}

function formatElapsed(startedAt: number): string {
  const seconds = Math.round((Date.now() - startedAt) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  return `${minutes} min`
}

function StepIcon({ status }: { status: ProgressStep["status"] }) {
  if (status === "done") {
    return (
      <span
        className="flex h-5 w-5 items-center justify-center rounded-full bg-status-success/15 text-status-success text-[12px] leading-none flex-shrink-0"
        aria-label="Done"
      >
        &#10003;
      </span>
    )
  }
  if (status === "running") {
    return (
      <span
        className="flex h-5 w-5 items-center justify-center flex-shrink-0"
        aria-label="Running"
      >
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-status-info animate-pulse" />
      </span>
    )
  }
  if (status === "failed") {
    return (
      <span
        className="flex h-5 w-5 items-center justify-center rounded-full bg-status-danger/15 text-status-danger text-[12px] leading-none flex-shrink-0"
        aria-label="Failed"
      >
        &#10005;
      </span>
    )
  }
  // pending
  return (
    <span
      className="flex h-5 w-5 items-center justify-center flex-shrink-0"
      aria-label="Pending"
    >
      <span className="inline-block h-2 w-2 rounded-full border border-muted-foreground/40" />
    </span>
  )
}

function SubStepPills({
  subSteps,
}: {
  subSteps: NonNullable<ProgressStep["subSteps"]>
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {subSteps.map((sub) => (
        <span
          key={sub.key}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label-xs",
            sub.done
              ? "bg-status-success/10 text-status-success"
              : "bg-surface-2 text-muted-foreground",
          )}
        >
          {sub.label}
          {sub.done ? (
            <span className="text-[10px]">&#10003;</span>
          ) : (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-status-info animate-pulse" />
          )}
        </span>
      ))}
    </div>
  )
}

/** Live elapsed timer that ticks every second while the flow is active */
function useElapsedTimer(
  startedAt: number | undefined,
  collapsed: boolean | undefined,
): string | null {
  const [elapsed, setElapsed] = useState<string | null>(() =>
    startedAt ? formatElapsed(startedAt) : null,
  )

  useEffect(() => {
    if (!startedAt || collapsed) {
      // For collapsed state, use the frozen elapsed from data
      setElapsed(startedAt ? formatElapsed(startedAt) : null)
      return
    }

    // Set immediately, then tick every second
    setElapsed(formatElapsed(startedAt))
    const interval = setInterval(() => {
      setElapsed(formatElapsed(startedAt))
    }, 1_000)
    return () => clearInterval(interval)
  }, [startedAt, collapsed])

  return elapsed
}

export function FlowProgressMessage({ data }: FlowProgressMessageProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const prevRunningRef = useRef<string | null>(null)
  const liveElapsed = useElapsedTimer(data.startedAt, data.collapsed)

  // Auto-expand the currently running step; collapse the previous one when it finishes
  useEffect(() => {
    const runningStep = data.steps.find((s) => s.status === "running")
    const runningId = runningStep?.nodeId ?? null

    if (runningId && runningId !== prevRunningRef.current) {
      setExpandedSteps((prev) => {
        const next = new Set(prev)
        // Collapse the previously-running step
        if (prevRunningRef.current) {
          next.delete(prevRunningRef.current)
        }
        // Expand the newly-running step
        next.add(runningId)
        return next
      })
      prevRunningRef.current = runningId
    }
  }, [data.steps])

  if (data.collapsed && data.collapsedLabel) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-status-success text-[13px]">&#10003;</span>
        <span className="ui-meta-text text-muted-foreground">
          {data.collapsedLabel}
        </span>
      </div>
    )
  }

  const doneCount = data.steps.filter((s) => s.status === "done").length
  const totalCount = data.steps.length
  // Use live timer when available, fall back to snapshot elapsed from data
  const displayElapsed = liveElapsed ?? data.elapsed

  const toggleExpand = (nodeId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  return (
    <div className="space-y-3">
      {/* Step list */}
      <div className="divide-y divide-hairline">
        {data.steps.map((step) => {
          const hasOutput = !!step.output
          const hasSubSteps = !!step.subSteps && step.subSteps.length > 0
          const isExpandable =
            (step.status === "done" ||
              step.status === "failed" ||
              step.status === "running") &&
            (hasOutput || hasSubSteps)
          const isExpanded = expandedSteps.has(step.nodeId)

          return (
            <div key={step.nodeId}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-3 py-3 text-left",
                  isExpandable
                    ? "cursor-pointer hover:bg-surface-2/40 rounded"
                    : "cursor-default",
                )}
                onClick={() => isExpandable && toggleExpand(step.nodeId)}
                disabled={!isExpandable}
              >
                <StepIcon status={step.status} />
                <span
                  className={cn(
                    "flex-1 text-[15px] leading-relaxed",
                    step.status === "running"
                      ? "text-foreground font-medium"
                      : step.status === "done"
                        ? "text-foreground-subtle"
                        : step.status === "failed"
                          ? "text-status-danger"
                          : "text-muted-foreground",
                  )}
                >
                  {step.label}
                  {step.status === "done" && step.summary && (
                    <span className="ml-2 ui-meta-text text-muted-foreground font-normal">
                      {step.summary}
                    </span>
                  )}
                </span>
                {isExpandable && (
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
                      isExpanded && "rotate-180",
                    )}
                  />
                )}
              </button>

              {/* Expanded detail panel */}
              {isExpanded && (
                <div className="pl-8 pb-3 space-y-2">
                  {step.subSteps && step.subSteps.length > 0 && (
                    <SubStepPills subSteps={step.subSteps} />
                  )}
                  {step.output && (
                    <div className="max-h-64 overflow-y-auto ui-scroll-region rounded bg-surface-2/40 p-2">
                      <pre className="text-body-sm text-muted-foreground whitespace-pre-wrap font-mono">
                        {step.output}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer: step count + elapsed */}
      <div className="flex items-center gap-2 ui-meta-text text-muted-foreground">
        <span>
          {doneCount}/{totalCount} steps
        </span>
        {displayElapsed && (
          <>
            <span aria-hidden="true">&middot;</span>
            <span>{displayElapsed}</span>
          </>
        )}
      </div>
    </div>
  )
}
