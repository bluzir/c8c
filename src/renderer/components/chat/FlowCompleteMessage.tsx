import { useState } from "react"
import { AlertTriangle, ArrowUpRight, CheckCircle2, RotateCcw } from "lucide-react"
import { FlowResultCard } from "./FlowResultCard"
import { FlowFollowUpList } from "./FlowFollowUpList"
import { Button } from "@/components/ui/button"
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
  const [runAgainClicked, setRunAgainClicked] = useState(false)

  const allFilesDir = data.artifacts[0]?.path?.replace(/[/\\][^/\\]+$/, "")

  return (
    <div className="space-y-4">
      {/* Header — flow name as meta label */}
      <p className="ui-meta-label">{flowName}</p>

      {/* Summary */}
      <p className="text-body-md text-foreground">{data.summary}</p>

      {/* Findings */}
      {data.findings.length > 0 && (
        <div>
          <p className="ui-meta-label">What's inside</p>
          <ul className="mt-1 space-y-0.5">
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
        </div>
      )}

      {/* Limitations */}
      {data.limitations.length > 0 && (
        <div>
          <p className="ui-meta-label text-status-warning">Limitations</p>
          <ul className="mt-1 space-y-0.5">
            {data.limitations.map((limit, i) => (
              <li
                key={i}
                className="text-body-sm text-foreground-subtle flex items-start gap-1.5"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                {limit}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Artifacts — cards + inline "All files" link */}
      {data.artifacts.length > 0 && (
        <div>
          <div className="flex flex-wrap gap-2">
            {data.artifacts.map((artifact, i) => (
              <FlowResultCard
                key={i}
                name={artifact.name}
                kind={artifact.kind}
                sizeLabel={artifact.sizeLabel}
                onClick={() => onOpenReport?.(artifact.path)}
              />
            ))}
          </div>
          {allFilesDir && (
            <button
              type="button"
              className="mt-1.5 ui-pressable ui-meta-text text-muted-foreground hover:text-foreground ui-motion-fast"
              onClick={() => onOpenReport?.(allFilesDir)}
            >
              All files
            </button>
          )}
        </div>
      )}

      {/* Metrics — single status signal for completion, tone-aware */}
      <div className="flex items-center gap-2 ui-section-divider">
        {data.tone === "warning" ? (
          <AlertTriangle
            size={14}
            className="text-status-warning shrink-0"
            aria-hidden="true"
          />
        ) : (
          <CheckCircle2
            size={14}
            className="text-status-success shrink-0"
            aria-hidden="true"
          />
        )}
        <span className="ui-meta-text text-muted-foreground">
          {data.tone === "warning" ? "Completed with notes" : "Completed"} ·{" "}
          {data.metrics.duration} · {data.metrics.cost}
        </span>
      </div>

      {/* Actions: Use in new flow + Run again */}
      <div className="flex flex-wrap items-center gap-2">
        {data.artifacts.length > 0 && onUseInNewFlow && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onUseInNewFlow}
          >
            <ArrowUpRight size={14} className="mr-1.5" />
            Use in new flow
          </Button>
        )}
        {onRunAgain && (
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
        )}
      </div>

      {/* Follow-ups — max 2 visible, expandable overflow */}
      <FlowFollowUpList
        followUps={data.followUps}
        onSelect={onFollowUp}
        disabled={followUpDisabled}
        maxVisible={2}
      />
    </div>
  )
}
