import { existsSync, readFileSync } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import type { ProviderId } from "@shared/types"
import { writeFileAtomic } from "./atomic-write"
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

function getProcessResourcesPath(): string | undefined {
  return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
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
  const cached = mcpConfigCache.get(resolve(filePath))
  if (cached) return cached
  try {
    const raw = await readFile(filePath, "utf-8")
    const parsed = JSON.parse(raw) as unknown
    const normalized = normalizeMcpConfig(parsed)
    if (normalized) {
      mcpConfigCache.set(resolve(filePath), normalized)
    }
    return normalized
  } catch {
    return null
  }
}

export function invalidateMcpConfigCache(filePath?: string): void {
  if (filePath) {
    mcpConfigCache.delete(resolve(filePath))
    return
  }
  mcpConfigCache.clear()
}

function findUpwards(
  startDir: string,
  relativePath: string,
): string | undefined {
  let dir = resolve(startDir)
  while (true) {
    const candidate = join(dir, relativePath)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

function resolveExaProxyScriptPath(): string | undefined {
  const resourcesPath = getProcessResourcesPath()
  const candidates = [
    resolve(
      process.cwd(),
      "node_modules/@claude-tools/mcp-search-proxy/dist/exa.js",
    ),
    resolve(
      process.cwd(),
      "packages/shared-claude-tools/packages/mcp-search-proxy/dist/exa.js",
    ),
    resolve(
      resourcesPath || "",
      "app.asar.unpacked/node_modules/@claude-tools/mcp-search-proxy/dist/exa.js",
    ),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

function resolveMcpKeyringPath(projectPath?: string): string | undefined {
  const fromEnv = process.env.MCP_KEYRING_PATH?.trim()
  if (fromEnv && existsSync(fromEnv)) return fromEnv

  const candidates: Array<string | undefined> = [
    projectPath
      ? findUpwards(projectPath, "data/config/mcp-keyring.json")
      : undefined,
    projectPath ? findUpwards(projectPath, "data/mcp-keyring.json") : undefined,
    findUpwards(process.cwd(), "data/config/mcp-keyring.json"),
    findUpwards(process.cwd(), "data/mcp-keyring.json"),
    resolve(process.cwd(), "../agents-os/data/config/mcp-keyring.json"),
    resolve(process.cwd(), "../agent-os/data/config/mcp-keyring.json"),
  ]

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return undefined
}

function withExaServer(config: McpConfig, projectPath?: string): McpConfig {
  const exaProxyPath = resolveExaProxyScriptPath()
  if (!exaProxyPath) return config

  const existing = config.mcpServers.exa
  const existingEnv = isObject(existing?.env)
    ? (existing?.env as Record<string, string>)
    : {}
  const keyringPath = resolveMcpKeyringPath(projectPath)
  const runtimeEnv: Record<string, string> = {
    ...existingEnv,
  }
  // In Electron main process, process.execPath points to the app binary.
  // Force Node mode so MCP proxy starts as a headless script process, not a GUI instance.
  runtimeEnv.ELECTRON_RUN_AS_NODE = "1"
  if (keyringPath) {
    runtimeEnv.MCP_KEYRING_PATH = keyringPath
  }

  config.mcpServers.exa = {
    type: "stdio",
    disabled: existing?.disabled,
    autoApprove: existing?.autoApprove,
    command: process.execPath,
    args: [exaProxyPath],
    env: runtimeEnv,
  }

  return config
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
  if (cached) return cached
  try {
    const raw = readFileSync(filePath, "utf-8")
    const normalized = normalizeMcpConfig(JSON.parse(raw) as unknown)
    if (normalized) {
      mcpConfigCache.set(resolvedPath, normalized)
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

  if (backend === "exa") {
    config = withExaServer(config ?? { mcpServers: {} }, projectPath)
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
  mcpConfigCache.set(resolve(workspaceMcpPath), config)
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
  mcpConfigCache.set(resolve(mcpPath), config)
  return {
    path: mcpPath,
    cleanup: async () => {
      mcpConfigCache.delete(resolve(mcpPath))
      await rm(tempDir, { recursive: true, force: true })
    },
  }
}
