import { describe, expect, it, vi } from "vitest"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import {
  restoreSelectedWorkflowIfNeeded,
  shouldRestoreSelectedWorkflow,
} from "./workflowRestore"

function createBlankWorkflow() {
  return {
    version: 1 as const,
    name: "",
    description: "",
    defaults: {
      model: "sonnet",
      maxTurns: 60,
      timeout_minutes: 30,
      maxParallel: 8,
    },
    nodes: [],
    edges: [],
  }
}

describe("restoreSelectedWorkflowIfNeeded", () => {
  it("skips restoring when there is no selected workflow path", async () => {
    const loadWorkflow = vi.fn()

    const restoredWorkflow = await restoreSelectedWorkflowIfNeeded({
      selectedWorkflowPath: null,
      currentWorkflow: createBlankWorkflow(),
      loadWorkflow,
    })

    expect(restoredWorkflow).toBeNull()
    expect(loadWorkflow).not.toHaveBeenCalled()
  })

  it("skips restoring when the current workflow still has content", async () => {
    const loadWorkflow = vi.fn()
    const currentWorkflow = {
      ...createEmptyWorkflow(),
      name: "Existing workflow",
    }

    const restoredWorkflow = await restoreSelectedWorkflowIfNeeded({
      selectedWorkflowPath: "/tmp/existing.chain",
      currentWorkflow,
      loadWorkflow,
    })

    expect(restoredWorkflow).toBeNull()
    expect(loadWorkflow).not.toHaveBeenCalled()
  })

  it("can restore the same workflow path again after memory state is cleared", async () => {
    const restored = {
      ...createEmptyWorkflow(),
      name: "Recovered workflow",
    }
    const loadWorkflow = vi.fn().mockResolvedValue(restored)

    await restoreSelectedWorkflowIfNeeded({
      selectedWorkflowPath: "/tmp/recovered.chain",
      currentWorkflow: createBlankWorkflow(),
      loadWorkflow,
    })
    await restoreSelectedWorkflowIfNeeded({
      selectedWorkflowPath: "/tmp/recovered.chain",
      currentWorkflow: createBlankWorkflow(),
      loadWorkflow,
    })

    expect(loadWorkflow).toHaveBeenCalledTimes(2)
    expect(loadWorkflow).toHaveBeenNthCalledWith(1, "/tmp/recovered.chain")
    expect(loadWorkflow).toHaveBeenNthCalledWith(2, "/tmp/recovered.chain")
  })
})

describe("shouldRestoreSelectedWorkflow", () => {
  it("restores a selected workflow when memory falls back to the default draft graph", () => {
    expect(
      shouldRestoreSelectedWorkflow(
        "/tmp/recovered.chain",
        createEmptyWorkflow(),
      ),
    ).toBe(true)
  })
})
