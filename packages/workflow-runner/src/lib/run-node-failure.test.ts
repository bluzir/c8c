import { mkdtemp, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import type { NodeState, WorkflowEvent, WorkflowNode } from "../schema"
import type { RuntimeWorkflow } from "./runtime-graph"
import {
  computeRetryDelayMs,
  handleNodeExecutionFailure,
  type ResolvedRuntimePolicy,
} from "./run-node-failure"

function createNode(
  id: string,
  type: WorkflowNode["type"] = "skill",
): WorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    config: type === "skill" ? { skillRef: `dev/${id}`, prompt: "" } : {},
  } as WorkflowNode
}

function createWorkflow(node: WorkflowNode): RuntimeWorkflow {
  const output = createNode("output", "output")
  return {
    version: 1,
    name: "Test flow",
    nodes: [node, output],
    edges: [{ id: "e1", source: node.id, target: output.id, type: "default" }],
    runtimeMeta: {},
  }
}

function state(status: NodeState["status"]): NodeState {
  return {
    status,
    attempts: 1,
    retriesUsed: 0,
    log: [],
  }
}

function runtimePolicy(
  overrides: Partial<ResolvedRuntimePolicy> = {},
): ResolvedRuntimePolicy {
  return {
    onError: "stop",
    retry: {
      enabled: false,
      maxTries: 1,
      waitMs: 0,
      backoff: "none",
      retryOn: new Set([
        "tool",
        "model",
        "timeout",
        "unknown",
        "policy",
        "network",
      ]),
    },
    ...overrides,
  }
}

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "run-node-failure-"))
  await mkdir(join(workspace, "outputs"), { recursive: true })
  return workspace
}

