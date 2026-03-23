import type {
  ConfigureMcpIntegrationInput,
  McpIntegrationStatus,
  McpIntegrationTestResult,
} from "@shared/types"
import { listMcpServers } from "./mcp-manager"
import {
  buildConfiguredMcpIntegrationServerEntries,
  listMcpIntegrationRegistry,
  resolveMcpIntegrationRegistryEntry,
  resolveRequestedMcpIntegrationIds,
} from "./mcp-integration-registry"
import {
  loadMcpIntegrationKeyring,
  parseSecretsFromEnv,
  saveMcpIntegrationValues,
} from "./mcp-integration-keyring"

function resolveRequestedToolIds(
  integrationId: string,
  requestedToolIds: string[],
): string[] {
  return requestedToolIds.filter((toolId) => {
    const normalized = toolId.trim()
    if (!normalized) return false
    const entry = resolveMcpIntegrationRegistryEntry(integrationId)
    if (!entry) return false
    return (
      entry.info.id === normalized ||
      entry.info.toolIds.includes(normalized) ||
      Boolean(entry.aliases?.includes(normalized))
    )
  })
}

function resolveEnvKeyCount(envVars?: string[]): number {
  for (const envVar of envVars ?? []) {
    const keys = parseSecretsFromEnv(process.env[envVar])
    if (keys.length > 0) return keys.length
  }
  return 0
}

async function listConfiguredServerNames(
  projectPath?: string,
): Promise<Set<string>> {
  const servers = await listMcpServers(projectPath)
  return new Set(
    servers
      .filter((server) => !server.disabled)
      .map((server) => server.name.trim())
      .filter(Boolean),
  )
}

function toStatus(params: {
  integrationId: string
  requestedToolIds: string[]
  keyringPath: string
  keyCount: number
  envKeyCount: number
  serverConfigured: boolean
}): McpIntegrationStatus {
  const entry = resolveMcpIntegrationRegistryEntry(params.integrationId)
  if (!entry) {
    throw new Error(`Unknown MCP integration "${params.integrationId}".`)
  }

  const source = params.serverConfigured
    ? "server"
    : params.keyCount > 0
      ? "keyring"
      : params.envKeyCount > 0
        ? "env"
        : "none"

  return {
    integration: entry.info,
    configured: source !== "none",
    source,
    keyCount: params.keyCount > 0 ? params.keyCount : params.envKeyCount,
    keyringPath: params.keyringPath,
    requestedToolIds: params.requestedToolIds,
  }
}

export async function listMcpIntegrations(
  projectPath?: string,
): Promise<McpIntegrationStatus[]> {
  const { filePath, keyring } = await loadMcpIntegrationKeyring(projectPath)
  const serverNames = await listConfiguredServerNames(projectPath)

  return listMcpIntegrationRegistry().map((integration) =>
    toStatus({
      integrationId: integration.id,
      requestedToolIds: [],
      keyringPath: filePath,
      keyCount: keyring[integration.id]?.keys.length ?? 0,
      envKeyCount: resolveEnvKeyCount(
        resolveMcpIntegrationRegistryEntry(integration.id)?.authEnvVars,
      ),
      serverConfigured: serverNames.has(integration.id),
    }),
  )
}

export async function getMcpIntegrationStatuses(
  toolIds: string[],
  projectPath?: string,
): Promise<McpIntegrationStatus[]> {
  const requestedIntegrationIds = resolveRequestedMcpIntegrationIds(toolIds)
  if (requestedIntegrationIds.length === 0) return []

  const { filePath, keyring } = await loadMcpIntegrationKeyring(projectPath)
  const serverNames = await listConfiguredServerNames(projectPath)

  return requestedIntegrationIds.map((integrationId) =>
    toStatus({
      integrationId,
      requestedToolIds: resolveRequestedToolIds(integrationId, toolIds),
      keyringPath: filePath,
      keyCount: keyring[integrationId]?.keys.length ?? 0,
      envKeyCount: resolveEnvKeyCount(
        resolveMcpIntegrationRegistryEntry(integrationId)?.authEnvVars,
      ),
      serverConfigured: serverNames.has(integrationId),
    }),
  )
}

export async function configureMcpIntegration(
  integrationId: string,
  input: ConfigureMcpIntegrationInput,
  projectPath?: string,
): Promise<McpIntegrationStatus> {
  const entry = resolveMcpIntegrationRegistryEntry(integrationId)
  if (!entry) {
    throw new Error(`Unknown MCP integration "${integrationId}".`)
  }

  const primaryField = entry.info.fields[0]
  const secret = primaryField ? input.values[primaryField.id] : undefined
  const saved = await saveMcpIntegrationValues(
    integrationId,
    { secret },
    projectPath,
  )

  return toStatus({
    integrationId,
    requestedToolIds: [],
    keyringPath: saved.filePath,
    keyCount: saved.entry.keys.length,
    envKeyCount: 0,
    serverConfigured: false,
  })
}

export async function testMcpIntegration(
  integrationId: string,
  projectPath?: string,
): Promise<McpIntegrationTestResult> {
  const entry = resolveMcpIntegrationRegistryEntry(integrationId)
  if (!entry) {
    return {
      healthy: false,
      error: `Unknown MCP integration "${integrationId}".`,
    }
  }

  const statuses = await getMcpIntegrationStatuses([integrationId], projectPath)
  const status = statuses[0]
  if (!status?.configured) {
    return { healthy: false, error: `${entry.info.label} is not configured.` }
  }
  if (status.source === "server" || status.source === "env") {
    return { healthy: true }
  }

  const runtime = await buildConfiguredMcpIntegrationServerEntries(
    projectPath,
    integrationId === "exa" ? "exa" : "builtin",
  )
  if (
    entry.runtime.type !== "proxy_stdio" &&
    entry.runtime.type !== "stdio" &&
    entry.runtime.type !== "http" &&
    entry.runtime.type !== "sse"
  ) {
    return { healthy: false, error: "Unsupported integration runtime." }
  }

  const maybeRuntimeEntry = runtime.entries[integrationId] ?? undefined

  if (maybeRuntimeEntry === undefined) {
    return {
      healthy: false,
      error: `${entry.info.label} could not build a runtime connection.`,
    }
  }

  return { healthy: true }
}
