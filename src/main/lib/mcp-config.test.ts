import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const listApprovedPluginMcpServersMock = vi.fn<
  () => Promise<
    Array<{
      info: { name: string }
      entry: Record<string, unknown>
    }>
  >
>()

vi.mock("./plugin-mcp", () => ({
  listApprovedPluginMcpServers: () => listApprovedPluginMcpServersMock(),
}))

import {
  buildClaudeExtraArgs,
  buildClaudeSdkMcpServers,
  buildProviderExtraArgs,
  invalidateMcpConfigCache,
  prepareTemporaryMcpConfig,
  prepareWorkspaceMcpConfig,
} from "./mcp-config"

describe("buildProviderExtraArgs", () => {
  it("adds mcp config path for Claude when provided", () => {
    expect(buildProviderExtraArgs("claude", "/tmp/.mcp.json")).toEqual([
      "--verbose",
      "--output-format",
      "stream-json",
      "--mcp-config=/tmp/.mcp.json",
    ])
  })

  it("keeps Claude alias behavior for existing callers", () => {
    expect(buildClaudeExtraArgs("/tmp/.mcp.json")).toEqual(
      buildProviderExtraArgs("claude", "/tmp/.mcp.json"),
    )
  })

  it("reuses cached codex MCP overrides after a prepared config is written", async () => {
    listApprovedPluginMcpServersMock.mockResolvedValue([])
    const root = await mkdtemp(join(tmpdir(), "mcp-config-cache-test-"))
    const project = join(root, "project")
    const workspace = join(root, "workspace")
    await mkdir(project, { recursive: true })
    await mkdir(workspace, { recursive: true })
    process.env.MCP_KEYRING_PATH = join(
      root,
      ".c8c",
      "integrations",
      "keyring.json",
    )

    await writeFile(
      join(project, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          github: {
            command: "node",
            args: ["./server.js"],
          },
        },
      }),
      "utf-8",
    )

    const path = await prepareWorkspaceMcpConfig(workspace, project, "builtin")
    expect(path).toBeTruthy()

    expect(buildProviderExtraArgs("codex", path!)).toEqual([
      "-c",
      'mcp_servers."github".command="node"',
      "-c",
      'mcp_servers."github".args=["./server.js"]',
    ])
  })

  it("skips malformed MCP entries when building codex overrides", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-config-invalid-codex-"))
    const mcpPath = join(root, ".mcp.json")

    await writeFile(
      mcpPath,
      JSON.stringify({
        mcpServers: {
          valid: {
            command: "node",
            args: ["./server.js"],
          },
          invalidMixed: {
            command: "node",
            url: "https://example.com/mcp",
          },
          invalidArgs: {
            command: "node",
            args: ["ok", 42],
          },
        },
      }),
      "utf-8",
    )

    expect(buildProviderExtraArgs("codex", mcpPath)).toEqual([
      "-c",
      'mcp_servers."valid".command="node"',
      "-c",
      'mcp_servers."valid".args=["./server.js"]',
    ])
  })
})

