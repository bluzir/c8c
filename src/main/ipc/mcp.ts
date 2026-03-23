import { ipcMain } from "electron"
import { resolve } from "node:path"
import type { McpServerInfo, McpServerScope, ProviderId } from "@shared/types"
import {
  validateMcpServerInfo,
  validateMcpServerName,
  validateMcpServerScope,
} from "../lib/mcp-validation"
import { listPluginMcpServers } from "../lib/plugin-mcp"
import { setPluginMcpServerApproved } from "../lib/plugins"
import { resolveMcpProvider } from "../lib/providers"
import { allowedProjectRoots, assertWithinRoots } from "../lib/security-paths"
import { logWarn } from "../lib/structured-log"
import { errorMessage } from "../lib/error-utils"

function scopeRequiresProjectPath(scope: McpServerScope): boolean {
  return scope === "local" || scope === "project"
}

async function assertProjectPath(projectPath: string): Promise<string> {
  const allowedRoots = await allowedProjectRoots()
  return assertWithinRoots(resolve(projectPath), allowedRoots, "Project path")
}

async function resolveOptionalProjectPath(
  projectPath: string | undefined,
  action: string,
): Promise<string | undefined> {
  if (!projectPath) return undefined
  try {
    return await assertProjectPath(projectPath)
  } catch (error) {
    logWarn("mcp-ipc", "project_path_validation_failed", {
      action,
      projectPath,
      error: errorMessage(error),
    })
    throw error
  }
}

async function resolveScopedProjectPath(
  scope: McpServerScope,
  projectPath: string | undefined,
  action: string,
): Promise<string | undefined> {
  if (!projectPath && scopeRequiresProjectPath(scope)) {
    const error = new Error(`Project path required for ${scope} scope.`)
    logWarn("mcp-ipc", "project_path_required", {
      action,
      scope,
    })
    throw error
  }
  return resolveOptionalProjectPath(projectPath, action)
}

function invalidMutation(error: string): { success: false; error: string } {
  return { success: false, error }
}

