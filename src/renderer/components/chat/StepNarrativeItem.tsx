import { useState } from "react"
import { cn } from "@/lib/cn"
import { ChevronRight } from "lucide-react"
import type { StepNarrativeContent } from "@/lib/flow-chat-types"
import { StatusDot } from "@/components/output/StatusDot"
import {
  ToolDigestLine,
  RetryBadge,
  BranchesList,
} from "./StepNarrativeParts"
import { StepOutputPreview } from "./StepOutputPreview"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StepNarrativeItemProps {
  data: StepNarrativeContent
  onRetryFromStep?: (nodeId: string) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapNarrativeStatus(
  status: StepNarrativeContent["status"],
): "pending" | "running" | "done" | "failed" | "blocked" {
  if (status === "skipped") return "pending"
  return status
}

function isInteractive(status: StepNarrativeContent["status"]): boolean {
  return status !== "pending" && status !== "skipped"
}

// ---------------------------------------------------------------------------
// StepNarrativeItem
// ---------------------------------------------------------------------------

export function StepNarrativeItem({
  data,
  onRetryFromStep,
}: StepNarrativeItemProps) {
  // Manual toggle: null = follow auto-expand logic
  const [manualToggle, setManualToggle] = useState<boolean | null>(null)
  const [outputVisible, setOutputVisible] = useState(false)

  const autoExpanded = data.status === "running" || data.status === "failed"
  const expanded = manualToggle ?? autoExpanded
  const interactive = isInteractive(data.status)
  const hasBranches = Boolean(data.branches && data.branches.length > 0)

  const hasExpandableContent =
    interactive &&
    (data.summary ||
      data.output ||
      data.error ||
      (data.toolDigest && data.toolDigest.length > 0) ||
      hasBranches)

  // Meta parts: duration + cost
  const metaParts: string[] = []
  if (data.duration) metaParts.push(data.duration)
  if (data.costUsd != null && data.costUsd > 0)
    metaParts.push(`$${data.costUsd.toFixed(2)}`)

  return (
    <div className="py-1">
      {/* Header row */}
      <div
        className={cn(
          "flex items-center gap-2",
          hasExpandableContent && "cursor-pointer",
        )}
        role={hasExpandableContent ? "button" : undefined}
        tabIndex={hasExpandableContent ? 0 : undefined}
        aria-expanded={hasExpandableContent ? expanded : undefined}
        onClick={() => {
          if (hasExpandableContent) {
            setManualToggle((prev) => {
              const current = prev ?? autoExpanded
              return !current
            })
          }
        }}
        onKeyDown={(e) => {
          if (
            hasExpandableContent &&
            (e.key === "Enter" || e.key === " ")
          ) {
            e.preventDefault()
            setManualToggle((prev) => {
              const current = prev ?? autoExpanded
              return !current
            })
          }
        }}
      >
        {/* Status dot */}
        <StatusDot status={mapNarrativeStatus(data.status)} />

        {/* Retry badge */}
        {data.retryInfo && <RetryBadge info={data.retryInfo} />}

        {/* Label */}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-body-sm",
            data.status === "running" && "font-medium text-foreground",
            data.status === "done" && "text-foreground",
            data.status === "failed" && "text-status-danger",
            data.status === "pending" && "text-muted-foreground",
            data.status === "skipped" && "text-muted-foreground/50",
          )}
        >
          {data.label}
        </span>

        {/* Meta: duration, cost — right side */}
        {metaParts.length > 0 && data.status === "done" && (
          <span className="shrink-0 ui-meta-text text-muted-foreground">
            {metaParts.join(" \u00B7 ")}
          </span>
        )}

        {/* Running indicator text */}
        {data.status === "running" && (
          <span className="shrink-0 ui-meta-text text-muted-foreground">
            running...
          </span>
        )}

        {/* Expand chevron — only for interactive states with content */}
        {hasExpandableContent && (
          <ChevronRight
            size={12}
            aria-hidden="true"
            className={cn(
              "shrink-0 text-muted-foreground/50 ui-chevron ui-motion-fast",
              expanded && "rotate-90",
            )}
          />
        )}
      </div>

      {/* Collapsible body */}
      {hasExpandableContent && (
        <div
          className="ui-collapsible"
          data-open={expanded ? "true" : "false"}
        >
          <div className="ui-collapsible-inner pl-6">
            {/* Error message for failed steps */}
            {data.status === "failed" && data.error && (
              <p className="text-body-sm text-status-danger pt-1">
                {data.error}
              </p>
            )}

            {/* Summary text */}
            {data.summary && (
              <p className="text-body-sm text-foreground-subtle pt-1">
                {data.summary}
              </p>
            )}

            {/* Output preview */}
            {data.status === "done" && data.output && (
              outputVisible ? (
                <StepOutputPreview
                  content={data.output}
                  onHide={() => setOutputVisible(false)}
                />
              ) : (
                <button
                  type="button"
                  className="ui-pressable text-body-sm text-muted-foreground hover:text-foreground ui-motion-fast pt-1"
                  onClick={(e) => {
                    e.stopPropagation()
                    setOutputVisible(true)
                  }}
                >
                  Show output
                </button>
              )
            )}

            {/* Tool digest */}
            {data.toolDigest && data.toolDigest.length > 0 && (
              <ToolDigestLine
                digest={data.toolDigest}
                searchQueries={data.searchQueries}
              />
            )}

            {/* Branches */}
            {data.branches && data.branches.length > 0 && (
              <BranchesList branches={data.branches} />
            )}

            {/* Retry from this step link */}
            {data.status === "failed" && onRetryFromStep && (
              <button
                type="button"
                className="ui-pressable text-body-sm text-status-info pt-1"
                onClick={(e) => {
                  e.stopPropagation()
                  onRetryFromStep(data.nodeId)
                }}
              >
                Retry from this step
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
