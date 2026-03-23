import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  ConfigureMcpIntegrationInput,
  McpIntegrationStatus,
  McpIntegrationTestResult,
  McpMutationResult,
  McpTestResult,
  McpToolInfo,
  PluginMcpServerInfo,
} from "@shared/types"

const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>()
const resolveMcpProviderMock = vi.fn()
const listPluginMcpServersMock = vi.fn()
const setPluginMcpServerApprovedMock = vi.fn((..._args: unknown[]) =>
  Promise.resolve(true),
)
const listMcpIntegrationsMock = vi.fn()
const getMcpIntegrationStatusesMock = vi.fn()
const configureMcpIntegrationMock = vi.fn()
const testMcpIntegrationMock = vi.fn()
const allowedProjectRootsMock = vi.fn()
const assertWithinRootsMock = vi.fn()

const listServersMock = vi.fn()
const listAllServersMock = vi.fn()
const addServerMock = vi.fn()
const updateServerMock = vi.fn()
const removeServerMock = vi.fn()
const toggleServerMock = vi.fn()
const testServerMock = vi.fn()
const discoverToolsMock = vi.fn()

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        ipcHandlers.set(channel, handler)
      },
    ),
  },
}))

vi.mock("../lib/providers", () => ({
  resolveMcpProvider: (...args: unknown[]) => resolveMcpProviderMock(...args),
}))

vi.mock("../lib/security-paths", () => ({
  allowedProjectRoots: (...args: unknown[]) => allowedProjectRootsMock(...args),
  assertWithinRoots: (...args: unknown[]) => assertWithinRootsMock(...args),
}))

vi.mock("../lib/plugin-mcp", () => ({
  listPluginMcpServers: () => listPluginMcpServersMock(),
}))

vi.mock("../lib/plugins", () => ({
  setPluginMcpServerApproved: (...args: unknown[]) =>
    setPluginMcpServerApprovedMock(...args),
}))

vi.mock("../lib/mcp-integrations", () => ({
  listMcpIntegrations: (...args: unknown[]) => listMcpIntegrationsMock(...args),
  getMcpIntegrationStatuses: (...args: unknown[]) =>
    getMcpIntegrationStatusesMock(...args),
  configureMcpIntegration: (...args: unknown[]) =>
    configureMcpIntegrationMock(...args),
  testMcpIntegration: (...args: unknown[]) => testMcpIntegrationMock(...args),
}))

