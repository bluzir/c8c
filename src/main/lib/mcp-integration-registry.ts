import { existsSync } from "node:fs"
import { resolve } from "node:path"
import type {
  McpIntegrationInfo,
  McpIntegrationPostConfigureAction,
} from "@shared/types"
import type { WebSearchBackend } from "./mcp-config"
import {
  loadMcpIntegrationKeyring,
  parseSecretsFromEnv,
} from "./mcp-integration-keyring"

type RuntimeIntegrationBackend = WebSearchBackend

type IntegrationRuntimeSpec =
  | {
      type: "proxy_stdio"
      scriptName: string
      activation?: { webSearchBackend?: RuntimeIntegrationBackend }
    }
  | {
      type: "stdio"
      command: string
      args?: string[]
      env?: Record<string, string>
      authEnvVar?: string
      activation?: { webSearchBackend?: RuntimeIntegrationBackend }
    }
  | {
      type: "http" | "sse"
      url: string
      headers?: Record<string, string>
      authHeader?: { name: string; prefix?: string }
      activation?: { webSearchBackend?: RuntimeIntegrationBackend }
    }

interface McpIntegrationRegistryEntry {
  info: McpIntegrationInfo
  aliases?: string[]
  authEnvVars?: string[]
  runtime: IntegrationRuntimeSpec
}

function getProcessResourcesPath(): string | undefined {
  return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
}

function resolveProxyScriptPath(scriptName: string): string | undefined {
  const resourcesPath = getProcessResourcesPath()
  const candidates = [
    resolve(
      process.cwd(),
      `node_modules/@claude-tools/mcp-search-proxy/dist/${scriptName}.js`,
    ),
    resolve(
      process.cwd(),
      `packages/shared-claude-tools/packages/mcp-search-proxy/dist/${scriptName}.js`,
    ),
    resolve(
      resourcesPath || "",
      `app.asar.unpacked/node_modules/@claude-tools/mcp-search-proxy/dist/${scriptName}.js`,
    ),
  ]

  return candidates.find((candidate) => existsSync(candidate))
}

const MCP_INTEGRATION_REGISTRY: readonly McpIntegrationRegistryEntry[] = [
  {
    info: {
      id: "exa",
      label: "Exa Web Search",
      description:
        "Adds MCP-backed web search and page fetch for research-heavy flows.",
      toolIds: ["exa"],
      fields: [
        {
          id: "apiKey",
          label: "API key",
          kind: "secret",
          placeholder: "Paste your API key",
        },
      ],
      setupTitle: "Set up web search",
      setupDescription:
        "Add an API key so this flow can use MCP-backed web search before it runs.",
      postConfigure: {
        webSearchBackend: "exa",
      } satisfies McpIntegrationPostConfigureAction,
    },
    aliases: ["web_search"],
    authEnvVars: ["EXA_API_KEYS", "EXA_API_KEY"],
    runtime: {
      type: "proxy_stdio",
      scriptName: "exa",
      activation: {
        webSearchBackend: "exa",
      },
    },
  },
  {
    info: {
      id: "serper",
      label: "Serper Search",
      description:
        "Adds MCP-backed Google and Reddit search for research workflows.",
      toolIds: ["serper"],
      fields: [
        {
          id: "apiKey",
          label: "API key",
          kind: "secret",
          placeholder: "Paste your API key",
        },
      ],
      setupTitle: "Set up search",
      setupDescription:
        "Add an API key so flows that rely on Serper can query the web before they run.",
    },
    authEnvVars: ["SERPER_API_KEYS", "SERPER_API_KEY"],
    runtime: {
      type: "proxy_stdio",
      scriptName: "serper",
    },
  },
  {
    info: {
      id: "github",
      label: "GitHub",
      description: "Adds GitHub repository, issue, and PR context through MCP.",
      toolIds: ["github"],
      fields: [
        {
          id: "apiKey",
          label: "Access token",
          kind: "secret",
          placeholder: "Paste a personal access token",
        },
      ],
      setupTitle: "Connect GitHub",
      setupDescription:
        "Add a GitHub token so flows can read repository context through MCP.",
    },
    authEnvVars: ["GITHUB_TOKEN"],
    runtime: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      authEnvVar: "GITHUB_TOKEN",
    },
  },
  {
    info: {
      id: "linear",
      label: "Linear",
      description: "Adds Linear issues and project context through MCP.",
      toolIds: ["linear"],
      fields: [
        {
          id: "apiKey",
          label: "API key",
          kind: "secret",
          placeholder: "Paste a Linear API key",
        },
      ],
      setupTitle: "Connect Linear",
      setupDescription:
        "Add a Linear API key so flows can inspect issues and project state through MCP.",
    },
    authEnvVars: ["LINEAR_API_TOKEN"],
    runtime: {
      type: "http",
      url: "https://mcp.linear.app/sse",
      authHeader: {
        name: "Authorization",
        prefix: "Bearer ",
      },
    },
  },
] as const

