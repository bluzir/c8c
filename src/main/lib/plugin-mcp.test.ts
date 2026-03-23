import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { InstalledPlugin } from "@shared/types"

const listInstalledPluginsMock = vi.fn<() => Promise<InstalledPlugin[]>>()
const getApprovedPluginMcpServerIdsMock = vi.fn<() => Promise<string[]>>()

vi.mock("./plugins", () => ({
  listInstalledPlugins: () => listInstalledPluginsMock(),
  getApprovedPluginMcpServerIds: () => getApprovedPluginMcpServerIdsMock(),
}))

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(data, null, 2), "utf-8")
}

function createInstalledPlugin(
  overrides: Partial<InstalledPlugin>,
): InstalledPlugin {
  return {
    id: "official/github",
    name: "github",
    description: "GitHub plugin",
    marketplaceId: "official",
    marketplaceName: "Official",
    pluginPath: "/tmp/plugin",
    enabled: true,
    capabilities: ["mcp"],
    assets: [{ capability: "mcp", count: 1 }],
    ...overrides,
  }
}

describe("plugin-mcp", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listInstalledPluginsMock.mockResolvedValue([])
    getApprovedPluginMcpServerIdsMock.mockResolvedValue([])
  })

  it("lists inline manifest MCP servers with approval state", async () => {
    const root = await mkdtemp(join(tmpdir(), "plugin-mcp-test-"))
    const pluginRoot = join(root, "plugins", "github")
    const manifestPath = join(pluginRoot, ".claude-plugin", "plugin.json")

    await writeJson(manifestPath, {
      name: "github",
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: {
            GITHUB_TOKEN: "secret",
          },
        },
      },
    })

    listInstalledPluginsMock.mockResolvedValue([
      createInstalledPlugin({
        id: "official/github",
        name: "GitHub",
        pluginPath: pluginRoot,
        manifestPath,
      }),
    ])

    const { buildPluginMcpServerId, listPluginMcpServers } =
      await import("./plugin-mcp")
    getApprovedPluginMcpServerIdsMock.mockResolvedValue([
      buildPluginMcpServerId("official/github", "github"),
    ])

    await expect(listPluginMcpServers()).resolves.toEqual([
      expect.objectContaining({
        id: "official/github/github",
        name: "github",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        approved: true,
        pluginId: "official/github",
        pluginName: "GitHub",
        marketplaceName: "Official",
      }),
    ])
  })

  it("returns only approved and enabled MCP servers for runtime injection", async () => {
    const root = await mkdtemp(join(tmpdir(), "plugin-mcp-test-"))
    const pluginRoot = join(root, "plugins", "search")

    await writeJson(join(pluginRoot, ".mcp.json"), {
      mcpServers: {
        exa: {
          command: "node",
          args: ["./exa.js"],
        },
        disabledServer: {
          command: "node",
          args: ["./disabled.js"],
          disabled: true,
        },
      },
    })

    listInstalledPluginsMock.mockResolvedValue([
      createInstalledPlugin({
        id: "official/search",
        name: "Search",
        pluginPath: pluginRoot,
      }),
    ])

    const { buildPluginMcpServerId, listApprovedPluginMcpServers } =
      await import("./plugin-mcp")
    getApprovedPluginMcpServerIdsMock.mockResolvedValue([
      buildPluginMcpServerId("official/search", "exa"),
      buildPluginMcpServerId("official/search", "disabledServer"),
    ])

    await expect(listApprovedPluginMcpServers()).resolves.toEqual([
      {
        info: expect.objectContaining({
          id: "official/search/exa",
          name: "exa",
          approved: true,
        }),
        entry: expect.objectContaining({
          command: "node",
          args: ["./exa.js"],
        }),
      },
    ])
  })
})
