import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
  buildCodexEnvMock,
  createACPProviderMock,
  cleanupMock,
  execCodexMock,
  getCodexApiKeyMock,
  getSessionIdMock,
  initSessionMock,
  languageModelMock,
  streamTextMock,
} = vi.hoisted(() => ({
  buildCodexEnvMock: vi.fn(),
  createACPProviderMock: vi.fn(),
  cleanupMock: vi.fn(),
  execCodexMock: vi.fn(),
  getCodexApiKeyMock: vi.fn(),
  getSessionIdMock: vi.fn(() => "codex-session-1"),
  initSessionMock: vi.fn(),
  languageModelMock: vi.fn(() => ({ modelId: "gpt-5-codex" })),
  streamTextMock: vi.fn(),
}))

vi.mock("@mcpc-tech/acp-ai-provider", () => ({
  ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME: "acp.acp_provider_agent_dynamic_tool",
  createACPProvider: createACPProviderMock,
}))

vi.mock("ai", () => ({
  streamText: streamTextMock,
}))

vi.mock("./provider-settings", () => ({
  getProviderSettings: vi.fn(async () => ({
    defaultProvider: "claude",
    safetyProfile: "workspace_auto",
    features: { codexProvider: true },
  })),
  getCodexApiKey: getCodexApiKeyMock,
}))

vi.mock("./codex-cli", () => ({
  buildCodexEnv: buildCodexEnvMock,
  execCodex: execCodexMock,
}))

import { drainExecutionHandle } from "./agent-execution"
import {
  canUseCodexAcpExecution,
  createCodexAcpExecutionHandle,
  probeCodexAcpAuthStatus,
} from "./codex-acp-runtime"

describe("canUseCodexAcpExecution", () => {
  it("allows additional directories that already sit under the working directory", () => {
    expect(
      canUseCodexAcpExecution(
        {
          workdir: "/tmp/project",
          addDirs: ["/tmp/project/.claude/skills"],
          executionMode: "edit",
        },
        "workspace_auto",
      ),
    ).toEqual({
      supported: true,
    })
  })

  it("rejects additional directories outside the working directory", () => {
    expect(
      canUseCodexAcpExecution(
        {
          workdir: "/tmp/project",
          addDirs: ["/tmp/extra"],
          executionMode: "edit",
        },
        "workspace_auto",
      ),
    ).toEqual({
      supported: false,
      reason:
        "additional directories outside the working directory are not supported by ACP sessions",
    })
  })

  it("rejects unsupported safety profiles", () => {
    expect(
      canUseCodexAcpExecution(
        {
          executionMode: "edit",
          safetyProfile: "dangerous",
        },
        "workspace_auto",
      ),
    ).toEqual({
      supported: false,
      reason: "unsupported safety profile dangerous",
    })
  })
})

