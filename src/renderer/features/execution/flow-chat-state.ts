import { atom } from "jotai"
import type { FlowChatMessage, ProgressContent } from "@/lib/flow-chat-types"
import { selectedWorkflowExecutionKeyAtom } from "./state"

/** All flow chat messages across runs, keyed by workflow key */
export const flowChatMessagesAtom = atom<Record<string, FlowChatMessage[]>>({})

/** Flow chat messages for the currently selected workflow */
export const currentFlowChatMessagesAtom = atom<FlowChatMessage[]>((get) => {
  const key = get(selectedWorkflowExecutionKeyAtom)
  if (!key) return []
  const all = get(flowChatMessagesAtom)
  return all[key] ?? []
})

/** Add a flow chat message for a given workflow */
export const addFlowChatMessageAtom = atom(
  null,
  (get, set, payload: { workflowKey: string; message: FlowChatMessage }) => {
    const prev = get(flowChatMessagesAtom)
    const existing = prev[payload.workflowKey] ?? []
    set(flowChatMessagesAtom, {
      ...prev,
      [payload.workflowKey]: [...existing, payload.message],
    })
  },
)

/** Set of resolved decision message IDs */
export const resolvedDecisionIdsAtom = atom<Set<string>>(new Set<string>())

export const resolveFlowChatDecisionAtom = atom(
  null,
  (get, set, messageId: string) => {
    const prev = get(resolvedDecisionIdsAtom)
    set(resolvedDecisionIdsAtom, new Set([...prev, messageId]))
  },
)

/** Update a progress message in-place by ID */
export const updateFlowProgressAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      workflowKey: string
      messageId: string
      data: ProgressContent
    },
  ) => {
    const prev = get(flowChatMessagesAtom)
    const existing = prev[payload.workflowKey] ?? []
    set(flowChatMessagesAtom, {
      ...prev,
      [payload.workflowKey]: existing.map((msg) =>
        msg.id === payload.messageId
          ? {
              ...msg,
              content: { type: "progress" as const, data: payload.data },
            }
          : msg,
      ),
    })
  },
)
