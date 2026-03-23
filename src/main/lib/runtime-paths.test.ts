import { describe, expect, it } from "vitest"
import {
  applyRuntimePathOverrides,
  isPathWithin,
  isTestMode,
  resolveAppHomeDir,
  resolveAppUserDataDir,
  shouldSuppressStartupSideEffects,
} from "./runtime-paths"

describe("runtime-paths", () => {
  it("detects test mode and startup suppression flags", () => {
    expect(isTestMode({ C8C_TEST_MODE: "1" })).toBe(true)
    expect(isTestMode({ C8C_TEST_MODE: "true" })).toBe(true)
    expect(isTestMode({})).toBe(false)

    expect(shouldSuppressStartupSideEffects({ C8C_TEST_MODE: "1" })).toBe(true)
    expect(
      shouldSuppressStartupSideEffects({
        C8C_DISABLE_STARTUP_SIDE_EFFECTS: "true",
      }),
    ).toBe(true)
    expect(shouldSuppressStartupSideEffects({})).toBe(false)
  })

  it("resolves home and userData overrides for test mode", () => {
    expect(
      resolveAppHomeDir({
        env: { C8C_TEST_MODE: "1", C8C_TEST_HOME_DIR: "/tmp/c8c-home" },
      }),
    ).toBe("/tmp/c8c-home")

    expect(
      resolveAppUserDataDir({
        env: {
          C8C_TEST_MODE: "1",
          C8C_TEST_USER_DATA_DIR: "/tmp/c8c-user-data",
        },
      }),
    ).toBe("/tmp/c8c-user-data")
  })

  it("falls back to Electron paths outside test mode", () => {
    const app = {
      getPath(name: "home" | "userData") {
        return name === "home"
          ? "/Users/example"
          : "/Users/example/Library/Application Support/c8c"
      },
    }

    expect(resolveAppHomeDir({ env: {}, app })).toBe("/Users/example")
    expect(resolveAppUserDataDir({ env: {}, app })).toBe(
      "/Users/example/Library/Application Support/c8c",
    )
  })

  it("applies userData and sessionData overrides in test mode", () => {
    const calls: Array<{ name: string; path: string }> = []
    const app = {
      getPath(name: "home" | "userData") {
        return name === "home"
          ? "/Users/example"
          : "/Users/example/Library/Application Support/c8c"
      },
      setPath(name: "userData" | "sessionData", path: string) {
        calls.push({ name, path })
      },
    }

    const result = applyRuntimePathOverrides({
      app,
      env: {
        C8C_TEST_MODE: "1",
        C8C_TEST_HOME_DIR: "/tmp/c8c-home",
        C8C_TEST_USER_DATA_DIR: "/tmp/c8c-user-data",
      },
    })

    expect(result).toEqual({
      homeDir: "/tmp/c8c-home",
      userDataDir: "/tmp/c8c-user-data",
    })
    expect(calls).toEqual([
      { name: "userData", path: "/tmp/c8c-user-data" },
      { name: "sessionData", path: "/tmp/c8c-user-data/session-data" },
    ])
  })

  it("checks whether a path stays within a root", () => {
    expect(isPathWithin("/tmp/c8c-test", "/tmp/c8c-test/workflow.chain")).toBe(
      true,
    )
    expect(isPathWithin("/tmp/c8c-test", "/tmp/other/workflow.chain")).toBe(
      false,
    )
  })
})
