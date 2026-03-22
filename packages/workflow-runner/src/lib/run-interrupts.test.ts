import { mkdtemp } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, it } from "vitest"
import { approvalTaskId, getWorkflowHilTask, upsertApprovalHilTask } from "../hil-store"
import {
  createRunInterruptRegistry,
  persistApprovalDecision,
  persistResolvedApproval,
  readApprovalDecision,
} from "./run-interrupts"

describe("run-interrupts", () => {
  it("persists and reloads approval decisions", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "run-interrupts-"))

    await persistApprovalDecision(workspace, "approval:1", {
      approved: true,
      editedContent: "Ship this",
    })

    await expect(readApprovalDecision(workspace, "approval:1")).resolves.toEqual({
      approved: true,
      editedContent: "Ship this",
    })
  })

  it("resolves a pending approval through the registry", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "run-interrupts-"))
    const registry = createRunInterruptRegistry()
    const pending = registry.waitForApproval("run-1", workspace, "approval-1")
    let resolved = false
    for (let attempt = 0; attempt < 10; attempt += 1) {
      resolved = registry.resolveApproval("run-1", "approval-1", {
        approved: false,
        editedContent: "Need changes",
      })
      if (resolved) break
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    expect(resolved).toBe(true)

    await expect(pending).resolves.toEqual({
      approved: false,
      editedContent: "Need changes",
    })
  })

  it("resolves eval overrides false on abort", async () => {
    const registry = createRunInterruptRegistry()
    const controller = new AbortController()
    const pending = registry.waitForEvalOverride("run-1", "eval-1", controller.signal)

    controller.abort()

    await expect(pending).resolves.toBe(false)
  })

  it("persists resolved approvals into both the decision file and HIL task state", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "run-interrupts-"))
    await upsertApprovalHilTask({
      workspace,
      runId: "run-1",
      workflowName: "Audit flow",
      nodeId: "approval-1",
      title: "Approve changes",
      message: "Review the generated changes",
      content: "Diff goes here",
      allowEdit: true,
    })

    await persistResolvedApproval(workspace, "approval-1", {
      approved: true,
      editedContent: "Ship this version",
    })

    await expect(readApprovalDecision(workspace, "approval-1")).resolves.toEqual({
      approved: true,
      editedContent: "Ship this version",
    })

    const task = await getWorkflowHilTask(workspace, approvalTaskId("approval-1"))
    expect(task?.state.status).toBe("answered")
    expect(task?.state.resolution).toBe("approved")
    expect(task?.latestResponse?.answers).toEqual({
      approved: true,
      editedContent: "Ship this version",
    })
  })
})
