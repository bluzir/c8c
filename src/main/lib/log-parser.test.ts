import { describe, it, expect } from "vitest"
import { parseLogLine, LogParser } from "./log-parser"

describe("parseLogLine", () => {
  // Legacy CLI format
  it("parses legacy thinking message", () => {
    const line = JSON.stringify({
      type: "assistant",
      subtype: "thinking",
      content: "Let me analyze this",
    })
    const entry = parseLogLine(line)
    expect(entry).not.toBeNull()
    expect(entry!.type).toBe("thinking")
    expect((entry as any).content).toBe("Let me analyze this")
  })

  it("parses legacy text message", () => {
    const line = JSON.stringify({
      type: "assistant",
      subtype: "text",
      content: "Here is my response",
    })
    const entry = parseLogLine(line)
    expect(entry).not.toBeNull()
    expect(entry!.type).toBe("text")
  })

  it("parses legacy tool_use", () => {
    const line = JSON.stringify({
      type: "tool_use",
      name: "Read",
      input: { file_path: "/foo/bar.ts" },
    })
    const entry = parseLogLine(line)
    expect(entry).not.toBeNull()
    expect(entry!.type).toBe("tool_use")
    expect((entry as any).tool).toBe("Read")
    expect((entry as any).input).toEqual({ file_path: "/foo/bar.ts" })
  })

  it("parses legacy tool_result", () => {
    const line = JSON.stringify({
      type: "tool_result",
      name: "Read",
      content: "file contents here",
      is_error: false,
    })
    const entry = parseLogLine(line)
    expect(entry).not.toBeNull()
    expect(entry!.type).toBe("tool_result")
    expect((entry as any).status).toBe("success")
  })

  it("parses legacy tool_result with error", () => {
    const line = JSON.stringify({
      type: "tool_result",
      name: "Bash",
      content: "command not found",
      is_error: true,
    })
    const entry = parseLogLine(line)
    expect(entry).not.toBeNull()
    expect((entry as any).status).toBe("error")
  })

  // stream-json format (Messages API style)
  it("parses stream-json content array with text", () => {
    const line = JSON.stringify({
      type: "assistant",
      content: [{ type: "text", text: "Hello world" }],
    })
    const entry = parseLogLine(line)
    expect(entry).not.toBeNull()
    expect(entry!.type).toBe("text")
    expect((entry as any).content).toBe("Hello world")
  })

  it("parses stream-json content_block_start", () => {
    const line = JSON.stringify({
      type: "content_block_start",
      content_block: { type: "tool_use", name: "Bash", input: { command: "ls" } },
    })
    const entry = parseLogLine(line)
    expect(entry).not.toBeNull()
    expect(entry!.type).toBe("tool_use")
    expect((entry as any).tool).toBe("Bash")
  })

  it("parses stream-json message wrapper", () => {
    const line = JSON.stringify({
      type: "result",
      message: { content: [{ type: "text", text: "Done" }] },
    })
    const entry = parseLogLine(line)
    expect(entry).not.toBeNull()
    expect(entry!.type).toBe("text")
    expect((entry as any).content).toBe("Done")
  })

  it("unwraps stream_event wrapper", () => {
    const line = JSON.stringify({
      type: "stream_event",
      event: { type: "assistant", subtype: "text", content: "inner" },
    })
    const entry = parseLogLine(line)
    expect(entry).not.toBeNull()
    expect(entry!.type).toBe("text")
    expect((entry as any).content).toBe("inner")
  })

  it("parses error event", () => {
    const line = JSON.stringify({ type: "error", error: "rate limit" })
    const entry = parseLogLine(line)
    expect(entry).not.toBeNull()
    expect(entry!.type).toBe("error")
    expect((entry as any).content).toBe("rate limit")
  })

  it("parses SDK tool progress updates", () => {
    const line = JSON.stringify({
      type: "tool_progress",
      tool_name: "Read",
      elapsed_time_seconds: 18,
    })
    const entry = parseLogLine(line)
    expect(entry).not.toBeNull()
    expect(entry!.type).toBe("text")
    expect((entry as any).content).toBe("[progress] Read is still running (18s)")
  })

  it("parses SDK task lifecycle updates", () => {
    const started = parseLogLine(JSON.stringify({
      type: "system",
      subtype: "task_started",
      description: "Scan the repository",
    }))
    const completed = parseLogLine(JSON.stringify({
      type: "system",
      subtype: "task_notification",
      status: "completed",
      summary: "Repository scan finished",
    }))

    expect(started).toMatchObject({
      type: "text",
      content: "[progress] Started task: Scan the repository",
    })
    expect(completed).toMatchObject({
      type: "text",
      content: "[progress] Task completed: Repository scan finished",
    })
  })

  it("returns null for unknown line format", () => {
    expect(parseLogLine("not json")).toBeNull()
    expect(parseLogLine(JSON.stringify({ type: "system", msg: "init" }))).toBeNull()
  })
})

