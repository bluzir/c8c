import { ipcMain, dialog, BrowserWindow, shell } from "electron"
import {
  loadChainYaml,
  saveChainYaml,
  listChains,
  listProjectWorkflows,
  ensureChainsDir,
} from "../lib/yaml-io"
import { loadChain, saveChain, listChainFiles } from "../lib/chain-io"
import { join, basename, dirname, extname, resolve } from "node:path"
import type { Workflow } from "@shared/types"
import {
  normalizeWorkflowTitle,
  toWorkflowFileStem,
} from "@shared/workflow-name"
import { moveChatHistory } from "../lib/chat-storage"
import {
  allowedWorkflowRoots,
  assertRegisteredProjectPath as assertRegisteredProjectRoot,
  assertWithinRoots,
} from "../lib/security-paths"

async function pathExists(path: string): Promise<boolean> {
  const { access } = await import("node:fs/promises")
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function uniqueWorkflowPath(
  dir: string,
  stem: string,
  extension: ".chain" | ".yaml" | ".yml",
): Promise<string> {
  const baseStem = stem || "flow"
  let index = 1
  let candidate = join(dir, `${baseStem}${extension}`)

  while (await pathExists(candidate)) {
    index += 1
    candidate = join(dir, `${baseStem}-${index}${extension}`)
  }

  return candidate
}

function assertSupportedWorkflowExtension(filePath: string): void {
  const extension = extname(filePath).toLowerCase()
  if (extension !== ".chain" && extension !== ".yaml" && extension !== ".yml") {
    throw new Error(`Unsupported flow file extension: ${extension || "(none)"}`)
  }
}

async function assertWorkflowFilePath(filePath: string): Promise<string> {
  const resolvedPath = resolve(filePath)
  assertSupportedWorkflowExtension(resolvedPath)
  const workflowRoots = await allowedWorkflowRoots()
  return assertWithinRoots(resolvedPath, workflowRoots, "Flow path")
}

function isOutsideAllowedWorkflowRootsError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("outside allowed directories")
}

function formatAllowedWorkflowRoots(roots: string[]): string {
  return roots.map((root) => `- ${root}`).join("\n")
}

async function withWorkflowRootGuidance<T>(
  actionLabel: string,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action()
  } catch (error) {
    if (!isOutsideAllowedWorkflowRootsError(error)) {
      throw error
    }
    const roots = await allowedWorkflowRoots()
    throw new Error(
      `${actionLabel} is limited to registered flow folders.\n\n`
      + `Allowed flow folders:\n${formatAllowedWorkflowRoots(roots)}\n\n`
      + "Move the flow file into one of these folders, or add/open the project first.",
    )
  }
}

function defaultWorkflowFilename(data: Workflow): string {
  const title = normalizeWorkflowTitle(data.name || "")
  return `${toWorkflowFileStem(title || "flow")}.chain`
}

async function saveWorkflowDefinition(
  filePath: string,
  data: Workflow,
): Promise<string> {
  if (filePath.endsWith(".chain")) {
    await saveChain(filePath, data)
    return filePath
  }

  await saveChainYaml(filePath, data)
  return filePath
}

async function assertRegisteredProjectPath(projectPath: string): Promise<string> {
  return assertRegisteredProjectRoot(projectPath)
}

