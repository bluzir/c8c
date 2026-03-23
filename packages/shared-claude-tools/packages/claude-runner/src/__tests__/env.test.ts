import { delimiter } from "node:path"
import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { cleanEnv } from "../env.js"

function expectedExtendedPath(home: string, existingPath: string): string {
  const extras = [
    `${home}/.local/bin`,
    `${home}/.claude/local`,
    `${home}/.claude/local/node_modules/.bin`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ]
  const parts = [...extras, ...existingPath.split(delimiter)]
  return [...new Set(parts)].join(delimiter)
}

describe("cleanEnv", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Set dangerous vars for testing
    process.env.CLAUDE_SESSION_ID = "test-session"
    process.env.CLAUDECODE = "1"
    process.env.CLAUDE_PATH = "/usr/local/bin/claude"
    process.env.LD_PRELOAD = "/tmp/evil.so"
    process.env.LD_LIBRARY_PATH = "/tmp"
    process.env.DYLD_INSERT_LIBRARIES = "/tmp/evil.dylib"
    process.env.HOME = "/home/test"
    process.env.PATH = "/usr/bin"
  })

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, originalEnv)
  })

  it("strips CLAUDE* vars except CLAUDE_PATH", () => {
    const env = cleanEnv()
    expect(env.CLAUDE_PATH).toBe("/usr/local/bin/claude")
    expect(env.CLAUDE_SESSION_ID).toBeUndefined()
    expect(env.CLAUDECODE).toBeUndefined()
  })

  it("strips LD_* vars", () => {
    const env = cleanEnv()
    expect(env.LD_PRELOAD).toBeUndefined()
    expect(env.LD_LIBRARY_PATH).toBeUndefined()
  })

  it("strips DYLD_* vars", () => {
    const env = cleanEnv()
    expect(env.DYLD_INSERT_LIBRARIES).toBeUndefined()
  })

  it("keeps safe vars", () => {
    const env = cleanEnv()
    expect(env.HOME).toBe("/home/test")
    expect(env.PATH).toBe(expectedExtendedPath("/home/test", "/usr/bin"))
  })

  it("merges extra env vars", () => {
    const env = cleanEnv({ CUSTOM_VAR: "hello" })
    expect(env.CUSTOM_VAR).toBe("hello")
    expect(env.HOME).toBe("/home/test")
  })

  it("extra vars override process env", () => {
    const env = cleanEnv({ HOME: "/override" })
    expect(env.HOME).toBe("/override")
  })

  it("keeps CLAUDE_PATH even when its value is empty string", () => {
    process.env.CLAUDE_PATH = ""
    const env = cleanEnv()
    expect("CLAUDE_PATH" in env).toBe(true)
    expect(env.CLAUDE_PATH).toBe("")
  })

  it("strips multiple CLAUDE* vars", () => {
    process.env.CLAUDE_API_KEY = "secret"
    process.env.CLAUDE_CONFIG_DIR = "/tmp/config"
    process.env.CLAUDE_TIMEOUT = "30"
    const env = cleanEnv()
    expect(env.CLAUDE_API_KEY).toBeUndefined()
    expect(env.CLAUDE_CONFIG_DIR).toBeUndefined()
    expect(env.CLAUDE_TIMEOUT).toBeUndefined()
    // CLAUDE_PATH is still preserved
    expect(env.CLAUDE_PATH).toBe("/usr/local/bin/claude")
  })

  it("strips LD_LIBRARY_PATH, LD_PRELOAD, and DYLD_FRAMEWORK_PATH", () => {
    process.env.DYLD_FRAMEWORK_PATH = "/evil/frameworks"
    const env = cleanEnv()
    expect(env.LD_LIBRARY_PATH).toBeUndefined()
    expect(env.LD_PRELOAD).toBeUndefined()
    expect(env.DYLD_FRAMEWORK_PATH).toBeUndefined()
  })

  it("extra env can re-introduce a CLAUDE* var after filtering", () => {
    const env = cleanEnv({ CLAUDE_FOO: "bar" })
    // CLAUDE_FOO was not in process.env so it wouldn't have been stripped,
    // and extra vars are applied after filtering, so it should be present.
    expect(env.CLAUDE_FOO).toBe("bar")
  })

  it("cleanEnv with no extra returns only safe vars", () => {
    const env = cleanEnv()
    // All CLAUDE* except CLAUDE_PATH should be gone
    const claudeKeys = Object.keys(env).filter(
      (k) => k.startsWith("CLAUDE") && k !== "CLAUDE_PATH",
    )
    expect(claudeKeys).toEqual([])
    // No LD_* or DYLD_* keys
    const dangerousKeys = Object.keys(env).filter(
      (k) => k.startsWith("LD_") || k.startsWith("DYLD_"),
    )
    expect(dangerousKeys).toEqual([])
    // Safe vars remain
    expect(env.HOME).toBe("/home/test")
    expect(env.PATH).toBe(expectedExtendedPath("/home/test", "/usr/bin"))
  })
})
