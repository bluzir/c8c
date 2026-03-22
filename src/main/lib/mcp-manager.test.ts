import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { McpServerInfo } from "@shared/types"

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function waitForWriteCount(expected: number): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (testState.writeCallCount === expected) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  expect(testState.writeCallCount).toBe(expected)
}

const execClaudeMock = vi.fn()
const logWarnMock = vi.fn()
const testState = vi.hoisted(() => ({
  homeDir: "",
  writeCallCount: 0,
  delayFirstWrite: false,
  firstWriteGate: null as null | ReturnType<typeof deferred<void>>,
}))

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os")
  return {
    ...actual,
    homedir: () => testState.homeDir,
  }
})

vi.mock("./claude-cli", () => ({
  execClaude: (...args: unknown[]) => execClaudeMock(...args),
}))

vi.mock("./structured-log", () => ({
  logWarn: (...args: unknown[]) => logWarnMock(...args),
}))

vi.mock("./atomic-write", async () => {
  const { mkdir, writeFile } = await import("node:fs/promises")
  const { dirname } = await import("node:path")
  return {
    writeFileAtomic: async (filePath: string, content: string) => {
      testState.writeCallCount += 1
      if (testState.delayFirstWrite && testState.writeCallCount === 1 && testState.firstWriteGate) {
        await testState.firstWriteGate.promise
      }
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, content, "utf8")
    },
  }
})

async function loadMcpManager() {
  return import("./mcp-manager")
}

function createServer(overrides: Partial<McpServerInfo>): McpServerInfo {
  return {
    name: "server",
    scope: "user",
    type: "stdio",
    ...overrides,
  }
}

