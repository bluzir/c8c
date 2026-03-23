import { ipcMain, dialog, BrowserWindow } from "electron"
import { mergeProjectOrderWithCurrent } from "@shared/project-order"
import { errorMessage } from "../lib/error-utils"
import { loadProjectsConfig, saveProjectsConfig } from "../lib/projects-config"
import { logInfo, logWarn } from "../lib/structured-log"

let configMutationQueue: Promise<unknown> = Promise.resolve()

function runSerializedConfigOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const next = configMutationQueue.then(() => operation())
  configMutationQueue = next.catch((error) => {
    logWarn("projects-ipc", "serialized_config_operation_failed", {
      error: errorMessage(error),
    })
  })
  return next
}

export function registerIpcHandlers() {
  ipcMain.handle("projects:list", async () => {
    const config = await runSerializedConfigOperation(() =>
      loadProjectsConfig(),
    )
    return config.projects
  })

  ipcMain.handle("projects:add", async () => {
    const window =
      BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    const result = window
      ? await dialog.showOpenDialog(window, {
          properties: ["openDirectory"],
          title: "Add Project Folder",
        })
      : await dialog.showOpenDialog({
          properties: ["openDirectory"],
          title: "Add Project Folder",
        })
    if (result.canceled || !result.filePaths[0]) return null
    const dir = result.filePaths[0]
    await runSerializedConfigOperation(async () => {
      const config = await loadProjectsConfig()
      if (!config.projects.includes(dir)) {
        config.projects.push(dir)
        await saveProjectsConfig(config)
        logInfo("projects-ipc", "project_added", { path: dir })
      }
    })
    return dir
  })

  ipcMain.handle("projects:remove", async (_e, path: string) => {
    await runSerializedConfigOperation(async () => {
      const config = await loadProjectsConfig()
      config.projects = config.projects.filter((p) => p !== path)
      if (config.lastSelectedProject === path) {
        config.lastSelectedProject = undefined
      }
      await saveProjectsConfig(config)
      logInfo("projects-ipc", "project_removed", { path })
    })
  })

  ipcMain.handle("projects:reorder", async (_e, requestedOrder: string[]) => {
    return runSerializedConfigOperation(async () => {
      const config = await loadProjectsConfig()
      config.projects = mergeProjectOrderWithCurrent(
        config.projects,
        requestedOrder,
      )
      await saveProjectsConfig(config)
      logInfo("projects-ipc", "projects_reordered", {
        projectCount: config.projects.length,
      })
      return config.projects
    })
  })

  ipcMain.handle("projects:set-selected", async (_e, path: string) => {
    await runSerializedConfigOperation(async () => {
      const config = await loadProjectsConfig()
      config.lastSelectedProject = path
      await saveProjectsConfig(config)
      logInfo("projects-ipc", "project_selected", { path })
    })
  })

  ipcMain.handle("projects:get-selected", async () => {
    const config = await runSerializedConfigOperation(() =>
      loadProjectsConfig(),
    )
    return config.lastSelectedProject || null
  })
}
