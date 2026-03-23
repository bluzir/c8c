import { describe, expect, it, vi } from "vitest"
import type {
  ClaudeCodeSubscriptionStatus,
  ProviderDiagnostics,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
} from "@shared/types"
import {
  applyExecutionProviderFeatureFlags,
  compareSemver,
  DEFAULT_COST_WARNING_THRESHOLD_USD,
  estimateFlowCost,
  evaluateExecutionStartPreflight,
  evaluateTokenBudgetWarning,
  formatCostBreakdown,
  formatExecutionPreflightTitle,
  loadExecutionStartPreflight,
  MIN_CLAUDE_CLI_VERSION,
  parseCliVersion,
  resolveEffectiveExecutionProvider,
  resolveExecutionStartBlockReason,
} from "./preflight"

function createWorkflow(provider?: "claude" | "codex"): Workflow {
  return {
    version: 1,
    name: "Test workflow",
    defaults: provider ? { provider } : undefined,
    nodes: [],
    edges: [],
  }
}

function createProviderWorkflow(provider?: "claude" | "codex"): Workflow {
  return {
    version: 1,
    name: "Provider workflow",
    defaults: provider ? { provider } : undefined,
    nodes: [
      makeNode("input-1", "input"),
      makeNode("skill-1", "skill"),
      makeNode("output-1", "output"),
    ],
    edges: [makeEdge("input-1", "skill-1"), makeEdge("skill-1", "output-1")],
  }
}

function createDiagnostics(
  overrides?: Partial<ProviderDiagnostics>,
): ProviderDiagnostics {
  return {
    settings: {
      defaultProvider: "claude",
      safetyProfile: "workspace_auto",
      features: {
        codexProvider: true,
      },
    },
    health: {
      claude: {
        provider: "claude",
        available: true,
        error: null,
      },
      codex: {
        provider: "codex",
        available: true,
        error: null,
      },
    },
    auth: {
      claude: {
        provider: "claude",
        state: "authenticated",
        authenticated: true,
      },
      codex: {
        provider: "codex",
        state: "authenticated",
        authenticated: true,
      },
    },
    ...overrides,
  }
}

function createCliStatus(
  overrides?: Partial<ClaudeCodeSubscriptionStatus>,
): ClaudeCodeSubscriptionStatus {
  return {
    checkedAt: Date.now(),
    cliInstalled: true,
    loggedIn: true,
    authMethod: "oauth",
    apiProvider: "claude",
    hasSubscription: true,
    error: null,
    ...overrides,
  }
}

