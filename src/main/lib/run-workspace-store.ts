import { readdir, readFile, rm, stat } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import type { RunResult, RunStatus } from "@shared/types"
import { errorMessage } from "./error-utils"
import { allowedReportRoots } from "./security-paths"
import { logInfo, logWarn } from "./structured-log"

const RUN_RESULT_FILE = "run-result.json"
const DEFAULT_REPORT_FILE = "report.md"
const RUN_WORKSPACE_RETENTION_STATUSES = new Set<RunStatus>([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
])
const RUN_STATUSES = new Set<RunStatus>([
  "running",
  "paused",
  "blocked",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
])

export const RUN_WORKSPACE_RETENTION_MIN_RUNS = 20
export const RUN_WORKSPACE_RETENTION_MAX_RUNS = 100
export const RUN_WORKSPACE_RETENTION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

interface RunWorkspaceRecord {
  run: RunResult
  workspace: string
  timestamp: number
}

export interface RunWorkspaceDeleteResult {
  runId: string
  deleted: boolean
  reclaimedBytes: number
}

export interface RunWorkspaceCleanupResult {
  deletedRuns: number
  reclaimedBytes: number
  retainedRuns: number
  deletedRunIds: string[]
}

export interface RunWorkspaceRetentionSummary {
  roots: number
  scannedRuns: number
  deletedRuns: number
  reclaimedBytes: number
  retainedRuns: number
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === "string" ? code : undefined
  }
  return undefined
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isStringRecord(
  value: unknown,
): value is Record<string, string | number | boolean | null | undefined> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function parseEvalScores(
  value: unknown,
): Record<string, number> | undefined | null {
  if (value === undefined) return undefined
  if (!isStringRecord(value)) return null
  const entries = Object.entries(value)
  if (entries.some(([, score]) => !isFiniteNumber(score))) {
    return null
  }
  return Object.fromEntries(entries) as Record<string, number>
}

function parseOptionalNumber(value: unknown): number | undefined | null {
  if (value === undefined) return undefined
  return isFiniteNumber(value) ? value : null
}

function normalizeRunTimestamp(
  run: Pick<RunResult, "startedAt" | "completedAt">,
) {
  return run.completedAt > 0 ? run.completedAt : run.startedAt
}

function parseRunResult(input: unknown, workspace: string): RunResult | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const parsed = input as Record<string, unknown>
  if (
    typeof parsed.runId !== "string" ||
    typeof parsed.workflowName !== "string" ||
    typeof parsed.status !== "string" ||
    !RUN_STATUSES.has(parsed.status as RunStatus) ||
    !isFiniteNumber(parsed.startedAt) ||
    !isFiniteNumber(parsed.completedAt)
  ) {
    return null
  }

  const evalScores = parseEvalScores(parsed.evalScores)
  const totalCost = parseOptionalNumber(parsed.totalCost)
  const totalTokensIn = parseOptionalNumber(parsed.totalTokensIn)
  const totalTokensOut = parseOptionalNumber(parsed.totalTokensOut)
  const durationMs = parseOptionalNumber(parsed.durationMs)
  if (
    evalScores === null ||
    totalCost === null ||
    totalTokensIn === null ||
    totalTokensOut === null ||
    durationMs === null
  ) {
    return null
  }

  return {
    runId: parsed.runId,
    status: parsed.status as RunStatus,
    workflowName: parsed.workflowName,
    workflowPath:
      typeof parsed.workflowPath === "string" ? parsed.workflowPath : undefined,
    startedAt: parsed.startedAt,
    completedAt: parsed.completedAt,
    reportPath:
      typeof parsed.reportPath === "string" && parsed.reportPath.trim()
        ? parsed.reportPath
        : join(workspace, DEFAULT_REPORT_FILE),
    workspace,
    totalCost,
    totalTokensIn,
    totalTokensOut,
    evalScores,
    durationMs,
  }
}

async function listRunWorkspaces(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name))
  } catch {
    return []
  }
}

async function measureWorkspaceBytes(workspace: string): Promise<number> {
  try {
    const entries = await readdir(workspace, { withFileTypes: true })
    let total = 0
    for (const entry of entries) {
      const candidatePath = join(workspace, entry.name)
      if (entry.isDirectory()) {
        total += await measureWorkspaceBytes(candidatePath)
        continue
      }
      if (!entry.isFile()) continue
      try {
        const info = await stat(candidatePath)
        total += info.size
      } catch {
        continue
      }
    }
    return total
  } catch {
    return 0
  }
}

