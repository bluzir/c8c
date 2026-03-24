import { Badge } from "@/components/ui/badge"
import type { StartContent } from "@/lib/flow-chat-types"

interface FlowStartMessageProps {
  flowName: string
  data: StartContent
}

export function FlowStartMessage({ flowName, data }: FlowStartMessageProps) {
  return (
    <div className="rounded-lg border-l-[3px] border-l-[hsl(270_60%_60%)] bg-surface-1/60 px-3.5 py-3 space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" size="compact">
          {flowName}
        </Badge>
      </div>

      {/* Description */}
      <p className="text-body-sm text-foreground-subtle">{data.description}</p>
    </div>
  )
}
