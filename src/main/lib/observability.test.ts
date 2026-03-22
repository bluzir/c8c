import { describe, it, expect } from "vitest"
import { classifyError, estimateCost, collectMetrics, buildNodeMeta } from "./observability"
import { LogParser } from "./log-parser"

describe("classifyError", () => {
  it("returns timeout when timedOut flag is set", () => {
    expect(classifyError(new Error("something"), true)).toBe("timeout")
  })

  it("classifies exit code errors as tool", () => {
    expect(classifyError(new Error("Skill node failed: exit code 1"), false)).toBe("tool")
  })

  it("classifies null exit code (CLI not found) as tool", () => {
    expect(classifyError(new Error("Skill node failed: Could not start Claude CLI — check that 'claude' is in your PATH and accessible"), false)).toBe("tool")
  })

  it("classifies ENOENT as tool", () => {
    expect(classifyError(new Error("ENOENT: no such file"), false)).toBe("tool")
  })

  it("classifies spawn errors as tool", () => {
    expect(classifyError(new Error("spawn EACCES"), false)).toBe("tool")
  })

  it("classifies unparseable output as model", () => {
    expect(classifyError(new Error("Evaluator output unparseable"), false)).toBe("model")
  })

  it("classifies empty output as model", () => {
    expect(classifyError(new Error("empty output from Claude"), false)).toBe("model")
  })

  it("classifies budget exceeded as policy", () => {
    expect(classifyError(new Error("budget exceeded"), false)).toBe("policy")
  })

  it("classifies rate limit as policy", () => {
    expect(classifyError(new Error("rate limit hit"), false)).toBe("policy")
  })

  it("classifies usage limit as policy", () => {
    expect(classifyError(new Error("Claude usage limit reached"), false)).toBe("policy")
  })

  it("classifies skill errors that include usage limit as policy", () => {
    expect(
      classifyError(
        new Error("Skill node failed: Claude usage limit reached: exceeded your usage limit"),
        false,
      ),
    ).toBe("policy")
  })

  it("returns unknown for unrecognized errors", () => {
    expect(classifyError(new Error("something unexpected"), false)).toBe("unknown")
  })

  it("handles non-Error values", () => {
    expect(classifyError("string error with exit code", false)).toBe("tool")
    expect(classifyError(42, false)).toBe("unknown")
  })
})

describe("estimateCost", () => {
  it("calculates sonnet cost", () => {
    // 1000 input tokens * $3/1M + 500 output tokens * $15/1M
    const cost = estimateCost("sonnet", 1000, 500)
    expect(cost).toBeCloseTo(0.0105, 4)
  })

  it("calculates opus cost", () => {
    const cost = estimateCost("opus", 1000, 500)
    // 1000 * 15/1M + 500 * 75/1M = 0.015 + 0.0375 = 0.0525
    expect(cost).toBeCloseTo(0.0525, 4)
  })

  it("calculates haiku cost", () => {
    const cost = estimateCost("haiku", 1000, 500)
    // 1000 * 0.25/1M + 500 * 1.25/1M
    expect(cost).toBeCloseTo(0.000875, 6)
  })

  it("falls back to sonnet pricing for unknown models", () => {
    const cost = estimateCost("unknown-model", 1000, 500)
    expect(cost).toBeCloseTo(estimateCost("sonnet", 1000, 500), 6)
  })

  it("returns 0 for zero tokens", () => {
    expect(estimateCost("sonnet", 0, 0)).toBe(0)
  })
})

describe("collectMetrics", () => {
  it("extracts usage from log parser", () => {
    const parser = new LogParser()
    parser.feed(JSON.stringify({
      type: "message_start",
      message: { usage: { input_tokens: 200, output_tokens: 0 } },
    }))
    parser.feed(JSON.stringify({
      type: "message_delta",
      usage: { output_tokens: 300 },
    }))

    const metrics = collectMetrics(parser, Date.now() - 1500)
    expect(metrics.tokens_in).toBe(200)
    expect(metrics.tokens_out).toBe(300)
    expect(metrics.cost_usd).toBe(0) // caller sets this
    expect(metrics.latency_ms).toBeGreaterThanOrEqual(1400) // ~1500ms with some tolerance
    expect(metrics.latency_ms).toBeLessThan(3000)
  })

  it("returns zeros when no usage events", () => {
    const parser = new LogParser()
    parser.feed(JSON.stringify({ type: "assistant", subtype: "text", content: "hi" }))

    const metrics = collectMetrics(parser, Date.now() - 100)
    expect(metrics.tokens_in).toBe(0)
    expect(metrics.tokens_out).toBe(0)
  })
})

describe("buildNodeMeta", () => {
  it("returns model_id and prompt_hash", () => {
    const meta = buildNodeMeta("Write a blog post", "sonnet")
    expect(meta.model_id).toBe("sonnet")
    expect(meta.prompt_hash).toHaveLength(16)
    expect(meta.skill_ref).toBeUndefined()
  })

  it("includes skill_ref when provided", () => {
    const meta = buildNodeMeta("Write content", "opus", "marketing/writer", "claude_sdk")
    expect(meta.model_id).toBe("opus")
    expect(meta.skill_ref).toBe("marketing/writer")
    expect(meta.backend).toBe("claude_sdk")
  })

  it("includes provider_session_id when provided", () => {
    const meta = buildNodeMeta("Resume this review", "sonnet", undefined, "claude_sdk", "session-123")
    expect(meta.provider_session_id).toBe("session-123")
  })

  it("produces deterministic hash for same prompt", () => {
    const a = buildNodeMeta("same prompt", "sonnet")
    const b = buildNodeMeta("same prompt", "sonnet")
    expect(a.prompt_hash).toBe(b.prompt_hash)
  })

  it("produces different hash for different prompts", () => {
    const a = buildNodeMeta("prompt A", "sonnet")
    const b = buildNodeMeta("prompt B", "sonnet")
    expect(a.prompt_hash).not.toBe(b.prompt_hash)
  })
})
