import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { discoverInstalledPlugins } from "./plugin-scanner"

const logWarnMock = vi.fn()

vi.mock("./structured-log", () => ({
  logWarn: (...args: unknown[]) => logWarnMock(...args),
}))

async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, "utf-8")
}

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await writeText(filePath, JSON.stringify(payload, null, 2))
}

describe("plugin-scanner", () => {
  let root: string

  beforeEach(async () => {
    vi.clearAllMocks()
    root = await mkdtemp(join(tmpdir(), "plugin-scanner-test-"))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("discovers a single-plugin bundle from the marketplace root", async () => {
    const pluginRoot = join(root, "impeccable")

    await writeJson(join(pluginRoot, ".claude-plugin", "plugin.json"), {
      name: "impeccable",
      description: "Design pack",
      version: "1.3.0",
      skills: "./skills",
      templates: "./templates",
    })
    await writeText(
      join(pluginRoot, "skills", "design-system", "SKILL.md"),
      "---\nname: Design System\n---\n",
    )
    await writeText(
      join(pluginRoot, "templates", "landing.yaml"),
      "version: 1\nname: Landing\n",
    )
    await writeJson(join(pluginRoot, ".mcp.json"), {
      mcpServers: {
        github: {
          command: "gh",
        },
      },
    })

    const plugins = await discoverInstalledPlugins({ marketplacesDir: root })

    expect(plugins).toHaveLength(1)
    expect(plugins[0]).toMatchObject({
      id: "impeccable/impeccable",
      name: "impeccable",
      marketplaceId: "impeccable",
      marketplaceName: "impeccable",
      enabled: true,
      capabilities: ["skill", "template", "mcp"],
    })
    expect(plugins[0].assets).toEqual([
      { capability: "skill", count: 1 },
      { capability: "template", count: 1 },
      { capability: "mcp", count: 1 },
    ])
  })

  it("discovers multiple plugins from a marketplace manifest and preserves enable state", async () => {
    const marketplaceRoot = join(root, "official-marketplace")

    await writeJson(
      join(marketplaceRoot, ".claude-plugin", "marketplace.json"),
      {
        name: "Official Marketplace",
        owner: {
          name: "Anthropic",
        },
        plugins: [
          {
            name: "alpha",
            source: "./plugins/alpha",
            description: "Alpha skills",
          },
          {
            name: "beta",
            source: "./plugins/beta",
            description: "Beta templates",
          },
        ],
      },
    )
    await writeText(
      join(marketplaceRoot, "plugins", "alpha", "skills", "writer", "SKILL.md"),
      "---\nname: Writer\n---\n",
    )
    await writeText(
      join(marketplaceRoot, "plugins", "beta", "templates", "review.yaml"),
      "version: 1\n",
    )
    await writeJson(join(marketplaceRoot, "plugins", "beta", ".mcp.json"), {
      mcpServers: {
        linear: {
          command: "linear-mcp",
        },
      },
    })

    const plugins = await discoverInstalledPlugins({
      marketplacesDir: root,
      disabledPluginIds: ["official-marketplace/alpha"],
    })

    expect(plugins).toHaveLength(2)
    expect(plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "official-marketplace/alpha",
          enabled: false,
          marketplaceName: "Official Marketplace",
          capabilities: ["skill"],
          assets: [{ capability: "skill", count: 1 }],
        }),
        expect.objectContaining({
          id: "official-marketplace/beta",
          enabled: true,
          capabilities: ["template", "mcp"],
          assets: [
            { capability: "template", count: 1 },
            { capability: "mcp", count: 1 },
          ],
        }),
      ]),
    )
  })

  it("skips invalid marketplace manifests without throwing", async () => {
    const marketplaceRoot = join(root, "broken-marketplace")

    await writeText(
      join(marketplaceRoot, ".claude-plugin", "marketplace.json"),
      "{not-valid-json",
    )

    const plugins = await discoverInstalledPlugins({ marketplacesDir: root })

    expect(plugins).toEqual([])
    expect(logWarnMock).toHaveBeenCalled()
  })

  it("returns plugins with empty asset summaries when directories are missing", async () => {
    const marketplaceRoot = join(root, "empty-marketplace")

    await writeJson(
      join(marketplaceRoot, ".claude-plugin", "marketplace.json"),
      {
        name: "Empty Marketplace",
        plugins: [
          {
            name: "empty-pack",
            source: "./plugins/empty-pack",
          },
        ],
      },
    )
    await writeJson(
      join(
        marketplaceRoot,
        "plugins",
        "empty-pack",
        ".claude-plugin",
        "plugin.json",
      ),
      {
        name: "empty-pack",
        description: "No assets yet",
      },
    )

    const plugins = await discoverInstalledPlugins({ marketplacesDir: root })

    expect(plugins).toHaveLength(1)
    expect(plugins[0]).toMatchObject({
      id: "empty-marketplace/empty-pack",
      capabilities: [],
      assets: [],
    })
  })
})
