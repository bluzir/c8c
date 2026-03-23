import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  ProjectFactoryBlueprint,
  ProjectFactoryState,
} from "@shared/types"

const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>()

const allowedProjectRootsMock = vi.fn()
const assertWithinRootsMock = vi.fn()
const loadProjectFactoryBlueprintMock = vi.fn()
const saveProjectFactoryBlueprintMock = vi.fn()
const loadProjectFactoryStateMock = vi.fn()
const spawnFactoryCasesFromArtifactMock = vi.fn()

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        ipcHandlers.set(channel, handler)
      },
    ),
  },
}))

vi.mock("../lib/security-paths", () => ({
  allowedProjectRoots: (...args: any[]) => allowedProjectRootsMock(...args),
  assertWithinRoots: (...args: any[]) => assertWithinRootsMock(...args),
}))

vi.mock("../lib/project-factory-blueprint", () => ({
  loadProjectFactoryBlueprint: (...args: unknown[]) =>
    loadProjectFactoryBlueprintMock(...args),
  saveProjectFactoryBlueprint: (...args: unknown[]) =>
    saveProjectFactoryBlueprintMock(...args),
}))

vi.mock("../lib/project-factory-state", () => ({
  loadProjectFactoryState: (...args: unknown[]) =>
    loadProjectFactoryStateMock(...args),
  spawnFactoryCasesFromArtifact: (...args: unknown[]) =>
    spawnFactoryCasesFromArtifactMock(...args),
}))

describe("factory IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    ipcHandlers.clear()
    allowedProjectRootsMock.mockResolvedValue(["/tmp/project"])
    assertWithinRootsMock.mockImplementation((value: string) =>
      value.replace("/tmp/project/../project", "/tmp/project"),
    )
  })

  it("loads the project blueprint from a sanitized project path", async () => {
    const blueprint: ProjectFactoryBlueprint = {
      version: 2,
      projectPath: "/tmp/project",
      factories: [],
      createdAt: 1,
      updatedAt: 2,
    }
    loadProjectFactoryBlueprintMock.mockResolvedValue(blueprint)

    const { registerFactoryHandlers } = await import("./factory")
    registerFactoryHandlers()

    const handler = ipcHandlers.get("factory:load-blueprint") as
      | ((
          event: unknown,
          projectPath: string,
        ) => Promise<ProjectFactoryBlueprint | null>)
      | undefined
    expect(handler).toBeDefined()

    await expect(
      handler!(undefined, "/tmp/project/../project"),
    ).resolves.toEqual(blueprint)
    expect(loadProjectFactoryBlueprintMock).toHaveBeenCalledWith("/tmp/project")
  })

  it("saves blueprints and spawned cases under the sanitized project path", async () => {
    const state: ProjectFactoryState = {
      version: 1,
      projectPath: "/tmp/project",
      plannedCases: [],
      createdAt: 1,
      updatedAt: 2,
    }
    saveProjectFactoryBlueprintMock.mockResolvedValue({
      version: 2,
      projectPath: "/tmp/project",
      factories: [],
      createdAt: 1,
      updatedAt: 2,
    })
    spawnFactoryCasesFromArtifactMock.mockResolvedValue({
      state,
      plannedCases: [],
    })

    const { registerFactoryHandlers } = await import("./factory")
    registerFactoryHandlers()

    const saveHandler = ipcHandlers.get("factory:save-blueprint") as
      | ((
          event: unknown,
          input: { projectPath: string; blueprint: { factories: [] } },
        ) => Promise<ProjectFactoryBlueprint>)
      | undefined
    const spawnHandler = ipcHandlers.get(
      "factory:spawn-cases-from-artifact",
    ) as
      | ((
          event: unknown,
          input: { projectPath: string; factoryId: string; artifactId: string },
        ) => Promise<{ state: ProjectFactoryState; plannedCases: [] }>)
      | undefined

    expect(saveHandler).toBeDefined()
    expect(spawnHandler).toBeDefined()

    await saveHandler!(undefined, {
      projectPath: "/tmp/project/../project",
      blueprint: { factories: [] },
    })
    await spawnHandler!(undefined, {
      projectPath: "/tmp/project/../project",
      factoryId: "factory-1",
      artifactId: "artifact-1",
    })

    expect(saveProjectFactoryBlueprintMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectPath: "/tmp/project",
      }),
    )
    expect(spawnFactoryCasesFromArtifactMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectPath: "/tmp/project",
      }),
    )
  })
})
