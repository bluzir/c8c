import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  ContentDomainContext,
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

const contentOptions: CreateEntryRouteOption[] = [
  {
    templateId: "content-trend-watch",
    label: "Watch trends",
    intentLabel: "Plan it",
  },
  {
    templateId: "content-post-calendar",
    label: "Plan content calendar",
    intentLabel: "Plan it",
  },
  {
    templateId: "content-draft-post",
    label: "Draft a post",
    intentLabel: "Do it",
  },
  {
    templateId: "content-qa-review",
    label: "Review content quality",
    intentLabel: "Review it",
  },
  {
    templateId: "content-pipeline",
    label: "Build content strategy",
    intentLabel: "Do it / Plan it",
    intentValues: ["do", "plan"],
  },
  {
    templateId: "content-repurposing-factory",
    label: "Repurpose content",
    intentLabel: "Do it",
  },
  {
    templateId: "predictable-text-factory",
    label: "Generate text",
    intentLabel: "Do it",
  },
  {
    templateId: "copy-quality-pipeline",
    label: "Check copy quality",
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

const developmentTemplates = developmentOptions.map((option) =>
  createTemplate(option.templateId, option.label),
)

const contentTemplates = contentOptions.map((option) =>
  createTemplate(option.templateId, option.label),
)

const contentContext: ContentDomainContext = {
  previousResults: [
    {
      kind: "trend_digest",
      title: "AI agents weekly digest",
      ageMs: 86_400_000,
    },
  ],
  templatesRun: ["content-trend-watch", "content-draft-post"],
  availableTools: ["web_search", "exa"],
}

function mockAgentJson(
  route: {
    recommendedTemplateId?: string
    alternateTemplateIds?: string[]
  } = {},
) {
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
      callbacks?.onLogEntry?.({
        type: "text",
        content: JSON.stringify({
          kind: "route",
          recommendedTemplateId:
            route.recommendedTemplateId || "delivery-shape-project",
          alternateTemplateIds: route.alternateTemplateIds || [
            "delivery-plan-phase",
          ],
          reason: "This is the best first step.",
          confidence: 0.88,
        }),
        timestamp: Date.now(),
      })
      return {
        success: true,
        killed: false,
        aborted: false,
      }
    },
  )
}

function latestPrompt() {
  const call = mocks.startProviderTask.mock.calls.at(-1) as
    | [string, { prompt?: string }]
    | undefined
  if (!call) throw new Error("Expected startProviderTask to be called")
  return String(call[1]?.prompt || "")
}

describe("routeCreateEntry JTBD prompt contract", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("tells the agent not to degrade broad audit requests into map-first work", async () => {
    mockAgentJson()

    await routeCreateEntry(
      createInput({
        draftPrompt: "проаудируй все компоненты",
        requestedResult: "проаудируй все компоненты",
      }),
      createInspection(),
      developmentTemplates,
    )

    expect(latestPrompt()).toContain(
      "Broad audit or review requests should prefer audit entries instead of mapping first",
    )
  })

  it("tells the agent to keep small changes on the lightweight change path", async () => {
    mockAgentJson()

    await routeCreateEntry(
      createInput({
        draftPrompt: "поменяй текст кнопки и чуть поправь spacing",
        requestedResult: "поменяй текст кнопки и чуть поправь spacing",
      }),
      createInspection(),
      developmentTemplates,
    )

    expect(latestPrompt()).toContain(
      "Small edits, quick tweaks, and straightforward app changes should stay on the lightweight change path",
    )
  })

  it("tells the agent to prefer bug investigation for incidents and regressions", async () => {
    mockAgentJson()

    await routeCreateEntry(
      createInput({
        draftPrompt: "после релиза checkout падает с 500",
        requestedResult: "после релиза checkout падает с 500",
      }),
      createInspection(),
      developmentTemplates,
    )

    expect(latestPrompt()).toContain(
      "Bug reports, production incidents, regressions, and 'something broke' requests should prefer the bug-investigation start",
    )
  })

  it("tells the agent that detailed PRDs and specs are plan-ready", async () => {
    mockAgentJson()

    await routeCreateEntry(
      createInput({
        draftPrompt:
          "build this app from the PRD with user stories and acceptance criteria",
        requestedResult:
          "build this app from the PRD with user stories and acceptance criteria",
      }),
      createInspection({
        git: {
          isRepo: false,
          branch: null,
          hasUncommittedDiff: false,
        },
        manifests: [],
        codeDirs: [],
        fileDensity: "empty",
        fileCountEstimate: 0,
        projectKind: "greenfield_empty",
      }),
      developmentTemplates,
    )

    expect(latestPrompt()).toContain(
      "Detailed PRDs, specs, and requirements docs are plan-ready starts",
    )
  })

  it("includes content domain context and the full content registry in the content router prompt", async () => {
    mockAgentJson({
      recommendedTemplateId: "content-post-calendar",
      alternateTemplateIds: ["content-trend-watch"],
    })

    await routeCreateEntry(
      createInput({
        modeId: "content",
        fallbackTemplateId: "content-trend-watch",
        draftPrompt: "что мне писать на этой неделе про AI agents",
        requestedResult: "что мне писать на этой неделе про AI agents",
        allowedOptions: contentOptions,
        contentContext,
      }),
      createInspection(),
      contentTemplates,
    )

    expect(latestPrompt()).toContain("Content context:")
    expect(latestPrompt()).toContain('"availableTools": [')
    expect(latestPrompt()).toContain('"web_search"')
    expect(latestPrompt()).toContain(
      "- content-pipeline: Build content strategy [Do it / Plan it]",
    )
    expect(latestPrompt()).toContain(
      "- predictable-text-factory: Generate text [Do it]",
    )
    expect(latestPrompt()).toContain(
      "Copy quality review is right when the user has existing text that needs cleanup",
    )
  })
})
