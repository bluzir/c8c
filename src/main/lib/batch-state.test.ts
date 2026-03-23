import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PersistedBatchState } from "./batch-state"

const logInfoMock = vi.fn()
const logWarnMock = vi.fn()
const testState = vi.hoisted(() => ({
  homeDir: "",
  projectRoots: [] as string[],
}))

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os")
  return {
    ...actual,
    homedir: () => testState.homeDir,
  }
})

vi.mock("./security-paths", () => ({
  allowedProjectRoots: vi.fn(async () => testState.projectRoots),
}))

vi.mock("./structured-log", () => ({
  logInfo: (...args: unknown[]) => logInfoMock(...args),
  logWarn: (...args: unknown[]) => logWarnMock(...args),
}))

import {
  ensureBatchWorkspace,
  logBatchPersistenceFailure,
  persistBatchState,
  readBatchState,
  recoverBatchStates,
} from "./batch-state"

function createBatchState(
  overrides: Partial<PersistedBatchState> = {},
): PersistedBatchState {
  return {
    batchId: "batch-1",
    workflowName: "Batch test",
    total: 3,
    completed: 0,
    running: 1,
    concurrency: 2,
    stopOnFailure: false,
    startedAt: 100,
    updatedAt: 100,
    status: "running",
    items: [],
    ...overrides,
  }
}

describe("batch-state", () => {
  let homeDir: string
  let projectDir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    homeDir = await mkdtemp(join(tmpdir(), "batch-state-home-"))
    projectDir = await mkdtemp(join(tmpdir(), "batch-state-project-"))
    testState.homeDir = homeDir
    testState.projectRoots = [projectDir]
  })

  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true })
    await rm(projectDir, { recursive: true, force: true })
  })

  it("persists and reads batch state from the workspace", async () => {
    const workspace = await ensureBatchWorkspace("batch-1", projectDir)
    const state = createBatchState({
      projectPath: projectDir,
      workflowPath: "/tmp/workflow.yaml",
    })

    await persistBatchState(workspace, state)
    await expect(readBatchState(workspace)).resolves.toEqual(state)
  })

  it("recovers running batch states across global and project roots", async () => {
    const globalWorkspace = await ensureBatchWorkspace("global-batch")
    const projectWorkspace = await ensureBatchWorkspace(
      "project-batch",
      projectDir,
    )

    await persistBatchState(
      globalWorkspace,
      createBatchState({
        batchId: "global-batch",
        status: "running",
        running: 2,
      }),
    )
    await persistBatchState(
      projectWorkspace,
      createBatchState({
        batchId: "project-batch",
        projectPath: projectDir,
        status: "running",
        running: 1,
      }),
    )

    const summary = await recoverBatchStates()

    expect(summary).toEqual({
      roots: 2,
      workspaces: 2,
      interrupted: 2,
    })

    await expect(readBatchState(globalWorkspace)).resolves.toMatchObject({
      status: "interrupted",
      running: 0,
    })
    await expect(readBatchState(projectWorkspace)).resolves.toMatchObject({
      status: "interrupted",
      running: 0,
    })
    expect(logInfoMock).toHaveBeenCalledWith(
      "batch-recovery",
      "batch_recovery_summary",
      {
        roots: 2,
        workspaces: 2,
        interrupted: 2,
      },
    )
  })

  it("ignores corrupt state files and missing roots during recovery", async () => {
    const globalRoot = join(homeDir, ".c8c", "batches")
    const corruptWorkspace = join(globalRoot, "corrupt-batch")
    await mkdir(corruptWorkspace, { recursive: true })
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(
        join(corruptWorkspace, "batch-state.json"),
        "{not-json",
        "utf8",
      ),
    )

    testState.projectRoots = [
      projectDir,
      join(projectDir, "missing-project-root"),
    ]

    const summary = await recoverBatchStates()

    expect(summary).toEqual({
      roots: 3,
      workspaces: 1,
      interrupted: 0,
    })
  })

  it("logs persistence failures with a normalized message", () => {
    logBatchPersistenceFailure("batch-1", new Error("disk full"))

    expect(logWarnMock).toHaveBeenCalledWith(
      "batch-state",
      "persist_batch_state_failed",
      {
        batchId: "batch-1",
        error: "disk full",
      },
    )
  })
})
