import { CheckCircle2, Circle, XCircle, Clock } from "lucide-react"

export type StepStatus = "pending" | "running" | "done" | "failed" | "blocked"

export function StatusDot({ status }: { status: StepStatus }) {
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
