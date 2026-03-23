import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  approvalTaskId,
  createWorkflowRunner,
  getWorkflowHilTask,
  humanTaskId,
  listWorkflowHilTasks,
  resolveWorkflowHilTaskByRef,
  writeWorkflowApprovalDecision,
  type Workflow,
  type WorkflowEvent,
} from "@c8c/workflow-runner"

const APPROVAL_WORKFLOW: Workflow = {
  version: 1,
  name: "Approval Workflow",
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
    {
      id: "approval-1",
      type: "approval",
      position: { x: 200, y: 0 },
      config: {
        message: "Approve the generated content?",
        show_content: true,
        allow_edit: true,
      },
    },
    { id: "output-1", type: "output", position: { x: 400, y: 0 }, config: {} },
  ],
  edges: [
    { id: "edge-1", source: "input-1", target: "approval-1", type: "default" },
    { id: "edge-2", source: "approval-1", target: "output-1", type: "default" },
  ],
}

const HUMAN_FORM_WORKFLOW: Workflow = {
  version: 1,
  name: "Human Form Workflow",
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
    {
      id: "human-1",
      type: "human",
      position: { x: 200, y: 0 },
      config: {
        mode: "form",
        requestSource: "static",
        staticRequest: {
          version: 1,
          kind: "form",
          title: "Review generated draft",
          instructions: "Capture the final reviewer decision.",
          fields: [
            { id: "reviewer", type: "text", label: "Reviewer", required: true },
            { id: "notes", type: "textarea", label: "Notes" },
          ],
        },
      },
    },
    { id: "output-1", type: "output", position: { x: 400, y: 0 }, config: {} },
  ],
  edges: [
    { id: "edge-1", source: "input-1", target: "human-1", type: "default" },
    { id: "edge-2", source: "human-1", target: "output-1", type: "default" },
  ],
}

const HUMAN_APPROVAL_WORKFLOW: Workflow = {
  version: 1,
  name: "Human Approval Workflow",
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
    {
      id: "human-approval-1",
      type: "human",
      position: { x: 200, y: 0 },
      config: {
        mode: "approval",
        requestSource: "static",
        staticRequest: {
          version: 1,
          kind: "approval",
          title: "Approve draft",
          instructions: "Approve the edited draft before publishing.",
          fields: [],
          metadata: {
            allowEdit: true,
          },
        },
      },
    },
    { id: "output-1", type: "output", position: { x: 400, y: 0 }, config: {} },
  ],
  edges: [
    {
      id: "edge-1",
      source: "input-1",
      target: "human-approval-1",
      type: "default",
    },
    {
      id: "edge-2",
      source: "human-approval-1",
      target: "output-1",
      type: "default",
    },
  ],
}

async function collectRun(handle: {
  events: AsyncIterable<WorkflowEvent>
  result: Promise<unknown>
}) {
  const events: WorkflowEvent[] = []
  const eventsPromise = (async () => {
    for await (const event of handle.events) {
      events.push(event)
    }
  })()

  const summary = await handle.result
  await eventsPromise

  return { summary, events }
}

async function createWorkspace(prefix: string) {
  return mkdtemp(join(tmpdir(), prefix))
}

function createApprovalRunner(workspace: string) {
  return createWorkflowRunner({
    startProviderTask() {
      throw new Error(
        "Provider execution should not be called for approval-only workflow tests",
      )
    },
    workspaceStore: {
      async createRunWorkspace() {
        return workspace
      },
    },
  })
}

