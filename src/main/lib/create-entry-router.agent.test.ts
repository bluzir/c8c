import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  CreateEntryRouteInput,
  CreateEntryRouteOption,
  ProjectInspectionSummary,
  WorkflowTemplate,
} from "@shared/types"

const mocks = vi.hoisted(() => ({
  getProviderSettings: vi.fn(async () => ({
    defaultProvider: "codex",
    features: { codexProvider: true },
  })),
  applyProviderFeatureFlags: vi.fn((providerId: string) => providerId),
  startProviderTask: vi.fn(async () => ({ id: "router-handle" })),
  drainExecutionHandle: vi.fn(),
  withExecutionSlot: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  prepareTemporaryMcpConfig: vi.fn(async () => ({
    path: "/tmp/router-mcp.json",
    cleanup: vi.fn(async () => undefined),
  })),
}))

vi.mock("./provider-settings", () => ({
  getProviderSettings: mocks.getProviderSettings,
}))

vi.mock("./provider-runtime", () => ({
  applyProviderFeatureFlags: mocks.applyProviderFeatureFlags,
  startProviderTask: mocks.startProviderTask,
}))

vi.mock("./agent-execution", () => ({
  drainExecutionHandle: mocks.drainExecutionHandle,
}))

vi.mock("./execution-pool", () => ({
  withExecutionSlot: mocks.withExecutionSlot,
}))

vi.mock("./mcp-config", () => ({
  prepareTemporaryMcpConfig: mocks.prepareTemporaryMcpConfig,
}))

import { routeCreateEntry } from "./create-entry-router"

const developmentOptions: CreateEntryRouteOption[] = [
  {
    templateId: "delivery-map-codebase",
    label: "Explore this project",
    intentLabel: "Do it",
  },
  {
    templateId: "delivery-shape-project",
    label: "Change the app",
    intentLabel: "Do it",
  },
  {
    templateId: "delivery-plan-phase",
    label: "Plan the change",
    intentLabel: "Plan it",
  },
  {
    templateId: "delivery-investigate-bug",
    label: "Investigate a bug",
    intentLabel: "Do it",
  },
  {
    templateId: "full-stack-code-audit",
    label: "Code audit",
    intentLabel: "Review it",
  },
  {
    templateId: "ux-ui-polish-audit",
    label: "UX audit",
    intentLabel: "Review it",
  },
  {
    templateId: "playwright-visual-audit",
    label: "Visual test",
    intentLabel: "Review it",
  },
  {
    templateId: "cto-optimise-audit",
    label: "CTO audit",
    intentLabel: "Review it",
  },
]

function createInspection(
  overrides: Partial<ProjectInspectionSummary> = {},
): ProjectInspectionSummary {
  return {
    projectPath: "/tmp/project",
    git: {
      isRepo: true,
      branch: "main",
      hasUncommittedDiff: false,
    },
    manifests: ["package.json"],
    codeDirs: ["src", "app"],
    fileDensity: "active",
    fileCountEstimate: 42,
    projectKind: "existing_repo",
    ...overrides,
  }
}

function createInput(
  overrides: Partial<CreateEntryRouteInput> = {},
): CreateEntryRouteInput {
  return {
    modeId: "development",
    projectPath: "/tmp/project",
    fallbackTemplateId: "delivery-map-codebase",
    draftPrompt: "",
    requestedResult: "",
    modeConfig: null,
    promptScaffold: null,
    allowedOptions: developmentOptions,
    ...overrides,
  }
}

function createTemplate(id: string, name: string): WorkflowTemplate {
  return {
    id,
    name,
    description: `${name} description`,
    stage: "research",
    emoji: "🧩",
    headline: name,
    how: `${name} how`,
    input: `${name} input`,
    output: `${name} output`,
    steps: [],
    workflow: {
      version: 1,
      name,
      nodes: [],
      edges: [],
    },
  }
}

const templates = developmentOptions.map((option) =>
  createTemplate(option.templateId, option.label),
)

function mockAgentJson(json: string | null) {
  mocks.drainExecutionHandle.mockImplementationOnce(
    async (
      _handle,
      callbacks?: {
        onLogEntry?: (entry: {
          type: "text"
          content: string
          timestamp: number
        }) => void
      },
    ) => {
      if (json && callbacks?.onLogEntry) {
        callbacks.onLogEntry({
          type: "text",
          content: json,
          timestamp: Date.now(),
        })
      }
      return {
        success: Boolean(json),
        killed: false,
        aborted: false,
      }
    },
  )
}

