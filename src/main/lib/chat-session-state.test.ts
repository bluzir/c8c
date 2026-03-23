import { describe, expect, it } from "vitest"
import {
  applyChatEventToActiveSession,
  beginActiveChatSession,
  clearActiveChatSession,
  getActiveChatSessionSnapshot,
} from "./chat-session-state"
import type { ChatMessage, Workflow } from "@shared/types"

function createWorkflow(name: string): Workflow {
  return {
    version: 1,
    name,
    description: "",
    defaults: {
      model: "sonnet",
      maxTurns: 120,
      timeout_minutes: 30,
      maxParallel: 8,
    },
    nodes: [],
    edges: [],
  }
}

describe("chat-session-state", () => {
  it("tracks streaming progress for an active session", () => {
    const workflowPath = "/tmp/demo.chain"
    const sessionId = "chat-1"
    const initialWorkflow = createWorkflow("Draft")
    const history: ChatMessage[] = [
      {
        id: "user-1",
        role: "user",
        content: "Build me a workflow",
        timestamp: 1,
      },
    ]

    beginActiveChatSession(workflowPath, sessionId, history, initialWorkflow)

    applyChatEventToActiveSession({
      type: "thinking",
      sessionId,
      workflowPath,
    })
    applyChatEventToActiveSession({
      type: "text-delta",
      sessionId,
      workflowPath,
      content: "Working",
    })
    applyChatEventToActiveSession({
      type: "tool-call",
      sessionId,
      workflowPath,
      toolName: "synthesize_workflow",
      toolCallId: "call-1",
      toolInput: { request: "Build me a workflow" },
    })
    applyChatEventToActiveSession({
      type: "tool-result",
      sessionId,
      workflowPath,
      toolName: "synthesize_workflow",
      toolCallId: "call-1",
      toolOutput: "Created a workflow",
    })

    const snapshot = getActiveChatSessionSnapshot(workflowPath)
    expect(snapshot).not.toBeNull()
    expect(snapshot?.status).toBe("streaming")
    expect(snapshot?.activeToolName).toBeNull()
    expect(snapshot?.workflow).toEqual(initialWorkflow)
    expect(snapshot?.messages[0]?.role).toBe("user")
    expect(
      snapshot?.messages.some(
        (message) => message.streaming && message.content === "Working",
      ),
    ).toBe(true)
    expect(
      snapshot?.messages.some((message) => message.role === "tool_call"),
    ).toBe(true)
    expect(
      snapshot?.messages.some((message) => message.role === "tool_result"),
    ).toBe(true)

    clearActiveChatSession(sessionId)
  })

  it("removes the streaming placeholder when the assistant completes", () => {
    const workflowPath = "/tmp/complete.chain"
    const sessionId = "chat-2"
    const initialWorkflow = createWorkflow("Complete")

    beginActiveChatSession(
      workflowPath,
      sessionId,
      [
        {
          id: "user-1",
          role: "user",
          content: "Continue",
          timestamp: 1,
        },
      ],
      initialWorkflow,
    )

    applyChatEventToActiveSession({
      type: "text-delta",
      sessionId,
      workflowPath,
      content: "Done",
    })
    applyChatEventToActiveSession({
      type: "message-complete",
      sessionId,
      workflowPath,
      message: {
        id: "assistant-1",
        role: "assistant",
        content: "Final answer",
        timestamp: 2,
      },
    })

    const snapshot = getActiveChatSessionSnapshot(workflowPath)
    expect(snapshot?.messages.some((message) => message.streaming)).toBe(false)
    expect(snapshot?.messages.at(-1)?.content).toBe("Final answer")

    clearActiveChatSession(sessionId)
  })

  it("stores the latest workflow snapshot from mutation and completion events", () => {
    const workflowPath = "/tmp/workflow.chain"
    const sessionId = "chat-3"
    const initialWorkflow = createWorkflow("Initial")
    const mutatedWorkflow = createWorkflow("Mutated")
    const completedWorkflow = createWorkflow("Completed")

    beginActiveChatSession(workflowPath, sessionId, [], initialWorkflow)

    applyChatEventToActiveSession({
      type: "workflow-mutated",
      sessionId,
      workflowPath,
      workflow: mutatedWorkflow,
    })

    expect(getActiveChatSessionSnapshot(workflowPath)?.workflow).toEqual(
      mutatedWorkflow,
    )

    applyChatEventToActiveSession({
      type: "turn-complete",
      sessionId,
      workflowPath,
      workflow: completedWorkflow,
    })

    const snapshot = getActiveChatSessionSnapshot(workflowPath)
    expect(snapshot?.status).toBe("idle")
    expect(snapshot?.workflow).toEqual(completedWorkflow)

    clearActiveChatSession(sessionId)
  })

  it("clears the workflow lookup when a session is removed", () => {
    const workflowPath = "/tmp/cleanup.chain"
    const sessionId = "chat-4"

    beginActiveChatSession(
      workflowPath,
      sessionId,
      [],
      createWorkflow("Cleanup"),
    )
    clearActiveChatSession(sessionId)

    expect(getActiveChatSessionSnapshot(workflowPath)).toBeNull()
  })
})
