import { useState } from "react"
import { MoreHorizontal } from "lucide-react"
import { toastError } from "@/lib/toast-error"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { FlowAction, ErrorContent } from "@/lib/flow-chat-types"

interface FlowErrorMessageProps {
  flowName: string
  data: ErrorContent
  onRetry?: (nodeId?: string) => void
  onContinue?: (runId: string) => void
  onCancel?: () => void
}

function mapActionVariant(
  variant: FlowAction["variant"],
): "default" | "secondary" | "destructive" | "ghost" {
  if (variant === "primary") return "default"
  return variant
}

const variantLabel: Record<ErrorContent["variant"], string> = {
  error: "Error",
  cancelled: "Stopped",
  interrupted: "Interrupted",
  timeout: "Timeout",
}

const MAX_VISIBLE_ACTIONS = 3

const toneToBadgeVariant: Record<
  ErrorContent["tone"],
  "destructive" | "warning" | "info"
> = {
  danger: "destructive",
  warning: "warning",
  info: "info",
}

export function FlowErrorMessage({
  flowName,
  data,
  onRetry,
  onContinue,
  onCancel,
}: FlowErrorMessageProps) {
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  const handleAction = async (action: FlowAction) => {
    if (pendingAction !== null) return
    const actionKey = `${action.action.type}-${action.label}`
    setPendingAction(actionKey)

    try {
      switch (action.action.type) {
        case "retry": {
          onRetry?.(action.action.nodeId || undefined)
          break
        }
        case "continue": {
          onContinue?.(action.action.runId)
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
        case "cancel": {
          onCancel?.()
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
        <Badge variant={toneToBadgeVariant[data.tone]} size="compact">
          {variantLabel[data.variant]}
        </Badge>
      </div>

      {/* Summary */}
      <p className="text-body-md text-foreground-subtle">{data.summary}</p>

      {/* Suggestions */}
      {data.suggestions.length > 0 && (
        <ul className="space-y-0.5">
          {data.suggestions.map((suggestion, i) => (
            <li
              key={i}
              className="text-body-md text-foreground-subtle flex items-start gap-1.5"
            >
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
              {suggestion}
            </li>
          ))}
        </ul>
      )}

      {/* Action buttons — max 3 visible, rest in overflow dropdown */}
      {data.actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {data.actions.slice(0, MAX_VISIBLE_ACTIONS).map((action, i) => {
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
          {data.actions.length > MAX_VISIBLE_ACTIONS && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="More actions"
                  disabled={pendingAction !== null}
                >
                  <MoreHorizontal size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {data.actions.slice(MAX_VISIBLE_ACTIONS).map((action, i) => (
                  <DropdownMenuItem
                    key={i}
                    onSelect={() => handleAction(action)}
                  >
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  )
}
