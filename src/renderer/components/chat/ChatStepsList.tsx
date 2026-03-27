import { useEffect, useState } from "react"
import { CheckCircle2 } from "lucide-react"
import { StepsList } from "@/components/output/StepsList"
import {
  formatElapsedCompact,
  formatCost,
} from "@/components/output/outputFormatters"
import { adaptProgressToStepsList } from "@/lib/progress-to-steps-adapter"
import type { ProgressContent } from "@/lib/flow-chat-types"

interface ChatStepsListProps {
  data: ProgressContent
}

function useElapsedTimer(
  startedAt: number | undefined,
  collapsed: boolean | undefined,
): string | null {
  const [elapsed, setElapsed] = useState<string | null>(() =>
    startedAt ? formatElapsedCompact(startedAt) : null,
  )

  useEffect(() => {
    if (!startedAt || collapsed) {
      setElapsed(startedAt ? formatElapsedCompact(startedAt) : null)
      return
    }

    setElapsed(formatElapsedCompact(startedAt))
    const interval = setInterval(() => {
      setElapsed(formatElapsedCompact(startedAt))
    }, 1_000)
    return () => clearInterval(interval)
  }, [startedAt, collapsed])

  return elapsed
}

function formatEstimatedRemaining(seconds: number): string {
  if (seconds < 60) return `~${Math.round(seconds)}s`
  if (seconds < 3600) return `~${Math.round(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return `~${h}h ${m}m`
}

export function ChatStepsList({ data }: ChatStepsListProps) {
  const liveElapsed = useElapsedTimer(data.startedAt, data.collapsed)

  // Collapsed one-liner
  if (data.collapsed && data.collapsedLabel) {
    return (
      <div className="flex items-center gap-2">
        <CheckCircle2
          size={13}
          className="text-status-success shrink-0"
          aria-hidden="true"
        />
        <span className="ui-meta-text text-muted-foreground">
          {data.collapsedLabel}
        </span>
      </div>
    )
  }

  const adapted = adaptProgressToStepsList(data)
  const doneCount = data.steps.filter((s) => s.status === "done").length
  const totalCount = data.steps.length
  const displayElapsed = liveElapsed ?? data.elapsed

  // M5: Cumulative cost from completed steps
  const cumulativeCost = data.steps.reduce(
    (sum, s) => sum + (s.costUsd ?? 0),
    0,
  )

  // M6: Estimated time remaining — only when running with ≥2 done steps
  const isRunning = data.steps.some((s) => s.status === "running")
  const remainingCount = totalCount - doneCount
  let estimatedRemaining: string | null = null
  if (isRunning && doneCount >= 2 && remainingCount > 0 && data.startedAt) {
    const elapsedSec = (Date.now() - data.startedAt) / 1000
    const avgPerStep = elapsedSec / doneCount
    estimatedRemaining = formatEstimatedRemaining(avgPerStep * remainingCount)
  }

  return (
    <div className="space-y-2">
      <StepsList
        nodes={adapted.nodes}
        nodeStates={adapted.nodeStates}
        runtimeMeta={adapted.runtimeMeta}
        activeNodeId={adapted.activeNodeId}
        variant="compact"
        toolDigests={adapted.toolDigests}
        toolActions={adapted.toolActions}
        searchQueries={adapted.searchQueries}
      />

      {/* Footer: single primary status line + optional cost */}
      <div className="flex items-center gap-2 ui-meta-text text-muted-foreground">
        <span>
          {doneCount}/{totalCount} steps &middot; {displayElapsed ?? "0s"}
          {estimatedRemaining ? ` \u00b7 ${estimatedRemaining} remaining` : ""}
        </span>
        {cumulativeCost > 0 && (
          <>
            <span aria-hidden="true">&middot;</span>
            <span>{formatCost(cumulativeCost)}</span>
          </>
        )}
      </div>
    </div>
  )
}
