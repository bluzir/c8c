import type {
  NodeState,
  Workflow,
  WorkflowInput,
  WorkflowNode,
} from "../schema.js"
import type { RuntimeWorkflow } from "./runtime-graph.js"

export interface RunScenarioFixture {
  name:
    | "failed-linear"
    | "failed-fanout"
    | "blocked-approval"
    | "partial-continue"
  workflow: Workflow
  runtimeWorkflow: RuntimeWorkflow
  input: WorkflowInput
  nodeStates: Record<string, NodeState>
  fromNodeId: string
  expectedResumeNodeId: string
}

function state(
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

function inputNode(id: string): WorkflowNode {
  return { id, type: "input", position: { x: 0, y: 0 }, config: {} }
}

function outputNode(id: string): WorkflowNode {
  return { id, type: "output", position: { x: 0, y: 0 }, config: {} }
}

function skillNode(id: string, prompt = id, y = 0): WorkflowNode {
  return { id, type: "skill", position: { x: 100, y }, config: { prompt } }
}

function splitterNode(id: string): WorkflowNode {
  return {
    id,
    type: "splitter",
    position: { x: 100, y: 0 },
    config: { maxBranches: 8 },
  }
}

function approvalNode(id: string): WorkflowNode {
  return {
    id,
    type: "approval",
    position: { x: 100, y: 0 },
    config: {
      message: "Approve changes",
      show_content: true,
      allow_edit: true,
    },
  }
}

export function createFailedLinearScenario(): RunScenarioFixture {
  const workflow: Workflow = {
    version: 1,
    name: "Linear audit",
    nodes: [
      inputNode("input"),
      skillNode("analyze"),
      skillNode("plan"),
      outputNode("report"),
    ],
    edges: [
      { id: "e1", source: "input", target: "analyze", type: "default" },
      { id: "e2", source: "analyze", target: "plan", type: "default" },
      { id: "e3", source: "plan", target: "report", type: "default" },
    ],
  }

  return {
    name: "failed-linear",
    workflow,
    runtimeWorkflow: {
      ...workflow,
      nodes: [...workflow.nodes],
      edges: [...workflow.edges],
      runtimeMeta: {},
    },
    input: { type: "text", value: "Audit this repo" },
    nodeStates: {
      input: state("completed"),
      analyze: state("completed"),
      plan: state("failed", { error: "planner crashed" }),
      report: state("pending"),
    },
    fromNodeId: "plan",
    expectedResumeNodeId: "plan",
  }
}

export function createFailedFanOutScenario(): RunScenarioFixture {
  const workflow: Workflow = {
    version: 1,
    name: "Fan-out audit",
    nodes: [
      inputNode("input"),
      splitterNode("splitter"),
      skillNode("audit"),
      outputNode("merge"),
    ],
    edges: [
      { id: "e1", source: "input", target: "splitter", type: "default" },
      { id: "e2", source: "splitter", target: "audit", type: "default" },
      { id: "e3", source: "audit", target: "merge", type: "default" },
    ],
  }

  return {
    name: "failed-fanout",
    workflow,
    runtimeWorkflow: {
      ...workflow,
      nodes: [
        ...workflow.nodes,
        skillNode("audit::security", "security", 80),
        skillNode("audit::quality", "quality", 120),
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
          subtaskKey: "security",
          branchIndex: 0,
          totalBranches: 2,
          templateId: "audit",
          splitterId: "splitter",
        },
        "audit::quality": {
          subtaskKey: "quality",
          branchIndex: 1,
          totalBranches: 2,
          templateId: "audit",
          splitterId: "splitter",
        },
      },
    },
    input: { type: "text", value: "Audit this repo" },
    nodeStates: {
      input: state("completed"),
      splitter: state("completed"),
      audit: state("pending"),
      merge: state("pending"),
      "audit::security": state("completed"),
      "audit::quality": state("failed", { error: "quality failed" }),
    },
    fromNodeId: "audit::quality",
    expectedResumeNodeId: "audit::quality",
  }
}

export function createBlockedApprovalScenario(): RunScenarioFixture {
  const workflow: Workflow = {
    version: 1,
    name: "Approval flow",
    nodes: [
      inputNode("input"),
      skillNode("draft"),
      approvalNode("approve"),
      outputNode("publish"),
    ],
    edges: [
      { id: "e1", source: "input", target: "draft", type: "default" },
      { id: "e2", source: "draft", target: "approve", type: "default" },
      { id: "e3", source: "approve", target: "publish", type: "default" },
    ],
  }

  return {
    name: "blocked-approval",
    workflow,
    runtimeWorkflow: {
      ...workflow,
      nodes: [...workflow.nodes],
      edges: [...workflow.edges],
      runtimeMeta: {},
    },
    input: { type: "text", value: "Prepare change list" },
    nodeStates: {
      input: state("completed"),
      draft: state("completed"),
      approve: state("waiting_approval", {
        humanTask: {
          taskId: "approval-approve",
          status: "open",
        },
      }),
      publish: state("pending"),
    },
    fromNodeId: "approve",
    expectedResumeNodeId: "approve",
  }
}

export function createPartialContinueScenario(): RunScenarioFixture {
  const workflow: Workflow = {
    version: 1,
    name: "Partial continue flow",
    nodes: [
      inputNode("input"),
      skillNode("audit"),
      skillNode("review"),
      outputNode("report"),
    ],
    edges: [
      { id: "e1", source: "input", target: "audit", type: "default" },
      { id: "e2", source: "audit", target: "review", type: "default" },
      { id: "e3", source: "review", target: "report", type: "default" },
    ],
  }

  return {
    name: "partial-continue",
    workflow,
    runtimeWorkflow: {
      ...workflow,
      nodes: [...workflow.nodes],
      edges: [...workflow.edges],
      runtimeMeta: {},
    },
    input: { type: "text", value: "Continue this run" },
    nodeStates: {
      input: state("completed"),
      audit: state("completed"),
      review: state("completed"),
      report: state("queued"),
    },
    fromNodeId: "report",
    expectedResumeNodeId: "report",
  }
}

export function createRunScenarioFixtures(): RunScenarioFixture[] {
  return [
    createFailedLinearScenario(),
    createFailedFanOutScenario(),
    createBlockedApprovalScenario(),
    createPartialContinueScenario(),
  ]
}
