import { describe, expect, it } from "vitest"
import { buildClaudeArgs } from "../args.js"

describe("buildClaudeArgs", () => {
  it("produces minimal args for prompt-only", () => {
    const args = buildClaudeArgs({ prompt: "hello" })
    expect(args).toEqual(["--print", "hello"])
  })

  it("adds model flag", () => {
    const args = buildClaudeArgs({ prompt: "hi", model: "opus" })
    expect(args).toContain("--model")
    expect(args[args.indexOf("--model") + 1]).toBe("opus")
  })

  it("adds max-turns flag", () => {
    const args = buildClaudeArgs({ prompt: "hi", maxTurns: 50 })
    expect(args).toContain("--max-turns")
    expect(args[args.indexOf("--max-turns") + 1]).toBe("50")
  })

  it("adds permission mode flag", () => {
    const args = buildClaudeArgs({
      prompt: "hi",
      permissionMode: "bypassPermissions",
    })
    expect(args).toContain("--permission-mode")
    expect(args[args.indexOf("--permission-mode") + 1]).toBe(
      "bypassPermissions",
    )
  })

  it("joins system prompts with double newline", () => {
    const args = buildClaudeArgs({
      prompt: "hi",
      systemPrompts: ["You are helpful.", "Be concise."],
    })
    expect(args).toContain("--append-system-prompt")
    expect(args[args.indexOf("--append-system-prompt") + 1]).toBe(
      "You are helpful.\n\nBe concise.",
    )
  })

  it("keeps prompt before variadic flags", () => {
    const prompt = "do the thing"
    const args = buildClaudeArgs({
      prompt,
      addDirs: ["/tmp/dir1", "/tmp/dir2"],
      allowedTools: ["Read", "Write"],
    })

    const promptIdx = args.indexOf(prompt)
    const addDirIdx = args.indexOf("--add-dir")
    const allowedToolsIdx = args.indexOf("--allowedTools")

    expect(promptIdx).toBeGreaterThan(-1)
    expect(addDirIdx).toBeGreaterThan(promptIdx)
    expect(allowedToolsIdx).toBeGreaterThan(promptIdx)
  })

  it("joins allowedTools with comma", () => {
    const args = buildClaudeArgs({
      prompt: "hi",
      allowedTools: ["Read", "Write", "Bash"],
    })
    expect(args[args.indexOf("--allowedTools") + 1]).toBe("Read,Write,Bash")
  })

  it("spreads addDirs after --add-dir", () => {
    const args = buildClaudeArgs({
      prompt: "hi",
      addDirs: ["/a", "/b"],
    })
    const idx = args.indexOf("--add-dir")
    expect(args[idx + 1]).toBe("/a")
    expect(args[idx + 2]).toBe("/b")
  })

  it("passes through extraArgs", () => {
    const args = buildClaudeArgs({
      prompt: "hi",
      extraArgs: ["--verbose", "--output-format", "stream-json"],
    })
    expect(args).toContain("--verbose")
    expect(args).toContain("--output-format")
    expect(args).toContain("stream-json")
  })

  it("places extraArgs before prompt", () => {
    const prompt = "hi"
    const args = buildClaudeArgs({
      prompt,
      extraArgs: ["--verbose"],
    })
    const verboseIdx = args.indexOf("--verbose")
    const promptIdx = args.indexOf(prompt)
    expect(verboseIdx).toBeLessThan(promptIdx)
  })

  it("empty systemPrompts array produces no --append-system-prompt flag", () => {
    const args = buildClaudeArgs({ prompt: "hi", systemPrompts: [] })
    expect(args).not.toContain("--append-system-prompt")
  })

  it("empty allowedTools array produces no --allowedTools flag", () => {
    const args = buildClaudeArgs({ prompt: "hi", allowedTools: [] })
    expect(args).not.toContain("--allowedTools")
  })

  it("empty addDirs array produces no --add-dir flag", () => {
    const args = buildClaudeArgs({ prompt: "hi", addDirs: [] })
    expect(args).not.toContain("--add-dir")
  })

  it("all options combined produce correct ordering", () => {
    const prompt = "do stuff"
    const args = buildClaudeArgs({
      prompt,
      model: "sonnet",
      maxTurns: 10,
      permissionMode: "bypassPermissions",
      systemPrompts: ["Be brief."],
      extraArgs: ["--output-format", "stream-json"],
      addDirs: ["/tmp/a"],
      allowedTools: ["Read", "Bash"],
    })

    // --print is first
    expect(args[0]).toBe("--print")

    // prompt comes before variadic flags
    const promptIdx = args.indexOf(prompt)
    const addDirIdx = args.indexOf("--add-dir")
    const allowedToolsIdx = args.indexOf("--allowedTools")
    expect(promptIdx).toBeLessThan(addDirIdx)
    expect(promptIdx).toBeLessThan(allowedToolsIdx)

    // extraArgs come before prompt
    const outputFormatIdx = args.indexOf("--output-format")
    expect(outputFormatIdx).toBeLessThan(promptIdx)

    // model, max-turns, permission-mode come before prompt
    expect(args.indexOf("--model")).toBeLessThan(promptIdx)
    expect(args.indexOf("--max-turns")).toBeLessThan(promptIdx)
    expect(args.indexOf("--permission-mode")).toBeLessThan(promptIdx)
  })

  it("maxTurns of 0 does not add --max-turns flag (falsy check)", () => {
    // The implementation uses `if (options.maxTurns)` which is falsy for 0
    const args = buildClaudeArgs({ prompt: "hi", maxTurns: 0 })
    expect(args).not.toContain("--max-turns")
  })
})
