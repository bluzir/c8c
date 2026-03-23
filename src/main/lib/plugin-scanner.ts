import { access, readdir, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, join, relative, resolve } from "node:path"
import type { InstalledPlugin, PluginAssetSummary } from "@shared/types"
import { errorMessage } from "./error-utils"
import { logWarn } from "./structured-log"

interface MarketplaceOwnerManifest {
  name?: string
  email?: string
}

interface MarketplacePluginEntry {
  name?: string
  description?: string
  version?: string
  source?: string
  category?: string
  homepage?: string
  repository?: string
  tags?: unknown
  keywords?: unknown
  author?: MarketplaceOwnerManifest
  skills?: string
  templates?: string
  mcp?: string
}

interface MarketplaceManifest {
  name?: string
  description?: string
  metadata?: {
    description?: string
    version?: string
  }
  owner?: MarketplaceOwnerManifest
  plugins?: MarketplacePluginEntry[]
}

interface PluginManifest {
  name?: string
  description?: string
  version?: string
  category?: string
  homepage?: string
  repository?: string
  tags?: unknown
  keywords?: unknown
  author?: MarketplaceOwnerManifest
  skills?: string
  templates?: string
  mcp?: string
  mcpServers?: Record<string, unknown>
}

export interface DiscoverInstalledPluginsOptions {
  marketplacesDir?: string
  disabledPluginIds?: Iterable<string>
}

function pluginMarketplacesDir(): string {
  return join(homedir(), ".c8c", "plugins", "marketplaces")
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

function normalizeStringList(...values: unknown[]): string[] {
  const items: string[] = []
  for (const value of values) {
    if (!Array.isArray(value)) continue
    for (const item of value) {
      const normalized = normalizeString(item)
      if (normalized) items.push(normalized)
    }
  }
  return [...new Set(items)]
}

function isWithinRoot(candidatePath: string, rootPath: string): boolean {
  const candidate = resolve(candidatePath)
  const root = resolve(rootPath)
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

async function readJsonFile<T>(
  path: string,
  kind: string,
): Promise<T | undefined> {
  try {
    const raw = await readFile(path, "utf-8")
    return JSON.parse(raw) as T
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined
    logWarn("plugin-scanner", "manifest_read_failed", {
      path,
      kind,
      error: errorMessage(error),
    })
    return undefined
  }
}

async function countSkillAssets(rootPath: string): Promise<number> {
  let count = 0

  async function walk(dir: string, depth: number): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        logWarn("plugin-scanner", "skill_dir_read_failed", {
          dir,
          error: errorMessage(error),
        })
      }
      return
    }

    const hasSkillFile = entries.some(
      (entry) => entry.isFile() && entry.name === "SKILL.md",
    )
    if (hasSkillFile) {
      count += 1
      return
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath, depth + 1)
        continue
      }

      if (
        depth <= 2 &&
        entry.name.endsWith(".md") &&
        entry.name !== "README.md"
      ) {
        count += 1
      }
    }
  }

  await walk(rootPath, 0)
  return count
}

async function countTemplateAssets(rootPath: string): Promise<number> {
  let count = 0

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        logWarn("plugin-scanner", "template_dir_read_failed", {
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
        count += 1
      }
    }
  }

  await walk(rootPath)
  return count
}

async function countMcpServers(mcpPath: string): Promise<number> {
  const manifest = await readJsonFile<{
    mcpServers?: unknown
    servers?: unknown
  }>(mcpPath, "mcp")
  if (!manifest) return 0

  const candidate = manifest.mcpServers ?? manifest.servers
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return 0
  }

  return Object.keys(candidate as Record<string, unknown>).length
}