export interface RuntimeMcpServerEntry {
  type?: "stdio" | "http" | "sse"
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  headers?: Record<string, string>
}

function matchesRequestedTool(
  entry: McpIntegrationRegistryEntry,
  toolId: string,
): boolean {
  const normalized = toolId.trim()
  if (!normalized) return false
  return (
    entry.info.id === normalized ||
    entry.info.toolIds.includes(normalized) ||
    Boolean(entry.aliases?.includes(normalized))
  )
}

export function listMcpIntegrationRegistry(): McpIntegrationInfo[] {
  return MCP_INTEGRATION_REGISTRY.map((entry) => entry.info)
}

export function resolveMcpIntegrationRegistryEntry(
  integrationId: string,
): McpIntegrationRegistryEntry | null {
  const normalized = integrationId.trim()
  return (
    MCP_INTEGRATION_REGISTRY.find((entry) => entry.info.id === normalized) ??
    null
  )
}

export function resolveRequestedMcpIntegrationIds(toolIds: string[]): string[] {
  const requested = toolIds.map((toolId) => toolId.trim()).filter(Boolean)

  const ids = new Set<string>()
  for (const toolId of requested) {
    for (const entry of MCP_INTEGRATION_REGISTRY) {
      if (matchesRequestedTool(entry, toolId)) {
        ids.add(entry.info.id)
      }
    }
  }

  return Array.from(ids)
}

function resolveIntegrationSecret(
  entry: McpIntegrationRegistryEntry,
  keyringEntry?: { keys: string[] },
): string | null {
  if (keyringEntry?.keys?.length) {
    return keyringEntry.keys[0] ?? null
  }
  for (const envVar of entry.authEnvVars ?? []) {
    const keys = parseSecretsFromEnv(process.env[envVar])
    if (keys.length > 0) return keys[0] ?? null
  }
  return null
}

function shouldActivateIntegration(
  entry: McpIntegrationRegistryEntry,
  backend?: RuntimeIntegrationBackend,
): boolean {
  const requiredBackend = entry.runtime.activation?.webSearchBackend
  return !requiredBackend || requiredBackend === backend
}

export async function buildConfiguredMcpIntegrationServerEntries(
  projectPath?: string,
  backend?: RuntimeIntegrationBackend,
): Promise<{
  keyringPath: string
  entries: Record<string, RuntimeMcpServerEntry>
}> {
  const { filePath, keyring } = await loadMcpIntegrationKeyring(projectPath)
  const entries: Record<string, RuntimeMcpServerEntry> = {}

  for (const entry of MCP_INTEGRATION_REGISTRY) {
    if (!shouldActivateIntegration(entry, backend)) continue
    const secret = resolveIntegrationSecret(entry, keyring[entry.info.id])
    if (!secret) continue

    if (entry.runtime.type === "proxy_stdio") {
      const proxyScriptPath = resolveProxyScriptPath(entry.runtime.scriptName)
      if (!proxyScriptPath) continue

      const env: Record<string, string> = {
        ELECTRON_RUN_AS_NODE: "1",
      }
      if (existsSync(filePath)) {
        env.MCP_KEYRING_PATH = filePath
      }

      entries[entry.info.id] = {
        type: "stdio",
        command: process.execPath,
        args: [proxyScriptPath],
        env,
      }
      continue
    }

    if (entry.runtime.type === "stdio") {
      const env = {
        ...(entry.runtime.env ?? {}),
        ...(entry.runtime.authEnvVar
          ? { [entry.runtime.authEnvVar]: secret }
          : {}),
      }
      entries[entry.info.id] = {
        type: "stdio",
        command: entry.runtime.command,
        args: entry.runtime.args,
        env: Object.keys(env).length > 0 ? env : undefined,
      }
      continue
    }

    const headers = {
      ...(entry.runtime.headers ?? {}),
      ...(entry.runtime.authHeader
        ? {
            [entry.runtime.authHeader.name]:
              `${entry.runtime.authHeader.prefix ?? ""}${secret}`,
          }
        : {}),
    }

    entries[entry.info.id] = {
      type: entry.runtime.type,
      url: entry.runtime.url,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    }
  }

  return {
    keyringPath: filePath,
    entries,
  }
}
