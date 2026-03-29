import { describe, it, expect } from "vitest"
import { createStore } from "jotai"
import {
  flowChatMessagesAtom,
  addFlowChatMessageAtom,
  replaceFlowChatMessagesAtom,
  currentRunIndexAtom,
  updateFlowProgressAtom,
} from "@/features/execution/flow-chat-state"
import { followUpLabelAtom } from "./store"
import type {
  FlowChatMessage,
  FlowChatMessageContent,
  ProgressContent,
  CompleteContent,
  ErrorContent,
} from "./flow-chat-types"
import { postProcessPersistedMessages } from "@/hooks/usePastRunTimeline"

// ── Helpers ──────────────────────────────────────────────

let seqId = 0
function uid(): string {
  return `msg-${++seqId}`
}

function buildMsg(
  contentType: FlowChatMessageContent["type"],
  overrides?: Partial<FlowChatMessage>,
): FlowChatMessage {
  const base: FlowChatMessage = {
    id: uid(),
    flowName: "Test Flow",
    timestamp: Date.now(),
    content:
      contentType === "start"
        ? { type: "start", data: { description: "Starting flow" } }
        : contentType === "progress"
          ? {
              type: "progress",
              data: { steps: [], startedAt: Date.now() },
            }
          : contentType === "complete"
            ? {
                type: "complete",
                data: {
                  summary: "Flow completed",
                  findings: [],
                  limitations: [],
                  artifacts: [],
                  followUps: [],
                  metrics: { duration: "5s", cost: "$0.01" },
                  runId: "r1",
                },
              }
            : contentType === "error"
              ? {
                  type: "error",
                  data: {
                    variant: "error",
                    tone: "danger",
                    summary: "Flow failed",
                    suggestions: [],
                    actions: [],
                  },
                }
              : contentType === "routing"
                ? {
                    type: "routing",
                    data: {
                      userRequest: "test",
                      steps: [],
                    },
                  }
                : {
                    type: "decision",
                    data: {
                      tone: "approval",
                      summary: "Needs approval",
                      resultFacts: [],
                      issues: [],
                      question: "Approve?",
                      actions: [],
                      nodeId: "n1",
                      runId: "r1",
                    },
                  },
    ...overrides,
  }
  return base
}

// ── Group 1: Multi-run message accumulation ──────────────

