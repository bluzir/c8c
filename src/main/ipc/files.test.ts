import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>()
const allowedProjectRootsMock = vi.fn<() => Promise<string[]>>()
const assertWithinRootsMock = vi.fn()
const execFileMock = vi.fn()

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler)
    }),
  },
}))

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}))

vi.mock("../lib/security-paths", () => ({
  allowedProjectRoots: (...args: unknown[]) => allowedProjectRootsMock(...args),
  assertWithinRoots: (...args: unknown[]) => assertWithinRootsMock(...args),
}))

describe("files IPC", () => {
  let projectDir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    ipcHandlers.clear()
    projectDir = await mkdtemp(join(tmpdir(), "files-ipc-project-"))
    allowedProjectRootsMock.mockResolvedValue([projectDir])
    assertWithinRootsMock.mockImplementation((value: string) => value)
  })

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  it("validates project paths inside gitLsFiles before invoking git", async () => {
    const { gitLsFiles } = await import("./files")

    await expect(gitLsFiles("/tmp/not-registered")).rejects.toThrow("Project path is not registered")
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it("lists git-tracked files for safe project paths", async () => {
    execFileMock.mockImplementation((
      _command: string,
      _args: string[],
      _options: Record<string, unknown>,
      callback: (error: Error | null, stdout: string) => void,
    ) => {
      callback(null, "src/index.ts\nREADME.md\n")
    })

    const { gitLsFiles } = await import("./files")
    const files = await gitLsFiles(projectDir, "read")

    expect(execFileMock).toHaveBeenCalledTimes(1)
    expect(files).toEqual(["README.md"])
  })

  it("falls back to recursive directory walking when git listing fails", async () => {
    await mkdir(join(projectDir, "src"), { recursive: true })
    await mkdir(join(projectDir, "node_modules"), { recursive: true })
    await writeFile(join(projectDir, "README.md"), "# readme\n", "utf8")
    await writeFile(join(projectDir, "src", "app.ts"), "export {}\n", "utf8")
    await writeFile(join(projectDir, "node_modules", "skip.js"), "module.exports = {}\n", "utf8")

    execFileMock.mockImplementation((
      _command: string,
      _args: string[],
      _options: Record<string, unknown>,
      callback: (error: Error | null, stdout: string) => void,
    ) => {
      callback(new Error("not a git repo"), "")
    })

    const { registerFilesHandlers } = await import("./files")
    registerFilesHandlers()

    const listProjectHandler = ipcHandlers.get("files:list-project") as
      | ((event: unknown, projectPath: string, query?: string) => Promise<Array<{ name: string; relativePath: string }>>)
      | undefined

    expect(listProjectHandler).toBeDefined()

    const files = await listProjectHandler!(undefined, projectDir, "app")

    expect(files).toEqual([
      { name: "app.ts", relativePath: "src/app.ts" },
    ])
  })
})
