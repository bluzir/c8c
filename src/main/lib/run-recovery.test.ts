import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { RunPidManifest } from "./run-pid-manifest"

const logInfoMock = vi.fn()
const logWarnMock = vi.fn()

vi.mock("./structured-log", () => ({
  logInfo: (...args: unknown[]) => logInfoMock(...args),
  logWarn: (...args: unknown[]) => logWarnMock(...args),
}))

import {
  __setRunRecoveryTestBindings,
  recoverRuntimeState,
} from "./run-recovery"
import { loadRunPidManifest, runPidManifestPath } from "./run-pid-manifest"

type PidSignal = NodeJS.Signals | 0 | undefined

interface FakeProcessState {
  alive: boolean
  command?: string
  termOutcome?: "kill" | "stay" | "eperm"
  killOutcome?: "kill" | "stay" | "eperm"
  psError?: string
}

function createError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string }
  error.code = code
  return error
}

function createPidHarness(processes: Record<number, FakeProcessState>) {
  const calls: Array<{ pid: number; signal: PidSignal }> = []

  return {
    calls,
    bindings: {
      now: () => 1_700_000_000_000,
      sleep: async () => undefined,
      execFile: async (_file: string, args: string[]) => {
        const pid = Number(args[1])
        const state = processes[pid]
        if (state?.psError) {
          throw createError(state.psError)
        }
        return {
          stdout: state?.command || "",
          stderr: "",
        }
      },
      kill: (pid: number, signal?: PidSignal) => {
        calls.push({ pid, signal })
        const state = processes[pid]

        if (signal === 0) {
          if (!state?.alive) {
            throw createError("ESRCH")
          }
          return
        }

        if (!state?.alive) {
          throw createError("ESRCH")
        }

        if (signal === "SIGTERM") {
          if (state.termOutcome === "eperm") {
            throw createError("EPERM")
          }
          if (state.termOutcome === "kill") {
            state.alive = false
          }
          return
        }

        if (signal === "SIGKILL") {
          if (state.killOutcome === "eperm") {
            throw createError("EPERM")
          }
          if (state.killOutcome !== "stay") {
            state.alive = false
          }
        }
      },
    },
  }
}

function createManifest(workspace: string, pid: number): RunPidManifest {
  return {
    version: 1,
    runId: "run-1",
    mode: "run",
    workspace,
    status: "running",
    updatedAt: 1,
    processes: [
      {
        pid,
        role: "skill",
        nodeId: "skill-1",
        startedAt: 10,
        active: true,
      },
    ],
  }
}

async function writeManifest(workspace: string, pid: number): Promise<void> {
  await writeFile(
    runPidManifestPath(workspace),
    JSON.stringify(createManifest(workspace, pid), null, 2),
    "utf8",
  )
}

