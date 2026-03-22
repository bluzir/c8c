import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  ChatConversation,
  ChatSessionSnapshot,
  Workflow,
} from "@shared/types"

const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>()

const handleChatMessageMock = vi.fn()
const cancelChatSessionMock = vi.fn()
const getActiveChatSessionMock = vi.fn()
const loadChatHistoryMock = vi.fn()
const clearChatHistoryMock = vi.fn()
const allowedWorkflowRootsMock = vi.fn<() => Promise<string[]>>()
const assertRegisteredProjectPathMock =
  vi.fn<(projectPath: string) => Promise<string>>()
const assertWithinRootsMock = vi.fn()
const logErrorMock = vi.fn()
const logInfoMock = vi.fn()
const fromWebContentsMock = vi.fn()

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        ipcHandlers.set(channel, handler)
      },
    ),
  },
  BrowserWindow: {
    fromWebContents: (...args: unknown[]) => fromWebContentsMock(...args),
  },
}))

vi.mock("../lib/chat-agent", () => ({
  handleChatMessage: (...args: unknown[]) => handleChatMessageMock(...args),
  cancelChatSession: (...args: unknown[]) => cancelChatSessionMock(...args),
  getActiveChatSession: (...args: unknown[]) =>
    getActiveChatSessionMock(...args),
}))

vi.mock("../lib/chat-storage", () => ({
  loadChatHistory: (...args: unknown[]) => loadChatHistoryMock(...args),
  clearChatHistory: (...args: unknown[]) => clearChatHistoryMock(...args),
}))

vi.mock("../lib/security-paths", () => ({
  allowedWorkflowRoots: (...args: unknown[]) =>
    allowedWorkflowRootsMock(...args),
  assertRegisteredProjectPath: (...args: unknown[]) =>
    assertRegisteredProjectPathMock(...args),
  assertWithinRoots: (...args: unknown[]) => assertWithinRootsMock(...args),
}))

vi.mock("../lib/structured-log", () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
  logInfo: (...args: unknown[]) => logInfoMock(...args),
}))

describe("chat IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    ipcHandlers.clear()
    allowedWorkflowRootsMock.mockResolvedValue(["/tmp/project/.c8c"])
    assertRegisteredProjectPathMock.mockImplementation(
      async (projectPath: string) => projectPath,
    )
    assertWithinRootsMock.mockImplementation((value: string) =>
      value.replace("/tmp/project/../project", "/tmp/project"),
    )
    fromWebContentsMock.mockReturnValue({
      isDestroyed: () => false,
      id: 1,
    })
  })

  it("sanitizes workflow and project paths before sending chat messages", async () => {
    const workflow: Workflow = {
      version: 1,
      name: "Ship flow",
      nodes: [],
      edges: [],
    }
    handleChatMessageMock.mockResolvedValue("session-1")

    const { registerChatHandlers } = await import("./chat")
    registerChatHandlers()

    const handler = ipcHandlers.get("chat:send-message") as
      | ((
          event: { sender: unknown },
          workflowPath: string,
          message: string,
          projectPath: string,
          currentWorkflow: Workflow,
        ) => Promise<string>)
      | undefined
    expect(handler).toBeDefined()

    await expect(
      handler!(
        { sender: { id: 42 } },
        "/tmp/project/../project/.c8c/review.chain",
        "Review the result",
        "/tmp/project",
        workflow,
      ),
    ).resolves.toBe("session-1")

    expect(handleChatMessageMock).toHaveBeenCalledWith(
      "/tmp/project/.c8c/review.chain",
      "Review the result",
      "/tmp/project",
      workflow,
      expect.objectContaining({ id: 1 }),
    )
  })

  it("loads history and active session for sanitized workflow paths", async () => {
    const history: ChatConversation = {
      version: 1,
      workflowPath: "/tmp/project/.c8c/review.chain",
      messages: [],
      latestWorkflow: null,
      createdAt: 1,
      updatedAt: 10,
    }
    const snapshot: ChatSessionSnapshot = {
      workflowPath: "/tmp/project/.c8c/review.chain",
      sessionId: "session-1",
      status: "streaming",
      activeToolName: null,
      workflow: null,
      messages: [],
      updatedAt: 10,
    }
    loadChatHistoryMock.mockResolvedValue(history)
    getActiveChatSessionMock.mockResolvedValue(snapshot)

    const { registerChatHandlers } = await import("./chat")
    registerChatHandlers()

    const loadHistory = ipcHandlers.get("chat:load-history") as
      | ((
          event: unknown,
          workflowPath: string,
        ) => Promise<ChatConversation | null>)
      | undefined
    const getActiveSession = ipcHandlers.get("chat:get-active-session") as
      | ((
          event: unknown,
          workflowPath: string,
        ) => Promise<ChatSessionSnapshot | null>)
      | undefined

    await expect(
      loadHistory!(undefined, "/tmp/project/../project/.c8c/review.chain"),
    ).resolves.toEqual(history)
    await expect(
      getActiveSession!(undefined, "/tmp/project/../project/.c8c/review.chain"),
    ).resolves.toEqual(snapshot)
    expect(loadChatHistoryMock).toHaveBeenCalledWith(
      "/tmp/project/.c8c/review.chain",
    )
    expect(getActiveChatSessionMock).toHaveBeenCalledWith(
      "/tmp/project/.c8c/review.chain",
    )
  })
})
