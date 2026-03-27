import { afterEach, describe, expect, it, vi } from "vitest"
import type {
  ArtifactRecord,
  CreateEntryRouteResult,
  ProjectInspectionSummary,
  Workflow,
  WorkflowFile,
  WorkflowTemplate,
} from "@shared/types"
import { prepareRoutedTemplateLaunch } from "./routed-template-launch"
import { workflowSnapshot } from "./workflow-snapshot"

function createWorkflow(name = "Template workflow"): Workflow {
  return {
    version: 1,
    name,
    description: "",
    defaults: {
      model: "sonnet",
      maxTurns: 40,
      timeout_minutes: 30,
      maxParallel: 4,
    },
    nodes: [
      {
        id: "input-1",
        type: "input",
        position: { x: 0, y: 0 },
        config: { inputType: "text", required: true },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 240, y: 0 },
        config: { title: "Result" },
      },
    ],
    edges: [
      { id: "edge-1", source: "input-1", target: "output-1", type: "default" },
    ],
  }
}

function createEmptyWorkflow(name = "Template workflow"): Workflow {
  return {
    version: 1,
    name,
    description: "",
    defaults: {
      model: "sonnet",
      maxTurns: 40,
      timeout_minutes: 30,
      maxParallel: 4,
    },
    nodes: [],
    edges: [],
  }
}

function createProjectInspection(): ProjectInspectionSummary {
  return {
    projectPath: "/tmp/project",
    git: {
      isRepo: true,
      branch: "main",
      hasUncommittedDiff: false,
    },
    manifests: [],
    codeDirs: ["src"],
    fileDensity: "active",
    fileCountEstimate: 42,
    projectKind: "existing_repo",
  }
}

function createRouteResult(
  overrides: Partial<CreateEntryRouteResult> = {},
): CreateEntryRouteResult {
  return {
    recommendedTemplateId: "delivery-plan-phase",
    alternateTemplateIds: ["delivery-map-codebase"],
    reason: "Plan-first fits this request.",
    projectInspection: createProjectInspection(),
    seed: {
      primaryInputMode: "text",
      primaryInputValue: "Plan the landing page refactor",
      attachments: [],
    },
    domainMode: "development",
    confidence: 0.91,
    source: "agent",
    clarification: null,
    ...overrides,
  }
}

