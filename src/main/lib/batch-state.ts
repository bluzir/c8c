import { errorMessage } from "./error-utils"
import { mkdir, readFile, readdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { BatchItemResult } from "@shared/types"
import { writeFileAtomic } from "./atomic-write"
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

function globalBatchRoot(): string {
  return join(homedir(), ".c8c", "batches")
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
    return JSON.parse(raw) as PersistedBatchState
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
