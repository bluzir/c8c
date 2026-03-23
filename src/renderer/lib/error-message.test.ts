import { describe, it, expect } from "vitest"
import { errorToUserMessage } from "./error-message"

describe("errorToUserMessage", () => {
  it("extracts message from Error instances", () => {
    expect(errorToUserMessage(new Error("boom"))).toBe("boom")
  })

  it("returns string errors as-is", () => {
    expect(errorToUserMessage("something went wrong")).toBe(
      "something went wrong",
    )
  })

  it("strips stack traces from Error.message", () => {
    const error = new Error("boom")
    error.message = "boom\n    at foo.ts:1:1\n    at bar.ts:2:2"
    expect(errorToUserMessage(error)).toBe("boom")
  })

  it("strips multi-line string errors to first line", () => {
    expect(errorToUserMessage("Error: boom\n    at foo.ts:1:1")).toBe(
      "Error: boom",
    )
  })

  it("returns fallback for null", () => {
    expect(errorToUserMessage(null)).toBe("An unexpected error occurred.")
  })

  it("returns fallback for undefined", () => {
    expect(errorToUserMessage(undefined)).toBe("An unexpected error occurred.")
  })

  it("returns fallback for numbers", () => {
    expect(errorToUserMessage(42)).toBe("An unexpected error occurred.")
  })

  it("returns fallback for empty string", () => {
    expect(errorToUserMessage("")).toBe("An unexpected error occurred.")
  })

  it("returns fallback for whitespace-only string", () => {
    expect(errorToUserMessage("   ")).toBe("An unexpected error occurred.")
  })

  it("accepts custom fallback", () => {
    expect(errorToUserMessage(null, "Custom fallback")).toBe("Custom fallback")
  })

  it("returns fallback for Error with empty message", () => {
    expect(errorToUserMessage(new Error(""))).toBe(
      "An unexpected error occurred.",
    )
  })
})
