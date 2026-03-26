import { useState } from "react"
import { toastError } from "@/lib/toast-error"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { FlowAction, ErrorContent } from "@/lib/flow-chat-types"

interface FlowErrorMessageProps {
  flowName: string
  data: ErrorContent
  onRetry?: (runId: string) => void
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

export function FlowErrorMessage({
  flowName,
  data,
  onRetry,
}: FlowErrorMessageProps) {
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  const handleAction = async (action: FlowAction) => {
    if (pendingAction !== null) return
    const actionKey = `${action.action.type}-${action.label}`
    setPendingAction(actionKey)

    try {
      switch (action.action.type) {
        case "retry": {
          onRetry?.(action.action.runId)
          break
        }
        case "open-report": {
          window.api.openPath(action.action.path)
          break
        }
        case "open-all-files": {
          // Handled by parent via AllFilesButton
          break
        }
        default:
          break
      }
    } catch (err) {
      console.error("[FlowErrorMessage] action failed:", err)
      toastError(`Could not ${action.label.toLowerCase()}`)
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header: flow name + variant badge */}
      <div className="flex items-center gap-2">
        <span className="ui-meta-label truncate">{flowName}</span>
        {variantBadge[data.variant]}
      </div>

      {/* Summary */}
      <p className="text-body-lg text-foreground-subtle">{data.summary}</p>

      {/* Suggestions */}
      {data.suggestions.length > 0 && (
        <ul className="space-y-0.5">
          {data.suggestions.map((suggestion, i) => (
            <li
              key={i}
              className="text-body-lg text-foreground-subtle flex items-start gap-1.5"
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
          {data.actions.map((action, i) => {
            const actionKey = `${action.action.type}-${action.label}`
            const isLoading = pendingAction === actionKey
            const isDisabled = pendingAction !== null

            return (
              <Button
                key={i}
                variant={mapActionVariant(action.variant)}
                size="sm"
                disabled={isDisabled}
                isLoading={isLoading}
                onClick={() => handleAction(action)}
              >
                {action.label}
              </Button>
            )
          })}
        </div>
      )}
    </div>
  )
}
