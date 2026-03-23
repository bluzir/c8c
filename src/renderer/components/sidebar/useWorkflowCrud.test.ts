import { createStore } from "jotai"
import { describe, expect, it, vi } from "vitest"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import {
  currentWorkflowAtom,
  selectedInboxTaskKeyAtom,
  selectedWorkflowPathAtom,
  workflowSavedSnapshotAtom,
} from "@/lib/store"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { createEmptyWorkflowExecutionState } from "@/lib/workflow-execution"
import {
  selectedPastRunAtom,
  workflowExecutionStatesAtom,
} from "@/features/execution"
import {
  applyWorkflowSelectionReviewState,
  applyLoadedWorkflow,
  createEmptySelectionState,
  removeWorkflowFromProjectCaches,
} from "./useWorkflowCrud"

describe("useWorkflowCrud helpers", () => {
  it("preserves execution state when opening another workflow", () => {
    const store = createStore()
    const targetPath = "/tmp/running.chain"
    const runningState = {
      ...createEmptyWorkflowExecutionState(),
      runStatus: "running" as const,
      runId: "run-1",
      workspace: "/tmp/run-1",
    }
    const loadedWorkflow = {
      ...createEmptyWorkflow(),
      name: "Running workflow",
    }

    store.set(workflowExecutionStatesAtom, {
      [targetPath]: runningState,
    })
    store.set(selectedInboxTaskKeyAtom, "/tmp/workspace::task-1")
    store.set(selectedPastRunAtom, {
      runId: "run-previous",
      status: "blocked",
      workflowName: "Previous flow",
      workflowPath: "/tmp/previous.chain",
      startedAt: 1,
      completedAt: 2,
      reportPath: "",
      workspace: "/tmp/workspace",
    })

    applyLoadedWorkflow(
      targetPath,
      loadedWorkflow,
      (next) => {
        const value =
          typeof next === "function"
            ? next(store.get(selectedWorkflowPathAtom))
            : next
        store.set(selectedWorkflowPathAtom, value)
      },
      (next) => {
        const value =
          typeof next === "function"
            ? next(store.get(currentWorkflowAtom))
            : next
        store.set(currentWorkflowAtom, value)
      },
      (next) => {
        const value =
          typeof next === "function"
            ? next(store.get(workflowSavedSnapshotAtom))
            : next
        store.set(workflowSavedSnapshotAtom, value)
      },
      () => {
        store.set(selectedInboxTaskKeyAtom, null)
        store.set(selectedPastRunAtom, null)
      },
    )

    expect(store.get(selectedWorkflowPathAtom)).toBe(targetPath)
    expect(store.get(currentWorkflowAtom)).toEqual(loadedWorkflow)
    expect(store.get(workflowSavedSnapshotAtom)).toBe(
      workflowSnapshot(loadedWorkflow),
    )
    expect(store.get(selectedInboxTaskKeyAtom)).toBeNull()
    expect(store.get(selectedPastRunAtom)).toBeNull()
    expect(store.get(workflowExecutionStatesAtom)[targetPath]).toMatchObject({
      runStatus: "running",
      runId: "run-1",
      workspace: "/tmp/run-1",
    })
  })

  it("clears draft execution when switching to an empty selection", () => {
    const store = createStore()
    const clearDraftExecutionState = vi.fn()
    store.set(selectedInboxTaskKeyAtom, "/tmp/workspace::task-1")
    store.set(selectedPastRunAtom, {
      runId: "run-previous",
      status: "blocked",
      workflowName: "Previous flow",
      workflowPath: "/tmp/previous.chain",
      startedAt: 1,
      completedAt: 2,
      reportPath: "",
      workspace: "/tmp/workspace",
    })

    createEmptySelectionState(
      (next) => {
        const value =
          typeof next === "function"
            ? next(store.get(selectedWorkflowPathAtom))
            : next
        store.set(selectedWorkflowPathAtom, value)
      },
      (next) => {
        const value =
          typeof next === "function"
            ? next(store.get(currentWorkflowAtom))
            : next
        store.set(currentWorkflowAtom, value)
      },
      (next) => {
        const value =
          typeof next === "function"
            ? next(store.get(workflowSavedSnapshotAtom))
            : next
        store.set(workflowSavedSnapshotAtom, value)
      },
      clearDraftExecutionState,
      () => {
        store.set(selectedInboxTaskKeyAtom, null)
        store.set(selectedPastRunAtom, null)
      },
    )

    const emptyWorkflow = createEmptyWorkflow()
    expect(store.get(selectedWorkflowPathAtom)).toBeNull()
    expect(store.get(currentWorkflowAtom)).toEqual(emptyWorkflow)
    expect(store.get(workflowSavedSnapshotAtom)).toBe(
      workflowSnapshot(emptyWorkflow),
    )
    expect(store.get(selectedInboxTaskKeyAtom)).toBeNull()
    expect(store.get(selectedPastRunAtom)).toBeNull()
    expect(clearDraftExecutionState).toHaveBeenCalledTimes(1)
  })

  it("removes a deleted workflow from every cached project list", () => {
    expect(
      removeWorkflowFromProjectCaches(
        {
          "/tmp/alpha": [
            { name: "Keep", path: "/tmp/alpha/keep.chain", updatedAt: 1 },
            { name: "Delete", path: "/tmp/shared/delete.chain", updatedAt: 2 },
          ],
          "/tmp/beta": [
            { name: "Delete", path: "/tmp/shared/delete.chain", updatedAt: 3 },
          ],
        },
        "/tmp/shared/delete.chain",
      ),
    ).toEqual({
      "/tmp/alpha": [
        { name: "Keep", path: "/tmp/alpha/keep.chain", updatedAt: 1 },
      ],
      "/tmp/beta": [],
    })
  })

  it("restores the selected past run when opening a workflow for review", () => {
    const store = createStore()
    const reviewRun = {
      runId: "run-latest",
      status: "completed",
      workflowName: "Review flow",
      workflowPath: "/tmp/review.chain",
      startedAt: 10,
      completedAt: 20,
      reportPath: "",
      workspace: "/tmp/review-run",
    } as const

    store.set(selectedInboxTaskKeyAtom, "/tmp/review-run::task-1")
    store.set(selectedPastRunAtom, {
      ...reviewRun,
      runId: "run-previous",
    })

    applyWorkflowSelectionReviewState(
      reviewRun,
      () => {
        store.set(selectedInboxTaskKeyAtom, null)
        store.set(selectedPastRunAtom, null)
      },
      (next) => {
        store.set(selectedPastRunAtom, next)
      },
    )

    expect(store.get(selectedInboxTaskKeyAtom)).toBeNull()
    expect(store.get(selectedPastRunAtom)).toEqual(reviewRun)
  })
})