describe("Group 1: Multi-run message accumulation", () => {
  it("T1: Messages tagged with correct runIndex", () => {
    const store = createStore()
    const key = "wf-test"

    // Add 3 messages for run 0
    for (let i = 0; i < 3; i++) {
      store.set(addFlowChatMessageAtom, {
        workflowKey: key,
        message: buildMsg("progress", { runIndex: 0, timestamp: 1000 + i }),
      })
    }
    // Add 3 messages for run 1
    for (let i = 0; i < 3; i++) {
      store.set(addFlowChatMessageAtom, {
        workflowKey: key,
        message: buildMsg("progress", { runIndex: 1, timestamp: 2000 + i }),
      })
    }

    const messages = store.get(flowChatMessagesAtom)[key]!
    expect(messages).toHaveLength(6)

    const run0Msgs = messages.filter((m) => m.runIndex === 0)
    const run1Msgs = messages.filter((m) => m.runIndex === 1)
    expect(run0Msgs).toHaveLength(3)
    expect(run1Msgs).toHaveLength(3)
  })

  it("T2: Messages from different runs sort correctly by timestamp", () => {
    const store = createStore()
    const key = "wf-sort"

    // Run 0 messages
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: buildMsg("start", { runIndex: 0, timestamp: 1000 }),
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: buildMsg("progress", { runIndex: 0, timestamp: 1001 }),
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: buildMsg("complete", { runIndex: 0, timestamp: 1002 }),
    })

    // Run 1 messages
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: buildMsg("start", { runIndex: 1, timestamp: 2000 }),
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: buildMsg("progress", { runIndex: 1, timestamp: 2001 }),
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: buildMsg("complete", { runIndex: 1, timestamp: 2002 }),
    })

    const messages = store.get(flowChatMessagesAtom)[key]!
    const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp)

    // First 3 should be run 0, last 3 should be run 1
    for (let i = 0; i < 3; i++) {
      expect(sorted[i].runIndex).toBe(0)
    }
    for (let i = 3; i < 6; i++) {
      expect(sorted[i].runIndex).toBe(1)
    }
  })

  it("T3: replaceFlowChatMessages clears previous and starts fresh", () => {
    const store = createStore()
    const key = "wf-replace"

    // Add 3 messages
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: buildMsg("start"),
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: buildMsg("progress"),
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: buildMsg("complete"),
    })

    expect(store.get(flowChatMessagesAtom)[key]).toHaveLength(3)

    // Replace with single start message
    const newStart = buildMsg("start")
    store.set(replaceFlowChatMessagesAtom, {
      workflowKey: key,
      message: newStart,
    })

    const messages = store.get(flowChatMessagesAtom)[key]!
    expect(messages).toHaveLength(1)
    expect(messages[0].id).toBe(newStart.id)
  })

  it("T4: addFlowChatMessage appends without clearing", () => {
    const store = createStore()
    const key = "wf-append"

    const msg1 = buildMsg("start")
    const msg2 = buildMsg("progress")
    const msg3 = buildMsg("complete")

    store.set(addFlowChatMessageAtom, { workflowKey: key, message: msg1 })
    store.set(addFlowChatMessageAtom, { workflowKey: key, message: msg2 })
    store.set(addFlowChatMessageAtom, { workflowKey: key, message: msg3 })

    const messages = store.get(flowChatMessagesAtom)[key]!
    expect(messages).toHaveLength(3)
    expect(messages[0].id).toBe(msg1.id)
    expect(messages[1].id).toBe(msg2.id)
    expect(messages[2].id).toBe(msg3.id)
  })

  it("T5: updateFlowProgress updates message in-place by ID", () => {
    const store = createStore()
    const key = "wf-update"

    const progressMsg = buildMsg("progress", { id: "progress-1" })
    const otherMsg = buildMsg("start", { id: "start-1" })

    store.set(addFlowChatMessageAtom, { workflowKey: key, message: otherMsg })
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: progressMsg,
    })

    // Update the progress message with new steps
    const updatedData: ProgressContent = {
      steps: [
        { nodeId: "n1", label: "Analyze", status: "done" },
        { nodeId: "n2", label: "Write", status: "running" },
      ],
      startedAt: Date.now(),
    }

    store.set(updateFlowProgressAtom, {
      workflowKey: key,
      messageId: "progress-1",
      data: updatedData,
    })

    const messages = store.get(flowChatMessagesAtom)[key]!
    expect(messages).toHaveLength(2)

    // Start message unchanged
    expect(messages[0].id).toBe("start-1")
    expect(messages[0].content.type).toBe("start")

    // Progress message updated
    expect(messages[1].id).toBe("progress-1")
    expect(messages[1].content.type).toBe("progress")
    const data = messages[1].content.data as ProgressContent
    expect(data.steps).toHaveLength(2)
    expect(data.steps[0].label).toBe("Analyze")
    expect(data.steps[1].status).toBe("running")
  })
})

// ── Group 2: runIndex lifecycle ──────────────────────────

describe("Group 2: runIndex lifecycle", () => {
  it("T6: currentRunIndex starts at 0 for empty store", () => {
    const store = createStore()
    expect(store.get(currentRunIndexAtom)).toBe(0)
  })

  it("T7: currentRunIndex set to chat.runs.length on chat selection", () => {
    const store = createStore()

    // Simulate selecting a chat with 3 runs: set currentRunIndex = 3
    store.set(currentRunIndexAtom, 3)
    expect(store.get(currentRunIndexAtom)).toBe(3)
  })

  it("T8: New messages tagged with currentRunIndex value", () => {
    const store = createStore()

    // Set currentRunIndex to 2 (simulating 2 prior runs)
    store.set(currentRunIndexAtom, 2)

    const runIndex = store.get(currentRunIndexAtom)
    const msg = buildMsg("progress", { runIndex })

    expect(msg.runIndex).toBe(2)
  })

  it("T9: runIndex increments across follow-up runs", () => {
    const store = createStore()
    const key = "wf-followup"

    // Run 0
    store.set(currentRunIndexAtom, 0)
    const r0Start = buildMsg("start", {
      runIndex: store.get(currentRunIndexAtom),
      timestamp: 1000,
    })
    const r0Complete = buildMsg("complete", {
      runIndex: store.get(currentRunIndexAtom),
      timestamp: 1001,
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: r0Start,
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: r0Complete,
    })

    // Run 1
    store.set(currentRunIndexAtom, 1)
    const r1Start = buildMsg("start", {
      runIndex: store.get(currentRunIndexAtom),
      timestamp: 2000,
    })
    const r1Complete = buildMsg("complete", {
      runIndex: store.get(currentRunIndexAtom),
      timestamp: 2001,
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: r1Start,
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: r1Complete,
    })

    // Run 2
    store.set(currentRunIndexAtom, 2)
    const r2Start = buildMsg("start", {
      runIndex: store.get(currentRunIndexAtom),
      timestamp: 3000,
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: r2Start,
    })

    const messages = store.get(flowChatMessagesAtom)[key]!
    expect(messages).toHaveLength(5)

    // Each run has distinct runIndex values
    const runIndices = new Set(messages.map((m) => m.runIndex))
    expect(runIndices.size).toBe(3)
    expect(runIndices.has(0)).toBe(true)
    expect(runIndices.has(1)).toBe(true)
    expect(runIndices.has(2)).toBe(true)
  })
})

