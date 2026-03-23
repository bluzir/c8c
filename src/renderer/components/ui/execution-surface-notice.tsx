import { cn } from "@/lib/cn"
import type { ExecutionSurfaceNotice } from "@/lib/workflow-execution"
import { Button } from "@/components/ui/button"
import { AlertTriangle, CheckCircle2, CircleAlert, Info, X } from "lucide-react"
import type { ReactNode } from "react"

function resolveNoticeTone(level: ExecutionSurfaceNotice["level"]) {
  switch (level) {
    case "success":
      return {
        containerClass: "surface-success-soft",
        labelClass: "text-status-success",
        Icon: CheckCircle2,
      }
    case "warning":
      return {
        containerClass: "surface-warning-soft",
        labelClass: "text-status-warning",
        Icon: AlertTriangle,
      }
    case "error":
      return {
        containerClass: "surface-danger-soft",
        labelClass: "text-status-danger",
        Icon: CircleAlert,
      }
    default:
      return {
        containerClass: "surface-info-soft",
        labelClass: "text-status-info",
        Icon: Info,
      }
  }
}

export function ExecutionSurfaceNoticeBanner({
  notice,
  onAction,
  onDismiss,
  className,
  actions,
  children,
}: {
  notice: ExecutionSurfaceNotice
  onAction?: (() => void) | null
  onDismiss?: (() => void) | null
  className?: string
  actions?: ReactNode
  children?: ReactNode
}) {
  const tone = resolveNoticeTone(notice.level)

  return (
    <div className={cn("rounded-lg px-3 py-3", tone.containerClass, className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className={cn(
              "flex items-center gap-2 ui-meta-label",
              tone.labelClass,
            )}
          >
            <tone.Icon size={14} aria-hidden="true" />
            {notice.title}
          </div>
          <p className="mt-1 text-body-sm text-foreground">
            {notice.description}
          </p>
          {children ? <div className="mt-2">{children}</div> : null}
        </div>
        {(actions || onAction || onDismiss) && (
          <div className="flex flex-wrap items-center gap-2">
            {actions || (
              <>
                {onAction && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onAction}
                  >
                    {notice.actionLabel}
                  </Button>
                )}
                {onDismiss && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onDismiss}
                  >
                    <X size={14} />
                    Dismiss
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