describe("execution preflight", () => {
  it("falls back from codex to claude when the codex feature is disabled", () => {
    expect(
      applyExecutionProviderFeatureFlags("codex", { codexProvider: false }),
    ).toBe("claude")
    expect(
      resolveEffectiveExecutionProvider(createWorkflow("codex"), {
        defaultProvider: "claude",
        safetyProfile: "workspace_auto",
        features: {
          codexProvider: false,
        },
      }),
    ).toBe("claude")
  })

  it("blocks start when Claude CLI is unavailable", () => {
    const result = evaluateExecutionStartPreflight(
      createProviderWorkflow("claude"),
      {
        diagnostics: createDiagnostics({
          health: {
            claude: {
              provider: "claude",
              available: false,
              error: "Claude CLI is not installed.",
            },
            codex: {
              provider: "codex",
              available: true,
              error: null,
            },
          },
        }),
        cliStatus: createCliStatus({
          cliInstalled: false,
          loggedIn: false,
          error: "Claude CLI is not installed or not available in PATH.",
        }),
      },
    )

    expect(result.ok).toBe(false)
    expect(result.effectiveProvider).toBe("claude")
    if (!result.ok) {
      expect(result.reason).toBe("cli_unavailable")
      expect(result.message).toContain("Claude CLI is not installed")
    }
  })

  it("blocks start when Codex auth is required", () => {
    const result = evaluateExecutionStartPreflight(
      createProviderWorkflow("codex"),
      {
        diagnostics: createDiagnostics({
          auth: {
            claude: {
              provider: "claude",
              state: "authenticated",
              authenticated: true,
            },
            codex: {
              provider: "codex",
              state: "unauthenticated",
              authenticated: false,
              error: "Codex CLI is not authenticated.",
            },
          },
        }),
        cliStatus: null,
      },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("auth_required")
      expect(result.message).toContain("Codex CLI is not authenticated")
    }
  })

  it("allows codex when auth state is unknown but CLI is available", () => {
    const result = evaluateExecutionStartPreflight(
      createProviderWorkflow("codex"),
      {
        diagnostics: createDiagnostics({
          auth: {
            claude: {
              provider: "claude",
              state: "authenticated",
              authenticated: true,
            },
            codex: {
              provider: "codex",
              state: "unknown",
              authenticated: false,
            },
          },
        }),
        cliStatus: null,
      },
    )

    expect(result).toMatchObject({
      ok: true,
      effectiveProvider: "codex",
    })
  })

  it("allows providerless workflows without requiring provider auth", () => {
    const result = evaluateExecutionStartPreflight(createWorkflow("codex"), {
      diagnostics: createDiagnostics({
        auth: {
          claude: {
            provider: "claude",
            state: "unauthenticated",
            authenticated: false,
            error: "Claude CLI is not authenticated.",
          },
          codex: {
            provider: "codex",
            state: "unauthenticated",
            authenticated: false,
            error: "Codex CLI is not authenticated.",
          },
        },
      }),
      cliStatus: null,
    })

    expect(result).toMatchObject({
      ok: true,
      effectiveProvider: "codex",
    })
  })

  it("loads Claude CLI status only when the effective provider is Claude", async () => {
    const getProviderDiagnostics = vi
      .fn()
      .mockResolvedValue(createDiagnostics())
    const getClaudeCodeSubscriptionStatus = vi
      .fn()
      .mockResolvedValue(createCliStatus())

    const result = await loadExecutionStartPreflight(
      {
        getProviderDiagnostics,
        getClaudeCodeSubscriptionStatus,
      },
      createProviderWorkflow("claude"),
    )

    expect(result).toMatchObject({
      ok: true,
      effectiveProvider: "claude",
    })
    expect(getClaudeCodeSubscriptionStatus).toHaveBeenCalledTimes(1)
  })

  it("skips CLI auth probes for providerless workflows", async () => {
    const getProviderDiagnostics = vi
      .fn()
      .mockResolvedValue(createDiagnostics())
    const getClaudeCodeSubscriptionStatus = vi.fn()

    const result = await loadExecutionStartPreflight(
      {
        getProviderDiagnostics,
        getClaudeCodeSubscriptionStatus,
      },
      createWorkflow("claude"),
    )

    expect(result).toMatchObject({
      ok: true,
      effectiveProvider: "claude",
    })
    expect(getClaudeCodeSubscriptionStatus).not.toHaveBeenCalled()
  })

  it("skips Claude CLI status when the effective provider is Codex", async () => {
    const getProviderDiagnostics = vi.fn().mockResolvedValue(
      createDiagnostics({
        settings: {
          defaultProvider: "codex",
          safetyProfile: "workspace_auto",
          features: {
            codexProvider: true,
          },
        },
      }),
    )
    const getClaudeCodeSubscriptionStatus = vi.fn()

    const result = await loadExecutionStartPreflight(
      {
        getProviderDiagnostics,
        getClaudeCodeSubscriptionStatus,
      },
      createProviderWorkflow("codex"),
    )

    expect(result).toMatchObject({
      ok: true,
      effectiveProvider: "codex",
    })
    expect(getClaudeCodeSubscriptionStatus).not.toHaveBeenCalled()
  })

  it("formats provider-specific titles", () => {
    expect(formatExecutionPreflightTitle("claude", "cli_unavailable")).toBe(
      "Claude Code unavailable",
    )
    expect(
      formatExecutionPreflightTitle("claude", "cli_version_unsupported"),
    ).toBe("Claude Code update required")
    expect(formatExecutionPreflightTitle("codex", "auth_required")).toBe(
      "OpenAI Codex login required",
    )
  })

  it("returns a settings-directed block reason for unavailable providers", () => {
    expect(
      resolveExecutionStartBlockReason(createProviderWorkflow("claude"), {
        settings: createDiagnostics().settings,
        availability: {
          claude: {
            provider: "claude",
            available: false,
            error: "Claude CLI is not installed.",
          },
          codex: {
            provider: "codex",
            available: true,
            error: null,
          },
        },
        auth: createDiagnostics().auth,
      }),
    ).toContain("Open Settings to fix the provider setup.")
  })

  it("does not block when provider diagnostics have not loaded yet", () => {
    expect(
      resolveExecutionStartBlockReason(createProviderWorkflow("codex"), {
        settings: createDiagnostics({
          settings: {
            defaultProvider: "codex",
            safetyProfile: "workspace_auto",
            features: {
              codexProvider: true,
            },
          },
        }).settings,
        availability: {
          claude: null,
          codex: null,
        },
        auth: {
          claude: null,
          codex: null,
        },
      }),
    ).toBeNull()
  })

  describe("CLI version checking", () => {
    it("blocks start when Claude CLI version is below minimum", () => {
      const result = evaluateExecutionStartPreflight(
        createProviderWorkflow("claude"),
        {
          diagnostics: createDiagnostics({
            health: {
              claude: {
                provider: "claude",
                available: true,
                version: "0.1.0",
                error: null,
              },
              codex: {
                provider: "codex",
                available: true,
                error: null,
              },
            },
          }),
          cliStatus: createCliStatus(),
        },
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe("cli_version_unsupported")
        expect(result.message).toContain("0.1.0")
        expect(result.message).toContain(MIN_CLAUDE_CLI_VERSION)
        expect(result.message).toContain(
          "npm update -g @anthropic-ai/claude-code",
        )
      }
    })

    it("allows execution when Claude CLI version meets minimum", () => {
      const result = evaluateExecutionStartPreflight(
        createProviderWorkflow("claude"),
        {
          diagnostics: createDiagnostics({
            health: {
              claude: {
                provider: "claude",
                available: true,
                version: "2.0.0",
                error: null,
              },
              codex: {
                provider: "codex",
                available: true,
                error: null,
              },
            },
          }),
          cliStatus: createCliStatus(),
        },
      )

      expect(result.ok).toBe(true)
    })

    it("allows execution when Claude CLI version cannot be parsed (backwards compat)", () => {
      const result = evaluateExecutionStartPreflight(
        createProviderWorkflow("claude"),
        {
          diagnostics: createDiagnostics({
            health: {
              claude: {
                provider: "claude",
                available: true,
                version: "unknown-version-format",
                error: null,
              },
              codex: {
                provider: "codex",
                available: true,
                error: null,
              },
            },
          }),
          cliStatus: createCliStatus(),
        },
      )

      expect(result.ok).toBe(true)
    })

    it("allows execution when version field is absent (backwards compat)", () => {
      const result = evaluateExecutionStartPreflight(
        createProviderWorkflow("claude"),
        {
          diagnostics: createDiagnostics(),
          cliStatus: createCliStatus(),
        },
      )

      expect(result.ok).toBe(true)
    })

    it("does not version-check Codex provider", () => {
      const result = evaluateExecutionStartPreflight(
        createProviderWorkflow("codex"),
        {
          diagnostics: createDiagnostics({
            health: {
              claude: {
                provider: "claude",
                available: true,
                error: null,
              },
              codex: {
                provider: "codex",
                available: true,
                version: "0.0.1",
                error: null,
              },
            },
          }),
          cliStatus: null,
        },
      )

      expect(result.ok).toBe(true)
    })
  })

  describe("parseCliVersion", () => {
    it("extracts semver from plain version string", () => {
      expect(parseCliVersion("1.0.33")).toBe("1.0.33")
    })

    it("extracts semver from prefixed string", () => {
      expect(parseCliVersion("claude 1.0.33")).toBe("1.0.33")
    })

    it("extracts semver from verbose output", () => {
      expect(parseCliVersion("Claude Code v2.1.0 (build abc123)")).toBe("2.1.0")
    })

    it("returns null for unparseable strings", () => {
      expect(parseCliVersion("unknown")).toBeNull()
      expect(parseCliVersion("")).toBeNull()
      expect(parseCliVersion(undefined)).toBeNull()
      expect(parseCliVersion(null)).toBeNull()
    })
  })

  describe("compareSemver", () => {
    it("returns 0 for equal versions", () => {
      expect(compareSemver("1.0.0", "1.0.0")).toBe(0)
    })

    it("returns negative when a < b", () => {
      expect(compareSemver("0.9.0", "1.0.0")).toBeLessThan(0)
      expect(compareSemver("1.0.0", "1.0.1")).toBeLessThan(0)
      expect(compareSemver("1.0.9", "1.1.0")).toBeLessThan(0)
    })

    it("returns positive when a > b", () => {
      expect(compareSemver("2.0.0", "1.0.0")).toBeGreaterThan(0)
      expect(compareSemver("1.1.0", "1.0.9")).toBeGreaterThan(0)
    })
  })

  describe("preflight success includes warnings array", () => {
    it("returns empty warnings for simple workflow", () => {
      const workflow = createWorkflow("claude")
      workflow.nodes = [
        makeNode("input-1", "input"),
        makeNode("skill-1", "skill"),
        makeNode("output-1", "output"),
      ]
      workflow.edges = [
        makeEdge("input-1", "skill-1"),
        makeEdge("skill-1", "output-1"),
      ]

      const result = evaluateExecutionStartPreflight(workflow, {
        diagnostics: createDiagnostics(),
        cliStatus: createCliStatus(),
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.warnings).toEqual([])
      }
    })
  })
})

