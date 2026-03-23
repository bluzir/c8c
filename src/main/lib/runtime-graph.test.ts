import { describe, it, expect } from "vitest"
import {
  collapseSplitterExpansion,
  expandSplitter,
  RuntimeGraphError,
  type RuntimeWorkflow,
} from "./runtime-graph"
import { isRunComplete } from "./graph-engine"
import type { Workflow, NodeState } from "@shared/types"

// Static workflow: input → splitter → skill-template → merger → output
const FAN_OUT_WORKFLOW: Workflow = {
  version: 1,
  name: "Fan-out Test",
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 200 }, config: {} },
    {
      id: "splitter-1",
      type: "splitter",
      position: { x: 300, y: 200 },
      config: { strategy: "Split by section", maxBranches: 8 },
    },
    {
      id: "skill-tpl",
      type: "skill",
      position: { x: 600, y: 200 },
      config: { skillRef: "test/improver", prompt: "Improve this section" },
    },
    {
      id: "merger-1",
      type: "merger",
      position: { x: 900, y: 200 },
      config: { strategy: "concatenate" },
    },
    {
      id: "output-1",
      type: "output",
      position: { x: 1200, y: 200 },
      config: {},
    },
  ],
  edges: [
    { id: "e1", source: "input-1", target: "splitter-1", type: "default" },
    { id: "e2", source: "splitter-1", target: "skill-tpl", type: "default" },
    { id: "e3", source: "skill-tpl", target: "merger-1", type: "default" },
    { id: "e4", source: "merger-1", target: "output-1", type: "default" },
  ],
}