describe("routeCreateEntry agent-first", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("accepts an agent route for mixed do-plan requests when the model chooses a direct start", async () => {
    mockAgentJson(
      JSON.stringify({
        kind: "route",
        recommendedTemplateId: "delivery-shape-project",
        alternateTemplateIds: ["delivery-plan-phase"],
        reason: "This is a direct change request on the current app.",
        confidence: 0.83,
      }),
    )

    const route = await routeCreateEntry(
      createInput({
        draftPrompt: "plan and implement usage-based billing for settings",
        requestedResult: "plan and implement usage-based billing for settings",
      }),
      createInspection(),
      templates,
    )

    expect(route.source).toBe("agent")
    expect(route.clarification).toBeNull()
    expect(route.recommendedTemplateId).toBe("delivery-shape-project")
  })

  it("returns agent-provided job-route clarification for ambiguous audit requests", async () => {
    mockAgentJson(
      JSON.stringify({
        kind: "clarification",
        recommendedTemplateId: "full-stack-code-audit",
        alternateTemplateIds: ["ux-ui-polish-audit"],
        reason:
          "This sounds like an audit request but the audit lens is ambiguous.",
        confidence: 0.58,
        clarification: {
          kind: "job_route",
          title: "Choose the audit path",
          message: "Pick the kind of audit you want first.",
          options: [
            {
              value: "code_audit",
              label: "Code audit",
              description:
                "Look for codebase risks, architecture gaps, and quality issues.",
              templateId: "full-stack-code-audit",
            },
            {
              value: "ux_audit",
              label: "UX audit",
              description: "Audit the product surface for UX/UI quality.",
              templateId: "ux-ui-polish-audit",
            },
          ],
        },
      }),
    )

    const route = await routeCreateEntry(
      createInput({
        draftPrompt: "проаудируй все компоненты",
        requestedResult: "проаудируй все компоненты",
      }),
      createInspection(),
      templates,
    )

    expect(route.source).toBe("agent")
    expect(route.clarification?.kind).toBe("job_route")
    if (route.clarification?.kind !== "job_route")
      throw new Error("Expected job_route clarification")
    expect(
      route.clarification.options.map((option) => option.templateId),
    ).toEqual(["full-stack-code-audit", "ux-ui-polish-audit"])
  })

  it("fails instead of silently falling back when the agent is unavailable", async () => {
    mockAgentJson(null)

    await expect(
      routeCreateEntry(
        createInput({
          draftPrompt: "поменяй текст кнопки на главной и чуть поправь spacing",
          requestedResult:
            "поменяй текст кнопки на главной и чуть поправь spacing",
        }),
        createInspection(),
        templates,
      ),
    ).rejects.toThrow(
      "The AI router couldn't choose a starting point right now. Try again.",
    )
  })

  it("supports rerouting from a job-route clarification through a template constraint", async () => {
    mockAgentJson(
      JSON.stringify({
        kind: "route",
        recommendedTemplateId: "ux-ui-polish-audit",
        alternateTemplateIds: [],
        reason: "The user selected UX audit explicitly.",
        confidence: 0.91,
      }),
    )

    const route = await routeCreateEntry(
      createInput({
        draftPrompt: "проаудируй все компоненты",
        requestedResult: "проаудируй все компоненты",
        templateConstraintId: "ux-ui-polish-audit",
      }),
      createInspection(),
      templates,
    )

    expect(route.source).toBe("agent")
    expect(route.recommendedTemplateId).toBe("ux-ui-polish-audit")
    expect(route.seed.primaryInputMode).toBe("directory")
  })

  it("rejects invalid out-of-intent agent output instead of silently rerouting", async () => {
    mockAgentJson(
      JSON.stringify({
        kind: "route",
        recommendedTemplateId: "full-stack-code-audit",
        alternateTemplateIds: ["delivery-plan-phase"],
        reason: "Security review seems useful.",
        confidence: 0.84,
      }),
    )

    await expect(
      routeCreateEntry(
        createInput({
          draftPrompt: "plan the change",
          requestedResult: "plan the change",
          helpModeHint: "plan",
        }),
        createInspection(),
        templates,
      ),
    ).rejects.toThrow(
      "The AI router couldn't choose a starting point right now. Try again.",
    )
  })
})