describe("run-node-failure", () => {
  it("computes exponential retry delay", () => {
    expect(
      computeRetryDelayMs(
        {
          enabled: true,
          maxTries: 3,
          waitMs: 50,
          backoff: "exponential",
          retryOn: new Set(["tool"]),
        },
        2,
      ),
    ).toBe(100)
  })

  it("caps exponential backoff at 30 seconds", () => {
    const delay = computeRetryDelayMs(
      {
        enabled: true,
        maxTries: 15,
        waitMs: 1000,
        backoff: "exponential",
        retryOn: new Set([]),
      },
      10,
    )
    expect(delay).toBe(30_000)
  })

  it("caps linear backoff at 30 seconds", () => {
    const delay = computeRetryDelayMs(
      {
        enabled: true,
        maxTries: 50,
        waitMs: 1000,
        backoff: "linear",
        retryOn: new Set([]),
      },
      40,
    )
    expect(delay).toBe(30_000)
  })

  it("requeues retryable failures instead of stopping", async () => {
    const workspace = await createWorkspace()
    const node = createNode("audit")
    const workflow = createWorkflow(node)
    const nodeState = state("running")
    const retryNode = vi.fn(async () => undefined)
    const emitEvent = vi.fn(async (_event: WorkflowEvent) => undefined)

    await handleNodeExecutionFailure({
      runId: "run-1",
      node,
      state: nodeState,
      incomingContent: "input",
      runtimePolicy: runtimePolicy({
        retry: {
          enabled: true,
          maxTries: 3,
          waitMs: 5,
          backoff: "none",
          retryOn: new Set(["unknown"]),
        },
      }),
      runtimeWorkflow: workflow,
      activatedEdges: new Set(),
      error: new Error("tool crashed"),
      logger: { warn: vi.fn() },
      emitEvent,
      retryNode,
      sleep: async () => undefined,
      workspace,
    })

    expect(nodeState.status).toBe("pending")
    expect(nodeState.retriesUsed).toBe(1)
    expect(nodeState.error).toBeUndefined()
    expect(retryNode).toHaveBeenCalledWith("audit")
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "node-log", nodeId: "audit" }),
    )
  })

  it("applies automatic backoff to rate-limit policy errors even without node retry config", async () => {
    const workspace = await createWorkspace()
    const node = createNode("audit")
    const workflow = createWorkflow(node)
    const nodeState = state("running")
    const retryNode = vi.fn(async () => undefined)
    const emitEvent = vi.fn(async (_event: WorkflowEvent) => undefined)

    await handleNodeExecutionFailure({
      runId: "run-429",
      node,
      state: nodeState,
      incomingContent: "input",
      runtimePolicy: runtimePolicy(),
      runtimeWorkflow: workflow,
      activatedEdges: new Set(),
      error: new Error("429 Too Many Requests"),
      logger: { warn: vi.fn() },
      emitEvent,
      retryNode,
      sleep: async () => undefined,
      workspace,
    })

    expect(nodeState.status).toBe("pending")
    expect(nodeState.retriesUsed).toBe(1)
    expect(retryNode).toHaveBeenCalledWith("audit")
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "node-log",
        nodeId: "audit",
        entry: expect.objectContaining({
          content: expect.stringContaining("automatic rate-limit backoff"),
        }),
      }),
    )
  })

  it("applies automatic retry to network errors even without node retry config", async () => {
    const workspace = await createWorkspace()
    const node = createNode("audit")
    const workflow = createWorkflow(node)
    const nodeState = state("running")
    const retryNode = vi.fn(async () => undefined)
    const emitEvent = vi.fn(async (_event: WorkflowEvent) => undefined)

    await handleNodeExecutionFailure({
      runId: "run-net",
      node,
      state: nodeState,
      incomingContent: "input",
      runtimePolicy: runtimePolicy(),
      runtimeWorkflow: workflow,
      activatedEdges: new Set(),
      error: new Error("ECONNRESET: connection reset by peer"),
      logger: { warn: vi.fn() },
      emitEvent,
      retryNode,
      sleep: async () => undefined,
      workspace,
    })

    expect(nodeState.status).toBe("pending")
    expect(nodeState.retriesUsed).toBe(1)
    expect(retryNode).toHaveBeenCalledWith("audit")
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "node-log",
        nodeId: "audit",
        entry: expect.objectContaining({
          content: expect.stringContaining("automatic network retry"),
        }),
      }),
    )
  })

  it("continues with a partial output when policy is continue", async () => {
    const workspace = await createWorkspace()
    const node = createNode("audit")
    const workflow = createWorkflow(node)
    const nodeState = state("running")
    const emitEvent = vi.fn(async (_event: WorkflowEvent) => undefined)

    await handleNodeExecutionFailure({
      runId: "run-2",
      node,
      state: nodeState,
      incomingContent: "original input",
      runtimePolicy: runtimePolicy({ onError: "continue" }),
      runtimeWorkflow: workflow,
      activatedEdges: new Set(),
      error: new Error("model failed"),
      recoverOutputOnError: async () => ({
        content: "partial result",
        metadata: { source: "audit", output_source: "stdout" },
      }),
      logger: { warn: vi.fn() },
      emitEvent,
      retryNode: vi.fn(async () => undefined),
      workspace,
    })

    expect(nodeState.status).toBe("completed")
    expect(nodeState.policyApplied).toBe("continue")
    expect(nodeState.output?.content).toBe("partial result")
    expect(nodeState.output?.metadata.partial_on_error).toBe(true)
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "node-error", nodeId: "audit" }),
    )
  })

  it("keeps failed state and partial artifact when policy is stop", async () => {
    const workspace = await createWorkspace()
    const node = createNode("audit")
    const workflow = createWorkflow(node)
    const nodeState = state("running")
    const emitEvent = vi.fn(async (_event: WorkflowEvent) => undefined)

    await handleNodeExecutionFailure({
      runId: "run-3",
      node,
      state: nodeState,
      incomingContent: "original input",
      runtimePolicy: runtimePolicy({ onError: "stop" }),
      runtimeWorkflow: workflow,
      activatedEdges: new Set(),
      error: new Error("bad merge"),
      recoverOutputOnError: async () => ({
        content: "partial result",
        metadata: { source: "audit", output_source: "stdout" },
      }),
      logger: { warn: vi.fn() },
      emitEvent,
      retryNode: vi.fn(async () => undefined),
      workspace,
    })

    expect(nodeState.status).toBe("failed")
    expect(nodeState.output?.content).toBe("partial result")
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "node-done", nodeId: "audit" }),
    )
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "node-error", nodeId: "audit" }),
    )
  })

  it("routes to on_error edges instead of applying error policy", async () => {
    const workspace = await createWorkspace()
    const node = createNode("audit")
    const fallbackNode = createNode("fallback", "skill")
    const workflow: RuntimeWorkflow = {
      version: 1,
      name: "Test flow",
      nodes: [node, fallbackNode],
      edges: [
        { id: "e-err", source: node.id, target: fallbackNode.id, type: "on_error" },
      ],
      runtimeMeta: {},
    }
    const nodeState = state("running")
    const activatedEdges = new Set<string>()
    const emitEvent = vi.fn(async (_event: WorkflowEvent) => undefined)

    await handleNodeExecutionFailure({
      runId: "run-outcome",
      node,
      state: nodeState,
      incomingContent: "input",
      runtimePolicy: runtimePolicy({ onError: "stop" }),
      runtimeWorkflow: workflow,
      activatedEdges,
      error: new Error("model failed"),
      logger: { warn: vi.fn() },
      emitEvent,
      retryNode: vi.fn(async () => undefined),
      workspace,
    })

    expect(nodeState.status).toBe("completed")
    expect(nodeState.policyApplied).toBe("continue")
    expect(activatedEdges).toEqual(new Set(["e-err"]))
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "node-done", nodeId: "audit" }),
    )
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "node-log",
        entry: expect.objectContaining({
          content: expect.stringContaining("on_error"),
        }),
      }),
    )
  })

  it("prefers on_timeout edges over on_error for timeout failures", async () => {
    const workspace = await createWorkspace()
    const node = createNode("audit")
    const timeoutNode = createNode("escalate", "skill")
    const errorNode = createNode("fallback", "skill")
    const workflow: RuntimeWorkflow = {
      version: 1,
      name: "Test flow",
      nodes: [node, timeoutNode, errorNode],
      edges: [
        { id: "e-timeout", source: node.id, target: timeoutNode.id, type: "on_timeout" },
        { id: "e-err", source: node.id, target: errorNode.id, type: "on_error" },
      ],
      runtimeMeta: {},
    }
    const nodeState = state("running")
    const activatedEdges = new Set<string>()
    const emitEvent = vi.fn(async (_event: WorkflowEvent) => undefined)

    await handleNodeExecutionFailure({
      runId: "run-timeout",
      node,
      state: nodeState,
      incomingContent: "input",
      runtimePolicy: runtimePolicy(),
      runtimeWorkflow: workflow,
      activatedEdges,
      error: new Error("operation timed out"),
      logger: { warn: vi.fn() },
      emitEvent,
      retryNode: vi.fn(async () => undefined),
      workspace,
    })

    expect(nodeState.status).toBe("completed")
    expect(activatedEdges).toEqual(new Set(["e-timeout"]))
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "node-log",
        entry: expect.objectContaining({
          content: expect.stringContaining("on_timeout"),
        }),
      }),
    )
  })

  it("falls back to on_error when timeout fails but no on_timeout edge exists", async () => {
    const workspace = await createWorkspace()
    const node = createNode("audit")
    const fallbackNode = createNode("fallback", "skill")
    const workflow: RuntimeWorkflow = {
      version: 1,
      name: "Test flow",
      nodes: [node, fallbackNode],
      edges: [
        { id: "e-err", source: node.id, target: fallbackNode.id, type: "on_error" },
      ],
      runtimeMeta: {},
    }
    const nodeState = state("running")
    const activatedEdges = new Set<string>()
    const emitEvent = vi.fn(async (_event: WorkflowEvent) => undefined)

    await handleNodeExecutionFailure({
      runId: "run-timeout-fallback",
      node,
      state: nodeState,
      incomingContent: "input",
      runtimePolicy: runtimePolicy(),
      runtimeWorkflow: workflow,
      activatedEdges,
      error: new Error("operation timed out"),
      logger: { warn: vi.fn() },
      emitEvent,
      retryNode: vi.fn(async () => undefined),
      workspace,
    })

    expect(nodeState.status).toBe("completed")
    expect(activatedEdges).toEqual(new Set(["e-err"]))
  })

  it("falls through to error policy when no outcome edges exist", async () => {
    const workspace = await createWorkspace()
    const node = createNode("audit")
    const workflow = createWorkflow(node)
    const nodeState = state("running")
    const emitEvent = vi.fn(async (_event: WorkflowEvent) => undefined)

    await handleNodeExecutionFailure({
      runId: "run-no-outcome",
      node,
      state: nodeState,
      incomingContent: "input",
      runtimePolicy: runtimePolicy({ onError: "stop" }),
      runtimeWorkflow: workflow,
      activatedEdges: new Set(),
      error: new Error("model failed"),
      logger: { warn: vi.fn() },
      emitEvent,
      retryNode: vi.fn(async () => undefined),
      workspace,
    })

    expect(nodeState.status).toBe("failed")
    expect(nodeState.policyApplied).toBe("stop")
  })

  it("recovers max-turns skill failures when partial progress exists", async () => {
    const workspace = await createWorkspace()
    const node = createNode("audit")
    const workflow = createWorkflow(node)
    const nodeState = state("running")
    nodeState.log.push({
      type: "tool_result",
      tool: "Write",
      status: "success",
      output: "created file",
      timestamp: Date.now(),
    })
    const emitEvent = vi.fn(async (_event: WorkflowEvent) => undefined)
    const activatedEdges = new Set<string>()

    await handleNodeExecutionFailure({
      runId: "run-4",
      node,
      state: nodeState,
      incomingContent: "original input",
      runtimePolicy: runtimePolicy({ onError: "stop" }),
      runtimeWorkflow: workflow,
      activatedEdges,
      error: new Error("error_max_turns"),
      recoverOutputOnError: async () => ({
        content: "recovered result",
        metadata: { source: "audit", output_source: "stdout" },
      }),
      logger: { warn: vi.fn() },
      emitEvent,
      retryNode: vi.fn(async () => undefined),
      workspace,
    })

    expect(nodeState.status).toBe("completed")
    expect(nodeState.policyApplied).toBe("continue")
    expect(nodeState.output?.content).toBe("recovered result")
    expect(activatedEdges).toEqual(new Set(["e1"]))
  })
})
