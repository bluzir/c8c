import type { StartContent } from "@/lib/flow-chat-types"

interface FlowStartMessageProps {
  flowName: string
  data: StartContent
}

export function FlowStartMessage({ flowName, data }: FlowStartMessageProps) {
  return (
    <div className="space-y-2">
      <p className="ui-meta-label text-muted-foreground">{flowName}</p>
      <p className="text-body-sm text-foreground">{data.description}</p>
    </div>
  )
}
