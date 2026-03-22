import type {
  McpMutationResult,
  McpProvider,
  McpServerInfo,
  McpServerScope,
  McpTestResult,
  McpToolInfo,
} from "@shared/types"
import { execCodex } from "../codex-cli"
import { errorMessage } from "./provider-utils"

interface CodexMcpTransport {
  type?: string
  url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  bearer_token_env_var?: string | null
  http_headers?: Record<string, string> | null
}

interface CodexMcpServer {
  name: string
  enabled?: boolean
  disabled_reason?: string | null
  transport?: CodexMcpTransport
  enabled_tools?: string[] | null
  disabled_tools?: string[] | null
}

function codexTransportType(transport?: CodexMcpTransport): McpServerInfo["type"] {
  if (!transport) return "stdio"
  if (transport.type === "streamable_http" || transport.type === "http") return "http"
  if (transport.type === "sse") return "sse"
  return "stdio"
}

export function codexServerToInfo(server: CodexMcpServer): McpServerInfo {
  return {
    name: server.name,
    provider: "codex",
    scope: "user",
    type: codexTransportType(server.transport),
    command: server.transport?.command,
    args: server.transport?.args,
    url: server.transport?.url,
    env: server.transport?.env,
    headers: server.transport?.http_headers || undefined,
    disabled: server.enabled === false,
  }
}

async function listCodexServers(): Promise<CodexMcpServer[]> {
  const { stdout } = await execCodex(["mcp", "list", "--json"], { timeout: 10_000 })
  const parsed = JSON.parse(stdout) as unknown
  return Array.isArray(parsed)
    ? parsed.filter((item): item is CodexMcpServer => Boolean(item && typeof item === "object"))
    : []
}

async function getCodexServer(name: string): Promise<CodexMcpServer> {
  const { stdout } = await execCodex(["mcp", "get", name, "--json"], { timeout: 10_000 })
  return JSON.parse(stdout) as CodexMcpServer
}

export class CodexMcpProvider implements McpProvider {
  readonly id = "codex" as const

  async listServers(scope?: McpServerScope): Promise<McpServerInfo[]> {
    if (scope && scope !== "user") return []
    const servers = await listCodexServers()
    return servers.map(codexServerToInfo)
  }

  listAllServers(): Promise<McpServerInfo[]> {
    return this.listServers()
  }

  async addServer(server: McpServerInfo, _projectPath?: string): Promise<McpMutationResult> {
    try {
      const args = ["mcp", "add", server.name]
      if (server.type === "stdio") {
        if (!server.command) {
          return { success: false, error: "command is required for stdio transport" }
        }
        for (const [key, value] of Object.entries(server.env || {})) {
          args.push("--env", `${key}=${value}`)
        }
        args.push("--")
        args.push(server.command)
        args.push(...(server.args || []))
      } else {
        args.push("--url", server.url || "")
      }

      await execCodex(args, { timeout: 15_000 })
      return { success: true }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  }

  async updateServer(name: string, server: McpServerInfo, _projectPath?: string): Promise<McpMutationResult> {
    const removed = await this.removeServer(name, server.scope, undefined)
    if (!removed.success) return removed
    return this.addServer(server, undefined)
  }

  async removeServer(name: string, _scope: McpServerScope, _projectPath?: string): Promise<McpMutationResult> {
    try {
      await execCodex(["mcp", "remove", name], { timeout: 10_000 })
      return { success: true }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  }

  async toggleServer(
    _name: string,
    _scope: McpServerScope,
    _disabled: boolean,
    _projectPath?: string,
  ): Promise<McpMutationResult> {
    return {
      success: false,
      error: "Codex CLI does not currently support enabling or disabling MCP servers in place. Remove or re-add the server instead.",
    }
  }

  async testServer(name: string, _scope: McpServerScope, _projectPath?: string): Promise<McpTestResult> {
    const startedAt = Date.now()
    try {
      const server = await getCodexServer(name)
      const tools = Array.isArray(server.enabled_tools)
        ? server.enabled_tools.map((toolName) => ({
            name: toolName,
            serverName: name,
            qualifiedName: `mcp__${name}__${toolName}`,
            provider: "codex" as const,
          }))
        : []

      return {
        healthy: server.enabled !== false,
        tools,
        latencyMs: Date.now() - startedAt,
      }
    } catch (error) {
      return {
        healthy: false,
        tools: [],
        error: errorMessage(error),
        latencyMs: Date.now() - startedAt,
      }
    }
  }

  async discoverTools(serverName?: string): Promise<McpToolInfo[]> {
    if (serverName) {
      return (await this.testServer(serverName, "user", undefined)).tools
    }

    const servers = await listCodexServers()
    const tools: McpToolInfo[] = []
    for (const server of servers) {
      if (!Array.isArray(server.enabled_tools)) continue
      for (const toolName of server.enabled_tools) {
        tools.push({
          name: toolName,
          serverName: server.name,
          qualifiedName: `mcp__${server.name}__${toolName}`,
          provider: "codex",
        })
      }
    }
    return tools
  }
}
