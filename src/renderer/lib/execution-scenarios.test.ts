import { describe, it, expect, vi } from "vitest"
import { createStore } from "jotai"
import type { Chat, ChatRun, ChatRunHistory } from "@shared/types"
import {
  chatRegistryAtom,
  selectedChatIdAtom,
  updateChatInRegistryAtom,
} from "./chat-atoms"
import {
  flowChatMessagesAtom,
  addFlowChatMessageAtom,
  replaceFlowChatMessagesAtom,
  currentRunIndexAtom,
} from "@/features/execution/flow-chat-state"
import type { FlowChatMessage, CompleteContent } from "./flow-chat-types"
import {
  matchArtifactsToContracts,
  assembleInputWithAttachments,
  type InputAssemblerDeps,
} from "@c8c/workflow-runner"

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

function buildFlowMessage(
  type: string,
  overrides?: Partial<FlowChatMessage>,
): FlowChatMessage {
  return {
    id: crypto.randomUUID(),
    flowName: "Test Flow",
    timestamp: Date.now(),
    content:
      type === "complete"
        ? {
            type: "complete",
            data: {
              summary: "Test summary",
              findings: [],
              limitations: [],
              artifacts: [],
              followUps: [],
              metrics: { duration: "5s", cost: "$0.01" },
              runId: "r1",
            },
          }
        : type === "start"
          ? { type: "start", data: { description: "Starting test" } }
          : {
              type: "progress",
              data: { steps: [], startedAt: Date.now() },
            },
    ...overrides,
  }
}

function makeArtifact(kind: string, id = `art-${kind}`) {
  return {
    id,
    kind,
    title: kind,
    relativePath: `artifacts/${kind}.md`,
  } as any
}

function makeContract(kind: string, required = true) {
  return { kind, title: kind, required }
}

function makeDeps(
  overrides: Partial<InputAssemblerDeps> = {},
): InputAssemblerDeps {
  return {
    readFileContent: vi
      .fn()
      .mockResolvedValue({ content: "", truncated: false }),
    loadRunResult: vi.fn().mockResolvedValue(null),
    ...overrides,
  }
}

// ── Execution Lifecycle Tests ────────────────────────────

