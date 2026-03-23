import { mkdtemp, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, it } from "vitest"
import type {
  NodeState,
  WorkflowEvent,
  WorkflowInput,
  WorkflowNode,
} from "../schema"
import {
  appendEventLog,
  persistRunState,
  readWorkflowRunSnapshot,
  writeManifest,
  writeRunResultSnapshot,
} from "./run-state-store"

function createNodeState(
  status: NodeState["status"],
  overrides: Partial<NodeState> = {},
): NodeState {
  return {
    status,
    attempts: status === "completed" ? 1 : 0,
    log: [],
    ...overrides,
  }
}

function createRuntimeNode(
  id: string,
  type: WorkflowNode["type"],
): WorkflowNode {
  if (type === "input") {
    return { id, type, position: { x: 0, y: 0 }, config: {} }
  }
  if (type === "output") {
    return { id, type, position: { x: 0, y: 0 }, config: {} }
  }
  if (type === "approval") {
    return {
      id,
      type,
      position: { x: 0, y: 0 },
      config: { show_content: true, allow_edit: false },
    }
  }
  return { id, type, position: { x: 0, y: 0 }, config: { prompt: id } as never }
}

describe("run-state-store", () => {
  it("persists runtime state without transient logs and preserves human tasks", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "run-state-store-"))
    await mkdir(join(workspace, "outputs"), { recursive: true })

    await persistRunState(
      workspace,
      {
        input: createNodeState("completed", {
          log: [{ type: "text", content: "input ok", timestamp: 1 }],
        }),
        review: createNodeState("waiting_approval", {
          log: [{ type: "text", content: "waiting", timestamp: 2 }],
          humanTask: {
            taskId: "approval-1",
            status: "open",
          },
        }),
      },
      {
        version: 1,
        name: "Audit flow",
        nodes: [
          createRuntimeNode("input", "input"),
          createRuntimeNode("review", "approval"),
        ],
        edges: [
          { id: "e1", source: "input", target: "review", type: "default" },
        ],
        runtimeMeta: {},
      },
      { type: "text", value: "Audit this repo" },
    )

    const snapshot = await readWorkflowRunSnapshot(workspace)
    expect(snapshot.state?.nodeStates.input?.log).toEqual([])
    expect(snapshot.state?.nodeStates.review?.log).toEqual([])
    expect(snapshot.state?.humanTasks?.review).toEqual({
      taskId: "approval-1",
      status: "open",
    })
    expect(snapshot.state?.input).toEqual({
      type: "text",
      value: "Audit this repo",
    } satisfies WorkflowInput)
  })

  it("writes manifest, result snapshot, and event log files that can be reloaded together", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "run-state-snapshot-"))

    await writeManifest(workspace, {
      schemaVersion: 1,
      runId: "run-1",
      workflowName: "Audit flow",
      workspace,
      startedAt: 1,
      updatedAt: 2,
      status: "blocked",
      mode: "run",
      blockedByTaskId: "approval-1",
      lastBlockingNodeId: "review",
    })

    await writeRunResultSnapshot(workspace, {
      runId: "run-1",
      status: "blocked",
      workflowName: "Audit flow",
      workflowPath: "/tmp/audit.yaml",
      startedAt: 1,
      completedAt: 2,
      reportPath: "",
      workspace,
      totalCost: 12.5,
      totalTokensIn: 100,
      totalTokensOut: 200,
      evalScores: {},
      durationMs: 1000,
    })

    await appendEventLog(workspace, {
      type: "run-done",
      runId: "run-1",
      status: "blocked",
      workspace,
    } satisfies WorkflowEvent)

    const snapshot = await readWorkflowRunSnapshot(workspace)
    expect(snapshot.manifest?.blockedByTaskId).toBe("approval-1")
    expect(snapshot.result?.status).toBe("blocked")

    const events = await readFile(join(workspace, "events.jsonl"), "utf-8")
    expect(events).toContain('"type":"run-done"')
  })
})
