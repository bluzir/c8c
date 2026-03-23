import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const electronState = {
  homeDir: "",
  encryptionAvailable: true,
  encryptString: vi.fn((value: string) =>
    Buffer.from(`encrypted:${value}`, "utf8"),
  ),
  decryptString: vi.fn((value: Buffer) => {
    const decoded = value.toString("utf8")
    if (!decoded.startsWith("encrypted:")) {
      throw new Error("Unexpected encrypted payload")
    }
    return decoded.slice("encrypted:".length)
  }),
}

import {
  __setProviderSettingsTestBindings,
  getCodexApiKey,
  getProviderSettings,
  setCodexApiKey,
  updateProviderSettings,
} from "./provider-settings"

function providerSettingsDir(homeDir: string): string {
  return join(homeDir, ".c8c")
}

function providerSettingsFile(homeDir: string): string {
  return join(providerSettingsDir(homeDir), "provider-settings.json")
}

describe("main provider-settings", () => {
  let homeDir: string

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "main-provider-settings-"))
    electronState.homeDir = homeDir
    electronState.encryptionAvailable = true
    electronState.encryptString.mockClear()
    electronState.decryptString.mockClear()
    process.env.C8C_TEST_HOME_DIR = homeDir
    __setProviderSettingsTestBindings({
      app: {
        getPath: () => electronState.homeDir,
      },
      safeStorage: {
        isEncryptionAvailable: () => electronState.encryptionAvailable,
        encryptString: (value: string) => electronState.encryptString(value),
        decryptString: (value: Buffer) => electronState.decryptString(value),
      },
    })
  })

  afterEach(async () => {
    __setProviderSettingsTestBindings(null)
    delete process.env.C8C_TEST_HOME_DIR
    await rm(homeDir, { recursive: true, force: true })
  })

  it("stores Codex API keys encrypted with restricted file permissions", async () => {
    await expect(setCodexApiKey("  sk-test  ")).resolves.toBe(true)

    const raw = await readFile(providerSettingsFile(homeDir), "utf8")
    const parsed = JSON.parse(raw) as {
      codexApiKey?: string
      codexApiKeyEncrypted?: string
    }

    expect(parsed.codexApiKey).toBeUndefined()
    expect(parsed.codexApiKeyEncrypted).toBeTruthy()
    expect(await getCodexApiKey()).toBe("sk-test")

    const fileMode = (await stat(providerSettingsFile(homeDir))).mode & 0o777
    const dirMode = (await stat(providerSettingsDir(homeDir))).mode & 0o777
    expect(fileMode).toBe(0o600)
    expect(dirMode).toBe(0o700)
  })

  it("refuses to persist new secrets when secure storage is unavailable", async () => {
    electronState.encryptionAvailable = false

    await expect(setCodexApiKey("sk-test")).rejects.toThrow(
      "Secure credential storage is unavailable on this system.",
    )
    await expect(access(providerSettingsFile(homeDir))).rejects.toThrow()
  })

  it("still allows non-secret settings updates when no secret is present", async () => {
    electronState.encryptionAvailable = false

    await expect(
      updateProviderSettings({ defaultProvider: "codex" }),
    ).resolves.toMatchObject({
      defaultProvider: "codex",
    })

    const raw = await readFile(providerSettingsFile(homeDir), "utf8")
    const parsed = JSON.parse(raw) as {
      codexApiKey?: string
      codexApiKeyEncrypted?: string
    }
    expect(parsed.codexApiKey).toBeUndefined()
    expect(parsed.codexApiKeyEncrypted).toBeUndefined()
  })

  it("returns undefined for encrypted payloads when secure storage later becomes unavailable", async () => {
    await setCodexApiKey("sk-test")
    electronState.encryptionAvailable = false

    await expect(getCodexApiKey()).resolves.toBeUndefined()
  })

  it("normalizes malformed persisted payloads and trims legacy plaintext keys on read", async () => {
    await mkdir(providerSettingsDir(homeDir), { recursive: true, mode: 0o700 })
    await writeFile(
      providerSettingsFile(homeDir),
      JSON.stringify({
        defaultProvider: "not-a-provider",
        safetyProfile: "not-a-profile",
        features: {
          codexProvider: "yes",
        },
        codexApiKey: "  legacy-key  ",
      }),
      "utf8",
    )

    await expect(getProviderSettings()).resolves.toEqual({
      defaultProvider: "claude",
      safetyProfile: "workspace_auto",
      features: {
        codexProvider: true,
      },
    })
    await expect(getCodexApiKey()).resolves.toBe("legacy-key")
  })
})
