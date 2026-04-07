// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { Provider, createStore } from "jotai"
import React from "react"
import { useToolbarActions } from "./useToolbarActions"
import {
  workflowRequestedResultsAtom,
  workflowTemplateContextsAtom,
  workflowContinuationEntryStatesAtom,
} from "@/lib/store"
import {
  toWorkflowExecutionKey,
  workflowExecutionStatesAtom,
  createEmptyWorkflowExecutionState,
} from "@/features/execution"

// ── Helpers ────────────────────────────────────────────

function makeWrapper(store: ReturnType<typeof createStore>) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(Provider, { store }, children)
}

const baseMockApi = {
  renameWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  listProjectWorkflows: vi.fn().mockResolvedValue([]),
  scanSkills: vi.fn().mockResolvedValue([]),
  saveWorkflow: vi.fn(),
  saveWorkflowAs: vi.fn(),
  openWorkflowFile: vi.fn(),
  exportWorkflowCopy: vi.fn(),
  openPath: vi.fn(),
}

function baseArgs() {
  return {
    workflow: { version: 1, name: "Test Flow", nodes: [], edges: [] } as any,
    workflowPath: "/projects/test/.c8c/test-flow.yaml" as string | null,
    selectedProject: "/projects/test" as string | null,
    setWorkflows: vi.fn(),
    setSkills: vi.fn(),
    setCurrentWorkflow: vi.fn(),
    setSelectedWorkflowPath: vi.fn(),
    setWorkflowSavedSnapshot: vi.fn(),
  }
}

// ── Setup ──────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal("window", {
    ...window,
    api: { ...baseMockApi },
  })
  // Clear localStorage keys used by validatedAtomWithStorage
  localStorage.removeItem("c8c:workflow-requested-results")
  localStorage.removeItem("c8c:workflow-template-contexts")
  localStorage.removeItem("c8c:workflow-continuation-entry-states")
})

// ── Tests ──────────────────────────────────────────────