describe("run-recovery", () => {
  let rootA: string
  let rootB: string
  let workspaceA: string
  let workspaceB: string

  beforeEach(async () => {
    vi.clearAllMocks()
    rootA = await mkdtemp(join(tmpdir(), "run-recovery-root-a-"))
    rootB = await mkdtemp(join(tmpdir(), "run-recovery-root-b-"))
    workspaceA = join(rootA, "run-a")
    workspaceB = join(rootB, "run-b")
    await mkdir(workspaceA, { recursive: true })
    await mkdir(workspaceB, { recursive: true })
  })

  afterEach(async () => {
    __setRunRecoveryTestBindings(null)
    await rm(rootA, { recursive: true, force: true })
    await rm(rootB, { recursive: true, force: true })
  })

  it("marks stale running run-result as interrupted and clears missing active PIDs", async () => {
    await writeFile(
      join(workspaceA, "run-result.json"),
      JSON.stringify(
        {
          runId: "run-a",
          status: "running",
          workflowName: "Test",
          startedAt: 123,
          completedAt: 0,
          workspace: workspaceA,
        },
        null,
        2,
      ),
      "utf8",
    )
    await writeManifest(workspaceA, 99_999_999)
    __setRunRecoveryTestBindings({
      now: () => 1_700_000_000_000,
      sleep: async () => undefined,
      kill: () => {
        throw createError("ESRCH")
      },
      execFile: async () => ({ stdout: "", stderr: "" }),
    })

    const summary = await recoverRuntimeState([rootA])

    expect(summary.staleRunsUpdated).toBe(1)
    expect(summary.manifestsProcessed).toBe(1)
    expect(summary.orphanPidsMissing).toBe(1)

    const runResultRaw = await readFile(
      join(workspaceA, "run-result.json"),
      "utf8",
    )
    const runResult = JSON.parse(runResultRaw) as {
      status: string
      completedAt: number
    }
    expect(runResult.status).toBe("interrupted")
    expect(runResult.completedAt).toBe(1_700_000_000_000)

    const manifest = await loadRunPidManifest(workspaceA)
    expect(manifest?.status).toBe("interrupted")
    expect(manifest?.processes[0]?.active).toBe(false)
    expect(manifest?.processes[0]?.signal).toBe("not_found")
    expect(manifest?.processes[0]?.exitedAt).toBe(1_700_000_000_000)
  })

  it("terminates active Claude orphan processes with SIGTERM when they exit cleanly", async () => {
    await writeManifest(workspaceA, 101)
    const harness = createPidHarness({
      101: {
        alive: true,
        command: "/usr/local/bin/claude --print",
        termOutcome: "kill",
      },
    })
    __setRunRecoveryTestBindings(harness.bindings)

    const summary = await recoverRuntimeState([rootA])

    expect(summary.orphanPidsKilled).toBe(1)
    expect(summary.orphanPidsFailed).toBe(0)
    expect(harness.calls).toContainEqual({ pid: 101, signal: "SIGTERM" })
    expect(harness.calls).not.toContainEqual({ pid: 101, signal: "SIGKILL" })

    const manifest = await loadRunPidManifest(workspaceA)
    expect(manifest?.processes[0]?.active).toBe(false)
    expect(manifest?.processes[0]?.signal).toBe("killed_by_recovery")
    expect(manifest?.processes[0]?.terminatedByRecovery).toBe(true)
    expect(manifest?.processes[0]?.exitedAt).toBe(1_700_000_000_000)
  })

  it("falls back to SIGKILL when SIGTERM does not stop the orphan process", async () => {
    await writeManifest(workspaceA, 202)
    const harness = createPidHarness({
      202: {
        alive: true,
        command: "claude --json",
        termOutcome: "stay",
        killOutcome: "kill",
      },
    })
    __setRunRecoveryTestBindings(harness.bindings)

    const summary = await recoverRuntimeState([rootA])

    expect(summary.orphanPidsKilled).toBe(1)
    expect(harness.calls).toContainEqual({ pid: 202, signal: "SIGTERM" })
    expect(harness.calls).toContainEqual({ pid: 202, signal: "SIGKILL" })
  })

  it("counts EPERM as a failed orphan termination and leaves the process active", async () => {
    await writeManifest(workspaceA, 303)
    const harness = createPidHarness({
      303: {
        alive: true,
        command: "claude --print",
        termOutcome: "eperm",
      },
    })
    __setRunRecoveryTestBindings(harness.bindings)

    const summary = await recoverRuntimeState([rootA])

    expect(summary.orphanPidsKilled).toBe(0)
    expect(summary.orphanPidsFailed).toBe(1)

    const manifest = await loadRunPidManifest(workspaceA)
    expect(manifest?.status).toBe("interrupted")
    expect(manifest?.processes[0]?.active).toBe(true)
    expect(manifest?.processes[0]?.signal).toBeUndefined()
  })

  it("skips active non-Claude processes instead of killing them", async () => {
    await writeManifest(workspaceA, 404)
    const harness = createPidHarness({
      404: {
        alive: true,
        command: "/usr/bin/python worker.py",
        termOutcome: "kill",
      },
    })
    __setRunRecoveryTestBindings(harness.bindings)

    const summary = await recoverRuntimeState([rootA])

    expect(summary.orphanPidsKilled).toBe(0)
    expect(summary.orphanPidsFailed).toBe(1)
    expect(harness.calls).not.toContainEqual({ pid: 404, signal: "SIGTERM" })
    expect(logWarnMock).toHaveBeenCalledWith(
      "run-recovery",
      "skip_non_claude_pid",
      {
        workspace: workspaceA,
        pid: 404,
      },
    )
  })

  it("aggregates recovery stats across multiple roots and workspaces", async () => {
    await writeFile(
      join(workspaceA, "run-result.json"),
      JSON.stringify(
        {
          runId: "run-a",
          status: "running",
          completedAt: 0,
        },
        null,
        2,
      ),
      "utf8",
    )
    await writeManifest(workspaceB, 505)
    const harness = createPidHarness({
      505: {
        alive: false,
      },
    })
    __setRunRecoveryTestBindings(harness.bindings)

    const summary = await recoverRuntimeState([rootA, rootB])

    expect(summary).toMatchObject({
      roots: 2,
      workspaces: 2,
      staleRunsUpdated: 1,
      manifestsProcessed: 1,
      orphanPidsMissing: 1,
      orphanPidsKilled: 0,
      orphanPidsFailed: 0,
    })
    expect(logInfoMock).toHaveBeenCalledWith(
      "run-recovery",
      "startup_recovery_summary",
      {
        roots: 2,
        workspaces: 2,
        staleRunsUpdated: 1,
        manifestsProcessed: 1,
        orphanPidsKilled: 0,
        orphanPidsMissing: 1,
        orphanPidsFailed: 0,
      },
    )
  })
})