describe("expandSplitter", () => {
  it("creates N runtime skill copies from template", () => {
    const subtasks = [
      { key: "hero", content: "Improve hero section" },
      { key: "features", content: "Improve features section" },
      { key: "pricing", content: "Improve pricing section" },
    ]

    const result = expandSplitter(FAN_OUT_WORKFLOW, "splitter-1", subtasks)

    // Template skill removed, 3 runtime copies added
    expect(result.nodes.filter((n) => n.id === "skill-tpl")).toHaveLength(0)
    const runtimeSkills = result.nodes.filter((n) =>
      n.id.startsWith("skill-tpl::"),
    )
    expect(runtimeSkills).toHaveLength(3)
  })

  it("wires runtime skills: splitter → each skill → merger", () => {
    const subtasks = [
      { key: "a", content: "Task A" },
      { key: "b", content: "Task B" },
    ]

    const result = expandSplitter(FAN_OUT_WORKFLOW, "splitter-1", subtasks)

    const runtimeSkills = result.nodes.filter((n) =>
      n.id.startsWith("skill-tpl::"),
    )
    for (const skill of runtimeSkills) {
      const incoming = result.edges.filter((e) => e.target === skill.id)
      const outgoing = result.edges.filter((e) => e.source === skill.id)
      expect(incoming).toHaveLength(1)
      expect(incoming[0].source).toBe("splitter-1")
      expect(outgoing).toHaveLength(1)
      expect(outgoing[0].target).toBe("merger-1")
    }
  })

  it("removes old template edges", () => {
    const subtasks = [{ key: "a", content: "Task A" }]
    const result = expandSplitter(FAN_OUT_WORKFLOW, "splitter-1", subtasks)

    expect(result.edges.find((e) => e.target === "skill-tpl")).toBeUndefined()
    expect(result.edges.find((e) => e.source === "skill-tpl")).toBeUndefined()
  })

  it("preserves other edges (input→splitter, merger→output)", () => {
    const subtasks = [{ key: "a", content: "Task A" }]
    const result = expandSplitter(FAN_OUT_WORKFLOW, "splitter-1", subtasks)

    expect(
      result.edges.find(
        (e) => e.source === "input-1" && e.target === "splitter-1",
      ),
    ).toBeDefined()
    expect(
      result.edges.find(
        (e) => e.source === "merger-1" && e.target === "output-1",
      ),
    ).toBeDefined()
  })

  it("stores subtask content in runtime node metadata", () => {
    const subtasks = [{ key: "hero", content: "Improve hero section" }]

    const result = expandSplitter(FAN_OUT_WORKFLOW, "splitter-1", subtasks)
    const runtimeSkill = result.nodes.find((n) =>
      n.id.startsWith("skill-tpl::"),
    )!
    expect(result.runtimeMeta[runtimeSkill.id].subtaskContent).toBe(
      "Improve hero section",
    )
    expect(result.runtimeMeta[runtimeSkill.id].subtaskKey).toBe("hero")
    expect(result.runtimeMeta[runtimeSkill.id].branchIndex).toBe(0)
    expect(result.runtimeMeta[runtimeSkill.id].totalBranches).toBe(1)
  })

  it("fails fast on empty subtasks", () => {
    const subtasks: { key: string; content: string }[] = []

    expect(() =>
      expandSplitter(FAN_OUT_WORKFLOW, "splitter-1", subtasks),
    ).toThrow(RuntimeGraphError)
  })

  it("respects maxBranches limit", () => {
    const subtasks = Array.from({ length: 20 }, (_, i) => ({
      key: `task-${i}`,
      content: `Task ${i}`,
    }))

    const result = expandSplitter(FAN_OUT_WORKFLOW, "splitter-1", subtasks)
    const runtimeSkills = result.nodes.filter((n) =>
      n.id.startsWith("skill-tpl::"),
    )
    // maxBranches is 8 in the fixture
    expect(runtimeSkills).toHaveLength(8)
  })

  it("clones parallel skills between splitter and merger", () => {
    const workflow: Workflow = {
      version: 1,
      name: "Parallel Skills Test",
      nodes: [
        {
          id: "input-1",
          type: "input",
          position: { x: 0, y: 200 },
          config: {},
        },
        {
          id: "splitter-1",
          type: "splitter",
          position: { x: 300, y: 200 },
          config: { strategy: "Split", maxBranches: 8 },
        },
        {
          id: "ux-audit",
          type: "skill",
          position: { x: 600, y: 100 },
          config: { skillRef: "audit/ux", prompt: "UX audit" },
        },
        {
          id: "copy-audit",
          type: "skill",
          position: { x: 600, y: 300 },
          config: { skillRef: "audit/copy", prompt: "Copy audit" },
        },
        {
          id: "merger-1",
          type: "merger",
          position: { x: 900, y: 200 },
          config: { strategy: "concatenate" },
        },
        {
          id: "output-1",
          type: "output",
          position: { x: 1200, y: 200 },
          config: {},
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "splitter-1", type: "default" },
        { id: "e2", source: "splitter-1", target: "ux-audit", type: "default" },
        {
          id: "e3",
          source: "splitter-1",
          target: "copy-audit",
          type: "default",
        },
        { id: "e4", source: "ux-audit", target: "merger-1", type: "default" },
        { id: "e5", source: "copy-audit", target: "merger-1", type: "default" },
        { id: "e6", source: "merger-1", target: "output-1", type: "default" },
      ],
    }

    const subtasks = [
      { key: "page-1", content: "Audit page 1" },
      { key: "page-2", content: "Audit page 2" },
    ]

    const result = expandSplitter(workflow, "splitter-1", subtasks)

    // Both template nodes removed
    expect(result.nodes.find((n) => n.id === "ux-audit")).toBeUndefined()
    expect(result.nodes.find((n) => n.id === "copy-audit")).toBeUndefined()

    // 2 subtasks × 2 template nodes = 4 runtime nodes
    const runtimeUx = result.nodes.filter((n) => n.id.startsWith("ux-audit::"))
    const runtimeCopy = result.nodes.filter((n) =>
      n.id.startsWith("copy-audit::"),
    )
    expect(runtimeUx).toHaveLength(2)
    expect(runtimeCopy).toHaveLength(2)

    // Each cloned node wired: splitter → node, node → merger
    for (const node of [...runtimeUx, ...runtimeCopy]) {
      const incoming = result.edges.filter((e) => e.target === node.id)
      const outgoing = result.edges.filter((e) => e.source === node.id)
      expect(incoming).toHaveLength(1)
      expect(incoming[0].source).toBe("splitter-1")
      expect(outgoing).toHaveLength(1)
      expect(outgoing[0].target).toBe("merger-1")
    }

    // runtimeMeta set for all entry-point clones
    expect(result.runtimeMeta["ux-audit::page-1"].subtaskContent).toBe(
      "Audit page 1",
    )
    expect(result.runtimeMeta["copy-audit::page-2"].subtaskContent).toBe(
      "Audit page 2",
    )
  })

  it("remaps evaluator retryFrom to cloned node ID within branch", () => {
    const workflow: Workflow = {
      version: 1,
      name: "Per-Branch Evaluator Loop",
      nodes: [
        {
          id: "input-1",
          type: "input",
          position: { x: 0, y: 200 },
          config: {},
        },
        {
          id: "splitter-1",
          type: "splitter",
          position: { x: 300, y: 200 },
          config: { strategy: "Split into blocks", maxBranches: 8 },
        },
        {
          id: "writer-1",
          type: "skill",
          position: { x: 600, y: 200 },
          config: { skillRef: "test/writer", prompt: "Write block" },
        },
        {
          id: "eval-1",
          type: "evaluator",
          position: { x: 900, y: 200 },
          config: {
            criteria: "Quality check",
            threshold: 8,
            maxRetries: 3,
            retryFrom: "writer-1",
          },
        },
        {
          id: "merger-1",
          type: "merger",
          position: { x: 1200, y: 200 },
          config: { strategy: "concatenate" },
        },
        {
          id: "output-1",
          type: "output",
          position: { x: 1500, y: 200 },
          config: {},
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "splitter-1", type: "default" },
        { id: "e2", source: "splitter-1", target: "writer-1", type: "default" },
        { id: "e3", source: "writer-1", target: "eval-1", type: "default" },
        { id: "e4", source: "eval-1", target: "merger-1", type: "pass" },
        { id: "e5", source: "eval-1", target: "writer-1", type: "fail" },
        { id: "e6", source: "merger-1", target: "output-1", type: "default" },
      ],
    }

    const subtasks = [
      { key: "hero", content: "Write hero block" },
      { key: "pricing", content: "Write pricing block" },
    ]

    const result = expandSplitter(workflow, "splitter-1", subtasks)

    // Both writer and evaluator cloned per branch
    expect(result.nodes.find((n) => n.id === "writer-1::hero")).toBeDefined()
    expect(result.nodes.find((n) => n.id === "eval-1::hero")).toBeDefined()
    expect(result.nodes.find((n) => n.id === "writer-1::pricing")).toBeDefined()
    expect(result.nodes.find((n) => n.id === "eval-1::pricing")).toBeDefined()

    // Evaluator retryFrom remapped to cloned writer ID
    const heroEval = result.nodes.find((n) => n.id === "eval-1::hero")!
    const pricingEval = result.nodes.find((n) => n.id === "eval-1::pricing")!
    expect((heroEval.config as any).retryFrom).toBe("writer-1::hero")
    expect((pricingEval.config as any).retryFrom).toBe("writer-1::pricing")

    // Pass edges from evaluator clones go to merger
    expect(
      result.edges.find(
        (e) =>
          e.source === "eval-1::hero" &&
          e.target === "merger-1" &&
          e.type === "pass",
      ),
    ).toBeDefined()
    expect(
      result.edges.find(
        (e) =>
          e.source === "eval-1::pricing" &&
          e.target === "merger-1" &&
          e.type === "pass",
      ),
    ).toBeDefined()

    // Fail edges loop back within each branch
    expect(
      result.edges.find(
        (e) =>
          e.source === "eval-1::hero" &&
          e.target === "writer-1::hero" &&
          e.type === "fail",
      ),
    ).toBeDefined()
    expect(
      result.edges.find(
        (e) =>
          e.source === "eval-1::pricing" &&
          e.target === "writer-1::pricing" &&
          e.type === "fail",
      ),
    ).toBeDefined()

    // Original template nodes removed
    expect(result.nodes.find((n) => n.id === "writer-1")).toBeUndefined()
    expect(result.nodes.find((n) => n.id === "eval-1")).toBeUndefined()
  })

  it("clones linear chain between splitter and merger", () => {
    const workflow: Workflow = {
      version: 1,
      name: "Linear Chain Test",
      nodes: [
        {
          id: "input-1",
          type: "input",
          position: { x: 0, y: 200 },
          config: {},
        },
        {
          id: "splitter-1",
          type: "splitter",
          position: { x: 300, y: 200 },
          config: { strategy: "Split", maxBranches: 8 },
        },
        {
          id: "skill-a",
          type: "skill",
          position: { x: 600, y: 200 },
          config: { skillRef: "test/a", prompt: "Step A" },
        },
        {
          id: "skill-b",
          type: "skill",
          position: { x: 900, y: 200 },
          config: { skillRef: "test/b", prompt: "Step B" },
        },
        {
          id: "merger-1",
          type: "merger",
          position: { x: 1200, y: 200 },
          config: { strategy: "concatenate" },
        },
        {
          id: "output-1",
          type: "output",
          position: { x: 1500, y: 200 },
          config: {},
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "splitter-1", type: "default" },
        { id: "e2", source: "splitter-1", target: "skill-a", type: "default" },
        { id: "e3", source: "skill-a", target: "skill-b", type: "default" },
        { id: "e4", source: "skill-b", target: "merger-1", type: "default" },
        { id: "e5", source: "merger-1", target: "output-1", type: "default" },
      ],
    }

    const subtasks = [
      { key: "s1", content: "Subtask 1" },
      { key: "s2", content: "Subtask 2" },
    ]

    const result = expandSplitter(workflow, "splitter-1", subtasks)

    // Both template nodes removed
    expect(result.nodes.find((n) => n.id === "skill-a")).toBeUndefined()
    expect(result.nodes.find((n) => n.id === "skill-b")).toBeUndefined()

    // 2 subtasks × 2 nodes = 4 runtime nodes
    expect(
      result.nodes.filter((n) => n.id.startsWith("skill-a::")).length,
    ).toBe(2)
    expect(
      result.nodes.filter((n) => n.id.startsWith("skill-b::")).length,
    ).toBe(2)

    // Internal chain preserved: skill-a::s1 → skill-b::s1
    expect(
      result.edges.find(
        (e) => e.source === "skill-a::s1" && e.target === "skill-b::s1",
      ),
    ).toBeDefined()
    expect(
      result.edges.find(
        (e) => e.source === "skill-a::s2" && e.target === "skill-b::s2",
      ),
    ).toBeDefined()

    // Entry edges: splitter → skill-a clones
    expect(
      result.edges.find(
        (e) => e.source === "splitter-1" && e.target === "skill-a::s1",
      ),
    ).toBeDefined()
    expect(
      result.edges.find(
        (e) => e.source === "splitter-1" && e.target === "skill-a::s2",
      ),
    ).toBeDefined()

    // Exit edges: skill-b clones → merger
    expect(
      result.edges.find(
        (e) => e.source === "skill-b::s1" && e.target === "merger-1",
      ),
    ).toBeDefined()
    expect(
      result.edges.find(
        (e) => e.source === "skill-b::s2" && e.target === "merger-1",
      ),
    ).toBeDefined()

    // runtimeMeta is present for all runtime clones
    expect(result.runtimeMeta["skill-a::s1"]).toBeDefined()
    expect(result.runtimeMeta["skill-a::s1"].subtaskContent).toBe("Subtask 1")
    expect(result.runtimeMeta["skill-b::s1"]).toBeDefined()
  })

  it("sanitizes unsafe subtask keys", () => {
    const result = expandSplitter(FAN_OUT_WORKFLOW, "splitter-1", [
      { key: "Hero Section!", content: "Hero" },
    ])

    expect(
      result.nodes.find((node) => node.id === "skill-tpl::hero-section"),
    ).toBeDefined()
    expect(result.runtimeMeta["skill-tpl::hero-section"]?.subtaskKey).toBe(
      "hero-section",
    )
  })

  it("deduplicates normalized subtask keys", () => {
    const result = expandSplitter(FAN_OUT_WORKFLOW, "splitter-1", [
      { key: "Hero", content: "A" },
      { key: "hero!", content: "B" },
    ])

    expect(
      result.nodes.find((node) => node.id === "skill-tpl::hero"),
    ).toBeDefined()
    expect(
      result.nodes.find((node) => node.id === "skill-tpl::hero-2"),
    ).toBeDefined()
    expect(result.runtimeMeta["skill-tpl::hero"]?.subtaskKey).toBe("hero")
    expect(result.runtimeMeta["skill-tpl::hero-2"]?.subtaskKey).toBe("hero-2")
  })

  it("collapses runtime expansion without mutating the original runtime workflow object", () => {
    const expanded = expandSplitter(FAN_OUT_WORKFLOW, "splitter-1", [
      { key: "hero", content: "Hero" },
      { key: "pricing", content: "Pricing" },
    ])
    const originalNodeIds = expanded.nodes.map((node) => node.id)

    const collapsed = collapseSplitterExpansion(
      expanded,
      FAN_OUT_WORKFLOW,
      "splitter-1",
    )

    expect(expanded.nodes.map((node) => node.id)).toEqual(originalNodeIds)
    expect(collapsed.removedIds.has("skill-tpl::hero")).toBe(true)
    expect(
      collapsed.workflow.nodes.find((node) => node.id === "skill-tpl"),
    ).toBeDefined()
    expect(
      collapsed.workflow.nodes.find((node) => node.id === "skill-tpl::hero"),
    ).toBeUndefined()
  })
})

