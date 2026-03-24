import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock electron before importing workflow-runner
vi.mock("electron", () => ({
  BrowserWindow: class {},
}))

const { spawnClaudeMock } = vi.hoisted(() => ({
  spawnClaudeMock: vi.fn(),
}))

// Mock spawnClaude before importing workflow-runner
vi.mock("@claude-tools/runner", () => ({
  spawnClaude: spawnClaudeMock,
}))

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: ({ prompt, options }: any) => {
    const messages: any[] = [
      {
        type: "system",
        subtype: "init",
        apiKeySource: "user",
        claude_code_version: "2.1.45",
        cwd: options?.cwd || "/tmp",
        tools: [],
        mcp_servers: [],
        model: options?.model || "sonnet",
        permissionMode: options?.permissionMode || "default",
        slash_commands: [],
        output_style: "default",
        skills: [],
        plugins: [],
        uuid: "00000000-0000-0000-0000-000000000001",
        session_id: "sdk-test-session",
      },
    ]

    const run = Promise.resolve(
      spawnClaudeMock({
        workdir: options?.cwd,
        prompt,
        model: options?.model,
        maxTurns: options?.maxTurns,
        persistSession: options?.persistSession,
        resumeSessionId: options?.resume,
        tools: options?.tools,
        permissionMode: options?.permissionMode,
        systemPrompts:
          typeof options?.systemPrompt === "string"
            ? [options.systemPrompt]
            : options?.systemPrompt?.append
              ? [options.systemPrompt.append]
              : [],
        allowedTools: options?.allowedTools,
        disallowedTools: options?.disallowedTools,
        addDirs: options?.additionalDirectories,
        extraEnv: options?.env,
        abortSignal: options?.abortController?.signal,
        onStdout: (data: Buffer) => {
          for (const line of data.toString().split(/\r?\n/)) {
            const trimmed = line.trim()
            if (!trimmed) continue
            messages.push(JSON.parse(trimmed))
          }
        },
        onStderr: (data: Buffer) => {
          options?.stderr?.(data.toString())
        },
      }),
    ).then((result: any) => {
      messages.push({
        type: "result",
        subtype: result.success ? "success" : "error_during_execution",
        duration_ms: result.durationMs || 0,
        duration_api_ms: result.durationMs || 0,
        is_error: !result.success,
        num_turns: 1,
        result: "",
        stop_reason: result.success ? "end_turn" : null,
        total_cost_usd: 0,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
        },
        modelUsage: {},
        permission_denials: [],
        errors: result.success
          ? []
          : [
              result.exitCode === null
                ? "Could not start Claude CLI"
                : `exit code ${String(result.exitCode)}`,
            ],
        uuid: "00000000-0000-0000-0000-000000000002",
        session_id: "sdk-test-session",
      })
    })

    return {
      async *[Symbol.asyncIterator]() {
        yield messages[0]
        await run
        for (const message of messages.slice(1)) {
          yield message
        }
      },
      close() {},
    }
  },
}))

// Mock fs operations
vi.mock("node:fs/promises", () => ({
  mkdtemp: vi.fn(() => Promise.resolve("/tmp/test-ws")),
  writeFile: vi.fn(() => Promise.resolve()),
  appendFile: vi.fn(() => Promise.resolve()),
  rename: vi.fn(() => Promise.resolve()),
  unlink: vi.fn(() => Promise.resolve()),
  mkdir: vi.fn(() => Promise.resolve()),
  readdir: vi.fn(() => Promise.resolve([])),
  stat: vi.fn(() =>
    Promise.resolve({
      size: 0,
      mtimeMs: 0,
      isDirectory: () => false,
      isFile: () => true,
    }),
  ),
  readFile: vi.fn(() => Promise.resolve("improved content")),
}))

// Mock os
vi.mock("node:os", () => ({
  tmpdir: vi.fn(() => "/tmp"),
  homedir: vi.fn(() => "/tmp"),
}))

// Mock telemetry service
vi.mock("./telemetry/service", () => ({
  trackTelemetryEvent: vi.fn(() => Promise.resolve()),
}))

import { spawnClaude } from "@claude-tools/runner"
import { readFile, writeFile } from "node:fs/promises"
import type {
  Workflow,
  WorkflowEvent,
  NodeState,
  SkillNodeConfig,
} from "@shared/types"

const mockedSpawn = vi.mocked(spawnClaude)
const mockedReadFile = vi.mocked(readFile)
const mockedWriteFile = vi.mocked(writeFile)

// Evaluator loop workflow: input → skill → evaluator → output (with fail loop)
const EVAL_WORKFLOW: Workflow = {
  version: 1,
  name: "Eval Loop",
  defaults: { model: "sonnet", maxTurns: 10 },
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
    {
      id: "skill-1",
      type: "skill",
      position: { x: 300, y: 0 },
      config: { skillRef: "test/writer", prompt: "Write content" },
    },
    {
      id: "eval-1",
      type: "evaluator",
      position: { x: 600, y: 0 },
      config: {
        criteria: "Score clarity 1-10",
        threshold: 8,
        maxRetries: 3,
        retryFrom: "skill-1",
      },
    },
    { id: "output-1", type: "output", position: { x: 900, y: 0 }, config: {} },
  ],
  edges: [
    { id: "e1", source: "input-1", target: "skill-1", type: "default" },
    { id: "e2", source: "skill-1", target: "eval-1", type: "default" },
    { id: "e3", source: "eval-1", target: "output-1", type: "pass" },
    { id: "e4", source: "eval-1", target: "skill-1", type: "fail" },
  ],
}

const SPLITTER_RECOVERY_WORKFLOW: Workflow = {
  version: 1,
  name: "Splitter Recovery",
  defaults: { model: "sonnet", maxTurns: 10 },
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
    {
      id: "splitter-1",
      type: "splitter",
      position: { x: 200, y: 0 },
      config: {
        strategy: "Split research into independent aspects",
        maxBranches: 8,
      },
    },
    {
      id: "skill-1",
      type: "skill",
      position: { x: 400, y: 0 },
      config: {
        skillRef: "test/researcher",
        prompt: "Research this aspect thoroughly.",
      },
    },
    {
      id: "merger-1",
      type: "merger",
      position: { x: 700, y: 0 },
      config: { strategy: "concatenate" },
    },
    { id: "output-1", type: "output", position: { x: 900, y: 0 }, config: {} },
  ],
  edges: [
    { id: "e1", source: "input-1", target: "splitter-1", type: "default" },
    { id: "e2", source: "splitter-1", target: "skill-1", type: "default" },
    { id: "e3", source: "skill-1", target: "merger-1", type: "default" },
    { id: "e4", source: "merger-1", target: "output-1", type: "default" },
  ],
}