describe("mcp IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    ipcHandlers.clear()
    allowedProjectRootsMock.mockResolvedValue(["/safe"])
    assertWithinRootsMock.mockImplementation(
      (candidatePath: string) => candidatePath,
    )
    listServersMock.mockResolvedValue([])
    listAllServersMock.mockResolvedValue([])
    addServerMock.mockResolvedValue({
      success: true,
    } satisfies McpMutationResult)
    updateServerMock.mockResolvedValue({
      success: true,
    } satisfies McpMutationResult)
    removeServerMock.mockResolvedValue({
      success: true,
    } satisfies McpMutationResult)
    toggleServerMock.mockResolvedValue({
      success: true,
    } satisfies McpMutationResult)
    testServerMock.mockResolvedValue({
      healthy: true,
      tools: [],
      latencyMs: 12,
    } satisfies McpTestResult)
    discoverToolsMock.mockResolvedValue([] satisfies McpToolInfo[])
    resolveMcpProviderMock.mockReturnValue({
      listServers: listServersMock,
      listAllServers: listAllServersMock,
      addServer: addServerMock,
      updateServer: updateServerMock,
      removeServer: removeServerMock,
      toggleServer: toggleServerMock,
      testServer: testServerMock,
      discoverTools: discoverToolsMock,
    })
    listPluginMcpServersMock.mockResolvedValue([])
    setPluginMcpServerApprovedMock.mockResolvedValue(true)
    listMcpIntegrationsMock.mockResolvedValue([])
    getMcpIntegrationStatusesMock.mockResolvedValue([])
    configureMcpIntegrationMock.mockImplementation(
      async (_integrationId: string, input: ConfigureMcpIntegrationInput) =>
        ({
          integration: {
            id: "exa",
            label: "Exa Web Search",
            description: "",
            toolIds: ["exa"],
            fields: [],
          },
          configured: true,
          source: "keyring",
          keyCount: Object.keys(input.values || {}).length,
          keyringPath: "/Users/test/.c8c/integrations/keyring.json",
          requestedToolIds: [],
        }) satisfies McpIntegrationStatus,
    )
    testMcpIntegrationMock.mockResolvedValue({
      healthy: true,
    } satisfies McpIntegrationTestResult)
  })

  it("lists registry integrations through a dedicated handler", async () => {
    const integrations: McpIntegrationStatus[] = [
      {
        integration: {
          id: "exa",
          label: "Exa Web Search",
          description: "",
          toolIds: ["exa"],
          fields: [],
        },
        configured: false,
        source: "none",
        keyCount: 0,
        keyringPath: "/Users/test/.c8c/integrations/keyring.json",
        requestedToolIds: [],
      },
    ]
    listMcpIntegrationsMock.mockResolvedValue(integrations)

    const { registerMcpHandlers } = await import("./mcp")
    registerMcpHandlers()

    const handler = ipcHandlers.get("mcp:list-integrations") as
      | ((
          event: unknown,
          projectPath?: string,
        ) => Promise<McpIntegrationStatus[]>)
      | undefined
    expect(handler).toBeDefined()
    await expect(handler!(undefined, "/safe/project")).resolves.toEqual(
      integrations,
    )
    expect(listMcpIntegrationsMock).toHaveBeenCalledWith("/safe/project")
  })

  it("resolves integration statuses for requested tools", async () => {
    const statuses: McpIntegrationStatus[] = [
      {
        integration: {
          id: "exa",
          label: "Exa Web Search",
          description: "",
          toolIds: ["exa"],
          fields: [],
        },
        configured: false,
        source: "none",
        keyCount: 0,
        keyringPath: "/Users/test/.c8c/integrations/keyring.json",
        requestedToolIds: ["web_search"],
      },
    ]
    getMcpIntegrationStatusesMock.mockResolvedValue(statuses)

    const { registerMcpHandlers } = await import("./mcp")
    registerMcpHandlers()

    const handler = ipcHandlers.get("mcp:get-integration-statuses") as
      | ((
          event: unknown,
          toolIds: string[],
          projectPath?: string,
        ) => Promise<McpIntegrationStatus[]>)
      | undefined
    expect(handler).toBeDefined()
    await expect(
      handler!(undefined, ["web_search"], "/safe/project"),
    ).resolves.toEqual(statuses)
    expect(getMcpIntegrationStatusesMock).toHaveBeenCalledWith(
      ["web_search"],
      "/safe/project",
    )
  })

  it("configures an integration through the registry service", async () => {
    const { registerMcpHandlers } = await import("./mcp")
    registerMcpHandlers()

    const handler = ipcHandlers.get("mcp:configure-integration") as
      | ((
          event: unknown,
          integrationId: string,
          input: ConfigureMcpIntegrationInput,
          projectPath?: string,
        ) => Promise<McpIntegrationStatus>)
      | undefined
    expect(handler).toBeDefined()

    await expect(
      handler!(
        undefined,
        "exa",
        { values: { apiKey: "secret" } },
        "/safe/project",
      ),
    ).resolves.toMatchObject({
      configured: true,
      source: "keyring",
    })
    expect(configureMcpIntegrationMock).toHaveBeenCalledWith(
      "exa",
      { values: { apiKey: "secret" } },
      "/safe/project",
    )
  })

  it("lists plugin MCP servers through a dedicated handler", async () => {
    const pluginServers: PluginMcpServerInfo[] = [
      {
        id: "official/github/github",
        name: "github",
        type: "stdio",
        command: "npx",
        approved: true,
        pluginId: "official/github",
        pluginName: "GitHub",
        pluginPath: "/tmp/github",
        marketplaceId: "official",
        marketplaceName: "Official",
      },
    ]
    listPluginMcpServersMock.mockResolvedValue(pluginServers)

    const { registerMcpHandlers } = await import("./mcp")
    registerMcpHandlers()

    const handler = ipcHandlers.get("mcp:list-plugin-servers") as
      | ((event: unknown) => Promise<PluginMcpServerInfo[]>)
      | undefined
    expect(handler).toBeDefined()
    await expect(handler!(undefined)).resolves.toEqual(pluginServers)
  })

  it("persists plugin MCP approval state", async () => {
    const { registerMcpHandlers } = await import("./mcp")
    registerMcpHandlers()

    const handler = ipcHandlers.get("mcp:set-plugin-server-approved") as
      | ((
          event: unknown,
          serverId: string,
          approved: boolean,
        ) => Promise<boolean>)
      | undefined
    expect(handler).toBeDefined()

    await expect(
      handler!(undefined, "official/github/github", true),
    ).resolves.toBe(true)
    expect(setPluginMcpServerApprovedMock).toHaveBeenCalledWith(
      "official/github/github",
      true,
    )
  })

  it("rejects malformed MCP server mutations before provider code", async () => {
    const { registerMcpHandlers } = await import("./mcp")
    registerMcpHandlers()

    const handler = ipcHandlers.get("mcp:add-server") as
      | ((
          event: unknown,
          provider: string,
          server: Record<string, unknown>,
          projectPath?: string,
        ) => Promise<McpMutationResult>)
      | undefined
    expect(handler).toBeDefined()

    await expect(
      handler!(undefined, "claude", {
        name: " mixed ",
        scope: "user",
        type: "stdio",
        command: "npx",
        url: "https://example.com/mcp",
      }),
    ).resolves.toEqual({
      success: false,
      error: 'MCP server "mixed" uses mixed stdio and remote transport fields.',
    })
    expect(addServerMock).not.toHaveBeenCalled()
  })

  it("validates and forwards a safe project path for project-scoped add-server", async () => {
    assertWithinRootsMock.mockReturnValue("/safe/project")

    const { registerMcpHandlers } = await import("./mcp")
    registerMcpHandlers()

    const handler = ipcHandlers.get("mcp:add-server") as
      | ((
          event: unknown,
          provider: string,
          server: Record<string, unknown>,
          projectPath?: string,
        ) => Promise<McpMutationResult>)
      | undefined
    expect(handler).toBeDefined()

    await expect(
      handler!(
        undefined,
        "claude",
        {
          name: " github ",
          scope: "project",
          type: "stdio",
          command: " npx ",
          args: [" -y ", "@modelcontextprotocol/server-github"],
        },
        "/safe/project",
      ),
    ).resolves.toEqual({ success: true })

    expect(addServerMock).toHaveBeenCalledWith(
      {
        name: "github",
        scope: "project",
        provider: undefined,
        projectPath: undefined,
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        url: undefined,
        env: undefined,
        headers: undefined,
        disabled: undefined,
        autoApprove: undefined,
      },
      "/safe/project",
    )
  })

  it("fails closed when project-scoped add-server gets an invalid project path", async () => {
    assertWithinRootsMock.mockImplementation(() => {
      throw new Error("Project path must stay within allowed roots.")
    })

    const { registerMcpHandlers } = await import("./mcp")
    registerMcpHandlers()

    const handler = ipcHandlers.get("mcp:add-server") as
      | ((
          event: unknown,
          provider: string,
          server: Record<string, unknown>,
          projectPath?: string,
        ) => Promise<McpMutationResult>)
      | undefined
    expect(handler).toBeDefined()

    await expect(
      handler!(
        undefined,
        "claude",
        {
          name: "github",
          scope: "local",
          type: "stdio",
          command: "npx",
        },
        "/unsafe/project",
      ),
    ).resolves.toEqual({
      success: false,
      error: "Project path must stay within allowed roots.",
    })
    expect(addServerMock).not.toHaveBeenCalled()
  })

  it("requires a project path for project-scoped removals", async () => {
    const { registerMcpHandlers } = await import("./mcp")
    registerMcpHandlers()

    const handler = ipcHandlers.get("mcp:remove-server") as
      | ((
          event: unknown,
          provider: string,
          name: string,
          scope: string,
          projectPath?: string,
        ) => Promise<McpMutationResult>)
      | undefined
    expect(handler).toBeDefined()

    await expect(
      handler!(undefined, "claude", "github", "project"),
    ).resolves.toEqual({
      success: false,
      error: "Project path required for project scope.",
    })
    expect(removeServerMock).not.toHaveBeenCalled()
  })

  it("returns an unhealthy result when project-scoped tests omit projectPath", async () => {
    const { registerMcpHandlers } = await import("./mcp")
    registerMcpHandlers()

    const handler = ipcHandlers.get("mcp:test-server") as
      | ((
          event: unknown,
          provider: string,
          name: string,
          scope: string,
          projectPath?: string,
        ) => Promise<McpTestResult>)
      | undefined
    expect(handler).toBeDefined()

    await expect(
      handler!(undefined, "claude", "github", "local"),
    ).resolves.toEqual({
      healthy: false,
      tools: [],
      error: "Project path required for local scope.",
      latencyMs: 0,
    })
    expect(testServerMock).not.toHaveBeenCalled()
  })

  it("returns an empty result when list-servers gets an invalid project path", async () => {
    assertWithinRootsMock.mockImplementation(() => {
      throw new Error("Project path must stay within allowed roots.")
    })

    const { registerMcpHandlers } = await import("./mcp")
    registerMcpHandlers()

    const handler = ipcHandlers.get("mcp:list-servers") as
      | ((
          event: unknown,
          provider: string,
          projectPath?: string,
        ) => Promise<unknown[]>)
      | undefined
    expect(handler).toBeDefined()

    await expect(
      handler!(undefined, "claude", "/unsafe/project"),
    ).resolves.toEqual([])
    expect(listServersMock).not.toHaveBeenCalled()
  })

  it("fails closed when list-all-servers provider resolution throws", async () => {
    resolveMcpProviderMock.mockImplementation(() => {
      throw new Error("bad provider")
    })

    const { registerMcpHandlers } = await import("./mcp")
    registerMcpHandlers()

    const handler = ipcHandlers.get("mcp:list-all-servers") as
      | ((event: unknown, provider: string) => Promise<unknown[]>)
      | undefined
    expect(handler).toBeDefined()

    await expect(handler!(undefined, "claude")).resolves.toEqual([])
  })
})
