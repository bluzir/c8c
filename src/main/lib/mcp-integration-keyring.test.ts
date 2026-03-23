import { readFile } from "node:fs/promises"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  loadMcpIntegrationKeyring,
  resolveDefaultMcpIntegrationKeyringPath,
  saveMcpIntegrationValues,
} from "./mcp-integration-keyring"

const originalHome = process.env.HOME
const originalKeyringPath = process.env.MCP_KEYRING_PATH
const tempDirs: string[] = []

afterEach(async () => {
  process.env.HOME = originalHome
  process.env.MCP_KEYRING_PATH = originalKeyringPath
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

describe("mcp integration keyring", () => {
  it("stores integration secrets in the home keyring path", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-keyring-home-"))
    tempDirs.push(root)
    process.env.HOME = root
    process.env.MCP_KEYRING_PATH = join(
      root,
      ".c8c",
      "integrations",
      "keyring.json",
    )

    const saved = await saveMcpIntegrationValues("exa", {
      secret: "exa-live-key",
    })

    expect(saved.filePath).toBe(resolveDefaultMcpIntegrationKeyringPath())
    await expect(readFile(saved.filePath, "utf8")).resolves.toContain(
      '"exa-live-key"',
    )

    await expect(loadMcpIntegrationKeyring()).resolves.toMatchObject({
      filePath: resolveDefaultMcpIntegrationKeyringPath(),
      keyring: {
        exa: {
          keys: ["exa-live-key"],
        },
      },
    })
  })
})