const SIMPLE_SKILL_WORKFLOW: Workflow = {
  version: 1,
  name: "Simple Skill Output",
  defaults: { model: "sonnet", maxTurns: 10 },
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
    {
      id: "skill-1",
      type: "skill",
      position: { x: 300, y: 0 },
      config: {
        skillRef: "test/extractor",
        prompt: "Extract scenarios into content file",
      },
    },
    { id: "output-1", type: "output", position: { x: 600, y: 0 }, config: {} },
  ],
  edges: [
    { id: "e1", source: "input-1", target: "skill-1", type: "default" },
    { id: "e2", source: "skill-1", target: "output-1", type: "default" },
  ],
}

const PROMPT_ONLY_SKILL_WORKFLOW: Workflow = {
  version: 1,
  name: "Prompt Only Skill",
  defaults: { model: "sonnet", maxTurns: 10 },
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
    {
      id: "skill-1",
      type: "skill",
      position: { x: 300, y: 0 },
      config: { prompt: "Audit and improve the provided copy." },
    },
    { id: "output-1", type: "output", position: { x: 600, y: 0 }, config: {} },
  ],
  edges: [
    { id: "e1", source: "input-1", target: "skill-1", type: "default" },
    { id: "e2", source: "skill-1", target: "output-1", type: "default" },
  ],
}

const RERUN_EVAL_ONLY_WORKFLOW: Workflow = {
  version: 1,
  name: "Rerun Eval Only",
  defaults: { model: "sonnet", maxTurns: 10 },
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
    {
      id: "skill-1",
      type: "skill",
      position: { x: 300, y: 0 },
      config: { skillRef: "test/writer", prompt: "Write content" },
    },
    {
      id: "eval-1",
      type: "evaluator",
      position: { x: 600, y: 0 },
      config: { criteria: "Score clarity 1-10", threshold: 8, maxRetries: 0 },
    },
    { id: "output-1", type: "output", position: { x: 900, y: 0 }, config: {} },
  ],
  edges: [
    { id: "e1", source: "input-1", target: "skill-1", type: "default" },
    { id: "e2", source: "skill-1", target: "eval-1", type: "default" },
    { id: "e3", source: "eval-1", target: "output-1", type: "pass" },
  ],
}

const QUEUED_FAN_OUT_WORKFLOW: Workflow = {
  version: 1,
  name: "Queued Fan-out",
  defaults: { model: "sonnet", maxTurns: 10, maxParallel: 10 },
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
    {
      id: "splitter-1",
      type: "splitter",
      position: { x: 200, y: 0 },
      config: { strategy: "Split into four parallel checks", maxBranches: 4 },
    },
    {
      id: "skill-1",
      type: "skill",
      position: { x: 400, y: 0 },
      config: { skillRef: "test/researcher", prompt: "Inspect this branch." },
    },
    {
      id: "merger-1",
      type: "merger",
      position: { x: 700, y: 0 },
      config: { strategy: "concatenate" },
    },
    { id: "output-1", type: "output", position: { x: 900, y: 0 }, config: {} },
  ],
  edges: [
    { id: "e1", source: "input-1", target: "splitter-1", type: "default" },
    { id: "e2", source: "splitter-1", target: "skill-1", type: "default" },
    { id: "e3", source: "skill-1", target: "merger-1", type: "default" },
    { id: "e4", source: "merger-1", target: "output-1", type: "default" },
  ],
}

function withSkillRuntime(
  workflow: Workflow,
  runtime: Record<string, unknown>,
): Workflow {
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) => {
      if (node.id !== "skill-1" || node.type !== "skill") return node
      return {
        ...node,
        config: {
          ...(node.config as SkillNodeConfig),
          runtime: runtime as SkillNodeConfig["runtime"],
        },
      }
    }),
  }
}

async function waitForCondition(
  predicate: () => boolean,
  message: string,
  attempts = 200,
): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error(message)
}

