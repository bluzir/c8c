import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Chat } from "@shared/types"
import {
  archiveChat,
  createChat,
  deleteChat,
  listProjectChats,
  loadChat,
  saveChat,
} from "./chat-store"

function makeChat(overrides?: Partial<Chat>): Chat {
  return {
    id: "chat-1",
    name: "Test Chat",
    projectPath: "/tmp/test-project",
    createdAt: 1000,
    lastActivityAt: 2000,
    archived: false,
    runs: [],
    artifactPool: [],
    ...overrides,
  }
}

describe("chat-store", () => {
  let projectDir: string

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "chat-store-test-"))
  })

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  it("createChat writes file, loadChat reads it back", async () => {
    const chat = makeChat({ projectPath: projectDir })
    await createChat(projectDir, chat)

    const loaded = await loadChat(projectDir, "chat-1")
    expect(loaded).toEqual(chat)

    // Verify file exists on disk
    const filePath = join(projectDir, ".c8c", "chats", "chat-1.json")
    const raw = await readFile(filePath, "utf-8")
    expect(JSON.parse(raw)).toEqual(chat)
  })

  it("loadChat returns null for nonexistent chat", async () => {
    const loaded = await loadChat(projectDir, "nonexistent")
    expect(loaded).toBeNull()
  })

  it("saveChat updates existing chat", async () => {
    const chat = makeChat({ projectPath: projectDir })
    await createChat(projectDir, chat)

    const updated = { ...chat, name: "Updated Chat", lastActivityAt: 3000 }
    await saveChat(projectDir, updated)

    const loaded = await loadChat(projectDir, "chat-1")
    expect(loaded).toEqual(updated)
    expect(loaded!.name).toBe("Updated Chat")
    expect(loaded!.lastActivityAt).toBe(3000)
  })

  it("listProjectChats returns non-archived chats sorted by lastActivityAt", async () => {
    const chat1 = makeChat({
      id: "chat-1",
      name: "Older",
      projectPath: projectDir,
      lastActivityAt: 1000,
    })
    const chat2 = makeChat({
      id: "chat-2",
      name: "Newer",
      projectPath: projectDir,
      lastActivityAt: 3000,
    })
    const chat3 = makeChat({
      id: "chat-3",
      name: "Archived",
      projectPath: projectDir,
      lastActivityAt: 5000,
      archived: true,
    })

    await createChat(projectDir, chat1)
    await createChat(projectDir, chat2)
    await createChat(projectDir, chat3)

    const summaries = await listProjectChats(projectDir)
    expect(summaries).toHaveLength(2)
    expect(summaries[0].id).toBe("chat-2")
    expect(summaries[0].name).toBe("Newer")
    expect(summaries[0].lastActivityAt).toBe(3000)
    expect(summaries[0].runCount).toBe(0)
    expect(summaries[0].latestRunStatus).toBeNull()
    expect(summaries[1].id).toBe("chat-1")
  })

  it("listProjectChats with includeArchived returns all", async () => {
    const chat1 = makeChat({
      id: "chat-1",
      projectPath: projectDir,
      lastActivityAt: 1000,
    })
    const chat2 = makeChat({
      id: "chat-2",
      projectPath: projectDir,
      lastActivityAt: 2000,
      archived: true,
    })

    await createChat(projectDir, chat1)
    await createChat(projectDir, chat2)

    const summaries = await listProjectChats(projectDir, {
      includeArchived: true,
    })
    expect(summaries).toHaveLength(2)
    expect(summaries[0].id).toBe("chat-2")
    expect(summaries[0].archived).toBe(true)
    expect(summaries[1].id).toBe("chat-1")
    expect(summaries[1].archived).toBe(false)
  })

  it("archiveChat sets archived=true", async () => {
    const chat = makeChat({ projectPath: projectDir })
    await createChat(projectDir, chat)

    await archiveChat(projectDir, "chat-1")

    const loaded = await loadChat(projectDir, "chat-1")
    expect(loaded).not.toBeNull()
    expect(loaded!.archived).toBe(true)
  })

  it("deleteChat removes the file", async () => {
    const chat = makeChat({ projectPath: projectDir })
    await createChat(projectDir, chat)

    // Verify it exists
    const before = await loadChat(projectDir, "chat-1")
    expect(before).not.toBeNull()

    await deleteChat(projectDir, "chat-1")

    const after = await loadChat(projectDir, "chat-1")
    expect(after).toBeNull()
  })

  it("listProjectChats returns empty for empty/nonexistent dir", async () => {
    // No chats dir created at all
    const summaries = await listProjectChats(projectDir)
    expect(summaries).toEqual([])

    // Create empty chats dir
    await mkdir(join(projectDir, ".c8c", "chats"), { recursive: true })
    const summaries2 = await listProjectChats(projectDir)
    expect(summaries2).toEqual([])
  })

  it("loadChat returns null for corrupted JSON", async () => {
    const dir = join(projectDir, ".c8c", "chats")
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, "bad-chat.json"), "not valid json{{{", "utf-8")

    const loaded = await loadChat(projectDir, "bad-chat")
    expect(loaded).toBeNull()
  })

  it("listProjectChats ignores timeline files", async () => {
    const chat = makeChat({ projectPath: projectDir })
    await createChat(projectDir, chat)

    // Write a timeline file alongside
    const dir = join(projectDir, ".c8c", "chats")
    await writeFile(
      join(dir, "chat-1-timeline.json"),
      JSON.stringify([]),
      "utf-8",
    )

    const summaries = await listProjectChats(projectDir)
    expect(summaries).toHaveLength(1)
    expect(summaries[0].id).toBe("chat-1")
  })

  it("listProjectChats returns correct runCount and latestRunStatus", async () => {
    const chat = makeChat({
      projectPath: projectDir,
      runs: [
        {
          runId: "run-1",
          templateId: "tpl-1",
          templateName: "Test Template",
          workflowPath: "/tmp/wf.yaml",
          workspace: "/tmp/ws",
          startedAt: 1000,
          completedAt: 2000,
          status: "completed",
          userPrompt: "do something",
        },
        {
          runId: "run-2",
          templateId: "tpl-2",
          templateName: "Test Template 2",
          workflowPath: "/tmp/wf2.yaml",
          workspace: "/tmp/ws2",
          startedAt: 3000,
          status: "running",
          userPrompt: "do more",
        },
      ],
    })
    await createChat(projectDir, chat)

    const summaries = await listProjectChats(projectDir)
    expect(summaries).toHaveLength(1)
    expect(summaries[0].runCount).toBe(2)
    expect(summaries[0].latestRunStatus).toBe("running")
  })
})
