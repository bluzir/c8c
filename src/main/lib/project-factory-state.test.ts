import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { listProjectArtifacts, persistArtifactsFromRun } from "./artifact-store"
import {
  loadProjectFactoryState,
  spawnFactoryCasesFromArtifact,
} from "./project-factory-state"

describe("project-factory-state", () => {
  let projectDir: string
  let workspaceDir: string

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "project-factory-state-"))
    workspaceDir = join(projectDir, ".c8c", "runs", "run-1")
    await mkdir(workspaceDir, { recursive: true })
    await writeFile(
      join(workspaceDir, "run-result.json"),
      JSON.stringify(
        {
          runId: "run-1",
          status: "completed",
          workflowName: "Content Factory: Editorial Calendar",
          workflowPath: join(projectDir, ".c8c", "editorial-calendar.chain"),
          startedAt: 1,
          completedAt: 2,
          reportPath: join(workspaceDir, "report.md"),
          workspace: workspaceDir,
        },
        null,
        2,
      ),
    )
    await writeFile(
      join(workspaceDir, "report.md"),
      [
        "# Editorial Calendar",
        "",
        "| Date | Idea | Hook | Channel | Why |",
        "| --- | --- | --- | --- | --- |",
        "| 2026-04-01 | OpenAI agents week | AI agents are becoming workflows | Facebook | Strong opener for the month |",
        "| 2026-04-03 | Browser agents | The browser is the new runtime | Facebook | Build on the previous post |",
        "",
      ].join("\n"),
      "utf-8",
    )
  })

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  it("returns an empty state when no factory state exists yet", async () => {
    const state = await loadProjectFactoryState(projectDir)
    expect(state.plannedCases).toEqual([])
  })

  it("spawns planned item cases from an artifact and dedupes reruns", async () => {
    await persistArtifactsFromRun({
      projectPath: projectDir,
      workspace: workspaceDir,
      factoryId: "factory:content-engine",
      factoryLabel: "Content Engine",
      caseId: "case:content-engine:calendar",
      caseLabel: "Editorial calendar",
      templateId: "content-editorial-calendar",
      templateName: "Content Factory: Editorial Calendar",
      contracts: [{ kind: "editorial_calendar", title: "Editorial Calendar" }],
    })

    const artifacts = await listProjectArtifacts(projectDir)
    const artifact = artifacts[0]
    expect(artifact?.kind).toBe("editorial_calendar")

    const first = await spawnFactoryCasesFromArtifact({
      projectPath: projectDir,
      factoryId: "factory:content-engine",
      artifactId: artifact!.id,
      templateId: "content-draft-post",
    })

    expect(first.plannedCases).toHaveLength(2)
    expect(first.plannedCases[0]?.title).toBe("OpenAI agents week")
    expect(first.plannedCases[0]?.scheduledFor).toBe("2026-04-01")
    expect(first.plannedCases[0]?.templateId).toBe("content-draft-post")

    const second = await spawnFactoryCasesFromArtifact({
      projectPath: projectDir,
      factoryId: "factory:content-engine",
      artifactId: artifact!.id,
      templateId: "content-draft-post",
    })

    expect(second.plannedCases).toHaveLength(0)

    const state = await loadProjectFactoryState(projectDir)
    expect(state.plannedCases).toHaveLength(2)
  })
})
