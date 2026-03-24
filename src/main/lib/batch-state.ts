import { errorMessage } from "./error-utils"
import { mkdir, readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import type { BatchItemResult, RunStatus } from "@shared/types"
import { writeFileAtomic } from "./atomic-write"
import { resolveAppHomeDir } from "./runtime-paths"
import { allowedProjectRoots } from "./security-paths"
import { logInfo, logWarn } from "./structured-log"

export type PersistedBatchStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"

export interface PersistedBatchState {
  batchId: string
  workflowName: string
  workflowPath?: string
  projectPath?: string
  total: number
  completed: number
  running: number
  concurrency: number
  stopOnFailure: boolean
  startedAt: number
  updatedAt: number
  status: PersistedBatchStatus
  items: BatchItemResult[]
  error?: string
}

const PERSISTED_BATCH_STATUSES = new Set<PersistedBatchStatus>([
  "running",
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => isFiniteNumber(entry))
  )
}

function parseBatchItemResult(value: unknown): BatchItemResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const parsed = value as Record<string, unknown>
  if (
    !isFiniteNumber(parsed.input_index) ||
    typeof parsed.run_id !== "string" ||
    typeof parsed.status !== "string" ||
    !RUN_STATUSES.has(parsed.status as RunStatus) ||
    !isNumberRecord(parsed.eval_scores) ||
    !isFiniteNumber(parsed.cost_usd) ||
    !isFiniteNumber(parsed.duration_ms)
  ) {
    return null
  }

  if (
    (parsed.error !== undefined && typeof parsed.error !== "string") ||
    (parsed.output !== undefined && typeof parsed.output !== "string")
  ) {
    return null
  }

  return {
    input_index: parsed.input_index,
    run_id: parsed.run_id,
    status: parsed.status as RunStatus,
    eval_scores: parsed.eval_scores,
    cost_usd: parsed.cost_usd,
    duration_ms: parsed.duration_ms,
    error: typeof parsed.error === "string" ? parsed.error : undefined,
    output: typeof parsed.output === "string" ? parsed.output : undefined,
  }
}

function parsePersistedBatchState(raw: string): PersistedBatchState | null {
  const parsed = JSON.parse(raw) as Record<string, unknown>
  if (
    typeof parsed.batchId !== "string" ||
    typeof parsed.workflowName !== "string" ||
    !isFiniteNumber(parsed.total) ||
    !isFiniteNumber(parsed.completed) ||
    !isFiniteNumber(parsed.running) ||
    !isFiniteNumber(parsed.concurrency) ||
    typeof parsed.stopOnFailure !== "boolean" ||
    !isFiniteNumber(parsed.startedAt) ||
    !isFiniteNumber(parsed.updatedAt) ||
    typeof parsed.status !== "string" ||
    !PERSISTED_BATCH_STATUSES.has(parsed.status as PersistedBatchStatus) ||
    !Array.isArray(parsed.items)
  ) {
    return null
  }

  const items = parsed.items
    .map((item) => parseBatchItemResult(item))
    .filter((item): item is BatchItemResult => item !== null)
  if (items.length !== parsed.items.length) {
    return null
  }

  if (
    (parsed.workflowPath !== undefined &&
      typeof parsed.workflowPath !== "string") ||
    (parsed.projectPath !== undefined &&
      typeof parsed.projectPath !== "string") ||
    (parsed.error !== undefined && typeof parsed.error !== "string")
  ) {
    return null
  }

  return {
    batchId: parsed.batchId,
    workflowName: parsed.workflowName,
    workflowPath:
      typeof parsed.workflowPath === "string" ? parsed.workflowPath : undefined,
    projectPath:
      typeof parsed.projectPath === "string" ? parsed.projectPath : undefined,
    total: parsed.total,
    completed: parsed.completed,
    running: parsed.running,
    concurrency: parsed.concurrency,
    stopOnFailure: parsed.stopOnFailure,
    startedAt: parsed.startedAt,
    updatedAt: parsed.updatedAt,
    status: parsed.status as PersistedBatchStatus,
    items,
    error: typeof parsed.error === "string" ? parsed.error : undefined,
  }
}

function globalBatchRoot(): string {
  return join(resolveAppHomeDir(), ".c8c", "batches")
}

export async function ensureBatchWorkspace(
  batchId: string,
  projectPath?: string,
): Promise<string> {
  const root = projectPath
    ? join(projectPath, ".c8c", "batches")
    : globalBatchRoot()
  const workspace = join(root, batchId)
  await mkdir(workspace, { recursive: true })
  return workspace
}

function batchStatePath(workspace: string): string {
  return join(workspace, "batch-state.json")
}

export async function persistBatchState(
  workspace: string,
  state: PersistedBatchState,
): Promise<void> {
  await writeFileAtomic(
    batchStatePath(workspace),
    JSON.stringify(state, null, 2),
  )
}

export async function readBatchState(
  workspace: string,
): Promise<PersistedBatchState | null> {
  try {
    const raw = await readFile(batchStatePath(workspace), "utf-8")
    return parsePersistedBatchState(raw)
  } catch {
    return null
  }
}

async function listBatchWorkspaces(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name))
  } catch {
    return []
  }
}

export async function recoverBatchStates(): Promise<{
  roots: number
  workspaces: number
  interrupted: number
}> {
  const projectRoots = await allowedProjectRoots()
  const roots = [
    globalBatchRoot(),
    ...projectRoots.map((projectRoot) => join(projectRoot, ".c8c", "batches")),
  ]
  let workspaces = 0
  let interrupted = 0

  for (const root of roots) {
    const batchWorkspaces = await listBatchWorkspaces(root)
    workspaces += batchWorkspaces.length
    for (const workspace of batchWorkspaces) {
      const state = await readBatchState(workspace)
      if (!state || state.status !== "running") continue
      state.status = "interrupted"
      state.running = 0
      state.updatedAt = Date.now()
      await persistBatchState(workspace, state)
      interrupted += 1
    }
  }

  logInfo("batch-recovery", "batch_recovery_summary", {
    roots: roots.length,
    workspaces,
    interrupted,
  })

  return { roots: roots.length, workspaces, interrupted }
}

export function logBatchPersistenceFailure(
  batchId: string,
  error: unknown,
): void {
  logWarn("batch-state", "persist_batch_state_failed", {
    batchId,
    error: errorMessage(error),
  })
}
