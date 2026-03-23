import { describe, expect, it } from "vitest"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import { resolveRecoveredWorkflow } from "./useChatSession"

function createWorkflow(name: string) {
  return {
    ...createEmptyWorkflow(),
    name,
  }
}

describe("useChatSession helpers", () => {
  it("prefers active session workflow over disk and chat history", () => {
    const activeSessionWorkflow = createWorkflow("Active session")
    const fileWorkflow = createWorkflow("Disk workflow")
    const conversationLatestWorkflow = createWorkflow("Chat history")

    expect(
      resolveRecoveredWorkflow({
        activeSessionWorkflow,
        conversationLatestWorkflow,
        fileWorkflow,
        workflowDirty: false,
      }),
    ).toEqual(activeSessionWorkflow)
  })

  it("prefers the current workflow file over stale chat history when idle", () => {
    const fileWorkflow = createWorkflow("Disk workflow")
    const conversationLatestWorkflow = createWorkflow("Chat history")

    expect(
      resolveRecoveredWorkflow({
        activeSessionWorkflow: null,
        conversationLatestWorkflow,
        fileWorkflow,
        workflowDirty: false,
      }),
    ).toEqual(fileWorkflow)
  })

  it("falls back to chat history only when the file snapshot is unavailable", () => {
    const conversationLatestWorkflow = createWorkflow("Chat history")

    expect(
      resolveRecoveredWorkflow({
        activeSessionWorkflow: null,
        conversationLatestWorkflow,
        fileWorkflow: null,
        workflowDirty: false,
      }),
    ).toEqual(conversationLatestWorkflow)
  })

  it("does not overwrite a dirty workflow without an active session", () => {
    expect(
      resolveRecoveredWorkflow({
        activeSessionWorkflow: null,
        conversationLatestWorkflow: createWorkflow("Chat history"),
        fileWorkflow: createWorkflow("Disk workflow"),
        workflowDirty: true,
      }),
    ).toBeNull()
  })
})
