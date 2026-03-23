import { describe, it, expect } from "vitest"
import { KNOWN_TOOLS, validateToolNames } from "../tools.js"

describe("KNOWN_TOOLS", () => {
  it("contains expected built-in tools", () => {
    expect(KNOWN_TOOLS.has("Read")).toBe(true)
    expect(KNOWN_TOOLS.has("Write")).toBe(true)
    expect(KNOWN_TOOLS.has("Bash")).toBe(true)
    expect(KNOWN_TOOLS.has("Glob")).toBe(true)
    expect(KNOWN_TOOLS.has("Grep")).toBe(true)
    expect(KNOWN_TOOLS.has("Agent")).toBe(true)
  })
})

describe("validateToolNames", () => {
  it("recognizes known tools as valid", () => {
    const result = validateToolNames(["Read", "Write", "Bash"])
    expect(result.valid).toEqual(["Read", "Write", "Bash"])
    expect(result.unknown).toEqual([])
  })

  it("flags unknown tools", () => {
    const result = validateToolNames(["Read", "FakeTool", "MagicWand"])
    expect(result.valid).toEqual(["Read"])
    expect(result.unknown).toEqual(["FakeTool", "MagicWand"])
  })

  it("recognizes mcp__ prefixed tools as valid", () => {
    const result = validateToolNames(["mcp__exa__search", "mcp__serper__query"])
    expect(result.valid).toEqual(["mcp__exa__search", "mcp__serper__query"])
    expect(result.unknown).toEqual([])
  })

  it("handles mixed known, unknown, and mcp tools", () => {
    const result = validateToolNames(["Read", "mcp__exa__find", "InvalidTool"])
    expect(result.valid).toEqual(["Read", "mcp__exa__find"])
    expect(result.unknown).toEqual(["InvalidTool"])
  })

  it("handles empty array", () => {
    const result = validateToolNames([])
    expect(result.valid).toEqual([])
    expect(result.unknown).toEqual([])
  })
})
