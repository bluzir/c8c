import { useState } from "react"
import { useAtom } from "jotai"
import { FlowVerdictCard, ResultChip } from "./FlowVerdictCard"
import { FlowFollowUpList } from "./FlowFollowUpList"
import { runRatingsAtom } from "@/lib/store"
import type { CompleteContent, FlowFollowUp } from "@/lib/flow-chat-types"

interface FlowCompleteMessageProps {
  flowName: string
  data: CompleteContent
  onFollowUp?: (followUp: FlowFollowUp) => void
  followUpDisabled?: boolean
  onOpenReport?: (path: string) => void
  onRunAgain?: () => void
  onUseInNewFlow?: () => void
}

export function FlowCompleteMessage({
  flowName,
  data,
  onFollowUp,
  followUpDisabled,
  onOpenReport,
  onRunAgain,
  onUseInNewFlow,
}: FlowCompleteMessageProps) {
  const [ratings, setRatings] = useAtom(runRatingsAtom)
  const [showAllChips, setShowAllChips] = useState(false)
  const [showAllFollowUps, setShowAllFollowUps] = useState(false)

  const currentRating = data.runId ? (ratings[data.runId] ?? 0) : 0

  const handleRate = (rating: number) => {
    if (!data.runId) return
    setRatings((prev) => ({ ...prev, [data.runId]: rating }))
    // TODO: call window.api.rateRun(workspacePath, rating) — IPC exists, but
    // CompleteContent doesn't carry workspacePath yet. Wire once workspace is
    // threaded into the chat message model.
  }

  const handleRunAgain = () => {
    onRunAgain?.()
  }

  // Secondary artifacts: all except the first (which is the headline artifact)
  const secondaryArtifacts = data.artifacts.slice(1)
  const hasOverflowChips = secondaryArtifacts.length > 1
  const visibleChips = showAllChips
    ? secondaryArtifacts
    : secondaryArtifacts.slice(0, 1)

  // Follow-ups: max 1 visible + overflow
  const hasOverflowFollowUps = data.followUps.length > 1
  const visibleFollowUps = showAllFollowUps
    ? data.followUps
    : data.followUps.slice(0, 1)

  return (
    <div className="space-y-3">
      {/* Verdict card — the Level 3 figure */}
      <FlowVerdictCard
        data={data}
        flowName={flowName}
        rating={currentRating}
        onRate={handleRate}
        onRunAgain={handleRunAgain}
        onUseInNewFlow={onUseInNewFlow}
        onOpenReport={onOpenReport}
      />

      {/* Secondary result chips — flat Level 0 ground */}
      {secondaryArtifacts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleChips.map((artifact, i) => (
            <ResultChip
              key={i}
              name={artifact.name}
              onClick={() => onOpenReport?.(artifact.path)}
            />
          ))}
          {hasOverflowChips && !showAllChips && (
            <button
              type="button"
              className="text-body-sm text-muted-foreground hover:text-foreground ui-pressable ui-motion-fast"
              onClick={() => setShowAllChips(true)}
            >
              +{secondaryArtifacts.length - 1} more
            </button>
          )}
        </div>
      )}

      {/* Follow-ups — capped at 1 visible + overflow */}
      {visibleFollowUps.length > 0 && (
        <div>
          <FlowFollowUpList
            followUps={visibleFollowUps}
            onSelect={onFollowUp}
            disabled={followUpDisabled}
          />
          {hasOverflowFollowUps && !showAllFollowUps && (
            <button
              type="button"
              className="mt-1 text-body-sm text-muted-foreground hover:text-foreground ui-pressable ui-motion-fast"
              onClick={() => setShowAllFollowUps(true)}
            >
              +{data.followUps.length - 1} more follow-ups
            </button>
          )}
        </div>
      )}
    </div>
  )
}
