import { app } from "electron"
import { mkdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { writeFileAtomic } from "./atomic-write"
import { logWarn } from "./structured-log"
import { resolveAppHomeDir } from "./runtime-paths"

interface ProjectTemplateUsageStore {
  byProject: Record<string, Record<string, number>>
}

function resolveHomeDir(): string {
  return resolveAppHomeDir({ app })
}

function usageFilePath(): string {
  return join(resolveHomeDir(), ".c8c", "project-template-usage.json")
}

async function loadStore(): Promise<ProjectTemplateUsageStore> {
  try {
    const raw = await readFile(usageFilePath(), "utf-8")
    const parsed = JSON.parse(raw) as Partial<ProjectTemplateUsageStore>
    const byProjectEntries = Object.entries(parsed.byProject || {}).map(
      ([projectPath, counts]) => {
        const normalizedCounts = Object.fromEntries(
          Object.entries(counts || {}).filter(
            (entry): entry is [string, number] =>
              typeof entry[0] === "string" &&
              typeof entry[1] === "number" &&
              entry[1] > 0,
          ),
        )
        return [resolve(projectPath), normalizedCounts] as const
      },
    )
    return {
      byProject: Object.fromEntries(byProjectEntries),
    }
  } catch (error) {
    const errorCode =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: string }).code)
        : undefined
    if (errorCode !== "ENOENT") {
      logWarn("project-template-usage", "load_failed", {
        error: String(error),
        path: usageFilePath(),
      })
    }
    return { byProject: {} }
  }
}

async function saveStore(store: ProjectTemplateUsageStore): Promise<void> {
  const dir = join(resolveHomeDir(), ".c8c")
  await mkdir(dir, { recursive: true })
  await writeFileAtomic(usageFilePath(), JSON.stringify(store, null, 2))
}

export async function recordProjectTemplateUsage(
  projectPath: string,
  templateId: string,
): Promise<void> {
  const normalizedProjectPath = resolve(projectPath)
  const store = await loadStore()
  const projectCounts = store.byProject[normalizedProjectPath] || {}
  projectCounts[templateId] = (projectCounts[templateId] || 0) + 1
  store.byProject[normalizedProjectPath] = projectCounts
  await saveStore(store)
}

export async function listPopularTemplateIdsForProject(
  projectPath: string,
  limit = 5,
): Promise<string[]> {
  const normalizedProjectPath = resolve(projectPath)
  const store = await loadStore()
  const counts = Object.entries(store.byProject[normalizedProjectPath] || {})
  counts.sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1]
    return left[0].localeCompare(right[0])
  })
  return counts.slice(0, Math.max(0, limit)).map(([templateId]) => templateId)
}