describe("createCodexAcpExecutionHandle", () => {
  const originalLinearToken = process.env.LINEAR_API_TOKEN
  const originalDocsRoot = process.env.DOCS_ROOT
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY
  const originalCodexApiKey = process.env.CODEX_API_KEY
  const tempDirs: string[] = []

  beforeEach(() => {
    buildCodexEnvMock.mockReset()
    cleanupMock.mockReset()
    execCodexMock.mockReset()
    getCodexApiKeyMock.mockReset()
    getSessionIdMock.mockClear()
    initSessionMock.mockReset()
    languageModelMock.mockClear()
    createACPProviderMock.mockReset()
    streamTextMock.mockReset()
    buildCodexEnvMock.mockResolvedValue({ PATH: process.env.PATH || "" })
    execCodexMock.mockResolvedValue({ stdout: "[]", stderr: "" })
    getCodexApiKeyMock.mockResolvedValue(undefined)
    initSessionMock.mockResolvedValue({
      models: {
        currentModelId: "gpt-5.4/xhigh",
        availableModels: [
          { modelId: "gpt-5.4/low" },
          { modelId: "gpt-5.4/medium" },
          { modelId: "gpt-5.4/high" },
          { modelId: "gpt-5.4/xhigh" },
          { modelId: "gpt-5.3-codex/low" },
          { modelId: "gpt-5.3-codex/medium" },
          { modelId: "gpt-5.3-codex/high" },
          { modelId: "gpt-5.3-codex/xhigh" },
          { modelId: "gpt-5.1-codex-max/medium" },
          { modelId: "gpt-5.1-codex-max/high" },
        ],
      },
    })

    createACPProviderMock.mockReturnValue({
      cleanup: cleanupMock,
      getSessionId: getSessionIdMock,
      initSession: initSessionMock,
      languageModel: languageModelMock,
      tools: {},
    })
  })

  afterEach(() => {
    if (originalLinearToken === undefined) {
      delete process.env.LINEAR_API_TOKEN
    } else {
      process.env.LINEAR_API_TOKEN = originalLinearToken
    }

    if (originalDocsRoot === undefined) {
      delete process.env.DOCS_ROOT
    } else {
      process.env.DOCS_ROOT = originalDocsRoot
    }

    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey
    }

    if (originalCodexApiKey === undefined) {
      delete process.env.CODEX_API_KEY
    } else {
      process.env.CODEX_API_KEY = originalCodexApiKey
    }

    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true })
    }
  })

  it("verifies ChatGPT subscription auth through an ACP session probe", async () => {
    const status = await probeCodexAcpAuthStatus()

    expect(status).toMatchObject({
      provider: "codex",
      state: "authenticated",
      authenticated: true,
      authMethod: "chatgpt",
      accountLabel: "ChatGPT subscription",
      apiKeyConfigured: false,
    })
    expect(createACPProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        authMethodId: undefined,
        env: expect.objectContaining({
          ACP_AI_PROVIDER_WARN_MISSING_AUTH_METHOD: "0",
        }),
        session: expect.objectContaining({
          mcpServers: [],
        }),
      }),
    )
    expect(cleanupMock).toHaveBeenCalled()
  })

  it("keeps ChatGPT auth even when ambient API keys exist in the shell environment", async () => {
    buildCodexEnvMock.mockResolvedValue({
      PATH: process.env.PATH || "",
      OPENAI_API_KEY: "ambient-openai-key",
      CODEX_API_KEY: "ambient-codex-key",
    })

    const status = await probeCodexAcpAuthStatus()

    expect(status).toMatchObject({
      provider: "codex",
      state: "authenticated",
      authenticated: true,
      authMethod: "chatgpt",
      accountLabel: "ChatGPT subscription",
    })
    expect(createACPProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        authMethodId: undefined,
        env: expect.not.objectContaining({
          OPENAI_API_KEY: "ambient-openai-key",
          CODEX_API_KEY: "ambient-codex-key",
        }),
      }),
    )
  })

  it("still forces codex-api-key when the app-managed override is configured", async () => {
    getCodexApiKeyMock.mockResolvedValue("app-managed-key")

    const status = await probeCodexAcpAuthStatus()

    expect(status).toMatchObject({
      provider: "codex",
      state: "authenticated",
      authenticated: true,
      authMethod: "api_key",
      accountLabel: "App-managed CODEX_API_KEY",
      apiKeyConfigured: true,
    })
    expect(createACPProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        authMethodId: "codex-api-key",
      }),
    )
  })

  it("marks Codex as unauthenticated when ACP returns an auth-required error", async () => {
    initSessionMock.mockRejectedValue(
      new Error("Authentication required. Run codex login."),
    )

    const status = await probeCodexAcpAuthStatus()

    expect(status).toMatchObject({
      provider: "codex",
      state: "unauthenticated",
      authenticated: false,
    })
    expect(status.error).toContain("Codex CLI is not authenticated")
    expect(cleanupMock).toHaveBeenCalled()
  })

  it("returns an unknown auth state for non-auth ACP transport failures", async () => {
    initSessionMock.mockRejectedValue(
      new Error("HTTP error: 426 Upgrade Required"),
    )

    const status = await probeCodexAcpAuthStatus()

    expect(status).toMatchObject({
      provider: "codex",
      state: "unknown",
      authenticated: false,
    })
    expect(status.error).toContain("HTTP 426 Upgrade Required")
    expect(cleanupMock).toHaveBeenCalled()
  })

  it("maps ACP stream parts into the shared execution handle", async () => {
    execCodexMock.mockResolvedValue({
      stdout: JSON.stringify([
        {
          name: "local-docs",
          enabled: true,
          transport: {
            type: "stdio",
            command: "npx",
            args: [
              "-y",
              "@modelcontextprotocol/server-filesystem",
              "/tmp/project/docs",
            ],
            env: { DOCS_ROOT: "/tmp/project/docs" },
          },
        },
      ]),
      stderr: "",
    })
    streamTextMock.mockReturnValue({
      fullStream: (async function* () {
        yield { type: "text-delta", text: "Hello from ACP", id: "text-1" }
        yield { type: "reasoning-delta", text: "Thinking", id: "think-1" }
        yield {
          type: "tool-call",
          toolCallId: "tool-1",
          toolName: "acp.acp_provider_agent_dynamic_tool",
          input: JSON.stringify({
            toolCallId: "tool-1",
            toolName: "Read file.txt",
            args: {},
          }),
        }
        yield {
          type: "tool-result",
          toolCallId: "tool-1",
          toolName: "acp.acp_provider_agent_dynamic_tool",
          result: { ok: true },
        }
        yield {
          type: "finish-step",
          usage: {
            inputTokens: 3,
            outputTokens: 4,
          },
        }
        yield {
          type: "finish",
          finishReason: "stop",
          totalUsage: {
            inputTokens: 3,
            outputTokens: 4,
          },
        }
      })(),
      totalUsage: Promise.resolve({
        inputTokens: 3,
        outputTokens: 4,
      }),
      finishReason: Promise.resolve("stop"),
    })

    const handle = await createCodexAcpExecutionHandle({
      workdir: "/tmp/project",
      prompt: "Inspect the file",
      model: "gpt-5.4",
    })

    const entries: Array<{
      type: string
      content?: string
      tool?: string
      input?: unknown
      output?: string
    }> = []
    const usages: Array<{ inputTokens: number; outputTokens: number }> = []
    const summary = await drainExecutionHandle(handle, {
      onLogEntry: (entry) => {
        entries.push(entry as any)
      },
      onUsage: (usage) => {
        usages.push(usage)
      },
    })

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text", content: "Hello from ACP" }),
        expect.objectContaining({ type: "thinking", content: "Thinking" }),
        expect.objectContaining({
          type: "tool_use",
          tool: "Read",
          input: { file_path: "file.txt" },
        }),
        expect.objectContaining({
          type: "tool_result",
          tool: "Read",
          output: JSON.stringify({ ok: true }),
        }),
      ]),
    )
    expect(usages.at(-1)).toEqual({ inputTokens: 3, outputTokens: 4 })
    expect(summary).toMatchObject({
      success: true,
      exitCode: 0,
      providerSessionId: "codex-session-1",
      backend: "codex_acp",
    })
    expect(execCodexMock).toHaveBeenCalledWith(["mcp", "list", "--json"], {
      cwd: "/tmp/project",
      timeout: 10_000,
    })
    expect(createACPProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({
          cwd: "/tmp/project",
          mcpServers: [
            expect.objectContaining({
              name: "local-docs",
              command: "npx",
              args: [
                "-y",
                "@modelcontextprotocol/server-filesystem",
                "/tmp/project/docs",
              ],
            }),
          ],
        }),
      }),
    )
    expect(languageModelMock).toHaveBeenCalledWith("gpt-5.4/xhigh", undefined)
    expect(cleanupMock).toHaveBeenCalled()
  })

  it("maps legacy codex aliases onto currently available ACP model ids", async () => {
    streamTextMock.mockReturnValue({
      fullStream: (async function* () {
        yield { type: "finish", finishReason: "stop" }
      })(),
      totalUsage: Promise.resolve({
        inputTokens: 0,
        outputTokens: 0,
      }),
      finishReason: Promise.resolve("stop"),
    })

    const handle = await createCodexAcpExecutionHandle({
      workdir: "/tmp/project",
      prompt: "Inspect the file",
      model: "gpt-5-codex",
    })

    await drainExecutionHandle(handle)

    expect(languageModelMock).toHaveBeenCalledWith(
      "gpt-5.3-codex/xhigh",
      undefined,
    )
  })

  it("skips auth-backed remote MCP servers unless they were explicitly configured for this run", async () => {
    process.env.LINEAR_API_TOKEN = "linear-secret"
    process.env.DOCS_ROOT = "/tmp/project/docs"

    execCodexMock.mockResolvedValue({
      stdout: JSON.stringify([
        {
          name: "docs",
          enabled: true,
          auth_status: "unsupported",
          transport: {
            type: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem"],
            env_vars: ["DOCS_ROOT"],
          },
        },
        {
          name: "linear",
          enabled: true,
          auth_status: "bearer_token",
          transport: {
            type: "http",
            url: "https://mcp.linear.app/sse",
            bearer_token_env_var: "LINEAR_API_TOKEN",
          },
        },
      ]),
      stderr: "",
    })

    streamTextMock.mockReturnValue({
      fullStream: (async function* () {
        yield { type: "finish", finishReason: "stop" }
      })(),
      totalUsage: Promise.resolve({
        inputTokens: 0,
        outputTokens: 0,
      }),
      finishReason: Promise.resolve("stop"),
    })

    const handle = await createCodexAcpExecutionHandle({
      workdir: "/tmp/project",
      prompt: "Inspect the file",
      model: "gpt-5.4",
    })

    await drainExecutionHandle(handle)

    expect(createACPProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({
          mcpServers: [
            expect.objectContaining({
              name: "docs",
              command: "npx",
              env: [{ name: "DOCS_ROOT", value: "/tmp/project/docs" }],
            }),
          ],
        }),
      }),
    )
  })

  it("keeps an auth-backed remote MCP server when it is explicitly configured for the current run", async () => {
    process.env.LINEAR_API_TOKEN = "linear-secret"

    const tempDir = mkdtempSync(join(tmpdir(), "codex-acp-mcp-"))
    tempDirs.push(tempDir)
    const mcpConfigPath = join(tempDir, ".mcp.json")
    writeFileSync(
      mcpConfigPath,
      JSON.stringify({
        mcpServers: {
          linear: {
            type: "http",
            url: "https://mcp.linear.app/sse",
            headers: {
              Authorization: "Bearer linear-secret",
            },
          },
        },
      }),
    )

    execCodexMock.mockResolvedValue({
      stdout: JSON.stringify([
        {
          name: "linear",
          enabled: true,
          auth_status: "unsupported",
          transport: {
            type: "streamable_http",
            url: "https://mcp.linear.app/mcp",
          },
        },
      ]),
      stderr: "",
    })

    streamTextMock.mockReturnValue({
      fullStream: (async function* () {
        yield { type: "finish", finishReason: "stop" }
      })(),
      totalUsage: Promise.resolve({
        inputTokens: 0,
        outputTokens: 0,
      }),
      finishReason: Promise.resolve("stop"),
    })

    const handle = await createCodexAcpExecutionHandle({
      workdir: "/tmp/project",
      prompt: "Inspect the file",
      model: "gpt-5.4",
      mcpConfigPath,
    })

    await drainExecutionHandle(handle)

    expect(createACPProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({
          mcpServers: [
            expect.objectContaining({
              name: "linear",
              type: "http",
              headers: [
                { name: "Authorization", value: "Bearer linear-secret" },
              ],
            }),
          ],
        }),
      }),
    )
  })

  it("skips remote runtime MCP servers with unsupported auth when they were not explicitly configured", async () => {
    execCodexMock.mockResolvedValue({
      stdout: JSON.stringify([
        {
          name: "linear",
          enabled: true,
          auth_status: "unsupported",
          transport: {
            type: "streamable_http",
            url: "https://mcp.linear.app/mcp",
          },
        },
      ]),
      stderr: "",
    })

    streamTextMock.mockReturnValue({
      fullStream: (async function* () {
        yield { type: "finish", finishReason: "stop" }
      })(),
      totalUsage: Promise.resolve({
        inputTokens: 0,
        outputTokens: 0,
      }),
      finishReason: Promise.resolve("stop"),
    })

    const handle = await createCodexAcpExecutionHandle({
      workdir: "/tmp/project",
      prompt: "Inspect the file",
      model: "gpt-5.4",
    })

    await drainExecutionHandle(handle)

    expect(createACPProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({
          mcpServers: [],
        }),
      }),
    )
  })

  it("cleans up the ACP provider only once when abort races with completion", async () => {
    let releaseStream: (() => void) | undefined
    streamTextMock.mockReturnValue({
      fullStream: (async function* () {
        await new Promise<void>((resolve) => {
          releaseStream = resolve
        })
        yield { type: "abort" }
        yield { type: "finish", finishReason: "abort" }
      })(),
      totalUsage: Promise.resolve({
        inputTokens: 0,
        outputTokens: 0,
      }),
      finishReason: Promise.resolve("abort"),
    })

    const handle = await createCodexAcpExecutionHandle({
      workdir: "/tmp/project",
      prompt: "Abort this run",
      model: "gpt-5.4",
    })

    const donePromise = handle.done
    handle.abort()
    releaseStream?.()
    await donePromise

    expect(cleanupMock).toHaveBeenCalledTimes(1)
  })
})