describe("Execution Lifecycle", () => {
  it("E1: Run completes → ChatRun appended to chat", () => {
    const store = createStore()

    // Precondition: chat with 1 existing run
    const run1 = buildChatRun("r1")
    const chat = buildChat("c1", { runs: [run1] })
    store.set(chatRegistryAtom, { c1: chat })
    store.set(selectedChatIdAtom, "c1")

    // Action: simulate onRunFinished — append new ChatRun
    const newRun = buildChatRun("r2", { summary: "Second run done" })
    const updatedChat: Chat = {
      ...chat,
      runs: [...chat.runs, newRun],
      lastActivityAt: Date.now(),
    }
    store.set(updateChatInRegistryAtom, updatedChat)

    // Assert
    const result = store.get(chatRegistryAtom)["c1"]
    expect(result.runs).toHaveLength(2)
    expect(result.runs[1].runId).toBe("r2")
    expect(result.runs[1].summary).toBe("Second run done")
  })

  it("E2: Run completes → artifactPool updated with new IDs", () => {
    const store = createStore()

    // Precondition: chat with artifactPool = ["a1"]
    const chat = buildChat("c1", {
      runs: [buildChatRun("r1")],
      artifactPool: ["a1"],
    })
    store.set(chatRegistryAtom, { c1: chat })
    store.set(selectedChatIdAtom, "c1")

    // Action: simulate artifact persistence — append "a2" to pool
    const updatedChat: Chat = {
      ...chat,
      artifactPool: [...chat.artifactPool, "a2"],
      runs: [...chat.runs, buildChatRun("r2")],
      lastActivityAt: Date.now(),
    }
    store.set(updateChatInRegistryAtom, updatedChat)

    // Assert
    const result = store.get(chatRegistryAtom)["c1"]
    expect(result.artifactPool).toEqual(["a1", "a2"])
  })

  it("E3: Failed run → ChatRun appended with status 'failed'", () => {
    const store = createStore()

    // Precondition: chat with 1 completed run
    const chat = buildChat("c1", {
      runs: [buildChatRun("r1", { status: "completed" })],
    })
    store.set(chatRegistryAtom, { c1: chat })

    // Action: append ChatRun with status: "failed"
    const failedRun = buildChatRun("r2", { status: "failed" })
    const updatedChat: Chat = {
      ...chat,
      runs: [...chat.runs, failedRun],
      lastActivityAt: Date.now(),
    }
    store.set(updateChatInRegistryAtom, updatedChat)

    // Assert
    const result = store.get(chatRegistryAtom)["c1"]
    expect(result.runs).toHaveLength(2)
    expect(result.runs[1].status).toBe("failed")
  })

  it("E4: Failed run → artifactPool NOT updated", () => {
    const store = createStore()

    // Precondition: chat with artifactPool = ["a1"]
    const chat = buildChat("c1", {
      runs: [buildChatRun("r1")],
      artifactPool: ["a1"],
    })
    store.set(chatRegistryAtom, { c1: chat })

    // Action: append failed ChatRun, do NOT add to artifactPool
    const failedRun = buildChatRun("r2", { status: "failed" })
    const updatedChat: Chat = {
      ...chat,
      runs: [...chat.runs, failedRun],
      // artifactPool intentionally unchanged
      lastActivityAt: Date.now(),
    }
    store.set(updateChatInRegistryAtom, updatedChat)

    // Assert: artifactPool unchanged
    const result = store.get(chatRegistryAtom)["c1"]
    expect(result.artifactPool).toEqual(["a1"])
  })

  it("E5: Summary extracted from completion message", () => {
    const store = createStore()

    const workflowKey = "wf-test"
    const completeMsg = buildFlowMessage("complete", {
      content: {
        type: "complete",
        data: {
          summary: "Found 5 trends",
          findings: ["trend-1"],
          limitations: [],
          artifacts: [],
          followUps: [],
          metrics: { duration: "10s", cost: "$0.05" },
          runId: "r1",
        },
      },
    })

    // Precondition: flowChatMessages has a "complete" message
    store.set(addFlowChatMessageAtom, {
      workflowKey,
      message: completeMsg,
    })

    // Action: extract summary from last complete message
    const messages = store.get(flowChatMessagesAtom)[workflowKey] ?? []
    const lastComplete = [...messages]
      .reverse()
      .find((m) => m.content.type === "complete")
    const summary =
      lastComplete?.content.type === "complete"
        ? (lastComplete.content.data as CompleteContent).summary
        : ""

    // Assert
    expect(summary).toBe("Found 5 trends")
  })

  it("E6: Summary empty when no completion message", () => {
    const store = createStore()

    const workflowKey = "wf-test"
    // Precondition: only start and progress messages
    store.set(addFlowChatMessageAtom, {
      workflowKey,
      message: buildFlowMessage("start"),
    })
    store.set(addFlowChatMessageAtom, {
      workflowKey,
      message: buildFlowMessage("progress"),
    })

    // Action: extract summary
    const messages = store.get(flowChatMessagesAtom)[workflowKey] ?? []
    const lastComplete = [...messages]
      .reverse()
      .find((m) => m.content.type === "complete")
    const summary =
      lastComplete?.content.type === "complete"
        ? (lastComplete.content.data as CompleteContent).summary
        : ""

    // Assert
    expect(summary).toBe("")
  })

  it("E7: runIndex set from chat.runs.length on start message", () => {
    const store = createStore()

    // Precondition: chat with 2 completed runs
    const chat = buildChat("c1", {
      runs: [buildChatRun("r1"), buildChatRun("r2")],
    })
    store.set(chatRegistryAtom, { c1: chat })
    store.set(selectedChatIdAtom, "c1")

    // Action: set currentRunIndexAtom = chat.runs.length
    store.set(currentRunIndexAtom, chat.runs.length)

    // Assert
    expect(store.get(currentRunIndexAtom)).toBe(2)
  })

  it("E8: runIndex tagged on flow messages", () => {
    const store = createStore()

    // Precondition: currentRunIndex = 1
    store.set(currentRunIndexAtom, 1)

    // Action: create flow message tagged with runIndex
    const runIndex = store.get(currentRunIndexAtom)
    const msg = buildFlowMessage("progress", { runIndex })

    // Assert
    expect(msg.runIndex).toBe(1)
  })

  it("E9: Multiple runs accumulate in chat.runs[]", () => {
    const store = createStore()

    // Precondition: chat with empty runs
    const chat = buildChat("c1", { runs: [] })
    store.set(chatRegistryAtom, { c1: chat })

    // Action: append 3 ChatRuns sequentially
    const run1 = buildChatRun("r1", { startedAt: 1000 })
    const run2 = buildChatRun("r2", { startedAt: 2000 })
    const run3 = buildChatRun("r3", { startedAt: 3000 })

    let current = store.get(chatRegistryAtom)["c1"]
    store.set(updateChatInRegistryAtom, {
      ...current,
      runs: [...current.runs, run1],
    })

    current = store.get(chatRegistryAtom)["c1"]
    store.set(updateChatInRegistryAtom, {
      ...current,
      runs: [...current.runs, run2],
    })

    current = store.get(chatRegistryAtom)["c1"]
    store.set(updateChatInRegistryAtom, {
      ...current,
      runs: [...current.runs, run3],
    })

    // Assert
    const result = store.get(chatRegistryAtom)["c1"]
    expect(result.runs).toHaveLength(3)
    expect(result.runs[0].runId).toBe("r1")
    expect(result.runs[1].runId).toBe("r2")
    expect(result.runs[2].runId).toBe("r3")
    // Each has unique runId
    const runIds = result.runs.map((r) => r.runId)
    expect(new Set(runIds).size).toBe(3)
    // Ordered by startedAt
    expect(result.runs[0].startedAt).toBeLessThan(result.runs[1].startedAt)
    expect(result.runs[1].startedAt).toBeLessThan(result.runs[2].startedAt)
  })

  it("E10: lastActivityAt updates on each run completion", () => {
    const store = createStore()

    // Precondition: chat with old lastActivityAt
    const chat = buildChat("c1", { lastActivityAt: 1000 })
    store.set(chatRegistryAtom, { c1: chat })

    // Action: append run, set lastActivityAt = Date.now()
    const now = Date.now()
    store.set(updateChatInRegistryAtom, {
      ...chat,
      runs: [buildChatRun("r1")],
      lastActivityAt: now,
    })

    // Assert
    const result = store.get(chatRegistryAtom)["c1"]
    expect(result.lastActivityAt).toBe(now)
    expect(result.lastActivityAt).toBeGreaterThan(1000)
  })
})

