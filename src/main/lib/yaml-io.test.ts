import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { loadChainYaml } from "./yaml-io"

describe("yaml-io", () => {
  let workspace: string

  afterEach(async () => {
    if (workspace) {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("loads valid workflow YAML objects", async () => {
    workspace = await mkdtemp(join(tmpdir(), "yaml-io-test-"))
    const filePath = join(workspace, "workflow.yaml")
    await writeFile(
      filePath,
      ["name: Test workflow", "version: 1", "nodes: []", "edges: []"].join(
        "\n",
      ),
      "utf-8",
    )

    await expect(loadChainYaml(filePath)).resolves.toEqual(
      expect.objectContaining({
        name: "Test workflow",
        nodes: [],
        edges: [],
      }),
    )
  })

  it("rejects YAML that does not parse into a workflow object", async () => {
    workspace = await mkdtemp(join(tmpdir(), "yaml-io-test-"))
    const filePath = join(workspace, "invalid.yaml")
    await writeFile(filePath, "[]", "utf-8")

    await expect(loadChainYaml(filePath)).rejects.toThrow(
      "Invalid workflow YAML",
    )
  })

  it("rejects legacy step-based YAML workflows", async () => {
    workspace = await mkdtemp(join(tmpdir(), "yaml-io-test-"))
    const filePath = join(workspace, "legacy.yaml")
    await writeFile(
      filePath,
      [
        "description: Legacy workflow",
        "steps:",
        "  - key: draft",
        "    agent: writer",
        "    prompt: Write",
      ].join("\n"),
      "utf-8",
    )

    await expect(loadChainYaml(filePath)).rejects.toThrow(
      "Invalid workflow YAML",
    )
  })

  it("rejects malformed graph nodes at the parse boundary", async () => {
    workspace = await mkdtemp(join(tmpdir(), "yaml-io-test-"))
    const filePath = join(workspace, "bad-node.yaml")
    await writeFile(
      filePath,
      [
        "name: Bad workflow",
        "version: 1",
        "nodes:",
        "  - id: input-1",
        "    type: input",
        "    position:",
        "      x: nope",
        "      y: 0",
        "    config: {}",
        "edges: []",
      ].join("\n"),
      "utf-8",
    )

    await expect(loadChainYaml(filePath)).rejects.toThrow(
      "Invalid workflow YAML at nodes[0].position.x",
    )
  })
})
