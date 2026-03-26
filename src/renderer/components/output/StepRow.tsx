import type { ReactNode } from "react"
import { cn } from "@/lib/cn"
import {
  CheckCircle2,
  Circle,
  XCircle,
  Clock,
  ChevronRight,
} from "lucide-react"

export type StepVariant = "full" | "compact"
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
  variant?: StepVariant
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
  variant = "full",
  children,
}: StepRowProps) {
  const isPending = status === "pending"
  const isRunning = status === "running"
  const isCompact = variant === "compact"

  const metaParts: string[] = []
  if (duration) metaParts.push(duration)
  if (!isCompact && cost) metaParts.push(cost)
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
          "flex w-full items-center text-left ui-motion-fast",
          isCompact ? "gap-2 px-2 py-1.5" : "gap-3 px-4 py-2",
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
            size={isCompact ? 10 : 12}
            aria-hidden="true"
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
      return (
        <CheckCircle2
          size={14}
          className="shrink-0 text-status-success"
          aria-hidden="true"
        />
      )
    case "running":
      return (
        <span className="ui-status-beacon shrink-0">
          <span className="ui-status-beacon-ring bg-status-info/35" />
          <span className="ui-status-beacon-core bg-status-info" />
        </span>
      )
    case "failed":
      return (
        <XCircle
          size={14}
          className="shrink-0 text-status-danger"
          aria-hidden="true"
        />
      )
    case "blocked":
      return (
        <Clock
          size={14}
          className="shrink-0 text-status-warning"
          aria-hidden="true"
        />
      )
    case "pending":
      return (
        <Circle
          size={12}
          className="shrink-0 text-muted-foreground/30"
          aria-hidden="true"
        />
      )
  }
}
