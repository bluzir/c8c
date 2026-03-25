import { useState, useRef, useEffect } from "react"
import { CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast-error"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  DEFAULT_EXECUTION_IPC_TIMEOUT_MS,
  withIpcTimeout,
} from "@/features/execution"
import type { FlowAction, DecisionContent } from "@/lib/flow-chat-types"

interface FlowDecisionMessageProps {
  flowName: string
  data: DecisionContent
  resolved?: boolean
  onResolved?: () => void
}

function mapActionVariant(
  variant: FlowAction["variant"],
): "default" | "secondary" | "destructive" | "ghost" {
  if (variant === "primary") return "default"
  return variant
}

export function FlowDecisionMessage({
  flowName,
  data,
  resolved = false,
  onResolved,
}: FlowDecisionMessageProps) {
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [editedContent, setEditedContent] = useState(data.editableContent ?? "")
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  if (resolved) {
    return (
      <div className="flex items-center gap-1.5 ui-meta-text text-status-success">
        <CheckCircle2 size={13} />
        <span>Resolved</span>
      </div>
    )
  }

  const toneBadge =
    data.tone === "eval-exhausted" ? (
      <Badge variant="warning" size="compact">
        Check failed
      </Badge>
    ) : (
      <Badge variant="info" size="compact">
        Approval
      </Badge>
    )

  const handleAction = async (action: FlowAction) => {
    if (pendingAction !== null) return

    if (action.action.type === "expand-details") {
      setDetailsOpen((prev) => !prev)
      return
    }

    const actionKey = `${action.action.type}-${action.label}`
    setPendingAction(actionKey)

    try {
      let ok: boolean

      switch (action.action.type) {
        case "approve": {
          const content =
            data.editableContent != null ? editedContent : undefined
          ok = await withIpcTimeout(
            window.api.approveNode(
              action.action.runId,
              action.action.nodeId,
              content,
            ),
            DEFAULT_EXECUTION_IPC_TIMEOUT_MS,
            "Approval timed out. Try again, or restart the app if the problem continues.",
          )
          if (!ok) {
            toastError("Could not approve step: this flow is no longer active")
            break
          }
          toast.success("Accepted \u2014 flow continuing.")
          break
        }
        case "override": {
          ok = await withIpcTimeout(
            window.api.overrideEvaluator(
              action.action.runId,
              action.action.nodeId,
            ),
            DEFAULT_EXECUTION_IPC_TIMEOUT_MS,
            "Override timed out. Try again, or restart the app if the problem continues.",
          )
          if (!ok) {
            toastError(
              "Could not override check: this flow is no longer active",
            )
            break
          }
          toast.success("Accepted \u2014 flow continuing.")
          break
        }
        case "reject": {
          ok = await withIpcTimeout(
            window.api.rejectNode(action.action.runId, action.action.nodeId),
            DEFAULT_EXECUTION_IPC_TIMEOUT_MS,
            "Stopping the flow timed out. Try again, or restart the app if the problem continues.",
          )
          if (!ok) {
            toastError("Could not stop flow: it is no longer active")
            break
          }
          toast.success("Flow stopped.")
          break
        }
        default:
          return
      }

      onResolved?.()
    } catch (err) {
      console.error("[FlowDecisionMessage] action failed:", err)
      toastError(`Could not ${action.label.toLowerCase()}`)
    } finally {
      if (mountedRef.current) {
        setPendingAction(null)
      }
    }
  }

  const hasResultOrIssues =
    data.resultFacts.length > 0 || data.issues.length > 0

  return (
    <div className="space-y-4">
      {/* Header: flow name + tone badge */}
      <div className="flex items-center gap-2">
        <span className="ui-meta-text text-muted-foreground truncate">
          {flowName}
        </span>
        {toneBadge}
      </div>

      {/* Summary */}
      <p className="text-[15px] leading-relaxed text-foreground-subtle">
        {data.summary}
      </p>

      {/* RESULT + ISSUES slab */}
      {hasResultOrIssues && (
        <div className="ui-slab space-y-1 py-2">
          {data.resultFacts.length > 0 && (
            <div>
              <p className="ui-meta-text font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                Result
              </p>
              <ul className="space-y-0.5">
                {data.resultFacts.map((fact, i) => (
                  <li
                    key={i}
                    className="text-[15px] leading-relaxed text-foreground-subtle flex items-start gap-1.5"
                  >
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    {fact}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.issues.length > 0 && (
            <div>
              <p className="ui-meta-text font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                Issues
              </p>
              <ul className="space-y-0.5">
                {data.issues.map((issue, i) => (
                  <li
                    key={i}
                    className="text-[15px] leading-relaxed text-status-warning flex items-start gap-1.5"
                  >
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-status-warning/60" />
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Decision question */}
      <p className="text-body-md font-semibold text-foreground">
        {data.question}
      </p>

      {/* Inline edit area (toggled via expand-details action) */}
      {detailsOpen && data.editableContent != null && (
        <div className="space-y-1.5">
          <Textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            rows={8}
            aria-label="Edit step output before continuing"
            className="font-mono text-body-sm"
          />
          <p className="ui-meta-text text-muted-foreground">
            Your edits will be used as the step output when approved.
          </p>
        </div>
      )}

      {/* Action buttons */}
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
    </div>
  )
}