describe("unreachable nodes marked as skipped", () => {
  it("isRunComplete returns true when unreachable nodes are marked skipped", () => {
    // Simulates post-loop cleanup: a failed branch caused merger + output to be skipped
    const states: Record<string, NodeState> = {
      "input-1": { status: "completed", attempts: 1, log: [] },
      "splitter-1": { status: "completed", attempts: 1, log: [] },
      "skill-tpl::hero": { status: "completed", attempts: 1, log: [] },
      "skill-tpl::pricing": { status: "failed", attempts: 1, log: [] },
      "merger-1": { status: "skipped", attempts: 0, log: [] },
      "output-1": { status: "skipped", attempts: 0, log: [] },
    }
    expect(isRunComplete(states)).toBe(true)
  })

  it("isRunComplete returns false when nodes are still pending (not yet skipped)", () => {
    const states: Record<string, NodeState> = {
      "input-1": { status: "completed", attempts: 1, log: [] },
      "splitter-1": { status: "completed", attempts: 1, log: [] },
      "skill-tpl::hero": { status: "completed", attempts: 1, log: [] },
      "skill-tpl::pricing": { status: "failed", attempts: 1, log: [] },
      "merger-1": { status: "pending", attempts: 0, log: [] },
      "output-1": { status: "pending", attempts: 0, log: [] },
    }
    expect(isRunComplete(states)).toBe(false)
  })
})
