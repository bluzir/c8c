import { cn } from "@/lib/cn"
import type { ProcessSpineStage } from "@/lib/process-spine"

function dotClass(state: ProcessSpineStage["state"]) {
  if (state === "done") return "bg-status-success border-status-success"
  if (state === "current") return "bg-status-info border-status-info"
  if (state === "blocked") return "bg-status-warning border-status-warning"
  if (state === "next") return "border-status-info bg-transparent"
  if (state === "available")
    return "bg-muted-foreground/45 border-muted-foreground/45"
  return "bg-transparent border-muted-foreground/35"
}

function rowClass(state: ProcessSpineStage["state"]) {
  if (state === "done")
    return "border-status-success/22 bg-status-success/7 text-foreground"
  if (state === "current")
    return "border-status-info/28 bg-status-info/9 text-foreground"
  if (state === "blocked")
    return "border-status-warning/28 bg-status-warning/10 text-foreground"
  if (state === "next")
    return "border-border/90 bg-surface-2/88 text-foreground"
  if (state === "available")
    return "border-transparent bg-transparent text-muted-foreground"
  return "border-transparent bg-transparent text-muted-foreground"
}

function connectorClass(
  left: ProcessSpineStage["state"],
  right: ProcessSpineStage["state"],
) {
  if (
    left === "done" &&
    (right === "done" || right === "current" || right === "next")
  ) {
    return "bg-status-success/30"
  }
  if (left === "current" || right === "current") {
    return "bg-status-info/25"
  }
  if (left === "blocked" || right === "blocked") {
    return "bg-status-warning/25"
  }
  if (right === "next") {
    return "bg-status-info/18"
  }
  return "bg-border"
}

export function ProcessSpine({
  stages,
  isLive = false,
  className,
}: {
  stages: ProcessSpineStage[]
  isLive?: boolean
  className?: string
}) {
  if (stages.length === 0) return null

  return (
    <section aria-label="Process stages" className={cn("px-0 py-0", className)}>
      <div className="overflow-x-auto ui-scrollbar-hidden">
        <div className="flex min-w-max items-center gap-1.5">
          {stages.map((stage, index) => (
            <div key={stage.id} className="flex items-center gap-1.5">
              {index > 0 && (
                <div
                  aria-hidden="true"
                  className={cn(
                    "h-px w-4 shrink-0",
                    connectorClass(stages[index - 1].state, stage.state),
                  )}
                />
              )}
              <div
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2.5 py-1 text-body-sm transition-colors",
                  rowClass(stage.state),
                  stage.state === "next" && "font-medium",
                )}
                aria-current={stage.state === "current" ? "step" : undefined}
                title={stage.label}
              >
                {stage.state === "current" && isLive ? (
                  <span
                    className="ui-status-beacon shrink-0"
                    aria-hidden="true"
                  >
                    <span className="ui-status-beacon-ring bg-status-info/35" />
                    <span className="ui-status-beacon-core bg-status-info" />
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full border",
                      dotClass(stage.state),
                    )}
                  />
                )}
                <span className="max-w-[8.5rem] truncate whitespace-nowrap">
                  {stage.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
