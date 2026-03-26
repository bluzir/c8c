import { CheckCircle2 } from "lucide-react"
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
      <p className="ui-meta-label">{flowName}</p>

      {/* Summary */}
      <p className="text-body-lg text-foreground">{data.summary}</p>

      {/* Findings */}
      {data.findings.length > 0 && (
        <div>
          <p className="ui-meta-label">What's inside</p>
          <ul className="mt-1 space-y-0.5">
            {data.findings.map((finding, i) => (
              <li
                key={i}
                className="text-body-lg text-foreground-subtle flex items-start gap-1.5"
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
                className="text-body-lg text-foreground-subtle flex items-start gap-1.5"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                {limit}
              </li>
            ))}
          </ul>
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
          <AllFilesButton
            onClick={() => {
              const dir = data.artifacts[0]?.path?.replace(/\/[^/]+$/, "")
              if (dir) onOpenReport?.(dir)
            }}
          />
        </div>
      )}

      {/* Metrics — single status signal for completion */}
      <div className="flex items-center gap-2 ui-section-divider">
        <CheckCircle2
          size={14}
          className="text-status-success shrink-0"
          aria-hidden="true"
        />
        <span className="ui-meta-text text-muted-foreground">
          Completed · {data.metrics.duration} · {data.metrics.cost}
        </span>
      </div>

      {/* Follow-ups */}
      <FlowFollowUpList followUps={data.followUps} onSelect={onFollowUp} />
    </div>
  )
}
