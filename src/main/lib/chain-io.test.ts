import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadChain, saveChain, listChainFiles } from "./chain-io"
import type { Workflow } from "@shared/types"

const FIXTURE: Workflow = {
  version: 1,
  name: "Test Workflow",
  description: "A test",
  defaults: { model: "sonnet", maxTurns: 60 },
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
    {
      id: "skill-1",
      type: "skill",
      position: { x: 300, y: 0 },
      config: { skillRef: "test/writer", prompt: "Write content" },
    },
    { id: "output-1", type: "output", position: { x: 600, y: 0 }, config: {} },
  ],
  edges: [
    { id: "e1", source: "input-1", target: "skill-1", type: "default" },
    { id: "e2", source: "skill-1", target: "output-1", type: "default" },
  ],
}

describe("chain-io", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "chain-io-test-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("saveChain writes valid JSON with .chain extension", async () => {
    const filePath = join(dir, "test.chain")
    await saveChain(filePath, FIXTURE)

    const raw = await readFile(filePath, "utf-8")
    const parsed = JSON.parse(raw)
    expect(parsed.version).toBe(1)
    expect(parsed.name).toBe("Test Workflow")
    expect(parsed.nodes).toHaveLength(3)
    expect(parsed.edges).toHaveLength(2)
  })

  it("loadChain reads and parses .chain file", async () => {
    const filePath = join(dir, "test.chain")
    await writeFile(filePath, JSON.stringify(FIXTURE), "utf-8")

    const workflow = await loadChain(filePath)
    expect(workflow.name).toBe("Test Workflow")
    expect(workflow.nodes).toHaveLength(3)
    expect(workflow.edges).toHaveLength(2)
  })

  it("roundtrip preserves all data", async () => {
    const filePath = join(dir, "roundtrip.chain")
    await saveChain(filePath, FIXTURE)
    const loaded = await loadChain(filePath)
    expect(loaded).toEqual(FIXTURE)
  })

  it("listChainFiles finds .chain files in directory", async () => {
    await writeFile(
      join(dir, "a.chain"),
      JSON.stringify({ ...FIXTURE, name: "Workflow A" }),
      "utf-8",
    )
    await writeFile(
      join(dir, "b.chain"),
      JSON.stringify({ ...FIXTURE, name: "Workflow B" }),
      "utf-8",
    )
    await writeFile(join(dir, "c.json"), "{}", "utf-8")

    const files = await listChainFiles(dir)
    expect(files).toHaveLength(2)
    expect(files.map((f) => f.name).sort()).toEqual([
      "Workflow A",
      "Workflow B",
    ])
  })

  it("listChainFiles returns empty for nonexistent directory", async () => {
    const files = await listChainFiles(join(dir, "nope"))
    expect(files).toEqual([])
  })
})
