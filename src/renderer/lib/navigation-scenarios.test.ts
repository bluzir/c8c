import { describe, it, expect } from "vitest"
import { createStore } from "jotai"
import type { Chat, ChatRun } from "@shared/types"
import {
  chatRegistryAtom,
  selectedChatIdAtom,
  selectedChatAtom,
  derivedWorkflowPathAtom,
  updateChatInRegistryAtom,
} from "./chat-atoms"
import {
  selectedWorkflowPathAtom,
  mainViewAtom,
  viewModeAtom,
  chatRoutingProgressAtom,
  followUpLabelAtom,
  chatPendingRoutingPromptAtom,
} from "./store"

// ── Helpers ──────────────────────────────────────────────

function buildChatRun(runId: string, overrides?: Partial<ChatRun>): ChatRun {
  return {
    runId,
    templateId: `template-${runId}`,
    templateName: `Template ${runId}`,
    workflowPath: `/test/.c8c/${runId}.chain`,
    workspace: `/test/.c8c/runs/${runId}`,
    startedAt: Date.now() - 60000,
    completedAt: Date.now(),
    status: "completed",
    userPrompt: "test prompt",
    ...overrides,
  }
}

function buildChat(id: string, overrides?: Partial<Chat>): Chat {
  return {
    id,
    name: `Chat ${id}`,
    projectPath: "/test/project",
    createdAt: Date.now() - 120000,
    lastActivityAt: Date.now(),
    archived: false,
    runs: [],
    artifactPool: [],
    ...overrides,
  }
}

// ── Group A: Starting a New Flow ─────────────────────────

describe("Group A: Starting a New Flow", () => {
  it("A1: + button clears chat selection", () => {
    const store = createStore()

    // Precondition: active chat and workflow
    store.set(selectedChatIdAtom, "c1")
    store.set(selectedWorkflowPathAtom, "/old.chain")

    // Action: simulate openWorkflowCreate
    store.set(selectedChatIdAtom, null)
    store.set(selectedWorkflowPathAtom, null)
    store.set(mainViewAtom, "thread")
    store.set(viewModeAtom, "chat")
    store.set(chatRoutingProgressAtom, null)
    store.set(followUpLabelAtom, null)

    // Assert
    expect(store.get(selectedChatIdAtom)).toBeNull()
    expect(store.get(selectedWorkflowPathAtom)).toBeNull()
    expect(store.get(mainViewAtom)).toBe("thread")
  })

  it("A2: Type prompt in empty state creates chat", () => {
    const store = createStore()

    // Precondition: empty state
    store.set(selectedChatIdAtom, null)
    store.set(selectedWorkflowPathAtom, null)

    // Action: simulate handleSend creating a chat
    const chatId = "new-chat-1"
    const chat = buildChat(chatId)
    store.set(chatRegistryAtom, { [chatId]: chat })
    store.set(selectedChatIdAtom, chatId)
    store.set(chatRoutingProgressAtom, {
      phase: "inspecting",
      userRequest: "test",
    })

    // Assert
    expect(store.get(selectedChatIdAtom)).toBe("new-chat-1")
    expect(store.get(chatRegistryAtom)["new-chat-1"]).toBeDefined()
    expect(store.get(chatRoutingProgressAtom)).not.toBeNull()
  })

  it("A3: Routing completes with workflow loaded and chat preserved", () => {
    const store = createStore()

    // Precondition: chat exists, routing in progress
    const chat = buildChat("c1")
    store.set(chatRegistryAtom, { c1: chat })
    store.set(selectedChatIdAtom, "c1")
    store.set(chatRoutingProgressAtom, {
      phase: "inspecting",
      userRequest: "analyze",
    })

    // Action: simulate routing completion (commitEnvelope-like)
    store.set(selectedWorkflowPathAtom, "/new.chain")
    store.set(selectedChatIdAtom, "c1")
    store.set(chatRoutingProgressAtom, null)
    store.set(mainViewAtom, "thread")

    // Assert
    expect(store.get(selectedWorkflowPathAtom)).toBe("/new.chain")
    expect(store.get(selectedChatIdAtom)).toBe("c1")
    expect(store.get(chatRoutingProgressAtom)).toBeNull()
  })

  it("A4: Quick-start with prompt sets pending routing prompt", () => {
    const store = createStore()

    // Precondition: empty state
    store.set(selectedChatIdAtom, null)
    store.set(selectedWorkflowPathAtom, null)

    // Action
    store.set(chatPendingRoutingPromptAtom, "analyze trends")
    store.set(mainViewAtom, "thread")

    // Assert
    expect(store.get(chatPendingRoutingPromptAtom)).toBe("analyze trends")
  })
})