describe("prepareWorkspaceMcpConfig", () => {
  const originalHome = process.env.HOME
  const originalKeyringPath = process.env.MCP_KEYRING_PATH

  beforeEach(() => {
    listApprovedPluginMcpServersMock.mockResolvedValue([])
    process.env.HOME = originalHome
    process.env.MCP_KEYRING_PATH = originalKeyringPath
  })

  it("copies project mcp config into workspace for builtin backend", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-config-test-"))
    const project = join(root, "project")
    const workspace = join(root, "workspace")
    await mkdir(project, { recursive: true })
    await mkdir(workspace, { recursive: true })
    process.env.MCP_KEYRING_PATH = join(
      root,
      ".c8c",
      "integrations",
      "keyring.json",
    )

    await writeFile(
      join(project, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          local: {
            command: "node",
            args: ["./local-server.js"],
          },
        },
      }),
      "utf-8",
    )

    const path = await prepareWorkspaceMcpConfig(workspace, project, "builtin")
    expect(path).toBe(join(workspace, ".mcp.json"))
    const parsed = JSON.parse(await readFile(path!, "utf-8")) as {
      mcpServers: Record<string, { command: string }>
    }
    expect(parsed.mcpServers.local?.command).toBe("node")
  })

  it("injects registry-backed Exa proxy when the integration is configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-config-test-"))
    const workspace = join(root, "workspace")
    const keyringDir = join(root, ".c8c", "integrations")
    await mkdir(workspace, { recursive: true })
    await mkdir(keyringDir, { recursive: true })
    process.env.HOME = root
    process.env.MCP_KEYRING_PATH = join(keyringDir, "keyring.json")
    await writeFile(
      join(keyringDir, "keyring.json"),
      JSON.stringify({
        exa: {
          keys: ["exa-live-key"],
        },
      }),
      "utf-8",
    )

    const path = await prepareWorkspaceMcpConfig(workspace, undefined, "exa")
    expect(path).toBe(join(workspace, ".mcp.json"))
    const parsed = JSON.parse(await readFile(path!, "utf-8")) as {
      mcpServers: Record<
        string,
        { command: string; args?: string[]; env?: Record<string, string> }
      >
    }
    expect(parsed.mcpServers.exa).toBeDefined()
    expect(parsed.mcpServers.exa.command).toBe(process.execPath)
    expect(parsed.mcpServers.exa.args?.[0]).toContain("mcp-search-proxy")
    expect(parsed.mcpServers.exa.env?.ELECTRON_RUN_AS_NODE).toBe("1")
    expect(parsed.mcpServers.exa.env?.MCP_KEYRING_PATH).toContain(
      ".c8c/integrations/keyring.json",
    )
  })

  it("keeps an explicit project exa server instead of overriding it with the registry entry", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-config-test-"))
    const project = join(root, "project")
    const workspace = join(root, "workspace")
    const keyringDir = join(root, ".c8c", "integrations")
    await mkdir(project, { recursive: true })
    await mkdir(workspace, { recursive: true })
    await mkdir(keyringDir, { recursive: true })
    process.env.HOME = root
    process.env.MCP_KEYRING_PATH = join(keyringDir, "keyring.json")
    await writeFile(
      join(keyringDir, "keyring.json"),
      JSON.stringify({
        exa: {
          keys: ["exa-live-key"],
        },
      }),
      "utf-8",
    )

    await writeFile(
      join(project, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          exa: {
            type: "http",
            url: "https://example.com/mcp",
            headers: {
              Authorization: "Bearer token",
            },
          },
        },
      }),
      "utf-8",
    )

    const path = await prepareWorkspaceMcpConfig(workspace, project, "exa")
    const parsed = JSON.parse(await readFile(path!, "utf-8")) as {
      mcpServers: Record<
        string,
        {
          type?: string
          command?: string
          url?: string
          headers?: Record<string, string>
        }
      >
    }

    expect(parsed.mcpServers.exa.type).toBe("http")
    expect(parsed.mcpServers.exa.url).toBe("https://example.com/mcp")
    expect(parsed.mcpServers.exa.command).toBeUndefined()
    expect(parsed.mcpServers.exa.headers).toEqual({
      Authorization: "Bearer token",
    })
  })

  it("injects registry-backed Serper proxy when configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-config-test-"))
    const workspace = join(root, "workspace")
    const keyringDir = join(root, ".c8c", "integrations")
    await mkdir(workspace, { recursive: true })
    await mkdir(keyringDir, { recursive: true })
    process.env.HOME = root
    process.env.MCP_KEYRING_PATH = join(keyringDir, "keyring.json")
    await writeFile(
      join(keyringDir, "keyring.json"),
      JSON.stringify({
        serper: {
          keys: ["serper-live-key"],
        },
      }),
      "utf-8",
    )

    const path = await prepareWorkspaceMcpConfig(
      workspace,
      undefined,
      "builtin",
    )
    // On CI the mcp-search-proxy dist may not exist — config won't be written
    if (!path) return
    expect(path).toBe(join(workspace, ".mcp.json"))
    const parsed = JSON.parse(await readFile(path, "utf-8")) as {
      mcpServers: Record<
        string,
        { command: string; args?: string[]; env?: Record<string, string> }
      >
    }

    expect(parsed.mcpServers.serper).toBeDefined()
    expect(parsed.mcpServers.serper.command).toBe(process.execPath)
    expect(parsed.mcpServers.serper.args?.[0]).toContain("mcp-search-proxy")
  })

  it("merges approved plugin MCP servers without overriding project config", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-config-test-"))
    const project = join(root, "project")
    const workspace = join(root, "workspace")
    await mkdir(project, { recursive: true })
    await mkdir(workspace, { recursive: true })

    await writeFile(
      join(project, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          github: {
            command: "node",
            args: ["./project-github.js"],
          },
        },
      }),
      "utf-8",
    )

    listApprovedPluginMcpServersMock.mockResolvedValue([
      {
        info: { name: "github" },
        entry: {
          command: "node",
          args: ["./plugin-github.js"],
        },
      },
      {
        info: { name: "exa" },
        entry: {
          command: "node",
          args: ["./plugin-exa.js"],
        },
      },
    ])

    const path = await prepareWorkspaceMcpConfig(workspace, project, "builtin")
    const parsed = JSON.parse(await readFile(path!, "utf-8")) as {
      mcpServers: Record<string, { command: string; args?: string[] }>
    }

    expect(parsed.mcpServers.github?.args).toEqual(["./project-github.js"])
    expect(parsed.mcpServers.exa?.args).toEqual(["./plugin-exa.js"])
  })
})

