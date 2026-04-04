import { useState, useCallback } from "react"
import { ArrowUpRight, FileText, RotateCcw, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StarRating } from "./StarRating"
import { toneToBadge } from "@/lib/surface-tokens"
import type { CompleteContent } from "@/lib/flow-chat-types"
import {
  ContentDocViewer,
  ContentDocViewerHeader,
} from "@/components/ui/content-doc-viewer"

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
  const [runAgainClicked, setRunAgainClicked] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [fullContent, setFullContent] = useState<string | null>(null)
  const [fullContentLoading, setFullContentLoading] = useState(false)
  const [fullContentError, setFullContentError] = useState<string | null>(null)

  const tone = data.tone ?? "success"
  const toneLabel =
    tone === "warning"
      ? "Completed with notes"
      : tone === "neutral"
        ? "Completed"
        : "Completed"
  const heroArtifact = data.artifacts?.[0]
  const headline = heroArtifact?.name ?? "Flow complete"
  const heroPath = heroArtifact?.path || null
  const hasHeroContent = !!data.heroArtifactContent

  const openViewer = useCallback(() => {
    if (!heroPath) return
    setViewerOpen(true)
    if (fullContent !== null) return
    setFullContentLoading(true)
    setFullContentError(null)
    window.api
      .readFileSlice(heroPath, 512_000)
      .then((content) => {
        setFullContent(content || "")
      })
      .catch(() => {
        setFullContentError("Could not read file")
      })
      .finally(() => {
        setFullContentLoading(false)
      })
  }, [heroPath, fullContent])

  return (
    <div className="surface-figure px-4 py-4 space-y-3">
      {/* Context line: tone badge + flow name */}
      <div className="flex items-center gap-2">
        <span className={toneToBadge(tone)}>{toneLabel}</span>
        <span className="ui-meta-text text-muted-foreground">{flowName}</span>
      </div>

      {/* Headline — clickable when artifact has a path */}
      {heroPath ? (
        <button
          type="button"
          className="flex items-center gap-1.5 text-title-sm text-foreground hover:text-accent-foreground ui-pressable ui-motion-fast text-left"
          onClick={openViewer}
        >
          <FileText size={14} className="shrink-0 text-muted-foreground" />
          {headline}
        </button>
      ) : (
        <h3 className="text-title-sm text-foreground">{headline}</h3>
      )}

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

      {/* Hero preview area — click to open full viewer */}
      {hasHeroContent && (
        <div>
          <button
            type="button"
            className="w-full bg-surface-2/30 rounded-md p-3 relative max-h-[8rem] overflow-hidden text-left cursor-pointer hover:bg-surface-2/50 ui-motion-fast"
            onClick={openViewer}
          >
            <div className="prose-c8c text-body-sm whitespace-pre-wrap">
              {data.heroArtifactContent}
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[hsl(var(--surface-1))] to-transparent" />
          </button>
          <button
            type="button"
            className="mt-1.5 ui-pressable text-body-sm text-muted-foreground hover:text-foreground ui-motion-fast"
            onClick={openViewer}
          >
            Show full result
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

      {/* Inline result viewer dialog */}
      {heroPath && (
        <ContentDocViewer
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          loading={fullContentLoading}
          error={fullContentError}
          body={fullContent}
          emptyMessage="No content in this file."
          header={
            <ContentDocViewerHeader onClose={() => setViewerOpen(false)}>
              <div className="flex items-center gap-2">
                <FileText size={16} className="shrink-0 text-muted-foreground" />
                <h2 className="text-title-sm text-foreground truncate">
                  {headline}
                </h2>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="ui-meta-text text-muted-foreground">
                  {flowName}
                </span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 ui-pressable ui-meta-text text-muted-foreground hover:text-foreground ui-motion-fast"
                  onClick={() => onOpenReport?.(heroPath)}
                >
                  <ExternalLink size={10} />
                  Open file
                </button>
              </div>
            </ContentDocViewerHeader>
          }
        />
      )}
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