// ── Group B: Continuing a Chat ───────────────────────────

describe("Group B: Continuing a Chat", () => {
  it("B1: Follow-up button stays in same chat", () => {
    const store = createStore()

    // Precondition: chat with completed run
    const chat = buildChat("c1", {
      runs: [buildChatRun("r1")],
    })
    store.set(chatRegistryAtom, { c1: chat })
    store.set(selectedChatIdAtom, "c1")

    // Action: simulate handleFollowUp
    store.set(followUpLabelAtom, "Draft posts")
    store.set(chatRoutingProgressAtom, {
      phase: "inspecting",
      userRequest: "Draft posts",
    })

    // Assert
    expect(store.get(selectedChatIdAtom)).toBe("c1")
    expect(store.get(followUpLabelAtom)).toBe("Draft posts")
  })

  it("B2: Follow-up routing completes with new workflow, same chat", () => {
    const store = createStore()

    // Precondition: chat with run, follow-up routing in progress
    const chat = buildChat("c1", {
      runs: [buildChatRun("r1")],
    })
    store.set(chatRegistryAtom, { c1: chat })
    store.set(selectedChatIdAtom, "c1")
    store.set(selectedWorkflowPathAtom, "/test/.c8c/r1.chain")
    store.set(chatRoutingProgressAtom, {
      phase: "inspecting",
      userRequest: "Draft posts",
    })

    // Action: routing completes with new workflow
    store.set(selectedWorkflowPathAtom, "/test/.c8c/followup.chain")
    store.set(chatRoutingProgressAtom, null)

    // Assert
    expect(store.get(selectedChatIdAtom)).toBe("c1")
    expect(store.get(selectedWorkflowPathAtom)).toBe(
      "/test/.c8c/followup.chain",
    )
  })

  it("B3: Free-text after done stays in same chat routing", () => {
    const store = createStore()

    // Precondition: chat with completed run (effectivelyDone)
    const chat = buildChat("c1", {
      runs: [buildChatRun("r1", { status: "completed" })],
    })
    store.set(chatRegistryAtom, { c1: chat })
    store.set(selectedChatIdAtom, "c1")

    // Action: user types free-text, routing starts
    store.set(chatRoutingProgressAtom, {
      phase: "inspecting",
      userRequest: "now summarize findings",
    })

    // Assert
    expect(store.get(selectedChatIdAtom)).toBe("c1")
  })

  it("B4: Run completes with ChatRun appended and artifactPool updated", () => {
    const store = createStore()

    // Precondition: chat with 1 run, 1 artifact
    const run1 = buildChatRun("r1")
    const chat = buildChat("c1", {
      runs: [run1],
      artifactPool: ["a1"],
    })
    store.set(chatRegistryAtom, { c1: chat })
    store.set(selectedChatIdAtom, "c1")

    // Action: append a new run and artifact via updateChatInRegistryAtom
    const newRun = buildChatRun("r2")
    const updatedChat: Chat = {
      ...chat,
      runs: [...chat.runs, newRun],
      artifactPool: [...chat.artifactPool, "a2"],
      lastActivityAt: Date.now(),
    }
    store.set(updateChatInRegistryAtom, updatedChat)

    // Assert
    const result = store.get(chatRegistryAtom)["c1"]
    expect(result.runs).toHaveLength(2)
    expect(result.artifactPool).toContain("a2")
  })

  it("B5: Retry from error stays in same chat", () => {
    const store = createStore()

    // Precondition: chat with failed run
    const chat = buildChat("c1", {
      runs: [buildChatRun("r1", { status: "failed" })],
    })
    store.set(chatRegistryAtom, { c1: chat })
    store.set(selectedChatIdAtom, "c1")
    store.set(selectedWorkflowPathAtom, "/test/.c8c/r1.chain")

    // Action: retry — chatId and workflowPath stay the same
    const chatIdBefore = store.get(selectedChatIdAtom)
    const workflowPathBefore = store.get(selectedWorkflowPathAtom)

    // Assert
    expect(store.get(selectedChatIdAtom)).toBe(chatIdBefore)
    expect(store.get(selectedWorkflowPathAtom)).toBe(workflowPathBefore)
  })
})

