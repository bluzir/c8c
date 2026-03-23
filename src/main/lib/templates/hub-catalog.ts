import { errorMessage } from "../error-utils"
import { net } from "electron"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { logInfo, logWarn } from "../structured-log"
import { resolveAppHomeDir } from "../runtime-paths"

export interface CatalogEntry {
  id: string
  name: string
  stage: string
  emoji: string
  headline: string
  how: string
  input: string
  output: string
  useWhen?: string
  time?: string
  steps: string[]
  nodeCount: number
  tags: string[]
  sourceKind: "shared" | "generated" | null
  packId?: string
  packLabel?: string
}

export interface HubCatalogCache {
  generatedAt: string
  fetchedAt: string
  entries: CatalogEntry[]
}

const CATALOG_URL = "https://c8c.app/api/catalog"
const FETCH_TIMEOUT_MS = 10_000
const MAX_BODY_SIZE = 2 * 1024 * 1024 // 2 MB
const MEMORY_TTL_MS = 10 * 60 * 1000 // 10 minutes
const REFRESH_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

function cacheDir(): string {
  return join(resolveAppHomeDir(), ".c8c")
}

function cacheFile(): string {
  return join(cacheDir(), "hub-catalog.json")
}

let memoryCache: HubCatalogCache | null = null
let memoryCacheTimestamp = 0
let refreshTimer: ReturnType<typeof setInterval> | null = null

function isMemoryCacheFresh(): boolean {
  return (
    memoryCache !== null && Date.now() - memoryCacheTimestamp < MEMORY_TTL_MS
  )
}

async function readDiskCache(): Promise<HubCatalogCache | null> {
  try {
    const raw = await readFile(cacheFile(), "utf8")
    const parsed = JSON.parse(raw) as HubCatalogCache
    if (!Array.isArray(parsed.entries)) return null
    return parsed
  } catch {
    return null
  }
}

async function writeDiskCache(cache: HubCatalogCache): Promise<void> {
  try {
    await mkdir(cacheDir(), { recursive: true })
    await writeFile(cacheFile(), JSON.stringify(cache), "utf8")
  } catch (error) {
    logWarn("hub-catalog", "disk_cache_write_failed", {
      error: errorMessage(error),
    })
  }
}

async function fetchCatalogFromNetwork(): Promise<HubCatalogCache> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let response: Response
  try {
    response = await net.fetch(CATALOG_URL, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new Error(`Catalog fetch failed (${response.status})`)
  }

  const contentLength = response.headers.get("content-length")
  if (contentLength && Number(contentLength) > MAX_BODY_SIZE) {
    throw new Error("Catalog response too large")
  }

  const body = await response.text()
  if (body.length > MAX_BODY_SIZE) {
    throw new Error("Catalog response too large")
  }

  const data = JSON.parse(body) as {
    generatedAt: string
    entries: CatalogEntry[]
  }
  if (!data.generatedAt || !Array.isArray(data.entries)) {
    throw new Error("Invalid catalog response shape")
  }

  return {
    generatedAt: data.generatedAt,
    fetchedAt: new Date().toISOString(),
    entries: data.entries,
  }
}

/**
 * Synchronous read from memory cache. Falls back to empty array.
 * Call refreshHubCatalog() to populate.
 */
export function getHubCatalog(): CatalogEntry[] {
  return memoryCache?.entries ?? []
}

/** Returns the generatedAt timestamp from the current cache, if any. */
export function getHubCatalogGeneratedAt(): string | null {
  return memoryCache?.generatedAt ?? null
}

/**
 * Async fetch from network → memory + disk.
 * Graceful: memory → disk → empty on failure.
 */
export async function refreshHubCatalog(): Promise<void> {
  try {
    const cache = await fetchCatalogFromNetwork()
    memoryCache = cache
    memoryCacheTimestamp = Date.now()
    await writeDiskCache(cache)
    logInfo("hub-catalog", "catalog_refreshed", {
      entries: cache.entries.length,
    })
  } catch (error) {
    logWarn("hub-catalog", "catalog_refresh_failed", {
      error: errorMessage(error),
    })

    // Fall back to disk cache if memory is stale
    if (!isMemoryCacheFresh()) {
      const diskCache = await readDiskCache()
      if (diskCache) {
        memoryCache = diskCache
        memoryCacheTimestamp = Date.now()
        logInfo("hub-catalog", "fell_back_to_disk_cache", {
          entries: diskCache.entries.length,
        })
      }
    }
  }
}

/**
 * Start background catalog refresh. Call once on app start.
 * Loads disk cache immediately, then fetches from network.
 */
export function initHubCatalogRefresh(): void {
  if (refreshTimer) return

  // Warm memory from disk immediately (sync-ish)
  void readDiskCache().then((diskCache) => {
    if (diskCache && !isMemoryCacheFresh()) {
      memoryCache = diskCache
      memoryCacheTimestamp = Date.now()
      logInfo("hub-catalog", "loaded_disk_cache", {
        entries: diskCache.entries.length,
      })
    }
  })

  // Fetch from network in background
  void refreshHubCatalog()

  // Periodic refresh
  refreshTimer = setInterval(() => {
    void refreshHubCatalog()
  }, REFRESH_INTERVAL_MS)
}

/** Stop background refresh (for cleanup/testing). */
export function stopHubCatalogRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}
