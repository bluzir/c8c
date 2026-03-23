import { app } from "electron"
import { existsSync } from "node:fs"
import { mkdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { writeFileAtomic } from "./atomic-write"
import { logWarn } from "./structured-log"
import { resolveAppHomeDir } from "./runtime-paths"

export interface ProjectsConfig {
  projects: string[]
  lastSelectedProject?: string
}

export interface ProjectsConfigResult extends ProjectsConfig {
  /** Number of project paths removed because the directory no longer exists. */
  removedCount: number
}

function resolveHomeDir(): string {
  return resolveAppHomeDir({ app })
}

export function projectsConfigPath(): string {
  return join(resolveHomeDir(), ".c8c", "config.json")
}

export async function loadProjectsConfig(): Promise<ProjectsConfigResult> {
  try {
    const data = await readFile(projectsConfigPath(), "utf-8")
    const parsed = JSON.parse(data) as Partial<ProjectsConfig>
    const allProjects = Array.isArray(parsed.projects)
      ? parsed.projects
          .filter((value): value is string => typeof value === "string")
          .map((value) => resolve(value))
      : []

    const projects = allProjects.filter((p) => existsSync(p))
    const removedCount = allProjects.length - projects.length

    let lastSelectedProject =
      typeof parsed.lastSelectedProject === "string"
        ? resolve(parsed.lastSelectedProject)
        : undefined

    // Clear lastSelectedProject if its directory was removed
    if (lastSelectedProject && !existsSync(lastSelectedProject)) {
      lastSelectedProject = undefined
    }

    if (removedCount > 0) {
      logWarn("projects-config", "removed_missing_dirs", {
        removedCount,
        path: projectsConfigPath(),
      })
      await saveProjectsConfig({ projects, lastSelectedProject })
    }

    return { projects, lastSelectedProject, removedCount }
  } catch (error) {
    const errorCode =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: string }).code)
        : undefined
    if (errorCode !== "ENOENT") {
      logWarn("projects-config", "load_failed", {
        error: String(error),
        path: projectsConfigPath(),
      })
    }
    return { projects: [], removedCount: 0 }
  }
}

export async function saveProjectsConfig(
  config: ProjectsConfig,
): Promise<void> {
  const normalizedProjects = [
    ...new Set(
      config.projects
        .filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        )
        .map((value) => resolve(value)),
    ),
  ]

  const payload: ProjectsConfig = {
    projects: normalizedProjects,
    lastSelectedProject: config.lastSelectedProject
      ? resolve(config.lastSelectedProject)
      : undefined,
  }

  const configDir = join(resolveHomeDir(), ".c8c")
  await mkdir(configDir, { recursive: true })
  await writeFileAtomic(projectsConfigPath(), JSON.stringify(payload, null, 2))
}
