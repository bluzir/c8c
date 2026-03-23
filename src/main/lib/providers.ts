import type { AgentProvider, McpProvider, ProviderId } from "@shared/types"
import { ClaudeAgentProvider } from "./providers/claude-agent-provider"
import { ClaudeMcpProvider } from "./providers/claude-mcp-provider"
import { CodexAgentProvider } from "./providers/codex-agent-provider"
import { CodexMcpProvider } from "./providers/codex-mcp-provider"

const claudeAgentProvider = new ClaudeAgentProvider()
const codexAgentProvider = new CodexAgentProvider()
const claudeMcpProvider = new ClaudeMcpProvider()
const codexMcpProvider = new CodexMcpProvider()

export function resolveAgentProvider(providerId: ProviderId): AgentProvider {
  if (providerId === "claude") return claudeAgentProvider
  if (providerId === "codex") return codexAgentProvider
  throw new Error(`Agent provider "${providerId}" is not implemented.`)
}

export function resolveMcpProvider(providerId: ProviderId): McpProvider {
  if (providerId === "claude") return claudeMcpProvider
  if (providerId === "codex") return codexMcpProvider
  throw new Error(`MCP provider "${providerId}" is not implemented.`)
}
