import { existsSync, realpathSync } from "node:fs"
import { access, readdir, readFile } from "node:fs/promises"
import { join, basename, dirname, relative, resolve } from "node:path"
import matter from "gray-matter"
import type { DiscoveredSkill, InstalledPlugin } from "@shared/types"
import { ensurePluginMarketplacesDir, listInstalledPlugins } from "./plugins"
import { logWarn } from "./structured-log"

const SCAN_DIRS = ["skills", "agents", "commands"] as const
type ScanDir = (typeof SCAN_DIRS)[number]

const DIR_TO_TYPE: Record<ScanDir, DiscoveredSkill["type"]> = {
  skills: "skill",
  agents: "agent",
  commands: "command",
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === "string") return code
  }
  return undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
  if (normalized.length === 0) return undefined
  return [...new Set(normalized)]
}

function normalizePositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  const normalized = Math.floor(value)
  return normalized >= 1 ? normalized : undefined
}

function skillFrontmatterMetadata(data: Record<string, unknown>) {
  return {
    model: normalizeString(data.model),
    tools: normalizeStringList(data.tools),
    maxTurns: normalizePositiveInteger(data.maxTurns ?? data.max_turns),
    allowedTools: normalizeStringList(data.allowedTools ?? data.allowed_tools),
    disallowedTools: normalizeStringList(data.disallowedTools ?? data.disallowed_tools),
  }
}

function canonicalizePath(inputPath: string): string {
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

function isWithinRoot(candidatePath: string, rootPath: string): boolean {
  const candidate = canonicalizePath(candidatePath)
  const root = canonicalizePath(rootPath)
  const rel = relative(root, candidate)
  return rel === "" || (!rel.startsWith("..") && !rel.includes("..\\"))
}

function resolveSafePath(rootPath: string, pathValue?: string): string | null {
  if (!pathValue) return null
  const resolved = resolve(rootPath, pathValue)
  return isWithinRoot(resolved, rootPath) ? resolved : null
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function readJsonFile<T>(path: string, kind: string): Promise<T | undefined> {
  try {
    const raw = await readFile(path, "utf-8")
    return JSON.parse(raw) as T
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined
    logWarn("skill-scanner", "plugin_manifest_read_failed", {
      path,
      kind,
      error: errorMessage(error),
    })
    return undefined
  }
}

interface SkillScannerExtraFields {
  library?: string
  pluginId?: string
  pluginName?: string
  marketplaceId?: string
  marketplaceName?: string
  pluginVersion?: string
}

interface MarketplacePluginEntry {
  name?: string
  source?: string
  skills?: string
}

interface MarketplaceManifest {
  plugins?: MarketplacePluginEntry[]
}

interface PluginManifest {
  skills?: string
}

async function scanDirectory(
  baseDir: string,
  type: DiscoveredSkill["type"],
  format: DiscoveredSkill["format"],
  sourceScope: DiscoveredSkill["sourceScope"],
  extraFields: SkillScannerExtraFields = {},
): Promise<DiscoveredSkill[]> {
  const results: DiscoveredSkill[] = []

  async function walk(dir: string, category: string) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        logWarn("skill-scanner", "scan_dir_read_failed", {
          dir,
          type,
          category,
          error: errorMessage(error),
        })
      }
      return
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath, category ? `${category}/${entry.name}` : entry.name)
      } else if (entry.name.endsWith(".md") && entry.name !== "README.md") {
        try {
          const content = await readFile(fullPath, "utf-8")
          const { data } = matter(content)
          results.push({
            type,
            name: data.name || basename(entry.name, ".md"),
            description: data.description || "",
            category: category || "uncategorized",
            path: fullPath,
            format,
            sourceScope,
            ...skillFrontmatterMetadata(data),
            ...extraFields,
          })
        } catch (error) {
          if (errorCode(error) !== "ENOENT") {
            logWarn("skill-scanner", "skill_file_parse_failed", {
              path: fullPath,
              type,
              category,
              error: errorMessage(error),
            })
          }
        }
      }
    }
  }

  await walk(baseDir, "")
  return results
}

async function scanCodexSkillDirs(
  baseDir: string,
  sourceScope: DiscoveredSkill["sourceScope"],
  options: {
    defaultCategory?: string
    extraFields?: SkillScannerExtraFields
  } = {},
): Promise<DiscoveredSkill[]> {
  const results: DiscoveredSkill[] = []
  const defaultCategory = options.defaultCategory || "codex"
  const extraFields = options.extraFields || {}

  async function walk(dir: string, category = ""): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        logWarn("skill-scanner", "scan_codex_dir_failed", {
          dir,
          category,
          error: errorMessage(error),
        })
      }
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillDir = join(dir, entry.name)
      const skillFile = join(skillDir, "SKILL.md")

      try {
        const content = await readFile(skillFile, "utf-8")
        const { data } = matter(content)
        results.push({
          type: "skill",
          name: data.name || entry.name,
          description: data.description || "",
          category: category || defaultCategory,
          path: skillFile,
          format: "codex-skill",
          sourceScope,
          ...skillFrontmatterMetadata(data),
          ...extraFields,
        })
        continue
      } catch (error) {
        if (errorCode(error) !== "ENOENT") {
          logWarn("skill-scanner", "scan_codex_skill_failed", {
            path: skillFile,
            error: errorMessage(error),
          })
        }
      }

      await walk(skillDir, category ? `${category}/${entry.name}` : entry.name)
    }
  }

  await walk(baseDir)
  return results
}

