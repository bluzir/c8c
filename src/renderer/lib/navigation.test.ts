import { describe, expect, it, vi } from "vitest"
import {
  applyNavigation,
  type NavigationOps,
  type NavigationTarget,
} from "./navigation"

function createOps() {
  return {
    resetEphemeralState: vi.fn() as NavigationOps["resetEphemeralState"],
    setSelectedPastRun: vi.fn() as NavigationOps["setSelectedPastRun"],
    setSelectedInboxTaskKey: vi.fn() as NavigationOps["setSelectedInboxTaskKey"],
    setSelectedProject: vi.fn() as NavigationOps["setSelectedProject"],
    setSelectedWorkflowPath: vi.fn() as NavigationOps["setSelectedWorkflowPath"],
    setWorkflowEntryState: vi.fn() as NavigationOps["setWorkflowEntryState"],
    setMainView: vi.fn() as NavigationOps["setMainView"],
    setViewMode: vi.fn() as NavigationOps["setViewMode"],
  }
}

describe("applyNavigation", () => {
  describe("always clears routing and review state", () => {
    const targets: NavigationTarget[] = [
      {
        kind: "workflow",
        workflowPath: "/tmp/flow.yaml",
        projectPath: "/tmp/project",
      },
      { kind: "create" },
      { kind: "view", view: "settings" },
    ]

    for (const target of targets) {
      it(`clears routing/review for kind="${target.kind}"`, () => {
        const ops = createOps()

        applyNavigation(target, ops)

        expect(ops.resetEphemeralState).toHaveBeenCalled()
        expect(ops.setSelectedPastRun).toHaveBeenCalledWith(null)
        expect(ops.setSelectedInboxTaskKey).toHaveBeenCalledWith(null)
      })
    }
  })

  describe("workflow navigation", () => {
    it("sets project, mainView, and viewMode for workflow targets", () => {
      const ops = createOps()

      applyNavigation(
        {
          kind: "workflow",
          workflowPath: "/tmp/flow.yaml",
          projectPath: "/tmp/project",
        },
        ops,
      )

      expect(ops.setSelectedProject).toHaveBeenCalledWith("/tmp/project")
      expect(ops.setMainView).toHaveBeenCalledWith("thread")
      expect(ops.setViewMode).toHaveBeenCalledWith("chat")
    })

    it("does not clear selectedWorkflowPath (caller sets after loading)", () => {
      const ops = createOps()

      applyNavigation(
        {
          kind: "workflow",
          workflowPath: "/tmp/flow.yaml",
          projectPath: "/tmp/project",
        },
        ops,
      )

      expect(ops.setSelectedWorkflowPath).not.toHaveBeenCalled()
    })
  })

  describe("create navigation", () => {
    it("clears workflow path, entry state, and navigates to thread/chat", () => {
      const ops = createOps()

      applyNavigation({ kind: "create" }, ops)

      expect(ops.setSelectedWorkflowPath).toHaveBeenCalledWith(null)
      expect(ops.setWorkflowEntryState).toHaveBeenCalledWith(null)
      expect(ops.setMainView).toHaveBeenCalledWith("thread")
      expect(ops.setViewMode).toHaveBeenCalledWith("chat")
    })
  })

  describe("view navigation", () => {
    const views = [
      "settings",
      "skills",
      "templates",
      "artifacts",
      "inbox",
    ] as const

    for (const view of views) {
      it(`sets mainView to "${view}"`, () => {
        const ops = createOps()

        applyNavigation({ kind: "view", view }, ops)

        expect(ops.setMainView).toHaveBeenCalledWith(view)
      })
    }

    it("does not set viewMode for view targets", () => {
      const ops = createOps()

      applyNavigation({ kind: "view", view: "settings" }, ops)

      expect(ops.setViewMode).not.toHaveBeenCalled()
    })
  })
})
