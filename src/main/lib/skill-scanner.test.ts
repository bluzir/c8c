import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { InstalledPlugin } from "@shared/types"

const listInstalledPluginsMock = vi.fn<() => Promise<InstalledPlugin[]>>()
const ensurePluginMarketplacesDirMock = vi.fn<() => Promise<string>>()
const logWarnMock = vi.fn()

vi.mock("./plugins", () => ({
  listInstalledPlugins: () => listInstalledPluginsMock(),
  ensurePluginMarketplacesDir: () => ensurePluginMarketplacesDirMock(),
}))

vi.mock("./structured-log", () => ({
  logWarn: (...args: unknown[]) => logWarnMock(...args),
}))

async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, "utf-8")
}

describe("skill-scanner", () => {
  let root: string
  let originalHome: string | undefined
  let originalUserProfile: string | undefined
  let originalBuiltinRoot: string | undefined

  beforeEach(async () => {
    vi.clearAllMocks()
    root = await mkdtemp(join(tmpdir(), "skill-scanner-test-"))
    originalHome = process.env.HOME
    originalUserProfile = process.env.USERPROFILE
    originalBuiltinRoot = process.env.C8C_BUILTIN_GSTACK_ROOT
    process.env.HOME = root
    delete process.env.USERPROFILE
    process.env.C8C_BUILTIN_GSTACK_ROOT = join(root, "builtin-gstack")
    ensurePluginMarketplacesDirMock.mockResolvedValue(join(root, ".c8c", "plugins", "marketplaces"))
    listInstalledPluginsMock.mockResolvedValue([])
  })

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE
    } else {
      process.env.USERPROFILE = originalUserProfile
    }
    if (originalBuiltinRoot === undefined) {
      delete process.env.C8C_BUILTIN_GSTACK_ROOT
    } else {
      process.env.C8C_BUILTIN_GSTACK_ROOT = originalBuiltinRoot
    }
    await rm(root, { recursive: true, force: true })
  })

  it("merges project, user, and plugin skills with precedence project > user > plugin", async () => {
    const projectRoot = join(root, "project")
    const pluginRoot = join(root, ".c8c", "plugins", "marketplaces", "content-marketplace", "plugins", "content-pack")

    await writeText(
      join(projectRoot, ".claude", "skills", "content", "writer.md"),
      "---\nname: writer\ndescription: project writer\n---\n",
    )
    await writeText(
      join(root, ".claude", "skills", "content", "writer.md"),
      "---\nname: writer\ndescription: user writer\n---\n",
    )
    await writeText(
      join(root, ".claude", "skills", "content", "editor.md"),
      "---\nname: editor\ndescription: user editor\n---\n",
    )
    await writeText(
      join(pluginRoot, "skills", "writer", "SKILL.md"),
      "---\nname: writer\ndescription: plugin writer\n---\n",
    )
    await writeText(
      join(pluginRoot, "skills", "editor", "SKILL.md"),
      "---\nname: editor\ndescription: plugin editor\n---\n",
    )
    await writeText(
      join(pluginRoot, "skills", "reviewer", "SKILL.md"),
      "---\nname: reviewer\ndescription: plugin reviewer\n---\n",
    )

    listInstalledPluginsMock.mockResolvedValue([
      {
        id: "content-marketplace/content-pack",
        name: "content-pack",
        description: "Plugin content pack",
        version: "1.0.0",
        marketplaceId: "content-marketplace",
        marketplaceName: "Content Marketplace",
        pluginPath: pluginRoot,
        category: "content",
        enabled: true,
        capabilities: ["skill"],
        assets: [{ capability: "skill", count: 3 }],
      },
    ])

    const { scanAllSkills } = await import("./skill-scanner")
    const skills = await scanAllSkills(projectRoot)

    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "writer",
          description: "project writer",
          sourceScope: "project",
          category: "content",
        }),
        expect.objectContaining({
          name: "editor",
          description: "user editor",
          sourceScope: "user",
          category: "content",
        }),
        expect.objectContaining({
          name: "reviewer",
          description: "plugin reviewer",
          sourceScope: "plugin",
          category: "content",
          pluginId: "content-marketplace/content-pack",
          pluginName: "content-pack",
          marketplaceId: "content-marketplace",
          marketplaceName: "Content Marketplace",
          pluginVersion: "1.0.0",
          library: "content-pack",
        }),
      ]),
    )
  })

  it("discovers built-in gstack skills from the bundled resource root", async () => {
    const builtinRoot = join(root, "builtin-gstack")
    await writeText(
      join(builtinRoot, "review", "SKILL.md"),
      "---\nname: review\ndescription: built-in review\n---\n",
    )

    const { scanAllSkills } = await import("./skill-scanner")
    const skills = await scanAllSkills(join(root, "project"))

    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "review",
          description: "built-in review",
          category: "gstack",
          sourceScope: "library",
          library: "gstack",
          format: "codex-skill",
        }),
      ]),
    )
  })

  it("reads plugin skill roots from plugin.json when skills live under .claude/skills", async () => {
    const pluginRoot = join(root, ".c8c", "plugins", "marketplaces", "design-marketplace", "design-pack")

    await writeText(
      join(pluginRoot, ".claude-plugin", "plugin.json"),
      JSON.stringify({ skills: "./.claude/skills" }, null, 2),
    )
    await writeText(
      join(pluginRoot, ".claude", "skills", "frontend-design", "SKILL.md"),
      "---\nname: frontend-design\ndescription: design skill\n---\n",
    )

    listInstalledPluginsMock.mockResolvedValue([
      {
        id: "design-marketplace/design-pack",
        name: "design-pack",
        description: "Design plugin",
        version: "2.0.0",
        marketplaceId: "design-marketplace",
        marketplaceName: "Design Marketplace",
        pluginPath: pluginRoot,
        category: "design",
        enabled: true,
        capabilities: ["skill"],
        assets: [{ capability: "skill", count: 1 }],
      },
    ])

    const { scanPluginSkills } = await import("./skill-scanner")
    const skills = await scanPluginSkills()

    expect(skills).toHaveLength(1)
    expect(skills[0]).toMatchObject({
      name: "frontend-design",
      sourceScope: "plugin",
      category: "design",
      pluginName: "design-pack",
      marketplaceName: "Design Marketplace",
    })
  })

  it("normalizes tool restriction frontmatter before exposing discovered skills", async () => {
    const projectRoot = join(root, "project")

    await writeText(
      join(projectRoot, ".claude", "skills", "content", "writer.md"),
      [
        "---",
        "name: writer",
        "description: normalized",
        "tools:",
        "  - Read",
        "  - \"  Read  \"",
        "  - \"\"",
        "allowed_tools:",
        "  - Edit",
        "  - \" Edit \"",
        "  - \"\"",
        "disallowed_tools:",
        "  - Bash",
        "  - \"  \"",
        "max_turns: 3",
        "---",
        "",
      ].join("\n"),
    )

    const { scanAllSkills } = await import("./skill-scanner")
    const skills = await scanAllSkills(projectRoot)
    const writer = skills.find((skill) => skill.name === "writer")

    expect(writer).toMatchObject({
      tools: ["Read"],
      allowedTools: ["Edit"],
      disallowedTools: ["Bash"],
      maxTurns: 3,
    })
  })

  it("skips user skill discovery when the home directory is unavailable", async () => {
    delete process.env.HOME
    delete process.env.USERPROFILE

    const { scanUserSkills } = await import("./skill-scanner")
    const skills = await scanUserSkills()

    expect(skills).toEqual([])
    expect(logWarnMock).toHaveBeenCalledWith(
      "skill-scanner",
      "user_home_missing",
      expect.objectContaining({
        cwd: expect.any(String),
      }),
    )
  })
})
