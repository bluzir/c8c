import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Workflow } from "@shared/types"

const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>()

const loadChainYamlMock = vi.fn()
const saveChainYamlMock = vi.fn()
const loadChainMock = vi.fn()
const saveChainMock = vi.fn()
const moveChatHistoryMock = vi.fn()
const allowedWorkflowRootsMock = vi.fn<() => Promise<string[]>>()
const assertRegisteredProjectPathMock =
  vi.fn<(projectPath: string) => Promise<string>>()
const assertWithinRootsMock = vi.fn((candidatePath: string) => candidatePath)

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        ipcHandlers.set(channel, handler)
      },
    ),
  },
  dialog: {
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn(),
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
  },
  shell: {
    trashItem: vi.fn(),
    openExternal: vi.fn(),
  },
}))

vi.mock("../lib/yaml-io", () => ({
  loadChainYaml: (...args: unknown[]) => loadChainYamlMock(...args),
  saveChainYaml: (...args: unknown[]) => saveChainYamlMock(...args),
  listChains: vi.fn(),
  listProjectWorkflows: vi.fn(),
  ensureChainsDir: vi.fn(async () => "/flows"),
}))

vi.mock("../lib/chain-io", () => ({
  loadChain: (...args: unknown[]) => loadChainMock(...args),
  saveChain: (...args: unknown[]) => saveChainMock(...args),
  listChainFiles: vi.fn(),
}))

vi.mock("../lib/chat-storage", () => ({
  moveChatHistory: (...args: unknown[]) => moveChatHistoryMock(...args),
}))

vi.mock("../lib/security-paths", () => ({
  assertRegisteredProjectPath: (...args: unknown[]) =>
    assertRegisteredProjectPathMock(...args),
  allowedWorkflowRoots: (...args: unknown[]) =>
    allowedWorkflowRootsMock(...args),
  assertWithinRoots: (...args: unknown[]) => assertWithinRootsMock(...args),
}))

describe("workflows IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    ipcHandlers.clear()
    allowedWorkflowRootsMock.mockResolvedValue(["/flows"])
    assertRegisteredProjectPathMock.mockImplementation(
      async (projectPath: string) => projectPath,
    )
    assertWithinRootsMock.mockImplementation(
      (candidatePath: string) => candidatePath,
    )
  })

  it("returns graph YAML workflows as-is", async () => {
    const graphWorkflow: Workflow = {
      version: 1,
      name: "Graph workflow",
      nodes: [
        { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
        {
          id: "output-1",
          type: "output",
          position: { x: 160, y: 0 },
          config: {},
        },
      ],
      edges: [
        {
          id: "edge-1",
          source: "input-1",
          target: "output-1",
          type: "default",
        },
      ],
    }
    loadChainYamlMock.mockResolvedValue(graphWorkflow)

    const { registerWorkflowsHandlers } = await import("./workflows")
    registerWorkflowsHandlers()

    const loadHandler = ipcHandlers.get("workflows:load") as
      | ((event: unknown, filePath: string) => Promise<Workflow>)
      | undefined
    expect(loadHandler).toBeDefined()

    await expect(loadHandler!(undefined, "/flows/graph.yaml")).resolves.toEqual(
      graphWorkflow,
    )
  })

  it("saves graph YAML workflows without converting them to chain JSON", async () => {
    const graphWorkflow: Workflow = {
      version: 1,
      name: "Graph workflow",
      nodes: [
        { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
        {
          id: "output-1",
          type: "output",
          position: { x: 160, y: 0 },
          config: {},
        },
      ],
      edges: [
        {
          id: "edge-1",
          source: "input-1",
          target: "output-1",
          type: "default",
        },
      ],
    }

    const { registerWorkflowsHandlers } = await import("./workflows")
    registerWorkflowsHandlers()

    const saveHandler = ipcHandlers.get("workflows:save") as
      | ((
          event: unknown,
          filePath: string,
          workflow: Workflow,
        ) => Promise<string>)
      | undefined
    expect(saveHandler).toBeDefined()

    await expect(
      saveHandler!(undefined, "/flows/graph.yaml", graphWorkflow),
    ).resolves.toBe("/flows/graph.yaml")
    expect(saveChainYamlMock).toHaveBeenCalledWith(
      "/flows/graph.yaml",
      graphWorkflow,
    )
    expect(saveChainMock).not.toHaveBeenCalled()
  })

  it("duplicates imported YAML workflows into canonical chain files", async () => {
    const graphWorkflow: Workflow = {
      version: 1,
      name: "Graph workflow",
      nodes: [],
      edges: [],
    }
    loadChainYamlMock.mockResolvedValue(graphWorkflow)

    const { registerWorkflowsHandlers } = await import("./workflows")
    registerWorkflowsHandlers()

    const duplicateHandler = ipcHandlers.get("workflows:duplicate") as
      | ((event: unknown, filePath: string) => Promise<string>)
      | undefined
    expect(duplicateHandler).toBeDefined()

    await expect(
      duplicateHandler!(undefined, "/flows/legacy.yaml"),
    ).resolves.toBe("/flows/legacy-copy.chain")
    expect(saveChainMock).toHaveBeenCalledWith("/flows/legacy-copy.chain", {
      ...graphWorkflow,
      name: "legacy-copy",
    })
  })

  it("renames flows by saving the destination before deleting the source", async () => {
    const workflow: Workflow = {
      version: 1,
      name: "Original flow",
      nodes: [],
      edges: [],
    }
    loadChainMock.mockResolvedValue(workflow)

    const unlinkMock = vi.fn().mockResolvedValue(undefined)
    vi.doMock("node:fs/promises", async () => {
      const actual =
        await vi.importActual<typeof import("node:fs/promises")>(
          "node:fs/promises",
        )
      return {
        ...actual,
        unlink: (...args: unknown[]) => unlinkMock(...args),
      }
    })

    const { registerWorkflowsHandlers } = await import("./workflows")
    registerWorkflowsHandlers()

    const renameHandler = ipcHandlers.get("workflows:rename") as
      | ((
          event: unknown,
          filePath: string,
          nextTitle: string,
        ) => Promise<string>)
      | undefined
    expect(renameHandler).toBeDefined()

    await expect(
      renameHandler!(undefined, "/flows/original.chain", "Renamed flow"),
    ).resolves.toBe("/flows/renamed-flow.chain")
    expect(saveChainMock).toHaveBeenCalledWith("/flows/renamed-flow.chain", {
      ...workflow,
      name: "Renamed flow",
    })
    expect(moveChatHistoryMock).toHaveBeenCalledWith(
      "/flows/original.chain",
      "/flows/renamed-flow.chain",
    )
    expect(unlinkMock).toHaveBeenCalledWith("/flows/original.chain")
  })
})
