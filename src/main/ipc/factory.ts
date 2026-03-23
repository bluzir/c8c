import { ipcMain } from "electron"
import type {
  ProjectFactoryBlueprint,
  ProjectFactoryState,
  SaveProjectFactoryBlueprintInput,
  SpawnFactoryCasesFromArtifactInput,
  SpawnFactoryCasesFromArtifactResult,
} from "@shared/types"
import { resolve } from "node:path"
import { allowedProjectRoots, assertWithinRoots } from "../lib/security-paths"
import {
  loadProjectFactoryBlueprint,
  saveProjectFactoryBlueprint,
} from "../lib/project-factory-blueprint"
import {
  loadProjectFactoryState,
  spawnFactoryCasesFromArtifact,
} from "../lib/project-factory-state"

async function assertProjectPath(projectPath: string): Promise<string> {
  const projectRoots = await allowedProjectRoots()
  return assertWithinRoots(resolve(projectPath), projectRoots, "Project path")
}

export function registerFactoryHandlers() {
  ipcMain.handle(
    "factory:load-blueprint",
    async (
      _event,
      projectPath: string,
    ): Promise<ProjectFactoryBlueprint | null> => {
      const safeProjectPath = await assertProjectPath(projectPath)
      return loadProjectFactoryBlueprint(safeProjectPath)
    },
  )

  ipcMain.handle(
    "factory:save-blueprint",
    async (
      _event,
      input: SaveProjectFactoryBlueprintInput,
    ): Promise<ProjectFactoryBlueprint> => {
      const safeProjectPath = await assertProjectPath(input.projectPath)
      return saveProjectFactoryBlueprint({
        ...input,
        projectPath: safeProjectPath,
      })
    },
  )

  ipcMain.handle(
    "factory:load-state",
    async (_event, projectPath: string): Promise<ProjectFactoryState> => {
      const safeProjectPath = await assertProjectPath(projectPath)
      return loadProjectFactoryState(safeProjectPath)
    },
  )

  ipcMain.handle(
    "factory:spawn-cases-from-artifact",
    async (
      _event,
      input: SpawnFactoryCasesFromArtifactInput,
    ): Promise<SpawnFactoryCasesFromArtifactResult> => {
      const safeProjectPath = await assertProjectPath(input.projectPath)
      return spawnFactoryCasesFromArtifact({
        ...input,
        projectPath: safeProjectPath,
      })
    },
  )
}