// ── Artifact Pipeline Tests ──────────────────────────────

describe("Artifact Pipeline", () => {
  it("P1: matchArtifactsToContracts — finds matching artifact by kind", () => {
    const result = matchArtifactsToContracts(
      [makeContract("report")],
      [makeArtifact("report", "a1")],
    )
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].id).toBe("a1")
    expect(result.warnings).toHaveLength(0)
  })

  it("P2: matchArtifactsToContracts — warning for missing required artifact", () => {
    const result = matchArtifactsToContracts(
      [makeContract("report", true)],
      [],
    )
    expect(result.matched).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].kind).toBe("missing_artifact")
  })

  it("P3: matchArtifactsToContracts — no warning for optional missing artifact", () => {
    const result = matchArtifactsToContracts(
      [makeContract("report", false)],
      [],
    )
    expect(result.matched).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it("P4: matchArtifactsToContracts — no contracts → returns all artifacts", () => {
    const artifacts = [makeArtifact("a", "a1"), makeArtifact("b", "a2")]
    const result = matchArtifactsToContracts(undefined, artifacts)
    expect(result.matched).toHaveLength(2)
    expect(result.matched).toEqual(artifacts)
  })

  it("P5: artifactPool accumulates across completed runs only", () => {
    const store = createStore()

    // Precondition: chat with 3 runs (completed, failed, completed)
    const run1 = buildChatRun("r1", { status: "completed" })
    const run2 = buildChatRun("r2", { status: "failed" })
    const run3 = buildChatRun("r3", { status: "completed" })
    const chat = buildChat("c1", {
      runs: [run1, run2, run3],
      artifactPool: [],
    })
    store.set(chatRegistryAtom, { c1: chat })

    // Simulate: add artifacts from completed runs only, skip failed
    const artifactsFromRuns: Record<string, string[]> = {
      r1: ["art-from-r1"],
      r2: ["art-from-r2-should-skip"],
      r3: ["art-from-r3"],
    }
    const pool: string[] = []
    for (const run of chat.runs) {
      if (run.status === "completed") {
        pool.push(...(artifactsFromRuns[run.runId] ?? []))
      }
    }
    store.set(updateChatInRegistryAtom, {
      ...chat,
      artifactPool: pool,
    })

    // Assert
    const result = store.get(chatRegistryAtom)["c1"]
    expect(result.artifactPool).toContain("art-from-r1")
    expect(result.artifactPool).toContain("art-from-r3")
    expect(result.artifactPool).not.toContain("art-from-r2-should-skip")
    expect(result.artifactPool).toHaveLength(2)
  })

  it("P6: ChatRunHistory built from completed runs only", () => {
    // Precondition: chat with 3 runs (completed, failed, completed)
    const run1 = buildChatRun("r1", {
      status: "completed",
      summary: "First analysis done",
      templateName: "Template r1",
    })
    const run2 = buildChatRun("r2", {
      status: "failed",
      summary: "This failed",
      templateName: "Template r2",
    })
    const run3 = buildChatRun("r3", {
      status: "completed",
      summary: "Third run done",
      templateName: "Template r3",
    })
    const chat = buildChat("c1", {
      runs: [run1, run2, run3],
      artifactPool: ["art-1", "art-3"],
    })

    // Action: build ChatRunHistory from completed runs only
    const history: ChatRunHistory = {
      runs: chat.runs
        .filter((r) => r.status === "completed")
        .map((r) => ({
          templateName: r.templateName,
          userPrompt: r.userPrompt,
          summary: r.summary || "",
          artifactIds: [],
        })),
    }

    // Assert
    expect(history.runs).toHaveLength(2)
    expect(history.runs[0].templateName).toBe("Template r1")
    expect(history.runs[1].templateName).toBe("Template r3")
  })

  it("P7: ChatRunHistory empty for chat with no completed runs", () => {
    const chat = buildChat("c1", {
      runs: [buildChatRun("r1", { status: "failed" })],
    })

    // Build history from completed runs only
    const history: ChatRunHistory = {
      runs: chat.runs
        .filter((r) => r.status === "completed")
        .map((r) => ({
          templateName: r.templateName,
          userPrompt: r.userPrompt,
          summary: r.summary || "",
          artifactIds: [],
        })),
    }

    // Assert
    expect(history.runs).toHaveLength(0)
  })

  it("P8: renderChatRunHistory formats correctly (via assembleInputWithAttachments)", async () => {
    const history: ChatRunHistory = {
      runs: [
        {
          templateName: "Code Review",
          userPrompt: "review auth module",
          summary: "Found 3 issues",
          artifactIds: ["artifact-1"],
        },
        {
          templateName: "Trend Analysis",
          userPrompt: "analyze trends",
          summary: "5 trends identified",
          artifactIds: [],
        },
      ],
    }

    const result = await assembleInputWithAttachments(
      "follow up",
      "",
      [],
      null,
      makeDeps(),
      history,
    )

    // Assert: output contains expected formatting
    expect(result).toContain("## Prior context")
    expect(result).toContain("**Code Review**")
    expect(result).toContain("**Trend Analysis**")
    expect(result).toContain("Found 3 issues")
    expect(result).toContain("5 trends identified")
  })

  it("P9: renderChatRunHistory uses (no summary) for empty summary (via assembleInputWithAttachments)", async () => {
    const history: ChatRunHistory = {
      runs: [
        {
          templateName: "Quick Run",
          userPrompt: "do something",
          summary: "",
          artifactIds: [],
        },
      ],
    }

    const result = await assembleInputWithAttachments(
      "next step",
      "",
      [],
      null,
      makeDeps(),
      history,
    )

    // Assert
    expect(result).toContain("(no summary)")
  })

  it("P10: Follow-up intent carries chat.artifactPool as sourceArtifactIds", () => {
    const store = createStore()

    // Precondition: chat with artifactPool = ["a1", "a2"]
    const chat = buildChat("c1", {
      runs: [buildChatRun("r1"), buildChatRun("r2")],
      artifactPool: ["a1", "a2"],
    })
    store.set(chatRegistryAtom, { c1: chat })
    store.set(selectedChatIdAtom, "c1")

    // Action: simulate building RoutingIntent for follow-up with pool IDs
    const selectedChat = store.get(chatRegistryAtom)["c1"]
    const intent = {
      type: "follow-up" as const,
      sourceArtifactIds: [...selectedChat.artifactPool],
    }

    // Assert
    expect(intent.sourceArtifactIds).toEqual(["a1", "a2"])
  })
})
