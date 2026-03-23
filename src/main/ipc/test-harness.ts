import { ipcMain } from "electron"
import { mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { projectsConfigPath, saveProjectsConfig } from "../lib/projects-config"
import {
  resolveAppHomeDir,
  resolveAppUserDataDir,
  isPathWithin,
  isTestMode,
  shouldSuppressStartupSideEffects,
} from "../lib/runtime-paths"
import { ensureChainsDir } from "../lib/yaml-io"
import { windowStatePath } from "../window-state"

function assertTestModeEnabled() {
  if (!isTestMode()) {
    throw new Error("Test harness IPC is only available when C8C_TEST_MODE=1.")
  }
}

function assertSafeResetPath(path: string) {
  const resolvedPath = resolve(path)
  const tempRoot = resolve(tmpdir())
  if (isPathWithin(tempRoot, resolvedPath)) return
  if (resolvedPath.includes("c8c-test")) return
  throw new Error(`Refusing to reset non-test path: ${resolvedPath}`)
}

export function registerTestHarnessHandlers() {
  if (!isTestMode()) return

  ipcMain.handle("test-harness:get-environment", async () => {
    assertTestModeEnabled()
    const homeDir = resolveAppHomeDir()
    const userDataDir = resolveAppUserDataDir()
    return {
      testMode: true,
      homeDir,
      userDataDir,
      projectsConfigPath: projectsConfigPath(),
      chainsDir: await ensureChainsDir(),
      windowStatePath: windowStatePath(),
      startupSideEffectsSuppressed: shouldSuppressStartupSideEffects(),
    }
  })

  ipcMain.handle(
    "test-harness:seed-projects",
    async (
      _event,
      input: { projects: string[]; lastSelectedProject?: string | null },
    ) => {
      assertTestModeEnabled()
      const projects = [
        ...new Set(
          input.projects
            .filter(
              (value): value is string =>
                typeof value === "string" && value.trim().length > 0,
            )
            .map((value) => resolve(value)),
        ),
      ]
      await Promise.all(
        projects.map((projectPath) => mkdir(projectPath, { recursive: true })),
      )
      await saveProjectsConfig({
        projects,
        lastSelectedProject: input.lastSelectedProject
          ? resolve(input.lastSelectedProject)
          : undefined,
      })
      return true
    },
  )

  ipcMain.handle("test-harness:reset-persistent-state", async () => {
    assertTestModeEnabled()
    const paths = [...new Set([resolveAppHomeDir(), resolveAppUserDataDir()])]
    for (const path of paths) {
      assertSafeResetPath(path)
      await rm(path, { recursive: true, force: true })
    }
    return true
  })
}
