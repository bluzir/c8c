import { createStore } from "jotai"
import { describe, it, expect } from "vitest"
import {
  EPHEMERAL_RESETS,
  resetEphemeralStateAtom,
  commitNavigationAtom,
} from "./navigation"
import {
  chatMessagesAtom,
  chatStatusAtom,
  chatSessionIdAtom,
  chatUndoStackAtom,
  chatRoutingProgressAtom,
  chatPendingRoutingPromptAtom,
  followUpLabelAtom,
  batchStatusAtom,
  batchIdAtom,
  batchErrorAtom,
  batchItemsAtom,
  batchSummaryAtom,
  batchProgressAtom,
  workflowCreateDraftPromptAtom,
  workflowCreateSourceArtifactsAtom,
  workflowCreateSourceAttachmentsAtom,
  mainViewAtom,
  viewModeAtom,
  selectedProjectAtom,
} from "./store"
import { selectedPastRunAtom } from "@/features/execution"

function dirtyStore() {
  const store = createStore()
  store.set(chatMessagesAtom, [
    { id: "m1", role: "user", content: "hello" } as any,
  ])
  store.set(chatStatusAtom, "streaming")
  store.set(chatSessionIdAtom, "session-1")
  store.set(chatUndoStackAtom, [{} as any])
  store.set(chatRoutingProgressAtom, {
    phase: "inspecting",
    userRequest: "test",
  })
  store.set(chatPendingRoutingPromptAtom, "pending prompt")
  store.set(followUpLabelAtom, "Draft posts")
  store.set(batchStatusAtom, "running")
  store.set(batchIdAtom, "batch-1")
  store.set(batchErrorAtom, "oops")
  store.set(batchItemsAtom, [{ name: "item" } as any])
  store.set(batchSummaryAtom, { text: "done" } as any)
  store.set(batchProgressAtom, { completed: 5, total: 10, running: 2 })
  store.set(workflowCreateDraftPromptAtom, "draft prompt")
  store.set(workflowCreateSourceArtifactsAtom, [{ id: "a1" } as any])
  store.set(workflowCreateSourceAttachmentsAtom, [{ kind: "file" } as any])
  return store
}

describe("EPHEMERAL_RESETS", () => {
  it("contains entries for all ephemeral atom categories", () => {
    // Sanity: at least 17 entries as specified
    expect(EPHEMERAL_RESETS.length).toBeGreaterThanOrEqual(17)
  })
})

describe("resetEphemeralStateAtom", () => {
  it("resets all ephemeral atoms to defaults", () => {
    const store = dirtyStore()

    store.set(resetEphemeralStateAtom)

    expect(store.get(chatMessagesAtom)).toEqual([])
    expect(store.get(chatStatusAtom)).toBe("idle")
    expect(store.get(chatSessionIdAtom)).toBeNull()
    expect(store.get(chatUndoStackAtom)).toEqual([])
    expect(store.get(chatRoutingProgressAtom)).toBeNull()
    expect(store.get(chatPendingRoutingPromptAtom)).toBeNull()
    expect(store.get(followUpLabelAtom)).toBeNull()
    expect(store.get(batchStatusAtom)).toBe("idle")
    expect(store.get(batchIdAtom)).toBeNull()
    expect(store.get(batchErrorAtom)).toBeNull()
    expect(store.get(batchItemsAtom)).toEqual([])
    expect(store.get(batchSummaryAtom)).toBeNull()
    expect(store.get(batchProgressAtom)).toEqual({
      completed: 0,
      total: 0,
      running: 0,
    })
    expect(store.get(workflowCreateDraftPromptAtom)).toBe("")
    expect(store.get(workflowCreateSourceArtifactsAtom)).toEqual([])
    expect(store.get(workflowCreateSourceAttachmentsAtom)).toEqual([])
  })
})

describe("commitNavigationAtom", () => {
  it("resets all ephemeral atoms on workflow navigation", () => {
    const store = dirtyStore()

    store.set(commitNavigationAtom, {
      kind: "workflow",
      workflowPath: "/project/.c8c/flow.chain",
      projectPath: "/project",
    })

    // All ephemeral atoms should be at defaults
    expect(store.get(chatMessagesAtom)).toEqual([])
    expect(store.get(chatStatusAtom)).toBe("idle")
    expect(store.get(batchStatusAtom)).toBe("idle")
    expect(store.get(workflowCreateDraftPromptAtom)).toBe("")
    expect(store.get(chatRoutingProgressAtom)).toBeNull()
    expect(store.get(followUpLabelAtom)).toBeNull()

    // Review state cleared
    expect(store.get(selectedPastRunAtom)).toBeNull()

    // Target-specific state set
    expect(store.get(selectedProjectAtom)).toBe("/project")
    expect(store.get(mainViewAtom)).toBe("thread")
    expect(store.get(viewModeAtom)).toBe("chat")
  })

  it("resets ephemeral atoms on create navigation", () => {
    const store = dirtyStore()

    store.set(commitNavigationAtom, { kind: "create" })

    expect(store.get(chatMessagesAtom)).toEqual([])
    expect(store.get(batchStatusAtom)).toBe("idle")
    expect(store.get(mainViewAtom)).toBe("thread")
    expect(store.get(viewModeAtom)).toBe("chat")
  })

  it("resets ephemeral atoms on view navigation", () => {
    const store = dirtyStore()

    store.set(commitNavigationAtom, { kind: "view", view: "settings" })

    expect(store.get(chatMessagesAtom)).toEqual([])
    expect(store.get(batchStatusAtom)).toBe("idle")
    expect(store.get(mainViewAtom)).toBe("settings")
  })
})
