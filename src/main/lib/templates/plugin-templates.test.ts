import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { InstalledPlugin } from "@shared/types"

const listInstalledPluginsMock = vi.fn<() => Promise<InstalledPlugin[]>>()
const ensurePluginMarketplacesDirMock = vi.fn<() => Promise<string>>()
const logWarnMock = vi.fn()

vi.mock("../plugins", () => ({
  listInstalledPlugins: () => listInstalledPluginsMock(),
  ensurePluginMarketplacesDir: () => ensurePluginMarketplacesDirMock(),
}))

vi.mock("../structured-log", () => ({
  logWarn: (...args: unknown[]) => logWarnMock(...args),
}))

async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, "utf-8")
}

describe("plugin templates", () => {
  let root: string

  beforeEach(async () => {
    vi.clearAllMocks()
    root = await mkdtemp(join(tmpdir(), "plugin-templates-test-"))
    ensurePluginMarketplacesDirMock.mockResolvedValue(
      join(root, ".c8c", "plugins", "marketplaces"),
    )
    listInstalledPluginsMock.mockResolvedValue([])
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("loads templates from enabled plugins and attaches provenance", async () => {
    const pluginRoot = join(root, "plugins", "review-pack")
    await writeText(
      join(pluginRoot, "templates", "review.yaml"),
      [
        "id: review-loop",
        "version: 1",
        "name: Review Loop",
        "description: Review code changes",
        "stage: code",
        'emoji: "🧪"',
        "headline: Review loop",
        "how: Run an iterative review process",
        "input: A code diff",
        "output: Review findings",
        "steps:",
        "  - Inspect the code",
        "  - Write findings",
        "nodes: []",
        "edges: []",
        "",
      ].join("\n"),
    )

    listInstalledPluginsMock.mockResolvedValue([
      {
        id: "quality-marketplace/review-pack",
        name: "review-pack",
        description: "Review templates",
        version: "1.0.0",
        marketplaceId: "quality-marketplace",
        marketplaceName: "Quality Marketplace",
        pluginPath: pluginRoot,
        enabled: true,
        capabilities: ["template"],
        assets: [{ capability: "template", count: 1 }],
      },
    ])

    const { listPluginTemplates } = await import("./plugin-templates")
    const templates = await listPluginTemplates()

    expect(templates).toHaveLength(1)
    expect(templates[0]).toMatchObject({
      id: "plugin:quality-marketplace/review-pack:review-loop",
      name: "Review Loop",
      source: "plugin",
      pluginId: "quality-marketplace/review-pack",
      pluginName: "review-pack",
      marketplaceName: "Quality Marketplace",
      pluginVersion: "1.0.0",
      templatePath: join(pluginRoot, "templates", "review.yaml"),
    })
  })

  it("uses the manifest-defined template root when templates are not under /templates", async () => {
    const pluginRoot = join(root, "plugins", "design-pack")
    await writeText(
      join(pluginRoot, ".claude-plugin", "plugin.json"),
      JSON.stringify({ templates: "./.claude/templates" }, null, 2),
    )
    await writeText(
      join(pluginRoot, ".claude", "templates", "design-system.yaml"),
      [
        "id: design-system-rollout",
        "version: 1",
        "name: Design System Rollout",
        "description: Roll out a design system",
        "stage: strategy",
        'emoji: "🎨"',
        "headline: Design system rollout",
        "how: Plan and execute a rollout",
        "input: Product surface inventory",
        "output: Rollout plan",
        "steps:",
        "  - Audit surfaces",
        "  - Plan rollout",
        "nodes: []",
        "edges: []",
        "",
      ].join("\n"),
    )

    listInstalledPluginsMock.mockResolvedValue([
      {
        id: "design-marketplace/design-pack",
        name: "design-pack",
        description: "Design templates",
        version: "2.0.0",
        marketplaceId: "design-marketplace",
        marketplaceName: "Design Marketplace",
        pluginPath: pluginRoot,
        enabled: true,
        capabilities: ["template"],
        assets: [{ capability: "template", count: 1 }],
      },
    ])

    const { listPluginTemplates } = await import("./plugin-templates")
    const templates = await listPluginTemplates()

    expect(templates).toHaveLength(1)
    expect(templates[0]).toMatchObject({
      id: "plugin:design-marketplace/design-pack:design-system-rollout",
      source: "plugin",
      pluginName: "design-pack",
      marketplaceName: "Design Marketplace",
      templatePath: join(
        pluginRoot,
        ".claude",
        "templates",
        "design-system.yaml",
      ),
    })
  })

  it("skips invalid template files and disabled plugins", async () => {
    const enabledPluginRoot = join(root, "plugins", "broken-pack")
    const disabledPluginRoot = join(root, "plugins", "hidden-pack")

    await writeText(
      join(enabledPluginRoot, "templates", "broken.yaml"),
      "not: [valid",
    )
    await writeText(
      join(disabledPluginRoot, "templates", "hidden.yaml"),
      [
        "id: hidden-template",
        "version: 1",
        "name: Hidden Template",
        "description: hidden",
        "stage: content",
        'emoji: "🫥"',
        "headline: Hidden",
        "how: Hidden",
        "input: x",
        "output: y",
        "steps:",
        "  - Hidden",
        "nodes: []",
        "edges: []",
        "",
      ].join("\n"),
    )

    listInstalledPluginsMock.mockResolvedValue([
      {
        id: "broken-marketplace/broken-pack",
        name: "broken-pack",
        description: "Broken templates",
        marketplaceId: "broken-marketplace",
        marketplaceName: "Broken Marketplace",
        pluginPath: enabledPluginRoot,
        enabled: true,
        capabilities: ["template"],
        assets: [{ capability: "template", count: 1 }],
      },
      {
        id: "hidden-marketplace/hidden-pack",
        name: "hidden-pack",
        description: "Hidden templates",
        marketplaceId: "hidden-marketplace",
        marketplaceName: "Hidden Marketplace",
        pluginPath: disabledPluginRoot,
        enabled: false,
        capabilities: ["template"],
        assets: [{ capability: "template", count: 1 }],
      },
    ])

    const { listPluginTemplates } = await import("./plugin-templates")
    const templates = await listPluginTemplates()

    expect(templates).toEqual([])
    expect(logWarnMock).toHaveBeenCalled()
  })
})