export function registerWorkflowsHandlers() {
  ipcMain.handle("workflows:list-project", async (_e, projectPath: string) => {
    const safeProjectPath = await assertRegisteredProjectPath(projectPath)
    return listProjectWorkflows(safeProjectPath)
  })

  ipcMain.handle("workflows:list-global", async () => {
    const dir = await ensureChainsDir()
    const chains = await listChainFiles(dir)
    const yamls = await listChains()
    return [...chains, ...yamls].sort((a, b) => {
      const aTime = a.updatedAt ?? 0
      const bTime = b.updatedAt ?? 0
      if (aTime !== bTime) return bTime - aTime
      return a.name.localeCompare(b.name)
    })
  })

  ipcMain.handle("workflows:load", async (_e, filePath: string) => {
    const safeFilePath = await assertWorkflowFilePath(filePath)
    if (safeFilePath.endsWith(".chain")) {
      return loadChain(safeFilePath)
    } else {
      return loadChainYaml(safeFilePath)
    }
  })

  ipcMain.handle(
    "workflows:save",
    async (_e, filePath: string, data: Workflow) => {
      const safeFilePath = await assertWorkflowFilePath(filePath)
      return saveWorkflowDefinition(safeFilePath, data)
    },
  )

  ipcMain.handle(
    "workflows:save-as",
    async (_e, data: Workflow, projectPath?: string) => {
      return withWorkflowRootGuidance("Flow save destination", async () => {
        const window = BrowserWindow.getFocusedWindow()
        if (!window) return null

        const defaultDir = projectPath
          ? join(await assertRegisteredProjectPath(projectPath), ".c8c")
          : await ensureChainsDir()

        const result = await dialog.showSaveDialog(window, {
          title: "Save Flow As",
          defaultPath: join(defaultDir, defaultWorkflowFilename(data)),
          filters: [
            { name: "Chain Flow", extensions: ["chain"] },
            { name: "Workflow YAML", extensions: ["yaml", "yml"] },
          ],
        })

        if (result.canceled || !result.filePath) return null
        const safeFilePath = await assertWorkflowFilePath(result.filePath)
        return saveWorkflowDefinition(safeFilePath, data)
      })
    },
  )

  ipcMain.handle(
    "workflows:export-copy",
    async (_e, data: Workflow, projectPath?: string) => {
      return withWorkflowRootGuidance("Flow export destination", async () => {
        const window = BrowserWindow.getFocusedWindow()
        if (!window) return null

        const defaultDir = projectPath
          ? join(await assertRegisteredProjectPath(projectPath), ".c8c")
          : await ensureChainsDir()

        const result = await dialog.showSaveDialog(window, {
          title: "Export Flow Copy",
          defaultPath: join(defaultDir, defaultWorkflowFilename(data)),
          filters: [
            { name: "Chain Flow", extensions: ["chain"] },
            { name: "Workflow YAML", extensions: ["yaml", "yml"] },
          ],
        })

        if (result.canceled || !result.filePath) return null
        const safeFilePath = await assertWorkflowFilePath(result.filePath)
        return saveWorkflowDefinition(safeFilePath, data)
      })
    },
  )

  ipcMain.handle("workflows:open-file", async () => {
    return withWorkflowRootGuidance("Flow import", async () => {
      const window = BrowserWindow.getFocusedWindow()
      if (!window) return null

      const result = await dialog.showOpenDialog(window, {
        title: "Open Flow",
        filters: [{ name: "Flows", extensions: ["chain", "yaml", "yml"] }],
        properties: ["openFile"],
      })

      if (result.canceled || !result.filePaths[0]) return null
      const safeFilePath = await assertWorkflowFilePath(result.filePaths[0])

      let chain: Workflow
      if (safeFilePath.endsWith(".chain")) {
        chain = await loadChain(safeFilePath)
      } else {
        chain = await loadChainYaml(safeFilePath)
      }

      return { filePath: safeFilePath, chain }
    })
  })

  ipcMain.handle(
    "workflows:create",
    async (_e, projectPath: string, name: string, data: Workflow) => {
      const { mkdir } = await import("node:fs/promises")
      const safeProjectPath = await assertRegisteredProjectPath(projectPath)
      const dir = join(safeProjectPath, ".c8c")
      await mkdir(dir, { recursive: true })
      const normalizedTitle = normalizeWorkflowTitle(data.name || name)
      const fileStem = toWorkflowFileStem(name || normalizedTitle)
      const filePath = await uniqueWorkflowPath(dir, fileStem, ".chain")
      await saveChain(filePath, {
        ...data,
        name: normalizedTitle || data.name || name,
      })
      return filePath
    },
  )

  ipcMain.handle(
    "workflows:rename",
    async (_e, filePath: string, nextTitle: string) => {
      const { rename, unlink } = await import("node:fs/promises")
      const safeFilePath = await assertWorkflowFilePath(filePath)
      const dir = dirname(safeFilePath)
      const extension = extname(safeFilePath).toLowerCase()

      const normalizedTitle = normalizeWorkflowTitle(nextTitle)
      if (!normalizedTitle) {
        throw new Error("Flow name cannot be empty")
      }

      const destinationPath = join(
        dir,
        `${toWorkflowFileStem(normalizedTitle)}.chain`,
      )
      await assertWorkflowFilePath(destinationPath)
      if (destinationPath !== safeFilePath && (await pathExists(destinationPath))) {
        throw new Error(`Flow "${normalizedTitle}" already exists`)
      }

      if (extension === ".chain") {
        if (destinationPath !== safeFilePath) {
          await rename(safeFilePath, destinationPath)
          await moveChatHistory(safeFilePath, destinationPath)
        }
        const workflow = await loadChain(destinationPath)
        await saveChain(destinationPath, { ...workflow, name: normalizedTitle })
      } else {
        const workflow = await loadChainYaml(safeFilePath)
        await saveChain(destinationPath, { ...workflow, name: normalizedTitle })
        await moveChatHistory(safeFilePath, destinationPath)
        await unlink(safeFilePath)
      }

      return destinationPath
    },
  )

  ipcMain.handle("workflows:duplicate", async (_e, filePath: string) => {
    const safeFilePath = await assertWorkflowFilePath(filePath)
    const dir = dirname(safeFilePath)
    const extension = extname(safeFilePath).toLowerCase() as ".chain" | ".yaml" | ".yml"

    if (extension === ".chain") {
      const workflow = await loadChain(safeFilePath)
      const originalName = workflow.name || basename(safeFilePath, extension)
      const copyName = `${originalName}-copy`
      const copyStem = toWorkflowFileStem(copyName)
      const destPath = await uniqueWorkflowPath(dir, copyStem, extension)
      await saveChain(destPath, { ...workflow, name: copyName })
      return destPath
    } else {
      const workflow = await loadChainYaml(safeFilePath)
      const originalName = basename(safeFilePath).replace(/\.(yaml|yml)$/, "")
      const copyName = `${originalName}-copy`
      const copyStem = toWorkflowFileStem(copyName)
      const destPath = await uniqueWorkflowPath(dir, copyStem, ".chain")
      await saveChain(destPath, { ...workflow, name: copyName })
      return destPath
    }
  })

  ipcMain.handle("workflows:delete", async (_e, filePath: string) => {
    const safeFilePath = await assertWorkflowFilePath(filePath)
    try {
      await shell.trashItem(safeFilePath)
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === "EPERM" || code === "EACCES") {
        throw new Error("This flow file is read-only and can't be deleted.")
      }
      if (code === "ENOENT") {
        throw new Error("This flow was already deleted.")
      }
      throw error
    }
  })
}
