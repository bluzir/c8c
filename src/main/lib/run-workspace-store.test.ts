import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  RUN_WORKSPACE_RETENTION_MAX_AGE_MS,
  RUN_WORKSPACE_RETENTION_MAX_RUNS,
  RUN_WORKSPACE_RETENTION_MIN_RUNS,
  cleanupProjectRunWorkspaces,
  deleteRunWorkspace,
  listProjectRunResults,
} from "./run-workspace-store"

async function createRunWorkspace(
  root: string,
  runId: string,
  overrides: Partial<{
    status: string
    workflowName: string
    startedAt: number
    completedAt: number
    includeReport: boolean
  }> = {},
) {
  const workspace = join(root, runId)
  await mkdir(workspace, { recursive: true })
  await writeFile(
    join(workspace, "run-result.json"),
    JSON.stringify(
      {
        runId,
        status: overrides.status || "completed",
        workflowName: overrides.workflowName || "Retention test",
        startedAt: overrides.startedAt || 100,
        completedAt: overrides.completedAt || 200,
        workspace,
        reportPath: join(workspace, "report.md"),
      },
      null,
      2,
    ),
    "utf8",
  )
  if (overrides.includeReport !== false) {
    await writeFile(join(workspace, "report.md"), `report for ${runId}`, "utf8")
  }
  return workspace
}

describe("run-workspace-store", () => {
  let projectDir: string
  let runsRoot: string

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "run-store-project-"))
    runsRoot = join(projectDir, ".c8c", "runs")
    await mkdir(runsRoot, { recursive: true })
  })

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  it("lists validated project runs and marks stale running results as interrupted", async () => {
    await createRunWorkspace(runsRoot, "run-1", {
      status: "running",
      includeReport: false,
      startedAt: 1_000,
      completedAt: 0,
    })

    const runs = await listProjectRunResults(projectDir)

    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      runId: "run-1",
      status: "interrupted",
      workspace: join(runsRoot, "run-1"),
      reportPath: join(runsRoot, "run-1", "report.md"),
    })
  })

  it("deletes a run workspace and reports reclaimed bytes", async () => {
    const workspace = await createRunWorkspace(runsRoot, "run-delete")

    const result = await deleteRunWorkspace(workspace)

    expect(result.deleted).toBe(true)
    expect(result.runId).toBe("run-delete")
    expect(result.reclaimedBytes).toBeGreaterThan(0)
    await expect(readdir(runsRoot)).resolves.toEqual([])
  })

  it("cleans up stale terminal runs while keeping the minimum recent history", async () => {
    const now = 1_800_000_000_000
    for (
      let index = 0;
      index < RUN_WORKSPACE_RETENTION_MIN_RUNS + 5;
      index += 1
    ) {
      await createRunWorkspace(runsRoot, `run-old-${index}`, {
        completedAt: now - RUN_WORKSPACE_RETENTION_MAX_AGE_MS - index - 1,
        startedAt: now - RUN_WORKSPACE_RETENTION_MAX_AGE_MS - index - 101,
      })
    }

    const result = await cleanupProjectRunWorkspaces(projectDir, now)

    expect(result.deletedRuns).toBe(5)
    expect(result.deletedRunIds).toHaveLength(5)
    expect(result.retainedRuns).toBe(RUN_WORKSPACE_RETENTION_MIN_RUNS)
  })

  it("caps retained terminal run workspaces by count", async () => {
    const now = 1_900_000_000_000
    for (
      let index = 0;
      index < RUN_WORKSPACE_RETENTION_MAX_RUNS + 5;
      index += 1
    ) {
      await createRunWorkspace(runsRoot, `run-cap-${index}`, {
        completedAt: now - index,
        startedAt: now - index - 10,
      })
    }

    const result = await cleanupProjectRunWorkspaces(projectDir, now)

    expect(result.deletedRuns).toBe(5)
    expect(result.retainedRuns).toBe(RUN_WORKSPACE_RETENTION_MAX_RUNS)
  })
})