// ── Group 3: Timeline content correctness ────────────────

describe("Group 3: Timeline content correctness", () => {
  it("T10: Complete message contains summary and artifacts", () => {
    const msg = buildMsg("complete", {
      content: {
        type: "complete",
        data: {
          summary: "Analysis found 3 trends",
          findings: ["trend-1", "trend-2", "trend-3"],
          limitations: [],
          artifacts: [
            { name: "report.md", path: "/out/report.md", kind: "report" },
          ],
          followUps: [],
          metrics: { duration: "10s", cost: "$0.05" },
          runId: "r1",
        },
      },
    })

    expect(msg.content.type).toBe("complete")
    const data = msg.content.data as CompleteContent
    expect(data.summary).toBe("Analysis found 3 trends")
    expect(data.artifacts).toHaveLength(1)
    expect(data.artifacts[0].name).toBe("report.md")
    expect(data.findings).toHaveLength(3)
  })

  it("T11: Error message contains variant and suggestions", () => {
    const msg = buildMsg("error", {
      content: {
        type: "error",
        data: {
          variant: "timeout",
          tone: "warning",
          summary: "Flow timed out after 10 minutes",
          suggestions: ["Increase timeout", "Simplify the flow"],
          actions: [],
        },
      },
    })

    expect(msg.content.type).toBe("error")
    const data = msg.content.data as ErrorContent
    expect(data.variant).toBe("timeout")
    expect(data.tone).toBe("warning")
    expect(data.suggestions).toHaveLength(2)
    expect(data.suggestions[0]).toBe("Increase timeout")
  })

  it("T12: followUpLabelAtom stores the follow-up label for timeline synthesis", () => {
    const store = createStore()

    store.set(followUpLabelAtom, "Draft posts")
    expect(store.get(followUpLabelAtom)).toBe("Draft posts")
  })

  it("T13: followUpLabel cleared on chat switch", () => {
    const store = createStore()

    // Set follow-up label (simulating a follow-up action)
    store.set(followUpLabelAtom, "Draft posts")
    expect(store.get(followUpLabelAtom)).toBe("Draft posts")

    // Simulate chat switch: clear the label
    store.set(followUpLabelAtom, null)
    expect(store.get(followUpLabelAtom)).toBeNull()
  })
})

// ── Group 4: Multi-run timeline merge invariants ─────────