function createTemplate(
  overrides: Partial<WorkflowTemplate> = {},
): WorkflowTemplate {
  return {
    id: "delivery-plan-phase",
    name: "Delivery Factory: Plan the change",
    description: "Turn a scoped change into a delivery plan.",
    stage: "research",
    emoji: "P",
    headline: "Plan the change",
    how: "Translate the scoped request into a concrete plan.",
    input: "A scoped request.",
    output: "A delivery plan.",
    steps: ["Read", "Plan"],
    workflow: createWorkflow("Delivery Factory: Plan the change"),
    pack: {
      id: "delivery-factory",
      label: "Delivery Factory",
      journeyStage: "plan",
    },
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("prepareRoutedTemplateLaunch", () => {
  it("hydrates hub templates and normalizes the launch name before creating the workflow", async () => {
    const loadedWorkflow = createWorkflow("Plan the change")
    const refreshedWorkflows: WorkflowFile[] = [
      {
        name: "Plan the change",
        path: "/tmp/project/plan-the-change.flow.yaml",
        updatedAt: 10,
      },
    ]
    const api = {
      fetchHubTemplate: vi.fn().mockResolvedValue(
        createTemplate({
          source: "hub",
          workflow: createWorkflow("Delivery Factory: Plan the change"),
        }),
      ),
      createWorkflow: vi
        .fn()
        .mockResolvedValue("/tmp/project/plan-the-change.flow.yaml"),
      loadWorkflow: vi.fn().mockResolvedValue(loadedWorkflow),
      listProjectWorkflows: vi.fn().mockResolvedValue(refreshedWorkflows),
      recordProjectTemplateUsage: vi.fn().mockResolvedValue(undefined),
    }

    vi.stubGlobal("window", { api })

    const launch = await prepareRoutedTemplateLaunch({
      projectPath: "/tmp/project",
      template: createTemplate({
        source: "hub",
        workflow: createEmptyWorkflow("Delivery Factory: Plan the change"),
      }),
      webSearchBackend: "builtin",
      routeResult: createRouteResult(),
      requestedResult: "Plan the landing page refactor",
    })

    expect(api.fetchHubTemplate).toHaveBeenCalledWith("delivery-plan-phase")
    expect(api.createWorkflow).toHaveBeenCalledWith(
      "/tmp/project",
      "Plan the change",
      expect.objectContaining({
        name: "Plan the change",
      }),
    )
    expect(launch.loadedWorkflow).toEqual(loadedWorkflow)
    expect(launch.refreshedWorkflows).toEqual(refreshedWorkflows)
    expect(launch.templateStartState.templateContext.templateName).toBe(
      "Plan the change",
    )
    expect(launch.savedSnapshot).toBe(workflowSnapshot(loadedWorkflow))
  })

  it("applies contract matching when template has contractIn and sourceArtifacts are provided", async () => {
    const loadedWorkflow = createWorkflow("Post Drafter")
    const api = {
      fetchHubTemplate: vi.fn(),
      createWorkflow: vi
        .fn()
        .mockResolvedValue("/tmp/project/post-drafter.flow.yaml"),
      loadWorkflow: vi.fn().mockResolvedValue(loadedWorkflow),
      listProjectWorkflows: vi.fn().mockResolvedValue([]),
      recordProjectTemplateUsage: vi.fn().mockResolvedValue(undefined),
    }
    vi.stubGlobal("window", { api })

    const sourceArtifacts: ArtifactRecord[] = [
      {
        id: "art-1",
        kind: "trend_digest",
        title: "Trend Digest",
        relativePath: "artifacts/trend-digest.md",
        contentPath: "/tmp/workspace/artifacts/trend-digest.md",
        metadataPath: "/tmp/workspace/artifacts/trend-digest.meta.json",
        projectPath: "/tmp/project",
        workspace: "/tmp/workspace",
        runId: "run-1",
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: "art-2",
        kind: "report",
        title: "Full Report",
        relativePath: "artifacts/report.md",
        contentPath: "/tmp/workspace/artifacts/report.md",
        metadataPath: "/tmp/workspace/artifacts/report.meta.json",
        projectPath: "/tmp/project",
        workspace: "/tmp/workspace",
        runId: "run-1",
        createdAt: 1000,
        updatedAt: 1000,
      },
    ]

    const launch = await prepareRoutedTemplateLaunch({
      projectPath: "/tmp/project",
      template: createTemplate({
        id: "content-post-drafter",
        name: "Post Drafter",
        contractIn: [{ kind: "trend_digest", title: "Trend digest" }],
      }),
      webSearchBackend: "builtin",
      routeResult: createRouteResult({
        recommendedTemplateId: "content-post-drafter",
        seed: {
          primaryInputMode: "text",
          primaryInputValue: "Content Post Drafter",
          attachments: [],
        },
      }),
      requestedResult: "Content Post Drafter",
      sourceArtifacts,
    })

    // Contract matching should select only the trend_digest artifact (not the report)
    const attachments = launch.templateStartState.initialAttachments
    expect(attachments).toHaveLength(1)
    expect(attachments[0]).toMatchObject({
      kind: "file",
      name: "Trend Digest",
    })

    // When contracts are matched, initialInputValue should be empty
    // (artifact content becomes primary input via attachment, not the follow-up label)
    expect(launch.templateStartState.initialInputValue).toBe("")
  })

  it("preserves reroute metadata in the resulting template start state", async () => {
    const loadedWorkflow = createWorkflow("Plan the change")
    const api = {
      fetchHubTemplate: vi.fn(),
      createWorkflow: vi
        .fn()
        .mockResolvedValue("/tmp/project/plan-the-change.flow.yaml"),
      loadWorkflow: vi.fn().mockResolvedValue(loadedWorkflow),
      listProjectWorkflows: vi.fn().mockResolvedValue([]),
      recordProjectTemplateUsage: vi.fn().mockResolvedValue(undefined),
    }

    vi.stubGlobal("window", { api })

    const launch = await prepareRoutedTemplateLaunch({
      projectPath: "/tmp/project",
      template: createTemplate(),
      webSearchBackend: "builtin",
      routeResult: createRouteResult(),
      requestedResult: "Plan the landing page refactor",
      alternateTemplateIds: ["delivery-review-phase"],
    })

    expect(api.fetchHubTemplate).not.toHaveBeenCalled()
    expect(launch.templateStartState.initialInputValue).toBe(
      "Plan the landing page refactor",
    )
    expect(launch.templateStartState.entryState.routing).toMatchObject({
      source: "agent",
      reason: "Plan-first fits this request.",
      confidence: 0.91,
      domainMode: "development",
      alternateTemplateIds: ["delivery-review-phase"],
      projectInspection: createProjectInspection(),
    })
  })
})
