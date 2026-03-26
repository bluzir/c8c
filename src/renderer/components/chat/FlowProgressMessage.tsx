import { ChatStepsList } from "./ChatStepsList"
import type { ProgressContent } from "@/lib/flow-chat-types"

interface FlowProgressMessageProps {
  data: ProgressContent
}

export function FlowProgressMessage({ data }: FlowProgressMessageProps) {
  return <ChatStepsList data={data} />
}
