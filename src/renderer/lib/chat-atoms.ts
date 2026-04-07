import { atom } from "jotai"
import type { Chat } from "@shared/types"
import { validatedAtomWithStorage } from "./validated-atom"

const isNullableString = (v: unknown): v is string | null =>
  v === null || typeof v === 'string'

/** All chats for the current project, keyed by chat ID */
export const chatRegistryAtom = atom<Record<string, Chat>>({})

/** Currently selected chat in the sidebar */
export const selectedChatIdAtom = validatedAtomWithStorage<string | null>(
  "c8c:selected-chat-id", null, isNullableString,
)

/** Full Chat record for the selected chat */
export const selectedChatAtom = atom<Chat | null>((get) => {
  const id = get(selectedChatIdAtom)
  if (!id) return null
  return get(chatRegistryAtom)[id] ?? null
})

/** Workflow path derived from the selected chat's latest run or chat.workflowPath */
export const derivedWorkflowPathAtom = atom<string | null>((get) => {
  const chat = get(selectedChatAtom)
  if (!chat) return null
  if (chat.runs.length > 0) {
    return chat.runs[chat.runs.length - 1].workflowPath
  }
  return chat.workflowPath ?? null
})

/** Update a single chat in the registry */
export const updateChatInRegistryAtom = atom(
  null,
  (get, set, updated: Chat) => {
    const prev = get(chatRegistryAtom)
    set(chatRegistryAtom, { ...prev, [updated.id]: updated })
  },
)