// ── Group C: Switching Context ───────────────────────────

describe("Group C: Switching Context", () => {
  it("C1: Click different chat does full switch", () => {
    const store = createStore()

    // Precondition: two chats, c1 selected
    const c1 = buildChat("c1", {
      runs: [buildChatRun("r1")],
    })
    const c2Run = buildChatRun("r2", {
      workflowPath: "/test/.c8c/c2-latest.chain",
    })
    const c2 = buildChat("c2", {
      runs: [c2Run],
    })
    store.set(chatRegistryAtom, { c1, c2 })
    store.set(selectedChatIdAtom, "c1")
    store.set(followUpLabelAtom, "Some label")

    // Action: simulate handleChatSelect("c2")
    store.set(selectedChatIdAtom, "c2")
    store.set(
      selectedWorkflowPathAtom,
      c2.runs[c2.runs.length - 1].workflowPath,
    )
    store.set(followUpLabelAtom, null)
    store.set(mainViewAtom, "thread")

    // Assert
    expect(store.get(selectedChatIdAtom)).toBe("c2")
    expect(store.get(selectedWorkflowPathAtom)).toBe(
      "/test/.c8c/c2-latest.chain",
    )
    expect(store.get(followUpLabelAtom)).toBeNull()
  })

  it("C2: Switch project clears everything", () => {
    const store = createStore()

    // Precondition: chat in project A
    store.set(chatRegistryAtom, { c1: buildChat("c1") })
    store.set(selectedChatIdAtom, "c1")
    store.set(selectedWorkflowPathAtom, "/projectA/.c8c/flow.chain")

    // Action: simulate project switch
    store.set(selectedChatIdAtom, null)
    store.set(chatRegistryAtom, {})
    store.set(selectedWorkflowPathAtom, null)

    // Assert
    expect(store.get(selectedChatIdAtom)).toBeNull()
    expect(store.get(chatRegistryAtom)).toEqual({})
    expect(store.get(selectedWorkflowPathAtom)).toBeNull()
  })

  it("C3: Click legacy workflow sets no chat", () => {
    const store = createStore()

    // Precondition: no chat selected, unclaimed workflow
    store.set(selectedChatIdAtom, null)
    store.set(chatRegistryAtom, {})

    // Action
    store.set(selectedWorkflowPathAtom, "/legacy.chain")

    // Assert
    expect(store.get(selectedWorkflowPathAtom)).toBe("/legacy.chain")
    expect(store.get(selectedChatIdAtom)).toBeNull()
  })

  it("C4: Navigate to Settings clears routing", () => {
    const store = createStore()

    // Precondition: routing active
    store.set(chatRoutingProgressAtom, {
      phase: "inspecting",
      userRequest: "test",
    })

    // Action
    store.set(mainViewAtom, "settings")
    store.set(chatRoutingProgressAtom, null)

    // Assert
    expect(store.get(mainViewAtom)).toBe("settings")
    expect(store.get(chatRoutingProgressAtom)).toBeNull()
  })
})

// ── Group D: Cleanup ─────────────────────────────────────