export function registerMcpHandlers() {
  ipcMain.handle(
    "mcp:list-servers",
    async (_event, provider: ProviderId, projectPath?: string) => {
      try {
        const safeProjectPath = await resolveOptionalProjectPath(
          projectPath,
          "mcp:list-servers",
        )
        return resolveMcpProvider(provider).listServers(
          undefined,
          safeProjectPath,
        )
      } catch {
        return []
      }
    },
  )

  ipcMain.handle(
    "mcp:list-all-servers",
    async (_event, provider: ProviderId) => {
      try {
        return resolveMcpProvider(provider).listAllServers?.() ?? []
      } catch {
        return []
      }
    },
  )

  ipcMain.handle("mcp:list-plugin-servers", async () => {
    return listPluginMcpServers()
  })

  ipcMain.handle(
    "mcp:add-server",
    async (
      _event,
      provider: ProviderId,
      server: McpServerInfo,
      projectPath?: string,
    ) => {
      const validatedServer = validateMcpServerInfo(server)
      if (!validatedServer.ok) {
        return invalidMutation(validatedServer.error)
      }

      try {
        const safeProjectPath = await resolveScopedProjectPath(
          validatedServer.value.scope,
          projectPath ?? validatedServer.value.projectPath,
          "mcp:add-server",
        )
        return resolveMcpProvider(provider).addServer(
          validatedServer.value,
          safeProjectPath,
        )
      } catch (error) {
        return invalidMutation(errorMessage(error))
      }
    },
  )

  ipcMain.handle(
    "mcp:update-server",
    async (
      _event,
      provider: ProviderId,
      name: string,
      server: McpServerInfo,
      projectPath?: string,
    ) => {
      const normalizedName = validateMcpServerName(name)
      if (!normalizedName.ok) {
        return invalidMutation(normalizedName.error)
      }

      const validatedServer = validateMcpServerInfo(server)
      if (!validatedServer.ok) {
        return invalidMutation(validatedServer.error)
      }

      const mcpProvider = resolveMcpProvider(provider)
      if (!mcpProvider.updateServer) {
        throw new Error("MCP provider does not support server updates.")
      }

      try {
        const safeProjectPath = await resolveScopedProjectPath(
          validatedServer.value.scope,
          projectPath ?? validatedServer.value.projectPath,
          "mcp:update-server",
        )
        return mcpProvider.updateServer(
          normalizedName.value,
          validatedServer.value,
          safeProjectPath,
        )
      } catch (error) {
        return invalidMutation(errorMessage(error))
      }
    },
  )

  ipcMain.handle(
    "mcp:remove-server",
    async (
      _event,
      provider: ProviderId,
      name: string,
      scope: McpServerScope,
      projectPath?: string,
    ) => {
      const normalizedName = validateMcpServerName(name)
      if (!normalizedName.ok) {
        return invalidMutation(normalizedName.error)
      }
      const normalizedScope = validateMcpServerScope(scope)
      if (!normalizedScope.ok) {
        return invalidMutation(normalizedScope.error)
      }

      try {
        const safeProjectPath = await resolveScopedProjectPath(
          normalizedScope.value,
          projectPath,
          "mcp:remove-server",
        )
        return resolveMcpProvider(provider).removeServer(
          normalizedName.value,
          normalizedScope.value,
          safeProjectPath,
        )
      } catch (error) {
        return invalidMutation(errorMessage(error))
      }
    },
  )

  ipcMain.handle(
    "mcp:toggle-server",
    async (
      _event,
      provider: ProviderId,
      name: string,
      scope: McpServerScope,
      disabled: boolean,
      projectPath?: string,
    ) => {
      const normalizedName = validateMcpServerName(name)
      if (!normalizedName.ok) {
        return invalidMutation(normalizedName.error)
      }
      const normalizedScope = validateMcpServerScope(scope)
      if (!normalizedScope.ok) {
        return invalidMutation(normalizedScope.error)
      }

      try {
        const safeProjectPath = await resolveScopedProjectPath(
          normalizedScope.value,
          projectPath,
          "mcp:toggle-server",
        )
        return resolveMcpProvider(provider).toggleServer(
          normalizedName.value,
          normalizedScope.value,
          disabled,
          safeProjectPath,
        )
      } catch (error) {
        return invalidMutation(errorMessage(error))
      }
    },
  )

  ipcMain.handle(
    "mcp:test-server",
    async (
      _event,
      provider: ProviderId,
      name: string,
      scope: McpServerScope,
      projectPath?: string,
    ) => {
      const normalizedName = validateMcpServerName(name)
      if (!normalizedName.ok) {
        return {
          healthy: false,
          tools: [],
          error: normalizedName.error,
          latencyMs: 0,
        }
      }
      const normalizedScope = validateMcpServerScope(scope)
      if (!normalizedScope.ok) {
        return {
          healthy: false,
          tools: [],
          error: normalizedScope.error,
          latencyMs: 0,
        }
      }

      try {
        const safeProjectPath = await resolveScopedProjectPath(
          normalizedScope.value,
          projectPath,
          "mcp:test-server",
        )
        return resolveMcpProvider(provider).testServer(
          normalizedName.value,
          normalizedScope.value,
          safeProjectPath,
        )
      } catch (error) {
        return {
          healthy: false,
          tools: [],
          error: errorMessage(error),
          latencyMs: 0,
        }
      }
    },
  )

  ipcMain.handle(
    "mcp:discover-tools",
    async (
      _event,
      provider: ProviderId,
      serverName?: string,
      projectPath?: string,
    ) => {
      if (serverName !== undefined) {
        const normalizedName = validateMcpServerName(serverName)
        if (!normalizedName.ok) {
          return []
        }
        serverName = normalizedName.value
      }

      try {
        const safeProjectPath = await resolveOptionalProjectPath(
          projectPath,
          "mcp:discover-tools",
        )
        return resolveMcpProvider(provider).discoverTools(
          serverName,
          safeProjectPath,
        )
      } catch {
        return []
      }
    },
  )

  ipcMain.handle(
    "mcp:set-plugin-server-approved",
    async (_event, serverId: string, approved: boolean) => {
      return setPluginMcpServerApproved(serverId, approved)
    },
  )
}
