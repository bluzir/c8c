import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  loadProjectFactoryBlueprint,
  projectFactoryBlueprintPath,
  saveProjectFactoryBlueprint,
} from "./project-factory-blueprint"

describe("project-factory-blueprint", () => {
  let projectDir: string

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "project-factory-blueprint-"))
  })

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  it("returns null when the project has no blueprint yet", async () => {
    await expect(loadProjectFactoryBlueprint(projectDir)).resolves.toBeNull()
  })

  it("persists and reloads a sanitized project blueprint", async () => {
    const saved = await saveProjectFactoryBlueprint({
      projectPath: projectDir,
      blueprint: {
        factories: [
          {
            modeId: "content",
            label: "  AI Trends Campaign  ",
            outcome: {
              title: "  AI Trends Campaign  ",
              statement:
                " Generate 100 strong Facebook posts about AI and agents over 30 days. ",
              successSignal: "Ready-to-publish calendar with approved copy",
              timeHorizon: "Next 30 days",
              targetCount: 100,
              targetUnit: "posts",
              constraints: ["Use company ToV", "  No AI slop  ", ""],
            },
            recipe: {
              summary:
                "Trend watch -> ideas -> calendar -> drafts -> QA -> distribution",
              packIds: ["content-factory-alpha", "content-factory-alpha"],
              stageOrder: ["Trend watch", "Ideas", "Calendar"],
              strategistCheckpoints: [
                "Approve themes",
                "Approve sample quality",
              ],
              caseGenerationRules: ["Editorial calendar -> post cases"],
            },
          },
        ],
        selectedFactoryId: "factory:ai-trends-campaign",
      },
    })

    expect(saved.projectPath).toBe(projectDir)
    expect(saved.factories).toHaveLength(1)
    expect(saved.factories[0]?.label).toBe("AI Trends Campaign")
    expect(saved.factories[0]?.modeId).toBe("content")
    expect(saved.factories[0]?.outcome?.constraints).toEqual([
      "Use company ToV",
      "No AI slop",
    ])
    expect(saved.factories[0]?.recipe?.packIds).toEqual([
      "content-factory-alpha",
    ])
    expect(saved.selectedFactoryId).toBe("factory:ai-trends-campaign")

    const reloaded = await loadProjectFactoryBlueprint(projectDir)
    expect(reloaded).not.toBeNull()
    expect(reloaded?.factories[0]?.recipe?.summary).toContain("Trend watch")
    expect(reloaded?.factories[0]?.recipe?.caseGenerationRules).toEqual([
      "Editorial calendar -> post cases",
    ])
    expect(projectFactoryBlueprintPath(projectDir)).toContain(
      ".c8c/factory.json",
    )
  })

  it("migrates a legacy single-factory blueprint into the plural model", async () => {
    const path = projectFactoryBlueprintPath(projectDir)
    await mkdir(join(projectDir, ".c8c"), { recursive: true })
    await writeFile(
      path,
      JSON.stringify(
        {
          version: 1,
          projectPath: projectDir,
          outcome: {
            title: "Legacy delivery factory",
          },
          recipe: {
            summary: "Map -> shape -> plan",
          },
          createdAt: 1,
          updatedAt: 2,
        },
        null,
        2,
      ),
    )

    const migrated = await loadProjectFactoryBlueprint(projectDir)
    expect(migrated?.version).toBe(2)
    expect(migrated?.factories).toHaveLength(1)
    expect(migrated?.factories[0]?.id).toBe("factory:default")
    expect(migrated?.factories[0]?.label).toBe("Legacy delivery factory")
    expect(migrated?.selectedFactoryId).toBe("factory:default")

    const stored = await readFile(path, "utf-8")
    expect(stored).toContain('"version": 1')
  })
})
