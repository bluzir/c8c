import { describe, expect, it } from "vitest"
import {
  isAllowlistedElectronSmokeConsoleEntry,
  resolveElectronSmokeOutputDir,
  resolveElectronSmokeScenario,
  resolveElectronSmokeSeed,
  shouldShowElectronSmokeWindow,
} from "./electron-smoke"

describe("electron-smoke", () => {
  it("recognizes supported smoke scenarios", () => {
    expect(
      resolveElectronSmokeScenario({ C8C_SMOKE_SCENARIO: "launch-empty" }),
    ).toBe("launch-empty")
    expect(
      resolveElectronSmokeScenario({
        C8C_SMOKE_SCENARIO: "command-palette-toggle",
      }),
    ).toBe("command-palette-toggle")
    expect(
      resolveElectronSmokeScenario({
        C8C_SMOKE_SCENARIO: "settings-navigation",
      }),
    ).toBe("settings-navigation")
    expect(
      resolveElectronSmokeScenario({
        C8C_SMOKE_SCENARIO: "quick-switch-shortcuts",
      }),
    ).toBe("quick-switch-shortcuts")
    expect(
      resolveElectronSmokeScenario({ C8C_SMOKE_SCENARIO: "approval-dialog" }),
    ).toBe("approval-dialog")
    expect(
      resolveElectronSmokeScenario({
        C8C_SMOKE_SCENARIO: "create-ready-continuation",
      }),
    ).toBe("create-ready-continuation")
    expect(
      resolveElectronSmokeScenario({ C8C_SMOKE_SCENARIO: "blocked-relaunch" }),
    ).toBe("blocked-relaunch")
    expect(
      resolveElectronSmokeScenario({
        C8C_SMOKE_SCENARIO: "factory-thin-bridge",
      }),
    ).toBe("factory-thin-bridge")
    expect(
      resolveElectronSmokeScenario({
        C8C_SMOKE_SCENARIO: "blocked-approve-resolution",
      }),
    ).toBe("blocked-approve-resolution")
    expect(
      resolveElectronSmokeScenario({
        C8C_SMOKE_SCENARIO: "blocked-reject-resolution",
      }),
    ).toBe("blocked-reject-resolution")
    expect(
      resolveElectronSmokeScenario({ C8C_SMOKE_SCENARIO: "unknown" }),
    ).toBeNull()
  })

  it("resolves seeded projects and keeps selection inside the seed set", () => {
    expect(
      resolveElectronSmokeSeed({
        C8C_SMOKE_PROJECTS: JSON.stringify([
          "/tmp/alpha",
          "/tmp/beta",
          "/tmp/alpha",
        ]),
        C8C_SMOKE_SELECTED_PROJECT: "/tmp/beta",
      }),
    ).toEqual({
      projects: ["/tmp/alpha", "/tmp/beta"],
      selectedProject: "/tmp/beta",
    })

    expect(
      resolveElectronSmokeSeed({
        C8C_SMOKE_PROJECTS: JSON.stringify(["/tmp/alpha"]),
        C8C_SMOKE_SELECTED_PROJECT: "/tmp/outside",
      }),
    ).toEqual({
      projects: ["/tmp/alpha"],
      selectedProject: "/tmp/alpha",
    })
  })

  it("resolves the smoke artifact output directory", () => {
    expect(
      resolveElectronSmokeOutputDir({
        C8C_SMOKE_OUTPUT_DIR: "/tmp/c8c-smoke-output",
      }),
    ).toBe("/tmp/c8c-smoke-output")
  })

  it("keeps smoke windows hidden unless explicitly requested", () => {
    expect(shouldShowElectronSmokeWindow({})).toBe(false)
    expect(shouldShowElectronSmokeWindow({ C8C_SMOKE_SHOW_WINDOW: "1" })).toBe(
      true,
    )
  })

  it("does not allowlist Electron security warnings", () => {
    expect(
      isAllowlistedElectronSmokeConsoleEntry({
        level: "warning",
        sourceId: "node:electron/js2c/sandbox_bundle",
        message: "Electron Security Warning (Insecure Content-Security-Policy)",
      }),
    ).toBe(false)

    expect(
      isAllowlistedElectronSmokeConsoleEntry({
        level: "error",
        sourceId: "node:electron/js2c/sandbox_bundle",
        message: "Electron Security Warning (Insecure Content-Security-Policy)",
      }),
    ).toBe(false)

    expect(
      isAllowlistedElectronSmokeConsoleEntry({
        level: "warning",
        sourceId: "app://renderer",
        message: "Unexpected runtime warning",
      }),
    ).toBe(false)
  })
})