// ── Helpers for graph construction ──────────────────────

let nodeCounter = 0
function makeNode(
  id: string,
  type: WorkflowNode["type"],
  config?: Record<string, unknown>,
): WorkflowNode {
  nodeCounter++
  const base = { id, type, position: { x: nodeCounter * 100, y: 0 } }
  switch (type) {
    case "input":
      return { ...base, type: "input", config: { ...config } } as WorkflowNode
    case "output":
      return { ...base, type: "output", config: { ...config } } as WorkflowNode
    case "skill":
      return {
        ...base,
        type: "skill",
        config: { prompt: "test", ...config },
      } as WorkflowNode
    case "evaluator":
      return {
        ...base,
        type: "evaluator",
        config: { criteria: "test", threshold: 7, maxRetries: 0, ...config },
      } as WorkflowNode
    case "splitter":
      return {
        ...base,
        type: "splitter",
        config: { strategy: "auto", ...config },
      } as WorkflowNode
    case "merger":
      return {
        ...base,
        type: "merger",
        config: { strategy: "concatenate", ...config },
      } as WorkflowNode
    case "approval":
      return {
        ...base,
        type: "approval",
        config: { show_content: true, allow_edit: false, ...config },
      } as WorkflowNode
    default:
      return { ...base, type, config: { ...config } } as unknown as WorkflowNode
  }
}

