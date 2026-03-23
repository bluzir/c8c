import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { scaffoldMissingSkills } from "./skill-scaffold"
import type { Workflow, SkillNodeConfig } from "@shared/types"

function makeWorkflow(nodes: Workflow["nodes"]): Workflow {
  return {
    version: 1,
    name: "Test",
    nodes,
    edges: [],
  }
}

describe("scaffoldMissingSkills", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "scaffold-test-"))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("creates .md file for missing skill and sets skillPaths", async () => {
    const workflow = makeWorkflow([
      {
        id: "s1",
        type: "skill",
        position: { x: 0, y: 0 },
        config: {
          skillRef: "analysis/ux-reviewer",
          prompt: "Review the UX of the landing page",
        } as SkillNodeConfig,
      },
    ])

    const result = await scaffoldMissingSkills(workflow, [], tmpDir)

    const expectedPath = join(tmpDir, ".claude/skills/analysis/ux-reviewer.md")
    const content = await readFile(expectedPath, "utf-8")
    expect(content).toContain("name: ux-reviewer")
    expect(content).toContain("Review the UX of the landing page")

    const config = result.nodes[0].config as SkillNodeConfig
    expect(config.skillPaths).toContain(expectedPath)
  })

  it("skips skills that already exist on disk", async () => {
    const existingPath = join(tmpDir, ".claude/skills/analysis/ux-reviewer.md")
    await mkdir(join(tmpDir, ".claude/skills/analysis"), { recursive: true })
    await writeFile(
      existingPath,
      "---\nname: ux-reviewer\n---\nExisting content\n",
    )

    const workflow = makeWorkflow([
      {
        id: "s1",
        type: "skill",
        position: { x: 0, y: 0 },
        config: {
          skillRef: "analysis/ux-reviewer",
          prompt: "New prompt",
        } as SkillNodeConfig,
      },
    ])

    const result = await scaffoldMissingSkills(workflow, [], tmpDir)

    // File should not be overwritten
    const content = await readFile(existingPath, "utf-8")
    expect(content).toContain("Existing content")

    // skillPaths should still be set even though file wasn't recreated
    const config = result.nodes[0].config as SkillNodeConfig
    expect(config.skillPaths).toContain(existingPath)
  })

  it("skips skills that are in availableSkills", async () => {
    const workflow = makeWorkflow([
      {
        id: "s1",
        type: "skill",
        position: { x: 0, y: 0 },
        config: {
          skillRef: "analysis/ux-reviewer",
          prompt: "Review UX",
        } as SkillNodeConfig,
      },
    ])

    const result = await scaffoldMissingSkills(
      workflow,
      [{ name: "ux-reviewer", category: "analysis" }],
      tmpDir,
    )

    const config = result.nodes[0].config as SkillNodeConfig
    expect(config.skillPaths).toBeUndefined()
  })

  it("handles no-category refs with generated/ subfolder", async () => {
    const workflow = makeWorkflow([
      {
        id: "s1",
        type: "skill",
        position: { x: 0, y: 0 },
        config: {
          skillRef: "my-skill",
          prompt: "Do stuff",
        } as SkillNodeConfig,
      },
    ])

    const result = await scaffoldMissingSkills(workflow, [], tmpDir)

    const expectedPath = join(tmpDir, ".claude/skills/generated/my-skill.md")
    const content = await readFile(expectedPath, "utf-8")
    expect(content).toContain("name: my-skill")

    const config = result.nodes[0].config as SkillNodeConfig
    expect(config.skillPaths).toContain(expectedPath)
  })

  it("adds web allowedTools when scaffolded skill prompt targets external sites", async () => {
    const workflow = makeWorkflow([
      {
        id: "s1",
        type: "skill",
        position: { x: 0, y: 0 },
        config: {
          skillRef: "analysis/site-auditor",
          prompt: "Audit https://nhc.works and summarize key UX issues",
        } as SkillNodeConfig,
      },
    ])

    const result = await scaffoldMissingSkills(workflow, [], tmpDir)

    const expectedPath = join(tmpDir, ".claude/skills/analysis/site-auditor.md")
    const content = await readFile(expectedPath, "utf-8")
    expect(content).toContain("allowedTools:")
    expect(content).toContain("- WebFetch")
    expect(content).toContain("- WebSearch")

    const config = result.nodes[0].config as SkillNodeConfig
    expect(config.allowedTools).toEqual(
      expect.arrayContaining(["WebFetch", "WebSearch"]),
    )
  })

  it("merges inferred web tools with explicitly allowed tools", async () => {
    const workflow = makeWorkflow([
      {
        id: "s1",
        type: "skill",
        position: { x: 0, y: 0 },
        config: {
          skillRef: "analysis/market-scout",
          prompt: "Research the website examples on www.example.com",
          allowedTools: ["Read"],
        } as SkillNodeConfig,
      },
    ])

    const result = await scaffoldMissingSkills(workflow, [], tmpDir)

    const config = result.nodes[0].config as SkillNodeConfig
    expect(config.allowedTools).toEqual(
      expect.arrayContaining(["Read", "WebFetch", "WebSearch"]),
    )
  })

  it("does not infer blocked web tools", async () => {
    const workflow = makeWorkflow([
      {
        id: "s1",
        type: "skill",
        position: { x: 0, y: 0 },
        config: {
          skillRef: "analysis/strict-auditor",
          prompt: "Review website https://nhc.works with local notes",
          disallowedTools: ["WebFetch"],
        } as SkillNodeConfig,
      },
    ])

    const result = await scaffoldMissingSkills(workflow, [], tmpDir)

    const config = result.nodes[0].config as SkillNodeConfig
    expect(config.allowedTools).toEqual(expect.arrayContaining(["WebSearch"]))
    expect(config.allowedTools).not.toContain("WebFetch")
  })
})