describe("prepareTemporaryMcpConfig", () => {
  beforeEach(() => {
    listApprovedPluginMcpServersMock.mockResolvedValue([])
  })

  it("creates an ephemeral config when plugin MCP servers are approved", async () => {
    listApprovedPluginMcpServersMock.mockResolvedValue([
      {
        info: { name: "github" },
        entry: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
        },
      },
    ])

    const handle = await prepareTemporaryMcpConfig(undefined, "builtin")
    expect(handle.path).toBeTruthy()

    const parsed = JSON.parse(await readFile(handle.path!, "utf-8")) as {
      mcpServers: Record<string, { command: string; args?: string[] }>
    }
    expect(parsed.mcpServers.github?.command).toBe("npx")
    expect(parsed.mcpServers.github?.args).toEqual([
      "-y",
      "@modelcontextprotocol/server-github",
    ])

    await handle.cleanup()
  })

  it("skips invalid approved plugin MCP entries", async () => {
    listApprovedPluginMcpServersMock.mockResolvedValue([
      {
        info: { name: "github" },
        entry: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
        },
      },
      {
        info: { name: "broken" },
        entry: {
          command: "npx",
          url: "https://example.com/mcp",
        },
      },
    ])

    const handle = await prepareTemporaryMcpConfig(undefined, "builtin")
    expect(handle.path).toBeTruthy()

    const parsed = JSON.parse(await readFile(handle.path!, "utf-8")) as {
      mcpServers: Record<string, { command?: string; url?: string }>
    }
    expect(parsed.mcpServers.github).toBeDefined()
    expect(parsed.mcpServers.broken).toBeUndefined()

    await handle.cleanup()
  })
})

describe("buildClaudeSdkMcpServers", () => {
  it("maps stdio and http servers from .mcp.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-sdk-test-"))
    const mcpPath = join(root, ".mcp.json")

    await writeFile(
      mcpPath,
      JSON.stringify({
        mcpServers: {
          stdioServer: {
            command: "node",
            args: ["./server.js"],
            env: {
              TOKEN: "secret",
              MODE: "test",
            },
          },
          httpServer: {
            type: "http",
            url: "https://example.com/mcp",
            headers: {
              Authorization: "Bearer token",
            },
          },
          disabledServer: {
            command: "node",
            disabled: true,
          },
        },
      }),
      "utf-8",
    )

    expect(buildClaudeSdkMcpServers(mcpPath)).toEqual({
      stdioServer: {
        type: "stdio",
        command: "node",
        args: ["./server.js"],
        env: {
          TOKEN: "secret",
          MODE: "test",
        },
      },
      httpServer: {
        type: "http",
        url: "https://example.com/mcp",
        headers: {
          Authorization: "Bearer token",
        },
      },
    })
  })

  it("rejects contradictory or malformed transport shapes from .mcp.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-sdk-invalid-"))
    const mcpPath = join(root, ".mcp.json")

    await writeFile(
      mcpPath,
      JSON.stringify({
        mcpServers: {
          validRemote: {
            type: "http",
            url: "https://example.com/mcp",
            headers: {
              Authorization: "Bearer token",
            },
          },
          mixed: {
            command: "node",
            url: "https://example.com/mcp",
          },
          invalidEnv: {
            command: "node",
            env: {
              TOKEN: "secret",
              RETRIES: 3,
            },
          },
        },
      }),
      "utf-8",
    )

    expect(buildClaudeSdkMcpServers(mcpPath)).toEqual({
      validRemote: {
        type: "http",
        url: "https://example.com/mcp",
        headers: {
          Authorization: "Bearer token",
        },
      },
    })
  })

  it("drops cached config after explicit invalidation", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-sdk-invalidate-"))
    const mcpPath = join(root, ".mcp.json")

    await writeFile(
      mcpPath,
      JSON.stringify({
        mcpServers: {
          github: {
            command: "node",
            args: ["./v1.js"],
          },
        },
      }),
      "utf-8",
    )

    expect(buildClaudeSdkMcpServers(mcpPath)).toEqual({
      github: {
        type: "stdio",
        command: "node",
        args: ["./v1.js"],
        env: undefined,
      },
    })

    // Explicit invalidation clears the cache entry so the next read
    // re-parses the file from disk regardless of mtime
    invalidateMcpConfigCache(mcpPath)

    await writeFile(
      mcpPath,
      JSON.stringify({
        mcpServers: {
          github: {
            command: "node",
            args: ["./v2.js"],
          },
        },
      }),
      "utf-8",
    )

    expect(buildClaudeSdkMcpServers(mcpPath)).toEqual({
      github: {
        type: "stdio",
        command: "node",
        args: ["./v2.js"],
        env: undefined,
      },
    })
  })
})