describe("Group 4: Multi-run timeline merge invariants", () => {
  it("T14: All messages across runs can be collected and sorted", () => {
    const store = createStore()

    // 3 different workflow keys, each tagged with different runIndex
    const keys = ["wf-a", "wf-b", "wf-c"]

    store.set(addFlowChatMessageAtom, {
      workflowKey: keys[0],
      message: buildMsg("start", { runIndex: 0, timestamp: 1000 }),
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: keys[0],
      message: buildMsg("complete", { runIndex: 0, timestamp: 1500 }),
    })

    store.set(addFlowChatMessageAtom, {
      workflowKey: keys[1],
      message: buildMsg("start", { runIndex: 1, timestamp: 2000 }),
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: keys[1],
      message: buildMsg("complete", { runIndex: 1, timestamp: 2500 }),
    })

    store.set(addFlowChatMessageAtom, {
      workflowKey: keys[2],
      message: buildMsg("start", { runIndex: 2, timestamp: 3000 }),
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: keys[2],
      message: buildMsg("complete", { runIndex: 2, timestamp: 3500 }),
    })

    // Collect all messages from all keys
    const allMsgs = store.get(flowChatMessagesAtom)
    const collected: FlowChatMessage[] = []
    for (const key of keys) {
      collected.push(...(allMsgs[key] ?? []))
    }

    // Sort by timestamp
    collected.sort((a, b) => a.timestamp - b.timestamp)

    expect(collected).toHaveLength(6)

    // Chronological order: timestamps ascending
    for (let i = 1; i < collected.length; i++) {
      expect(collected[i].timestamp).toBeGreaterThanOrEqual(
        collected[i - 1].timestamp,
      )
    }

    // RunIndex follows sequence: 0, 0, 1, 1, 2, 2
    expect(collected[0].runIndex).toBe(0)
    expect(collected[1].runIndex).toBe(0)
    expect(collected[2].runIndex).toBe(1)
    expect(collected[3].runIndex).toBe(1)
    expect(collected[4].runIndex).toBe(2)
    expect(collected[5].runIndex).toBe(2)
  })

  it("T15: Run boundary detectable by runIndex change", () => {
    const store = createStore()
    const key = "wf-boundary"

    // 4 messages: 2 from run 0, 2 from run 1
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: buildMsg("start", { runIndex: 0, timestamp: 1000 }),
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: buildMsg("complete", { runIndex: 0, timestamp: 1001 }),
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: buildMsg("start", { runIndex: 1, timestamp: 2000 }),
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey: key,
      message: buildMsg("complete", { runIndex: 1, timestamp: 2001 }),
    })

    const messages = store.get(flowChatMessagesAtom)[key]!
    const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp)

    // Find boundaries where runIndex changes
    const boundaries: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].runIndex !== sorted[i - 1].runIndex) {
        boundaries.push(i)
      }
    }

    // Exactly one boundary between index 1 and 2
    expect(boundaries).toHaveLength(1)
    expect(boundaries[0]).toBe(2)
  })
})

// ── Group 5: Post-processing persisted messages ──────────

describe("Group 5: Post-processing persisted messages", () => {
  it("T16: postProcessPersistedMessages collapses progress messages", () => {
    const progressMsg = buildMsg("progress", {
      content: {
        type: "progress",
        data: {
          steps: [
            { nodeId: "n1", label: "Analyze", status: "done" },
            { nodeId: "n2", label: "Write", status: "done" },
          ],
          startedAt: Date.now(),
          elapsed: "12s",
        },
      },
    })

    const processed = postProcessPersistedMessages([progressMsg])
    expect(processed).toHaveLength(1)

    const data = processed[0].content.data as ProgressContent
    expect(data.collapsed).toBe(true)
    expect(data.collapsedLabel).toContain("2/2 steps completed")
    expect(data.collapsedLabel).toContain("12s")
  })

  it("T17: postProcessPersistedMessages strips actions from decision messages", () => {
    const decisionMsg = buildMsg("decision", {
      content: {
        type: "decision",
        data: {
          tone: "approval" as const,
          summary: "Needs review",
          resultFacts: ["fact-1"],
          issues: [],
          question: "Approve this?",
          actions: [
            {
              label: "Approve",
              variant: "primary" as const,
              action: { type: "approve" as const, runId: "r1", nodeId: "n1" },
            },
          ],
          nodeId: "n1",
          runId: "r1",
        },
      },
    })

    const processed = postProcessPersistedMessages([decisionMsg])
    expect(processed).toHaveLength(1)
    expect(processed[0].content.type).toBe("decision")

    const data = processed[0].content.data as any
    expect(data.actions).toHaveLength(0)
    // Other fields preserved
    expect(data.summary).toBe("Needs review")
    expect(data.question).toBe("Approve this?")
  })

  it("T18: postProcessPersistedMessages leaves complete messages unchanged", () => {
    const completeMsg = buildMsg("complete", {
      content: {
        type: "complete",
        data: {
          summary: "All done",
          findings: ["finding-1"],
          limitations: [],
          artifacts: [],
          followUps: [],
          metrics: { duration: "8s", cost: "$0.03" },
          runId: "r1",
        },
      },
    })

    const processed = postProcessPersistedMessages([completeMsg])
    expect(processed).toHaveLength(1)
    expect(processed[0].content.type).toBe("complete")

    const data = processed[0].content.data as CompleteContent
    expect(data.summary).toBe("All done")
    expect(data.findings).toEqual(["finding-1"])
  })
})
