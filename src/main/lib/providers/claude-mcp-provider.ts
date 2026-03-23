import type {
  McpMutationResult,
  McpProvider,
  McpServerInfo,
  McpServerScope,
  McpTestResult,
  McpToolInfo,
} from "@shared/types"
import {
  addMcpServer,
  discoverMcpTools,
  listAllMcpServers,
  listMcpServers,
  removeMcpServer,
  testMcpServer,
  toggleMcpServer,
  updateMcpServer,
} from "../mcp-manager"

export class ClaudeMcpProvider implements McpProvider {
  readonly id = "claude" as const

  async listServers(
    scope?: McpServerScope,
    projectPath?: string,
  ): Promise<McpServerInfo[]> {
    const servers = await listMcpServers(projectPath)
    const withProvider = servers.map((server) => ({
      ...server,
      provider: "claude" as const,
    }))
    return scope
      ? withProvider.filter((server) => server.scope === scope)
      : withProvider
  }

  async listAllServers(): Promise<McpServerInfo[]> {
    const servers = await listAllMcpServers()
    return servers.map((server) => ({ ...server, provider: "claude" as const }))
  }

  addServer(
    server: McpServerInfo,
    projectPath?: string,
  ): Promise<McpMutationResult> {
    return addMcpServer(server, projectPath)
  }

  updateServer(
    name: string,
    server: McpServerInfo,
    projectPath?: string,
  ): Promise<McpMutationResult> {
    return updateMcpServer(name, server, projectPath)
  }

  removeServer(
    name: string,
    scope: McpServerScope,
    projectPath?: string,
  ): Promise<McpMutationResult> {
    return removeMcpServer(name, scope, projectPath)
  }

  toggleServer(
    name: string,
    scope: McpServerScope,
    disabled: boolean,
    projectPath?: string,
  ): Promise<McpMutationResult> {
    return toggleMcpServer(name, scope, disabled, projectPath)
  }

  testServer(
    name: string,
    scope: McpServerScope,
    projectPath?: string,
  ): Promise<McpTestResult> {
    return testMcpServer(name, scope, projectPath)
  }

  async discoverTools(
    serverName?: string,
    projectPath?: string,
  ): Promise<McpToolInfo[]> {
    const tools = await discoverMcpTools(serverName, projectPath)
    return tools.map((tool) => ({ ...tool, provider: "claude" as const }))
  }
}
