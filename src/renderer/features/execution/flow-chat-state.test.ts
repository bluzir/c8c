import { createStore } from "jotai"
import { describe, expect, it } from "vitest"
import {
  addFlowChatMessageAtom,
  clearFlowChatMessagesAtom,
  currentFlowChatMessagesAtom,
  flowChatMessagesAtom,
  replaceFlowChatMessagesAtom,
} from "./flow-chat-state"
import { selectedWorkflowPathAtom } from "@/lib/store"
import type { FlowChatMessage } from "@/lib/flow-chat-types"

function makeMessage(
  id: string,
  flowName = "test-flow",
): FlowChatMessage {
  return {
    id,
    flowName,
    timestamp: Date.now(),
    content: {
      type: "start",
      data: { description: "Test message" },
    },
  }
}

describe("clearFlowChatMessagesAtom", () => {
  it("removes messages for a key that exists", () => {
    const store = createStore()
    const key = "/tmp/workflow-a.chain"

    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: makeMessage("msg-1"),
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: makeMessage("msg-2"),
    })

    expect(store.get(flowChatMessagesAtom)[key]).toHaveLength(2)

    store.set(clearFlowChatMessagesAtom, key)

    expect(store.get(flowChatMessagesAtom)[key]).toBeUndefined()
  })

  it("is a no-op when the key does not exist", () => {
    const store = createStore()
    const existingKey = "/tmp/existing.chain"
    const missingKey = "/tmp/missing.chain"

    store.set(addFlowChatMessageAtom, {
      workflowKey: existingKey,
      message: makeMessage("msg-1"),
    })

    const before = store.get(flowChatMessagesAtom)
    store.set(clearFlowChatMessagesAtom, missingKey)
    const after = store.get(flowChatMessagesAtom)

    // Should be referentially identical since nothing changed
    expect(before).toBe(after)
    expect(after[existingKey]).toHaveLength(1)
  })

  it("does not affect messages for other keys", () => {
    const store = createStore()
    const keyA = "/tmp/workflow-a.chain"
    const keyB = "/tmp/workflow-b.chain"

    store.set(addFlowChatMessageAtom, {
      workflowKey: keyA,
      message: makeMessage("msg-a"),
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: keyB,
      message: makeMessage("msg-b1"),
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: keyB,
      message: makeMessage("msg-b2"),
    })

    store.set(clearFlowChatMessagesAtom, keyA)

    expect(store.get(flowChatMessagesAtom)[keyA]).toBeUndefined()
    expect(store.get(flowChatMessagesAtom)[keyB]).toHaveLength(2)
    expect(store.get(flowChatMessagesAtom)[keyB]![0].id).toBe("msg-b1")
    expect(store.get(flowChatMessagesAtom)[keyB]![1].id).toBe("msg-b2")
  })

  it("causes currentFlowChatMessagesAtom to return empty array for the cleared key", () => {
    const store = createStore()
    const key = "/tmp/workflow-c.chain"

    // Point the selected workflow at our key
    store.set(selectedWorkflowPathAtom, key)

    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: makeMessage("msg-1"),
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: makeMessage("msg-2"),
    })

    expect(store.get(currentFlowChatMessagesAtom)).toHaveLength(2)

    store.set(clearFlowChatMessagesAtom, key)

    expect(store.get(currentFlowChatMessagesAtom)).toEqual([])
  })
})

describe("replaceFlowChatMessagesAtom", () => {
  it("replaces existing messages with a single new message atomically", () => {
    const store = createStore()
    const key = "/tmp/workflow-a.chain"

    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: makeMessage("msg-1"),
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: makeMessage("msg-2"),
    })

    expect(store.get(flowChatMessagesAtom)[key]).toHaveLength(2)

    const replacement = makeMessage("msg-start")
    store.set(replaceFlowChatMessagesAtom, {
      workflowKey: key,
      message: replacement,
    })

    const messages = store.get(flowChatMessagesAtom)[key]
    expect(messages).toHaveLength(1)
    expect(messages![0].id).toBe("msg-start")
  })

  it("works when no previous messages exist for the key", () => {
    const store = createStore()
    const key = "/tmp/workflow-new.chain"

    const msg = makeMessage("msg-first")
    store.set(replaceFlowChatMessagesAtom, {
      workflowKey: key,
      message: msg,
    })

    const messages = store.get(flowChatMessagesAtom)[key]
    expect(messages).toHaveLength(1)
    expect(messages![0].id).toBe("msg-first")
  })

  it("does not affect messages for other keys", () => {
    const store = createStore()
    const keyA = "/tmp/workflow-a.chain"
    const keyB = "/tmp/workflow-b.chain"

    store.set(addFlowChatMessageAtom, {
      workflowKey: keyA,
      message: makeMessage("msg-a1"),
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: keyA,
      message: makeMessage("msg-a2"),
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: keyB,
      message: makeMessage("msg-b1"),
    })

    store.set(replaceFlowChatMessagesAtom, {
      workflowKey: keyA,
      message: makeMessage("msg-a-new"),
    })

    expect(store.get(flowChatMessagesAtom)[keyA]).toHaveLength(1)
    expect(store.get(flowChatMessagesAtom)[keyB]).toHaveLength(1)
    expect(store.get(flowChatMessagesAtom)[keyB]![0].id).toBe("msg-b1")
  })
})
