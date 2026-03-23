import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  moveChatHistory,
  loadChatHistory,
  saveChatHistory,
  createConversation,
} from "./chat-storage"
import type { Workflow } from "@shared/types"

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

describe("chat-storage", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "chat-storage-test-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("moves .chat.json file when workflow is renamed", async () => {
    const fromWorkflowPath = join(dir, "alpha.chain")
    const toWorkflowPath = join(dir, "beta.chain")
    const fromChatPath = join(dir, "alpha.chat.json")
    const toChatPath = join(dir, "beta.chat.json")

    const conversation = createConversation(fromWorkflowPath)
    conversation.messages.push({
      id: "m1",
      role: "user",
      content: "hello",
      timestamp: Date.now(),
    })

    await saveChatHistory(fromWorkflowPath, conversation)
    await moveChatHistory(fromWorkflowPath, toWorkflowPath)

    const moved = await loadChatHistory(toWorkflowPath)
    expect(moved?.messages).toHaveLength(1)
    expect(moved?.messages[0]?.content).toBe("hello")

    const sourceRaw = await readFile(fromChatPath, "utf-8").catch(() => null)
    expect(sourceRaw).toBeNull()

    const targetRaw = await readFile(toChatPath, "utf-8")
    expect(targetRaw.length).toBeGreaterThan(0)
  })

  it("is a no-op when source chat does not exist", async () => {
    const fromWorkflowPath = join(dir, "missing.chain")
    const toWorkflowPath = join(dir, "next.chain")
    await expect(
      moveChatHistory(fromWorkflowPath, toWorkflowPath),
    ).resolves.toBeUndefined()
  })

  it("does not overwrite destination chat history", async () => {
    const fromWorkflowPath = join(dir, "from.chain")
    const toWorkflowPath = join(dir, "to.chain")

    await writeFile(
      join(dir, "from.chat.json"),
      JSON.stringify(createConversation(fromWorkflowPath)),
      "utf-8",
    )
    const destinationConversation = createConversation(toWorkflowPath)
    destinationConversation.messages.push({
      id: "m-destination",
      role: "assistant",
      content: "keep me",
      timestamp: Date.now(),
    })
    await writeFile(
      join(dir, "to.chat.json"),
      JSON.stringify(destinationConversation),
      "utf-8",
    )

    await moveChatHistory(fromWorkflowPath, toWorkflowPath)

    const destination = await loadChatHistory(toWorkflowPath)
    expect(destination?.messages[0]?.content).toBe("keep me")
  })

  it("persists the latest workflow snapshot with chat history", async () => {
    const workflowPath = join(dir, "stateful.chain")
    const conversation = createConversation(workflowPath)
    conversation.latestWorkflow = createWorkflow("Recovered")

    await saveChatHistory(workflowPath, conversation)

    const restored = await loadChatHistory(workflowPath)
    expect(restored?.latestWorkflow).toEqual(conversation.latestWorkflow)
  })
})