describe("openclaw workflow runner compatibility", () => {
  it("suspends at approval nodes and preserves waiting state", async () => {
    const workspace = await createWorkspace("c8c-openclaw-approval-")
    const runner = createApprovalRunner(workspace)

    const handle = await runner.startRun({
      workflow: APPROVAL_WORKFLOW,
      input: { type: "text", value: "Generated draft" },
      approvalBehavior: "suspend",
    })

    const { summary, events } = await collectRun(handle)
    const snapshot = await runner.getSnapshot(handle.runId)

    expect(summary).toMatchObject({ status: "paused", workspace })
    expect(
      events.some(
        (event) =>
          event.type === "approval-requested" && event.nodeId === "approval-1",
      ),
    ).toBe(true)
    expect(snapshot?.state?.nodeStates["approval-1"]?.status).toBe(
      "waiting_approval",
    )
  })

  it("resumes a suspended approval run after approval is persisted", async () => {
    const workspace = await createWorkspace("c8c-openclaw-approve-")
    const runner = createApprovalRunner(workspace)

    const firstHandle = await runner.startRun({
      workflow: APPROVAL_WORKFLOW,
      input: { type: "text", value: "Generated draft" },
      approvalBehavior: "suspend",
    })

    await collectRun(firstHandle)
    await writeWorkflowApprovalDecision(workspace, "approval-1", {
      approved: true,
      editedContent: "Edited draft",
    })

    const resumedHandle = await runner.resumeRun({
      workflow: APPROVAL_WORKFLOW,
      workspace,
      approvalBehavior: "suspend",
    })

    const { summary } = await collectRun(resumedHandle)
    const snapshot = await runner.getSnapshot(resumedHandle.runId)

    expect(summary).toMatchObject({ status: "completed", workspace })
    expect(snapshot?.state?.nodeStates["output-1"]?.output?.content).toBe(
      "Edited draft",
    )
  })

  it("maps explicit approval rejection to a cancelled run", async () => {
    const workspace = await createWorkspace("c8c-openclaw-reject-")
    const runner = createApprovalRunner(workspace)

    const firstHandle = await runner.startRun({
      workflow: APPROVAL_WORKFLOW,
      input: { type: "text", value: "Generated draft" },
      approvalBehavior: "suspend",
    })

    await collectRun(firstHandle)
    await writeWorkflowApprovalDecision(workspace, "approval-1", {
      approved: false,
    })

    const resumedHandle = await runner.resumeRun({
      workflow: APPROVAL_WORKFLOW,
      workspace,
      approvalBehavior: "suspend",
    })

    const { summary } = await collectRun(resumedHandle)

    expect(summary).toMatchObject({ status: "cancelled", workspace })
  })

  it("persists approval checkpoints as HIL tasks that can be listed and resolved", async () => {
    const workspace = await createWorkspace("c8c-openclaw-hil-")
    const runner = createApprovalRunner(workspace)

    const firstHandle = await runner.startRun({
      workflow: APPROVAL_WORKFLOW,
      input: { type: "text", value: "Generated draft" },
      approvalBehavior: "suspend",
    })

    await collectRun(firstHandle)

    const tasks = (await listWorkflowHilTasks([dirname(workspace)])).filter(
      (task) => task.workspace === workspace,
    )
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      status: "open",
      workspace,
      nodeId: "approval-1",
    })

    const task = await getWorkflowHilTask(
      workspace,
      approvalTaskId("approval-1"),
    )
    expect(task?.request.kind).toBe("approval")
    expect(task?.state.allowEdit).toBe(true)

    const resolved = await resolveWorkflowHilTaskByRef(tasks[0].task, {
      data: {
        approved: true,
        editedContent: "Edited from HIL task",
      },
      idempotencyKey: "test-key",
      answeredBy: "vitest",
      source: "cli",
    })

    expect(resolved.state.status).toBe("answered")
    expect(resolved.latestResponse?.answers.editedContent).toBe(
      "Edited from HIL task",
    )

    const secondWrite = await resolveWorkflowHilTaskByRef(tasks[0].task, {
      data: {
        approved: true,
        editedContent: "Ignored duplicate",
      },
      idempotencyKey: "test-key",
      answeredBy: "vitest",
      source: "cli",
    })

    expect(secondWrite.latestResponse?.metadata.revision).toBe(1)
    expect(secondWrite.latestResponse?.answers.editedContent).toBe(
      "Edited from HIL task",
    )

    const resumedHandle = await runner.resumeRun({
      workflow: APPROVAL_WORKFLOW,
      workspace,
      approvalBehavior: "suspend",
    })

    const { summary } = await collectRun(resumedHandle)
    expect(summary).toMatchObject({ status: "completed", workspace })
  })

  it("blocks on human form nodes and resumes after a generic HIL response", async () => {
    const workspace = await createWorkspace("c8c-openclaw-human-form-")
    const runner = createApprovalRunner(workspace)

    const firstHandle = await runner.startRun({
      workflow: HUMAN_FORM_WORKFLOW,
      input: { type: "text", value: "Generated draft" },
      approvalBehavior: "suspend",
    })

    const firstRun = await collectRun(firstHandle)
    const firstSnapshot = await runner.getSnapshot(firstHandle.runId)

    expect(firstRun.summary).toMatchObject({ status: "blocked", workspace })
    expect(
      firstRun.events.some(
        (event) =>
          event.type === "human-task-created" && event.nodeId === "human-1",
      ),
    ).toBe(true)
    expect(firstSnapshot?.state?.nodeStates["human-1"]?.status).toBe(
      "waiting_human",
    )

    const tasks = (await listWorkflowHilTasks([dirname(workspace)])).filter(
      (task) => task.workspace === workspace,
    )
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      kind: "form",
      status: "open",
      nodeId: "human-1",
    })

    const resolved = await resolveWorkflowHilTaskByRef(tasks[0].task, {
      data: {
        answers: {
          reviewer: "vitest",
          notes: "Ship it",
        },
      },
      idempotencyKey: "human-form-key",
      answeredBy: "vitest",
      source: "cli",
    })

    expect(resolved.state.status).toBe("answered")
    expect(resolved.latestResponse?.answers).toEqual({
      reviewer: "vitest",
      notes: "Ship it",
    })

    const resumedHandle = await runner.resumeRun({
      workflow: HUMAN_FORM_WORKFLOW,
      workspace,
      approvalBehavior: "suspend",
    })

    const resumedRun = await collectRun(resumedHandle)
    const resumedSnapshot = await runner.getSnapshot(resumedHandle.runId)
    const task = await getWorkflowHilTask(workspace, humanTaskId("human-1"))

    expect(resumedRun.summary).toMatchObject({ status: "completed", workspace })
    expect(
      JSON.parse(
        resumedSnapshot?.state?.nodeStates["human-1"]?.output?.content || "{}",
      ),
    ).toMatchObject({
      ok: true,
      resolution: "submitted",
      answers: {
        reviewer: "vitest",
        notes: "Ship it",
      },
    })
    expect(task?.state.status).toBe("consumed")
  })

  it("supports approval-style human nodes through HIL approval responses", async () => {
    const workspace = await createWorkspace("c8c-openclaw-human-approval-")
    const runner = createApprovalRunner(workspace)

    const firstHandle = await runner.startRun({
      workflow: HUMAN_APPROVAL_WORKFLOW,
      input: { type: "text", value: "Generated draft" },
      approvalBehavior: "suspend",
    })

    await collectRun(firstHandle)
    const task = await getWorkflowHilTask(
      workspace,
      humanTaskId("human-approval-1"),
    )
    expect(task?.request.kind).toBe("approval")

    await resolveWorkflowHilTaskByRef(task!.task, {
      data: {
        approved: true,
        editedContent: "Edited by human reviewer",
      },
      idempotencyKey: "human-approval-key",
      answeredBy: "vitest",
      source: "cli",
    })

    const resumedHandle = await runner.resumeRun({
      workflow: HUMAN_APPROVAL_WORKFLOW,
      workspace,
      approvalBehavior: "suspend",
    })

    const resumedRun = await collectRun(resumedHandle)
    const resumedSnapshot = await runner.getSnapshot(resumedHandle.runId)
    const humanOutput = JSON.parse(
      resumedSnapshot?.state?.nodeStates["human-approval-1"]?.output?.content ||
        "{}",
    )

    expect(resumedRun.summary).toMatchObject({ status: "completed", workspace })
    expect(humanOutput).toMatchObject({
      ok: true,
      resolution: "submitted",
      answers: {
        approved: true,
        editedContent: "Edited by human reviewer",
      },
    })
  })
})
