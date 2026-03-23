import { describe, it, expect } from "vitest"
import {
  getIncomingEdges,
  getOutgoingEdges,
  getDownstreamNodeIds,
  findReadyNodes,
  findNodeById,
  validateWorkflow,
  createInitialNodeStates,
  isRunComplete,
} from "./graph-engine"
import type { Workflow, NodeState } from "@shared/types"

// Minimal linear workflow: input → skill → output
const LINEAR: Workflow = {
  version: 1,
  name: "Linear",
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
    {
      id: "skill-1",
      type: "skill",
      position: { x: 300, y: 0 },
      config: { skillRef: "test/skill", prompt: "Do it" },
    },
    { id: "output-1", type: "output", position: { x: 600, y: 0 }, config: {} },
  ],
  edges: [
    { id: "e1", source: "input-1", target: "skill-1", type: "default" },
    { id: "e2", source: "skill-1", target: "output-1", type: "default" },
  ],
}

// Workflow with evaluator loop
const LOOP: Workflow = {
  version: 1,
  name: "Loop",
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
    {
      id: "skill-1",
      type: "skill",
      position: { x: 300, y: 0 },
      config: { skillRef: "test/writer", prompt: "Write" },
    },
    {
      id: "eval-1",
      type: "evaluator",
      position: { x: 600, y: 0 },
      config: {
        criteria: "Score clarity 1-10",
        threshold: 8,
        maxRetries: 3,
        retryFrom: "skill-1",
      },
    },
    { id: "output-1", type: "output", position: { x: 900, y: 0 }, config: {} },
  ],
  edges: [
    { id: "e1", source: "input-1", target: "skill-1", type: "default" },
    { id: "e2", source: "skill-1", target: "eval-1", type: "default" },
    { id: "e3", source: "eval-1", target: "output-1", type: "pass" },
    { id: "e4", source: "eval-1", target: "skill-1", type: "fail" },
  ],
}

describe("graph helpers", () => {
  it("getIncomingEdges returns edges targeting a node", () => {
    const edges = getIncomingEdges(LINEAR, "skill-1")
    expect(edges).toHaveLength(1)
    expect(edges[0].source).toBe("input-1")
  })

  it("getOutgoingEdges returns edges from a node", () => {
    const edges = getOutgoingEdges(LINEAR, "skill-1")
    expect(edges).toHaveLength(1)
    expect(edges[0].target).toBe("output-1")
  })

  it("getOutgoingEdges for evaluator returns pass + fail", () => {
    const edges = getOutgoingEdges(LOOP, "eval-1")
    expect(edges).toHaveLength(2)
  })

  it("findNodeById returns the node", () => {
    const node = findNodeById(LINEAR, "skill-1")
    expect(node).toBeDefined()
    expect(node!.type).toBe("skill")
  })

  it("findNodeById returns undefined for missing", () => {
    expect(findNodeById(LINEAR, "nope")).toBeUndefined()
  })
})

describe("findReadyNodes", () => {
  it("input node is ready when no nodeStates exist", () => {
    const ready = findReadyNodes(LINEAR, {})
    expect(ready.map((n) => n.id)).toEqual(["input-1"])
  })

  it("skill node is ready when input is completed", () => {
    const ready = findReadyNodes(LINEAR, {
      "input-1": {
        status: "completed",
        attempts: 0,
        log: [],
        output: { content: "test", metadata: { source: "input-1" } },
      },
    })
    expect(ready.map((n) => n.id)).toEqual(["skill-1"])
  })

  it("output node is ready when skill is completed", () => {
    const ready = findReadyNodes(LINEAR, {
      "input-1": { status: "completed", attempts: 0, log: [] },
      "skill-1": { status: "completed", attempts: 0, log: [] },
    })
    expect(ready.map((n) => n.id)).toEqual(["output-1"])
  })

  it("no nodes ready when all completed", () => {
    const ready = findReadyNodes(LINEAR, {
      "input-1": { status: "completed", attempts: 0, log: [] },
      "skill-1": { status: "completed", attempts: 0, log: [] },
      "output-1": { status: "completed", attempts: 0, log: [] },
    })
    expect(ready).toEqual([])
  })

  it("running nodes are not ready", () => {
    const ready = findReadyNodes(LINEAR, {
      "input-1": { status: "completed", attempts: 0, log: [] },
      "skill-1": { status: "running", attempts: 0, log: [] },
    })
    expect(ready).toEqual([])
  })

  it("queued nodes are not ready", () => {
    const ready = findReadyNodes(LINEAR, {
      "input-1": { status: "completed", attempts: 0, log: [] },
      "skill-1": { status: "queued", attempts: 0, log: [] },
    })
    expect(ready).toEqual([])
  })
})

