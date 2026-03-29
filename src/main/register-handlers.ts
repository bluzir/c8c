import { ipcMain } from "electron"
import type { BrowserWindow } from "electron"
import { registerIpcHandlers } from "./ipc/projects"
import { registerSkillsHandlers } from "./ipc/skills"
import { registerWorkflowsHandlers } from "./ipc/workflows"
import { registerExecutorHandlers } from "./ipc/executor"
import { registerLibrariesHandlers } from "./ipc/libraries"
import { registerPluginsHandlers } from "./ipc/plugins"
import { registerTemplateHandlers } from "./ipc/templates"
import {
  registerSystemHandlers,
  setDesktopRuntimeWindowProvider,
} from "./ipc/system"
import { registerChatHandlers } from "./ipc/chat"
import { registerChatsHandlers } from "./ipc/chats"
import { registerMcpHandlers } from "./ipc/mcp"
import { registerFilesHandlers } from "./ipc/files"
import { registerFactoryHandlers } from "./ipc/factory"
import { registerTestHarnessHandlers } from "./ipc/test-harness"
import { withGuardedIpcRegistration } from "./lib/ipc-guard"
import { isTestMode } from "./lib/runtime-paths"
import { errorMessage } from "./lib/error-utils"
import { logError, logInfo } from "./lib/structured-log"

export function registerMainHandlers(
  getMainWindow: () => BrowserWindow | null,
): void {
  setDesktopRuntimeWindowProvider(getMainWindow)

  const handlers = [
    ["projects", registerIpcHandlers],
    ["skills", registerSkillsHandlers],
    ["workflows", registerWorkflowsHandlers],
    ["executor", registerExecutorHandlers],
    ["libraries", registerLibrariesHandlers],
    ["plugins", registerPluginsHandlers],
    ["templates", registerTemplateHandlers],
    ["system", registerSystemHandlers],
    ["chat", registerChatHandlers],
    ["chats", registerChatsHandlers],
    ["mcp", registerMcpHandlers],
    ["files", registerFilesHandlers],
    ["factory", registerFactoryHandlers],
    ...(isTestMode()
      ? [["test-harness", registerTestHarnessHandlers] as const]
      : []),
  ] as const

  const failedDomains: string[] = []

  for (const [name, register] of handlers) {
    try {
      withGuardedIpcRegistration(ipcMain, register)
      logInfo("register-handlers", "domain_registered", { name })
    } catch (error) {
      failedDomains.push(name)
      logError("register-handlers", "domain_registration_failed", {
        name,
        error: errorMessage(error),
      })
    }
  }

  if (failedDomains.length > 0) {
    throw new Error(
      `Failed to register IPC handler domains: ${failedDomains.join(", ")}`,
    )
  }
}