function makeEdge(
  source: string,
  target: string,
  type: WorkflowEdge["type"] = "default",
): WorkflowEdge {
  return { id: `${source}->${target}`, source, target, type }
}

function buildWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  model?: string,
): Workflow {
  return {
    version: 1,
    name: "Test flow",
    defaults: model ? { model } : undefined,
    nodes,
    edges,
  }
}

describe("estimateFlowCost", () => {
  it("counts a single skill node", () => {
    const wf = buildWorkflow(
      [
        makeNode("input-1", "input"),
        makeNode("skill-1", "skill"),
        makeNode("output-1", "output"),
      ],
      [makeEdge("input-1", "skill-1"), makeEdge("skill-1", "output-1")],
    )

    const estimate = estimateFlowCost(wf)
    expect(estimate.totalSkillNodes).toBe(1)
    expect(estimate.worstCaseInvocations).toBe(1)
    expect(estimate.estimatedCostUsd).toBeGreaterThan(0)
  })

  it("counts multiple skill nodes in a linear chain", () => {
    const wf = buildWorkflow(
      [
        makeNode("input-1", "input"),
        makeNode("skill-1", "skill"),
        makeNode("skill-2", "skill"),
        makeNode("skill-3", "skill"),
        makeNode("output-1", "output"),
      ],
      [
        makeEdge("input-1", "skill-1"),
        makeEdge("skill-1", "skill-2"),
        makeEdge("skill-2", "skill-3"),
        makeEdge("skill-3", "output-1"),
      ],
    )

    const estimate = estimateFlowCost(wf)
    expect(estimate.totalSkillNodes).toBe(3)
    expect(estimate.worstCaseInvocations).toBe(3)
  })

  it("multiplies downstream skills by splitter maxBranches", () => {
    const wf = buildWorkflow(
      [
        makeNode("input-1", "input"),
        makeNode("splitter-1", "splitter", { maxBranches: 5 }),
        makeNode("skill-1", "skill"),
        makeNode("merger-1", "merger"),
        makeNode("output-1", "output"),
      ],
      [
        makeEdge("input-1", "splitter-1"),
        makeEdge("splitter-1", "skill-1"),
        makeEdge("skill-1", "merger-1"),
        makeEdge("merger-1", "output-1"),
      ],
    )

    const estimate = estimateFlowCost(wf)
    expect(estimate.totalSkillNodes).toBe(1)
    // 1 base + 4 additional copies from splitter
    expect(estimate.worstCaseInvocations).toBe(5)
  })

  it("uses default maxBranches of 3 when not specified", () => {
    const wf = buildWorkflow(
      [
        makeNode("input-1", "input"),
        makeNode("splitter-1", "splitter"),
        makeNode("skill-1", "skill"),
        makeNode("merger-1", "merger"),
        makeNode("output-1", "output"),
      ],
      [
        makeEdge("input-1", "splitter-1"),
        makeEdge("splitter-1", "skill-1"),
        makeEdge("skill-1", "merger-1"),
        makeEdge("merger-1", "output-1"),
      ],
    )

    const estimate = estimateFlowCost(wf)
    // 1 base + 2 additional copies (maxBranches defaults to 3)
    expect(estimate.worstCaseInvocations).toBe(3)
  })

  it("multiplies skills by evaluator retries", () => {
    const wf = buildWorkflow(
      [
        makeNode("input-1", "input"),
        makeNode("skill-1", "skill"),
        makeNode("eval-1", "evaluator", { maxRetries: 3 }),
        makeNode("output-1", "output"),
      ],
      [
        makeEdge("input-1", "skill-1"),
        makeEdge("skill-1", "eval-1"),
        makeEdge("eval-1", "output-1"),
      ],
    )

    const estimate = estimateFlowCost(wf)
    expect(estimate.totalSkillNodes).toBe(1)
    // 1 base + 3 retries * 1 skill
    expect(estimate.worstCaseInvocations).toBe(4)
  })

  it("handles evaluator with retryFrom spanning multiple skills", () => {
    const wf = buildWorkflow(
      [
        makeNode("input-1", "input"),
        makeNode("skill-1", "skill"),
        makeNode("skill-2", "skill"),
        makeNode("eval-1", "evaluator", {
          maxRetries: 2,
          retryFrom: "skill-1",
        }),
        makeNode("output-1", "output"),
      ],
      [
        makeEdge("input-1", "skill-1"),
        makeEdge("skill-1", "skill-2"),
        makeEdge("skill-2", "eval-1"),
        makeEdge("eval-1", "output-1"),
      ],
    )

    const estimate = estimateFlowCost(wf)
    expect(estimate.totalSkillNodes).toBe(2)
    // 2 base + 2 retries * 2 skills in retry scope
    expect(estimate.worstCaseInvocations).toBe(6)
  })

  it("combines splitter fan-out and evaluator retries", () => {
    const wf = buildWorkflow(
      [
        makeNode("input-1", "input"),
        makeNode("splitter-1", "splitter", { maxBranches: 4 }),
        makeNode("skill-1", "skill"),
        makeNode("eval-1", "evaluator", { maxRetries: 3 }),
        makeNode("merger-1", "merger"),
        makeNode("output-1", "output"),
      ],
      [
        makeEdge("input-1", "splitter-1"),
        makeEdge("splitter-1", "skill-1"),
        makeEdge("skill-1", "eval-1"),
        makeEdge("eval-1", "merger-1"),
        makeEdge("merger-1", "output-1"),
      ],
    )

    const estimate = estimateFlowCost(wf)
    expect(estimate.totalSkillNodes).toBe(1)
    // 1 base + 3 additional (splitter) + 3 retries * 1 skill
    expect(estimate.worstCaseInvocations).toBe(7)
  })

  it("uses opus pricing for opus model", () => {
    const wf = buildWorkflow(
      [
        makeNode("input-1", "input"),
        makeNode("skill-1", "skill"),
        makeNode("output-1", "output"),
      ],
      [makeEdge("input-1", "skill-1"), makeEdge("skill-1", "output-1")],
      "opus",
    )

    const estimateOpus = estimateFlowCost(wf)

    const wfSonnet = buildWorkflow(
      [
        makeNode("input-1b", "input"),
        makeNode("skill-1b", "skill"),
        makeNode("output-1b", "output"),
      ],
      [makeEdge("input-1b", "skill-1b"), makeEdge("skill-1b", "output-1b")],
      "sonnet",
    )

    const estimateSonnet = estimateFlowCost(wfSonnet)

    // Opus should be significantly more expensive than sonnet
    expect(estimateOpus.estimatedCostUsd).toBeGreaterThan(
      estimateSonnet.estimatedCostUsd,
    )
    expect(estimateOpus.modelFamily).toBe("opus")
    expect(estimateSonnet.modelFamily).toBe("sonnet")
  })

  it("returns zero invocations for workflow with no skill nodes", () => {
    const wf = buildWorkflow(
      [makeNode("input-1", "input"), makeNode("output-1", "output")],
      [makeEdge("input-1", "output-1")],
    )

    const estimate = estimateFlowCost(wf)
    expect(estimate.totalSkillNodes).toBe(0)
    expect(estimate.worstCaseInvocations).toBe(0)
    expect(estimate.estimatedCostUsd).toBe(0)
  })

  it("does not count skills after a merger as part of splitter fan-out", () => {
    const wf = buildWorkflow(
      [
        makeNode("input-1", "input"),
        makeNode("splitter-1", "splitter", { maxBranches: 4 }),
        makeNode("skill-1", "skill"),
        makeNode("merger-1", "merger"),
        makeNode("skill-2", "skill"),
        makeNode("output-1", "output"),
      ],
      [
        makeEdge("input-1", "splitter-1"),
        makeEdge("splitter-1", "skill-1"),
        makeEdge("skill-1", "merger-1"),
        makeEdge("merger-1", "skill-2"),
        makeEdge("skill-2", "output-1"),
      ],
    )

    const estimate = estimateFlowCost(wf)
    expect(estimate.totalSkillNodes).toBe(2)
    // skill-1: 1 base + 3 from splitter = 4
    // skill-2: 1 (not multiplied by splitter since it's after the merger)
    expect(estimate.worstCaseInvocations).toBe(5)
  })
})

