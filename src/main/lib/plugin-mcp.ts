import { errorMessage } from "./error-utils"
import { access, readFile } from "node:fs/promises"
import { join, relative, resolve } from "node:path"
import type { McpTransportType, PluginMcpServerInfo } from "@shared/types"
import { getApprovedPluginMcpServerIds, listInstalledPlugins } from "./plugins"
import { logWarn } from "./structured-log"

interface PluginManifest {
  mcp?: unknown
  mcpServers?: unknown
}

export interface PluginMcpEntry {
  type?: McpTransportType
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  headers?: Record<string, string>
  disabled?: boolean
  autoApprove?: string[]
}

export interface ResolvedPluginMcpServer {
  info: PluginMcpServerInfo
  entry: PluginMcpEntry
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
  return normalized.length > 0 ? normalized : undefined
}

function normalizeStringRecord(
  value: unknown,
): Record<string, string> | undefined {
  if (!isObject(value)) return undefined
  const entries = Object.entries(value).filter(
    (pair): pair is [string, string] => typeof pair[1] === "string",
  )
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function normalizeBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
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

async function readJsonFile<T>(path: string): Promise<T | undefined> {
  try {
    const raw = await readFile(path, "utf-8")
    return JSON.parse(raw) as T
  } catch (error) {
    if (isObject(error) && error.code === "ENOENT") {
      return undefined
    }
    logWarn("plugin-mcp", "manifest_read_failed", {
      path,
      error: errorMessage(error),
    })
    return undefined
  }
}

function extractMcpServerMap(raw: unknown): Record<string, unknown> {
  if (!isObject(raw)) return {}

  if (isObject(raw.mcpServers)) {
    return raw.mcpServers
  }

  if (isObject(raw.servers)) {
    return raw.servers
  }

  return Object.fromEntries(
    Object.entries(raw).filter(
      ([key, value]) =>
        key !== "mcpServers" && key !== "servers" && isObject(value),
    ),
  )
}

function normalizeMcpEntry(raw: unknown): PluginMcpEntry | null {
  if (!isObject(raw)) return null

  const command = normalizeString(raw.command)
  const url = normalizeString(raw.url)
  if (!command && !url) return null

  const type = command ? "stdio" : raw.type === "sse" ? "sse" : "http"

  return {
    type,
    command,
    args: normalizeStringArray(raw.args),
    url,
    env: normalizeStringRecord(raw.env),
    headers: normalizeStringRecord(raw.headers),
    disabled: normalizeBoolean(raw.disabled),
    autoApprove: normalizeStringArray(raw.autoApprove),
  }
}

function normalizeMcpEntries(raw: unknown): Record<string, PluginMcpEntry> {
  const normalized: Record<string, PluginMcpEntry> = {}
  for (const [name, entry] of Object.entries(extractMcpServerMap(raw))) {
    const normalizedName = normalizeString(name)
    const normalizedEntry = normalizeMcpEntry(entry)
    if (!normalizedName || !normalizedEntry) continue
    normalized[normalizedName] = normalizedEntry
  }
  return normalized
}

export function buildPluginMcpServerId(
  pluginId: string,
  serverName: string,
): string {
  return `${pluginId}/${serverName}`
}

async function loadPluginMcpEntries(
  pluginPath: string,
  manifestPath?: string,
): Promise<Record<string, PluginMcpEntry>> {
  const resolvedManifestPath =
    manifestPath || join(pluginPath, ".claude-plugin", "plugin.json")
  const manifest = await readJsonFile<PluginManifest>(resolvedManifestPath)

  const manifestEntries = normalizeMcpEntries(manifest?.mcpServers)
  if (Object.keys(manifestEntries).length > 0) {
    return manifestEntries
  }

  const mcpCandidates = [
    resolveSafePath(pluginPath, normalizeString(manifest?.mcp)),
    resolveSafePath(pluginPath, ".mcp.json"),
  ].filter((value): value is string => Boolean(value))

  for (const mcpPath of [...new Set(mcpCandidates)]) {
    if (!(await exists(mcpPath))) continue
    const mcpManifest = await readJsonFile<Record<string, unknown>>(mcpPath)
    const entries = normalizeMcpEntries(mcpManifest)
    if (Object.keys(entries).length > 0) {
      return entries
    }
  }

  return {}
}

export async function listPluginMcpServers(): Promise<PluginMcpServerInfo[]> {
  const approvedServerIds = new Set(await getApprovedPluginMcpServerIds())
  const plugins = (await listInstalledPlugins())
    .filter((plugin) => plugin.enabled)
    .filter((plugin) => plugin.capabilities.includes("mcp"))

  const servers: PluginMcpServerInfo[] = []

  for (const plugin of plugins) {
    const entries = await loadPluginMcpEntries(
      plugin.pluginPath,
      plugin.manifestPath,
    )
    for (const [serverName, entry] of Object.entries(entries)) {
      servers.push({
        id: buildPluginMcpServerId(plugin.id, serverName),
        name: serverName,
        type: entry.type || "stdio",
        command: entry.command,
        args: entry.args,
        url: entry.url,
        env: entry.env,
        headers: entry.headers,
        disabled: entry.disabled,
        autoApprove: entry.autoApprove,
        approved: approvedServerIds.has(
          buildPluginMcpServerId(plugin.id, serverName),
        ),
        pluginId: plugin.id,
        pluginName: plugin.name,
        pluginVersion: plugin.version,
        pluginPath: plugin.pluginPath,
        marketplaceId: plugin.marketplaceId,
        marketplaceName: plugin.marketplaceName,
      })
    }
  }

  return servers.sort((left, right) => {
    if (left.marketplaceName !== right.marketplaceName) {
      return left.marketplaceName.localeCompare(right.marketplaceName)
    }
    if (left.pluginName !== right.pluginName) {
      return left.pluginName.localeCompare(right.pluginName)
    }
    return left.name.localeCompare(right.name)
  })
}

export async function listApprovedPluginMcpServers(): Promise<
  ResolvedPluginMcpServer[]
> {
  const plugins = await listPluginMcpServers()
  return plugins
    .filter((server) => server.approved && !server.disabled)
    .map((server) => ({
      info: server,
      entry: {
        type: server.type,
        command: server.command,
        args: server.args,
        url: server.url,
        env: server.env,
        headers: server.headers,
        disabled: server.disabled,
        autoApprove: server.autoApprove,
      },
    }))
}
