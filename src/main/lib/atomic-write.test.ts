import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, readFile, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { writeFileAtomic } from "./atomic-write"

describe("atomic-write", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "atomic-write-test-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("writes content atomically", async () => {
    const filePath = join(dir, "state.json")
    await writeFileAtomic(filePath, '{"ok":true}\n')

    const stored = await readFile(filePath, "utf-8")
    expect(stored).toBe('{"ok":true}\n')
  })

  it("overwrites existing files and cleans up temp files", async () => {
    const filePath = join(dir, "config.json")
    await writeFile(filePath, '{"version":1}\n', "utf-8")

    await writeFileAtomic(filePath, '{"version":2}\n')
    const stored = await readFile(filePath, "utf-8")
    expect(stored).toBe('{"version":2}\n')

    const entries = await readdir(dir)
    const tempEntries = entries.filter((name) => name.includes(".tmp"))
    expect(tempEntries).toEqual([])
  })
})