describe("createInitialNodeStates", () => {
  it("creates pending state for all nodes", () => {
    const states = createInitialNodeStates(LINEAR)
    expect(Object.keys(states)).toHaveLength(3)
    expect(states["input-1"].status).toBe("pending")
    expect(states["skill-1"].status).toBe("pending")
    expect(states["output-1"].status).toBe("pending")
    expect(states["input-1"].attempts).toBe(0)
    expect(states["input-1"].log).toEqual([])
  })
})

describe("isRunComplete", () => {
  it("returns true when all nodes completed", () => {
    expect(
      isRunComplete({
        "input-1": { status: "completed", attempts: 0, log: [] },
        "skill-1": { status: "completed", attempts: 0, log: [] },
        "output-1": { status: "completed", attempts: 0, log: [] },
      }),
    ).toBe(true)
  })

  it("returns false when some nodes still running", () => {
    expect(
      isRunComplete({
        "input-1": { status: "completed", attempts: 0, log: [] },
        "skill-1": { status: "running", attempts: 0, log: [] },
      }),
    ).toBe(false)
  })

  it("returns true when mix of completed and failed", () => {
    expect(
      isRunComplete({
        "input-1": { status: "completed", attempts: 0, log: [] },
        "skill-1": { status: "failed", attempts: 1, log: [] },
      }),
    ).toBe(true)
  })
})

describe("findReadyNodes with activatedEdges", () => {
  it("input node is ready with empty activatedEdges (no incoming edges)", () => {
    const states = createInitialNodeStates(LINEAR)
    const activated = new Set<string>()
    const ready = findReadyNodes(LINEAR, states, activated)
    expect(ready.map((n) => n.id)).toEqual(["input-1"])
  })

  it("skill node is ready when its incoming edge is activated", () => {
    const states = createInitialNodeStates(LINEAR)
    states["input-1"].status = "completed"
    const activated = new Set(["e1"])
    const ready = findReadyNodes(LINEAR, states, activated)
    expect(ready.map((n) => n.id)).toEqual(["skill-1"])
  })

  it("skill node is NOT ready when incoming edge is not activated", () => {
    const states = createInitialNodeStates(LINEAR)
    states["input-1"].status = "completed"
    const activated = new Set<string>() // e1 not activated
    const ready = findReadyNodes(LINEAR, states, activated)
    expect(ready).toEqual([])
  })

  it("evaluator loop: output not ready when only fail edge activated", () => {
    const states = createInitialNodeStates(LOOP)
    states["input-1"].status = "completed"
    states["skill-1"].status = "completed"
    states["eval-1"].status = "completed"
    const activated = new Set(["e1", "e2", "e4"])
    states["skill-1"].status = "pending"
    states["eval-1"].status = "pending"
    const ready = findReadyNodes(LOOP, states, activated)
    expect(ready.map((n) => n.id)).toEqual(["skill-1"])
  })

  it("evaluator loop: output ready when pass edge activated", () => {
    const states = createInitialNodeStates(LOOP)
    states["input-1"].status = "completed"
    states["skill-1"].status = "completed"
    states["eval-1"].status = "completed"
    const activated = new Set(["e1", "e2", "e3"])
    const ready = findReadyNodes(LOOP, states, activated)
    expect(ready.map((n) => n.id)).toEqual(["output-1"])
  })

  it("without activatedEdges, falls back to source-completed check", () => {
    const states = createInitialNodeStates(LINEAR)
    states["input-1"].status = "completed"
    const ready = findReadyNodes(LINEAR, states)
    expect(ready.map((n) => n.id)).toEqual(["skill-1"])
  })
})

