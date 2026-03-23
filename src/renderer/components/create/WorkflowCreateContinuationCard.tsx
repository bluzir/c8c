import { useEffect, useState } from "react"
import { ArrowUpRight, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"
import { formatRelativeTime } from "@/components/sidebar/projectSidebarUtils"
import type { WorkflowCreateContinuationCandidate } from "@/lib/workflow-create-continuation"

const MAX_COLLAPSED_SECONDARY_CONTINUATIONS = 2

function continuationStatusLabel(
  status: WorkflowCreateContinuationCandidate["status"],
) {
  return status === "blocked" ? "Waiting on you" : "Ready"
}

function continuationStatusVariant(
  status: WorkflowCreateContinuationCandidate["status"],
) {
  return status === "blocked" ? "warning" : "success"
}

function compactSupportText(value: string | null | undefined) {
  if (!value) return null
  return value
    .replace(/^Using saved /i, "")
    .replace(/\.$/, "")
    .trim()
}

function buildContinuationMetaLine(
  continuation: WorkflowCreateContinuationCandidate,
) {
  const supportText = compactSupportText(continuation.supportText)
  const routeLabel = continuation.nextStepLabel
    ? supportText
      ? `${supportText} -> ${continuation.nextStepLabel}`
      : continuation.latestStepLabel
        ? `${continuation.latestStepLabel} -> ${continuation.nextStepLabel}`
        : `Next: ${continuation.nextStepLabel}`
    : supportText ||
      continuation.latestResultLabel ||
      continuation.latestStepLabel ||
      null

  return [
    routeLabel,
    continuation.lastGateText
      ? `Latest check: ${continuation.lastGateText}`
      : null,
    `Updated ${formatRelativeTime(continuation.updatedAt) || "recently"}`,
  ]
    .filter(Boolean)
    .join(" · ")
}

export function buildContinuationActionLabel(
  continuation: WorkflowCreateContinuationCandidate,
): string {
  if (continuation.action.kind === "open_blocked_work") {
    return continuation.action.task.kind === "approval"
      ? "Open approval"
      : "Provide input"
  }
  return "Continue work"
}

export function buildContinuationStepChips(
  continuation: WorkflowCreateContinuationCandidate,
): string[] {
  const chips: string[] = []
  if (continuation.latestStepLabel) {
    chips.push(`Latest step: ${continuation.latestStepLabel}`)
  }
  if (continuation.nextStepLabel) {
    chips.push(`Next step: ${continuation.nextStepLabel}`)
  }
  return chips
}

export function deriveSecondaryContinuationVisibility(
  secondaryContinuations: WorkflowCreateContinuationCandidate[],
  expanded: boolean,
) {
  const visibleContinuations = expanded
    ? secondaryContinuations
    : secondaryContinuations.slice(0, MAX_COLLAPSED_SECONDARY_CONTINUATIONS)

  return {
    visibleContinuations,
    hiddenCount: Math.max(
      0,
      secondaryContinuations.length - visibleContinuations.length,
    ),
    canToggle:
      secondaryContinuations.length > MAX_COLLAPSED_SECONDARY_CONTINUATIONS,
  }
}

export function WorkflowCreateContinuationCard({
  continuation,
  secondaryContinuations,
  loading,
  pending,
  onContinue,
}: {
  continuation: WorkflowCreateContinuationCandidate | null
  secondaryContinuations: WorkflowCreateContinuationCandidate[]
  loading: boolean
  pending: boolean
  onContinue: (continuation: WorkflowCreateContinuationCandidate) => void
}) {
  const [secondaryExpanded, setSecondaryExpanded] = useState(false)

  useEffect(() => {
    if (
      secondaryContinuations.length <= MAX_COLLAPSED_SECONDARY_CONTINUATIONS
    ) {
      setSecondaryExpanded(false)
    }
  }, [secondaryContinuations.length])

  if (!loading && !continuation) return null
  const primaryMetaLine = continuation
    ? buildContinuationMetaLine(continuation)
    : ""
  const secondaryVisibility = deriveSecondaryContinuationVisibility(
    secondaryContinuations,
    secondaryExpanded,
  )

  return (
    <section
      aria-label="Continue saved work"
      className="w-full space-y-2 ui-section-divider"
    >
      <div className="flex justify-end px-1">
        {secondaryVisibility.canToggle ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-1.5 py-1 text-body-xs text-muted-foreground"
            onClick={() => setSecondaryExpanded((previous) => !previous)}
          >
            {secondaryExpanded
              ? "Show less"
              : `Show ${secondaryVisibility.hiddenCount} more saved ${secondaryVisibility.hiddenCount === 1 ? "item" : "items"}`}
          </Button>
        ) : null}
      </div>

      {loading && !continuation ? (
        <div className="px-1 py-2 text-body-sm text-muted-foreground">
          <Loader2 size={14} className="mr-2 inline animate-spin" />
          Loading saved work…
        </div>
      ) : continuation ? (
        <div className="space-y-2 px-1 py-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-body-sm font-medium text-foreground">
                  {continuation.title}
                </p>
                <Badge
                  variant={continuationStatusVariant(continuation.status)}
                  className="ui-meta-text px-2 py-0"
                >
                  {continuationStatusLabel(continuation.status)}
                </Badge>
              </div>
              {primaryMetaLine ? (
                <p className="text-body-sm text-muted-foreground">
                  {primaryMetaLine}
                </p>
              ) : null}
            </div>
            <Button
              size="sm"
              onClick={() => onContinue(continuation)}
              disabled={pending}
              className="shrink-0"
            >
              {pending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ArrowUpRight size={14} />
              )}
              {buildContinuationActionLabel(continuation)}
            </Button>
          </div>
        </div>
      ) : null}

      {secondaryVisibility.visibleContinuations.length > 0 && (
        <div className="space-y-2">
          <p className="section-kicker px-1 text-muted-foreground/80">
            More saved work
          </p>
          <div className="space-y-0">
            {secondaryVisibility.visibleContinuations.map((item, index) => {
              const itemSupportLine =
                compactSupportText(item.supportText) || item.readinessText
              const itemMetaLine = buildContinuationMetaLine(item)

              return (
                <div
                  key={item.caseId}
                  className={cn("px-1 py-3", index > 0 && "ui-section-divider")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-body-sm font-medium text-foreground">
                          {item.title}
                        </p>
                        <Badge
                          variant={continuationStatusVariant(item.status)}
                          className="ui-meta-text px-2 py-0"
                        >
                          {continuationStatusLabel(item.status)}
                        </Badge>
                      </div>
                      {itemMetaLine ? (
                        <p className="text-body-sm text-muted-foreground">
                          {itemMetaLine}
                        </p>
                      ) : itemSupportLine ? (
                        <p className="text-body-sm text-muted-foreground">
                          {itemSupportLine}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => onContinue(item)}
                      className="shrink-0"
                    >
                      <ArrowUpRight size={14} />
                      {buildContinuationActionLabel(item)}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
