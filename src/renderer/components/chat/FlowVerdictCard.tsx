import { useState } from "react"
import { ArrowUpRight, FileText, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StarRating } from "./StarRating"
import { toneToBadge } from "@/lib/surface-tokens"
import type { CompleteContent } from "@/lib/flow-chat-types"

interface FlowVerdictCardProps {
  data: CompleteContent
  flowName: string
  rating: number
  onRate: (rating: number) => void
  onRunAgain: () => void
  onUseInNewFlow?: () => void
  onOpenReport?: (path: string) => void
}

export function FlowVerdictCard({
  data,
  flowName,
  rating,
  onRate,
  onRunAgain,
  onUseInNewFlow,
  onOpenReport,
}: FlowVerdictCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [runAgainClicked, setRunAgainClicked] = useState(false)

  const tone = data.tone ?? "success"
  const toneLabel =
    tone === "warning"
      ? "Completed with notes"
      : tone === "neutral"
        ? "Completed"
        : "Completed"
  const headline = data.artifacts?.[0]?.name ?? "Flow complete"
  const hasHeroContent = !!data.heroArtifactContent

  return (
    <div className="surface-figure px-4 py-4 space-y-3">
      {/* Context line: tone badge + flow name */}
      <div className="flex items-center gap-2">
        <span className={toneToBadge(tone)}>{toneLabel}</span>
        <span className="ui-meta-text text-muted-foreground">{flowName}</span>
      </div>

      {/* Headline */}
      <h3 className="text-title-sm text-foreground">{headline}</h3>

      {/* Summary */}
      <p className="text-body-md text-foreground-subtle line-clamp-3">
        {data.summary}
      </p>

      {/* Findings / limitations (if tone = warning) */}
      {tone === "warning" && data.findings.length > 0 && (
        <ul className="space-y-0.5">
          {data.findings.map((finding, i) => (
            <li
              key={i}
              className="text-body-sm text-foreground-subtle flex items-start gap-1.5"
            >
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
              {finding}
            </li>
          ))}
        </ul>
      )}
      {tone === "warning" && data.limitations.length > 0 && (
        <ul className="space-y-0.5">
          {data.limitations.map((limit, i) => (
            <li
              key={i}
              className="text-body-sm text-foreground-subtle flex items-start gap-1.5"
            >
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-status-warning" />
              {limit}
            </li>
          ))}
        </ul>
      )}

      {/* Hero preview area */}
      {hasHeroContent && (
        <div>
          <div
            className={`bg-surface-2/30 rounded-md p-3 relative ${
              expanded
                ? "max-h-[24rem] overflow-y-auto ui-scroll-region"
                : "max-h-[8rem] overflow-hidden"
            }`}
          >
            <div className="prose-c8c text-body-sm whitespace-pre-wrap">
              {data.heroArtifactContent}
            </div>
            {!expanded && (
              <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[hsl(var(--bg-surface-1))] to-transparent" />
            )}
          </div>
          <button
            type="button"
            className="mt-1.5 ui-pressable text-body-sm text-muted-foreground hover:text-foreground ui-motion-fast"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? "Collapse" : "Show full result"}
          </button>
        </div>
      )}

      {/* Evidence strip + star rating */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 ui-meta-text text-muted-foreground">
          {data.metrics.duration && <span>{data.metrics.duration}</span>}
          {data.metrics.duration && data.metrics.cost && (
            <span aria-hidden="true">&middot;</span>
          )}
          {data.metrics.cost && <span>{data.metrics.cost}</span>}
          {(data.metrics.duration || data.metrics.cost) &&
            data.stepCount != null && (
              <span aria-hidden="true">&middot;</span>
            )}
          {data.stepCount != null && (
            <span>
              {data.stepCount} {data.stepCount === 1 ? "step" : "steps"}
            </span>
          )}
        </div>
        <StarRating value={rating} onChange={onRate} />
      </div>

      {/* Actions row */}
      <div className="flex gap-2 mt-3">
        {data.artifacts.length > 0 && onUseInNewFlow && (
          <Button variant="secondary" size="sm" onClick={onUseInNewFlow}>
            <ArrowUpRight size={14} className="mr-1.5" />
            Use in new flow
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={runAgainClicked}
          onClick={() => {
            setRunAgainClicked(true)
            onRunAgain()
          }}
        >
          <RotateCcw size={14} className="mr-1.5" />
          Run again
        </Button>
      </div>
    </div>
  )
}

/** Compact result chip for secondary artifacts below the verdict card */
export function ResultChip({
  name,
  onClick,
}: {
  name: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full bg-surface-2/30 px-2.5 py-1 text-body-sm text-foreground-subtle hover:bg-surface-3/40 ui-motion-fast"
    >
      <FileText size={12} className="shrink-0 text-muted-foreground" />
      <span className="truncate max-w-[16rem]">{name}</span>
    </button>
  )
}