describe("validateWorkflow", () => {
  it("valid linear workflow passes", () => {
    const errors = validateWorkflow(LINEAR)
    expect(errors).toEqual([])
  })

  it("detects missing input node", () => {
    const broken: Workflow = {
      ...LINEAR,
      nodes: LINEAR.nodes.filter((n) => n.type !== "input"),
    }
    const errors = validateWorkflow(broken)
    expect(errors.some((e) => e.includes("input"))).toBe(true)
  })

  it("detects missing output node", () => {
    const broken: Workflow = {
      ...LINEAR,
      nodes: LINEAR.nodes.filter((n) => n.type !== "output"),
    }
    const errors = validateWorkflow(broken)
    expect(errors.some((e) => e.includes("output"))).toBe(true)
  })

  it("detects edge referencing nonexistent node", () => {
    const broken: Workflow = {
      ...LINEAR,
      edges: [
        ...LINEAR.edges,
        {
          id: "bad",
          source: "skill-1",
          target: "ghost",
          type: "default" as const,
        },
      ],
    }
    const errors = validateWorkflow(broken)
    expect(errors.some((e) => e.includes("ghost"))).toBe(true)
  })

  it("detects cycle in workflow", () => {
    const cyclic: Workflow = {
      version: 1,
      name: "Cyclic",
      nodes: [
        { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
        {
          id: "skill-1",
          type: "skill",
          position: { x: 300, y: 0 },
          config: { skillRef: "a", prompt: "a" },
        },
        {
          id: "skill-2",
          type: "skill",
          position: { x: 600, y: 0 },
          config: { skillRef: "b", prompt: "b" },
        },
        {
          id: "output-1",
          type: "output",
          position: { x: 900, y: 0 },
          config: {},
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "skill-1", type: "default" },
        { id: "e2", source: "skill-1", target: "skill-2", type: "default" },
        { id: "e3", source: "skill-2", target: "skill-1", type: "default" }, // cycle!
        { id: "e4", source: "skill-2", target: "output-1", type: "default" },
      ],
    }
    const errors = validateWorkflow(cyclic)
    expect(errors.some((e) => e.includes("cycle"))).toBe(true)
  })

  it("allows evaluator fail edges (retry loops are not cycles)", () => {
    const errors = validateWorkflow(LOOP)
    expect(errors).toEqual([])
  })

  it("allows prompt-only skill node with empty skillRef", () => {
    const broken: Workflow = {
      ...LINEAR,
      nodes: [
        LINEAR.nodes[0],
        {
          id: "skill-1",
          type: "skill",
          position: { x: 300, y: 0 },
          config: { skillRef: "", prompt: "Do it" },
        },
        LINEAR.nodes[2],
      ],
    }
    const errors = validateWorkflow(broken)
    expect(errors.some((e) => e.includes("skillRef"))).toBe(false)
  })

  it("allows prompt-only skill node with whitespace-only skillRef", () => {
    const broken: Workflow = {
      ...LINEAR,
      nodes: [
        LINEAR.nodes[0],
        {
          id: "skill-1",
          type: "skill",
          position: { x: 300, y: 0 },
          config: { skillRef: "  ", prompt: "Do it" },
        },
        LINEAR.nodes[2],
      ],
    }
    const errors = validateWorkflow(broken)
    expect(errors.some((e) => e.includes("skillRef"))).toBe(false)
  })

  it("detects skill node when both skillRef and prompt are missing", () => {
    const broken: Workflow = {
      ...LINEAR,
      nodes: [
        LINEAR.nodes[0],
        {
          id: "skill-1",
          type: "skill",
          position: { x: 300, y: 0 },
          config: { skillRef: "  ", prompt: " " },
        },
        LINEAR.nodes[2],
      ],
    }
    const errors = validateWorkflow(broken)
    expect(
      errors.some((e) =>
        e.includes("Add a prompt or select a skill reference."),
      ),
    ).toBe(true)
  })

  it("detects unsupported evaluator config fields", () => {
    const broken: Workflow = {
      ...LOOP,
      nodes: LOOP.nodes.map((node) =>
        node.id === "eval-1"
          ? {
              ...node,
              config: {
                ...node.config,
                skillRef: "quality/code-review",
              } as any,
            }
          : node,
      ),
    }
    const errors = validateWorkflow(broken)
    expect(
      errors.some(
        (e) => e.includes("Unsupported config field") && e.includes("skillRef"),
      ),
    ).toBe(true)
  })
})

// Fan-out workflow: input → splitter → [skill-a, skill-b, skill-c] → merger → output
const FAN_OUT: Workflow = {
  version: 1,
  name: "Fan-out",
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
    {
      id: "splitter-1",
      type: "splitter",
      position: { x: 300, y: 0 },
      config: { strategy: "split", maxBranches: 4 },
    },
    {
      id: "skill-a",
      type: "skill",
      position: { x: 600, y: 0 },
      config: { skillRef: "a", prompt: "a" },
    },
    {
      id: "skill-b",
      type: "skill",
      position: { x: 600, y: 100 },
      config: { skillRef: "b", prompt: "b" },
    },
    {
      id: "skill-c",
      type: "skill",
      position: { x: 600, y: 200 },
      config: { skillRef: "c", prompt: "c" },
    },
    {
      id: "merger-1",
      type: "merger",
      position: { x: 900, y: 0 },
      config: { strategy: "concatenate" },
    },
    { id: "output-1", type: "output", position: { x: 1200, y: 0 }, config: {} },
  ],
  edges: [
    { id: "e1", source: "input-1", target: "splitter-1", type: "default" },
    { id: "e2a", source: "splitter-1", target: "skill-a", type: "default" },
    { id: "e2b", source: "splitter-1", target: "skill-b", type: "default" },
    { id: "e2c", source: "splitter-1", target: "skill-c", type: "default" },
    { id: "e3a", source: "skill-a", target: "merger-1", type: "default" },
    { id: "e3b", source: "skill-b", target: "merger-1", type: "default" },
    { id: "e3c", source: "skill-c", target: "merger-1", type: "default" },
    { id: "e4", source: "merger-1", target: "output-1", type: "default" },
  ],
}

