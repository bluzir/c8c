import { mkdir, readdir, readFile, rm, unlink } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { Chat, ChatRun, ChatSummary } from "@shared/types"
import { errorCode, errorMessage } from "./error-utils"
import { logWarn } from "./structured-log"
import { writeFileAtomic } from "./atomic-write"
import { assertWithinRoots, allowedReportRoots } from "./security-paths"

const CHATS_DIR = "chats"
const COMPONENT = "chat-store"

function assertSafeChatId(chatId: string): string {
  if (
    !chatId ||
    chatId.includes("..") ||
    chatId.includes("/") ||
    chatId.includes("\\")
  ) {
    throw new Error(`Invalid chat ID: ${chatId}`)
  }
  return chatId
}

function chatsDir(projectPath: string): string {
  return join(resolve(projectPath), ".c8c", CHATS_DIR)
}

function chatFilePath(projectPath: string, chatId: string): string {
  assertSafeChatId(chatId)
  return join(chatsDir(projectPath), `${chatId}.json`)
}

function parseChat(raw: unknown): Chat | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const parsed = raw as Record<string, unknown>

  if (
    typeof parsed.id !== "string" ||
    typeof parsed.name !== "string" ||
    typeof parsed.projectPath !== "string" ||
    typeof parsed.createdAt !== "number" ||
    typeof parsed.lastActivityAt !== "number" ||
    typeof parsed.archived !== "boolean" ||
    !Array.isArray(parsed.runs) ||
    !Array.isArray(parsed.artifactPool)
  ) {
    return null
  }

  return {
    id: parsed.id,
    name: parsed.name,
    projectPath: parsed.projectPath,
    createdAt: parsed.createdAt,
    lastActivityAt: parsed.lastActivityAt,
    archived: parsed.archived,
    runs: parsed.runs as ChatRun[],
    artifactPool: parsed.artifactPool as string[],
  }
}

function toSummary(chat: Chat): ChatSummary {
  const latestRun =
    chat.runs.length > 0 ? chat.runs[chat.runs.length - 1] : null
  return {
    id: chat.id,
    name: chat.name,
    createdAt: chat.createdAt,
    lastActivityAt: chat.lastActivityAt,
    archived: chat.archived,
    runCount: chat.runs.length,
    latestRunId: latestRun ? latestRun.runId : null,
    latestRunStatus: latestRun ? latestRun.status : null,
  }
}

export async function createChat(
  projectPath: string,
  chat: Chat,
): Promise<void> {
  const dir = chatsDir(projectPath)
  await mkdir(dir, { recursive: true })
  const filePath = chatFilePath(projectPath, chat.id)
  await writeFileAtomic(filePath, JSON.stringify(chat, null, 2))
}

export async function loadChat(
  projectPath: string,
  chatId: string,
): Promise<Chat | null> {
  const filePath = chatFilePath(projectPath, chatId)
  try {
    const raw = await readFile(filePath, "utf-8")
    const parsed = parseChat(JSON.parse(raw))
    if (!parsed) {
      logWarn(COMPONENT, "invalid_chat_file", { chatId, filePath })
    }
    return parsed
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      logWarn(COMPONENT, "load_chat_failed", {
        chatId,
        filePath,
        error: errorMessage(error),
      })
    }
    return null
  }
}

export async function saveChat(
  projectPath: string,
  chat: Chat,
): Promise<void> {
  const dir = chatsDir(projectPath)
  await mkdir(dir, { recursive: true })
  const filePath = chatFilePath(projectPath, chat.id)
  await writeFileAtomic(filePath, JSON.stringify(chat, null, 2))
}

export async function listProjectChats(
  projectPath: string,
  options?: { includeArchived?: boolean },
): Promise<ChatSummary[]> {
  const dir = chatsDir(projectPath)
  let entries: string[]
  try {
    const dirEntries = await readdir(dir)
    entries = dirEntries.filter(
      (name) => name.endsWith(".json") && !name.includes("-timeline"),
    )
  } catch (error) {
    if (errorCode(error) === "ENOENT") return []
    logWarn(COMPONENT, "list_chats_readdir_failed", {
      dir,
      error: errorMessage(error),
    })
    return []
  }

  const summaries: ChatSummary[] = []
  for (const entry of entries) {
    try {
      const raw = await readFile(join(dir, entry), "utf-8")
      const chat = parseChat(JSON.parse(raw))
      if (!chat) {
        logWarn(COMPONENT, "invalid_chat_file_in_list", { file: entry })
        continue
      }
      if (!options?.includeArchived && chat.archived) continue
      summaries.push(toSummary(chat))
    } catch (error) {
      logWarn(COMPONENT, "read_chat_in_list_failed", {
        file: entry,
        error: errorMessage(error),
      })
    }
  }

  summaries.sort((a, b) => b.lastActivityAt - a.lastActivityAt)
  return summaries
}

export async function archiveChat(
  projectPath: string,
  chatId: string,
): Promise<void> {
  const chat = await loadChat(projectPath, chatId)
  if (!chat) {
    logWarn(COMPONENT, "archive_chat_not_found", { chatId })
    return
  }
  chat.archived = true
  await saveChat(projectPath, chat)
}

export async function deleteChat(
  projectPath: string,
  chatId: string,
  options?: { deleteRunWorkspaces?: boolean },
): Promise<void> {
  const filePath = chatFilePath(projectPath, chatId)

  if (options?.deleteRunWorkspaces) {
    const chat = await loadChat(projectPath, chatId)
    if (chat) {
      const roots = await allowedReportRoots()
      for (const run of chat.runs) {
        if (run.workspace) {
          try {
            const safePath = assertWithinRoots(
              resolve(run.workspace),
              roots,
              "Run workspace",
            )
            await rm(safePath, { recursive: true, force: true })
          } catch (error) {
            logWarn(COMPONENT, "delete_run_workspace_failed", {
              chatId,
              runId: run.runId,
              workspace: run.workspace,
              error: errorMessage(error),
            })
          }
        }
      }
    }
  }

  // Remove the chat JSON file
  try {
    await unlink(filePath)
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      logWarn(COMPONENT, "delete_chat_file_failed", {
        chatId,
        filePath,
        error: errorMessage(error),
      })
    }
  }

  // Also remove the timeline file if it exists
  const timelinePath = join(chatsDir(projectPath), `${chatId}-timeline.json`)
  try {
    await unlink(timelinePath)
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      logWarn(COMPONENT, "delete_timeline_file_failed", {
        chatId,
        error: errorMessage(error),
      })
    }
  }
}
