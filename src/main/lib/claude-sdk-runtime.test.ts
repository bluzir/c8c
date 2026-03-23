import { describe, expect, it, vi, beforeEach } from "vitest"

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}))

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: queryMock,
}))

import { drainExecutionHandle } from "./agent-execution"
import {
  createClaudeSdkExecutionHandle,
  parseClaudeSdkLegacyArgs,
} from "./claude-sdk-runtime"

function createMockQuery(messages: unknown[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const message of messages) {
        yield message
      }
    },
    close() {},
  }
}

describe("parseClaudeSdkLegacyArgs", () => {
  it("maps legacy extraArgs into SDK-compatible options", () => {
    expect(
      parseClaudeSdkLegacyArgs([
        "--verbose",
        "--output-format",
        "stream-json",
        "--mcp-config=/tmp/.mcp.json",
        "--disable-slash-commands",
        "--system-prompt",
        "System prompt",
        "--tools",
        "",
      ]),
    ).toEqual({
      extraArgs: {
        "disable-slash-commands": null,
      },
      mcpConfigPath: "/tmp/.mcp.json",
      systemPrompt: "System prompt",
      tools: [],
    })
  })
})

describe("createClaudeSdkExecutionHandle", () => {
  beforeEach(() => {
    queryMock.mockReset()
  })

  it("streams SDK messages through the shared execution handle", async () => {
    queryMock.mockReturnValue(
      createMockQuery([
        {
          type: "system",
          subtype: "init",
          apiKeySource: "user",
          claude_code_version: "2.1.45",
          cwd: "/tmp/project",
          tools: [],
          mcp_servers: [],
          model: "claude-sonnet-4-6",
          permissionMode: "acceptEdits",
          slash_commands: [],
          output_style: "default",
          skills: [],
          plugins: [],
          uuid: "00000000-0000-0000-0000-000000000001",
          session_id: "session-1",
        },
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Hello from SDK" }],
          },
          parent_tool_use_id: null,
          uuid: "00000000-0000-0000-0000-000000000002",
          session_id: "session-1",
        },
        {
          type: "result",
          subtype: "success",
          duration_ms: 18,
          duration_api_ms: 10,
          is_error: false,
          num_turns: 1,
          result: "Hello from SDK",
          stop_reason: "end_turn",
          total_cost_usd: 0,
          usage: {
            input_tokens: 3,
            output_tokens: 4,
          },
          modelUsage: {},
          permission_denials: [],
          uuid: "00000000-0000-0000-0000-000000000003",
          session_id: "session-1",
        },
      ]),
    )

    const handle = await createClaudeSdkExecutionHandle({
      workdir: "/tmp/project",
      prompt: "Say hello",
      maxTurns: 1,
      settingSources: ["project"],
      mcpConfigPath: "/tmp/.mcp.json",
      disableSlashCommands: true,
      disableBuiltInTools: true,
      systemPrompts: ["Custom system prompt"],
      disallowedTools: ["Edit"],
    })

    const entries: string[] = []
    const providerSessions: string[] = []
    const usages: Array<{ inputTokens: number; outputTokens: number }> = []
    const summary = await drainExecutionHandle(handle, {
      onProviderSession: (sessionId) => {
        providerSessions.push(sessionId)
      },
      onLogEntry: (entry) => {
        if (entry.type === "text") {
          entries.push(entry.content)
        }
      },
      onUsage: (usage) => {
        usages.push(usage)
      },
    })

    expect(entries).toEqual(["Hello from SDK"])
    expect(providerSessions).toEqual(["session-1"])
    expect(usages.at(-1)).toEqual({ inputTokens: 3, outputTokens: 4 })
    expect(summary).toMatchObject({
      success: true,
      exitCode: 0,
      providerSessionId: "session-1",
      backend: "claude_sdk",
    })

    expect(queryMock).toHaveBeenCalledTimes(1)
    expect(queryMock.mock.calls[0]?.[0]).toMatchObject({
      prompt: "Say hello",
      options: {
        tools: [],
        settingSources: ["project"],
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append: "Custom system prompt",
        },
        extraArgs: {
          "disable-slash-commands": null,
        },
        persistSession: false,
        includePartialMessages: true,
      },
    })

    const canUseTool = queryMock.mock.calls[0]?.[0]?.options?.canUseTool
    expect(canUseTool).toBeTypeOf("function")
    await expect(
      canUseTool?.(
        "Edit",
        { file_path: "content.md" },
        {
          signal: new AbortController().signal,
          hook_event_name: "PermissionRequest",
          tool_name: "Edit",
          tool_input: { file_path: "content.md" },
        },
      ),
    ).resolves.toEqual({
      behavior: "deny",
      message: "Edit is blocked for this run.",
    })
  })

  it("requests persisted Claude sessions and resumes a prior session when provided", async () => {
    queryMock.mockReturnValue(
      createMockQuery([
        {
          type: "system",
          subtype: "init",
          apiKeySource: "user",
          claude_code_version: "2.1.45",
          cwd: "/tmp/project",
          tools: [],
          mcp_servers: [],
          model: "claude-sonnet-4-6",
          permissionMode: "acceptEdits",
          slash_commands: [],
          output_style: "default",
          skills: [],
          plugins: [],
          uuid: "00000000-0000-0000-0000-000000000021",
          session_id: "session-2",
        },
        {
          type: "result",
          subtype: "success",
          duration_ms: 12,
          duration_api_ms: 12,
          is_error: false,
          num_turns: 1,
          result: "",
          stop_reason: "end_turn",
          total_cost_usd: 0,
          usage: {
            input_tokens: 1,
            output_tokens: 1,
          },
          modelUsage: {},
          permission_denials: [],
          uuid: "00000000-0000-0000-0000-000000000022",
          session_id: "session-2",
        },
      ]),
    )

    const handle = await createClaudeSdkExecutionHandle({
      workdir: "/tmp/project",
      prompt: "Continue the previous task",
      maxTurns: 2,
      persistSession: true,
      resumeSessionId: "prior-session-7",
    })

    const summary = await drainExecutionHandle(handle)

    expect(summary).toMatchObject({
      success: true,
      providerSessionId: "session-2",
    })
    expect(queryMock).toHaveBeenCalledTimes(1)
    expect(queryMock.mock.calls[0]?.[0]).toMatchObject({
      prompt: "Continue the previous task",
      options: {
        persistSession: true,
        resume: "prior-session-7",
      },
    })
  })

  it("emits a heartbeat while Claude is silent for a long thinking stretch", async () => {
    vi.useFakeTimers()
    try {
      queryMock.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield {
            type: "system",
            subtype: "init",
            apiKeySource: "user",
            claude_code_version: "2.1.45",
            cwd: "/tmp/project",
            tools: [],
            mcp_servers: [],
            model: "claude-sonnet-4-6",
            permissionMode: "plan",
            slash_commands: [],
            output_style: "default",
            skills: [],
            plugins: [],
            uuid: "00000000-0000-0000-0000-000000000011",
            session_id: "session-heartbeat",
          }
          await new Promise((resolve) => setTimeout(resolve, 16_000))
          yield {
            type: "result",
            subtype: "success",
            duration_ms: 16_000,
            duration_api_ms: 16_000,
            is_error: false,
            num_turns: 1,
            result: "",
            stop_reason: "end_turn",
            total_cost_usd: 0,
            usage: {
              input_tokens: 0,
              output_tokens: 0,
            },
            modelUsage: {},
            permission_denials: [],
            uuid: "00000000-0000-0000-0000-000000000012",
            session_id: "session-heartbeat",
          }
        },
        close() {},
      })

      const handle = await createClaudeSdkExecutionHandle({
        workdir: "/tmp/project",
        prompt: "Think carefully before responding",
        maxTurns: 1,
      })

      const thinkingEntries: string[] = []
      const summaryPromise = drainExecutionHandle(handle, {
        onLogEntry: (entry) => {
          if (entry.type === "thinking") {
            thinkingEntries.push(entry.content)
          }
        },
      })

      await vi.advanceTimersByTimeAsync(16_000)
      const summary = await summaryPromise

      expect(summary).toMatchObject({
        success: true,
        providerSessionId: "session-heartbeat",
      })
      expect(
        thinkingEntries.some((content) =>
          content.includes("Claude is still working"),
        ),
      ).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