describe("formatCostBreakdown", () => {
  it("formats a breakdown with all component types", () => {
    const wf = buildWorkflow(
      [
        makeNode("input-1", "input"),
        makeNode("splitter-1", "splitter", { maxBranches: 4 }),
        makeNode("skill-1", "skill"),
        makeNode("skill-2", "skill"),
        makeNode("eval-1", "evaluator", { maxRetries: 3 }),
        makeNode("merger-1", "merger"),
        makeNode("output-1", "output"),
      ],
      [
        makeEdge("input-1", "splitter-1"),
        makeEdge("splitter-1", "skill-1"),
        makeEdge("skill-1", "skill-2"),
        makeEdge("skill-2", "eval-1"),
        makeEdge("eval-1", "merger-1"),
        makeEdge("merger-1", "output-1"),
      ],
    )

    const estimate = estimateFlowCost(wf)
    const formatted = formatCostBreakdown(estimate)

    expect(formatted).toContain("2 skill steps")
    expect(formatted).toContain("splitter")
    expect(formatted).toContain("check")
    expect(formatted).toContain("invocations")
  })
})

describe("evaluateTokenBudgetWarning", () => {
  it("returns null for low-cost workflows", () => {
    const wf = buildWorkflow(
      [
        makeNode("input-1", "input"),
        makeNode("skill-1", "skill"),
        makeNode("output-1", "output"),
      ],
      [makeEdge("input-1", "skill-1"), makeEdge("skill-1", "output-1")],
    )

    const warning = evaluateTokenBudgetWarning(wf, "sonnet")
    expect(warning).toBeNull()
  })

  it("returns warning for expensive workflows", () => {
    // Build an expensive workflow: splitter(8) x evaluator(3 retries) with opus
    const wf = buildWorkflow(
      [
        makeNode("input-1", "input"),
        makeNode("splitter-1", "splitter", { maxBranches: 8 }),
        makeNode("skill-1", "skill"),
        makeNode("eval-1", "evaluator", { maxRetries: 3 }),
        makeNode("merger-1", "merger"),
        makeNode("output-1", "output"),
      ],
      [
        makeEdge("input-1", "splitter-1"),
        makeEdge("splitter-1", "skill-1"),
        makeEdge("skill-1", "eval-1"),
        makeEdge("eval-1", "merger-1"),
        makeEdge("merger-1", "output-1"),
      ],
      "opus",
    )

    const warning = evaluateTokenBudgetWarning(wf, "opus")
    expect(warning).not.toBeNull()
    expect(warning!.kind).toBe("token_budget")
    expect(warning!.estimatedCostUsd).toBeGreaterThan(
      DEFAULT_COST_WARNING_THRESHOLD_USD,
    )
    expect(warning!.worstCaseInvocations).toBeGreaterThan(1)
    expect(warning!.message).toContain("$")
    expect(warning!.message).toContain("worst case")
  })

  it("respects custom threshold", () => {
    const wf = buildWorkflow(
      [
        makeNode("input-1", "input"),
        makeNode("skill-1", "skill"),
        makeNode("skill-2", "skill"),
        makeNode("skill-3", "skill"),
        makeNode("output-1", "output"),
      ],
      [
        makeEdge("input-1", "skill-1"),
        makeEdge("skill-1", "skill-2"),
        makeEdge("skill-2", "skill-3"),
        makeEdge("skill-3", "output-1"),
      ],
      "opus",
    )

    // With a very low threshold, even a small workflow triggers the warning
    const warning = evaluateTokenBudgetWarning(wf, "opus", 0.01)
    expect(warning).not.toBeNull()

    // With a very high threshold, even an expensive workflow doesn't trigger
    const noWarning = evaluateTokenBudgetWarning(wf, "opus", 999_999)
    expect(noWarning).toBeNull()
  })
})
