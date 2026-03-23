import { cn } from "@/lib/cn"
import type { ValidationError } from "@/lib/validate-workflow"

interface WorkflowRunBlockerProps {
  suppressed?: boolean
  isRunning: boolean
  workflowReviewMode: boolean
  runDisabledReason: string | null
  workflowValidation: ValidationError[]
  hasBlockingErrors: boolean
  showOpenSettingsAction?: boolean
  onOpenSettings?: () => void
  onNavigateToValidationIssue: (issue: ValidationError) => void
}

export function WorkflowRunBlocker({
  suppressed = false,
  isRunning,
  workflowReviewMode,
  runDisabledReason,
  workflowValidation,
  hasBlockingErrors,
  showOpenSettingsAction = false,
  onOpenSettings,
  onNavigateToValidationIssue,
}: WorkflowRunBlockerProps) {
  return (
    <div
      data-open={
        !suppressed &&
        !isRunning &&
        !workflowReviewMode &&
        Boolean(runDisabledReason)
          ? "true"
          : "false"
      }
      className={cn(
        "ui-collapsible",
        !suppressed &&
          !isRunning &&
          !workflowReviewMode &&
          runDisabledReason &&
          "border-b border-hairline",
      )}
    >
      <div className="ui-collapsible-inner">
        <div
          role="alert"
          className="mx-3 my-2 ui-alert-danger text-status-danger"
        >
          <p className="text-body-sm font-medium">{runDisabledReason || ""}</p>
          {showOpenSettingsAction && onOpenSettings ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={onOpenSettings}
                className="text-left text-body-sm underline underline-offset-2 hover:no-underline"
              >
                Open Settings
              </button>
            </div>
          ) : null}
          {hasBlockingErrors && (
            <ul className="mt-2 space-y-1.5">
              {workflowValidation
                .filter((issue) => issue.severity === "error")
                .map((issue) => (
                  <li key={`${issue.nodeId}-${issue.field}`}>
                    <button
                      type="button"
                      onClick={() => onNavigateToValidationIssue(issue)}
                      className="text-left text-body-sm text-status-danger/90 underline-offset-2 hover:underline"
                    >
                      {issue.message}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