export async function scanSkills(projectPath: string): Promise<DiscoveredSkill[]> {
  const all: DiscoveredSkill[] = []
  const claudeDir = join(projectPath, ".claude")
  const codexDir = join(projectPath, ".agents", "skills")

  for (const dir of SCAN_DIRS) {
    const fullDir = join(claudeDir, dir)
    const skills = await scanDirectory(fullDir, DIR_TO_TYPE[dir], "claude-markdown", "project")
    all.push(...skills)
  }

  all.push(...await scanCodexSkillDirs(codexDir, "project"))
  return all
}

export async function scanUserSkills(): Promise<DiscoveredSkill[]> {
  const home = process.env.HOME || process.env.USERPROFILE || ""
  const claudeDir = join(home, ".claude")
  const codexDir = join(home, ".codex", "skills")
  const all: DiscoveredSkill[] = []

  for (const dir of SCAN_DIRS) {
    const fullDir = join(claudeDir, dir)
    const skills = await scanDirectory(fullDir, DIR_TO_TYPE[dir], "claude-markdown", "user")
    all.push(...skills)
  }

  all.push(...await scanCodexSkillDirs(codexDir, "user"))
  return all
}

async function resolvePluginSkillRoots(plugin: InstalledPlugin): Promise<string[]> {
  const pluginManifest = await readJsonFile<PluginManifest>(
    join(plugin.pluginPath, ".claude-plugin", "plugin.json"),
    "plugin",
  )
  const marketplacesDir = await ensurePluginMarketplacesDir()
  const marketplaceManifest = await readJsonFile<MarketplaceManifest>(
    join(marketplacesDir, plugin.marketplaceId, ".claude-plugin", "marketplace.json"),
    "marketplace",
  )

  let matchingEntry: MarketplacePluginEntry | undefined
  for (const entry of marketplaceManifest?.plugins || []) {
    const sourcePath = resolveSafePath(join(marketplacesDir, plugin.marketplaceId), normalizeString(entry.source) || ".")
    if (sourcePath === plugin.pluginPath) {
      matchingEntry = entry
      break
    }
  }

  const candidateRoots = [
    resolveSafePath(plugin.pluginPath, normalizeString(pluginManifest?.skills)),
    resolveSafePath(plugin.pluginPath, normalizeString(matchingEntry?.skills)),
    resolveSafePath(plugin.pluginPath, "skills"),
    resolveSafePath(plugin.pluginPath, ".claude/skills"),
  ].filter((value): value is string => Boolean(value))

  const uniqueRoots: string[] = []
  for (const rootPath of candidateRoots) {
    if (!(await exists(rootPath))) continue
    if (!uniqueRoots.includes(rootPath)) uniqueRoots.push(rootPath)
  }
  return uniqueRoots
}

export async function scanPluginSkills(): Promise<DiscoveredSkill[]> {
  const plugins = await listInstalledPlugins()
  const all: DiscoveredSkill[] = []

  for (const plugin of plugins) {
    if (!plugin.enabled) continue

    const skillRoots = await resolvePluginSkillRoots(plugin)
    for (const rootPath of skillRoots) {
      const pluginSkills = await scanCodexSkillDirs(rootPath, "plugin", {
        defaultCategory: plugin.category || plugin.name,
        extraFields: {
          library: plugin.name,
          pluginId: plugin.id,
          pluginName: plugin.name,
          marketplaceId: plugin.marketplaceId,
          marketplaceName: plugin.marketplaceName,
          pluginVersion: plugin.version,
        },
      })
      all.push(...pluginSkills)
    }
  }

  return all
}

export function mergeDiscoveredSkills(skillGroups: DiscoveredSkill[][]): DiscoveredSkill[] {
  const seen = new Set<string>()
  const merged: DiscoveredSkill[] = []

  for (const group of skillGroups) {
    for (const skill of group) {
      const key = `${skill.type}:${skill.category}:${skill.name}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(skill)
    }
  }

  return merged
}

export async function scanAllSkills(projectPath: string): Promise<DiscoveredSkill[]> {
  const [projectSkills, userSkills, pluginSkills] = await Promise.all([
    scanSkills(projectPath),
    scanUserSkills(),
    scanPluginSkills(),
  ])

  return mergeDiscoveredSkills([projectSkills, userSkills, pluginSkills])
}
