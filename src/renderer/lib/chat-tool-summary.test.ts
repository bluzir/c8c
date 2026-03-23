import { describe, expect, it } from "vitest"
import {
  isToolResultError,
  summarizeToolCall,
  summarizeToolResult,
} from "./chat-tool-summary"

describe("summarizeToolCall", () => {
  it("formats browse_category inputs into a compact summary", () => {
    expect(
      summarizeToolCall("browse_category", { path: "uncategorized" }),
    ).toEqual({
      title: "Browse category",
      detail: "uncategorized",
    })
  })

  it("formats add_node inputs with node type and skill ref", () => {
    expect(
      summarizeToolCall("add_node", {
        node: {
          type: "skill",
          config: { skillRef: "qa/reviewer" },
        },
        after_node_id: "input-1",
      }),
    ).toEqual({
      title: "Add skill step",
      detail: "qa/reviewer",
      preview: "After input-1",
    })
  })
})

describe("summarizeToolResult", () => {
  it("formats browse_category output into category counts", () => {
    const summary = summarizeToolResult(
      "browse_category",
      `Category: uncategorized (2 skills)

Subcategories:
  generated/ (2)

Skills:
  - uncategorized/new-skill: No description
  - uncategorized/using-superpowers: Use when starting any conversation`,
    )

    expect(summary.title).toBe("Category uncategorized")
    expect(summary.detail).toBe("2 skills")
    expect(summary.preview).toContain("1 subcategory")
    expect(summary.preview).toContain("uncategorized/new-skill")
  })

  it("formats search_skills output into result counts and names", () => {
    expect(
      summarizeToolResult(
        "search_skills",
        `Found 2 skills matching "validator":
- generated/skill-validator: Validates a skill definition (score: 0.9)
- generated/ajbtd-landing-validator: Validates a landing page (score: 0.8)`,
      ),
    ).toEqual({
      title: "Found 2 skills",
      detail: '"validator"',
      preview: "generated/skill-validator, generated/ajbtd-landing-validator",
    })
  })

  it("formats validate_workflow output into status and counts", () => {
    expect(
      summarizeToolResult(
        "validate_workflow",
        `✗ Workflow has errors:
  ERROR: Missing output

Warnings:
  WARN: Splitter should have a merger

Summary: 2 nodes, 1 edge`,
      ),
    ).toEqual({
      title: "1 error in flow",
      detail: "2 steps, 1 connection",
      preview: "1 warning",
    })
  })
})

describe("isToolResultError", () => {
  it("treats string-prefixed tool failures as errors", () => {
    expect(isToolResultError("Error: edge_id is required")).toBe(true)
    expect(isToolResultError('Unknown tool: "bad_tool"')).toBe(true)
    expect(isToolResultError("✓ Workflow is valid")).toBe(false)
  })
})
