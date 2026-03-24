import { cn } from "@/lib/cn"
import type { RoutingContent } from "@/lib/flow-chat-types"
import { CheckCircle2, Circle, Loader2 } from "lucide-react"

interface FlowRoutingMessageProps {
  data: RoutingContent
}

function StepIcon({ status }: { status: "pending" | "running" | "done" }) {
  if (status === "done") {
    return <CheckCircle2 size={16} className="shrink-0 text-status-success" />
  }
  if (status === "running") {
    return (
      <Loader2
        size={16}
        className="shrink-0 text-muted-foreground animate-spin"
      />
    )
  }
  return <Circle size={14} className="shrink-0 text-muted-foreground/30" />
}

export function FlowRoutingMessage({ data }: FlowRoutingMessageProps) {
  const allDone = data.steps.every((s) => s.status === "done")
  const template = data.selectedTemplate

  return (
    <div className="space-y-3">
      {/* Header — flat text, no bubble */}
      <p className="ui-meta-label text-muted-foreground">
        {allDone
          ? "Starting point selected"
          : "Choosing the best starting point\u2026"}
      </p>

      {/* Step checklist — flat, no container */}
      <div className="space-y-2">
        {data.steps.map((step) => (
          <div key={step.label} className="flex items-center gap-2.5">
            <StepIcon status={step.status} />
            <span
              className={cn(
                "text-body-sm",
                step.status === "done"
                  ? "text-muted-foreground"
                  : step.status === "running"
                    ? "text-foreground font-medium"
                    : "text-muted-foreground/60",
              )}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* Selected template — flat text, not a card */}
      {template && (
        <div className="space-y-1">
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
              {template.estimatedCost}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
