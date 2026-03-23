import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { McpToolInfo } from "@shared/types"
import {
  getAllCachedTools,
  getCachedTools,
  invalidateCache,
  setCachedTools,
} from "./mcp-tools-cache"

function createTool(name: string, serverName = "test-server"): McpToolInfo {
  return {
    name,
    serverName,
    qualifiedName: `${serverName}/${name}`,
    description: `${name} description`,
  }
}

describe("mcp-tools-cache", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-21T12:00:00Z"))
    invalidateCache()
  })

  afterEach(() => {
    invalidateCache()
    vi.useRealTimers()
  })

  it("returns cached tools before TTL expiry", () => {
    const tools = [createTool("search")]
    setCachedTools("server-a", tools, "/project-a")

    expect(getCachedTools("server-a", "/project-a")).toEqual(tools)
  })

  it("expires stale entries after the TTL", () => {
    setCachedTools("server-a", [createTool("search")], "/project-a")

    vi.advanceTimersByTime(5 * 60 * 1000 + 1)

    expect(getCachedTools("server-a", "/project-a")).toBeNull()
  })

  it("invalidates a single server or the whole cache", () => {
    setCachedTools("server-a", [createTool("search")], "/project-a")
    setCachedTools("server-b", [createTool("fetch")], "/project-a")

    invalidateCache("server-a", "/project-a")
    expect(getCachedTools("server-a", "/project-a")).toBeNull()
    expect(getCachedTools("server-b", "/project-a")).toEqual([
      createTool("fetch"),
    ])

    invalidateCache()
    expect(getCachedTools("server-b", "/project-a")).toBeNull()
  })

  it("prunes expired entries while collecting all cached tools", () => {
    setCachedTools("server-a", [createTool("search")], "/project-a")
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    setCachedTools("server-b", [createTool("fetch")], "/project-a")

    expect(getAllCachedTools("/project-a")).toEqual([createTool("fetch")])
    expect(getCachedTools("server-a", "/project-a")).toBeNull()
    expect(getCachedTools("server-b", "/project-a")).toEqual([
      createTool("fetch"),
    ])
  })

  it("isolates entries with the same server name across projects", () => {
    setCachedTools("server-a", [createTool("search")], "/project-a")
    setCachedTools("server-a", [createTool("fetch")], "/project-b")

    expect(getCachedTools("server-a", "/project-a")).toEqual([
      createTool("search"),
    ])
    expect(getCachedTools("server-a", "/project-b")).toEqual([
      createTool("fetch"),
    ])
  })
})
