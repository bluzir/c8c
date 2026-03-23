import { describe, expect, it } from "vitest"
import { codexServerToInfo } from "./providers/codex-mcp-provider"
import { buildCodexLegacyExecArgs } from "./providers/codex-agent-provider"
import {
  isCodexInteractiveEditorNoise,
  isCodexHeadlessAuthCheckError,
  parseCodexAuth,
  sanitizeCodexAuthError,
  summarizeCodexInteractiveEditorNoise,
} from "./providers/codex-auth"

describe("providers codex auth parsing", () => {
  it("detects ChatGPT subscription auth", () => {
    expect(parseCodexAuth("Logged in using ChatGPT", false)).toMatchObject({
      state: "authenticated",
      authenticated: true,
      authMethod: "chatgpt",
      accountLabel: "ChatGPT",
    })
  })

  it("recognizes non-interactive raw-mode login status failures", () => {
    const output =
      "Sign in with ChatGPT ERROR Raw mode is not supported on the current process.stdin"
    expect(isCodexHeadlessAuthCheckError(output)).toBe(true)
    expect(sanitizeCodexAuthError(output)).toContain(
      "could not report auth status in non-interactive mode",
    )
    expect(parseCodexAuth(output, false)).toMatchObject({
      state: "unknown",
      authenticated: false,
    })
  })

  it("recognizes legacy exec stderr when codex opens instructions.md in vi", () => {
    const output = [
      "Vim: Warning: Output is not to a terminal",
      "E325: ATTENTION",
      'Swap file "~/.codex/.instructions.md.swp" already exists!',
      'While opening file "/Users/vlad/.codex/instructions.md"',
    ].join("\n")

    expect(isCodexInteractiveEditorNoise(output)).toBe(true)
    expect(summarizeCodexInteractiveEditorNoise(output)).toContain(
      "interactive editor",
    )
    expect(summarizeCodexInteractiveEditorNoise(output)).toContain(
      ".instructions.md.swp",
    )
  })
})

describe("providers codex MCP mapping", () => {
  it("maps streamable_http servers to http MCP metadata", () => {
    expect(
      codexServerToInfo({
        name: "linear",
        enabled: true,
        transport: {
          type: "streamable_http",
          url: "https://mcp.example.com",
          http_headers: { Authorization: "Bearer token" },
        },
      }),
    ).toEqual({
      name: "linear",
      provider: "codex",
      scope: "user",
      type: "http",
      command: undefined,
      args: undefined,
      url: "https://mcp.example.com",
      env: undefined,
      headers: { Authorization: "Bearer token" },
      disabled: false,
    })
  })
})

describe("providers codex legacy exec args", () => {
  it("builds prompt, safety flags, model and add-dir arguments", () => {
    const result = buildCodexLegacyExecArgs(
      {
        prompt: "Implement the feature",
        workdir: "/tmp/project",
        model: "gpt-5.4",
        addDirs: ["/tmp/project/docs", ""],
        systemPrompts: ["Follow repo conventions."],
        allowedTools: ["Read", "Edit"],
        disallowedTools: ["Bash"],
        extraArgs: ["--config", "profile=test"],
      },
      "workspace_auto",
    )

    expect(result.safetyProfile).toBe("workspace_auto")
    expect(result.args).toEqual([
      "exec",
      "--json",
      "--ephemeral",
      "--color",
      "never",
      "--skip-git-repo-check",
      "-C",
      "/tmp/project",
      "--sandbox",
      "workspace-write",
      "--ask-for-approval",
      "on-request",
      "-m",
      "gpt-5.4",
      "--add-dir",
      "/tmp/project/docs",
      "--config",
      "profile=test",
      "Follow repo conventions.\n\nAllowed tools: Read, Edit.\n\nDisallowed tools: Bash. Never use them.\n\nImplement the feature",
    ])
  })

  it("forces safe_readonly for plan mode", () => {
    const result = buildCodexLegacyExecArgs(
      {
        prompt: "Plan the migration",
        workdir: "/tmp/project",
        executionMode: "plan",
      },
      "dangerous",
    )

    expect(result.safetyProfile).toBe("safe_readonly")
    expect(result.args).toContain("read-only")
    expect(result.args).toContain("Plan the migration")
  })
})
