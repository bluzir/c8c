import { readFile, unlink, rename, access } from "node:fs/promises"
import type { ChatConversation } from "@shared/types"
import { writeFileAtomic } from "./atomic-write"

/**
 * Get the chat history file path for a workflow file.
 * my-workflow.chain → my-workflow.chat.json
 */
function chatPathFor(workflowPath: string): string {
  if (!/\.(chain|yaml|yml)$/i.test(workflowPath)) {
    throw new Error(
      `chatPathFor: unsupported extension in "${workflowPath}". Expected .chain, .yaml, or .yml`,
    )
  }
  return workflowPath.replace(/\.(chain|yaml|yml)$/i, ".chat.json")
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Load chat conversation history for a workflow.
 */
export async function loadChatHistory(
  workflowPath: string,
): Promise<ChatConversation | null> {
  const chatPath = chatPathFor(workflowPath)
  try {
    const raw = await readFile(chatPath, "utf-8")
    const data = JSON.parse(raw) as ChatConversation
    if (
      data.version !== 1 ||
      !Array.isArray(data.messages) ||
      ("latestWorkflow" in data &&
        data.latestWorkflow != null &&
        typeof data.latestWorkflow !== "object")
    ) {
      return null
    }
    return data
  } catch {
    return null
  }
}

/**
 * Save chat conversation history for a workflow.
 */
export async function saveChatHistory(
  workflowPath: string,
  conversation: ChatConversation,
): Promise<void> {
  const chatPath = chatPathFor(workflowPath)
  conversation.updatedAt = Date.now()
  await writeFileAtomic(chatPath, JSON.stringify(conversation, null, 2))
}

/**
 * Clear chat history for a workflow (delete the .chat.json file).
 */
export async function clearChatHistory(workflowPath: string): Promise<void> {
  const chatPath = chatPathFor(workflowPath)
  try {
    await unlink(chatPath)
  } catch {
    // File might not exist — that's fine
  }
}

/**
 * Move chat history file when a workflow file is renamed.
 * If source history doesn't exist, this is a no-op.
 * If destination history already exists, source is left untouched to avoid data loss.
 */
export async function moveChatHistory(
  fromWorkflowPath: string,
  toWorkflowPath: string,
): Promise<void> {
  const fromPath = chatPathFor(fromWorkflowPath)
  const toPath = chatPathFor(toWorkflowPath)
  if (fromPath === toPath) return
  if (!(await fileExists(fromPath))) return
  if (await fileExists(toPath)) return
  await rename(fromPath, toPath)
}

/**
 * Create a new empty conversation.
 */
export function createConversation(workflowPath: string): ChatConversation {
  return {
    version: 1,
    workflowPath,
    messages: [],
    latestWorkflow: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}
