import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { NodeState, Workflow } from "../schema"
import {
  createResumeExecutionSession,
  createRerunExecutionSession,
  createStartExecutionSession,
} from "./run-session"
import { persistRunState } from "./run-state-store"

function state(status: NodeState["status"]): NodeState {
  return { status, attempts: status === "completed" ? 1 : 0, log: [] }
}

function createWorkflow(): Workflow {
  return {
    version: 1,
    name: "Audit flow",
    nodes: [
      { id: "input", type: "input", position: { x: 0, y: 0 }, config: {} },
      {
        id: "splitter",
        type: "splitter",
        position: { x: 100, y: 0 },
        config: { strategy: "auto", maxBranches: 8 },
      },
      {
        id: "audit",
        type: "skill",
        position: { x: 200, y: 0 },
        config: { prompt: "audit" },
      },
      {
        id: "merge",
        type: "merger",
        position: { x: 300, y: 0 },
        config: { strategy: "summarize" },
      },
    ],
    edges: [
      { id: "e1", source: "input", target: "splitter", type: "default" },
      { id: "e2", source: "splitter", target: "audit", type: "default" },
      { id: "e3", source: "audit", target: "merge", type: "default" },
    ],
  }
}

describe("run-session", () => {
  it("creates a fresh start session with isolated runtime state", () => {
    const workflow = createWorkflow()

    const session = createStartExecutionSession({
      runId: "run-1",
      workflow,
      input: { type: "text", value: "Audit this repo" },
      workspace: "/tmp/workspace-1",
    })

    expect(session.mode).toBe("run")
    expect(session.chainId).toBe("/tmp/workspace-1")
    expect(session.persistedInput).toEqual({
      type: "text",
      value: "Audit this repo",
    })
    expect(session.runtimeWorkflow.nodes).not.toBe(workflow.nodes)
    expect(session.runtimeWorkflow.edges).not.toBe(workflow.edges)
    expect(session.nodeStates.input.status).toBe("pending")
    expect(session.evalResults).toEqual({})
    expect(session.activatedEdges.size).toBe(0)
  })

  it("creates a continue session from the first resumable node", async () => {
    const workflow = createWorkflow()
    const workspace = await mkdtemp(join(tmpdir(), "run-session-"))
    await persistRunState(
      workspace,
      {
        input: state("completed"),
        splitter: state("completed"),
        audit: state("waiting_human"),
        merge: state("pending"),
      },
      {
        ...workflow,
        nodes: [...workflow.nodes],
        edges: [...workflow.edges],
        runtimeMeta: {},
      },
      { type: "text", value: "Resume this flow" },
      {
        audit: [
          {
            attempt: 1,
            score: 0.4,
            reason: "Need stronger draft",
            passed: false,
          },
        ],
      },
    )

    const session = await createResumeExecutionSession({
      runId: "continue-1",
      workflow,
      workspace,
      chainId: "thread-1",
    })

    expect(session.mode).toBe("rerun")
    expect(session.runId).toBe("continue-1")
    expect(session.chainId).toBe("thread-1")
    expect(session.persistedInput).toEqual({
      type: "text",
      value: "Resume this flow",
    })
    expect(session.evalResults).toEqual({
      audit: [
        {
          attempt: 1,
          score: 0.4,
          reason: "Need stronger draft",
          passed: false,
        },
      ],
    })
    expect(session.nodeStates.input.status).toBe("completed")
    expect(session.nodeStates.audit.status).toBe("pending")
    expect(session.nodeStates.merge.status).toBe("pending")
  })

  it("creates a rerun session that keeps completed fan-out siblings", async () => {
    const workflow = createWorkflow()
    const workspace = await mkdtemp(join(tmpdir(), "run-session-"))
    await persistRunState(
      workspace,
      {
        input: state("completed"),
        splitter: state("completed"),
        audit: state("pending"),
        merge: state("pending"),
        "audit::security": state("completed"),
        "audit::quality": {
          status: "failed",
          attempts: 1,
          log: [],
          error: "quality failed",
        },
      },
      {
        ...workflow,
        nodes: [
          ...workflow.nodes,
          {
            id: "audit::security",
            type: "skill",
            position: { x: 200, y: 80 },
            config: { prompt: "security" },
          },
          {
            id: "audit::quality",
            type: "skill",
            position: { x: 200, y: 120 },
            config: { prompt: "quality" },
          },
        ],
        edges: [
          ...workflow.edges,
          {
            id: "b1",
            source: "splitter",
            target: "audit::security",
            type: "default",
          },
          {
            id: "b2",
            source: "splitter",
            target: "audit::quality",
            type: "default",
          },
          {
            id: "b3",
            source: "audit::security",
            target: "merge",
            type: "default",
          },
          {
            id: "b4",
            source: "audit::quality",
            target: "merge",
            type: "default",
          },
        ],
        runtimeMeta: {
          "audit::security": {
            subtaskContent: "",
            subtaskKey: "security",
            branchIndex: 0,
            totalBranches: 2,
            templateId: "audit",
            splitterId: "splitter",
          },
          "audit::quality": {
            subtaskContent: "",
            subtaskKey: "quality",
            branchIndex: 1,
            totalBranches: 2,
            templateId: "audit",
            splitterId: "splitter",
          },
        },
      },
      { type: "text", value: "Audit this repo" },
      {
        merge: [
          {
            attempt: 1,
            score: 0.9,
            reason: "Strong summary",
            passed: true,
          },
        ],
      },
    )

    const session = await createRerunExecutionSession({
      runId: "rerun-1",
      workflow,
      workspace,
      fromNodeId: "audit::quality",
    })

    expect(session.mode).toBe("rerun")
    expect(session.evalResults).toEqual({
      merge: [
        {
          attempt: 1,
          score: 0.9,
          reason: "Strong summary",
          passed: true,
        },
      ],
    })
    expect(session.nodeStates["audit::security"].status).toBe("completed")
    expect(session.nodeStates["audit::quality"].status).toBe("pending")
    expect(session.nodeStates.merge.status).toBe("pending")
    expect(session.runtimeWorkflow.nodes.map((node) => node.id)).toContain(
      "audit::security",
    )
  })
})
