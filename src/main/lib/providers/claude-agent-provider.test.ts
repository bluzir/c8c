import { beforeEach, describe, expect, it, vi } from "vitest"

const { spawnClaudeMock, createClaudeSdkExecutionHandleMock } = vi.hoisted(
  () => ({
    spawnClaudeMock: vi.fn(),
    createClaudeSdkExecutionHandleMock: vi.fn(),
  }),
)

vi.mock("@claude-tools/runner", () => ({
  spawnClaude: (...args: unknown[]) => spawnClaudeMock(...args),
}))

vi.mock("../claude-sdk-runtime", () => ({
  createClaudeSdkExecutionHandle: (...args: unknown[]) =>
    createClaudeSdkExecutionHandleMock(...args),
}))

vi.mock("../mcp-config", () => ({
  buildProviderExtraArgs: vi.fn(() => []),
}))

vi.mock("../claude-cli", () => ({
  execClaude: vi.fn(),
  findClaudeExecutable: vi.fn(() => "/usr/local/bin/claude"),
}))

vi.mock("../claude-subscription", () => ({
  getClaudeCodeSubscriptionStatus: vi.fn(),
}))

describe("ClaudeAgentProvider legacy fallback", () => {
  beforeEach(() => {
    spawnClaudeMock.mockReset()
    createClaudeSdkExecutionHandleMock.mockReset()
  })

  it("forwards resume and persistence flags when SDK execution falls back to CLI", async () => {
    createClaudeSdkExecutionHandleMock.mockRejectedValue(
      new Error("sdk unavailable"),
    )
    spawnClaudeMock.mockResolvedValue({
      success: true,
      exitCode: 0,
      signal: null,
      killed: false,
      aborted: false,
      durationMs: 25,
    })

    const { ClaudeAgentProvider } = await import("./claude-agent-provider")
    const provider = new ClaudeAgentProvider()
    const handle = await provider.executeTask({
      workdir: "/tmp/project",
      prompt: "Continue the existing review",
      resumeSessionId: "saved-session-7",
      persistSession: false,
    })
    const summary = await handle.done

    expect(summary).toMatchObject({
      success: true,
      backend: "claude_cli",
      providerSessionId: null,
    })
    expect(spawnClaudeMock).toHaveBeenCalledTimes(1)
    expect(spawnClaudeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extraArgs: expect.arrayContaining([
          "--resume",
          "saved-session-7",
          "--no-session-persistence",
        ]),
      }),
    )
  })
})
