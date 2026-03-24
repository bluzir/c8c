import { ChevronRight } from "lucide-react"
import type { FlowFollowUp } from "@/lib/flow-chat-types"

interface FlowFollowUpListProps {
  followUps: FlowFollowUp[]
  onSelect?: (followUp: FlowFollowUp) => void
}

export function FlowFollowUpList({
  followUps,
  onSelect,
}: FlowFollowUpListProps) {
  if (followUps.length === 0) return null

  return (
    <div>
      <p className="section-kicker mb-2">Suggested follow-ups</p>
      <div className="space-y-0.5">
        {followUps.map((followUp, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect?.(followUp)}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left ui-motion-fast hover:bg-surface-2/30"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0">{followUp.emoji}</span>
              <span className="truncate text-body-sm text-foreground">
                {followUp.label}
              </span>
            </div>
            <ChevronRight
              size={14}
              className="shrink-0 text-muted-foreground/50"
            />
          </button>
        ))}
      </div>
    </div>
  )
}
