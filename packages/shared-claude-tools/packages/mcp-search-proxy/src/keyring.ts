import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

export type ProviderName = "exa" | "serper"

type KeyringFile = {
  exa?: { keys?: string[] } | string[] | undefined
  serper?: { keys?: string[] } | string[] | undefined
}

export type ProviderKeyConfig = {
  keys: string[]
}

export type Keyring = Partial<Record<ProviderName, ProviderKeyConfig>>

function normalizeProvider(
  v: KeyringFile[ProviderName],
): ProviderKeyConfig | null {
  if (!v) return null
  if (Array.isArray(v)) {
    return { keys: v.filter(Boolean) }
  }
  if (typeof v === "object" && Array.isArray(v.keys)) {
    return { keys: v.keys.filter(Boolean) }
  }
  return null
}

function findUpwards(startDir: string, relativePath: string): string | null {
  let dir = resolve(startDir)
  while (true) {
    const candidate = join(dir, relativePath)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export async function loadKeyring(): Promise<Keyring> {
  const envPath = process.env.MCP_KEYRING_PATH?.trim()
  const filePath =
    (envPath && existsSync(envPath) ? envPath : null) ??
    findUpwards(process.cwd(), "data/config/mcp-keyring.json") ??
    findUpwards(process.cwd(), "data/mcp-keyring.json")

  if (!filePath) {
    throw new Error(
      [
        "Missing MCP keyring file.",
        "Create `data/config/mcp-keyring.json` (gitignored) with keys for providers.",
        "Example template: `config/mcp-keyring.example.json`.",
        "Optional: set MCP_KEYRING_PATH to an absolute path.",
      ].join(" "),
    )
  }

  const raw = await readFile(filePath, "utf8")
  const parsed = JSON.parse(raw) as KeyringFile

  const exa = normalizeProvider(parsed.exa)
  const serper = normalizeProvider(parsed.serper)

  const keyring: Keyring = {}
  if (exa?.keys?.length) keyring.exa = exa
  if (serper?.keys?.length) keyring.serper = serper

  return keyring
}

export async function loadProviderKeys(
  provider: ProviderName,
): Promise<string[]> {
  try {
    const keyring = await loadKeyring()
    const keys = keyring[provider]?.keys ?? []
    if (keys.length) return keys
  } catch {
    // Fall through to env var fallback.
  }

  const env = process.env
  const keysFromEnv =
    provider === "exa"
      ? (env.EXA_API_KEYS ?? env.EXA_API_KEY ?? "")
      : (env.SERPER_API_KEYS ?? env.SERPER_API_KEY ?? "")

  const parsed = keysFromEnv
    .split(/[,\\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean)

  if (parsed.length) return parsed

  throw new Error(
    [
      `No API keys configured for provider "${provider}".`,
      "Option A: create `data/config/mcp-keyring.json` (template: `config/mcp-keyring.example.json`).",
      `Option B: set env var ${provider === "exa" ? "EXA_API_KEYS/EXA_API_KEY" : "SERPER_API_KEYS/SERPER_API_KEY"}.`,
    ].join(" "),
  )
}

export type KeyBadness =
  | "auth"
  | "quota"
  | "rate_limit"
  | "transport"
  | "unknown"

type KeyState = {
  blockedUntilMs: number
  lastBadness?: KeyBadness
  lastErrorAtMs?: number
}

export class KeyPool {
  private keys: string[]
  private i = 0
  private state = new Map<string, KeyState>()

  constructor(keys: string[]) {
    this.keys = [...keys].filter(Boolean)
    if (this.keys.length === 0) {
      throw new Error("KeyPool requires at least one key.")
    }
  }

  pick(nowMs = Date.now()): string {
    for (let attempts = 0; attempts < this.keys.length; attempts++) {
      const key = this.keys[this.i++ % this.keys.length]!
      const st = this.state.get(key)
      if (!st || st.blockedUntilMs <= nowMs) return key
    }
    return this.keys[this.i++ % this.keys.length]!
  }

  block(key: string, badness: KeyBadness, cooldownMs: number) {
    const now = Date.now()
    const prev = this.state.get(key)
    const blockedUntilMs = Math.max(prev?.blockedUntilMs ?? 0, now + cooldownMs)
    this.state.set(key, {
      blockedUntilMs,
      lastBadness: badness,
      lastErrorAtMs: now,
    })
  }

  keysCount(): number {
    return this.keys.length
  }
}