describe("LogParser", () => {
  it("accumulates entries from multiple lines", () => {
    const parser = new LogParser()

    parser.feed(JSON.stringify({ type: "assistant", subtype: "thinking", content: "hmm" }))
    parser.feed(JSON.stringify({ type: "assistant", subtype: "text", content: "hello" }))
    parser.feed(JSON.stringify({ type: "tool_use", name: "Read", input: {} }))

    expect(parser.entries).toHaveLength(3)
    expect(parser.entries[0].type).toBe("thinking")
    expect(parser.entries[1].type).toBe("text")
    expect(parser.entries[2].type).toBe("tool_use")
  })

  it("handles mixed valid and invalid lines", () => {
    const parser = new LogParser()
    parser.feed("garbage line")
    parser.feed(JSON.stringify({ type: "assistant", subtype: "text", content: "ok" }))
    parser.feed("")

    expect(parser.entries).toHaveLength(1)
    expect(parser.rawOutput).toContain("garbage line")
  })

  it("tracks raw output", () => {
    const parser = new LogParser()
    parser.feed("line 1")
    parser.feed("line 2")

    expect(parser.rawOutput).toBe("line 1\nline 2")
  })

  it("extracts textContent from text entries only", () => {
    const parser = new LogParser()
    parser.feed(JSON.stringify({ type: "assistant", subtype: "thinking", content: "hmm" }))
    parser.feed(JSON.stringify({ type: "assistant", subtype: "text", content: "Hello " }))
    parser.feed(JSON.stringify({ type: "tool_use", name: "Read", input: {} }))
    parser.feed(JSON.stringify({ type: "assistant", subtype: "text", content: "world" }))

    expect(parser.textContent).toBe("Hello world")
  })

  it("extracts textContent from stream-json content arrays", () => {
    const parser = new LogParser()
    parser.feed(JSON.stringify({
      type: "assistant",
      content: [
        { type: "thinking", thinking: "hmm" },
        { type: "text", text: "Generated " },
      ],
    }))
    parser.feed(JSON.stringify({
      type: "result",
      message: { content: [{ type: "text", text: "workflow" }] },
    }))

    expect(parser.textContent).toBe("Generated workflow")
  })

  it("handles multi-block events expanding to multiple entries", () => {
    const parser = new LogParser()
    parser.feed(JSON.stringify({
      type: "assistant",
      content: [
        { type: "text", text: "hello" },
        { type: "tool_use", name: "Read", input: { file_path: "/a" } },
      ],
    }))

    expect(parser.entries).toHaveLength(2)
    expect(parser.entries[0].type).toBe("text")
    expect(parser.entries[1].type).toBe("tool_use")
  })

  it("maps tool_result tool_use_id back to tool name", () => {
    const parser = new LogParser()

    parser.feed(JSON.stringify({
      type: "content_block_start",
      content_block: {
        type: "tool_use",
        id: "toolu_123",
        name: "Read",
        input: { file_path: "/tmp/a.md" },
      },
    }))

    parser.feed(JSON.stringify({
      type: "content_block_start",
      content_block: {
        type: "tool_result",
        tool_use_id: "toolu_123",
        content: [{ type: "text", text: "ok" }],
      },
    }))

    expect(parser.entries).toHaveLength(2)
    expect(parser.entries[1].type).toBe("tool_result")
    expect((parser.entries[1] as any).tool).toBe("Read")
    expect((parser.entries[1] as any).output).toBe("ok")
    expect((parser.entries[1] as any).status).toBe("success")
  })

  it("falls back to last tool name for tool_result without explicit tool name", () => {
    const parser = new LogParser()

    parser.feed(JSON.stringify({
      type: "tool_use",
      name: "WebSearch",
      input: { query: "electron" },
    }))
    parser.feed(JSON.stringify({
      type: "tool_result",
      content: { summary: "done" },
    }))

    expect(parser.entries).toHaveLength(2)
    expect(parser.entries[1].type).toBe("tool_result")
    expect((parser.entries[1] as any).tool).toBe("WebSearch")
    expect((parser.entries[1] as any).output).toContain("\"summary\":\"done\"")
  })

  it("extracts lines from buffered chunk with newlines", () => {
    const parser = new LogParser()
    const chunk = [
      JSON.stringify({ type: "assistant", subtype: "text", content: "a" }),
      JSON.stringify({ type: "assistant", subtype: "text", content: "b" }),
    ].join("\n") + "\n"

    parser.feedChunk(chunk)
    expect(parser.entries).toHaveLength(2)
  })

  it("tracks usage from message_start (input tokens)", () => {
    const parser = new LogParser()
    parser.feed(JSON.stringify({
      type: "message_start",
      message: { usage: { input_tokens: 150, output_tokens: 0 } },
    }))

    expect(parser.usage.input_tokens).toBe(150)
    expect(parser.usage.output_tokens).toBe(0)
  })

  it("tracks usage from message_delta (output tokens)", () => {
    const parser = new LogParser()
    parser.feed(JSON.stringify({
      type: "message_delta",
      usage: { output_tokens: 320 },
    }))

    expect(parser.usage.output_tokens).toBe(320)
  })

  it("accumulates usage across message_start and message_delta", () => {
    const parser = new LogParser()
    parser.feed(JSON.stringify({
      type: "message_start",
      message: { usage: { input_tokens: 200, output_tokens: 0 } },
    }))
    parser.feed(JSON.stringify({ type: "assistant", subtype: "text", content: "hello" }))
    parser.feed(JSON.stringify({
      type: "message_delta",
      usage: { output_tokens: 450 },
    }))

    expect(parser.usage).toEqual({ input_tokens: 200, output_tokens: 450 })
  })

  it("keeps highest token count when multiple usage events arrive", () => {
    const parser = new LogParser()
    parser.feed(JSON.stringify({
      type: "message_delta",
      usage: { output_tokens: 100 },
    }))
    parser.feed(JSON.stringify({
      type: "message_delta",
      usage: { output_tokens: 250 },
    }))

    expect(parser.usage.output_tokens).toBe(250)
  })

  it("unwraps usage inside stream_event wrapper", () => {
    const parser = new LogParser()
    parser.feed(JSON.stringify({
      type: "stream_event",
      event: { type: "message_delta", usage: { output_tokens: 500 } },
    }))

    expect(parser.usage.output_tokens).toBe(500)
  })

  it("returns zero usage when no usage events present", () => {
    const parser = new LogParser()
    parser.feed(JSON.stringify({ type: "assistant", subtype: "text", content: "hi" }))

    expect(parser.usage).toEqual({ input_tokens: 0, output_tokens: 0 })
  })
})