async function summarizeAssets(
  pluginRoot: string,
  pluginManifest: PluginManifest | undefined,
  marketplaceEntry: MarketplacePluginEntry | undefined,
): Promise<PluginAssetSummary[]> {
  const skillRootCandidates = [
    resolveSafePath(pluginRoot, normalizeString(pluginManifest?.skills)),
    resolveSafePath(pluginRoot, normalizeString(marketplaceEntry?.skills)),
    resolveSafePath(pluginRoot, "skills"),
    resolveSafePath(pluginRoot, ".claude/skills"),
  ].filter((value): value is string => Boolean(value))

  const templateRootCandidates = [
    resolveSafePath(pluginRoot, normalizeString(pluginManifest?.templates)),
    resolveSafePath(pluginRoot, normalizeString(marketplaceEntry?.templates)),
    resolveSafePath(pluginRoot, "templates"),
  ].filter((value): value is string => Boolean(value))

  const mcpCandidates = [
    resolveSafePath(pluginRoot, normalizeString(pluginManifest?.mcp)),
    resolveSafePath(pluginRoot, normalizeString(marketplaceEntry?.mcp)),
    resolveSafePath(pluginRoot, ".mcp.json"),
  ].filter((value): value is string => Boolean(value))

  let skillCount = 0
  for (const rootPath of [...new Set(skillRootCandidates)]) {
    if (!(await exists(rootPath))) continue
    skillCount += await countSkillAssets(rootPath)
  }

  let templateCount = 0
  for (const rootPath of [...new Set(templateRootCandidates)]) {
    if (!(await exists(rootPath))) continue
    templateCount += await countTemplateAssets(rootPath)
  }

  let mcpCount = 0
  if (
    pluginManifest?.mcpServers &&
    typeof pluginManifest.mcpServers === "object"
  ) {
    mcpCount = Object.keys(pluginManifest.mcpServers).length
  } else {
    for (const mcpPath of [...new Set(mcpCandidates)]) {
      if (!(await exists(mcpPath))) continue
      mcpCount += await countMcpServers(mcpPath)
    }
  }

  const assets: PluginAssetSummary[] = []
  if (skillCount > 0) assets.push({ capability: "skill", count: skillCount })
  if (templateCount > 0)
    assets.push({ capability: "template", count: templateCount })
  if (mcpCount > 0) assets.push({ capability: "mcp", count: mcpCount })
  return assets
}

function buildPluginId(marketplaceId: string, pluginName: string): string {
  return `${marketplaceId}/${pluginName}`
}

async function buildInstalledPlugin(params: {
  marketplaceId: string
  marketplaceName: string
  pluginRoot: string
  marketplaceEntry?: MarketplacePluginEntry
  marketplaceManifest?: MarketplaceManifest
  disabledPluginIds: Set<string>
}): Promise<InstalledPlugin | null> {
  const pluginManifestPath = join(
    params.pluginRoot,
    ".claude-plugin",
    "plugin.json",
  )
  const pluginManifest = await readJsonFile<PluginManifest>(
    pluginManifestPath,
    "plugin",
  )
  const pluginName =
    normalizeString(pluginManifest?.name) ||
    normalizeString(params.marketplaceEntry?.name) ||
    basename(params.pluginRoot)
  const pluginId = buildPluginId(params.marketplaceId, pluginName)
  const assets = await summarizeAssets(
    params.pluginRoot,
    pluginManifest,
    params.marketplaceEntry,
  )

  return {
    id: pluginId,
    name: pluginName,
    description:
      normalizeString(pluginManifest?.description) ||
      normalizeString(params.marketplaceEntry?.description) ||
      "",
    version:
      normalizeString(pluginManifest?.version) ||
      normalizeString(params.marketplaceEntry?.version) ||
      normalizeString(params.marketplaceManifest?.metadata?.version),
    marketplaceId: params.marketplaceId,
    marketplaceName: params.marketplaceName,
    pluginPath: params.pluginRoot,
    manifestPath: (await exists(pluginManifestPath))
      ? pluginManifestPath
      : undefined,
    homepage:
      normalizeString(pluginManifest?.homepage) ||
      normalizeString(params.marketplaceEntry?.homepage),
    repository:
      normalizeString(pluginManifest?.repository) ||
      normalizeString(params.marketplaceEntry?.repository),
    author:
      normalizeString(pluginManifest?.author?.name) ||
      normalizeString(params.marketplaceEntry?.author?.name) ||
      normalizeString(params.marketplaceManifest?.owner?.name),
    category:
      normalizeString(pluginManifest?.category) ||
      normalizeString(params.marketplaceEntry?.category),
    tags: normalizeStringList(
      pluginManifest?.tags,
      pluginManifest?.keywords,
      params.marketplaceEntry?.tags,
      params.marketplaceEntry?.keywords,
    ),
    enabled: !params.disabledPluginIds.has(pluginId),
    capabilities: assets.map((asset) => asset.capability),
    assets,
  }
}

