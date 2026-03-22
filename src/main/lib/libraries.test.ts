import { access, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let appHomeDir = ""

vi.mock("./runtime-paths", () => ({
  resolveAppHomeDir: () => appHomeDir,
}))

describe("libraries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(async () => {
    if (appHomeDir) {
      await rm(appHomeDir, { recursive: true, force: true })
      appHomeDir = ""
    }
  })

  it("removes installed libraries inside the managed libraries root", async () => {
    appHomeDir = await mkdtemp(join(tmpdir(), "libraries-test-"))

    const { ensureLibrariesDir, removeLibrary } = await import("./libraries")
    const librariesRoot = await ensureLibrariesDir()
    const installedLibraryDir = join(librariesRoot, "anthropic-skills")
    await mkdir(installedLibraryDir, { recursive: true })

    await removeLibrary("anthropic-skills")

    await expect(access(installedLibraryDir)).rejects.toThrow()
  })

  it("rejects path traversal when removing libraries", async () => {
    appHomeDir = await mkdtemp(join(tmpdir(), "libraries-test-"))

    const { removeLibrary } = await import("./libraries")

    await expect(removeLibrary("../escape")).rejects.toThrow(
      "Library path is outside allowed directories",
    )
  })
})
