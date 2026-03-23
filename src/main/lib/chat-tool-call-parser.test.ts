import { describe, expect, it } from "vitest"
import {
  parseToolCallsFromText,
  shouldExecuteToolCallsDirectly,
} from "./chat-tool-call-parser"

describe("parseToolCallsFromText", () => {
  it("parses fenced json tool calls", () => {
    const text = `Adding node now.
\`\`\`json
{"tool":"add_node","call_id":"node-1","input":{"node":{"type":"skill"}}}
\`\`\``

    const calls = parseToolCallsFromText(text)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      tool: "add_node",
      callId: "node-1",
      input: { node: { type: "skill" } },
    })
  })

  it("parses raw json tool calls without fences", () => {
    const text = '{"tool":"validate_workflow","call_id":"v1","input":{}}'
    const calls = parseToolCallsFromText(text)
    expect(calls).toHaveLength(1)
    expect(calls[0].tool).toBe("validate_workflow")
    expect(calls[0].callId).toBe("v1")
  })

  it("parses tool call arrays and fallback call ids", () => {
    const text = `[
      {"tool":"add_node","input":{"node":{"type":"splitter"}}},
      {"tool":"validate_workflow","call_id":"v2","input":{}}
    ]`
    const calls = parseToolCallsFromText(text)
    expect(calls).toHaveLength(2)
    expect(calls[0].callId).toBe("tc-0")
    expect(calls[1].callId).toBe("v2")
  })

  it("parses yaml tool calls", () => {
    const text = `tool: add_node
call_id: n1
input:
  node:
    type: skill
    config:
      skillRef: uncategorized/component-extractor
      prompt: "Extract components"
  after_node_id: input-1`

    const calls = parseToolCallsFromText(text)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      tool: "add_node",
      callId: "n1",
      input: {
        node: {
          type: "skill",
          config: {
            skillRef: "uncategorized/component-extractor",
            prompt: "Extract components",
          },
        },
        after_node_id: "input-1",
      },
    })
  })

  it("parses json with trailing commas", () => {
    const text = `{
      "tool": "validate_workflow",
      "call_id": "v3",
      "input": {},
    }`
    const calls = parseToolCallsFromText(text)
    expect(calls).toHaveLength(1)
    expect(calls[0].tool).toBe("validate_workflow")
    expect(calls[0].callId).toBe("v3")
  })
})

describe("shouldExecuteToolCallsDirectly", () => {
  it("returns true when message explicitly asks to execute tool call", () => {
    const message = `Execute this tool call for workflow editor:
{"tool":"add_node","call_id":"a1","input":{"node":{"type":"skill"}}}`
    const calls = parseToolCallsFromText(message)
    expect(shouldExecuteToolCallsDirectly(message, calls)).toBe(true)
  })

  it("returns true when message is mostly tool call with short suffix", () => {
    const message = `{"tool":"add_node","input":{"node":{"type":"skill"}}}
Do it`
    const calls = parseToolCallsFromText(message)
    expect(shouldExecuteToolCallsDirectly(message, calls)).toBe(true)
  })

  it("returns false when message contains only an example without execution intent", () => {
    const message = `Use this format in responses:
{"tool":"add_node","call_id":"example","input":{"node":{"type":"skill"}}}
Do not run it yet, just explain.`
    const calls = parseToolCallsFromText(message)
    expect(shouldExecuteToolCallsDirectly(message, calls)).toBe(false)
  })
})
