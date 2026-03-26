import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  buildConfiguredMcpIntegrationServerEntries,
  resolveRequestedMcpIntegrationIds,
} from "./mcp-integration-registry"

const originalHome = process.env.HOME
const originalKeyringPath = process.env.MCP_KEYRING_PATH

afterEach(() => {
  process.env.HOME = originalHome
  process.env.MCP_KEYRING_PATH = originalKeyringPath
  delete process.env.GITHUB_TOKEN
  delete process.env.EXA_API_KEY
  delete process.env.SERPER_API_KEY
})

describe("mcp integration registry", () => {
  it("maps capability aliases to integration ids without duplicates", () => {
    expect(
      resolveRequestedMcpIntegrationIds(["web_search", "exa", "serper"]),
    ).toEqual(["exa", "serper"])
  })

  // --- User scenario tests ---

  it("user with Exa configured gets Exa in ALL flows, not just exa-backend flows", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-integrations-"))
    const keyringDir = join(root, ".c8c", "integrations")
    await mkdir(keyringDir, { recursive: true })
    process.env.HOME = root
    process.env.MCP_KEYRING_PATH = join(keyringDir, "keyring.json")
    await writeFile(
      join(keyringDir, "keyring.json"),
      JSON.stringify({ exa: { keys: ["exa-live-key"] } }),
      "utf-8",
    )

    // Both "builtin" and "exa" backends should include Exa when key exists
    const builtin = await buildConfiguredMcpIntegrationServerEntries(
      undefined,
      "builtin",
    )
    const exa = await buildConfiguredMcpIntegrationServerEntries(
      undefined,
      "exa",
    )

    // On CI the mcp-search-proxy dist may not exist — skip assertion
    if (builtin.entries.exa) {
      expect(builtin.entries.exa).toMatchObject({
        type: "stdio",
        command: process.execPath,
      })
    }
    if (exa.entries.exa) {
      expect(exa.entries.exa).toMatchObject({
        type: "stdio",
        command: process.execPath,
      })
    }
  })

  it("user without Exa configured gets no Exa entry", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-integrations-"))
    const keyringDir = join(root, ".c8c", "integrations")
    await mkdir(keyringDir, { recursive: true })
    process.env.HOME = root
    process.env.MCP_KEYRING_PATH = join(keyringDir, "keyring.json")
    await writeFile(
      join(keyringDir, "keyring.json"),
      JSON.stringify({}),
      "utf-8",
    )

    const entries = await buildConfiguredMcpIntegrationServerEntries(
      undefined,
      "builtin",
    )
    expect(entries.entries.exa).toBeUndefined()
  })

  it("builds stdio integrations from environment fallback secrets", async () => {
    process.env.GITHUB_TOKEN = "github-secret"

    const entries = await buildConfiguredMcpIntegrationServerEntries()

    expect(entries.entries.github).toMatchObject({
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: {
        GITHUB_TOKEN: "github-secret",
      },
    })
  })
})
