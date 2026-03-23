import { describe, expect, it } from "vitest"
import type { Workflow } from "@shared/types"
import {
  addApprovalNodeToWorkflow,
  addEdgeToWorkflow,
  addEvaluatorNodeToWorkflow,
  addFanOutPatternToWorkflow,
  addHumanNodeToWorkflow,
  addSkillNodeToWorkflow,
  getLinearChainReorderBlockReason,
  getMiddleNodeMoveBlockedReason,
  moveMiddleNodeByDirection,
  removeEdgeFromWorkflow,
  removeNodeAndRewireWorkflow,
} from "./workflow-mutations"

function createWorkflow(): Workflow {
  return {
    version: 1,
    name: "Test",
    defaults: { model: "sonnet" },
    nodes: [
      { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
      {
        id: "skill-1",
        type: "skill",
        position: { x: 200, y: 0 },
        config: { skillRef: "test/skill", prompt: "run" },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 400, y: 0 },
        config: {},
      },
    ],
    edges: [
      {
        id: "e-input-skill",
        source: "input-1",
        target: "skill-1",
        type: "default",
      },
      {
        id: "e-skill-output",
        source: "skill-1",
        target: "output-1",
        type: "default",
      },
    ],
  }
}

describe("workflow edge mutations", () => {
  it("adds a valid edge and prevents duplicates", () => {
    const workflow = createWorkflow()
    const result = addEdgeToWorkflow(workflow, "input-1", "output-1", "default")
    expect(result.workflow.edges).toHaveLength(3)

    const duplicateAttempt = addEdgeToWorkflow(
      result.workflow,
      "input-1",
      "output-1",
      "default",
    )
    expect(duplicateAttempt.workflow.edges).toHaveLength(3)
    expect(duplicateAttempt.error).toBeDefined()
  })

  it("does not allow output -> input connections", () => {
    const workflow = createWorkflow()
    const result = addEdgeToWorkflow(workflow, "output-1", "input-1", "default")
    expect(result.workflow.edges).toHaveLength(2)
    expect(result.error).toBeDefined()
  })

  it("removes an existing edge by id", () => {
    const workflow = createWorkflow()
    const next = removeEdgeFromWorkflow(workflow, "e-input-skill")
    expect(next.edges).toHaveLength(1)
    expect(next.edges[0].id).toBe("e-skill-output")
  })

  it("prevents adding default edges that create cycles", () => {
    const workflow: Workflow = {
      ...createWorkflow(),
      nodes: [
        { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
        {
          id: "skill-1",
          type: "skill",
          position: { x: 120, y: 0 },
          config: { skillRef: "test/a", prompt: "a" },
        },
        {
          id: "skill-2",
          type: "skill",
          position: { x: 240, y: 0 },
          config: { skillRef: "test/b", prompt: "b" },
        },
        {
          id: "output-1",
          type: "output",
          position: { x: 360, y: 0 },
          config: {},
        },
      ],
      edges: [
        {
          id: "e-input-s1",
          source: "input-1",
          target: "skill-1",
          type: "default",
        },
        {
          id: "e-s1-s2",
          source: "skill-1",
          target: "skill-2",
          type: "default",
        },
        {
          id: "e-s2-output",
          source: "skill-2",
          target: "output-1",
          type: "default",
        },
      ],
    }

    const result = addEdgeToWorkflow(workflow, "skill-2", "skill-1", "default")
    expect(result.workflow.edges).toHaveLength(3)
    expect(result.error).toBeDefined()
  })

  it("rewires removal without creating self-loops and preserves branch edge types", () => {
    const workflow: Workflow = {
      version: 1,
      name: "Evaluator flow",
      defaults: { model: "sonnet" },
      nodes: [
        { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
        {
          id: "skill-1",
          type: "skill",
          position: { x: 120, y: 0 },
          config: { skillRef: "test/skill", prompt: "run" },
        },
        {
          id: "eval-1",
          type: "evaluator",
          position: { x: 240, y: 0 },
          config: {
            criteria: "score",
            threshold: 7,
            maxRetries: 2,
            retryFrom: "skill-1",
          },
        },
        {
          id: "output-1",
          type: "output",
          position: { x: 360, y: 0 },
          config: {},
        },
      ],
      edges: [
        {
          id: "e-input-skill",
          source: "input-1",
          target: "skill-1",
          type: "default",
        },
        {
          id: "e-skill-eval",
          source: "skill-1",
          target: "eval-1",
          type: "default",
        },
        {
          id: "e-eval-output",
          source: "eval-1",
          target: "output-1",
          type: "pass",
        },
        {
          id: "fail-eval-skill",
          source: "eval-1",
          target: "skill-1",
          type: "fail",
        },
      ],
    }

    const next = removeNodeAndRewireWorkflow(workflow, "eval-1")

    expect(next.nodes.some((node) => node.id === "eval-1")).toBe(false)
    expect(
      next.edges.some(
        (edge) => edge.source === "skill-1" && edge.target === "skill-1",
      ),
    ).toBe(false)
    expect(
      next.edges.some(
        (edge) =>
          edge.source === "skill-1" &&
          edge.target === "output-1" &&
          edge.type === "pass",
      ),
    ).toBe(true)
  })

  it("clears evaluator retryFrom when referenced node is removed", () => {
    const workflow: Workflow = {
      version: 1,
      name: "Retry flow",
      defaults: { model: "sonnet" },
      nodes: [
        { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
        {
          id: "skill-1",
          type: "skill",
          position: { x: 120, y: 0 },
          config: { skillRef: "test/skill", prompt: "run" },
        },
        {
          id: "eval-1",
          type: "evaluator",
          position: { x: 240, y: 0 },
          config: {
            criteria: "score",
            threshold: 7,
            maxRetries: 2,
            retryFrom: "skill-1",
          },
        },
        {
          id: "output-1",
          type: "output",
          position: { x: 360, y: 0 },
          config: {},
        },
      ],
      edges: [
        {
          id: "e-input-skill",
          source: "input-1",
          target: "skill-1",
          type: "default",
        },
        {
          id: "e-skill-eval",
          source: "skill-1",
          target: "eval-1",
          type: "default",
        },
        {
          id: "e-eval-output",
          source: "eval-1",
          target: "output-1",
          type: "pass",
        },
      ],
    }

    const next = removeNodeAndRewireWorkflow(workflow, "skill-1")
    const evaluator = next.nodes.find((node) => node.id === "eval-1")
    expect(evaluator?.type).toBe("evaluator")
    expect(
      (evaluator?.config as { retryFrom?: string }).retryFrom,
    ).toBeUndefined()
  })

  it("keeps node ids unique for rapid inserts with same timestamp", () => {
    const workflow = createWorkflow()
    const skill = {
      type: "skill" as const,
      name: "Research Skill",
      description: "do research",
      category: "research",
      path: "/tmp/research.md",
    }

    const first = addSkillNodeToWorkflow(workflow, skill, 1700000000000)
    const second = addSkillNodeToWorkflow(first, skill, 1700000000000)
    const skillNodes = second.nodes.filter((node) => node.type === "skill")
    const ids = new Set(skillNodes.map((node) => node.id))

    expect(ids.size).toBe(skillNodes.length)
  })

  it("inserts an evaluator with pass and fail wiring before output", () => {
    const next = addEvaluatorNodeToWorkflow(createWorkflow(), 1700000000000)
    const evaluator = next.nodes.find((node) => node.type === "evaluator")

    expect(evaluator).toBeDefined()
    expect((evaluator?.config as { retryFrom?: string }).retryFrom).toBe(
      "skill-1",
    )
    expect(
      next.edges.some(
        (edge) =>
          edge.source === "skill-1" &&
          edge.target === evaluator?.id &&
          edge.type === "default",
      ),
    ).toBe(true)
    expect(
      next.edges.some(
        (edge) =>
          edge.source === evaluator?.id &&
          edge.target === "output-1" &&
          edge.type === "pass",
      ),
    ).toBe(true)
    expect(
      next.edges.some(
        (edge) =>
          edge.source === evaluator?.id &&
          edge.target === "skill-1" &&
          edge.type === "fail",
      ),
    ).toBe(true)
  })

  it("inserts a fan-out scaffold before output", () => {
    const next = addFanOutPatternToWorkflow(createWorkflow(), 1700000000000)
    const splitter = next.nodes.find((node) => node.type === "splitter")
    const branchSkill = next.nodes.find(
      (node) => node.type === "skill" && node.id !== "skill-1",
    )
    const merger = next.nodes.find((node) => node.type === "merger")

    expect(splitter).toBeDefined()
    expect(branchSkill).toBeDefined()
    expect(merger).toBeDefined()
    expect(
      next.edges.some(
        (edge) => edge.source === "skill-1" && edge.target === splitter?.id,
      ),
    ).toBe(true)
    expect(
      next.edges.some(
        (edge) =>
          edge.source === splitter?.id && edge.target === branchSkill?.id,
      ),
    ).toBe(true)
    expect(
      next.edges.some(
        (edge) => edge.source === branchSkill?.id && edge.target === merger?.id,
      ),
    ).toBe(true)
    expect(
      next.edges.some(
        (edge) => edge.source === merger?.id && edge.target === "output-1",
      ),
    ).toBe(true)
  })

  it("inserts approval and human steps as linear nodes before output", () => {
    const withApproval = addApprovalNodeToWorkflow(
      createWorkflow(),
      1700000000000,
    )
    const approval = withApproval.nodes.find((node) => node.type === "approval")

    expect(approval).toBeDefined()
    expect(
      withApproval.edges.some(
        (edge) => edge.source === "skill-1" && edge.target === approval?.id,
      ),
    ).toBe(true)
    expect(
      withApproval.edges.some(
        (edge) => edge.source === approval?.id && edge.target === "output-1",
      ),
    ).toBe(true)

    const withHuman = addHumanNodeToWorkflow(createWorkflow(), 1700000000000)
    const human = withHuman.nodes.find((node) => node.type === "human")

    expect(human).toBeDefined()
    expect(
      withHuman.edges.some(
        (edge) => edge.source === "skill-1" && edge.target === human?.id,
      ),
    ).toBe(true)
    expect(
      withHuman.edges.some(
        (edge) => edge.source === human?.id && edge.target === "output-1",
      ),
    ).toBe(true)
  })

  it("promotes a discovered skill model to workflow defaults instead of the node config", () => {
    const workflow: Workflow = {
      ...createWorkflow(),
      defaults: {},
    }

    const skill = {
      type: "skill" as const,
      name: "Codex Skill",
      description: "ship it",
      category: "coding",
      path: "/tmp/codex-skill.md",
      model: "gpt-5-codex",
    }

    const next = addSkillNodeToWorkflow(workflow, skill, 1700000000000)
    const addedSkill = next.nodes.find(
      (node) => node.id !== "skill-1" && node.type === "skill",
    )

    expect(next.defaults?.provider).toBe("codex")
    expect(next.defaults?.model).toBe("gpt-5-codex")
    expect((addedSkill?.config as { model?: string }).model).toBeUndefined()
  })

  it("normalizes discovered skill metadata before inserting a node", () => {
    const workflow = createWorkflow()
    const skill = {
      type: "skill" as const,
      name: "Backend Architect",
      description: "Design scalable backend systems",
      category: "engineering",
      path: "/tmp/backend-architect/SKILL.md",
      maxTurns: "12" as unknown as number,
      allowedTools: "Read, Edit, Bash" as unknown as string[],
      disallowedTools: ["", "WebSearch", 42] as unknown as string[],
    }

    const next = addSkillNodeToWorkflow(workflow, skill, 1700000000000)
    const addedSkill = next.nodes.find(
      (node) => node.id !== "skill-1" && node.type === "skill",
    )
    const config = addedSkill?.config as {
      maxTurns?: number
      allowedTools?: string[]
      disallowedTools?: string[]
    }

    expect(config.maxTurns).toBe(12)
    expect(config.allowedTools).toEqual(["Read", "Edit", "Bash"])
    expect(config.disallowedTools).toEqual(["WebSearch"])
  })

  it("does not flatten fan-out topology when reordering in list mode", () => {
    const workflow: Workflow = {
      version: 1,
      name: "Fanout flow",
      defaults: { model: "sonnet" },
      nodes: [
        { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
        {
          id: "splitter-1",
          type: "splitter",
          position: { x: 120, y: 0 },
          config: { strategy: "split", maxBranches: 2 },
        },
        {
          id: "skill-a",
          type: "skill",
          position: { x: 240, y: -80 },
          config: { skillRef: "test/a", prompt: "a" },
        },
        {
          id: "skill-b",
          type: "skill",
          position: { x: 240, y: 80 },
          config: { skillRef: "test/b", prompt: "b" },
        },
        {
          id: "merger-1",
          type: "merger",
          position: { x: 360, y: 0 },
          config: { strategy: "concatenate" },
        },
        {
          id: "output-1",
          type: "output",
          position: { x: 480, y: 0 },
          config: {},
        },
      ],
      edges: [
        {
          id: "e-input-splitter",
          source: "input-1",
          target: "splitter-1",
          type: "default",
        },
        {
          id: "e-splitter-a",
          source: "splitter-1",
          target: "skill-a",
          type: "default",
        },
        {
          id: "e-splitter-b",
          source: "splitter-1",
          target: "skill-b",
          type: "default",
        },
        {
          id: "e-a-merger",
          source: "skill-a",
          target: "merger-1",
          type: "default",
        },
        {
          id: "e-b-merger",
          source: "skill-b",
          target: "merger-1",
          type: "default",
        },
        {
          id: "e-merger-output",
          source: "merger-1",
          target: "output-1",
          type: "default",
        },
      ],
    }

    const next = moveMiddleNodeByDirection(workflow, "skill-a", "down")
    expect(next).toEqual(workflow)
    expect(getLinearChainReorderBlockReason(workflow)).toBe(
      "Reordering is unavailable once the flow branches. Use Canvas to restructure branching flows.",
    )
  })

  it("returns boundary reasons for move attempts past the first or last editable step", () => {
    const workflow = createWorkflow()
    const withSecondSkill: Workflow = {
      ...workflow,
      nodes: [
        workflow.nodes[0],
        workflow.nodes[1],
        {
          id: "skill-2",
          type: "skill",
          position: { x: 280, y: 0 },
          config: { skillRef: "test/second", prompt: "again" },
        },
        workflow.nodes[2],
      ],
      edges: [
        {
          id: "e-input-skill-1",
          source: "input-1",
          target: "skill-1",
          type: "default",
        },
        {
          id: "e-skill-1-skill-2",
          source: "skill-1",
          target: "skill-2",
          type: "default",
        },
        {
          id: "e-skill-2-output",
          source: "skill-2",
          target: "output-1",
          type: "default",
        },
      ],
    }

    expect(
      getMiddleNodeMoveBlockedReason(withSecondSkill, "skill-1", "up"),
    ).toBe("This step is already the first editable step.")
    expect(
      getMiddleNodeMoveBlockedReason(withSecondSkill, "skill-2", "down"),
    ).toBe("This step is already the last editable step.")
    expect(
      getMiddleNodeMoveBlockedReason(withSecondSkill, "input-1", "down"),
    ).toBe("Only editable steps can be reordered.")
  })
})
