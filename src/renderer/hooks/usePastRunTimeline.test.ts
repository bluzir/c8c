import { describe, it, expect } from "vitest"
import type { FlowChatMessage } from "@/lib/flow-chat-types"
import { postProcessPersistedMessages } from "./usePastRunTimeline"

function makeMsg(
  content: FlowChatMessage["content"],
  id = "msg-1",
): FlowChatMessage {
  return { id, flowName: "test-flow", timestamp: Date.now(), content }
}

describe("postProcessPersistedMessages", () => {
  it("collapses progress messages with correct label", () => {
    const msg = makeMsg({
      type: "progress",
      data: {
        steps: [
          { nodeId: "a", label: "Step A", status: "done" },
          { nodeId: "b", label: "Step B", status: "done" },
          { nodeId: "c", label: "Step C", status: "failed" },
        ],
        elapsed: "5m",
      },
    })

    const [result] = postProcessPersistedMessages([msg])
    expect(result.content.type).toBe("progress")
    const data = result.content.data as {
      collapsed: boolean
      collapsedLabel: string
    }
    expect(data.collapsed).toBe(true)
    expect(data.collapsedLabel).toBe("2/3 steps completed · 5m")
  })

  it("omits elapsed suffix when elapsed is empty", () => {
    const msg = makeMsg({
      type: "progress",
      data: {
        steps: [
          { nodeId: "a", label: "Step A", status: "done" },
          { nodeId: "b", label: "Step B", status: "pending" },
        ],
      },
    })

    const [result] = postProcessPersistedMessages([msg])
    const data = result.content.data as { collapsedLabel: string }
    expect(data.collapsedLabel).toBe("1/2 steps completed")
  })

  it("leaves already-collapsed progress messages unchanged", () => {
    const msg = makeMsg({
      type: "progress",
      data: {
        steps: [{ nodeId: "a", label: "Step A", status: "done" }],
        elapsed: "1m",
        collapsed: true,
        collapsedLabel: "existing label",
      },
    })

    const [result] = postProcessPersistedMessages([msg])
    expect(result).toBe(msg) // exact same reference
  })

  it("strips actions from decision messages", () => {
    const msg = makeMsg({
      type: "decision",
      data: {
        tone: "approval" as const,
        summary: "Looks good",
        resultFacts: ["fact1"],
        issues: [],
        question: "Approve?",
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
    })

    const [result] = postProcessPersistedMessages([msg])
    expect(result.content.type).toBe("decision")
    const data = result.content.data as { actions: unknown[] }
    expect(data.actions).toEqual([])
  })

  it("passes start messages through unchanged", () => {
    const msg = makeMsg({
      type: "start",
      data: { description: "Starting flow" },
    })

    const [result] = postProcessPersistedMessages([msg])
    expect(result).toBe(msg)
  })

  it("passes complete messages through unchanged", () => {
    const msg = makeMsg({
      type: "complete",
      data: {
        summary: "Done",
        findings: [],
        limitations: [],
        artifacts: [],
        followUps: [],
        metrics: { duration: "2m", cost: "$0.01" },
        runId: "r1",
      },
    })

    const [result] = postProcessPersistedMessages([msg])
    expect(result).toBe(msg)
  })

  it("passes error messages through unchanged", () => {
    const msg = makeMsg({
      type: "error",
      data: {
        variant: "error",
        tone: "danger",
        summary: "Something broke",
        suggestions: [],
        actions: [],
      },
    })

    const [result] = postProcessPersistedMessages([msg])
    expect(result).toBe(msg)
  })

  it("passes routing messages through unchanged", () => {
    const msg = makeMsg({
      type: "routing",
      data: {
        steps: [{ label: "Routing", status: "done" as const }],
      },
    })

    const [result] = postProcessPersistedMessages([msg])
    expect(result).toBe(msg)
  })

  it("processes a mixed array correctly", () => {
    const startMsg = makeMsg(
      { type: "start", data: { description: "Go" } },
      "m1",
    )
    const progressMsg = makeMsg(
      {
        type: "progress",
        data: {
          steps: [
            { nodeId: "a", label: "A", status: "done" },
            { nodeId: "b", label: "B", status: "done" },
            { nodeId: "c", label: "C", status: "done" },
          ],
          elapsed: "3m",
        },
      },
      "m2",
    )
    const decisionMsg = makeMsg(
      {
        type: "decision",
        data: {
          tone: "eval-exhausted" as const,
          summary: "Retries exhausted",
          resultFacts: [],
          issues: ["quality"],
          question: "Override?",
          actions: [
            {
              label: "Override",
              variant: "secondary" as const,
              action: {
                type: "override" as const,
                runId: "r1",
                nodeId: "n1",
              },
            },
          ],
          nodeId: "n1",
          runId: "r1",
        },
      },
      "m3",
    )
    const completeMsg = makeMsg(
      {
        type: "complete",
        data: {
          summary: "Finished",
          findings: [],
          limitations: [],
          artifacts: [],
          followUps: [],
          metrics: { duration: "4m", cost: "$0.05" },
          runId: "r1",
        },
      },
      "m4",
    )

    const results = postProcessPersistedMessages([
      startMsg,
      progressMsg,
      decisionMsg,
      completeMsg,
    ])

    // start: unchanged
    expect(results[0]).toBe(startMsg)

    // progress: collapsed
    expect(results[1].content.type).toBe("progress")
    const pData = results[1].content.data as {
      collapsed: boolean
      collapsedLabel: string
    }
    expect(pData.collapsed).toBe(true)
    expect(pData.collapsedLabel).toBe("3/3 steps completed · 3m")

    // decision: actions stripped
    expect(results[2].content.type).toBe("decision")
    const dData = results[2].content.data as { actions: unknown[] }
    expect(dData.actions).toEqual([])

    // complete: unchanged
    expect(results[3]).toBe(completeMsg)
  })

  it("returns an empty array for empty input", () => {
    expect(postProcessPersistedMessages([])).toEqual([])
  })
})
