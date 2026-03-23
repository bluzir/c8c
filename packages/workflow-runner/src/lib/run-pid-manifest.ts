import type { AgentExecutionSummary } from "@shared/types"
import type { RunStatus } from "@shared/types"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { writeFileAtomic } from "./atomic-write"
import { logWarn } from "./structured-log"

const RUN_PID_MANIFEST_VERSION = 1
const RUN_PID_MANIFEST_FILE = "run-pids.json"

export type RunPidManifestMode = "run" | "rerun"

export interface RunPidProcessEntry {
  pid: number
  role: string
  nodeId?: string
  startedAt: number
  exitedAt?: number
  exitCode?: number | null
  signal?: string | null
  active: boolean
  terminatedByRecovery?: boolean
}

export interface RunPidManifest {
  version: number
  runId: string
  mode: RunPidManifestMode
  workspace: string
  status: RunStatus | "running"
  updatedAt: number
  processes: RunPidProcessEntry[]
}

const manifestQueues = new Map<string, Promise<void>>()

function createManifest(
  workspace: string,
  runId: string,
  mode: RunPidManifestMode,
): RunPidManifest {
  return {
    version: RUN_PID_MANIFEST_VERSION,
    runId,
    mode,
    workspace,
    status: "running",
    updatedAt: Date.now(),
    processes: [],
  }
}

function isValidManifest(value: unknown): value is RunPidManifest {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<RunPidManifest>
  return (
    typeof candidate.runId === "string" &&
    typeof candidate.mode === "string" &&
    Array.isArray(candidate.processes)
  )
}

export function runPidManifestPath(workspace: string): string {
  return join(workspace, RUN_PID_MANIFEST_FILE)
}

export async function loadRunPidManifest(
  workspace: string,
): Promise<RunPidManifest | null> {
  try {
    const raw = await readFile(runPidManifestPath(workspace), "utf-8")
    const parsed = JSON.parse(raw) as unknown
    if (!isValidManifest(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

async function withManifestLock<T>(
  workspace: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = manifestQueues.get(workspace) || Promise.resolve()
  const next = previous.then(operation)
  manifestQueues.set(
    workspace,
    next.then(
      () => undefined,
      () => undefined,
    ),
  )
  return next
}

async function mutateManifest(
  workspace: string,
  runId: string,
  mode: RunPidManifestMode,
  mutate: (manifest: RunPidManifest) => void,
): Promise<void> {
  await withManifestLock(workspace, async () => {
    const existing = await loadRunPidManifest(workspace)
    const manifest = existing || createManifest(workspace, runId, mode)
    mutate(manifest)
    manifest.updatedAt = Date.now()
    await writeFileAtomic(
      runPidManifestPath(workspace),
      JSON.stringify(manifest, null, 2),
    )
  }).catch((error) => {
    logWarn("run-pid-manifest", "mutate_failed", {
      workspace,
      runId,
      error: String(error),
    })
  })
}

export async function initRunPidManifest(
  workspace: string,
  runId: string,
  mode: RunPidManifestMode,
): Promise<void> {
  await withManifestLock(workspace, async () => {
    const manifest = createManifest(workspace, runId, mode)
    await writeFileAtomic(
      runPidManifestPath(workspace),
      JSON.stringify(manifest, null, 2),
    )
  }).catch((error) => {
    logWarn("run-pid-manifest", "init_failed", {
      workspace,
      runId,
      error: String(error),
    })
  })
}

export async function recordRunPidStart(
  workspace: string,
  runId: string,
  mode: RunPidManifestMode,
  pid: number,
  role: string,
  nodeId?: string,
): Promise<void> {
  if (!Number.isFinite(pid) || pid <= 0) return
  await mutateManifest(workspace, runId, mode, (manifest) => {
    manifest.runId = runId
    manifest.mode = mode
    manifest.status = "running"
    const existing = manifest.processes.find(
      (entry) => entry.pid === pid && entry.active,
    )
    if (existing) {
      existing.role = role
      existing.nodeId = nodeId
      existing.startedAt = Date.now()
      return
    }
    manifest.processes.push({
      pid,
      role,
      nodeId,
      startedAt: Date.now(),
      active: true,
    })
  })
}

export async function recordRunPidExit(
  workspace: string,
  runId: string,
  mode: RunPidManifestMode,
  pid: number,
  result: Pick<AgentExecutionSummary, "exitCode" | "signal">,
): Promise<void> {
  if (!Number.isFinite(pid) || pid <= 0) return
  await mutateManifest(workspace, runId, mode, (manifest) => {
    const activeMatch = manifest.processes.find(
      (entry) => entry.pid === pid && entry.active,
    )
    const fallbackMatch = manifest.processes.find((entry) => entry.pid === pid)
    const target = activeMatch || fallbackMatch
    if (!target) {
      manifest.processes.push({
        pid,
        role: "unknown",
        startedAt: Date.now(),
        exitedAt: Date.now(),
        exitCode: result.exitCode,
        signal: result.signal,
        active: false,
      })
      return
    }
    target.active = false
    target.exitedAt = Date.now()
    target.exitCode = result.exitCode
    target.signal = result.signal
  })
}

export async function finalizeRunPidManifest(
  workspace: string,
  runId: string,
  mode: RunPidManifestMode,
  status: RunStatus,
): Promise<void> {
  await mutateManifest(workspace, runId, mode, (manifest) => {
    manifest.runId = runId
    manifest.mode = mode
    manifest.status = status
    for (const entry of manifest.processes) {
      if (!entry.active) continue
      entry.active = false
      entry.exitedAt = entry.exitedAt || Date.now()
      entry.signal = entry.signal || "unknown"
    }
  })
}
