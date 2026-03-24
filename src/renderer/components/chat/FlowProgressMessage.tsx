import { useState } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/cn"
import type { ProgressContent, ProgressStep } from "@/lib/flow-chat-types"

interface FlowProgressMessageProps {
  data: ProgressContent
}

function StepIcon({ status }: { status: ProgressStep["status"] }) {
  if (status === "done") {
    return (
      <span
        className="text-status-success text-[13px] leading-none"
        aria-label="Done"
      >
        &#10003;
      </span>
    )
  }
  if (status === "running") {
    return (
      <span
        className="inline-block h-2.5 w-2.5 rounded-full bg-status-info animate-pulse"
        aria-label="Running"
      />
    )
  }
  if (status === "failed") {
    return (
      <span
        className="text-status-danger text-[13px] leading-none"
        aria-label="Failed"
      >
        &#10005;
      </span>
    )
  }
  // pending
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full border border-muted-foreground/40"
      aria-label="Pending"
    />
  )
}

function SubStepPills({
  subSteps,
}: {
  subSteps: NonNullable<ProgressStep["subSteps"]>
}) {
  return (
    <div className="flex flex-wrap gap-1 mt-1">
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

export function FlowProgressMessage({ data }: FlowProgressMessageProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())

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
    <div className="space-y-2">
      {/* Step checklist */}
      <ul className="space-y-1.5">
        {data.steps.map((step) => {
          const isExpandable =
            (step.status === "done" || step.status === "failed") &&
            !!step.output
          const isExpanded = expandedSteps.has(step.nodeId)

          return (
            <li key={step.nodeId}>
              <button
                type="button"
                className={cn(
                  "flex items-start gap-2 w-full text-left",
                  isExpandable &&
                    "cursor-pointer hover:bg-surface-2/40 -mx-1 px-1 rounded",
                  !isExpandable && "cursor-default",
                )}
                onClick={() => isExpandable && toggleExpand(step.nodeId)}
                disabled={!isExpandable}
              >
                <span className="mt-0.5 flex-shrink-0 w-3.5 flex items-center justify-center">
                  <StepIcon status={step.status} />
                </span>
                <div className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "text-body-sm",
                      step.status === "done"
                        ? "text-foreground-subtle"
                        : step.status === "running"
                          ? "text-foreground"
                          : step.status === "failed"
                            ? "text-status-danger"
                            : "text-muted-foreground",
                    )}
                  >
                    {step.label}
                  </span>
                  {step.status === "done" && step.summary && (
                    <span className="ml-1.5 ui-meta-text text-muted-foreground">
                      {step.summary}
                    </span>
                  )}
                </div>
                {isExpandable && (
                  <ChevronRight
                    className={cn(
                      "mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground ui-motion-fast",
                      isExpanded && "rotate-90",
                    )}
                  />
                )}
              </button>
              {isExpanded && step.output && (
                <div className="ml-6 mt-1 max-h-64 overflow-y-auto ui-scroll-region rounded bg-surface-2/40 p-2">
                  <pre className="text-body-sm text-foreground-subtle whitespace-pre-wrap font-mono">
                    {step.output}
                  </pre>
                </div>
              )}
              {step.subSteps && step.subSteps.length > 0 && (
                <div className="ml-5">
                  <SubStepPills subSteps={step.subSteps} />
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {/* Footer: step count + elapsed */}
      <div className="flex items-center gap-2 ui-meta-text text-muted-foreground">
        <span>
          {doneCount}/{totalCount} steps
        </span>
        {data.elapsed && (
          <>
            <span aria-hidden="true">&middot;</span>
            <span>{data.elapsed}</span>
          </>
        )}
      </div>
    </div>
  )
}
