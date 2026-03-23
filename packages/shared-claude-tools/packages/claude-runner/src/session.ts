import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"

/**
 * Find the most recent session directory in `{workdir}/artifacts/`.
 * Returns the session directory name (e.g. "2024-01-15-abc123") or undefined.
 */
export async function findLatestSession(
  workdir: string,
): Promise<string | undefined> {
  const artifactsDir = join(workdir, "artifacts")
  try {
    await stat(artifactsDir)
  } catch {
    return undefined
  }

  const entries = await readdir(artifactsDir, { withFileTypes: true })
  const sessions: { mtime: number; name: string }[] = []

  for (const entry of entries) {
    if (entry.isDirectory() && /^\d{4}-\d{2}-\d{2}/.test(entry.name)) {
      const fullPath = join(artifactsDir, entry.name)
      const stats = await stat(fullPath)
      sessions.push({ mtime: stats.mtimeMs, name: entry.name })
    }
  }

  if (sessions.length === 0) return undefined
  sessions.sort((a, b) => b.mtime - a.mtime)
  return sessions[0].name
}
