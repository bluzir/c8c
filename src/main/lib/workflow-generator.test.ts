import { describe, it, expect } from "vitest"
import {
  buildGeneratorPrompt,
  buildWorkflowEditPrompt,
  parseGeneratedWorkflow,
  normalizeEdges,
  normalizeNodes,
} from "./workflow-generator"
import type { Workflow } from "@shared/types"

const MOCK_SKILLS = [
  {
    name: "content-creator",
    category: "marketing",
    description: "Creates marketing content",
  },
  {
    name: "code-reviewer",
    category: "engineering",
    description: "Reviews code quality",
  },
  {
    name: "researcher",
    category: "research",
    description: "Deep research on topics",
  },
]

describe("buildGeneratorPrompt", () => {
  it("includes available skills", () => {
    const prompt = buildGeneratorPrompt("Make a content pipeline", MOCK_SKILLS)
    expect(prompt).toContain("content-creator")
    expect(prompt).toContain("code-reviewer")
    expect(prompt).toContain("researcher")
  })

  it("includes user description", () => {
    const prompt = buildGeneratorPrompt(
      "Analyze my codebase and fix bugs",
      MOCK_SKILLS,
    )
    expect(prompt).toContain("Analyze my codebase and fix bugs")
  })

  it("includes the skill file content with node type docs", () => {
    const prompt = buildGeneratorPrompt("test", MOCK_SKILLS)
    expect(prompt).toContain("input")
    expect(prompt).toContain("skill")
    expect(prompt).toContain("evaluator")
    expect(prompt).toContain("splitter")
    expect(prompt).toContain("merger")
    expect(prompt).toContain("output")
  })
})

