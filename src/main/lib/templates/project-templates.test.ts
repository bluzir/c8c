import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { join } from "node:path"
import type { Dirent } from "node:fs"
import { listProjectTemplates } from "./project-templates"
import * as fs from "node:fs/promises"

vi.mock("node:fs/promises")

const mockAccess = vi.mocked(fs.access)
const mockReaddir = vi.mocked(fs.readdir)
const mockReadFile = vi.mocked(fs.readFile)

const MINIMAL_TEMPLATE_YAML = `
id: test-template
stage: operations
stage_family: design
emoji: "🔧"
headline: Test template headline
how: Test how description
input: Test input
output: Test output
steps:
  - Step one
suggested_tools: []
version: 1
name: Test Template
nodes:
  - id: input-1
    type: input
    position: { x: 0, y: 0 }
    config: {}
  - id: output-1
    type: output
    position: { x: 400, y: 0 }
    config: {}
edges:
  - id: e-input-1-output-1
    source: input-1
    target: output-1
    type: default
`

function dirent(name: string, isDir = false) {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    path: "",
    parentPath: "",
  } as unknown as Dirent
}

describe("listProjectTemplates", () => {
  const projectPath = "/test/project"
  const templatesDir = join(projectPath, ".c8c", "templates")

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns [] when templates directory does not exist", async () => {
    mockAccess.mockRejectedValue(new Error("ENOENT"))

    const result = await listProjectTemplates(projectPath)

    expect(result).toEqual([])
    expect(mockAccess).toHaveBeenCalledWith(templatesDir)
  })

  it("parses valid YAML template with source 'project'", async () => {
    mockAccess.mockResolvedValue(undefined)
    mockReaddir.mockResolvedValue([dirent("my-flow.yaml")] as never)
    mockReadFile.mockResolvedValue(MINIMAL_TEMPLATE_YAML)

    const result = await listProjectTemplates(projectPath)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("test-template")
    expect(result[0].source).toBe("project")
    expect(result[0].name).toBe("Test Template")
    expect(result[0].templatePath).toBe(join(templatesDir, "my-flow.yaml"))
  })

  it("supports .yml extension", async () => {
    mockAccess.mockResolvedValue(undefined)
    mockReaddir.mockResolvedValue([dirent("my-flow.yml")] as never)
    mockReadFile.mockResolvedValue(MINIMAL_TEMPLATE_YAML)

    const result = await listProjectTemplates(projectPath)

    expect(result).toHaveLength(1)
    expect(result[0].source).toBe("project")
  })

  it("ignores non-YAML files", async () => {
    mockAccess.mockResolvedValue(undefined)
    mockReaddir.mockResolvedValue([
      dirent("readme.md"),
      dirent("config.json"),
      dirent("template.yaml"),
    ] as never)
    mockReadFile.mockResolvedValue(MINIMAL_TEMPLATE_YAML)

    const result = await listProjectTemplates(projectPath)

    expect(result).toHaveLength(1)
    expect(mockReadFile).toHaveBeenCalledTimes(1)
  })

  it("skips directories", async () => {
    mockAccess.mockResolvedValue(undefined)
    mockReaddir.mockResolvedValue([
      dirent("subdir", true),
      dirent("template.yaml"),
    ] as never)
    mockReadFile.mockResolvedValue(MINIMAL_TEMPLATE_YAML)

    const result = await listProjectTemplates(projectPath)

    expect(result).toHaveLength(1)
  })

  it("skips malformed YAML without throwing", async () => {
    mockAccess.mockResolvedValue(undefined)
    mockReaddir.mockResolvedValue([
      dirent("bad.yaml"),
      dirent("good.yaml"),
    ] as never)
    mockReadFile
      .mockResolvedValueOnce("this is not valid: [[[")
      .mockResolvedValueOnce(MINIMAL_TEMPLATE_YAML)

    const result = await listProjectTemplates(projectPath)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("test-template")
  })

  it("skips YAML missing required fields without throwing", async () => {
    const noIdYaml = MINIMAL_TEMPLATE_YAML.replace("id: test-template\n", "")
    mockAccess.mockResolvedValue(undefined)
    mockReaddir.mockResolvedValue([dirent("my-custom-flow.yaml")] as never)
    mockReadFile.mockResolvedValue(noIdYaml)

    const result = await listProjectTemplates(projectPath)

    expect(result).toHaveLength(0)
  })
})
