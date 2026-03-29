import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import type { Chat } from "@shared/types"

/** All chats for the current project, keyed by chat ID */
export const chatRegistryAtom = atom<Record<string, Chat>>({})

/** Currently selected chat in the sidebar */
export const selectedChatIdAtom = atomWithStorage<string | null>(
  "c8c:selected-chat-id",
  null,
)

/** Full Chat record for the selected chat */
export const selectedChatAtom = atom<Chat | null>((get) => {
  const id = get(selectedChatIdAtom)
  if (!id) return null
  return get(chatRegistryAtom)[id] ?? null
})

/** Workflow path derived from the selected chat's latest run */
export const derivedWorkflowPathAtom = atom<string | null>((get) => {
  const chat = get(selectedChatAtom)
  if (!chat || chat.runs.length === 0) return null
  return chat.runs[chat.runs.length - 1].workflowPath
})

/** Update a single chat in the registry */
export const updateChatInRegistryAtom = atom(
  null,
  (get, set, updated: Chat) => {
    const prev = get(chatRegistryAtom)
    set(chatRegistryAtom, { ...prev, [updated.id]: updated })
  },
)
