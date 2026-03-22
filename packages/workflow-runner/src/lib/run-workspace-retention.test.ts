import { mkdir, mkdtemp, rm, utimes } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { cleanupRunWorkspaces } from "./run-workspace-retention"

describe("run-workspace-retention", () => {
  let runsDir = ""

  afterEach(async () => {
    if (runsDir) {
      await rm(runsDir, { recursive: true, force: true })
      runsDir = ""
    }
  })

  it("removes oldest workspaces beyond the configured count", async () => {
    runsDir = await mkdtemp(join(tmpdir(), "run-workspace-retention-"))
    const first = join(runsDir, "run-a")
    const second = join(runsDir, "run-b")
    const third = join(runsDir, "run-c")
    await Promise.all([mkdir(first), mkdir(second), mkdir(third)])

    await utimes(first, new Date("2025-01-01T00:00:00Z"), new Date("2025-01-01T00:00:00Z"))
    await utimes(second, new Date("2025-01-02T00:00:00Z"), new Date("2025-01-02T00:00:00Z"))
    await utimes(third, new Date("2025-01-03T00:00:00Z"), new Date("2025-01-03T00:00:00Z"))

    const removed = await cleanupRunWorkspaces(runsDir, {
      maxWorkspaces: 2,
      maxAgeMs: Number.MAX_SAFE_INTEGER,
    })

    expect(removed).toBe(1)
  })

  it("removes workspaces older than the configured age", async () => {
    runsDir = await mkdtemp(join(tmpdir(), "run-workspace-retention-"))
    const oldRun = join(runsDir, "run-old")
    const freshRun = join(runsDir, "run-fresh")
    await Promise.all([mkdir(oldRun), mkdir(freshRun)])

    await utimes(oldRun, new Date("2025-01-01T00:00:00Z"), new Date("2025-01-01T00:00:00Z"))
    await utimes(freshRun, new Date("2025-01-10T00:00:00Z"), new Date("2025-01-10T00:00:00Z"))

    const removed = await cleanupRunWorkspaces(runsDir, {
      maxWorkspaces: 10,
      maxAgeMs: 3 * 24 * 60 * 60 * 1000,
    }, new Date("2025-01-12T00:00:00Z").getTime())

    expect(removed).toBe(1)
  })
})
