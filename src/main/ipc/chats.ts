import { ipcMain } from "electron"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { Chat, ChatSummary } from "@shared/types"
import {
  createChat,
  loadChat,
  saveChat,
  listProjectChats,
  archiveChat,
  deleteChat,
} from "../lib/chat-store"
import { assertRegisteredProjectPath } from "../lib/security-paths"
import { migrateProjectToChats } from "../lib/chat-migration"
import { logInfo, logWarn } from "../lib/structured-log"
import { errorCode, errorMessage } from "../lib/error-utils"

const COMPONENT = "chats-ipc"

function timelinePath(projectPath: string, chatId: string): string {
  return join(resolve(projectPath), ".c8c", "chats", `${chatId}-timeline.json`)
}

export function registerChatsHandlers(): void {
  logInfo(COMPONENT, "handlers_registering")

  ipcMain.handle(
    "chats:create",
    async (_event, projectPath: string, chat: Chat): Promise<void> => {
      const safePath = await assertRegisteredProjectPath(projectPath)
      logInfo(COMPONENT, "create_called", { projectPath: safePath, chatId: chat.id })
      await createChat(safePath, chat)
    },
  )

  ipcMain.handle(
    "chats:load",
    async (_event, projectPath: string, chatId: string): Promise<Chat | null> => {
      const safePath = await assertRegisteredProjectPath(projectPath)
      logInfo(COMPONENT, "load_called", { projectPath: safePath, chatId })
      return loadChat(safePath, chatId)
    },
  )

  ipcMain.handle(
    "chats:save",
    async (_event, projectPath: string, chat: Chat): Promise<void> => {
      const safePath = await assertRegisteredProjectPath(projectPath)
      logInfo(COMPONENT, "save_called", { projectPath: safePath, chatId: chat.id })
      await saveChat(safePath, chat)
    },
  )

  ipcMain.handle(
    "chats:list-project",
    async (
      _event,
      projectPath: string,
      options?: { includeArchived?: boolean },
    ): Promise<ChatSummary[]> => {
      const safePath = await assertRegisteredProjectPath(projectPath)
      logInfo(COMPONENT, "list_project_called", {
        projectPath: safePath,
        includeArchived: options?.includeArchived ?? false,
      })
      // Run legacy migration (idempotent) before listing
      await migrateProjectToChats(safePath)
      return listProjectChats(safePath, options)
    },
  )

  ipcMain.handle(
    "chats:archive",
    async (_event, projectPath: string, chatId: string): Promise<void> => {
      const safePath = await assertRegisteredProjectPath(projectPath)
      logInfo(COMPONENT, "archive_called", { projectPath: safePath, chatId })
      await archiveChat(safePath, chatId)
    },
  )

  ipcMain.handle(
    "chats:delete",
    async (
      _event,
      projectPath: string,
      chatId: string,
      options?: { deleteRunWorkspaces?: boolean },
    ): Promise<void> => {
      const safePath = await assertRegisteredProjectPath(projectPath)
      logInfo(COMPONENT, "delete_called", {
        projectPath: safePath,
        chatId,
        deleteRunWorkspaces: options?.deleteRunWorkspaces ?? false,
      })
      await deleteChat(safePath, chatId, options)
    },
  )

  ipcMain.handle(
    "chats:save-timeline",
    async (
      _event,
      projectPath: string,
      chatId: string,
      timeline: unknown,
    ): Promise<void> => {
      const safePath = await assertRegisteredProjectPath(projectPath)
      logInfo(COMPONENT, "save_timeline_called", { projectPath: safePath, chatId })
      const filePath = timelinePath(safePath, chatId)
      const dir = join(resolve(safePath), ".c8c", "chats")
      await mkdir(dir, { recursive: true })
      await writeFile(filePath, JSON.stringify(timeline, null, 2), "utf-8")
    },
  )

  ipcMain.handle(
    "chats:load-timeline",
    async (
      _event,
      projectPath: string,
      chatId: string,
    ): Promise<unknown | null> => {
      const safePath = await assertRegisteredProjectPath(projectPath)
      logInfo(COMPONENT, "load_timeline_called", { projectPath: safePath, chatId })
      const filePath = timelinePath(safePath, chatId)
      try {
        const raw = await readFile(filePath, "utf-8")
        return JSON.parse(raw)
      } catch (error) {
        if (errorCode(error) !== "ENOENT") {
          logWarn(COMPONENT, "load_timeline_failed", {
            chatId,
            filePath,
            error: errorMessage(error),
          })
        }
        return null
      }
    },
  )

  logInfo(COMPONENT, "handlers_registered")
}
