import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { DiscoveredSkill } from "@shared/types"

const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>()

const scanAllSkillsMock = vi.fn<(...args: unknown[]) => Promise<DiscoveredSkill[]>>()
const scanAllLibrariesMock = vi.fn<(...args: unknown[]) => Promise<DiscoveredSkill[]>>()
const assertRegisteredProjectPathMock = vi.fn<(...args: unknown[]) => Promise<string>>()
const allowedSkillContentRootsMock = vi.fn<(...args: unknown[]) => Promise<string[]>>()
const assertWithinRootsMock = vi.fn<(...args: unknown[]) => string>((candidatePath) => candidatePath as string)
const trackTelemetryEventMock = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve())

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler)
    }),
  },
}))

vi.mock("../lib/skill-scanner", () => ({
  scanAllSkills: (...args: unknown[]) => scanAllSkillsMock(...args),
  mergeDiscoveredSkills: (groups: DiscoveredSkill[][]) => {
    const seen = new Set<string>()
    const merged: DiscoveredSkill[] = []
    for (const group of groups) {
      for (const skill of group) {
        const key = `${skill.type}:${skill.category}:${skill.name}`
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(skill)
      }
    }
    return merged
  },
}))

vi.mock("../lib/skill-scan-cache", () => ({
  getCachedProjectSkills: (...args: unknown[]) => scanAllSkillsMock(...args),
  invalidateProjectSkillScan: vi.fn(),
}))

vi.mock("../lib/libraries", () => ({
  ensureLibrariesDir: vi.fn(),
  scanAllLibraries: (...args: unknown[]) => scanAllLibrariesMock(...args),
}))

vi.mock("../lib/security-paths", () => ({
  assertRegisteredProjectPath: (...args: unknown[]) => assertRegisteredProjectPathMock(...args),
  allowedSkillContentRoots: (...args: unknown[]) => allowedSkillContentRootsMock(...args),
  assertWithinRoots: (...args: unknown[]) => assertWithinRootsMock(...args),
}))

vi.mock("../lib/skill-scaffold", () => ({
  scaffoldMissingSkills: vi.fn(),
}))

vi.mock("../lib/plugins", () => ({
  ensurePluginMarketplacesDir: vi.fn(),
}))

vi.mock("../lib/telemetry/service", () => ({
  trackTelemetryEvent: (...args: unknown[]) => trackTelemetryEventMock(...args),
}))

vi.mock("../lib/telemetry/workflow-usage", () => ({
  summarizeMissingWorkflowSkillRefs: vi.fn(() => ({
    skillNodesTotal: 0,
    availableSkillsTotal: 0,
    missingRefsTotal: 0,
    missingRefsUnique: 0,
    missingRefsList: [],
  })),
}))

vi.mock("../lib/structured-log", () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}))

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("skills IPC scan lock", () => {
  let workspace: string

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    ipcHandlers.clear()
    assertRegisteredProjectPathMock.mockImplementation(async (projectPath: string) => projectPath)
    allowedSkillContentRootsMock.mockResolvedValue(["/project/.claude/skills"])
  })

  afterEach(async () => {
    if (workspace) {
      await rm(workspace, { recursive: true, force: true })
      workspace = ""
    }
  })

  it("dedupes concurrent scans for the same project", async () => {
    const projectSkillA: DiscoveredSkill = {
      type: "skill",
      name: "writer",
      description: "project writer",
      category: "content",
      path: "/project/.claude/skills/writer.md",
    }
    const projectSkillB: DiscoveredSkill = {
      type: "skill",
      name: "editor",
      description: "project editor",
      category: "content",
      path: "/project/.claude/skills/editor.md",
    }
    const librarySkillDuplicate: DiscoveredSkill = {
      type: "skill",
      name: "writer",
      description: "library writer",
      category: "library",
      path: "/home/.c8c/libraries/x/writer.md",
      library: "anthropic-skills",
    }
    const librarySkillUnique: DiscoveredSkill = {
      type: "skill",
      name: "researcher",
      description: "library researcher",
      category: "library",
      path: "/home/.c8c/libraries/x/researcher.md",
      library: "anthropic-skills",
    }

    const projectScanGate = deferred<DiscoveredSkill[]>()
    scanAllSkillsMock.mockReturnValueOnce(projectScanGate.promise)
    scanAllLibrariesMock.mockResolvedValue([librarySkillDuplicate, librarySkillUnique])

    const { registerSkillsHandlers } = await import("./skills")
    registerSkillsHandlers()

    const scanHandler = ipcHandlers.get("skills:scan") as
      | ((event: unknown, projectPath: string) => Promise<DiscoveredSkill[]>)
      | undefined
    expect(scanHandler).toBeDefined()

    const firstScan = scanHandler!(undefined, "/project")
    const secondScan = scanHandler!(undefined, "/project")
    await Promise.resolve()
    await Promise.resolve()

    expect(scanAllSkillsMock).toHaveBeenCalledTimes(1)
    expect(scanAllLibrariesMock).toHaveBeenCalledTimes(1)

    projectScanGate.resolve([projectSkillA, projectSkillB])
    const [firstResult, secondResult] = await Promise.all([firstScan, secondScan])

    expect(firstResult).toEqual(secondResult)
    // With category-aware dedup, "writer" in "content" and "writer" in "library" are distinct
    expect(firstResult).toHaveLength(4)
    expect(firstResult[0]?.path).toBe(projectSkillA.path)
    expect(firstResult[1]?.path).toBe(projectSkillB.path)
    expect(firstResult[2]?.path).toBe(librarySkillDuplicate.path)
    expect(firstResult[3]?.path).toBe(librarySkillUnique.path)
  })

  it("creates new skill templates with frontmatter metadata", async () => {
    workspace = await mkdtemp(join(tmpdir(), "skills-ipc-test-"))
    assertRegisteredProjectPathMock.mockResolvedValue(workspace)

    const { registerSkillsHandlers } = await import("./skills")
    registerSkillsHandlers()

    const createTemplateHandler = ipcHandlers.get("skills:create-template") as
      | ((event: unknown, projectPath: string) => Promise<string>)
      | undefined
    expect(createTemplateHandler).toBeDefined()

    const createdPath = await createTemplateHandler!(undefined, workspace)
    const template = await readFile(createdPath, "utf-8")

    expect(template).toContain("---")
    expect(template).toContain("name: New Skill")
    expect(template).toContain("description: Describe what this skill should do.")
    expect(template).toContain("# New Skill")
  })

  it("reads skill content only from markdown skill files inside allowed skill roots", async () => {
    workspace = await mkdtemp(join(tmpdir(), "skills-ipc-test-"))
    const skillPath = join(workspace, ".claude", "skills", "writer.md")
    await mkdir(join(workspace, ".claude", "skills"), { recursive: true })
    await writeFile(skillPath, "# Writer\n", "utf-8")
    allowedSkillContentRootsMock.mockResolvedValue([join(workspace, ".claude", "skills")])
    assertWithinRootsMock.mockImplementation((candidatePath) => candidatePath as string)

    const { registerSkillsHandlers } = await import("./skills")
    registerSkillsHandlers()

    const readHandler = ipcHandlers.get("skills:read-content") as
      | ((event: unknown, filePath: string) => Promise<string>)
      | undefined
    expect(readHandler).toBeDefined()

    await expect(readHandler!(undefined, skillPath)).resolves.toBe("# Writer\n")
    await expect(readHandler!(undefined, join(workspace, ".claude", "skills", "writer.txt"))).rejects.toThrow(
      "Skill file path must reference a skill markdown file",
    )
  })
})
