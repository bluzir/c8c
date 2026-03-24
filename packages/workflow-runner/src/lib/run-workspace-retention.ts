import { readdir, rm, stat } from "node:fs/promises"
import { join } from "node:path"

const DEFAULT_MAX_RUN_WORKSPACES = 100
const DEFAULT_MAX_RUN_WORKSPACE_AGE_DAYS = 14

export interface RunWorkspaceRetentionPolicy {
  maxWorkspaces: number
  maxAgeMs: number
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const raw = Number(value)
  if (Number.isFinite(raw) && raw >= 1) {
    return Math.max(1, Math.floor(raw))
  }
  return fallback
}

export function resolveRunWorkspaceRetentionPolicy(): RunWorkspaceRetentionPolicy {
  const maxWorkspaces = parsePositiveInteger(
    process.env.C8C_RUN_WORKSPACE_RETENTION_MAX,
    DEFAULT_MAX_RUN_WORKSPACES,
  )
  const maxAgeDays = parsePositiveInteger(
    process.env.C8C_RUN_WORKSPACE_RETENTION_MAX_AGE_DAYS,
    DEFAULT_MAX_RUN_WORKSPACE_AGE_DAYS,
  )
  return {
    maxWorkspaces,
    maxAgeMs: maxAgeDays * 24 * 60 * 60 * 1000,
  }
}

export async function cleanupRunWorkspaces(
  runsDir: string,
  policy: RunWorkspaceRetentionPolicy = resolveRunWorkspaceRetentionPolicy(),
  now: number = Date.now(),
  excludePaths: ReadonlySet<string> = new Set(),
): Promise<number> {
  let entries
  try {
    entries = await readdir(runsDir, { withFileTypes: true })
  } catch {
    return 0
  }

  const directories = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const fullPath = join(runsDir, entry.name)
        const info = await stat(fullPath)
        return {
          path: fullPath,
          mtimeMs: info.mtimeMs,
        }
      }),
  )

  directories.sort((left, right) => right.mtimeMs - left.mtimeMs)

  const removals = directories.filter(
    (entry, index) =>
      !excludePaths.has(entry.path) &&
      (index >= policy.maxWorkspaces || now - entry.mtimeMs > policy.maxAgeMs),
  )

  for (const entry of removals) {
    await rm(entry.path, { recursive: true, force: true })
  }

  return removals.length
}
