import { cn } from "@/lib/cn"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { FlowAction, ErrorContent } from "@/lib/flow-chat-types"

interface FlowErrorMessageProps {
  flowName: string
  data: ErrorContent
}

function mapActionVariant(
  variant: FlowAction["variant"],
): "default" | "secondary" | "destructive" | "ghost" {
  if (variant === "primary") return "default"
  return variant
}

const variantBadge: Record<ErrorContent["variant"], React.ReactNode> = {
  error: (
    <Badge variant="destructive" size="compact">
      Error
    </Badge>
  ),
  cancelled: (
    <Badge variant="secondary" size="compact">
      Stopped
    </Badge>
  ),
  interrupted: (
    <Badge variant="warning" size="compact">
      Interrupted
    </Badge>
  ),
}

export function FlowErrorMessage({ flowName, data }: FlowErrorMessageProps) {
  return (
    <div
      className={cn(
        "rounded-lg border-l-[3px] bg-surface-1/60 px-3.5 py-3 space-y-2.5",
        data.variant === "error"
          ? "border-l-status-danger"
          : data.variant === "interrupted"
            ? "border-l-status-warning"
            : "border-l-border",
      )}
    >
      {/* Header: flow name + variant badge */}
      <div className="flex items-center gap-2">
        <span className="ui-meta-text text-muted-foreground truncate">
          {flowName}
        </span>
        {variantBadge[data.variant]}
      </div>

      {/* Summary */}
      <p className="text-body-sm text-foreground-subtle">{data.summary}</p>

      {/* Suggestions */}
      {data.suggestions.length > 0 && (
        <ul className="space-y-0.5">
          {data.suggestions.map((suggestion, i) => (
            <li
              key={i}
              className="text-body-sm text-muted-foreground flex items-start gap-1.5"
            >
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
              {suggestion}
            </li>
          ))}
        </ul>
      )}

      {/* Action buttons */}
      {data.actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {data.actions.map((action, i) => (
            <Button
              key={i}
              variant={mapActionVariant(action.variant)}
              size="sm"
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
