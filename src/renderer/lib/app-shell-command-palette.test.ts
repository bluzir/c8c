import { describe, expect, it } from "vitest"
import {
  buildAppShellActionEntries,
  buildAppShellCommandSections,
  buildAppShellProjectEntries,
  buildAppShellWorkflowEntries,
  buildAppShellStartEntry,
} from "./app-shell-command-palette"
import { createEmptyWorkflowExecutionState } from "@/lib/workflow-execution"

describe("app-shell-command-palette", () => {
  it("sorts active and selected-project workflows first", () => {
    const runningState = {
      ...createEmptyWorkflowExecutionState(),
      runStatus: "running" as const,
    }

    const entries = buildAppShellWorkflowEntries({
      projects: ["/tmp/alpha", "/tmp/beta"],
      selectedProject: "/tmp/alpha",
      projectWorkflowsCache: {
        "/tmp/alpha": [
          {
            name: "Alpha recent",
            path: "/tmp/alpha/recent.chain",
            updatedAt: 20,
          },
        ],
        "/tmp/beta": [
          {
            name: "Beta active",
            path: "/tmp/beta/active.chain",
            updatedAt: 10,
          },
          { name: "Beta stale", path: "/tmp/beta/stale.chain", updatedAt: 1 },
        ],
      },
      workflowExecutionStates: {
        "/tmp/beta/active.chain": runningState,
      },
    })

    expect(entries.map((entry) => entry.label)).toEqual([
      "Beta active",
      "Alpha recent",
      "Beta stale",
    ])
  })

  it("builds a project-aware start entry without intent classification", () => {
    const entry = buildAppShellStartEntry({
      query: "ux ui polish",
      selectedProject: "/tmp/vibecon",
      projects: ["/tmp/vibecon"],
    })

    expect(entry).toMatchObject({
      kind: "start",
      label: "Start: ux ui polish",
      projectPath: "/tmp/vibecon",
      projectLabel: "vibecon",
      requiresProjectSelection: false,
    })
  })

  it("keeps guided start available alongside existing workflow matches", () => {
    const actions = buildAppShellActionEntries()
    const projects = ["/tmp/vibecon", "/tmp/other"]
    const workflows = buildAppShellWorkflowEntries({
      projects,
      selectedProject: "/tmp/vibecon",
      projectWorkflowsCache: {
        "/tmp/vibecon": [
          {
            name: "UX/UI Polish Audit",
            path: "/tmp/vibecon/ui.chain",
            updatedAt: 5,
          },
        ],
        "/tmp/other": [
          {
            name: "UX UI Polish Audit",
            path: "/tmp/other/ui.chain",
            updatedAt: 4,
          },
        ],
      },
      workflowExecutionStates: {},
    })

    const sections = buildAppShellCommandSections({
      query: "ux ui polish",
      actions,
      desktopCommands: [],
      projectEntries: buildAppShellProjectEntries({
        projects,
        selectedProject: "/tmp/vibecon",
      }),
      workflows,
      selectedProject: "/tmp/vibecon",
      projects,
    })

    expect(sections.map((section) => section.label)).toEqual([
      "Open in current project",
      "Open in other projects",
      "Start new",
    ])
    expect(sections[2]?.entries[0]).toMatchObject({
      kind: "start",
      label: "Start: ux ui polish",
    })
  })

  it("keeps navigation queries focused on actions while still offering guided start", () => {
    const sections = buildAppShellCommandSections({
      query: "settings",
      actions: buildAppShellActionEntries(),
      desktopCommands: [],
      projectEntries: buildAppShellProjectEntries({
        projects: ["/tmp/vibecon"],
        selectedProject: "/tmp/vibecon",
      }),
      workflows: [],
      selectedProject: "/tmp/vibecon",
      projects: ["/tmp/vibecon"],
    })

    expect(sections.map((section) => section.label)).toEqual([
      "Actions",
      "Start new",
    ])
    expect(sections[0]?.entries.map((entry) => entry.label)).toEqual([
      "Settings",
    ])
    expect(sections[1]?.entries[0]).toMatchObject({
      kind: "start",
      label: "Start: settings",
    })
  })

  it("surfaces attach skill as an action", () => {
    const sections = buildAppShellCommandSections({
      query: "attach",
      actions: buildAppShellActionEntries(),
      desktopCommands: [],
      projectEntries: buildAppShellProjectEntries({
        projects: ["/tmp/vibecon"],
        selectedProject: "/tmp/vibecon",
      }),
      workflows: [],
      selectedProject: "/tmp/vibecon",
      projects: ["/tmp/vibecon"],
    })

    expect(sections.map((section) => section.label)).toEqual([
      "Actions",
      "Start new",
    ])
    expect(sections[0]?.entries.map((entry) => entry.label)).toEqual([
      "Attach skill",
    ])
  })

  it("surfaces runs dashboard as a shell action", () => {
    const sections = buildAppShellCommandSections({
      query: "runs",
      actions: buildAppShellActionEntries(),
      desktopCommands: [],
      projectEntries: buildAppShellProjectEntries({
        projects: ["/tmp/vibecon"],
        selectedProject: "/tmp/vibecon",
      }),
      workflows: [],
      selectedProject: "/tmp/vibecon",
      projects: ["/tmp/vibecon"],
    })

    expect(sections.map((section) => section.label)).toEqual([
      "Actions",
      "Start new",
    ])
    expect(sections[0]?.entries.map((entry) => entry.label)).toEqual([
      "Runs dashboard",
    ])
  })

  it("surfaces lab when the beta workspace is enabled", () => {
    const sections = buildAppShellCommandSections({
      query: "lab",
      actions: buildAppShellActionEntries({ includeLab: true }),
      desktopCommands: [],
      projectEntries: buildAppShellProjectEntries({
        projects: ["/tmp/vibecon"],
        selectedProject: "/tmp/vibecon",
      }),
      workflows: [],
      selectedProject: "/tmp/vibecon",
      projects: ["/tmp/vibecon"],
    })

    expect(sections.map((section) => section.label)).toEqual([
      "Actions",
      "Start new",
    ])
    expect(sections[0]?.entries.map((entry) => entry.label)).toEqual(["Lab"])
  })

  it("surfaces project matches as switch targets", () => {
    const projects = ["/tmp/vibecon", "/tmp/content-os"]
    const sections = buildAppShellCommandSections({
      query: "content",
      actions: buildAppShellActionEntries(),
      desktopCommands: [],
      projectEntries: buildAppShellProjectEntries({
        projects,
        selectedProject: "/tmp/vibecon",
      }),
      workflows: [],
      selectedProject: "/tmp/vibecon",
      projects,
    })

    expect(sections.map((section) => section.label)).toEqual([
      "Switch project",
      "Start new",
    ])
    expect(sections[0]?.entries[0]).toMatchObject({
      kind: "project",
      label: "content-os",
    })
  })
})
