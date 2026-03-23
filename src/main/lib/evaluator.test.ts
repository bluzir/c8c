import { describe, it, expect } from "vitest"
import { parseEvaluatorOutput, buildEvaluatorPrompt } from "./evaluator"
import type { LogEntry } from "@shared/types"

describe("parseEvaluatorOutput", () => {
  it("parses clean JSON response", () => {
    const logs: LogEntry[] = [
      {
        type: "text",
        content: '{"score": 8, "reason": "Clear and engaging"}',
        timestamp: 1,
      },
    ]
    const result = parseEvaluatorOutput(logs)
    expect(result).toEqual({ score: 8, reason: "Clear and engaging" })
  })

  it("extracts JSON embedded in text", () => {
    const logs: LogEntry[] = [
      {
        type: "text",
        content:
          'Here is my evaluation:\n{"score": 6, "reason": "Needs work on CTA"}',
        timestamp: 1,
      },
    ]
    const result = parseEvaluatorOutput(logs)
    expect(result).toEqual({ score: 6, reason: "Needs work on CTA" })
  })

  it("joins multiple text entries", () => {
    const logs: LogEntry[] = [
      { type: "text", content: '{"score": 9, ', timestamp: 1 },
      { type: "text", content: '"reason": "Excellent clarity"}', timestamp: 2 },
    ]
    const result = parseEvaluatorOutput(logs)
    expect(result).toEqual({ score: 9, reason: "Excellent clarity" })
  })

  it("ignores thinking and tool entries", () => {
    const logs: LogEntry[] = [
      { type: "thinking", content: "Let me analyze...", timestamp: 1 },
      { type: "tool_use", tool: "Read", input: {}, timestamp: 2 },
      {
        type: "text",
        content: '{"score": 7, "reason": "Good but CTA weak"}',
        timestamp: 3,
      },
    ]
    const result = parseEvaluatorOutput(logs)
    expect(result).toEqual({ score: 7, reason: "Good but CTA weak" })
  })

  it("returns null when no JSON found", () => {
    const logs: LogEntry[] = [
      { type: "text", content: "I think the content is good.", timestamp: 1 },
    ]
    expect(parseEvaluatorOutput(logs)).toBeNull()
  })

  it("returns null for empty logs", () => {
    expect(parseEvaluatorOutput([])).toBeNull()
  })

  it("handles score as float", () => {
    const logs: LogEntry[] = [
      {
        type: "text",
        content: '{"score": 7.5, "reason": "Almost there"}',
        timestamp: 1,
      },
    ]
    const result = parseEvaluatorOutput(logs)
    expect(result?.score).toBe(7.5)
  })

  it("handles braces in reason string", () => {
    const logs: LogEntry[] = [
      {
        type: "text",
        content: '{"score": 7, "reason": "Missing {intro} section"}',
        timestamp: 1,
      },
    ]
    const result = parseEvaluatorOutput(logs)
    expect(result).toEqual({ score: 7, reason: "Missing {intro} section" })
  })

  it("handles nested braces and complex reason", () => {
    const logs: LogEntry[] = [
      {
        type: "text",
        content:
          '{"score": 5, "reason": "Lacks {CTA} and {hero} blocks, needs {more detail}"}',
        timestamp: 1,
      },
    ]
    const result = parseEvaluatorOutput(logs)
    expect(result).toEqual({
      score: 5,
      reason: "Lacks {CTA} and {hero} blocks, needs {more detail}",
    })
  })

  it("parses fix_instructions", () => {
    const logs: LogEntry[] = [
      {
        type: "text",
        content:
          '{"score": 5, "reason": "Weak hook", "fix_instructions": "Rewrite opening with a statistic"}',
        timestamp: 1,
      },
    ]
    const result = parseEvaluatorOutput(logs)
    expect(result).toEqual({
      score: 5,
      reason: "Weak hook",
      fix_instructions: "Rewrite opening with a statistic",
    })
  })

  it("parses criteria breakdown", () => {
    const json = JSON.stringify({
      score: 7,
      reason: "Good structure but weak hook",
      fix_instructions: "Improve the opening",
      criteria: [
        { id: "accuracy", score: 9 },
        { id: "structure", score: 8 },
        { id: "hook", score: 4 },
      ],
    })
    const logs: LogEntry[] = [{ type: "text", content: json, timestamp: 1 }]
    const result = parseEvaluatorOutput(logs)
    expect(result?.criteria).toEqual([
      { id: "accuracy", score: 9 },
      { id: "structure", score: 8 },
      { id: "hook", score: 4 },
    ])
    expect(result?.fix_instructions).toBe("Improve the opening")
  })

  it("parses criteria with weights", () => {
    const json = JSON.stringify({
      score: 6,
      reason: "Needs improvement",
      criteria: [
        { id: "clarity", score: 8, weight: 0.5 },
        { id: "depth", score: 4, weight: 0.5 },
      ],
    })
    const logs: LogEntry[] = [{ type: "text", content: json, timestamp: 1 }]
    const result = parseEvaluatorOutput(logs)
    expect(result?.criteria).toEqual([
      { id: "clarity", score: 8, weight: 0.5 },
      { id: "depth", score: 4, weight: 0.5 },
    ])
  })

  it("ignores malformed criteria entries", () => {
    const json = JSON.stringify({
      score: 7,
      reason: "OK",
      criteria: [
        { id: "valid", score: 8 },
        { score: 5 }, // missing id
        { id: "also-valid", score: 6 },
        "not-an-object",
      ],
    })
    const logs: LogEntry[] = [{ type: "text", content: json, timestamp: 1 }]
    const result = parseEvaluatorOutput(logs)
    expect(result?.criteria).toEqual([
      { id: "valid", score: 8 },
      { id: "also-valid", score: 6 },
    ])
  })

  it("omits empty fix_instructions", () => {
    const logs: LogEntry[] = [
      {
        type: "text",
        content: '{"score": 9, "reason": "Great", "fix_instructions": ""}',
        timestamp: 1,
      },
    ]
    const result = parseEvaluatorOutput(logs)
    expect(result?.fix_instructions).toBeUndefined()
  })

  it("omits criteria when array is empty", () => {
    const logs: LogEntry[] = [
      {
        type: "text",
        content: '{"score": 8, "reason": "Good", "criteria": []}',
        timestamp: 1,
      },
    ]
    const result = parseEvaluatorOutput(logs)
    expect(result?.criteria).toBeUndefined()
  })

  it("uses the last valid JSON object when multiple are present", () => {
    const logs: LogEntry[] = [
      {
        type: "text",
        content:
          'draft {"score": 3, "reason": "first"}\nfinal {"score": 8, "reason": "second"}',
        timestamp: 1,
      },
    ]
    const result = parseEvaluatorOutput(logs)
    expect(result).toEqual({ score: 8, reason: "second" })
  })

  it("handles escaped quotes and braces inside reason strings", () => {
    const logs: LogEntry[] = [
      {
        type: "text",
        content:
          '{"score": 7, "reason": "Use \\"{benefit}\\" headline for better CTR"}',
        timestamp: 1,
      },
    ]
    const result = parseEvaluatorOutput(logs)
    expect(result).toEqual({
      score: 7,
      reason: 'Use "{benefit}" headline for better CTR',
    })
  })
})

describe("buildEvaluatorPrompt", () => {
  it("includes criteria and content in the prompt", () => {
    const prompt = buildEvaluatorPrompt("Be concise", "Some content here")
    expect(prompt).toContain("CRITERIA:")
    expect(prompt).toContain("Be concise")
    expect(prompt).toContain("CONTENT TO EVALUATE:")
    expect(prompt).toContain("Some content here")
    expect(prompt).toContain('"score"')
  })

  it("asks for fix_instructions and criteria in the prompt", () => {
    const prompt = buildEvaluatorPrompt("Quality check", "Content")
    expect(prompt).toContain("fix_instructions")
    expect(prompt).toContain("criteria")
  })

  it("includes evaluator skill context when provided", () => {
    const prompt = buildEvaluatorPrompt(
      "Quality check",
      "Content",
      "### Skill: infostyle\nFacts over emotion.",
    )
    expect(prompt).toContain("EVALUATION SKILL CONTEXT:")
    expect(prompt).toContain("Skill: infostyle")
    expect(prompt).toContain("Facts over emotion.")
  })
})
