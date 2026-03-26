import { existsSync, readFileSync, statSync } from "node:fs"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import type { ProviderId } from "@shared/types"
import { writeFileAtomic } from "./atomic-write"
import { buildConfiguredMcpIntegrationServerEntries } from "./mcp-integration-registry"
import {
  normalizeMcpConfigEntry,
  type NormalizedMcpServerEntry,
} from "./mcp-validation"
import { listApprovedPluginMcpServers } from "./plugin-mcp"
import { logWarn } from "./structured-log"

export type WebSearchBackend = "builtin" | "exa"

interface McpServerEntry extends NormalizedMcpServerEntry {
  [key: string]: unknown
}

interface McpConfig {
  mcpServers: Record<string, McpServerEntry>
}

const mcpConfigCache = new Map<string, McpConfig>()
const mcpConfigMtimes = new Map<string, number>()

export type ClaudeSdkMcpServerConfig =
  | {
      type?: "stdio"
      command: string
      args?: string[]
      env?: Record<string, string>
    }
  | {
      type: "sse"
      url: string
      headers?: Record<string, string>
    }
  | {
      type: "http"
      url: string
      headers?: Record<string, string>
    }

export interface PreparedMcpConfigHandle {
  path?: string
  cleanup: () => Promise<void>
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeMcpConfig(raw: unknown): McpConfig | null {
  if (!isObject(raw)) return null

  const nested = raw.mcpServers
  if (isObject(nested)) {
    const mcpServers: Record<string, McpServerEntry> = {}
    for (const [name, entry] of Object.entries(nested)) {
      const normalizedEntry = normalizeMcpConfigEntry(name, entry)
      if (!normalizedEntry.ok) {
        logWarn("mcp-config", "invalid_mcp_server_entry", {
          serverName: String(name),
          error: normalizedEntry.error,
        })
        continue
      }
      mcpServers[normalizedEntry.value.name] = normalizedEntry.value.entry
    }
    return { mcpServers }
  }

  const flatEntries = Object.entries(raw).filter(
    ([key, value]) => key !== "mcpServers" && isObject(value),
  )
  if (flatEntries.length === 0) return null

  const mcpServers: Record<string, McpServerEntry> = {}
  for (const [name, entry] of flatEntries) {
    const normalizedEntry = normalizeMcpConfigEntry(name, entry)
    if (!normalizedEntry.ok) {
      logWarn("mcp-config", "invalid_mcp_server_entry", {
        serverName: String(name),
        error: normalizedEntry.error,
      })
      continue
    }
    mcpServers[normalizedEntry.value.name] = normalizedEntry.value.entry
  }
  return { mcpServers }
}

async function readMcpConfig(filePath: string): Promise<McpConfig | null> {
  const resolvedPath = resolve(filePath)
  const cached = mcpConfigCache.get(resolvedPath)
  if (cached) {
    try {
      const currentMtime = (await stat(filePath)).mtimeMs
      if (currentMtime === mcpConfigMtimes.get(resolvedPath)) return cached
    } catch {
      // File may have been deleted — invalidate cache
      mcpConfigCache.delete(resolvedPath)
      mcpConfigMtimes.delete(resolvedPath)
      return null
    }
  }
  try {
    const currentMtime = (await stat(filePath)).mtimeMs
    const raw = await readFile(filePath, "utf-8")
    const parsed = JSON.parse(raw) as unknown
    const normalized = normalizeMcpConfig(parsed)
    if (normalized) {
      mcpConfigCache.set(resolvedPath, normalized)
      mcpConfigMtimes.set(resolvedPath, currentMtime)
    }
    return normalized
  } catch {
    return null
  }
}

export function invalidateMcpConfigCache(filePath?: string): void {
  if (filePath) {
    const resolvedPath = resolve(filePath)
    mcpConfigCache.delete(resolvedPath)
    mcpConfigMtimes.delete(resolvedPath)
    return
  }
  mcpConfigCache.clear()
  mcpConfigMtimes.clear()
}

function escapeTomlString(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
}

function toTomlLiteral(value: unknown): string {
  if (typeof value === "string") return `"${escapeTomlString(value)}"`
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "0"
  if (Array.isArray(value))
    return `[${value.map((item) => toTomlLiteral(item)).join(", ")}]`
  if (isObject(value)) {
    return `{ ${Object.entries(value)
      .map(([key, item]) => `${key} = ${toTomlLiteral(item)}`)
      .join(", ")} }`
  }
  return '""'
}

function buildCodexMcpOverrides(config: McpConfig): string[] {
  const overrides: string[] = []
  for (const [name, entry] of Object.entries(config.mcpServers)) {
    if (entry.disabled) continue
    const pathPrefix = `mcp_servers."${escapeTomlString(name)}"`

    if (typeof entry.command === "string" && entry.command.trim()) {
      overrides.push(
        "-c",
        `${pathPrefix}.command=${toTomlLiteral(entry.command)}`,
      )
    }
    if (Array.isArray(entry.args) && entry.args.length > 0) {
      overrides.push("-c", `${pathPrefix}.args=${toTomlLiteral(entry.args)}`)
    }
    if (isObject(entry.env) && Object.keys(entry.env).length > 0) {
      overrides.push("-c", `${pathPrefix}.env=${toTomlLiteral(entry.env)}`)
    }
    if (typeof entry.url === "string" && entry.url.trim()) {
      overrides.push("-c", `${pathPrefix}.url=${toTomlLiteral(entry.url)}`)
    }
    if (isObject(entry.headers) && Object.keys(entry.headers).length > 0) {
      overrides.push(
        "-c",
        `${pathPrefix}.http_headers=${toTomlLiteral(entry.headers)}`,
      )
    }
  }
  return overrides
}

function readMcpConfigSync(filePath: string): McpConfig | null {
  const resolvedPath = resolve(filePath)
  const cached = mcpConfigCache.get(resolvedPath)
  if (cached) {
    try {
      const currentMtime = statSync(filePath).mtimeMs
      if (currentMtime === mcpConfigMtimes.get(resolvedPath)) return cached
    } catch {
      mcpConfigCache.delete(resolvedPath)
      mcpConfigMtimes.delete(resolvedPath)
      return null
    }
  }
  try {
    const currentMtime = statSync(filePath).mtimeMs
    const raw = readFileSync(filePath, "utf-8")
    const normalized = normalizeMcpConfig(JSON.parse(raw) as unknown)
    if (normalized) {
      mcpConfigCache.set(resolvedPath, normalized)
      mcpConfigMtimes.set(resolvedPath, currentMtime)
    }
    return normalized
  } catch {
    return null
  }
}

export function buildProviderExtraArgs(
  provider: ProviderId,
  mcpConfigPath?: string,
): string[] {
  if (provider === "claude" && mcpConfigPath) {
    return [
      "--verbose",
      "--output-format",
      "stream-json",
      `--mcp-config=${mcpConfigPath}`,
    ]
  }

  if (provider === "claude") {
    return ["--verbose", "--output-format", "stream-json"]
  }

  if (!mcpConfigPath) return []

  const resolvedPath = resolve(mcpConfigPath)
  const source =
    mcpConfigCache.has(resolvedPath) || existsSync(mcpConfigPath)
      ? mcpConfigPath
      : undefined
  if (!source) return []

  const config = readMcpConfigSync(source)
  return config ? buildCodexMcpOverrides(config) : []
}

export function buildClaudeSdkMcpServers(
  mcpConfigPath?: string,
): Record<string, ClaudeSdkMcpServerConfig> {
  if (!mcpConfigPath) return {}
  const resolvedPath = resolve(mcpConfigPath)
  if (!mcpConfigCache.has(resolvedPath) && !existsSync(mcpConfigPath)) return {}

  const config = readMcpConfigSync(mcpConfigPath)
  if (!config) return {}

  const servers: Record<string, ClaudeSdkMcpServerConfig> = {}
  for (const [name, entry] of Object.entries(config.mcpServers)) {
    if (entry.disabled) continue

    if (typeof entry.command === "string" && entry.command.trim()) {
      servers[name] = {
        type: "stdio",
        command: entry.command,
        args: Array.isArray(entry.args)
          ? entry.args.filter((arg): arg is string => typeof arg === "string")
          : undefined,
        env: isObject(entry.env)
          ? Object.fromEntries(
              Object.entries(entry.env).filter(
                (pair): pair is [string, string] => typeof pair[1] === "string",
              ),
            )
          : undefined,
      }
      continue
    }

    if (typeof entry.url === "string" && entry.url.trim()) {
      const headers = isObject(entry.headers)
        ? Object.fromEntries(
            Object.entries(entry.headers).filter(
              (pair): pair is [string, string] => typeof pair[1] === "string",
            ),
          )
        : undefined
      servers[name] = {
        type: entry.type === "sse" ? "sse" : "http",
        url: entry.url,
        headers,
      }
    }
  }

  return servers
}

export function buildClaudeExtraArgs(mcpConfigPath?: string): string[] {
  return buildProviderExtraArgs("claude", mcpConfigPath)
}

async function buildRuntimeMcpConfig(
  projectPath?: string,
  workspaceMcpPath?: string,
  backend?: WebSearchBackend,
): Promise<McpConfig | null> {
  const sources = [
    projectPath ? join(projectPath, ".mcp.json") : undefined,
    workspaceMcpPath,
  ].filter((value): value is string => Boolean(value))

  let config: McpConfig | null = null
  for (const sourcePath of sources) {
    if (!existsSync(sourcePath)) continue
    const loaded = await readMcpConfig(sourcePath)
    if (loaded) {
      config = loaded
      break
    }
  }

  const pluginServers = await listApprovedPluginMcpServers()
  if (pluginServers.length > 0) {
    config = config ?? { mcpServers: {} }
    for (const server of pluginServers) {
      if (config.mcpServers[server.info.name]) continue
      const normalizedEntry = normalizeMcpConfigEntry(
        server.info.name,
        server.entry,
      )
      if (!normalizedEntry.ok) {
        logWarn("mcp-config", "invalid_plugin_mcp_server_entry", {
          serverName: server.info.name,
          pluginId: server.info.pluginId,
          error: normalizedEntry.error,
        })
        continue
      }
      config.mcpServers[normalizedEntry.value.name] =
        normalizedEntry.value.entry
    }
  }

  const registryServers = await buildConfiguredMcpIntegrationServerEntries(
    projectPath,
    backend,
  )
  if (Object.keys(registryServers.entries).length > 0) {
    config = config ?? { mcpServers: {} }
    for (const [name, entry] of Object.entries(registryServers.entries)) {
      if (config.mcpServers[name]) continue
      const normalizedEntry = normalizeMcpConfigEntry(name, entry)
      if (!normalizedEntry.ok) {
        logWarn("mcp-config", "invalid_registry_mcp_server_entry", {
          serverName: name,
          error: normalizedEntry.error,
        })
        continue
      }
      config.mcpServers[normalizedEntry.value.name] =
        normalizedEntry.value.entry
    }
  }

  if (!config || Object.keys(config.mcpServers).length === 0) {
    return null
  }

  return config
}

export async function prepareWorkspaceMcpConfig(
  workspace: string,
  projectPath?: string,
  backend?: WebSearchBackend,
): Promise<string | undefined> {
  const workspaceMcpPath = join(workspace, ".mcp.json")
  const config = await buildRuntimeMcpConfig(
    projectPath,
    workspaceMcpPath,
    backend,
  )
  if (!config) return undefined
  await writeFileAtomic(workspaceMcpPath, JSON.stringify(config, null, 2))
  const resolvedWs = resolve(workspaceMcpPath)
  mcpConfigCache.set(resolvedWs, config)
  try {
    mcpConfigMtimes.set(resolvedWs, (await stat(workspaceMcpPath)).mtimeMs)
  } catch {
    // stat may fail if the file was immediately removed; cache still valid
  }
  return workspaceMcpPath
}

export async function prepareTemporaryMcpConfig(
  projectPath?: string,
  backend?: WebSearchBackend,
): Promise<PreparedMcpConfigHandle> {
  const config = await buildRuntimeMcpConfig(projectPath, undefined, backend)
  if (!config) {
    return { path: undefined, cleanup: async () => undefined }
  }

  const tempDir = await mkdtemp(join(tmpdir(), "c8c-mcp-"))
  const mcpPath = join(tempDir, ".mcp.json")
  await writeFileAtomic(mcpPath, JSON.stringify(config, null, 2))
  const resolvedTmp = resolve(mcpPath)
  mcpConfigCache.set(resolvedTmp, config)
  try {
    mcpConfigMtimes.set(resolvedTmp, (await stat(mcpPath)).mtimeMs)
  } catch {
    // stat may fail if the file was immediately removed; cache still valid
  }
  return {
    path: mcpPath,
    cleanup: async () => {
      mcpConfigCache.delete(resolvedTmp)
      mcpConfigMtimes.delete(resolvedTmp)
      await rm(tempDir, { recursive: true, force: true })
    },
  }
}