async function discoverMarketplacePlugins(
  marketplaceRoot: string,
  disabledPluginIds: Set<string>,
): Promise<InstalledPlugin[]> {
  const marketplaceId = basename(marketplaceRoot)
  const marketplaceManifestPath = join(
    marketplaceRoot,
    ".claude-plugin",
    "marketplace.json",
  )
  const marketplaceManifest = await readJsonFile<MarketplaceManifest>(
    marketplaceManifestPath,
    "marketplace",
  )
  const marketplaceName =
    normalizeString(marketplaceManifest?.name) || marketplaceId
  const plugins: InstalledPlugin[] = []
  const pluginEntries = Array.isArray(marketplaceManifest?.plugins)
    ? marketplaceManifest?.plugins
    : []

  if (Array.isArray(pluginEntries) && pluginEntries.length > 0) {
    for (const entry of pluginEntries) {
      const pluginRoot = resolveSafePath(
        marketplaceRoot,
        normalizeString(entry.source) || ".",
      )
      if (!pluginRoot) {
        logWarn("plugin-scanner", "plugin_source_outside_marketplace", {
          marketplaceRoot,
          source: entry.source,
        })
        continue
      }

      if (!(await exists(pluginRoot))) {
        logWarn("plugin-scanner", "plugin_source_missing", {
          marketplaceRoot,
          pluginRoot,
          source: entry.source,
        })
        continue
      }

      const plugin = await buildInstalledPlugin({
        marketplaceId,
        marketplaceName,
        marketplaceEntry: entry,
        marketplaceManifest,
        pluginRoot,
        disabledPluginIds,
      })
      if (plugin) plugins.push(plugin)
    }
  }

  if (plugins.length > 0) {
    return plugins
  }

  const rootPluginManifestPath = join(
    marketplaceRoot,
    ".claude-plugin",
    "plugin.json",
  )
  if (!(await exists(rootPluginManifestPath))) {
    return []
  }

  const rootPlugin = await buildInstalledPlugin({
    marketplaceId,
    marketplaceName,
    marketplaceManifest,
    pluginRoot: marketplaceRoot,
    disabledPluginIds,
  })

  return rootPlugin ? [rootPlugin] : []
}

export async function discoverInstalledPlugins(
  options: DiscoverInstalledPluginsOptions = {},
): Promise<InstalledPlugin[]> {
  const marketplacesDir = options.marketplacesDir || pluginMarketplacesDir()
  const disabledPluginIds = new Set(options.disabledPluginIds || [])
  let entries

  try {
    entries = await readdir(marketplacesDir, { withFileTypes: true })
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      logWarn("plugin-scanner", "marketplaces_root_read_failed", {
        marketplacesDir,
        error: errorMessage(error),
      })
    }
    return []
  }

  const plugins: InstalledPlugin[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    plugins.push(
      ...(await discoverMarketplacePlugins(
        join(marketplacesDir, entry.name),
        disabledPluginIds,
      )),
    )
  }

  return plugins.sort((left, right) => {
    if (left.marketplaceName !== right.marketplaceName) {
      return left.marketplaceName.localeCompare(right.marketplaceName)
    }
    return left.name.localeCompare(right.name)
  })
}
