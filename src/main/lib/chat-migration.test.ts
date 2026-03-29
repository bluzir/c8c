import { createHash } from "node:crypto"
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { Chat } from "@shared/types"
import { migrateProjectToChats } from "./chat-migration"

function deterministicId(key: string): string {
  return createHash("sha256")
    .update("chat:" + key)
    .digest("hex")
    .slice(0, 32)
}

interface FakeRunResult {
  runId: string
  status: string
  workflowName: string
  workflowPath?: string
  startedAt: number
  completedAt: number
  reportPath: string
  workspace: string
}

async function writeRunResult(
  projectDir: string,
  runId: string,
  overrides?: Partial<FakeRunResult>,
): Promise<void> {
  const runDir = join(projectDir, ".c8c", "runs", runId)
  await mkdir(runDir, { recursive: true })
  const result: FakeRunResult = {
    runId,
    status: "completed",
    workflowName: "Test Flow",
    workflowPath: "/path/to/workflow.yaml",
    startedAt: 1000,
    completedAt: 2000,
    reportPath: join(runDir, "report.md"),
    workspace: runDir,
    ...overrides,
  }
  await writeFile(join(runDir, "run-result.json"), JSON.stringify(result))
}

async function readChat(projectDir: string, chatId: string): Promise<Chat> {
  const filePath = join(projectDir, ".c8c", "chats", `${chatId}.json`)
  const raw = await readFile(filePath, "utf-8")
  return JSON.parse(raw) as Chat
}

async function listChatFiles(projectDir: string): Promise<string[]> {
  const chatsDir = join(projectDir, ".c8c", "chats")
  try {
    const entries = await readdir(chatsDir)
    return entries.filter(
      (name) => name.endsWith(".json") && !name.includes("-timeline"),
    )
  } catch {
    return []
  }
}