describe("useToolbarActions", () => {
  describe("renameWorkflow", () => {
    it("moves state across all 4 keyed maps", async () => {
      const store = createStore()
      const oldPath = "/projects/test/.c8c/test-flow.yaml"
      const newPath = "/projects/test/.c8c/renamed-flow.yaml"
      const oldKey = toWorkflowExecutionKey(oldPath)
      const newKey = toWorkflowExecutionKey(newPath)

      // Pre-populate all 4 maps
      const execState = {
        ...createEmptyWorkflowExecutionState(),
        runStatus: "done" as const,
        workflowName: "Test Flow",
      }
      store.set(workflowExecutionStatesAtom, { [oldKey]: execState })
      store.set(workflowRequestedResultsAtom, { [oldKey]: "find bugs" })
      store.set(workflowTemplateContextsAtom, {
        [oldKey]: {
          templateId: "tpl-1",
          templateName: "Review",
          workflowPath: oldPath,
          workflowName: "Test",
          source: "template",
        } as any,
      })
      store.set(workflowContinuationEntryStatesAtom, {
        [oldKey]: {
          workflowPath: oldPath,
          workflowName: "Test",
          source: "template",
          title: "",
          summary: "",
          contractLabel: "",
          contractText: "",
          inputText: "",
          outputText: "",
          readinessText: "",
        } as any,
      })

      ;(window.api as any).renameWorkflow = vi
        .fn()
        .mockResolvedValue(newPath)
      ;(window.api as any).listProjectWorkflows = vi
        .fn()
        .mockResolvedValue([])
      ;(window.api as any).scanSkills = vi.fn().mockResolvedValue([])

      const args = baseArgs()
      args.workflowPath = oldPath

      const { result } = renderHook(() => useToolbarActions(args), {
        wrapper: makeWrapper(store),
      })

      await act(async () => {
        await result.current.renameWorkflow("Renamed Flow")
      })

      // Execution states: old key gone, new key has data
      const execStates = store.get(workflowExecutionStatesAtom)
      expect(execStates[oldKey]).toBeUndefined()
      expect(execStates[newKey]).toBeDefined()
      expect(execStates[newKey].workflowName).toBe("Test Flow")

      // Requested results: old key gone, new key has data
      const requestedResults = store.get(workflowRequestedResultsAtom)
      expect(requestedResults[oldKey]).toBeUndefined()
      expect(requestedResults[newKey]).toBe("find bugs")

      // Template contexts: old key gone, new key has data
      const templateContexts = store.get(workflowTemplateContextsAtom)
      expect(templateContexts[oldKey]).toBeUndefined()
      expect(templateContexts[newKey]).toBeDefined()
      expect(templateContexts[newKey].templateId).toBe("tpl-1")

      // Continuation entry states: old key gone, new key has data
      const continuationStates = store.get(
        workflowContinuationEntryStatesAtom,
      )
      expect(continuationStates[oldKey]).toBeUndefined()
      expect(continuationStates[newKey]).toBeDefined()
    })

    it("updates workflow path and current workflow after rename", async () => {
      const store = createStore()
      const oldPath = "/projects/test/.c8c/test-flow.yaml"
      const newPath = "/projects/test/.c8c/renamed-flow.yaml"

      ;(window.api as any).renameWorkflow = vi
        .fn()
        .mockResolvedValue(newPath)
      ;(window.api as any).listProjectWorkflows = vi
        .fn()
        .mockResolvedValue([])
      ;(window.api as any).scanSkills = vi.fn().mockResolvedValue([])

      const args = baseArgs()
      args.workflowPath = oldPath

      const { result } = renderHook(() => useToolbarActions(args), {
        wrapper: makeWrapper(store),
      })

      await act(async () => {
        await result.current.renameWorkflow("Renamed Flow")
      })

      expect(args.setSelectedWorkflowPath).toHaveBeenCalledWith(newPath)
      expect(args.setCurrentWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Renamed Flow" }),
      )
      expect(args.setWorkflowSavedSnapshot).toHaveBeenCalled()
    })

    it("returns false when workflowPath is null", async () => {
      const store = createStore()
      const args = baseArgs()
      args.workflowPath = null

      const { result } = renderHook(() => useToolbarActions(args), {
        wrapper: makeWrapper(store),
      })

      let returnValue: boolean | undefined
      await act(async () => {
        returnValue = await result.current.renameWorkflow("New Name")
      })

      expect(returnValue).toBe(false)
    })

    it("returns false when new name matches current name", async () => {
      const store = createStore()
      const args = baseArgs()
      args.workflow = { version: 1, name: "Test Flow", nodes: [], edges: [] } as any

      const { result } = renderHook(() => useToolbarActions(args), {
        wrapper: makeWrapper(store),
      })

      let returnValue: boolean | undefined
      await act(async () => {
        returnValue = await result.current.renameWorkflow("Test Flow")
      })

      expect(returnValue).toBe(false)
    })
  })

  describe("deleteWorkflow", () => {
    it("clears state from all 4 keyed maps", async () => {
      const store = createStore()
      const path = "/projects/test/.c8c/test-flow.yaml"
      const key = toWorkflowExecutionKey(path)

      // Pre-populate all 4 maps
      const execState = {
        ...createEmptyWorkflowExecutionState(),
        runStatus: "done" as const,
        workflowName: "Test Flow",
      }
      store.set(workflowExecutionStatesAtom, { [key]: execState })
      store.set(workflowRequestedResultsAtom, { [key]: "find bugs" })
      store.set(workflowTemplateContextsAtom, {
        [key]: {
          templateId: "tpl-1",
          templateName: "Review",
          workflowPath: path,
          workflowName: "Test",
          source: "template",
        } as any,
      })
      store.set(workflowContinuationEntryStatesAtom, {
        [key]: {
          workflowPath: path,
          workflowName: "Test",
          source: "template",
          title: "",
          summary: "",
          contractLabel: "",
          contractText: "",
          inputText: "",
          outputText: "",
          readinessText: "",
        } as any,
      })

      ;(window.api as any).deleteWorkflow = vi
        .fn()
        .mockResolvedValue(undefined)
      ;(window.api as any).listProjectWorkflows = vi
        .fn()
        .mockResolvedValue([])
      ;(window.api as any).scanSkills = vi.fn().mockResolvedValue([])

      const args = baseArgs()
      args.workflowPath = path

      const { result } = renderHook(() => useToolbarActions(args), {
        wrapper: makeWrapper(store),
      })

      await act(async () => {
        await result.current.deleteWorkflow()
      })

      // All maps should have the key removed
      expect(store.get(workflowExecutionStatesAtom)[key]).toBeUndefined()
      expect(store.get(workflowRequestedResultsAtom)[key]).toBeUndefined()
      expect(store.get(workflowTemplateContextsAtom)[key]).toBeUndefined()
      expect(
        store.get(workflowContinuationEntryStatesAtom)[key],
      ).toBeUndefined()
    })

    it("resets workflow path and current workflow to empty state", async () => {
      const store = createStore()
      const path = "/projects/test/.c8c/test-flow.yaml"

      ;(window.api as any).deleteWorkflow = vi
        .fn()
        .mockResolvedValue(undefined)
      ;(window.api as any).listProjectWorkflows = vi
        .fn()
        .mockResolvedValue([])
      ;(window.api as any).scanSkills = vi.fn().mockResolvedValue([])

      const args = baseArgs()
      args.workflowPath = path

      const { result } = renderHook(() => useToolbarActions(args), {
        wrapper: makeWrapper(store),
      })

      await act(async () => {
        await result.current.deleteWorkflow()
      })

      expect(args.setSelectedWorkflowPath).toHaveBeenCalledWith(null)
      expect(args.setCurrentWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ name: "" }),
      )
      expect(args.setWorkflowSavedSnapshot).toHaveBeenCalled()
    })

    it("returns false when workflowPath is null", async () => {
      const store = createStore()
      const args = baseArgs()
      args.workflowPath = null

      const { result } = renderHook(() => useToolbarActions(args), {
        wrapper: makeWrapper(store),
      })

      let returnValue: boolean | undefined
      await act(async () => {
        returnValue = await result.current.deleteWorkflow()
      })

      expect(returnValue).toBe(false)
    })

    it("does not leak state from other keys", async () => {
      const store = createStore()
      const pathToDelete = "/projects/test/.c8c/delete-me.yaml"
      const pathToKeep = "/projects/test/.c8c/keep-me.yaml"
      const deleteKey = toWorkflowExecutionKey(pathToDelete)
      const keepKey = toWorkflowExecutionKey(pathToKeep)

      // Populate both keys
      store.set(workflowRequestedResultsAtom, {
        [deleteKey]: "delete this",
        [keepKey]: "keep this",
      })
      store.set(workflowTemplateContextsAtom, {
        [deleteKey]: {
          templateId: "tpl-del",
          templateName: "Del",
          workflowPath: pathToDelete,
          workflowName: "Del",
          source: "template",
        } as any,
        [keepKey]: {
          templateId: "tpl-keep",
          templateName: "Keep",
          workflowPath: pathToKeep,
          workflowName: "Keep",
          source: "template",
        } as any,
      })

      ;(window.api as any).deleteWorkflow = vi
        .fn()
        .mockResolvedValue(undefined)
      ;(window.api as any).listProjectWorkflows = vi
        .fn()
        .mockResolvedValue([])
      ;(window.api as any).scanSkills = vi.fn().mockResolvedValue([])

      const args = baseArgs()
      args.workflowPath = pathToDelete

      const { result } = renderHook(() => useToolbarActions(args), {
        wrapper: makeWrapper(store),
      })

      await act(async () => {
        await result.current.deleteWorkflow()
      })

      // Deleted key is gone
      expect(
        store.get(workflowRequestedResultsAtom)[deleteKey],
      ).toBeUndefined()
      expect(
        store.get(workflowTemplateContextsAtom)[deleteKey],
      ).toBeUndefined()

      // Other key is untouched
      expect(store.get(workflowRequestedResultsAtom)[keepKey]).toBe(
        "keep this",
      )
      expect(
        store.get(workflowTemplateContextsAtom)[keepKey].templateId,
      ).toBe("tpl-keep")
    })
  })

  describe("refreshProjectData", () => {
    it("calls IPC and updates setters", async () => {
      const store = createStore()
      const mockWorkflows = [{ name: "flow1", path: "/a.yaml" }]
      const mockSkills = [{ name: "skill1" }]

      ;(window.api as any).listProjectWorkflows = vi
        .fn()
        .mockResolvedValue(mockWorkflows)
      ;(window.api as any).scanSkills = vi
        .fn()
        .mockResolvedValue(mockSkills)

      const args = baseArgs()

      const { result } = renderHook(() => useToolbarActions(args), {
        wrapper: makeWrapper(store),
      })

      await act(async () => {
        await result.current.refreshProjectData({ silent: true })
      })

      expect(window.api.listProjectWorkflows).toHaveBeenCalledWith(
        "/projects/test",
      )
      expect(window.api.scanSkills).toHaveBeenCalledWith("/projects/test")
      expect(args.setWorkflows).toHaveBeenCalledWith(mockWorkflows)
      expect(args.setSkills).toHaveBeenCalledWith(mockSkills)
    })

    it("does nothing when selectedProject is null", async () => {
      const store = createStore()
      const args = baseArgs()
      args.selectedProject = null

      const { result } = renderHook(() => useToolbarActions(args), {
        wrapper: makeWrapper(store),
      })

      await act(async () => {
        await result.current.refreshProjectData({ silent: true })
      })

      expect(args.setWorkflows).not.toHaveBeenCalled()
      expect(args.setSkills).not.toHaveBeenCalled()
    })
  })
})
