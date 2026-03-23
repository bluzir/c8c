import { ipcMain, BrowserWindow } from "electron"
import {
  handleChatMessage,
  cancelChatSession,
  getActiveChatSession,
} from "../lib/chat-agent"
import { loadChatHistory, clearChatHistory } from "../lib/chat-storage"
import type {
  ChatConversation,
  ChatSessionSnapshot,
  Workflow,
} from "@shared/types"
import { resolve, extname } from "node:path"
import {
  allowedWorkflowRoots,
  assertRegisteredProjectPath,
  assertWithinRoots,
} from "../lib/security-paths"
import { logError, logInfo } from "../lib/structured-log"
import { parseWorkflowPayload } from "@shared/workflow-payload"

async function assertWorkflowPath(workflowPath: string): Promise<string> {
  const resolvedPath = resolve(workflowPath)
  const extension = extname(resolvedPath).toLowerCase()
  if (extension !== ".chain" && extension !== ".yaml" && extension !== ".yml") {
    throw new Error("Workflow path must point to a .chain/.yaml/.yml file")
  }
  const workflowRoots = await allowedWorkflowRoots()
  return assertWithinRoots(resolvedPath, workflowRoots, "Workflow path")
}

export function registerChatHandlers() {
  logInfo("chat-ipc", "handlers_registering")

  ipcMain.handle(
    "chat:send-message",
    async (
      event,
      workflowPath: string,
      message: string,
      projectPath: string,
      currentWorkflow: Workflow,
    ): Promise<string> => {
      const safeWorkflowPath = await assertWorkflowPath(workflowPath)
      const safeProjectPath = await assertRegisteredProjectPath(projectPath)
      const safeWorkflow = parseWorkflowPayload(
        currentWorkflow,
        "Workflow payload",
      )
      logInfo("chat-ipc", "send_message_called", {
        workflowPath: safeWorkflowPath,
        messageLength: message.length,
        projectPath: safeProjectPath,
        hasWorkflow: true,
        nodeCount: safeWorkflow.nodes.length,
      })
      try {
        const window = BrowserWindow.fromWebContents(event.sender)
        const sessionId = await handleChatMessage(
          safeWorkflowPath,
          message,
          safeProjectPath,
          safeWorkflow,
          window && !window.isDestroyed() ? window : null,
        )
        logInfo("chat-ipc", "send_message_completed", {
          workflowPath: safeWorkflowPath,
          sessionId,
        })
        return sessionId
      } catch (err) {
        logError("chat-ipc", "send_message_failed", {
          workflowPath: safeWorkflowPath,
          error: err instanceof Error ? err.message : String(err),
        })
        throw err
      }
    },
  )

  ipcMain.handle(
    "chat:load-history",
    async (_event, workflowPath: string): Promise<ChatConversation | null> => {
      const safeWorkflowPath = await assertWorkflowPath(workflowPath)
      logInfo("chat-ipc", "load_history_called", {
        workflowPath: safeWorkflowPath,
      })
      return loadChatHistory(safeWorkflowPath)
    },
  )

  ipcMain.handle(
    "chat:get-active-session",
    async (
      _event,
      workflowPath: string,
    ): Promise<ChatSessionSnapshot | null> => {
      const safeWorkflowPath = await assertWorkflowPath(workflowPath)
      logInfo("chat-ipc", "get_active_session_called", {
        workflowPath: safeWorkflowPath,
      })
      return getActiveChatSession(safeWorkflowPath)
    },
  )

  ipcMain.handle(
    "chat:cancel",
    async (_event, sessionId: string): Promise<boolean> => {
      logInfo("chat-ipc", "cancel_called", { sessionId })
      return cancelChatSession(sessionId)
    },
  )

  ipcMain.handle(
    "chat:clear-history",
    async (_event, workflowPath: string): Promise<void> => {
      const safeWorkflowPath = await assertWorkflowPath(workflowPath)
      logInfo("chat-ipc", "clear_history_called", {
        workflowPath: safeWorkflowPath,
      })
      return clearChatHistory(safeWorkflowPath)
    },
  )

  logInfo("chat-ipc", "handlers_registered")
}