describe("workflow-runner evaluator loop", () => {
  let events: WorkflowEvent[]
  let mockWindow: any

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    events = []
    mockWindow = {
      isDestroyed: () => false,
      isFocused: () => true,
      on: vi.fn(),
      removeListener: vi.fn(),
      webContents: {
        send: (_channel: string, event: WorkflowEvent) => events.push(event),
      },
    }
  })

  it("passes on first attempt when score meets threshold", async () => {
    let callCount = 0
    mockedSpawn.mockImplementation(async (opts: any) => {
      callCount++
      if (callCount === 1) {
        // Skill node — produces text
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"Great content"}\n',
          ),
        )
      } else if (callCount === 2) {
        // Evaluator — score 9, passes threshold of 8
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"{\\"score\\": 9, \\"reason\\": \\"Excellent\\"}"}\n',
          ),
        )
      }
      return {
        success: true,
        exitCode: 0,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-1",
      EVAL_WORKFLOW,
      { type: "text", value: "test input" },
      mockWindow,
    )

    const evalResults = events.filter((e) => e.type === "eval-result")
    expect(evalResults).toHaveLength(1)
    expect((evalResults[0] as any).passed).toBe(true)
    expect((evalResults[0] as any).score).toBe(9)

    const runDone = events.find((e) => e.type === "run-done")
    expect(runDone).toBeDefined()
    expect((runDone as any).status).toBe("completed")

    // spawnClaude called twice: once for skill, once for evaluator
    expect(mockedSpawn).toHaveBeenCalledTimes(2)
  })

  it("prefers content file output when stdout is a progress summary", async () => {
    mockedSpawn.mockImplementation(async (opts: any) => {
      opts.onStdout?.(
        Buffer.from(
          '{"type":"assistant","subtype":"text","content":"Now I have a complete picture of the product. Writing the output to the content file."}\n',
        ),
      )
      return {
        success: true,
        exitCode: 0,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-skill-output",
      SIMPLE_SKILL_WORKFLOW,
      { type: "text", value: "input" },
      mockWindow,
    )

    const skillDone = events.find(
      (e) => e.type === "node-done" && (e as any).nodeId === "skill-1",
    ) as any
    expect(skillDone).toBeDefined()
    expect(skillDone.output.content).toBe("improved content")
    expect(skillDone.output.metadata.output_source).toBe("content_file")
  })

  it("preserves diagnostic summaries through evaluator and output nodes", async () => {
    mockedReadFile.mockResolvedValue("input")

    const diagnosticReport = [
      "---",
      "diagnostic_summary:",
      "  headline: Critical UX debt blocks reliable execution.",
      "  tone: danger",
      "  severity_counts:",
      "    critical: 2",
      "    high: 3",
      "  top_findings:",
      "    - id: approval-dialog-unmount",
      "      label: Approval dialog unmounts on navigation",
      "      detail: Users can lose a live approval request when they leave the workflow view.",
      "      severity: danger",
      "---",
      "",
      "# Audit report",
      "Body",
    ].join("\n")

    let callCount = 0
    mockedSpawn.mockImplementation(async (opts: any) => {
      callCount += 1
      if (callCount === 1) {
        opts.onStdout?.(
          Buffer.from(
            `${JSON.stringify({ type: "assistant", subtype: "text", content: diagnosticReport })}\n`,
          ),
        )
      } else {
        opts.onStdout?.(
          Buffer.from(
            `${JSON.stringify({ type: "assistant", subtype: "text", content: '{"score": 9, "reason": "Excellent"}' })}\n`,
          ),
        )
      }
      return {
        success: true,
        exitCode: 0,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-diagnostic-summary",
      EVAL_WORKFLOW,
      { type: "text", value: "input" },
      mockWindow,
    )

    const outputDone = events.find(
      (event) =>
        event.type === "node-done" && (event as any).nodeId === "output-1",
    ) as any

    expect(outputDone).toBeDefined()
    expect(outputDone.output.content).toBe("# Audit report\nBody")
    expect(outputDone.output.metadata.diagnostic_summary).toMatchObject({
      headline: "Critical UX debt blocks reliable execution.",
      tone: "danger",
      severityCounts: {
        critical: 2,
        high: 3,
      },
      topFindings: [
        {
          id: "approval-dialog-unmount",
          label: "Approval dialog unmounts on navigation",
        },
      ],
    })
  })

  it("persists Claude provider session ids while a node is still running", async () => {
    mockedSpawn.mockImplementation(
      (opts: any) =>
        new Promise((resolve) => {
          opts.abortSignal?.addEventListener(
            "abort",
            () => {
              resolve({
                success: false,
                exitCode: 0,
                signal: null,
                killed: true,
                aborted: true,
                durationMs: 100,
              })
            },
            { once: true },
          )
        }),
    )

    const { runWorkflow, cancelWorkflowRun } = await import("./workflow-runner")
    const runPromise = runWorkflow(
      "run-mid-session-persist",
      SIMPLE_SKILL_WORKFLOW,
      { type: "text", value: "input" },
      mockWindow,
    )

    await waitForCondition(
      () =>
        mockedWriteFile.mock.calls.some(
          (call) =>
            typeof call[1] === "string" &&
            call[1].includes('"provider_session_id": "sdk-test-session"'),
        ),
      "expected run-state persistence with provider session id",
    )

    expect(cancelWorkflowRun("run-mid-session-persist")).toBe(true)
    await runPromise
  })

  it("completes prompt-only skill nodes without requiring skillRef", async () => {
    mockedSpawn.mockImplementation(async (opts: any) => {
      opts.onStdout?.(
        Buffer.from(
          '{"type":"assistant","subtype":"text","content":"Great content"}\n',
        ),
      )
      return {
        success: true,
        exitCode: 0,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-prompt-only-skill",
      PROMPT_ONLY_SKILL_WORKFLOW,
      { type: "text", value: "input" },
      mockWindow,
    )

    const skillDone = events.find(
      (e) => e.type === "node-done" && (e as any).nodeId === "skill-1",
    ) as any
    const runDone = events.find((e) => e.type === "run-done") as any

    expect(skillDone).toBeDefined()
    expect(skillDone.output.content).toBe("Great content")
    expect(skillDone.output.metadata.artifact_label).toBe("Skill 1 output")
    expect(runDone).toBeDefined()
    expect(runDone.status).toBe("completed")
  })

  it("injects skill file instructions into skill-node prompts", async () => {
    const prompts: string[] = []
    mockedReadFile.mockImplementation(async (path: any) => {
      const target = String(path)
      if (target === "/tmp/gstack/review/SKILL.md") {
        return "---\nname: review\ndescription: built-in review\n---\n# Review\nFollow this checklist exactly.\n"
      }
      return "improved content"
    })
    mockedSpawn.mockImplementation(async (opts: any) => {
      prompts.push(String(opts.prompt || ""))
      opts.onStdout?.(
        Buffer.from(
          '{"type":"assistant","subtype":"text","content":"Great content"}\n',
        ),
      )
      return {
        success: true,
        exitCode: 0,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const workflowWithSkillFile: Workflow = {
      ...SIMPLE_SKILL_WORKFLOW,
      nodes: SIMPLE_SKILL_WORKFLOW.nodes.map((node) =>
        node.id === "skill-1" && node.type === "skill"
          ? {
              ...node,
              config: {
                ...(node.config as SkillNodeConfig),
                prompt: "Review the supplied diff.",
                skillPaths: ["/tmp/gstack/review/SKILL.md"],
              },
            }
          : node,
      ),
    }

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-skill-file-context",
      workflowWithSkillFile,
      { type: "text", value: "input" },
      mockWindow,
    )

    expect(prompts[0]).toContain("Skill context (methodology reference")
    expect(prompts[0]).toContain("Skill root directory: /tmp/gstack/review")
    expect(prompts[0]).toContain(
      "Sibling gstack skill pack directory: /tmp/gstack",
    )
    expect(prompts[0]).toContain(
      'Resolve ".claude/skills/review/..." or "review/..." references under "/tmp/gstack/review".',
    )
    expect(prompts[0]).toContain("Follow this checklist exactly.")
    expect(prompts[0]).toContain("Review the supplied diff.")
    expect((mockedSpawn.mock.calls[0]?.[0] as any)?.addDirs).toEqual([
      "/tmp/gstack/review",
    ])
  })

  it("keeps best-effort skill output when skill process fails", async () => {
    mockedSpawn.mockImplementation(async (opts: any) => {
      opts.onStdout?.(
        Buffer.from(
          '{"type":"assistant","subtype":"text","content":"Now I have a complete picture of the product. Writing the output to the content file."}\n',
        ),
      )
      return {
        success: false,
        exitCode: 1,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-skill-fail-partial",
      SIMPLE_SKILL_WORKFLOW,
      { type: "text", value: "input" },
      mockWindow,
    )

    const skillDone = events.find(
      (e) => e.type === "node-done" && (e as any).nodeId === "skill-1",
    ) as any
    const skillError = events.find(
      (e) => e.type === "node-error" && (e as any).nodeId === "skill-1",
    ) as any
    const outputDone = events.find(
      (e) => e.type === "node-done" && (e as any).nodeId === "output-1",
    ) as any
    const runDone = events.find((e) => e.type === "run-done") as any

    expect(skillDone).toBeDefined()
    expect(skillDone.output.content).toBe("improved content")
    expect(skillDone.output.metadata.output_source).toBe("content_file")
    expect(skillDone.output.metadata.partial_on_error).toBe(true)
    expect(skillError).toBeDefined()
    expect(outputDone).toBeDefined()
    expect(outputDone.output.content).toBe("")
    expect(runDone).toBeDefined()
    expect(runDone.status).toBe("failed")
  })

  it("continues after max turns when the skill already applied edits", async () => {
    mockedReadFile.mockImplementation(async (path: any) => {
      const target = String(path)
      if (target.includes("content-skill-1.md")) return "input"
      return "improved content"
    })

    mockedSpawn.mockImplementation(async (opts: any) => {
      opts.onStdout?.(
        Buffer.from(
          '{"type":"tool_use","name":"Edit","input":{"file_path":"src/app.tsx"}}\n' +
            '{"type":"tool_result","name":"Edit","content":"Applied edit","is_error":false}\n' +
            '{"type":"error","error":"error_max_turns: maximum number of turns reached"}\n',
        ),
      )
      return {
        success: false,
        exitCode: 1,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-skill-max-turns-partial",
      SIMPLE_SKILL_WORKFLOW,
      { type: "text", value: "input" },
      mockWindow,
    )

    const skillDone = events.find(
      (e) => e.type === "node-done" && (e as any).nodeId === "skill-1",
    ) as any
    const skillError = events.find(
      (e) => e.type === "node-error" && (e as any).nodeId === "skill-1",
    ) as any
    const recoveryLog = events.find(
      (e) =>
        e.type === "node-log" &&
        (e as any).nodeId === "skill-1" &&
        String((e as any).entry?.content || "").includes("[runtime-recovery]"),
    ) as any
    const runDone = events.find((e) => e.type === "run-done") as any

    expect(skillDone).toBeDefined()
    expect(skillDone.output.content).toBe("input")
    expect(skillDone.output.metadata.output_source).toBe("input_fallback")
    expect(skillDone.output.metadata.partial_on_error).toBe(true)
    expect(skillDone.output.metadata.error_policy_applied).toBe("continue")
    expect(skillError).toBeUndefined()
    expect(recoveryLog).toBeDefined()
    expect(runDone).toBeDefined()
    expect(runDone.status).toBe("completed")
  })

  it("reports descriptive error when CLI spawn fails (exitCode null)", async () => {
    mockedSpawn.mockImplementation(async () => {
      return {
        success: false,
        exitCode: null,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 0,
      }
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-spawn-fail",
      SIMPLE_SKILL_WORKFLOW,
      { type: "text", value: "input" },
      mockWindow,
    )

    const skillError = events.find(
      (e) => e.type === "node-error" && (e as any).nodeId === "skill-1",
    ) as any
    expect(skillError).toBeDefined()
    expect(skillError.error).toContain("Could not start Claude CLI")

    const runDone = events.find((e) => e.type === "run-done") as any
    expect(runDone).toBeDefined()
    expect(runDone.status).toBe("failed")
  })

  it("uses mirrored outputs/content-*.md when primary content file is unchanged", async () => {
    mockedReadFile.mockImplementation(async (path: any) => {
      const p = String(path)
      if (p.includes("/outputs/content-skill-1.md")) {
        return JSON.stringify([{ id: 1, title: "Scenario A" }], null, 2)
      }
      if (p.endsWith("content-skill-1.md")) {
        return "input"
      }
      return "improved content"
    })

    mockedSpawn.mockImplementation(async (opts: any) => {
      opts.onStdout?.(
        Buffer.from(
          '{"type":"assistant","subtype":"text","content":"Now I have enough context. Writing output to file."}\n',
        ),
      )
      return {
        success: true,
        exitCode: 0,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-mirrored-content",
      SIMPLE_SKILL_WORKFLOW,
      { type: "text", value: "input" },
      mockWindow,
    )

    const skillDone = events.find(
      (e) => e.type === "node-done" && (e as any).nodeId === "skill-1",
    ) as any
    expect(skillDone).toBeDefined()
    expect(skillDone.output.content).toContain('"Scenario A"')
    expect(skillDone.output.metadata.output_source).toBe("content_file")
  })

  it("sanitizes invalid surrogate pairs before spawning Claude", async () => {
    const workflowWithBrokenPrompt: Workflow = {
      ...SIMPLE_SKILL_WORKFLOW,
      nodes: SIMPLE_SKILL_WORKFLOW.nodes.map((node) =>
        node.id === "skill-1"
          ? {
              ...node,
              config: {
                ...(node.config as any),
                prompt: "Analyze malformed char: \uD83D",
              },
            }
          : node,
      ),
    }
    const prompts: string[] = []

    mockedSpawn.mockImplementation(async (opts: any) => {
      prompts.push(String(opts.prompt || ""))
      opts.onStdout?.(
        Buffer.from('{"type":"assistant","subtype":"text","content":"ok"}\n'),
      )
      return {
        success: true,
        exitCode: 0,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-sanitized-prompt",
      workflowWithBrokenPrompt,
      { type: "text", value: "input" },
      mockWindow,
    )

    expect(prompts.length).toBeGreaterThan(0)
    expect(prompts[0]).toContain("Analyze malformed char: \uFFFD")
    expect(/[\uD800-\uDFFF]/.test(prompts[0])).toBe(false)
  })

  it("retries when score below threshold, then passes", async () => {
    let spawnCount = 0
    mockedSpawn.mockImplementation(async (opts: any) => {
      spawnCount++
      if (spawnCount === 1 || spawnCount === 3) {
        // Skill calls (initial + retry)
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"content"}\n',
          ),
        )
      } else if (spawnCount === 2) {
        // First eval — fails with score 5 (below threshold 8)
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"{\\"score\\": 5, \\"reason\\": \\"Needs work\\"}"}\n',
          ),
        )
      } else if (spawnCount === 4) {
        // Second eval — passes with score 9
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"{\\"score\\": 9, \\"reason\\": \\"Great now\\"}"}\n',
          ),
        )
      }
      return {
        success: true,
        exitCode: 0,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-2",
      EVAL_WORKFLOW,
      { type: "text", value: "test" },
      mockWindow,
    )

    const evalResults = events.filter((e) => e.type === "eval-result")
    expect(evalResults).toHaveLength(2)
    expect((evalResults[0] as any).passed).toBe(false)
    expect((evalResults[0] as any).score).toBe(5)
    expect((evalResults[1] as any).passed).toBe(true)
    expect((evalResults[1] as any).score).toBe(9)

    // Skill should have been called twice (initial + retry)
    const skillStarts = events.filter(
      (e) => e.type === "node-start" && (e as any).nodeId === "skill-1",
    )
    expect(skillStarts.length).toBe(2)

    // spawnClaude called 4 times: skill, eval(fail), skill(retry), eval(pass)
    expect(mockedSpawn).toHaveBeenCalledTimes(4)

    const runDone = events.find((e) => e.type === "run-done")
    expect(runDone).toBeDefined()
    expect((runDone as any).status).toBe("completed")
  })

  it("passes fix_instructions in retry prompt and emits enriched eval-result", async () => {
    let spawnCount = 0
    const capturedPrompts: string[] = []
    mockedSpawn.mockImplementation(async (opts: any) => {
      spawnCount++
      capturedPrompts.push(opts.prompt || "")
      if (spawnCount === 1 || spawnCount === 3) {
        // Skill calls
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"content"}\n',
          ),
        )
      } else if (spawnCount === 2) {
        // First eval — fails with fix_instructions + criteria
        const evalJson = JSON.stringify({
          score: 4,
          reason: "Weak hook",
          fix_instructions:
            "Rewrite opening paragraph with a surprising statistic",
          criteria: [
            { id: "accuracy", score: 8 },
            { id: "hook", score: 2 },
          ],
        })
        opts.onStdout?.(
          Buffer.from(
            `{"type":"assistant","subtype":"text","content":${JSON.stringify(evalJson)}}\n`,
          ),
        )
      } else if (spawnCount === 4) {
        // Second eval — passes
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"{\\"score\\": 9, \\"reason\\": \\"Great\\"}"}\n',
          ),
        )
      }
      return {
        success: true,
        exitCode: 0,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-fix",
      EVAL_WORKFLOW,
      { type: "text", value: "test" },
      mockWindow,
    )

    // Verify enriched eval-result event
    const evalResults = events.filter((e) => e.type === "eval-result")
    expect(evalResults).toHaveLength(2)
    const firstEval = evalResults[0] as any
    expect(firstEval.fix_instructions).toBe(
      "Rewrite opening paragraph with a surprising statistic",
    )
    expect(firstEval.criteria).toEqual([
      { id: "accuracy", score: 8 },
      { id: "hook", score: 2 },
    ])

    // Verify retry prompt (3rd spawn = retry skill) includes fix_instructions
    const retryPrompt = capturedPrompts[2] // 0-indexed, 3rd call
    expect(retryPrompt).toContain(
      "Rewrite opening paragraph with a surprising statistic",
    )
    expect(retryPrompt).toContain("What to fix")
  })

  it("resumes the prior Claude session when evaluator retries the same skill node", async () => {
    let spawnCount = 0
    mockedSpawn.mockImplementation(async (opts: any) => {
      spawnCount += 1
      if (spawnCount === 1 || spawnCount === 3) {
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"content"}\n',
          ),
        )
      } else if (spawnCount === 2) {
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"{\\"score\\": 5, \\"reason\\": \\"Needs work\\"}"}\n',
          ),
        )
      } else {
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"{\\"score\\": 9, \\"reason\\": \\"Looks good\\"}"}\n',
          ),
        )
      }
      return {
        success: true,
        exitCode: 0,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-retry-resume",
      EVAL_WORKFLOW,
      { type: "text", value: "test" },
      mockWindow,
    )

    expect(mockedSpawn).toHaveBeenCalledTimes(4)
    expect(mockedSpawn.mock.calls[0]?.[0]).toMatchObject({
      persistSession: true,
      resumeSessionId: undefined,
    })
    expect(mockedSpawn.mock.calls[2]?.[0]).toMatchObject({
      persistSession: true,
      resumeSessionId: "sdk-test-session",
    })
  })

  it("exhausts max retries and waits for override", async () => {
    let spawnCount = 0
    mockedSpawn.mockImplementation(async (opts: any) => {
      spawnCount++
      if (spawnCount % 2 === 1) {
        // Skill calls: 1, 3, 5
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"content"}\n',
          ),
        )
      } else {
        // Eval calls: 2, 4, 6 — all fail with score 4
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"{\\"score\\": 4, \\"reason\\": \\"Still bad\\"}"}\n',
          ),
        )
      }
      return {
        success: true,
        exitCode: 0,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const { runWorkflow, resolveEvalOverride } =
      await import("./workflow-runner")

    // Auto-override when eval-exhausted event arrives
    const originalSend = mockWindow.webContents.send
    mockWindow.webContents.send = (_channel: string, event: WorkflowEvent) => {
      events.push(event)
      if (event.type === "eval-exhausted") {
        // Simulate user clicking "Override" after a tick
        setTimeout(() => resolveEvalOverride(event.runId, event.nodeId), 10)
      }
    }

    await runWorkflow(
      "run-3",
      EVAL_WORKFLOW,
      { type: "text", value: "test" },
      mockWindow,
    )

    mockWindow.webContents.send = originalSend

    const evalResults = events.filter((e) => e.type === "eval-result")
    // maxRetries=3: first attempt + 2 retries = 3 eval attempts
    expect(evalResults.length).toBe(3)
    expect(evalResults.every((e: any) => !e.passed)).toBe(true)

    // Override event should have been emitted
    const overrideEvent = events.find((e) => e.type === "eval-overridden")
    expect(overrideEvent).toBeDefined()

    // Run should complete after override
    const runDone = events.find((e) => e.type === "run-done")
    expect(runDone).toBeDefined()
    expect((runDone as any).status).toBe("completed")
  })
})

