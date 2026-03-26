import type { StartContent } from "@/lib/flow-chat-types"

interface FlowStartMessageProps {
  flowName: string
  data: StartContent
}

export function FlowStartMessage({ flowName, data }: FlowStartMessageProps) {
  return (
    <div className="space-y-4">
      <p className="ui-meta-label">{flowName}</p>
      <p className="text-body-lg text-foreground">{data.description}</p>
    </div>
  )
}
