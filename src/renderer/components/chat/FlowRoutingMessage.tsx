import { cn } from "@/lib/cn"
import type { RoutingContent } from "@/lib/flow-chat-types"

interface FlowRoutingMessageProps {
  data: RoutingContent
}

function StepIcon({ status }: { status: "pending" | "running" | "done" }) {
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
  // pending
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full border border-muted-foreground/40"
      aria-label="Pending"
    />
  )
}

export function FlowRoutingMessage({ data }: FlowRoutingMessageProps) {
  const allDone = data.steps.every((s) => s.status === "done")
  const template = data.selectedTemplate

  return (
    <div className="rounded-lg border-l-[3px] border-l-[hsl(270_60%_60%)] bg-surface-1/60 px-3.5 py-3 space-y-2">
      {/* Header */}
      <p
        className={cn(
          "text-body-sm font-medium",
          allDone ? "text-foreground-subtle" : "text-foreground",
        )}
      >
        {allDone
          ? "Starting point selected"
          : "Choosing the best starting point\u2026"}
      </p>

      {/* Step checklist */}
      <ul className="space-y-1.5">
        {data.steps.map((step) => (
          <li key={step.label} className="flex items-center gap-2">
            <span className="flex-shrink-0 w-3.5 flex items-center justify-center">
              <StepIcon status={step.status} />
            </span>
            <span
              className={cn(
                "text-body-sm",
                step.status === "done"
                  ? "text-foreground-subtle"
                  : step.status === "running"
                    ? "text-foreground"
                    : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ul>

      {/* Selected template card */}
      {template && (
        <div className="mt-2 rounded-md bg-surface-2/50 px-3 py-2.5 space-y-1">
          <p className="text-body-sm font-medium text-foreground">
            {template.name}
          </p>
          {template.description && (
            <p className="text-body-sm text-muted-foreground">
              {template.description}
            </p>
          )}
          {template.estimatedCost && (
            <p className="ui-meta-text text-muted-foreground">
              Estimated cost: {template.estimatedCost}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
