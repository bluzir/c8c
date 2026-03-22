import { describe, expect, it, vi } from "vitest"
import type { RunResult, Workflow } from "@shared/types"
import {
  assembleInputWithAttachments,
  buildExecutionSurfaceNotice,
  createCancelledExecutionState,
  createEmptyWorkflowExecutionState,
  createExecutionStartState,
  hasWorkflowExecutionInspectableResult,
  resetWorkflowExecutionState,
  reduceWorkflowExecutionEvent,
} from "./workflow-execution"

function createWorkflow(): Workflow {
  return {
    version: 1,
    name: "Research flow",
    nodes: [
      {
        id: "input",
        type: "input",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "output",
        type: "output",
        position: { x: 100, y: 0 },
        config: {},
      },
    ],
    edges: [
      {
        id: "edge-1",
        source: "input",
        target: "output",
        type: "default",
      },
    ],
  }
}

function createPastRun(): RunResult {
  return {
    runId: "past-run",
    status: "completed",
    workflowName: "Previous flow",
    startedAt: 10,
    completedAt: 20,
    reportPath: "/tmp/report.md",
    workspace: "/tmp/workspace",
  }
}

describe("workflow execution state", () => {
  it("creates a fresh starting state while preserving persistent selections", () => {
    const workflow = createWorkflow()
    const previousState = {
      ...createEmptyWorkflowExecutionState(),
      workspace: "/tmp/existing-workspace",
      selectedPastRun: createPastRun(),
    }

    const nextState = createExecutionStartState(
      previousState,
      workflow,
      "/tmp/research.chain",
      "/tmp/project",
      123,
    )

    expect(nextState.runStatus).toBe("starting")
    expect(nextState.runStartedAt).toBe(123)
    expect(nextState.workflowName).toBe("Research flow")
    expect(nextState.runWorkflowPath).toBe("/tmp/research.chain")
    expect(nextState.projectPath).toBe("/tmp/project")
    expect(nextState.workspace).toBe("/tmp/existing-workspace")
    expect(nextState.selectedPastRun).toEqual(previousState.selectedPastRun)
    expect(nextState.nodeStates).toEqual({
      input: { status: "pending", attempts: 0, log: [] },
      output: { status: "pending", attempts: 0, log: [] },
    })
    expect(nextState.workflowSnapshot).toEqual(workflow)
    expect(nextState.workflowSnapshot).not.toBe(workflow)
  })

  it("writes output node content into finalContent", () => {
    const workflow = createWorkflow()
    const previousState = createExecutionStartState(
      createEmptyWorkflowExecutionState(),
      workflow,
      "/tmp/research.chain",
      "/tmp/project",
      123,
    )

    const transition = reduceWorkflowExecutionEvent(
      previousState,
      {
        type: "node-done",
        runId: "run-1",
        nodeId: "output",
        output: {
          content: "Final answer",
          metadata: { source: "node-output" },
        },
      },
      workflow,
    )

    expect(transition.nextState.finalContent).toBe("Final answer")
    expect(transition.nextState.nodeStates.output.status).toBe("completed")
    expect(transition.effects).toEqual({})
  })

  it("updates runtime graph state and adds pending states for new nodes", () => {
    const workflow = createWorkflow()
    const previousState = {
      ...createExecutionStartState(
        createEmptyWorkflowExecutionState(),
        workflow,
        "/tmp/research.chain",
        "/tmp/project",
        123,
      ),
      nodeStates: {
        input: { status: "completed" as const, attempts: 1, log: [] },
        stale: { status: "failed" as const, attempts: 1, log: [], error: "old" },
      },
    }

    const transition = reduceWorkflowExecutionEvent(previousState, {
      type: "nodes-expanded",
      runId: "run-1",
      newNodeIds: ["branch-1"],
      runtimeMeta: {
        "branch-1": {
          subtaskKey: "a",
          branchIndex: 0,
          totalBranches: 1,
          templateId: "template",
        },
      },
      nodes: [
        workflow.nodes[0],
        {
          id: "branch-1",
          type: "skill",
          position: { x: 50, y: 50 },
          config: {
            skillRef: "researcher",
            prompt: "Investigate",
          },
        },
      ],
      edges: [
        {
          id: "edge-branch",
          source: "input",
          target: "branch-1",
          type: "default",
        },
      ],
    })

    expect(Object.keys(transition.nextState.nodeStates)).toEqual(["input", "branch-1"])
    expect(transition.nextState.nodeStates["branch-1"]).toEqual({
      status: "pending",
      attempts: 0,
      log: [],
    })
    expect(transition.nextState.runtimeNodes).toHaveLength(2)
    expect(transition.nextState.runtimeEdges).toHaveLength(1)
    expect(transition.nextState.runtimeMeta["branch-1"]?.templateId).toBe("template")
  })

  it("marks queued nodes separately from running nodes", () => {
    const workflow = createWorkflow()
    const previousState = createExecutionStartState(
      createEmptyWorkflowExecutionState(),
      workflow,
      "/tmp/research.chain",
      "/tmp/project",
      123,
    )

    const transition = reduceWorkflowExecutionEvent(previousState, {
      type: "node-queued",
      runId: "run-1",
      nodeId: "input",
    })

    expect(transition.nextState.nodeStates.input.status).toBe("queued")
    expect(transition.nextState.activeNodeId).toBeNull()
  })

  it("produces approval side effects separately from state", () => {
    const workflow = createWorkflow()
    const previousState = createExecutionStartState(
      createEmptyWorkflowExecutionState(),
      workflow,
      "/tmp/research.chain",
      "/tmp/project",
      123,
    )

    const transition = reduceWorkflowExecutionEvent(previousState, {
      type: "approval-requested",
      runId: "run-1",
      nodeId: "input",
      content: "Need approval",
      message: "Review this",
      allowEdit: true,
    })

    expect(transition.nextState.nodeStates.input.status).toBe("waiting_approval")
    expect(transition.effects.approvalRequest).toEqual({
      runId: "run-1",
      nodeId: "input",
      content: "Need approval",
      message: "Review this",
      allowEdit: true,
    })
  })

  it("tracks human-task lifecycle events in node state", () => {
    const workflow = createWorkflow()
    const previousState = createExecutionStartState(
      createEmptyWorkflowExecutionState(),
      workflow,
      "/tmp/research.chain",
      "/tmp/project",
      123,
    )

    const created = reduceWorkflowExecutionEvent(previousState, {
      type: "human-task-created",
      runId: "run-1",
      nodeId: "input",
      taskId: "human-input",
      title: "Review draft",
    })

    expect(created.nextState.nodeStates.input.status).toBe("waiting_human")
    expect(created.nextState.nodeStates.input.humanTask).toEqual({
      taskId: "human-input",
      status: "open",
    })

    const resolved = reduceWorkflowExecutionEvent(created.nextState, {
      type: "human-task-resolved",
      runId: "run-1",
      nodeId: "input",
      taskId: "human-input",
      resolution: "submitted",
    })

    expect(resolved.nextState.nodeStates.input.humanTask).toEqual({
      taskId: "human-input",
      status: "answered",
    })
  })

  it("marks a run as finished and requests history refresh", () => {
    const previousState = {
      ...createEmptyWorkflowExecutionState(),
      runStatus: "running" as const,
      runStartedAt: 100,
      runId: "run-1",
      runWorkflowPath: "/tmp/research.chain",
      activeNodeId: "output",
      reportPath: "/tmp/old-report.md",
      finalContent: "Final answer",
    }

    const transition = reduceWorkflowExecutionEvent(
      previousState,
      {
        type: "run-done",
        runId: "run-1",
        status: "completed",
        reportPath: "/tmp/new-report.md",
        workspace: "/tmp/run-workspace",
      },
      undefined,
      999,
    )

    expect(transition.nextState.runStatus).toBe("done")
    expect(transition.nextState.runOutcome).toBe("completed")
    expect(transition.nextState.completedAt).toBe(999)
    expect(transition.nextState.runId).toBeNull()
    expect(transition.nextState.runWorkflowPath).toBe("/tmp/research.chain")
    expect(transition.nextState.activeNodeId).toBeNull()
    expect(transition.nextState.reportPath).toBe("/tmp/new-report.md")
    expect(transition.nextState.workspace).toBe("/tmp/run-workspace")
    expect(transition.nextState.surfaceNotice).toEqual({
      level: "success",
      title: "Run complete",
      description: "Result is ready to review from this flow.",
      actionLabel: "View result",
      actionTarget: "result",
    })
    expect(transition.effects.refreshPastRuns).toBe(true)
    expect(transition.effects.runFinished).toBe(true)
  })

  it("treats blocked runs as a finished outcome", () => {
    const transition = reduceWorkflowExecutionEvent(
      {
        ...createEmptyWorkflowExecutionState(),
        runStatus: "running",
        runId: "run-1",
      },
      {
        type: "run-done",
        runId: "run-1",
        status: "blocked",
        workspace: "/tmp/run-workspace",
      },
      undefined,
      999,
    )

    expect(transition.nextState.runStatus).toBe("done")
    expect(transition.nextState.runOutcome).toBe("blocked")
    expect(transition.effects.runFinished).toBe(true)
  })

  it("returns a separate failure message for global run errors", () => {
    const transition = reduceWorkflowExecutionEvent(createEmptyWorkflowExecutionState(), {
      type: "node-error",
      runId: "run-1",
      nodeId: "__global",
      error: "Workflow crashed",
    })

    expect(transition.nextState.runStatus).toBe("error")
    expect(transition.nextState.lastError).toBe("Workflow crashed")
    expect(transition.effects.runFailedMessage).toBe("Workflow crashed")
  })

  it("marks in-flight nodes as skipped when cancelling locally", () => {
    const previousState = {
      ...createEmptyWorkflowExecutionState(),
      runStatus: "cancelling" as const,
      runId: "run-1",
      runWorkflowPath: "/tmp/research.chain",
      activeNodeId: "output",
      finalContent: "Partial answer",
      reportPath: "/tmp/partial-report.md",
      nodeStates: {
        input: {
          status: "completed" as const,
          attempts: 1,
          log: [],
          output: {
            content: "Partial answer",
            metadata: { source: "output" },
          },
        },
        branch: { status: "running" as const, attempts: 0, log: [] },
        approval: { status: "waiting_approval" as const, attempts: 0, log: [] },
        review: { status: "waiting_human" as const, attempts: 0, log: [] },
      },
    }

    const nextState = createCancelledExecutionState(previousState)

    expect(nextState.runStatus).toBe("done")
    expect(nextState.runOutcome).toBe("cancelled")
    expect(nextState.runId).toBeNull()
    expect(nextState.runWorkflowPath).toBe("/tmp/research.chain")
    expect(nextState.activeNodeId).toBeNull()
    expect(nextState.finalContent).toBe("Partial answer")
    expect(nextState.reportPath).toBe("/tmp/partial-report.md")
    expect(nextState.nodeStates.branch.status).toBe("skipped")
    expect(nextState.nodeStates.approval.status).toBe("skipped")
    expect(nextState.nodeStates.review.status).toBe("skipped")
    expect(nextState.nodeStates.input.status).toBe("completed")
    expect(nextState.surfaceNotice).toEqual({
      level: "warning",
      title: "Run cancelled",
      description: "The flow stopped before it finished, but partial result is still available to review.",
      actionLabel: "View partial result",
      actionTarget: "result",
    })
  })

  it("keeps cancelling visible while late node activity arrives", () => {
    const previousState = {
      ...createEmptyWorkflowExecutionState(),
      runStatus: "cancelling" as const,
      runId: "run-1",
      nodeStates: {
        input: { status: "completed" as const, attempts: 1, log: [] },
        output: { status: "queued" as const, attempts: 0, log: [] },
      },
    }

    const transition = reduceWorkflowExecutionEvent(previousState, {
      type: "node-start",
      runId: "run-1",
      nodeId: "output",
    })

    expect(transition.nextState.runStatus).toBe("cancelling")
    expect(transition.nextState.activeNodeId).toBe("output")
    expect(transition.nextState.nodeStates.output.status).toBe("running")
  })

  it("builds an inbox-oriented notice for blocked runs", () => {
    const notice = buildExecutionSurfaceNotice({
      ...createEmptyWorkflowExecutionState(),
      runStatus: "done",
      runOutcome: "blocked",
    })

    expect(notice).toEqual({
      level: "warning",
      title: "Needs review",
      description: "Approval or structured input is required before the flow can continue.",
      actionLabel: "Open inbox",
      actionTarget: "inbox",
    })
  })

  it("falls back to activity when a completed run has no inspectable result artifact", () => {
    const notice = buildExecutionSurfaceNotice({
      ...createEmptyWorkflowExecutionState(),
      runStatus: "done",
      runOutcome: "completed",
      finalContent: "",
      reportPath: null,
      nodeStates: {},
    })

    expect(notice).toEqual({
      level: "success",
      title: "Run complete",
      description: "Activity is ready to review from this flow.",
      actionLabel: "Open activity",
      actionTarget: "activity",
    })
  })

  it("resets into idle without wiping inspectable work when requested", () => {
    const previousState = {
      ...createEmptyWorkflowExecutionState(),
      runStatus: "done" as const,
      runOutcome: "cancelled" as const,
      completedAt: 999,
      runWorkflowPath: "/tmp/research.chain",
      workflowName: "Research flow",
      projectPath: "/tmp/project",
      lastError: "Stopped by user",
      inspectedNodeId: "input",
      finalContent: "Partial answer",
      reportPath: "/tmp/partial-report.md",
      selectedPastRun: createPastRun(),
      runtimeNodes: createWorkflow().nodes,
      runtimeEdges: createWorkflow().edges,
      runtimeMeta: {
        input: {
          subtaskKey: "alpha",
          branchIndex: 0,
          totalBranches: 1,
          templateId: "input",
        },
      },
      artifactRecords: [
        {
          id: "artifact-1",
          title: "Spec draft",
          kind: "document",
          projectPath: "/tmp/project",
          workspace: "/tmp/run-workspace",
          runId: "run-1",
          relativePath: "spec.md",
          contentPath: "/tmp/spec.md",
          metadataPath: "/tmp/spec.meta.json",
          createdAt: 100,
          updatedAt: 100,
        },
      ],
      artifactPersistenceStatus: "saved" as const,
      nodeStates: {
        input: {
          status: "completed",
          attempts: 1,
          log: [],
          output: {
            content: "Partial answer",
            metadata: { source: "output" },
          },
        },
      },
      surfaceNotice: {
        level: "warning",
        title: "Run cancelled",
        description: "The flow stopped before it finished, but partial result is still available to review.",
        actionLabel: "View partial result",
        actionTarget: "result",
      },
    }

    const nextState = resetWorkflowExecutionState(previousState, {
      preserveCompletedWork: true,
    })

    expect(nextState.runStatus).toBe("idle")
    expect(nextState.runId).toBeNull()
    expect(nextState.activeNodeId).toBeNull()
    expect(nextState.surfaceNotice).toBeNull()
    expect(nextState.runOutcome).toBe("cancelled")
    expect(nextState.finalContent).toBe("Partial answer")
    expect(nextState.reportPath).toBe("/tmp/partial-report.md")
    expect(nextState.nodeStates.input.output?.content).toBe("Partial answer")
    expect(nextState.runtimeNodes).toEqual(createWorkflow().nodes)
    expect(nextState.artifactRecords).toHaveLength(1)
    expect(nextState.selectedPastRun).toEqual(createPastRun())
  })

  it("detects inspectable output from node results", () => {
    expect(hasWorkflowExecutionInspectableResult({
      finalContent: "",
      reportPath: null,
      nodeStates: {
        output: {
          status: "completed",
          attempts: 1,
          log: [],
          output: {
            content: "Artifact body",
            metadata: { source: "output" },
          },
        },
      },
    })).toBe(true)
  })
})

