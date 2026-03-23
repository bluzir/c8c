import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  finalizeRunPidManifest,
  initRunPidManifest,
  loadRunPidManifest,
  recordRunPidExit,
  recordRunPidStart,
} from "./run-pid-manifest"

describe("run-pid-manifest", () => {
  let workspace: string

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), "run-pid-manifest-test-"))
  })

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true })
  })

  it("tracks start and exit of subprocesses", async () => {
    await initRunPidManifest(workspace, "run-1", "run")
    await recordRunPidStart(
      workspace,
      "run-1",
      "run",
      12345,
      "skill",
      "skill-1",
    )

    let manifest = await loadRunPidManifest(workspace)
    expect(manifest?.runId).toBe("run-1")
    expect(manifest?.status).toBe("running")
    expect(manifest?.processes).toHaveLength(1)
    expect(manifest?.processes[0]?.active).toBe(true)
    expect(manifest?.processes[0]?.nodeId).toBe("skill-1")

    await recordRunPidExit(workspace, "run-1", "run", 12345, {
      exitCode: 0,
      signal: null,
    })
    await finalizeRunPidManifest(workspace, "run-1", "run", "completed")

    manifest = await loadRunPidManifest(workspace)
    expect(manifest?.status).toBe("completed")
    expect(manifest?.processes[0]?.active).toBe(false)
    expect(manifest?.processes[0]?.exitCode).toBe(0)
  })
})
