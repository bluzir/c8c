import type { ReactNode } from "react"
import { cn } from "@/lib/cn"
import {
  ArrowDownToLine,
  BoxSelect,
  CheckCircle2,
  Circle,
  Clock,
  Gauge,
  GitBranch,
  GitMerge,
  ShieldCheck,
  XCircle,
  Zap,
} from "lucide-react"

type StepStatus = "pending" | "running" | "done" | "failed" | "blocked"

type NodeType =
  | "input"
  | "skill"
  | "evaluator"
  | "splitter"
  | "merger"
  | "output"
  | "approval"

interface StepRowProps {
  name: string
  status: StepStatus
  nodeType?: NodeType
  duration?: string
  cost?: string
  expanded: boolean
  onToggle: () => void
  fanOutProgress?: string
  children?: ReactNode
}

const NODE_TYPE_ICONS: Record<NodeType, typeof Zap> = {
  skill: Zap,
  evaluator: Gauge,
  splitter: GitBranch,
  merger: GitMerge,
  approval: ShieldCheck,
  output: BoxSelect,
  input: ArrowDownToLine,
}

export function StepRow({
  name,
  status,
  nodeType = "skill",
  duration,
  cost,
  expanded,
  onToggle,
  fanOutProgress,
  children,
}: StepRowProps) {
  const isPending = status === "pending"
  const TypeIcon = NODE_TYPE_ICONS[nodeType]

  const metaParts: string[] = []
  if (duration) metaParts.push(duration)
  if (cost) metaParts.push(cost)
  const metaText = metaParts.join(" · ")

  return (
    <div className="border-b border-hairline last:border-b-0">
      <button
        type="button"
        disabled={isPending}
        className={cn(
          "flex w-full items-center gap-2.5 px-3 py-2.5 text-left",
          "hover:bg-surface-3/80 ui-pressable",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
          isPending && "opacity-50 pointer-events-none",
        )}
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`Step: ${name}`}
      >
        <TypeIcon
          size={14}
          className="shrink-0 text-muted-foreground"
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1">
          <div className="truncate text-body-sm font-medium">{name}</div>
          {metaText && (
            <div className="ui-meta-text truncate text-muted-foreground">
              {metaText}
            </div>
          )}
        </div>

        {fanOutProgress && (
          <span className="ui-meta-text shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-muted-foreground border-hairline">
            {fanOutProgress}
          </span>
        )}

        <StatusIndicator status={status} />
      </button>

      <div className="ui-collapsible" data-open={expanded ? "true" : "false"}>
        <div className="ui-collapsible-inner">{children}</div>
      </div>
    </div>
  )
}

function StatusIndicator({ status }: { status: StepStatus }) {
  switch (status) {
    case "done":
      return (
        <CheckCircle2
          size={14}
          className="shrink-0 text-status-success"
          data-testid="step-status-done"
          aria-label="Done"
        />
      )
    case "running":
      return (
        <span
          className="ui-status-beacon shrink-0"
          data-testid="step-status-beacon"
          aria-label="Running"
        >
          <span className="ui-status-beacon-ring bg-status-info/35" />
          <span className="ui-status-beacon-core bg-status-info" />
        </span>
      )
    case "failed":
      return (
        <XCircle
          size={14}
          className="shrink-0 text-status-danger"
          data-testid="step-status-failed"
          aria-label="Failed"
        />
      )
    case "blocked":
      return (
        <Clock
          size={14}
          className="shrink-0 text-status-warning"
          data-testid="step-status-blocked"
          aria-label="Blocked"
        />
      )
    case "pending":
      return (
        <Circle
          size={14}
          className="shrink-0 text-muted-foreground/40"
          data-testid="step-status-pending"
          aria-label="Pending"
        />
      )
  }
}