describe("findReadyNodes with fan-out", () => {
  it("all fan-out skills are ready after splitter completes", () => {
    const states: Record<string, NodeState> = {
      "input-1": { status: "completed", attempts: 1, log: [] },
      "splitter-1": { status: "completed", attempts: 1, log: [] },
    }

    const ready = findReadyNodes(FAN_OUT, states)
    const readyIds = ready.map((n) => n.id).sort()
    expect(readyIds).toEqual(["skill-a", "skill-b", "skill-c"])
  })

  it("merger is NOT ready when only some branches completed", () => {
    const states: Record<string, NodeState> = {
      "input-1": { status: "completed", attempts: 1, log: [] },
      "splitter-1": { status: "completed", attempts: 1, log: [] },
      "skill-a": { status: "completed", attempts: 1, log: [] },
      "skill-b": { status: "completed", attempts: 1, log: [] },
      "skill-c": { status: "running", attempts: 1, log: [] },
    }

    const ready = findReadyNodes(FAN_OUT, states)
    expect(ready.map((n) => n.id)).not.toContain("merger-1")
  })

  it("merger IS ready when ALL branches completed", () => {
    const states: Record<string, NodeState> = {
      "input-1": { status: "completed", attempts: 1, log: [] },
      "splitter-1": { status: "completed", attempts: 1, log: [] },
      "skill-a": { status: "completed", attempts: 1, log: [] },
      "skill-b": { status: "completed", attempts: 1, log: [] },
      "skill-c": { status: "completed", attempts: 1, log: [] },
    }

    const ready = findReadyNodes(FAN_OUT, states)
    expect(ready.map((n) => n.id)).toContain("merger-1")
  })

  it("merger IS ready when 2/3 branches completed and 1 failed (with activatedEdges)", () => {
    const states: Record<string, NodeState> = {
      "input-1": { status: "completed", attempts: 1, log: [] },
      "splitter-1": { status: "completed", attempts: 1, log: [] },
      "skill-a": { status: "completed", attempts: 1, log: [] },
      "skill-b": { status: "failed", attempts: 1, log: [] },
      "skill-c": { status: "completed", attempts: 1, log: [] },
    }

    // All edges activated (including from failed branch)
    const activated = new Set(["e1", "e2a", "e2b", "e2c", "e3a", "e3b", "e3c"])
    const ready = findReadyNodes(FAN_OUT, states, activated)
    expect(ready.map((n) => n.id)).toContain("merger-1")
  })

  it("merger is NOT ready when a branch is still running (with activatedEdges)", () => {
    const states: Record<string, NodeState> = {
      "input-1": { status: "completed", attempts: 1, log: [] },
      "splitter-1": { status: "completed", attempts: 1, log: [] },
      "skill-a": { status: "completed", attempts: 1, log: [] },
      "skill-b": { status: "running", attempts: 1, log: [] },
      "skill-c": { status: "completed", attempts: 1, log: [] },
    }

    const activated = new Set(["e1", "e2a", "e2b", "e2c", "e3a", "e3c"])
    const ready = findReadyNodes(FAN_OUT, states, activated)
    expect(ready.map((n) => n.id)).not.toContain("merger-1")
  })

  it("merger IS ready when a branch is skipped (with activatedEdges)", () => {
    const states: Record<string, NodeState> = {
      "input-1": { status: "completed", attempts: 1, log: [] },
      "splitter-1": { status: "completed", attempts: 1, log: [] },
      "skill-a": { status: "completed", attempts: 1, log: [] },
      "skill-b": { status: "skipped", attempts: 1, log: [] },
      "skill-c": { status: "completed", attempts: 1, log: [] },
    }

    const activated = new Set(["e1", "e2a", "e2b", "e2c", "e3a", "e3b", "e3c"])
    const ready = findReadyNodes(FAN_OUT, states, activated)
    expect(ready.map((n) => n.id)).toContain("merger-1")
  })
})