describe("mcp-manager", () => {
  let root: string
  let projectPath: string

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    root = await mkdtemp(join(tmpdir(), "mcp-manager-test-"))
    projectPath = join(root, "project")
    await mkdir(projectPath, { recursive: true })
    testState.homeDir = join(root, "home")
    testState.writeCallCount = 0
    testState.delayFirstWrite = false
    testState.firstWriteGate = null
    execClaudeMock.mockReset()
    logWarnMock.mockReset()
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("lists local, project, and user MCP servers with inferred transport", async () => {
    await writeFile(
      join(projectPath, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          localNode: {
            command: "node",
            args: ["./local.js"],
          },
        },
      }, null, 2),
      "utf8",
    )

    await mkdir(testState.homeDir, { recursive: true })
    await writeFile(
      join(testState.homeDir, ".claude.json"),
      JSON.stringify({
        mcpServers: {
          userHttp: {
            type: "http",
            url: "https://example.com/mcp",
          },
        },
        projects: {
          [projectPath]: {
            mcpServers: {
              projectSse: {
                url: "https://example.com/sse",
              },
            },
          },
        },
      }, null, 2),
      "utf8",
    )

    const { listMcpServers } = await loadMcpManager()
    const servers = await listMcpServers(projectPath)

    expect(servers).toEqual([
      createServer({
        name: "localNode",
        scope: "local",
        type: "stdio",
        command: "node",
        args: ["./local.js"],
      }),
      createServer({
        name: "projectSse",
        scope: "project",
        type: "sse",
        url: "https://example.com/sse",
      }),
      createServer({
        name: "userHttp",
        scope: "user",
        type: "http",
        url: "https://example.com/mcp",
      }),
    ])
  })

  it("parses tool output from `claude mcp get` via testMcpServer", async () => {
    execClaudeMock.mockResolvedValue({
      stdout: [
        "Server: github",
        "Type: stdio",
        "Tools:",
        "- search: Search GitHub",
        "* fetch",
        "issues - Manage issues",
        "---",
      ].join("\n"),
      stderr: "",
    })

    const { testMcpServer } = await loadMcpManager()
    const result = await testMcpServer("github", "user")

    expect(execClaudeMock).toHaveBeenCalledWith(["mcp", "get", "github"], {
      cwd: undefined,
      timeout: 30_000,
    })
    expect(result).toEqual({
      healthy: true,
      latencyMs: expect.any(Number),
      tools: [
        {
          name: "search",
          serverName: "github",
          qualifiedName: "mcp__github__search",
          description: "Search GitHub",
        },
        {
          name: "fetch",
          serverName: "github",
          qualifiedName: "mcp__github__fetch",
          description: undefined,
        },
        {
          name: "issues",
          serverName: "github",
          qualifiedName: "mcp__github__issues",
          description: "Manage issues",
        },
      ],
    })
  })

  it("reuses cached healthy discovery results per project", async () => {
    await mkdir(testState.homeDir, { recursive: true })
    await writeFile(
      join(testState.homeDir, ".claude.json"),
      JSON.stringify({
        mcpServers: {
          github: { command: "node", args: ["./github.js"] },
        },
      }, null, 2),
      "utf8",
    )

    execClaudeMock.mockResolvedValue({
      stdout: "Tools:\n- search: Search GitHub\n",
      stderr: "",
    })

    const { discoverMcpTools } = await loadMcpManager()
    const first = await discoverMcpTools(undefined, projectPath)
    const second = await discoverMcpTools(undefined, projectPath)

    expect(first).toEqual(second)
    expect(execClaudeMock).toHaveBeenCalledTimes(1)
  })

  it("invalidates cached discovery after a server mutation succeeds", async () => {
    await mkdir(testState.homeDir, { recursive: true })
    await writeFile(
      join(testState.homeDir, ".claude.json"),
      JSON.stringify({
        mcpServers: {
          github: { command: "node", args: ["./github.js"] },
        },
      }, null, 2),
      "utf8",
    )

    execClaudeMock
      .mockResolvedValueOnce({
        stdout: "Tools:\n- search: Search GitHub\n",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "Tools:\n- fetch: Fetch issue\n",
        stderr: "",
      })

    const { addMcpServer, discoverMcpTools } = await loadMcpManager()
    await discoverMcpTools(undefined, projectPath)
    await expect(addMcpServer(createServer({
      name: "github",
      scope: "user",
      type: "stdio",
      command: "node",
      args: ["./github.js"],
    }))).resolves.toEqual({ success: true })

    await expect(discoverMcpTools(undefined, projectPath)).resolves.toEqual([
      {
        name: "fetch",
        serverName: "github",
        qualifiedName: "mcp__github__fetch",
        description: "Fetch issue",
      },
    ])
    expect(execClaudeMock).toHaveBeenCalledTimes(3)
  })

  it("serializes concurrent user-scope mutations so updates are not lost", async () => {
    await mkdir(testState.homeDir, { recursive: true })
    const claudeConfigPath = join(testState.homeDir, ".claude.json")
    await writeFile(
      claudeConfigPath,
      JSON.stringify({
        mcpServers: {
          alpha: { command: "node", args: ["./alpha.js"] },
          beta: { command: "node", args: ["./beta.js"] },
        },
      }, null, 2),
      "utf8",
    )

    testState.delayFirstWrite = true
    testState.firstWriteGate = deferred<void>()

    const { toggleMcpServer } = await loadMcpManager()
    const first = toggleMcpServer("alpha", "user", true)
    const second = toggleMcpServer("beta", "user", true)

    await waitForWriteCount(1)

    testState.firstWriteGate.resolve()
    await expect(Promise.all([first, second])).resolves.toEqual([
      { success: true },
      { success: true },
    ])

    expect(testState.writeCallCount).toBe(2)

    const parsed = JSON.parse(await readFile(claudeConfigPath, "utf8")) as {
      mcpServers: Record<string, { disabled?: boolean }>
    }
    expect(parsed.mcpServers.alpha?.disabled).toBe(true)
    expect(parsed.mcpServers.beta?.disabled).toBe(true)
  })
})