function shouldRetainRun(
  index: number,
  timestamp: number,
  now: number,
): boolean {
  if (index < RUN_WORKSPACE_RETENTION_MIN_RUNS) return true
  if (index >= RUN_WORKSPACE_RETENTION_MAX_RUNS) return false
  return now - timestamp < RUN_WORKSPACE_RETENTION_MAX_AGE_MS
}

async function collectRunWorkspaceRecords(
  root: string,
): Promise<RunWorkspaceRecord[]> {
  const workspaces = await listRunWorkspaces(root)
  const records: RunWorkspaceRecord[] = []
  for (const workspace of workspaces) {
    const run = await readRunResultRecord(workspace)
    if (!run) continue
    records.push({
      run,
      workspace,
      timestamp: normalizeRunTimestamp(run),
    })
  }
  return records.sort((left, right) => right.timestamp - left.timestamp)
}

export async function readRunResultRecord(
  workspace: string,
): Promise<RunResult | null> {
  const safeWorkspace = resolve(workspace)
  try {
    const raw = await readFile(join(safeWorkspace, RUN_RESULT_FILE), "utf-8")
    const parsed = parseRunResult(JSON.parse(raw), safeWorkspace)
    if (!parsed) {
      logWarn("run-workspace-store", "invalid_run_result", {
        workspace: safeWorkspace,
      })
    }
    return parsed
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      logWarn("run-workspace-store", "read_run_result_failed", {
        workspace: safeWorkspace,
        error: errorMessage(error),
      })
    }
    return null
  }
}

export async function listProjectRunResults(
  projectPath: string,
): Promise<RunResult[]> {
  const runsRoot = join(resolve(projectPath), ".c8c", "runs")
  const records = await collectRunWorkspaceRecords(runsRoot)
  return records.map(({ run }) =>
    run.status === "running" ? { ...run, status: "interrupted" } : run,
  )
}

export async function deleteRunWorkspace(
  workspace: string,
): Promise<RunWorkspaceDeleteResult> {
  const safeWorkspace = resolve(workspace)
  const run = await readRunResultRecord(safeWorkspace)
  const runId = run?.runId || basename(safeWorkspace)

  try {
    const info = await stat(safeWorkspace)
    if (!info.isDirectory()) {
      return {
        runId,
        deleted: false,
        reclaimedBytes: 0,
      }
    }
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return {
        runId,
        deleted: false,
        reclaimedBytes: 0,
      }
    }
    throw error
  }

  const reclaimedBytes = await measureWorkspaceBytes(safeWorkspace)
  await rm(safeWorkspace, { recursive: true, force: true })

  return {
    runId,
    deleted: true,
    reclaimedBytes,
  }
}

export async function cleanupRunWorkspacesInRoot(
  root: string,
  now = Date.now(),
): Promise<RunWorkspaceCleanupResult> {
  const records = await collectRunWorkspaceRecords(root)
  const eligible = records.filter(({ run }) =>
    RUN_WORKSPACE_RETENTION_STATUSES.has(run.status),
  )

  const deletedRunIds: string[] = []
  let reclaimedBytes = 0

  for (const [index, record] of eligible.entries()) {
    if (shouldRetainRun(index, record.timestamp, now)) continue
    const result = await deleteRunWorkspace(record.workspace)
    if (!result.deleted) continue
    deletedRunIds.push(record.run.runId)
    reclaimedBytes += result.reclaimedBytes
  }

  return {
    deletedRuns: deletedRunIds.length,
    reclaimedBytes,
    retainedRuns: Math.max(0, records.length - deletedRunIds.length),
    deletedRunIds,
  }
}

export async function cleanupProjectRunWorkspaces(
  projectPath: string,
  now = Date.now(),
): Promise<RunWorkspaceCleanupResult> {
  return cleanupRunWorkspacesInRoot(
    join(resolve(projectPath), ".c8c", "runs"),
    now,
  )
}

export async function enforceRunWorkspaceRetention(
  roots?: string[],
  now = Date.now(),
): Promise<RunWorkspaceRetentionSummary> {
  const reportRoots = roots || (await allowedReportRoots())
  const summary: RunWorkspaceRetentionSummary = {
    roots: reportRoots.length,
    scannedRuns: 0,
    deletedRuns: 0,
    reclaimedBytes: 0,
    retainedRuns: 0,
  }

  for (const root of reportRoots) {
    const result = await cleanupRunWorkspacesInRoot(root, now)
    summary.deletedRuns += result.deletedRuns
    summary.reclaimedBytes += result.reclaimedBytes
    summary.retainedRuns += result.retainedRuns
    summary.scannedRuns += result.deletedRuns + result.retainedRuns
  }

  logInfo("run-workspace-store", "run_workspace_retention_summary", {
    ...summary,
  })
  return summary
}
