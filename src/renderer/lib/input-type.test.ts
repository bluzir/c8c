import { describe, expect, it } from "vitest"
import { resolveWorkflowInput } from "./input-type"

describe("resolveWorkflowInput", () => {
  it("requires non-empty input by default", () => {
    const result = resolveWorkflowInput("", {})
    expect(result.valid).toBe(false)
    expect(result.message).toBe("Input is required")
  })

  it("allows empty input when node is optional", () => {
    const result = resolveWorkflowInput("", { required: false })
    expect(result.valid).toBe(true)
    expect(result.value).toBe("")
    expect(result.type).toBe("text")
  })

  it("uses default value when input is empty", () => {
    const result = resolveWorkflowInput("", {
      required: true,
      defaultValue: "https://example.com",
    })
    expect(result.valid).toBe(true)
    expect(result.usedDefault).toBe(true)
    expect(result.type).toBe("url")
    expect(result.value).toBe("https://example.com")
  })

  it("respects forced input type", () => {
    const result = resolveWorkflowInput("https://example.com", {
      inputType: "text",
    })
    expect(result.valid).toBe(true)
    expect(result.type).toBe("text")
  })
})
