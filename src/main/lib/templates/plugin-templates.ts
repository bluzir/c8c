import { access, readdir, readFile } from "node:fs/promises"
import { basename, extname, join, resolve } from "node:path"
import type { InstalledPlugin, WorkflowTemplate } from "@shared/types"
import { ensurePluginMarketplacesDir, listInstalledPlugins } from "../plugins"
import { errorMessage } from "../error-utils"
import { logWarn } from "../structured-log"
import { parseTemplate } from "./parse"

interface MarketplacePluginEntry {
  source?: string
  templates?: string
}

interface MarketplaceManifest {
  plugins?: MarketplacePluginEntry[]
}

interface PluginManifest {
  templates?: string
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === "string") return code
  }
  return undefined
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function isWithinRoot(candidatePath: string, rootPath: string): boolean {
  const candidate = resolve(candidatePath)
  const root = resolve(rootPath)
  return (
    candidate === root ||
    candidate.startsWith(`${root}/`) ||
    candidate.startsWith(`${root}\\`)
  )
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

async function readJsonFile<T>(
  path: string,
  kind: string,
): Promise<T | undefined> {
  try {
    const raw = await readFile(path, "utf-8")
    return JSON.parse(raw) as T
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined
    logWarn("plugin-templates", "manifest_read_failed", {
      path,
      kind,
      error: errorMessage(error),
    })
    return undefined
  }
}

async function resolvePluginTemplateRoots(
  plugin: InstalledPlugin,
): Promise<string[]> {
  const pluginManifest = await readJsonFile<PluginManifest>(
    join(plugin.pluginPath, ".claude-plugin", "plugin.json"),
    "plugin",
  )
  const marketplacesDir = await ensurePluginMarketplacesDir()
  const marketplaceRoot = join(marketplacesDir, plugin.marketplaceId)
  const marketplaceManifest = await readJsonFile<MarketplaceManifest>(
    join(marketplaceRoot, ".claude-plugin", "marketplace.json"),
    "marketplace",
  )

  let matchingEntry: MarketplacePluginEntry | undefined
  for (const entry of marketplaceManifest?.plugins || []) {
    const sourcePath = resolveSafePath(
      marketplaceRoot,
      normalizeString(entry.source) || ".",
    )
    if (sourcePath === plugin.pluginPath) {
      matchingEntry = entry
      break
    }
  }

  const candidates = [
    resolveSafePath(
      plugin.pluginPath,
      normalizeString(pluginManifest?.templates),
    ),
    resolveSafePath(
      plugin.pluginPath,
      normalizeString(matchingEntry?.templates),
    ),
    resolveSafePath(plugin.pluginPath, "templates"),
  ].filter((value): value is string => Boolean(value))

  const uniqueRoots: string[] = []
  for (const rootPath of candidates) {
    if (!(await exists(rootPath))) continue
    if (!uniqueRoots.includes(rootPath)) uniqueRoots.push(rootPath)
  }

  return uniqueRoots
}

async function collectTemplateFiles(rootPath: string): Promise<string[]> {
  const files: string[] = []

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        logWarn("plugin-templates", "template_dir_read_failed", {
          dir,
          error: errorMessage(error),
        })
      }
      return
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
        continue
      }

      if (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")) {
        files.push(fullPath)
      }
    }
  }

  await walk(rootPath)
  return files.sort((left, right) => left.localeCompare(right))
}

function buildPluginTemplateId(
  plugin: InstalledPlugin,
  baseId: string,
): string {
  return `plugin:${plugin.id}:${baseId}`
}

export async function listPluginTemplates(): Promise<WorkflowTemplate[]> {
  const plugins = await listInstalledPlugins()
  const templates: WorkflowTemplate[] = []

  for (const plugin of plugins) {
    if (!plugin.enabled) continue

    const templateRoots = await resolvePluginTemplateRoots(plugin)
    for (const templateRoot of templateRoots) {
      const templateFiles = await collectTemplateFiles(templateRoot)
      for (const templatePath of templateFiles) {
        try {
          const raw = await readFile(templatePath, "utf-8")
          const parsed = parseTemplate(raw, {
            source: "plugin",
            pluginId: plugin.id,
            pluginName: plugin.name,
            marketplaceId: plugin.marketplaceId,
            marketplaceName: plugin.marketplaceName,
            pluginVersion: plugin.version,
            templatePath,
          })
          const baseId =
            normalizeString(parsed.id) ||
            basename(templatePath, extname(templatePath))
          templates.push({
            ...parsed,
            id: buildPluginTemplateId(plugin, baseId),
          })
        } catch (error) {
          logWarn("plugin-templates", "template_parse_failed", {
            pluginId: plugin.id,
            templatePath,
            error: errorMessage(error),
          })
        }
      }
    }
  }

  return templates.sort((left, right) => {
    if ((left.pluginName || "") !== (right.pluginName || "")) {
      return (left.pluginName || "").localeCompare(right.pluginName || "")
    }
    return left.name.localeCompare(right.name)
  })
}
