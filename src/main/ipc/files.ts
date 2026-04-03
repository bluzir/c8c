import { ipcMain, dialog, BrowserWindow } from "electron"
import { readdir, readFile, stat } from "node:fs/promises"
import { execFile } from "node:child_process"
import { join, resolve, relative, basename } from "node:path"
import {
  assertRegisteredProjectPath,
  assertWithinRoots,
  allowedReportRoots,
} from "../lib/security-paths"

const MAX_RESULTS = 500
const MAX_FILE_SIZE = 100 * 1024 // ~100KB

export async function gitLsFiles(
  projectPath: string,
  query?: string,
): Promise<string[]> {
  const safePath = await assertRegisteredProjectPath(projectPath)

  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard"],
      { cwd: safePath, maxBuffer: 4 * 1024 * 1024, timeout: 10_000 },
      (error, stdout) => {
        if (error) {
          reject(error)
          return
        }
        let files = stdout.split("\n").filter(Boolean)
        if (query) {
          const q = query.toLowerCase()
          files = files.filter((f) => f.toLowerCase().includes(q))
        }
        resolve(files.slice(0, MAX_RESULTS))
      },
    )
  })
}

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".c8c",
  ".next",
  "dist",
  "build",
  "__pycache__",
])

async function walkDir(
  base: string,
  dir: string,
  query: string | undefined,
  results: { name: string; relativePath: string }[],
): Promise<void> {
  if (results.length >= MAX_RESULTS) return
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (results.length >= MAX_RESULTS) return
    if (entry.name.startsWith(".") && entry.name !== ".claude") continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue
      await walkDir(base, fullPath, query, results)
    } else {
      const rel = relative(base, fullPath)
      if (query && !rel.toLowerCase().includes(query.toLowerCase())) continue
      results.push({ name: entry.name, relativePath: rel })
    }
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return "< 1 KB"
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function hasBinaryContent(buffer: Buffer): boolean {
  for (let i = 0; i < Math.min(buffer.length, 8192); i++) {
    if (buffer[i] === 0) return true
  }
  return false
}

export function registerFilesHandlers() {
  ipcMain.handle(
    "files:list-project",
    async (
      _e,
      projectPath: string,
      query?: string,
    ): Promise<{ name: string; relativePath: string }[]> => {
      const safePath = await assertRegisteredProjectPath(projectPath)

      try {
        const files = await gitLsFiles(safePath, query)
        return files.map((f) => {
          const parts = f.split("/")
          return { name: parts[parts.length - 1], relativePath: f }
        })
      } catch {
        // Not a git repo — fallback to recursive readdir
        const results: { name: string; relativePath: string }[] = []
        await walkDir(safePath, safePath, query, results)
        return results
      }
    },
  )

  ipcMain.handle(
    "files:read-content",
    async (
      _e,
      filePath: string,
      projectPath: string,
    ): Promise<{ content: string; truncated: boolean }> => {
      const safePath = await assertRegisteredProjectPath(projectPath)
      const resolvedFile = resolve(safePath, filePath)
      assertWithinRoots(resolvedFile, [safePath], "File path")

      const info = await stat(resolvedFile)
      const truncated = info.size > MAX_FILE_SIZE

      const readSize = Math.min(info.size, MAX_FILE_SIZE)
      const buf = Buffer.alloc(readSize)
      const { open } = await import("node:fs/promises")
      const fh = await open(resolvedFile, "r")
      try {
        await fh.read(buf, 0, readSize, 0)
      } finally {
        await fh.close()
      }

      if (hasBinaryContent(buf)) {
        return { content: "", truncated: false }
      }

      return { content: buf.toString("utf-8"), truncated }
    },
  )

  ipcMain.handle(
    "files:read-slice",
    async (
      _e,
      filePath: string,
      maxBytes: number,
    ): Promise<string | null> => {
      const resolvedFile = resolve(filePath)
      const reportRoots = await allowedReportRoots()
      assertWithinRoots(resolvedFile, reportRoots, "File slice path")

      const clampedMax = Math.min(Math.max(0, maxBytes), MAX_FILE_SIZE)
      try {
        const info = await stat(resolvedFile)
        const readSize = Math.min(info.size, clampedMax)
        const buf = Buffer.alloc(readSize)
        const { open } = await import("node:fs/promises")
        const fh = await open(resolvedFile, "r")
        try {
          await fh.read(buf, 0, readSize, 0)
        } finally {
          await fh.close()
        }
        if (hasBinaryContent(buf)) return null
        return buf.toString("utf-8")
      } catch {
        return null
      }
    },
  )

  ipcMain.handle(
    "dialog:open-file",
    async (): Promise<
      Array<{ path: string; name: string; sizeLabel: string }>
    > => {
      const win = BrowserWindow.getFocusedWindow()
      if (!win) return []

      const result = await dialog.showOpenDialog(win, {
        properties: ["openFile", "multiSelections"],
      })

      if (result.canceled || !result.filePaths.length) return []

      return Promise.all(
        result.filePaths.map(async (filePath) => {
          const stats = await stat(filePath)
          return {
            path: filePath,
            name: basename(filePath),
            sizeLabel: formatFileSize(stats.size),
          }
        }),
      )
    },
  )
}
