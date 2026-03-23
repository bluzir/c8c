import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { DiscoveredSkill } from "../schema"
import {
  buildSkillPathHint,
  createSkillContextResolver,
} from "./run-skill-context"

describe("run-skill-context", () => {
  it("includes gstack sibling hints for gstack-pack skill paths", () => {
    const hint = buildSkillPathHint("/tmp/gstack/ship-it/SKILL.md")

    expect(hint).toContain("Sibling gstack skill pack directory: /tmp/gstack")
    expect(hint).toContain('Resolve "qa/..." references')
  })

  it("loads context from explicit paths and scanned refs", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "run-skill-context-"))
    const explicitSkill = join(workspace, "skills", "local", "SKILL.md")
    const scannedSkill = join(workspace, "skills", "project", "SKILL.md")
    await mkdir(join(workspace, "skills", "local"), { recursive: true })
    await mkdir(join(workspace, "skills", "project"), { recursive: true })
    await writeFile(
      explicitSkill,
      "---\ntitle: ignore\n---\nUse local checklist.",
    )
    await writeFile(scannedSkill, "Use project checklist.")

    const discovered: DiscoveredSkill[] = [
      {
        type: "skill",
        name: "project",
        description: "Project skill",
        category: "audit",
        path: scannedSkill,
        sourceScope: "project",
      },
    ]

    const resolveSkillContext = createSkillContextResolver(
      { warn: () => {} },
      workspace,
      workspace,
      async () => discovered,
    )

    const context = await resolveSkillContext({
      skillPaths: [explicitSkill],
      skillRefs: ["audit/project"],
    })

    expect(context.skillPaths).toEqual([explicitSkill, scannedSkill])
    expect(context.text).toContain("Use local checklist.")
    expect(context.text).toContain("Use project checklist.")
  })
})
