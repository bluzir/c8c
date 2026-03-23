import type { ReactNode } from "react"
import { cn } from "@/lib/cn"
import {
  CheckCircle2,
  Circle,
  XCircle,
  Clock,
  ChevronRight,
} from "lucide-react"

type StepStatus = "pending" | "running" | "done" | "failed" | "blocked"

interface StepRowProps {
  name: string
  status: StepStatus
  nodeType?: string
  duration?: string
  cost?: string
  expanded: boolean
  onToggle: () => void
  fanOutProgress?: string
  children?: ReactNode
}

export function StepRow({
  name,
  status,
  duration,
  cost,
  expanded,
  onToggle,
  fanOutProgress,
  children,
}: StepRowProps) {
  const isPending = status === "pending"
  const isRunning = status === "running"

  const metaParts: string[] = []
  if (duration) metaParts.push(duration)
  if (cost) metaParts.push(cost)
  if (fanOutProgress) metaParts.push(fanOutProgress)

  return (
    <div
      className={cn(
        "border-b border-hairline last:border-b-0",
        isRunning && "bg-surface-1/40",
      )}
    >
      <button
        type="button"
        disabled={isPending}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-2 text-left ui-motion-fast",
          !isPending && "hover:bg-surface-2/30",
          isPending && "opacity-40",
        )}
        onClick={onToggle}
        aria-expanded={expanded}
      >
        {/* Status dot — minimal, left-aligned */}
        <StatusDot status={status} />

        {/* Name + meta in one line */}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-body-sm",
            isRunning && "font-medium text-foreground",
            status === "done" && "text-foreground",
            status === "failed" && "text-status-danger",
            isPending && "text-muted-foreground",
            status === "blocked" && "text-status-warning",
          )}
        >
          {name}
        </span>

        {/* Meta: duration, cost, fan-out — right side, quiet */}
        {metaParts.length > 0 && !isPending && (
          <span className="shrink-0 ui-meta-text text-muted-foreground">
            {metaParts.join(" · ")}
          </span>
        )}

        {/* Expand chevron — only for non-pending */}
        {!isPending && (
          <ChevronRight
            size={12}
            className={cn(
              "shrink-0 text-muted-foreground/50 ui-chevron",
              expanded && "rotate-90",
            )}
          />
        )}
      </button>

      {/* Accordion content */}
      <div className="ui-collapsible" data-open={expanded ? "true" : "false"}>
        <div className="ui-collapsible-inner">{children}</div>
      </div>
    </div>
  )
}

function StatusDot({ status }: { status: StepStatus }) {
  switch (status) {
    case "done":
      return <CheckCircle2 size={14} className="shrink-0 text-status-success" />
    case "running":
      return (
        <span className="ui-status-beacon shrink-0">
          <span className="ui-status-beacon-ring bg-status-info/35" />
          <span className="ui-status-beacon-core bg-status-info" />
        </span>
      )
    case "failed":
      return <XCircle size={14} className="shrink-0 text-status-danger" />
    case "blocked":
      return <Clock size={14} className="shrink-0 text-status-warning" />
    case "pending":
      return <Circle size={12} className="shrink-0 text-muted-foreground/30" />
  }
}
