import type { McpToolInfo } from "@shared/types"

const TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheEntry {
  tools: McpToolInfo[]
  storedAt: number
}

const cache = new Map<string, CacheEntry>()

function cacheKey(serverName: string, projectPath?: string): string {
  return `${projectPath ?? ""}:${serverName}`
}

export function getCachedTools(serverName: string, projectPath?: string): McpToolInfo[] | null {
  const entry = cache.get(cacheKey(serverName, projectPath))
  if (!entry) return null
  if (Date.now() - entry.storedAt > TTL_MS) {
    cache.delete(cacheKey(serverName, projectPath))
    return null
  }
  return entry.tools
}

export function setCachedTools(serverName: string, tools: McpToolInfo[], projectPath?: string): void {
  cache.set(cacheKey(serverName, projectPath), { tools, storedAt: Date.now() })
}

export function invalidateCache(serverName?: string, projectPath?: string): void {
  if (serverName) {
    if (projectPath) {
      cache.delete(cacheKey(serverName, projectPath))
      return
    }
    for (const key of cache.keys()) {
      if (key.endsWith(`:${serverName}`)) {
        cache.delete(key)
      }
    }
    return
  }
  if (projectPath) {
    const prefix = `${projectPath}:`
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) {
        cache.delete(key)
      }
    }
  } else {
    cache.clear()
  }
}

export function getAllCachedTools(projectPath?: string): McpToolInfo[] {
  const now = Date.now()
  const all: McpToolInfo[] = []
  for (const [key, entry] of cache) {
    if (now - entry.storedAt > TTL_MS) {
      cache.delete(key)
      continue
    }
    if (projectPath && !key.startsWith(`${projectPath}:`)) {
      continue
    }
    all.push(...entry.tools)
  }
  return all
}
