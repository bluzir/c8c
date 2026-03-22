import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { McpToolInfo } from "@shared/types"
import {
  getAllCachedTools,
  getCachedTools,
  invalidateCache,
  setCachedTools,
} from "./mcp-tools-cache"

function createTool(name: string): McpToolInfo {
  return {
    name,
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
    setCachedTools("server-a", tools)

    expect(getCachedTools("server-a")).toEqual(tools)
  })

  it("expires stale entries after the TTL", () => {
    setCachedTools("server-a", [createTool("search")])

    vi.advanceTimersByTime(5 * 60 * 1000 + 1)

    expect(getCachedTools("server-a")).toBeNull()
  })

  it("invalidates a single server or the whole cache", () => {
    setCachedTools("server-a", [createTool("search")])
    setCachedTools("server-b", [createTool("fetch")])

    invalidateCache("server-a")
    expect(getCachedTools("server-a")).toBeNull()
    expect(getCachedTools("server-b")).toEqual([createTool("fetch")])

    invalidateCache()
    expect(getCachedTools("server-b")).toBeNull()
  })

  it("prunes expired entries while collecting all cached tools", () => {
    setCachedTools("server-a", [createTool("search")])
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    setCachedTools("server-b", [createTool("fetch")])

    expect(getAllCachedTools()).toEqual([createTool("fetch")])
    expect(getCachedTools("server-a")).toBeNull()
    expect(getCachedTools("server-b")).toEqual([createTool("fetch")])
  })
})