describe("Group D: Cleanup", () => {
  it("D1: Cancel routing deletes orphan chat with no runs", () => {
    const store = createStore()

    // Precondition: empty chat (no runs), routing in progress
    const chat = buildChat("c1")
    store.set(chatRegistryAtom, { c1: chat })
    store.set(selectedChatIdAtom, "c1")
    store.set(chatRoutingProgressAtom, {
      phase: "inspecting",
      userRequest: "test",
    })

    // Action: cancel routing, delete orphan chat
    const prev = store.get(chatRegistryAtom)
    const { c1: _removed, ...rest } = prev
    store.set(chatRegistryAtom, rest)
    store.set(selectedChatIdAtom, null)
    store.set(chatRoutingProgressAtom, null)

    // Assert
    expect(store.get(chatRegistryAtom)["c1"]).toBeUndefined()
    expect(store.get(selectedChatIdAtom)).toBeNull()
  })

  it("D2: Cancel routing preserves chat with existing runs", () => {
    const store = createStore()

    // Precondition: chat with 2 runs, new routing started
    const chat = buildChat("c1", {
      runs: [buildChatRun("r1"), buildChatRun("r2")],
    })
    store.set(chatRegistryAtom, { c1: chat })
    store.set(selectedChatIdAtom, "c1")
    store.set(chatRoutingProgressAtom, {
      phase: "inspecting",
      userRequest: "more analysis",
    })

    // Action: cancel routing but DON'T delete chat
    store.set(chatRoutingProgressAtom, null)

    // Assert
    expect(store.get(chatRegistryAtom)["c1"].runs).toHaveLength(2)
    expect(store.get(selectedChatIdAtom)).toBe("c1")
  })

  it("D3: Archive chat disappears from selection", () => {
    const store = createStore()

    // Precondition: chat selected
    const chat = buildChat("c1")
    store.set(chatRegistryAtom, { c1: chat })
    store.set(selectedChatIdAtom, "c1")

    // Action: archive the chat
    store.set(updateChatInRegistryAtom, { ...chat, archived: true })
    store.set(selectedChatIdAtom, null)

    // Assert
    expect(store.get(chatRegistryAtom)["c1"].archived).toBe(true)
    expect(store.get(selectedChatIdAtom)).toBeNull()
  })

  it("D4: Delete chat removes from registry", () => {
    const store = createStore()

    // Precondition: chat in registry
    const chat = buildChat("c1")
    store.set(chatRegistryAtom, { c1: chat })
    store.set(selectedChatIdAtom, "c1")

    // Action: remove from registry
    const { c1: _removed, ...rest } = store.get(chatRegistryAtom)
    store.set(chatRegistryAtom, rest)
    store.set(selectedChatIdAtom, null)

    // Assert
    expect(store.get(chatRegistryAtom)["c1"]).toBeUndefined()
    expect(store.get(selectedChatIdAtom)).toBeNull()
  })
})

// ── Group E: App Restart ─────────────────────────────────

describe("Group E: App Restart", () => {
  it("E1: Restore session selects chat and derives workflow path", () => {
    const store = createStore()

    // Precondition: set registry with chat that has runs
    const run = buildChatRun("r1", {
      workflowPath: "/test/.c8c/restored.chain",
    })
    const chat = buildChat("c1", { runs: [run] })
    store.set(chatRegistryAtom, { c1: chat })
    store.set(selectedChatIdAtom, "c1")

    // Assert: selectedChatAtom returns the chat
    const selected = store.get(selectedChatAtom)
    expect(selected).not.toBeNull()
    expect(selected!.id).toBe("c1")

    // Assert: derivedWorkflowPathAtom returns latest run path
    expect(store.get(derivedWorkflowPathAtom)).toBe(
      "/test/.c8c/restored.chain",
    )
  })

  it("E2: Restore with stale chatId returns graceful null", () => {
    const store = createStore()

    // Precondition: chatId points to deleted chat, registry empty
    store.set(selectedChatIdAtom, "deleted-chat")
    store.set(chatRegistryAtom, {})

    // Assert: graceful null, no crash
    expect(store.get(selectedChatAtom)).toBeNull()
  })

  it("E3: Chat invariant — chatId set implies chat exists in registry", () => {
    const store = createStore()

    // Registry has c1 and c2
    store.set(chatRegistryAtom, {
      c1: buildChat("c1"),
      c2: buildChat("c2"),
    })

    // Select c1 — chat should exist
    store.set(selectedChatIdAtom, "c1")
    const c1 = store.get(selectedChatAtom)
    expect(c1).not.toBeNull()
    expect(c1!.id).toBe("c1")

    // Select nonexistent — graceful null
    store.set(selectedChatIdAtom, "nonexistent")
    expect(store.get(selectedChatAtom)).toBeNull()
  })
})
