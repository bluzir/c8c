import { useState } from "react"
import { cn } from "@/lib/cn"
import { Button } from "@/components/ui/button"
import type { RoutingContent } from "@/lib/flow-chat-types"
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Circle,
  Loader2,
  Play,
  RotateCcw,
} from "lucide-react"

export interface ClarificationSelection {
  kind: string
  value: string
  templateId?: string
}

export interface RouteAlternativeOption {
  templateId: string
  title: string
  stageLabel?: string | null
}

interface FlowRoutingMessageProps {
  data: RoutingContent
  onRun?: () => void
  alternatives?: RouteAlternativeOption[]
  pendingAlternativeId?: string | null
  onSelectAlternative?: (templateId: string) => void
  onSelectClarification?: (selection: ClarificationSelection) => void
  onRetryRouting?: () => void
}

function StepIcon({ status }: { status: "pending" | "running" | "done" }) {
  if (status === "done") {
    return (
      <CheckCircle2
        size={14}
        className="shrink-0 text-status-success"
        aria-hidden="true"
      />
    )
  }
  if (status === "running") {
    return (
      <Loader2
        size={14}
        className="shrink-0 text-muted-foreground animate-spin"
        aria-hidden="true"
      />
    )
  }
  return (
    <Circle
      size={12}
      className="shrink-0 text-muted-foreground/30"
      aria-hidden="true"
    />
  )
}

export function FlowRoutingMessage({
  data,
  onRun,
  alternatives,
  pendingAlternativeId,
  onSelectAlternative,
  onSelectClarification,
  onRetryRouting,
}: FlowRoutingMessageProps) {
  const [clarificationPicked, setClarificationPicked] = useState(false)
  const [showAlternatives, setShowAlternatives] = useState(false)
  const hasError = Boolean(data.error)
  const allDone = !hasError && data.steps.every((s) => s.status === "done")
  const template = data.selectedTemplate
  const clarification = data.clarification

  return (
    <div className="space-y-4">
      {/* Header */}
      <p className="ui-meta-label">
        {hasError
          ? "Could not start flow"
          : clarification
            ? clarification.title ||
              "Your request could match multiple starting points"
            : allDone
              ? "Starting point selected"
              : "Choosing the best starting point\u2026"}
      </p>

      {/* Step checklist */}
      <div className="space-y-2">
        {data.steps.map((step) => (
          <div key={step.label} className="flex items-center gap-2.5">
            <StepIcon status={step.status} />
            <span
              className={cn(
                "text-body-sm",
                step.status === "done"
                  ? "text-muted-foreground"
                  : step.status === "running"
                    ? "text-foreground font-medium"
                    : "text-muted-foreground/60",
              )}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* Error display */}
      {hasError && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 surface-danger-soft rounded-lg p-3">
            <AlertCircle
              size={14}
              className="shrink-0 mt-0.5 text-status-danger"
              aria-hidden="true"
            />
            <p className="text-body-sm text-foreground-subtle">{data.error}</p>
          </div>
          {onRetryRouting && (
            <Button size="sm" variant="secondary" onClick={onRetryRouting}>
              <RotateCcw size={14} aria-hidden="true" />
              Try again
            </Button>
          )}
        </div>
      )}

      {/* Clarification options */}
      {clarification && (
        <div className="space-y-2">
          <p className="text-body-sm text-muted-foreground">
            {clarification.message}
          </p>
          <div className="flex flex-col gap-1.5">
            {clarification.options.map((opt, i) => (
              <button
                key={opt.value}
                type="button"
                disabled={clarificationPicked}
                onClick={() => {
                  setClarificationPicked(true)
                  onSelectClarification?.({
                    kind: clarification.kind,
                    value: opt.value,
                    templateId: opt.templateId,
                  })
                }}
                className="flex items-center text-left px-3 py-2 rounded-lg border border-hairline hover:bg-surface-2/30 ui-transition-surface ui-motion-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50 disabled:pointer-events-none ui-fade-slide-in"
                style={{
                  animationDelay: `${i * 60}ms`,
                  animationFillMode: "backwards",
                }}
              >
                <div className="flex-1 min-w-0">
                  <span className="text-body-sm text-foreground">
                    {opt.label}
                  </span>
                  {opt.description && (
                    <span className="block ui-meta-text text-muted-foreground">
                      {opt.description}
                    </span>
                  )}
                </div>
                <ChevronRight
                  size={14}
                  className="shrink-0 ml-2 text-muted-foreground/50"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected template + Run button */}
      {template && allDone && !clarification && (
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-body-md font-medium text-foreground">
              {template.name}
            </p>
            {template.description && (
              <p className="text-body-md text-muted-foreground">
                {template.description}
              </p>
            )}
          </div>

          {(onRun || (alternatives && alternatives.length > 0)) && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {onRun && (
                  <Button size="sm" onClick={onRun} aria-label="Run this flow">
                    <Play size={14} aria-hidden="true" />
                    Run
                  </Button>
                )}
                {alternatives &&
                  alternatives.length > 0 &&
                  !showAlternatives && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowAlternatives(true)}
                    >
                      See other options
                    </Button>
                  )}
              </div>

              {/* Inline alternatives list */}
              {showAlternatives && alternatives && alternatives.length > 0 && (
                <div className="space-y-2">
                  <p className="ui-meta-label">Other starting points</p>
                  <div className="flex flex-col gap-1.5">
                    {alternatives.map((alt, i) => (
                      <button
                        key={alt.templateId}
                        type="button"
                        disabled={pendingAlternativeId === alt.templateId}
                        onClick={() => onSelectAlternative?.(alt.templateId)}
                        className="flex items-center text-left px-3 py-2 rounded-lg border border-hairline hover:bg-surface-2/30 ui-transition-surface ui-motion-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50 ui-fade-slide-in"
                        style={{
                          animationDelay: `${i * 60}ms`,
                          animationFillMode: "backwards",
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="text-body-sm text-foreground">
                            {alt.title}
                          </span>
                          {alt.stageLabel && (
                            <span className="block ui-meta-text text-muted-foreground">
                              Starting point: {alt.stageLabel}
                            </span>
                          )}
                        </div>
                        <ChevronRight
                          size={14}
                          className="shrink-0 ml-2 text-muted-foreground/50"
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
