import { FlowResultCard, AllFilesButton } from "./FlowResultCard"
import { FlowFollowUpList } from "./FlowFollowUpList"
import type { CompleteContent, FlowFollowUp } from "@/lib/flow-chat-types"

interface FlowCompleteMessageProps {
  flowName: string
  data: CompleteContent
  onFollowUp?: (followUp: FlowFollowUp) => void
  onOpenReport?: (path: string) => void
}

export function FlowCompleteMessage({
  flowName,
  data,
  onFollowUp,
  onOpenReport,
}: FlowCompleteMessageProps) {
  return (
    <div className="space-y-4">
      {/* Header — flow name as meta label */}
      <p className="ui-meta-label text-muted-foreground">{flowName}</p>

      {/* Summary */}
      <p className="text-[15px] leading-relaxed text-foreground">
        {data.summary}
      </p>

      {/* Findings */}
      {data.findings.length > 0 && (
        <div>
          <p className="ui-meta-label text-muted-foreground">What's inside</p>
          <ul className="mt-1 space-y-0.5">
            {data.findings.map((finding, i) => (
              <li
                key={i}
                className="text-[15px] leading-relaxed text-foreground"
              >
                • {finding}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Limitations — colored label, no background box */}
      {data.limitations.length > 0 && (
        <div>
          <p className="ui-meta-label text-status-warning">Important</p>
          {data.limitations.map((limit, i) => (
            <p
              key={i}
              className="mt-1 text-[15px] leading-relaxed text-foreground"
            >
              {limit}
            </p>
          ))}
        </div>
      )}

      {/* Artifacts */}
      {data.artifacts.length > 0 && (
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
          <AllFilesButton />
        </div>
      )}

      {/* Metrics — single status signal for completion */}
      <div className="flex items-center gap-2 ui-section-divider pt-2">
        <span className="text-status-success">✓</span>
        <span className="ui-meta-text text-muted-foreground">
          Completed · {data.metrics.duration} · {data.metrics.cost}
        </span>
      </div>

      {/* Follow-ups */}
      <FlowFollowUpList followUps={data.followUps} onSelect={onFollowUp} />
    </div>
  )
}
