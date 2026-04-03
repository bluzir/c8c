// ---------------------------------------------------------------------------
// StepNarrativeSummaryStrip — aggregate progress footer for step narratives
// ---------------------------------------------------------------------------

interface StepNarrativeSummaryStripProps {
  doneCount: number
  totalCount: number
  elapsedMs: number
  costUsd?: number
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  if (totalSeconds < 3600) {
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${m}m ${s}s`
  }
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.round((totalSeconds % 3600) / 60)
  return `${h}h ${m}m`
}

export function StepNarrativeSummaryStrip({
  doneCount,
  totalCount,
  elapsedMs,
  costUsd,
}: StepNarrativeSummaryStripProps) {
  const parts: string[] = []

  parts.push(`${doneCount}/${totalCount} steps`)
  parts.push(formatElapsed(elapsedMs))

  if (costUsd != null && costUsd > 0) {
    parts.push(`$${costUsd.toFixed(2)}`)
  }

  return (
    <div className="border-t border-hairline pt-1 mt-1 ui-meta-text text-muted-foreground">
      {parts.join(" \u00B7 ")}
    </div>
  )
}