describe("buildWorkflowEditPrompt", () => {
  it("includes the current workflow and edit request", () => {
    const currentWorkflow: Workflow = {
      version: 1,
      name: "Existing Flow",
      nodes: [
        { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
        {
          id: "output-1",
          type: "output",
          position: { x: 300, y: 0 },
          config: {},
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "output-1", type: "default" },
      ],
    }

    const prompt = buildWorkflowEditPrompt(
      "Add a JTBD audit step before the final output",
      currentWorkflow,
      MOCK_SKILLS,
    )

    expect(prompt).toContain("Existing Flow")
    expect(prompt).toContain('"name": "Existing Flow"')
    expect(prompt).toContain("Add a JTBD audit step before the final output")
    expect(prompt).toContain("Return ONLY the full updated JSON flow object.")
  })
})

describe("parseGeneratedWorkflow", () => {
  it("parses valid workflow JSON", () => {
    const workflow: Workflow = {
      version: 1,
      name: "Test",
      nodes: [
        {
          id: "input-1",
          type: "input",
          position: { x: 0, y: 200 },
          config: {},
        },
        {
          id: "skill-1",
          type: "skill",
          position: { x: 300, y: 200 },
          config: { skillRef: "test", prompt: "Do something" },
        },
        {
          id: "output-1",
          type: "output",
          position: { x: 600, y: 200 },
          config: {},
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "skill-1", type: "default" },
        { id: "e2", source: "skill-1", target: "output-1", type: "default" },
      ],
    }
    const result = parseGeneratedWorkflow(JSON.stringify(workflow))
    expect(result.name).toBe("Test")
    expect(result.nodes).toHaveLength(3)
  })

  it("extracts JSON from markdown code block", () => {
    const workflow: Workflow = {
      version: 1,
      name: "Extracted",
      nodes: [
        { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
        {
          id: "output-1",
          type: "output",
          position: { x: 300, y: 0 },
          config: {},
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "output-1", type: "default" },
      ],
    }
    const output = `Here's the workflow:\n\n\`\`\`json\n${JSON.stringify(workflow, null, 2)}\n\`\`\`\n\nLet me know.`
    const result = parseGeneratedWorkflow(output)
    expect(result.name).toBe("Extracted")
  })

  it("throws on invalid JSON", () => {
    expect(() => parseGeneratedWorkflow("not json at all")).toThrow()
  })

  it("throws on missing nodes/edges", () => {
    expect(() =>
      parseGeneratedWorkflow(JSON.stringify({ foo: "bar" })),
    ).toThrow()
  })

  it("throws on unsupported evaluator config fields", () => {
    const workflow = {
      version: 1,
      name: "Bad evaluator",
      nodes: [
        { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
        {
          id: "eval-1",
          type: "evaluator",
          position: { x: 300, y: 0 },
          config: {
            criteria: "Score",
            threshold: 8,
            maxRetries: 1,
            skillRef: "quality/code-review",
          },
        },
        {
          id: "output-1",
          type: "output",
          position: { x: 600, y: 0 },
          config: {},
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "eval-1", type: "default" },
        { id: "e2", source: "eval-1", target: "output-1", type: "pass" },
      ],
    }

    expect(() => parseGeneratedWorkflow(JSON.stringify(workflow))).toThrow(
      /Unsupported config field "skillRef" for evaluator nodes/,
    )
  })

  it("adds defaults if missing", () => {
    const workflow = {
      version: 1,
      name: "No Defaults",
      nodes: [
        { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
        {
          id: "output-1",
          type: "output",
          position: { x: 300, y: 0 },
          config: {},
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "output-1", type: "default" },
      ],
    }
    const result = parseGeneratedWorkflow(JSON.stringify(workflow))
    expect(result.defaults).toBeDefined()
    expect(result.defaults?.model).toBe("sonnet")
  })
})

describe("normalizeEdges", () => {
  it("maps from/to to source/target", () => {
    const edges = normalizeEdges([{ from: "a", to: "b" }])
    expect(edges[0].source).toBe("a")
    expect(edges[0].target).toBe("b")
  })

  it("auto-generates missing id", () => {
    const edges = normalizeEdges([{ source: "a", target: "b" }])
    expect(edges[0].id).toBe("e-a-b")
  })

  it("defaults missing type to 'default'", () => {
    const edges = normalizeEdges([{ source: "a", target: "b" }])
    expect(edges[0].type).toBe("default")
  })

  it("preserves valid edge type", () => {
    const edges = normalizeEdges([{ source: "a", target: "b", type: "pass" }])
    expect(edges[0].type).toBe("pass")
  })

  it("replaces invalid edge type with default", () => {
    const edges = normalizeEdges([{ source: "a", target: "b", type: "bogus" }])
    expect(edges[0].type).toBe("default")
  })
})

describe("normalizeNodes", () => {
  it("auto-calculates position when missing", () => {
    const nodes = normalizeNodes([
      { id: "n0", type: "skill", config: { skillRef: "x", prompt: "y" } },
      { id: "n1", type: "skill", config: { skillRef: "x", prompt: "y" } },
    ])
    expect(nodes[0].position).toEqual({ x: 0, y: 200 })
    expect(nodes[1].position).toEqual({ x: 300, y: 200 })
  })

  it("preserves existing position", () => {
    const nodes = normalizeNodes([
      { id: "n0", type: "input", position: { x: 50, y: 100 }, config: {} },
    ])
    expect(nodes[0].position).toEqual({ x: 50, y: 100 })
  })

  it("auto-generates missing node id", () => {
    const nodes = normalizeNodes([{ type: "input", config: {} }])
    expect(nodes[0].id).toBe("node-0")
  })

  it("falls back to node.agent for skill config.skillRef", () => {
    const nodes = normalizeNodes([
      { id: "s1", type: "skill", agent: "marketing/writer" },
    ])
    expect(nodes[0].config).toHaveProperty("skillRef", "marketing/writer")
  })

  it("does not infer skillRef from node name", () => {
    const nodes = normalizeNodes([
      {
        id: "s1",
        type: "skill",
        name: "not-a-skill",
        description: "Do the work",
      },
    ])
    expect(nodes[0].config).toHaveProperty("skillRef", "")
  })

  it("falls back to node.description for skill config.prompt", () => {
    const nodes = normalizeNodes([
      { id: "s1", type: "skill", description: "Write a blog post", agent: "x" },
    ])
    expect(nodes[0].config).toHaveProperty("prompt", "Write a blog post")
  })

  it("fills evaluator defaults", () => {
    const nodes = normalizeNodes([
      { id: "e1", type: "evaluator", config: { criteria: "quality" } },
    ])
    expect(nodes[0].config).toEqual({
      criteria: "quality",
      threshold: 7,
      maxRetries: 3,
    })
  })

  it("fills merger default strategy", () => {
    const nodes = normalizeNodes([{ id: "m1", type: "merger" }])
    expect(nodes[0].config).toHaveProperty("strategy", "concatenate")
  })

  it("fills splitter defaults", () => {
    const nodes = normalizeNodes([{ id: "sp1", type: "splitter" }])
    expect(nodes[0].config).toEqual({ strategy: "chunk", maxBranches: 5 })
  })
})

describe("normalizeWorkflow (integration)", () => {
  it("normalizes AI output with from/to edges and missing positions into valid workflow", () => {
    const aiOutput = {
      name: "Content Pipeline",
      nodes: [
        { id: "input-1", type: "input" },
        {
          id: "skill-1",
          type: "skill",
          agent: "marketing/writer",
          description: "Write content",
        },
        { id: "output-1", type: "output" },
      ],
      edges: [
        { from: "input-1", to: "skill-1" },
        { from: "skill-1", to: "output-1" },
      ],
    }
    const result = parseGeneratedWorkflow(JSON.stringify(aiOutput))
    expect(result.nodes).toHaveLength(3)
    expect(result.edges[0].source).toBe("input-1")
    expect(result.edges[0].target).toBe("skill-1")
    expect(result.nodes[1].config).toHaveProperty(
      "skillRef",
      "marketing/writer",
    )
    expect(result.nodes[0].position).toBeDefined()
  })
})