describe("assembleInputWithAttachments", () => {
  it("loads attachment content and appends it to the base input", async () => {
    const api = {
      readFileContent: vi.fn().mockResolvedValue({
        content: "file body",
        truncated: true,
      }),
      loadRunResult: vi.fn().mockResolvedValue({
        reportContent: "prior run output",
      }),
    }

    const result = await assembleInputWithAttachments(
      "Base prompt",
      [
        { kind: "file", path: "/tmp/file.txt", name: "file.txt" },
        { kind: "run", runId: "run-1", workspace: "/tmp/run-1", workflowName: "Deep Research" },
        { kind: "text", label: "Notes", content: "Plain text note" },
      ],
      "/tmp/project",
      api,
    )

    expect(api.readFileContent).toHaveBeenCalledWith("/tmp/file.txt", "/tmp/project")
    expect(api.loadRunResult).toHaveBeenCalledWith("/tmp/run-1")
    expect(result).toContain("Base prompt")
    expect(result).toContain("## Attached File: file.txt")
    expect(result).toContain("[truncated]")
    expect(result).toContain("## Previous Run Output: Deep Research")
    expect(result).toContain("prior run output")
    expect(result).toContain("## Notes")
    expect(result).toContain("Plain text note")
  })

  it("reports when file attachments cannot be read without a selected project", async () => {
    const api = {
      readFileContent: vi.fn(),
      loadRunResult: vi.fn(),
    }

    const result = await assembleInputWithAttachments(
      "Base prompt",
      [{ kind: "file", path: "/tmp/file.txt", name: "file.txt" }],
      null,
      api,
    )

    expect(api.readFileContent).not.toHaveBeenCalled()
    expect(result).toContain("[Cannot read file: no project selected]")
  })
})