describe("chat-migration", () => {
  let projectDir: string

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "chat-migration-test-"))
  })

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  it("creates synthetic chats from existing run results", async () => {
    await writeRunResult(projectDir, "run-1", {
      workflowName: "My Flow",
      workflowPath: "/flows/my-flow.yaml",
      startedAt: 1000,
      completedAt: 2000,
    })

    await migrateProjectToChats(projectDir)

    const chatId = deterministicId("/flows/my-flow.yaml")
    const chat = await readChat(projectDir, chatId)

    expect(chat.id).toBe(chatId)
    expect(chat.name).toBe("My Flow")
    expect(chat.archived).toBe(false)
    expect(chat.runs).toHaveLength(1)
    expect(chat.runs[0].runId).toBe("run-1")
    expect(chat.runs[0].status).toBe("completed")
    expect(chat.runs[0].templateId).toBe("legacy")
    expect(chat.artifactPool).toEqual([])
  })

  it("skips migration if chats already exist", async () => {
    // Create a run
    await writeRunResult(projectDir, "run-1")

    // Pre-populate chats directory with an existing chat
    const chatsDir = join(projectDir, ".c8c", "chats")
    await mkdir(chatsDir, { recursive: true })
    await writeFile(
      join(chatsDir, "existing-chat.json"),
      JSON.stringify({
        id: "existing-chat",
        name: "Existing",
        projectPath: projectDir,
        createdAt: 500,
        lastActivityAt: 500,
        archived: false,
        runs: [],
        artifactPool: [],
      }),
    )

    await migrateProjectToChats(projectDir)

    // Should still only have the one pre-existing chat
    const chatFiles = await listChatFiles(projectDir)
    expect(chatFiles).toEqual(["existing-chat.json"])
  })

  it("is idempotent — running twice produces same result", async () => {
    await writeRunResult(projectDir, "run-1", {
      workflowPath: "/flows/flow.yaml",
      startedAt: 1000,
      completedAt: 2000,
    })

    // First migration
    await migrateProjectToChats(projectDir)
    const chatId = deterministicId("/flows/flow.yaml")
    const chatAfterFirst = await readChat(projectDir, chatId)

    // Remove chats to allow re-migration
    const chatsDir = join(projectDir, ".c8c", "chats")
    await rm(chatsDir, { recursive: true, force: true })

    // Second migration
    await migrateProjectToChats(projectDir)
    const chatAfterSecond = await readChat(projectDir, chatId)

    // Deterministic IDs mean same chat shape
    expect(chatAfterFirst.id).toBe(chatAfterSecond.id)
    expect(chatAfterFirst.name).toBe(chatAfterSecond.name)
    expect(chatAfterFirst.runs).toEqual(chatAfterSecond.runs)
  })

  it("handles empty project with no runs directory", async () => {
    // No .c8c/runs directory at all
    await migrateProjectToChats(projectDir)

    const chatFiles = await listChatFiles(projectDir)
    expect(chatFiles).toHaveLength(0)
  })

  it("groups multiple runs under same workflowPath into one chat", async () => {
    const sharedPath = "/flows/shared-flow.yaml"

    await writeRunResult(projectDir, "run-a", {
      workflowName: "Shared Flow",
      workflowPath: sharedPath,
      startedAt: 1000,
      completedAt: 2000,
    })
    await writeRunResult(projectDir, "run-b", {
      workflowName: "Shared Flow",
      workflowPath: sharedPath,
      startedAt: 3000,
      completedAt: 4000,
    })
    await writeRunResult(projectDir, "run-c", {
      workflowName: "Other Flow",
      workflowPath: "/flows/other.yaml",
      startedAt: 5000,
      completedAt: 6000,
    })

    await migrateProjectToChats(projectDir)

    const chatFiles = await listChatFiles(projectDir)
    expect(chatFiles).toHaveLength(2)

    const sharedChatId = deterministicId(sharedPath)
    const sharedChat = await readChat(projectDir, sharedChatId)
    expect(sharedChat.runs).toHaveLength(2)
    // Runs should be sorted by startedAt
    expect(sharedChat.runs[0].runId).toBe("run-a")
    expect(sharedChat.runs[1].runId).toBe("run-b")
    expect(sharedChat.lastActivityAt).toBe(4000)

    const otherChatId = deterministicId("/flows/other.yaml")
    const otherChat = await readChat(projectDir, otherChatId)
    expect(otherChat.runs).toHaveLength(1)
    expect(otherChat.name).toBe("Other Flow")
  })

  it("handles runs without workflowPath as orphaned", async () => {
    await writeRunResult(projectDir, "orphan-run", {
      workflowName: "Orphan",
      workflowPath: undefined,
      startedAt: 1000,
      completedAt: 2000,
    })

    await migrateProjectToChats(projectDir)

    const chatId = deterministicId("orphaned-orphan-run")
    const chat = await readChat(projectDir, chatId)
    expect(chat.name).toBe("Orphan")
    expect(chat.runs).toHaveLength(1)
    expect(chat.runs[0].runId).toBe("orphan-run")
  })

  it("skips corrupted run-result.json files", async () => {
    // Write a valid run
    await writeRunResult(projectDir, "good-run", {
      workflowPath: "/flows/good.yaml",
    })

    // Write a corrupted run-result.json
    const badDir = join(projectDir, ".c8c", "runs", "bad-run")
    await mkdir(badDir, { recursive: true })
    await writeFile(join(badDir, "run-result.json"), "not valid json{{{")

    // Write a run-result.json missing required fields
    const incompleteDir = join(projectDir, ".c8c", "runs", "incomplete-run")
    await mkdir(incompleteDir, { recursive: true })
    await writeFile(
      join(incompleteDir, "run-result.json"),
      JSON.stringify({ runId: "incomplete-run" }),
    )

    await migrateProjectToChats(projectDir)

    // Only the good run should have produced a chat
    const chatFiles = await listChatFiles(projectDir)
    expect(chatFiles).toHaveLength(1)

    const chatId = deterministicId("/flows/good.yaml")
    const chat = await readChat(projectDir, chatId)
    expect(chat.runs).toHaveLength(1)
    expect(chat.runs[0].runId).toBe("good-run")
  })

  it("maps non-standard run statuses to cancelled", async () => {
    await writeRunResult(projectDir, "interrupted-run", {
      status: "interrupted",
      workflowPath: "/flows/test.yaml",
      startedAt: 1000,
      completedAt: 2000,
    })

    await migrateProjectToChats(projectDir)

    const chatId = deterministicId("/flows/test.yaml")
    const chat = await readChat(projectDir, chatId)
    expect(chat.runs[0].status).toBe("cancelled")
  })

  it("handles empty runs directory", async () => {
    await mkdir(join(projectDir, ".c8c", "runs"), { recursive: true })

    await migrateProjectToChats(projectDir)

    const chatFiles = await listChatFiles(projectDir)
    expect(chatFiles).toHaveLength(0)
  })
})
