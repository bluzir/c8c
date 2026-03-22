import { execFile as execFileCb } from "node:child_process"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { allowedReportRoots } from "./security-paths"
import { writeFileAtomic } from "./atomic-write"
import { loadRunPidManifest, runPidManifestPath, type RunPidManifest } from "./run-pid-manifest"
import { logInfo, logWarn } from "./structured-log"

const execFile = promisify(execFileCb)
const RUN_RESULT_FILE = "run-result.json"

interface RunRecoveryBindings {
  execFile: typeof execFile
  kill: (pid: number, signal?: NodeJS.Signals | 0) => void
  sleep: (ms: number) => Promise<void>
  now: () => number
}

let runRecoveryBindingsOverride: Partial<RunRecoveryBindings> | null = null

interface RunResultLike {
  status?: string
  completedAt?: number
}

export interface RuntimeRecoverySummary {
  roots: number
  workspaces: number
  staleRunsUpdated: number
  manifestsProcessed: number
  orphanPidsKilled: number
  orphanPidsMissing: number
  orphanPidsFailed: number
}

function isProcessMissingError(error: unknown): boolean {
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: string }).code)
    : ""
  return code === "ESRCH"
}

function isPermissionError(error: unknown): boolean {
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: string }).code)
    : ""
  return code === "EPERM"
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getRunRecoveryBindings(): RunRecoveryBindings {
  return {
    execFile,
    kill: (pid: number, signal?: NodeJS.Signals | 0) => {
      process.kill(pid, signal)
    },
    sleep,
    now: () => Date.now(),
    ...(runRecoveryBindingsOverride || {}),
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    getRunRecoveryBindings().kill(pid, 0)
    return true
  } catch (error) {
    if (isProcessMissingError(error)) return false
    return true
  }
}

async function listRunWorkspaces(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => join(root, entry.name))
  } catch {
    return []
  }
}

async function readRunResult(workspace: string): Promise<RunResultLike | null> {
  try {
    const raw = await readFile(join(workspace, RUN_RESULT_FILE), "utf-8")
    return JSON.parse(raw) as RunResultLike
  } catch {
    return null
  }
}

async function writeRunResult(workspace: string, payload: RunResultLike): Promise<void> {
  await writeFileAtomic(join(workspace, RUN_RESULT_FILE), JSON.stringify(payload, null, 2))
}

async function looksLikeClaudeProcess(pid: number): Promise<boolean> {
  if (process.platform === "win32") return true
  try {
    const { stdout } = await getRunRecoveryBindings().execFile(
      "ps",
      ["-p", String(pid), "-o", "command="],
      { encoding: "utf-8" },
    )
    const command = String(stdout || "").trim().toLowerCase()
    if (!command) return false
    return command.includes("claude")
  } catch (error) {
    logWarn("run-recovery", "inspect_pid_failed", { pid, error: String(error) })
    return false
  }
}

async function terminateOrphanPid(pid: number): Promise<boolean> {
  try {
    getRunRecoveryBindings().kill(pid, "SIGTERM")
  } catch (error) {
    if (isProcessMissingError(error)) return true
    if (isPermissionError(error)) return false
    return false
  }

  for (let i = 0; i < 6; i++) {
    await getRunRecoveryBindings().sleep(150)
    if (!isProcessAlive(pid)) return true
  }

  try {
    getRunRecoveryBindings().kill(pid, "SIGKILL")
  } catch (error) {
    if (isProcessMissingError(error)) return true
    return false
  }

  await getRunRecoveryBindings().sleep(150)
  return !isProcessAlive(pid)
}

async function recoverManifest(workspace: string, manifest: RunPidManifest): Promise<{
  changed: boolean
  killed: number
  missing: number
  failed: number
}> {
  let changed = false
  let killed = 0
  let missing = 0
  let failed = 0

  for (const processEntry of manifest.processes) {
    if (!processEntry.active) continue
    const pid = processEntry.pid
    if (!Number.isFinite(pid) || pid <= 0) {
      processEntry.active = false
      processEntry.exitedAt = processEntry.exitedAt || getRunRecoveryBindings().now()
      processEntry.signal = processEntry.signal || "invalid_pid"
      changed = true
      continue
    }

    if (!isProcessAlive(pid)) {
      processEntry.active = false
      processEntry.exitedAt = processEntry.exitedAt || getRunRecoveryBindings().now()
      processEntry.signal = processEntry.signal || "not_found"
      changed = true
      missing += 1
      continue
    }

    const isClaudeProcess = await looksLikeClaudeProcess(pid)
    if (!isClaudeProcess) {
      logWarn("run-recovery", "skip_non_claude_pid", { workspace, pid })
      failed += 1
      continue
    }

    const terminated = await terminateOrphanPid(pid)
    if (terminated) {
      processEntry.active = false
      processEntry.exitedAt = getRunRecoveryBindings().now()
      processEntry.signal = "killed_by_recovery"
      processEntry.terminatedByRecovery = true
      changed = true
      killed += 1
    } else {
      failed += 1
      logWarn("run-recovery", "kill_orphan_failed", { workspace, pid })
    }
  }

  if (manifest.status === "running") {
    manifest.status = "interrupted"
    changed = true
  }

  if (changed) {
    manifest.updatedAt = getRunRecoveryBindings().now()
    await writeFileAtomic(runPidManifestPath(workspace), JSON.stringify(manifest, null, 2))
  }

  return { changed, killed, missing, failed }
}

export async function recoverRuntimeState(roots?: string[]): Promise<RuntimeRecoverySummary> {
  const reportRoots = roots || await allowedReportRoots()
  const summary: RuntimeRecoverySummary = {
    roots: reportRoots.length,
    workspaces: 0,
    staleRunsUpdated: 0,
    manifestsProcessed: 0,
    orphanPidsKilled: 0,
    orphanPidsMissing: 0,
    orphanPidsFailed: 0,
  }

  for (const root of reportRoots) {
    const workspaces = await listRunWorkspaces(root)
    summary.workspaces += workspaces.length

    for (const workspace of workspaces) {
      const runResult = await readRunResult(workspace)
      if (runResult?.status === "running") {
        runResult.status = "interrupted"
        if (!runResult.completedAt || runResult.completedAt <= 0) {
          runResult.completedAt = getRunRecoveryBindings().now()
        }
        await writeRunResult(workspace, runResult)
        summary.staleRunsUpdated += 1
      }

      const manifest = await loadRunPidManifest(workspace)
      if (!manifest) continue
      summary.manifestsProcessed += 1
      try {
        const result = await recoverManifest(workspace, manifest)
        summary.orphanPidsKilled += result.killed
        summary.orphanPidsMissing += result.missing
        summary.orphanPidsFailed += result.failed
      } catch (error) {
        summary.orphanPidsFailed += 1
        logWarn("run-recovery", "manifest_recovery_failed", { workspace, error: String(error) })
      }
    }
  }

  logInfo("run-recovery", "startup_recovery_summary", { ...summary })
  return summary
}

export function __setRunRecoveryTestBindings(bindings: Partial<RunRecoveryBindings> | null): void {
  runRecoveryBindingsOverride = bindings
}
