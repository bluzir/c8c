import { atom } from "jotai"
import type {
  FlowChatMessage,
  ProgressContent,
  StepNarrativeContent,
} from "@/lib/flow-chat-types"
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

/** Clear flow chat messages for a given workflow key (used on new run start) */
export const clearFlowChatMessagesAtom = atom(
  null,
  (get, set, workflowKey: string) => {
    const prev = get(flowChatMessagesAtom)
    if (!(workflowKey in prev)) return
    const next = { ...prev }
    delete next[workflowKey]
    set(flowChatMessagesAtom, next)
  },
)

/** Atomically replace all messages for a key with a single message (avoids empty-frame flash) */
export const replaceFlowChatMessagesAtom = atom(
  null,
  (get, set, payload: { workflowKey: string; message: FlowChatMessage }) => {
    const prev = get(flowChatMessagesAtom)
    set(flowChatMessagesAtom, {
      ...prev,
      [payload.workflowKey]: [payload.message],
    })
  },
)

/** Current run index within the active chat (increments per run start) */
export const currentRunIndexAtom = atom<number>(0)

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

/** Update a step-narrative message in-place by ID */
export const updateFlowStepNarrativeAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      workflowKey: string
      messageId: string
      data: StepNarrativeContent
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
              content: {
                type: "step-narrative" as const,
                data: payload.data,
              },
            }
          : msg,
      ),
    })
  },
)