describe("getDownstreamNodeIds", () => {
  it("returns just the node itself when it has no outgoing edges", () => {
    const ids = getDownstreamNodeIds(LINEAR, "output-1")
    expect(ids).toEqual(["output-1"])
  })

  it("returns all downstream nodes in a linear chain", () => {
    const ids = getDownstreamNodeIds(LINEAR, "skill-1")
    expect(ids.sort()).toEqual(["output-1", "skill-1"])
  })

  it("returns the full chain from input", () => {
    const ids = getDownstreamNodeIds(LINEAR, "input-1")
    expect(ids.sort()).toEqual(["input-1", "output-1", "skill-1"])
  })

  it("follows fan-out paths", () => {
    const ids = getDownstreamNodeIds(FAN_OUT, "splitter-1")
    expect(ids.sort()).toEqual([
      "merger-1",
      "output-1",
      "skill-a",
      "skill-b",
      "skill-c",
      "splitter-1",
    ])
  })

  it("only includes downstream from a specific branch", () => {
    const ids = getDownstreamNodeIds(FAN_OUT, "skill-a")
    expect(ids.sort()).toEqual(["merger-1", "output-1", "skill-a"])
  })

  it("handles eval loop edges", () => {
    const ids = getDownstreamNodeIds(LOOP, "skill-1")
    // skill-1 → eval-1 (pass → output-1, fail → skill-1)
    expect(ids.sort()).toEqual(["eval-1", "output-1", "skill-1"])
  })
})
