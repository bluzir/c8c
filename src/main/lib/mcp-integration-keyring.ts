import { existsSync } from "node:fs"
import { mkdir, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { writeFileAtomic } from "./atomic-write"

export interface McpIntegrationKeyringEntry {
  keys: string[]
  config?: Record<string, string>
}

type RawMcpIntegrationKeyringEntry =
  | {
      keys?: string[]
      config?: Record<string, string>
    }
  | string[]
  | undefined

type McpIntegrationKeyringFile = Record<
  string,
  RawMcpIntegrationKeyringEntry | undefined
>

const MAX_SECRET_LENGTH = 8192

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(
      (item, index, all) => item.length > 0 && all.indexOf(item) === index,
    )
}

function normalizeConfig(value: unknown): Record<string, string> | undefined {
  if (!isObject(value)) return undefined
  const entries = Object.entries(value)
    .map(
      ([key, item]) =>
        [key.trim(), typeof item === "string" ? item.trim() : ""] as const,
    )
    .filter(([key, item]) => key.length > 0 && item.length > 0)
  if (entries.length === 0) return undefined
  return Object.fromEntries(entries)
}

function normalizeEntry(
  value: RawMcpIntegrationKeyringEntry,
): McpIntegrationKeyringEntry | null {
  if (Array.isArray(value)) {
    const keys = normalizeKeys(value)
    return keys.length > 0 ? { keys } : null
  }
  if (!isObject(value)) return null
  const keys = normalizeKeys(value.keys)
  const config = normalizeConfig(value.config)
  if (keys.length === 0 && !config) return null
  return {
    keys,
    config,
  }
}

function findUpwards(
  startDir: string,
  relativePath: string,
): string | undefined {
  let dir = resolve(startDir)
  while (true) {
    const candidate = join(dir, relativePath)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

export function resolveDefaultMcpIntegrationKeyringPath(): string {
  return join(homedir(), ".c8c", "integrations", "keyring.json")
}

function resolveLegacyMcpKeyringCandidates(projectPath?: string): string[] {
  return [
    projectPath
      ? findUpwards(projectPath, "data/config/mcp-keyring.json")
      : undefined,
    projectPath ? findUpwards(projectPath, "data/mcp-keyring.json") : undefined,
    findUpwards(process.cwd(), "data/config/mcp-keyring.json"),
    findUpwards(process.cwd(), "data/mcp-keyring.json"),
    resolve(process.cwd(), "../agents-os/data/config/mcp-keyring.json"),
    resolve(process.cwd(), "../agent-os/data/config/mcp-keyring.json"),
  ].filter((value): value is string => Boolean(value))
}

async function readKeyringFile(
  filePath: string,
): Promise<McpIntegrationKeyringFile> {
  if (!existsSync(filePath)) return {}
  const raw = await readFile(filePath, "utf8")
  const parsed = JSON.parse(raw) as unknown
  return isObject(parsed) ? (parsed as McpIntegrationKeyringFile) : {}
}

export async function loadMcpIntegrationKeyring(projectPath?: string): Promise<{
  filePath: string
  keyring: Record<string, McpIntegrationKeyringEntry>
}> {
  const defaultPath = resolveDefaultMcpIntegrationKeyringPath()
  const envOverride = process.env.MCP_KEYRING_PATH?.trim()
  const filePath = envOverride
    ? envOverride
    : ([defaultPath, ...resolveLegacyMcpKeyringCandidates(projectPath)].find(
        (candidate) => existsSync(candidate),
      ) ?? defaultPath)
  const rawKeyring = await readKeyringFile(filePath)
  const keyring = Object.fromEntries(
    Object.entries(rawKeyring)
      .map(
        ([providerId, value]) =>
          [providerId.trim(), normalizeEntry(value)] as const,
      )
      .filter(
        (entry): entry is [string, McpIntegrationKeyringEntry] =>
          entry[0].length > 0 && entry[1] !== null,
      ),
  )

  return {
    filePath,
    keyring,
  }
}

export async function saveMcpIntegrationValues(
  integrationId: string,
  input: {
    secret?: string
    config?: Record<string, string>
  },
  projectPath?: string,
): Promise<{
  filePath: string
  entry: McpIntegrationKeyringEntry
}> {
  const providerId = integrationId.trim()
  if (!providerId) {
    throw new Error("Integration id is required.")
  }

  const nextSecret = input.secret?.trim() ?? ""
  if (nextSecret.length > MAX_SECRET_LENGTH) {
    throw new Error(
      `Integration secret must be ${MAX_SECRET_LENGTH} characters or fewer.`,
    )
  }

  const { keyring } = await loadMcpIntegrationKeyring(projectPath)
  const defaultPath = resolveDefaultMcpIntegrationKeyringPath()
  const current = keyring[providerId] ?? { keys: [] }
  const keys =
    nextSecret.length > 0
      ? [nextSecret, ...current.keys.filter((value) => value !== nextSecret)]
      : current.keys
  const config = normalizeConfig(input.config) ?? current.config
  const nextEntry: McpIntegrationKeyringEntry = {
    keys,
    ...(config ? { config } : {}),
  }
  const nextKeyring = {
    ...keyring,
    [providerId]: nextEntry,
  }

  await mkdir(dirname(defaultPath), { recursive: true })
  await writeFileAtomic(
    defaultPath,
    `${JSON.stringify(nextKeyring, null, 2)}\n`,
    { mode: 0o600 },
  )

  return {
    filePath: defaultPath,
    entry: nextEntry,
  }
}

export function parseSecretsFromEnv(envValue: string | undefined): string[] {
  return (envValue ?? "")
    .split(/[,\s]+/g)
    .map((value) => value.trim())
    .filter(Boolean)
}