describe("workflow-runner splitter recovery", () => {
  let events: WorkflowEvent[]
  let mockWindow: any

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    events = []
    mockWindow = {
      isDestroyed: () => false,
      isFocused: () => true,
      on: vi.fn(),
      removeListener: vi.fn(),
      webContents: {
        send: (_channel: string, event: WorkflowEvent) => events.push(event),
      },
    }
  })

  it("retries splitter on degenerate output and expands multiple branches", async () => {
    mockedSpawn.mockImplementation(async (opts: any) => {
      const prompt = String(opts.prompt || "")
      if (prompt.includes("Your previous splitter response was invalid")) {
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"[{\\"key\\":\\"aspect-a\\",\\"content\\":\\"Research vector embeddings for structured tables\\"},{\\"key\\":\\"aspect-b\\",\\"content\\":\\"Research hybrid retrieval with schema-aware filters\\"}]"}\n',
          ),
        )
      } else if (prompt.includes("You are an intelligent task decomposer")) {
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"You are a task decomposer. Return ONLY a JSON array. Create 4-6 independent research aspects."}\n',
          ),
        )
      } else {
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"branch complete"}\n',
          ),
        )
      }
      return {
        success: true,
        exitCode: 0,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-splitter-recovery",
      SPLITTER_RECOVERY_WORKFLOW,
      {
        type: "text",
        value:
          "Research best practices for RAG over structured company datasets.",
      },
      mockWindow,
    )

    const spawnedPrompts = mockedSpawn.mock.calls.map((call) =>
      String((call[0] as any)?.prompt || ""),
    )
    const splitterInitialCalls = spawnedPrompts.filter((p) =>
      p.includes("You are an intelligent task decomposer"),
    )
    const splitterRecoveryCalls = spawnedPrompts.filter((p) =>
      p.includes("Your previous splitter response was invalid"),
    )
    expect(splitterInitialCalls).toHaveLength(1)
    expect(splitterRecoveryCalls).toHaveLength(1)

    const expandEvent = events.find((e) => e.type === "nodes-expanded") as any
    expect(expandEvent).toBeDefined()
    expect(expandEvent.newNodeIds.length).toBe(2)

    const runDone = events.find((e) => e.type === "run-done")
    expect(runDone).toBeDefined()
    expect((runDone as any).status).toBe("completed")
  })

  it("still calls AI splitter for list-like structured input", async () => {
    mockedSpawn.mockImplementation(async (opts: any) => {
      const prompt = String(opts.prompt || "")
      if (prompt.includes("You are an intelligent task decomposer")) {
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"[{\\"key\\":\\"generation-flow\\",\\"content\\":\\"Analyze generation flow expectations\\"},{\\"key\\":\\"template-flow\\",\\"content\\":\\"Analyze template flow expectations\\"}]"}\n',
          ),
        )
      } else {
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"branch complete"}\n',
          ),
        )
      }
      return {
        success: true,
        exitCode: 0,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-splitter-structured-ai",
      SPLITTER_RECOVERY_WORKFLOW,
      {
        type: "text",
        value:
          "1. Entry Point\n2. Step-by-Step Sequence\n3. Expectation Arc Summary",
      },
      mockWindow,
    )

    const spawnedPrompts = mockedSpawn.mock.calls.map((call) =>
      String((call[0] as any)?.prompt || ""),
    )
    const splitterInitialCalls = spawnedPrompts.filter((p) =>
      p.includes("You are an intelligent task decomposer"),
    )
    const structuredBypassLog = events.find(
      (e) =>
        e.type === "node-log" &&
        (e as any).nodeId === "splitter-1" &&
        String((e as any).entry?.content || "").includes(
          "using structured input directly",
        ),
    )

    expect(splitterInitialCalls).toHaveLength(1)
    expect(structuredBypassLog).toBeUndefined()
    expect(events.find((e) => e.type === "run-done")).toBeDefined()
  })

  it("falls back to heuristic split when splitter Claude call fails", async () => {
    mockedSpawn.mockImplementation(async (opts: any) => {
      const prompt = String(opts.prompt || "")
      if (
        prompt.includes("You are an intelligent task decomposer") ||
        prompt.includes("Your previous splitter response was invalid")
      ) {
        return {
          success: false,
          exitCode: null,
          signal: null,
          killed: false,
          aborted: false,
          durationMs: 100,
        }
      }

      opts.onStdout?.(
        Buffer.from(
          '{"type":"assistant","subtype":"text","content":"branch complete"}\n',
        ),
      )
      return {
        success: true,
        exitCode: 0,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-splitter-null-exit-fallback",
      SPLITTER_RECOVERY_WORKFLOW,
      {
        type: "text",
        value:
          "Research the onboarding funnel and identify friction points that cause drop-off during the first session. Focus on the signup form, the project creation wizard, and the initial tutorial overlay.\n\nSeparately, audit the execution pipeline for performance bottlenecks. Measure cold-start latency, node-to-node handoff overhead, and memory consumption under concurrent branch expansion.",
      },
      mockWindow,
    )

    const runDone = events.find((e) => e.type === "run-done") as any
    const splitterError = events.find(
      (e) => e.type === "node-error" && (e as any).nodeId === "splitter-1",
    )
    const expandEvent = events.find((e) => e.type === "nodes-expanded") as any
    const splitterFallbackLog = events.find(
      (e) =>
        e.type === "node-log" &&
        (e as any).nodeId === "splitter-1" &&
        String((e as any).entry?.content || "").includes("falling back"),
    )

    expect(splitterError).toBeUndefined()
    expect(splitterFallbackLog).toBeDefined()
    expect(expandEvent).toBeDefined()
    expect(expandEvent.newNodeIds.length).toBeGreaterThanOrEqual(2)
    expect(runDone).toBeDefined()
    expect(runDone.status).toBe("completed")
  })

  it("uses the workflow-level model for splitter execution", async () => {
    const workflowWithOpus: Workflow = {
      ...SPLITTER_RECOVERY_WORKFLOW,
      defaults: {
        ...SPLITTER_RECOVERY_WORKFLOW.defaults,
        model: "opus",
      },
      nodes: SPLITTER_RECOVERY_WORKFLOW.nodes.map((node) =>
        node.id === "splitter-1"
          ? { ...node, config: { ...(node.config as any), model: "sonnet" } }
          : node,
      ),
    }

    mockedSpawn.mockImplementation(async (opts: any) => {
      const prompt = String(opts.prompt || "")
      if (prompt.includes("You are an intelligent task decomposer")) {
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"[{\\"key\\":\\"a\\",\\"content\\":\\"A\\"},{\\"key\\":\\"b\\",\\"content\\":\\"B\\"}]"}\n',
          ),
        )
      } else {
        opts.onStdout?.(
          Buffer.from('{"type":"assistant","subtype":"text","content":"ok"}\n'),
        )
      }
      return {
        success: true,
        exitCode: 0,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-splitter-opus",
      workflowWithOpus,
      { type: "text", value: "Split into two parts" },
      mockWindow,
    )

    const splitterCall = mockedSpawn.mock.calls.find((call) =>
      String((call[0] as any)?.prompt || "").includes(
        "You are an intelligent task decomposer",
      ),
    )
    expect(splitterCall).toBeDefined()
    expect((splitterCall?.[0] as any).model).toBe("opus")
  })

  it("gives splitter a bounded multi-turn budget and workflow tool policy", async () => {
    const workflowWithToolPolicy: Workflow = {
      ...SPLITTER_RECOVERY_WORKFLOW,
      defaults: {
        ...SPLITTER_RECOVERY_WORKFLOW.defaults,
        maxTurns: 10,
        allowedTools: ["Read", "Bash"],
        disallowedTools: ["WebSearch", "mcp__exa__web_search_exa"],
      },
    }

    mockedSpawn.mockImplementation(async (opts: any) => {
      const prompt = String(opts.prompt || "")
      if (prompt.includes("You are an intelligent task decomposer")) {
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"[{\\"key\\":\\"a\\",\\"content\\":\\"A\\"},{\\"key\\":\\"b\\",\\"content\\":\\"B\\"}]"}\n',
          ),
        )
      } else {
        opts.onStdout?.(
          Buffer.from('{"type":"assistant","subtype":"text","content":"ok"}\n'),
        )
      }
      return {
        success: true,
        exitCode: 0,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-splitter-tool-policy",
      workflowWithToolPolicy,
      { type: "text", value: "Split into two parts" },
      mockWindow,
    )

    const splitterCall = mockedSpawn.mock.calls.find((call) =>
      String((call[0] as any)?.prompt || "").includes(
        "You are an intelligent task decomposer",
      ),
    )

    expect(splitterCall).toBeDefined()
    expect((splitterCall?.[0] as any).maxTurns).toBe(4)
    expect((splitterCall?.[0] as any).allowedTools).toEqual(["Read", "Bash"])
    expect((splitterCall?.[0] as any).disallowedTools).toEqual([
      "WebSearch",
      "mcp__exa__web_search_exa",
    ])
    expect((splitterCall?.[0] as any).tools).toBeUndefined()
  })

  it("expands to configured maxBranches when model under-splits rich tabular input", async () => {
    const workflowWith20Branches: Workflow = {
      ...SPLITTER_RECOVERY_WORKFLOW,
      nodes: SPLITTER_RECOVERY_WORKFLOW.nodes.map((node) =>
        node.id === "splitter-1"
          ? { ...node, config: { ...(node.config as any), maxBranches: 20 } }
          : node,
      ),
    }

    mockedSpawn.mockImplementation(async (opts: any) => {
      const prompt = String(opts.prompt || "")
      if (
        prompt.includes("You are an intelligent task decomposer") ||
        prompt.includes("Your previous splitter response was invalid")
      ) {
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"[{\\"key\\":\\"branch-1\\",\\"content\\":\\"Group 1\\"},{\\"key\\":\\"branch-2\\",\\"content\\":\\"Group 2\\"},{\\"key\\":\\"branch-3\\",\\"content\\":\\"Group 3\\"},{\\"key\\":\\"branch-4\\",\\"content\\":\\"Group 4\\"},{\\"key\\":\\"branch-5\\",\\"content\\":\\"Group 5\\"},{\\"key\\":\\"branch-6\\",\\"content\\":\\"Group 6\\"},{\\"key\\":\\"branch-7\\",\\"content\\":\\"Group 7\\"},{\\"key\\":\\"branch-8\\",\\"content\\":\\"Group 8\\"}]"}\n',
          ),
        )
      } else {
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"branch complete"}\n',
          ),
        )
      }
      return {
        success: true,
        exitCode: 0,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const rows = Array.from(
      { length: 25 },
      (_, i) => `| component-${i + 1} | UI | desc-${i + 1} |`,
    ).join("\n")
    const input = `| Component | Type | Description |
|---|---|---|
${rows}`

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-splitter-20-branches",
      workflowWith20Branches,
      { type: "text", value: input },
      mockWindow,
    )

    const expandEvent = events.find((e) => e.type === "nodes-expanded") as any
    expect(expandEvent).toBeDefined()
    expect(expandEvent.newNodeIds.length).toBe(8)
  })

  it("keeps excess fan-out branches queued until a provider slot is available", async () => {
    const previousLimit = process.env.C8C_EXECUTION_POOL_LIMIT
    process.env.C8C_EXECUTION_POOL_LIMIT = "2"

    const branchResolvers: Array<() => void> = []
    try {
      mockedSpawn.mockImplementation((opts: any) => {
        const prompt = String(opts.prompt || "")
        if (prompt.includes("You are an intelligent task decomposer")) {
          opts.onStdout?.(
            Buffer.from(
              '{"type":"assistant","subtype":"text","content":"[{\\"key\\":\\"branch-a\\",\\"content\\":\\"A\\"},{\\"key\\":\\"branch-b\\",\\"content\\":\\"B\\"},{\\"key\\":\\"branch-c\\",\\"content\\":\\"C\\"},{\\"key\\":\\"branch-d\\",\\"content\\":\\"D\\"}]"}\n',
            ),
          )
          return Promise.resolve({
            success: true,
            exitCode: 0,
            signal: null,
            killed: false,
            aborted: false,
            durationMs: 100,
          })
        }

        return new Promise((resolve) => {
          branchResolvers.push(() => {
            opts.onStdout?.(
              Buffer.from(
                '{"type":"assistant","subtype":"text","content":"branch complete"}\n',
              ),
            )
            resolve({
              success: true,
              exitCode: 0,
              signal: null,
              killed: false,
              aborted: false,
              durationMs: 100,
            })
          })
        })
      })

      const { runWorkflow } = await import("./workflow-runner")
      const runPromise = runWorkflow(
        "run-splitter-queued",
        QUEUED_FAN_OUT_WORKFLOW,
        { type: "text", value: "Split into four checks" },
        mockWindow,
      )
      const queuedBranchEvents = () =>
        events.filter(
          (event) =>
            event.type === "node-queued" && event.nodeId.includes("::"),
        )
      const startedBranchEvents = () =>
        events.filter(
          (event) => event.type === "node-start" && event.nodeId.includes("::"),
        )
      const completedBranchEvents = () =>
        events.filter(
          (event) => event.type === "node-done" && event.nodeId.includes("::"),
        )

      await waitForCondition(
        () =>
          events.some((event) => event.type === "nodes-expanded") &&
          queuedBranchEvents().length === 4 &&
          startedBranchEvents().length === 2 &&
          branchResolvers.length === 2,
        "expected queued branch events before extra provider slots opened",
      )

      expect(queuedBranchEvents()).toHaveLength(4)
      expect(startedBranchEvents()).toHaveLength(2)

      branchResolvers.splice(0).forEach((resolve) => resolve())

      await waitForCondition(
        () => branchResolvers.length === 2,
        "expected queued branches to start after first execution slots were released",
      )

      branchResolvers.splice(0).forEach((resolve) => resolve())
      await runPromise

      expect(startedBranchEvents()).toHaveLength(4)
      expect(completedBranchEvents()).toHaveLength(4)
    } finally {
      if (previousLimit == null) {
        delete process.env.C8C_EXECUTION_POOL_LIMIT
      } else {
        process.env.C8C_EXECUTION_POOL_LIMIT = previousLimit
      }
    }
  })
})

