import { access, mkdir, readFile, rm } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { dirname, join } from "node:path"
import { homedir } from "node:os"
import type { InstalledPlugin, MarketplaceSource } from "@shared/types"
import { writeFileAtomic } from "../lib/atomic-write"
import { discoverInstalledPlugins } from "./plugin-scanner"
import { runSerialTask } from "./serial-task"

const execFileAsync = promisify(execFile)
const PLUGINS_DIR = join(homedir(), ".c8c", "plugins")
const PLUGIN_MARKETPLACES_DIR = join(PLUGINS_DIR, "marketplaces")
const PLUGIN_SETTINGS_FILE = join(PLUGINS_DIR, "settings.json")
const PLUGIN_SETTINGS_SERIAL_KEY = "plugin-settings"

interface PersistedPluginSettings {
  disabledPluginIds?: unknown
  approvedPluginMcpServers?: unknown
}

const DEFAULT_PLUGIN_SETTINGS = {
  disabledPluginIds: [] as string[],
  approvedPluginMcpServers: [] as string[],
}

export const PREDEFINED_MARKETPLACES: Omit<MarketplaceSource, "installed">[] = [
  {
    id: "claude-plugins-official",
    name: "Claude Plugins Official",
    description:
      "Official Claude Code plugin marketplace with development, productivity, and MCP packs.",
    repo: "https://github.com/anthropics/claude-plugins-official.git",
    owner: "Anthropic",
  },
  {
    id: "claude-code-plugins",
    name: "Claude Code Plugins",
    description:
      "Anthropic-maintained plugin examples and community extension patterns for Claude Code.",
    repo: "https://github.com/anthropics/claude-code.git",
    owner: "Anthropic",
  },
  {
    id: "impeccable",
    name: "Impeccable",
    description:
      "Design-focused plugin pack with frontend skills and command workflows.",
    repo: "https://github.com/pbakaus/impeccable.git",
    owner: "Paul Bakaus",
  },
  {
    id: "ralph-marketplace",
    name: "Ralph Marketplace",
    description:
      "PRD and autonomous execution pipeline skills for Ralph-style product workflows.",
    repo: "https://github.com/snarktank/ralph.git",
    owner: "snarktank",
  },
]

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
  return [...new Set(normalized)]
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function pluginSettingsPath(): string {
  return PLUGIN_SETTINGS_FILE
}

async function loadPluginSettings(): Promise<typeof DEFAULT_PLUGIN_SETTINGS> {
  try {
    const raw = await readFile(pluginSettingsPath(), "utf-8")
    const parsed = JSON.parse(raw) as PersistedPluginSettings
    return {
      disabledPluginIds: normalizeStringArray(parsed.disabledPluginIds),
      approvedPluginMcpServers: normalizeStringArray(
        parsed.approvedPluginMcpServers,
      ),
    }
  } catch {
    return { ...DEFAULT_PLUGIN_SETTINGS }
  }
}

async function savePluginSettings(
  state: typeof DEFAULT_PLUGIN_SETTINGS,
): Promise<void> {
  const path = pluginSettingsPath()
  await mkdir(dirname(path), { recursive: true })
  await writeFileAtomic(path, JSON.stringify(state, null, 2))
}

export async function ensurePluginMarketplacesDir(): Promise<string> {
  await mkdir(PLUGIN_MARKETPLACES_DIR, { recursive: true })
  return PLUGIN_MARKETPLACES_DIR
}

export function getMarketplacePath(id: string): string {
  return join(PLUGIN_MARKETPLACES_DIR, id)
}

export async function isMarketplaceInstalled(id: string): Promise<boolean> {
  return exists(getMarketplacePath(id))
}

export async function getMarketplaces(): Promise<MarketplaceSource[]> {
  const results: MarketplaceSource[] = []
  for (const marketplace of PREDEFINED_MARKETPLACES) {
    results.push({
      ...marketplace,
      installed: await isMarketplaceInstalled(marketplace.id),
    })
  }
  return results
}

export async function installMarketplace(
  marketplace: Omit<MarketplaceSource, "installed">,
): Promise<void> {
  await ensurePluginMarketplacesDir()
  const destination = getMarketplacePath(marketplace.id)

  if (await exists(destination)) {
    await execFileAsync("git", ["pull", "--ff-only"], {
      cwd: destination,
      timeout: 30_000,
    })
    return
  }

  await execFileAsync(
    "git",
    ["clone", "--depth", "1", marketplace.repo, destination],
    {
      timeout: 60_000,
    },
  )
}

export async function updateMarketplace(id: string): Promise<void> {
  const destination = getMarketplacePath(id)
  if (!(await exists(destination))) {
    throw new Error(`Marketplace is not installed: ${id}`)
  }

  await execFileAsync("git", ["pull", "--ff-only"], {
    cwd: destination,
    timeout: 30_000,
  })
}

export async function removeMarketplace(id: string): Promise<void> {
  const destination = getMarketplacePath(id)
  if (await exists(destination)) {
    await rm(destination, { recursive: true, force: true })
  }
}

export async function listInstalledPlugins(): Promise<InstalledPlugin[]> {
  const settings = await loadPluginSettings()
  const plugins = await discoverInstalledPlugins({
    marketplacesDir: await ensurePluginMarketplacesDir(),
    disabledPluginIds: settings.disabledPluginIds,
  })
  const marketplaceById = new Map(
    PREDEFINED_MARKETPLACES.map((marketplace) => [marketplace.id, marketplace]),
  )

  return plugins.map((plugin) => {
    const marketplace = marketplaceById.get(plugin.marketplaceId)
    if (!marketplace) return plugin
    return {
      ...plugin,
      marketplaceRepo: marketplace.repo,
      marketplaceName: plugin.marketplaceName || marketplace.name,
    }
  })
}

export async function setPluginEnabled(
  pluginId: string,
  enabled: boolean,
): Promise<boolean> {
  const normalizedPluginId = pluginId.trim()
  if (!normalizedPluginId) {
    throw new Error("Plugin id is required")
  }

  return runSerialTask(PLUGIN_SETTINGS_SERIAL_KEY, async () => {
    const state = await loadPluginSettings()
    const disabled = new Set(state.disabledPluginIds)

    if (enabled) {
      disabled.delete(normalizedPluginId)
    } else {
      disabled.add(normalizedPluginId)
    }

    state.disabledPluginIds = [...disabled].sort()
    await savePluginSettings(state)
    return true
  })
}

export async function getApprovedPluginMcpServerIds(): Promise<string[]> {
  const state = await loadPluginSettings()
  return [...state.approvedPluginMcpServers]
}

export async function setPluginMcpServerApproved(
  serverId: string,
  approved: boolean,
): Promise<boolean> {
  const normalizedServerId = serverId.trim()
  if (!normalizedServerId) {
    throw new Error("Plugin MCP server id is required")
  }

  return runSerialTask(PLUGIN_SETTINGS_SERIAL_KEY, async () => {
    const state = await loadPluginSettings()
    const approvedServers = new Set(state.approvedPluginMcpServers)

    if (approved) {
      approvedServers.add(normalizedServerId)
    } else {
      approvedServers.delete(normalizedServerId)
    }

    state.approvedPluginMcpServers = [...approvedServers].sort()
    await savePluginSettings(state)
    return true
  })
}
