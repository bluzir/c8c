import { existsSync, realpathSync } from "node:fs"
import { ensureLibrariesDir } from "./libraries"
import { ensurePluginMarketplacesDir } from "./plugins"
import { loadProjectsConfig } from "./projects-config"
import { ensureChainsDir, resolveGlobalWorkspacePath } from "./yaml-io"
import { basename, dirname, join, relative, resolve } from "node:path"

function dedupeResolved(paths: string[]): string[] {
  return [...new Set(paths.map((value) => resolve(value)))]
}

export function canonicalizePath(inputPath: string): string {
  const resolvedPath = resolve(inputPath)
  if (existsSync(resolvedPath)) {
    return realpathSync(resolvedPath)
  }
  const parentPath = dirname(resolvedPath)
  if (parentPath === resolvedPath) {
    return resolvedPath
  }
  return join(canonicalizePath(parentPath), basename(resolvedPath))
}

export function isWithinRoot(candidatePath: string, rootPath: string): boolean {
  const candidate = canonicalizePath(candidatePath)
  const root = canonicalizePath(rootPath)
  const rel = relative(root, candidate)
  return rel === "" || (!rel.startsWith("..") && !rel.includes("..\\"))
}

export function isRegisteredRoot(
  candidatePath: string,
  rootPath: string,
): boolean {
  return (
    isWithinRoot(candidatePath, rootPath) &&
    isWithinRoot(rootPath, candidatePath)
  )
}

export function assertWithinRoots(
  candidatePath: string,
  allowedRoots: string[],
  label: string,
): string {
  const resolvedPath = resolve(candidatePath)
  if (!allowedRoots.some((root) => isWithinRoot(resolvedPath, root))) {
    throw new Error(`${label} is outside allowed directories`)
  }
  return resolvedPath
}

export function assertRegisteredRoots(
  candidatePath: string,
  allowedRoots: string[],
  label: string,
): string {
  const resolvedPath = resolve(candidatePath)
  if (!allowedRoots.some((root) => isRegisteredRoot(resolvedPath, root))) {
    throw new Error(`${label} is not registered`)
  }
  return resolvedPath
}

export async function assertRegisteredProjectPath(
  projectPath: string,
): Promise<string> {
  return assertRegisteredRoots(
    projectPath,
    await allowedProjectRoots(),
    "Project path",
  )
}

export async function allowedProjectRoots(): Promise<string[]> {
  const config = await loadProjectsConfig()
  const globalPath = resolveGlobalWorkspacePath()
  return dedupeResolved([globalPath, ...config.projects])
}

export async function allowedWorkflowRoots(): Promise<string[]> {
  const globalChainsDir = await ensureChainsDir()
  const projectRoots = await allowedProjectRoots()
  const perProjectWorkflowRoots = projectRoots.flatMap((projectRoot) => [
    join(projectRoot, ".c8c"),
    join(projectRoot, ".claude", "workflows"),
  ])
  return dedupeResolved([globalChainsDir, ...perProjectWorkflowRoots])
}

export async function allowedReportRoots(): Promise<string[]> {
  const projectRoots = await allowedProjectRoots()
  return dedupeResolved(
    projectRoots.map((projectRoot) => join(projectRoot, ".c8c", "runs")),
  )
}

function userSkillRoots(): string[] {
  const homeDir = process.env.HOME || process.env.USERPROFILE || ""
  if (!homeDir) return []
  return [
    join(homeDir, ".claude", "skills"),
    join(homeDir, ".claude", "agents"),
    join(homeDir, ".claude", "commands"),
    join(homeDir, ".codex", "skills"),
  ]
}

function builtinSkillRoots(): string[] {
  const envOverride = process.env.C8C_BUILTIN_GSTACK_ROOT?.trim()
  if (envOverride) {
    return [resolve(envOverride)]
  }

  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string })
    .resourcesPath
  return [
    resolve(process.cwd(), "resources", "skills", "gstack"),
    resolve(resourcesPath || "", "skills", "gstack"),
  ].filter((value): value is string => Boolean(value))
}

export async function allowedSkillContentRoots(): Promise<string[]> {
  const projectRoots = await allowedProjectRoots()
  const projectSkillRoots = projectRoots.flatMap((projectRoot) => [
    join(projectRoot, ".claude", "skills"),
    join(projectRoot, ".claude", "agents"),
    join(projectRoot, ".claude", "commands"),
    join(projectRoot, ".agents", "skills"),
  ])
  const librariesDir = await ensureLibrariesDir()
  const pluginMarketplacesDir = await ensurePluginMarketplacesDir()
  return dedupeResolved([
    librariesDir,
    pluginMarketplacesDir,
    ...projectSkillRoots,
    ...userSkillRoots(),
    ...builtinSkillRoots(),
  ])
}

export async function allowedOpenPathRoots(): Promise<string[]> {
  const projectRoots = await allowedProjectRoots()
  const globalChainsDir = await ensureChainsDir()
  const librariesDir = await ensureLibrariesDir()
  const pluginMarketplacesDir = await ensurePluginMarketplacesDir()
  return dedupeResolved([
    globalChainsDir,
    librariesDir,
    pluginMarketplacesDir,
    ...projectRoots,
  ])
}
