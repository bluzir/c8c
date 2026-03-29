import { describe, it, expect } from "vitest"
import { createStore } from "jotai"
import {
  chatRegistryAtom,
  selectedChatIdAtom,
  selectedChatAtom,
  derivedWorkflowPathAtom,
  updateChatInRegistryAtom,
} from "./chat-atoms"
import {
  chatIdForWorkflowPathAtom,
  selectedWorkflowPathAtom,
} from "./store"
import type { Chat } from "@shared/types"

function buildChat(id: string, overrides?: Partial<Chat>): Chat {
  return {
    id,
    name: `Chat ${id}`,
    projectPath: "/test",
    createdAt: 1000,
    lastActivityAt: 2000,
    archived: false,
    runs: [],
    artifactPool: [],
    ...overrides,
  }
}

describe("chat atoms", () => {
  it("selectedChatAtom returns chat from registry by selectedChatId", () => {
    const store = createStore()
    const chat = buildChat("c1")
    store.set(chatRegistryAtom, { c1: chat })
    store.set(selectedChatIdAtom, "c1")
    expect(store.get(selectedChatAtom)).toEqual(chat)
  })

  it("selectedChatAtom returns null when no chat selected", () => {
    const store = createStore()
    store.set(chatRegistryAtom, {})
    store.set(selectedChatIdAtom, null)
    expect(store.get(selectedChatAtom)).toBeNull()
  })

  it("selectedChatAtom returns null when chatId not in registry", () => {
    const store = createStore()
    store.set(chatRegistryAtom, {})
    store.set(selectedChatIdAtom, "nonexistent")
    expect(store.get(selectedChatAtom)).toBeNull()
  })

  it("derivedWorkflowPathAtom returns latest run workflowPath", () => {
    const store = createStore()
    const chat = buildChat("c1", {
      runs: [
        {
          runId: "r1",
          templateId: "t1",
          templateName: "T1",
          workflowPath: "/path/a.chain",
          workspace: "/ws/r1",
          startedAt: 1000,
          status: "completed",
          userPrompt: "test",
        },
        {
          runId: "r2",
          templateId: "t2",
          templateName: "T2",
          workflowPath: "/path/b.chain",
          workspace: "/ws/r2",
          startedAt: 2000,
          status: "running",
          userPrompt: "test2",
        },
      ],
    })
    store.set(chatRegistryAtom, { c1: chat })
    store.set(selectedChatIdAtom, "c1")
    expect(store.get(derivedWorkflowPathAtom)).toBe("/path/b.chain")
  })

  it("derivedWorkflowPathAtom returns null when chat has no runs", () => {
    const store = createStore()
    store.set(chatRegistryAtom, { c1: buildChat("c1") })
    store.set(selectedChatIdAtom, "c1")
    expect(store.get(derivedWorkflowPathAtom)).toBeNull()
  })

  it("derivedWorkflowPathAtom returns null when no chat selected", () => {
    const store = createStore()
    store.set(selectedChatIdAtom, null)
    expect(store.get(derivedWorkflowPathAtom)).toBeNull()
  })

  it("updateChatInRegistryAtom updates a single chat", () => {
    const store = createStore()
    const chat = buildChat("c1")
    store.set(chatRegistryAtom, { c1: chat })
    const updated = { ...chat, name: "Updated" }
    store.set(updateChatInRegistryAtom, updated)
    expect(store.get(chatRegistryAtom)["c1"].name).toBe("Updated")
  })

  it("updateChatInRegistryAtom does not affect other chats", () => {
    const store = createStore()
    store.set(chatRegistryAtom, { c1: buildChat("c1"), c2: buildChat("c2") })
    store.set(updateChatInRegistryAtom, { ...buildChat("c1"), name: "Changed" })
    expect(store.get(chatRegistryAtom)["c2"].name).toBe("Chat c2")
  })

  it("chatIdForWorkflowPathAtom finds chat by workflowPath", () => {
    const store = createStore()
    const chat = buildChat("c1", {
      runs: [
        {
          runId: "r1",
          templateId: "t1",
          templateName: "T1",
          workflowPath: "/path/a.chain",
          workspace: "/ws/r1",
          startedAt: 1000,
          status: "completed",
          userPrompt: "test",
        },
      ],
    })
    store.set(chatRegistryAtom, { c1: chat })
    store.set(selectedWorkflowPathAtom, "/path/a.chain")
    expect(store.get(chatIdForWorkflowPathAtom)).toBe("c1")
  })

  it("chatIdForWorkflowPathAtom returns null for unclaimed workflow", () => {
    const store = createStore()
    store.set(chatRegistryAtom, {})
    store.set(selectedWorkflowPathAtom, "/path/orphan.chain")
    expect(store.get(chatIdForWorkflowPathAtom)).toBeNull()
  })

  it("chatIdForWorkflowPathAtom returns null when no workflow selected", () => {
    const store = createStore()
    store.set(chatRegistryAtom, { c1: buildChat("c1") })
    store.set(selectedWorkflowPathAtom, null)
    expect(store.get(chatIdForWorkflowPathAtom)).toBeNull()
  })
})