describe("workflow-runner runtime error policies", () => {
  let events: WorkflowEvent[]
  let mockWindow: any

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    events = []
    mockWindow = {
      isDestroyed: () => false,
      isFocused: () => true,
      on: vi.fn(),
      removeListener: vi.fn(),
      webContents: {
        send: (_channel: string, event: WorkflowEvent) => events.push(event),
      },
    }
  })

  it("stops the run when onError is stop", async () => {
    const workflow = withSkillRuntime(SIMPLE_SKILL_WORKFLOW, {
      execution: { onError: "stop" },
    })

    mockedSpawn.mockResolvedValue({
      success: false,
      exitCode: 1,
      signal: null,
      killed: false,
      aborted: false,
      durationMs: 100,
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-policy-stop",
      workflow,
      { type: "text", value: "input" },
      mockWindow,
    )

    const runDone = events.find((e) => e.type === "run-done") as any
    expect(runDone).toBeDefined()
    expect(runDone.status).toBe("failed")

    const outputStart = events.find(
      (e) => e.type === "node-start" && (e as any).nodeId === "output-1",
    )
    expect(outputStart).toBeUndefined()
  })

  it("surfaces Claude usage limit failures with actionable message", async () => {
    const workflow = withSkillRuntime(SIMPLE_SKILL_WORKFLOW, {
      execution: { onError: "stop" },
    })

    mockedSpawn.mockImplementation(async (opts: any) => {
      opts.onStderr?.(
        Buffer.from(
          "Error: You've reached your Claude usage limit. Please try again later.\n",
        ),
      )
      return {
        success: false,
        exitCode: 1,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-policy-limit",
      workflow,
      { type: "text", value: "input" },
      mockWindow,
    )

    const skillError = events.find(
      (e) => e.type === "node-error" && (e as any).nodeId === "skill-1",
    ) as any
    expect(skillError).toBeDefined()
    expect(String(skillError.error || "")).toContain(
      "Claude usage limit reached",
    )
    expect(String(skillError.error || "")).toContain("then rerun")

    const runDone = events.find((e) => e.type === "run-done") as any
    expect(runDone).toBeDefined()
    expect(runDone.status).toBe("failed")
  })

  it("continues with fallback output when onError is continue", async () => {
    const workflow = withSkillRuntime(SIMPLE_SKILL_WORKFLOW, {
      execution: { onError: "continue" },
    })

    mockedSpawn.mockResolvedValue({
      success: false,
      exitCode: 1,
      signal: null,
      killed: false,
      aborted: false,
      durationMs: 100,
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-policy-continue",
      workflow,
      { type: "text", value: "input" },
      mockWindow,
    )

    const runDone = events.find((e) => e.type === "run-done") as any
    expect(runDone).toBeDefined()
    expect(runDone.status).toBe("completed")

    const skillDone = events.find(
      (e) => e.type === "node-done" && (e as any).nodeId === "skill-1",
    ) as any
    expect(skillDone).toBeDefined()
    expect(skillDone.output.metadata.error_policy_applied).toBe("continue")
  })

  it("emits error envelope when onError is continue_error_output", async () => {
    const workflow = withSkillRuntime(SIMPLE_SKILL_WORKFLOW, {
      execution: { onError: "continue_error_output" },
    })

    mockedSpawn.mockResolvedValue({
      success: false,
      exitCode: 1,
      signal: null,
      killed: false,
      aborted: false,
      durationMs: 100,
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-policy-envelope",
      workflow,
      { type: "text", value: "input" },
      mockWindow,
    )

    const skillDone = events.find(
      (e) => e.type === "node-done" && (e as any).nodeId === "skill-1",
    ) as any
    expect(skillDone).toBeDefined()
    expect(skillDone.output.metadata.error_policy_applied).toBe(
      "continue_error_output",
    )
    expect(skillDone.output.metadata.error_envelope).toBe(true)
    expect(skillDone.output.content).toContain('"ok": false')
  })

  it("retries node execution based on runtime retry policy", async () => {
    const workflow = withSkillRuntime(SIMPLE_SKILL_WORKFLOW, {
      execution: { onError: "stop" },
      retry: { enabled: true, maxTries: 2, waitMs: 0, retryOn: ["tool"] },
    })

    let callCount = 0
    mockedSpawn.mockImplementation(async (opts: any) => {
      callCount++
      if (callCount === 2) {
        opts.onStdout?.(
          Buffer.from(
            '{"type":"assistant","subtype":"text","content":"Recovered"}\n',
          ),
        )
        return {
          success: true,
          exitCode: 0,
          signal: null,
          killed: false,
          aborted: false,
          durationMs: 100,
        }
      }
      return {
        success: false,
        exitCode: 1,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-policy-retry",
      workflow,
      { type: "text", value: "input" },
      mockWindow,
    )

    expect(mockedSpawn).toHaveBeenCalledTimes(2)
    const retryLog = events.find(
      (e) =>
        e.type === "node-log" &&
        (e as any).nodeId === "skill-1" &&
        String((e as any).entry?.content || "").includes("[runtime-retry]"),
    )
    expect(retryLog).toBeDefined()

    const runDone = events.find((e) => e.type === "run-done") as any
    expect(runDone).toBeDefined()
    expect(runDone.status).toBe("completed")
  })
})

describe("workflow-runner rerun evaluator behavior", () => {
  let events: WorkflowEvent[]
  let mockWindow: any

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    events = []
    mockWindow = {
      isDestroyed: () => false,
      isFocused: () => true,
      on: vi.fn(),
      removeListener: vi.fn(),
      webContents: {
        send: (_channel: string, event: WorkflowEvent) => events.push(event),
      },
    }
  })

  it("fails rerun when evaluator Claude process exits non-zero", async () => {
    mockedReadFile.mockImplementation(async (path: any) => {
      const p = String(path)
      if (p.endsWith("run-state.json")) {
        return JSON.stringify({
          nodeStates: {
            "input-1": {
              status: "completed",
              attempts: 1,
              log: [],
              output: {
                content: "seed input",
                metadata: { source: "input-1" },
              },
            },
            "skill-1": {
              status: "completed",
              attempts: 1,
              log: [],
              output: {
                content: "draft content",
                metadata: { source: "skill-1" },
              },
            },
            "eval-1": {
              status: "completed",
              attempts: 1,
              log: [],
              output: {
                content: "draft content",
                metadata: { source: "eval-1" },
              },
            },
            "output-1": { status: "completed", attempts: 1, log: [] },
          },
          runtimeNodes: RERUN_EVAL_ONLY_WORKFLOW.nodes,
          runtimeEdges: RERUN_EVAL_ONLY_WORKFLOW.edges,
          input: { type: "text", value: "seed input" },
        })
      }
      return "improved content"
    })

    mockedSpawn.mockResolvedValue({
      success: false,
      exitCode: 9,
      signal: null,
      killed: false,
      aborted: false,
      durationMs: 100,
    })

    const { rerunFromNode } = await import("./workflow-runner")
    await rerunFromNode(
      "rerun-eval-fail",
      "eval-1",
      RERUN_EVAL_ONLY_WORKFLOW,
      "/tmp/test-ws",
      mockWindow,
    )

    const evalError = events.find(
      (e) => e.type === "node-error" && (e as any).nodeId === "eval-1",
    ) as any
    const runDone = events.find((e) => e.type === "run-done") as any

    expect(evalError).toBeDefined()
    expect(String(evalError.error || "")).toContain(
      "Evaluator node failed: exit code 9",
    )
    expect(runDone).toBeDefined()
    expect(runDone.status).toBe("failed")
  })

  it("resumes a saved Claude session when rerunning a node from persisted state", async () => {
    mockedReadFile.mockImplementation(async (path: any) => {
      const p = String(path)
      if (p.endsWith("run-state.json")) {
        return JSON.stringify({
          nodeStates: {
            "input-1": {
              status: "completed",
              attempts: 1,
              log: [],
              output: {
                content: "seed input",
                metadata: { source: "input-1" },
              },
            },
            "skill-1": {
              status: "completed",
              attempts: 1,
              log: [],
              output: {
                content: "draft content",
                metadata: { source: "skill-1" },
              },
            },
            "eval-1": {
              status: "completed",
              attempts: 1,
              log: [],
              output: {
                content: "draft content",
                metadata: { source: "eval-1" },
              },
              meta: {
                model_id: "sonnet",
                prompt_hash: "1234567890abcdef",
                backend: "claude_sdk",
                provider_session_id: "saved-session-42",
              },
            },
            "output-1": { status: "completed", attempts: 1, log: [] },
          },
          runtimeNodes: RERUN_EVAL_ONLY_WORKFLOW.nodes,
          runtimeEdges: RERUN_EVAL_ONLY_WORKFLOW.edges,
          input: { type: "text", value: "seed input" },
        })
      }
      return "improved content"
    })

    mockedSpawn.mockImplementation(async (opts: any) => {
      opts.onStdout?.(
        Buffer.from(
          '{"type":"assistant","subtype":"text","content":"{\\"score\\": 9, \\"reason\\": \\"Excellent\\"}"}\n',
        ),
      )
      return {
        success: true,
        exitCode: 0,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 100,
      }
    })

    const { rerunFromNode } = await import("./workflow-runner")
    await rerunFromNode(
      "rerun-eval-resume",
      "eval-1",
      RERUN_EVAL_ONLY_WORKFLOW,
      "/tmp/test-ws",
      mockWindow,
    )

    expect(mockedSpawn).toHaveBeenCalledTimes(1)
    expect(mockedSpawn.mock.calls[0]?.[0]).toMatchObject({
      persistSession: true,
      resumeSessionId: "saved-session-42",
    })
  })
})
