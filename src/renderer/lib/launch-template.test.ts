import { afterEach, describe, expect, it, vi } from "vitest"
import type {
  ArtifactRecord,
  CreateEntryRouteResult,
  ProjectInspectionSummary,
  Workflow,
  WorkflowFile,
  WorkflowTemplate,
} from "@shared/types"
import { launchTemplate } from "./launch-template"

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
      {
        id: "edge-1",
        source: "input-1",
        target: "output-1",
        type: "default",
      },
    ],
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

function createArtifact(
  overrides: Partial<ArtifactRecord> = {},
): ArtifactRecord {
  return {
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
    ...overrides,
  }
}

function stubApi(overrides: Record<string, unknown> = {}) {
  const loadedWorkflow = createWorkflow("Plan the change")
  const refreshedWorkflows: WorkflowFile[] = [
    {
      name: "Plan the change",
      path: "/tmp/project/plan-the-change.flow.yaml",
      updatedAt: 10,
    },
  ]
  const api = {
    fetchHubTemplate: vi.fn().mockResolvedValue(createTemplate()),
    createWorkflow: vi
      .fn()
      .mockResolvedValue("/tmp/project/plan-the-change.flow.yaml"),
    loadWorkflow: vi.fn().mockResolvedValue(loadedWorkflow),
    listProjectWorkflows: vi.fn().mockResolvedValue(refreshedWorkflows),
    recordProjectTemplateUsage: vi.fn().mockResolvedValue(undefined),
    trackUiEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  vi.stubGlobal("window", { api })
  return api
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("launchTemplate", () => {
  describe("blank workflow (no template)", () => {
    it("creates a blank workflow and returns pending message options", async () => {
      const api = stubApi()

      const result = await launchTemplate({
        projectPath: "/tmp/project",
        template: null,
        requestedResult: "Build a landing page",
        webSearchBackend: "builtin",
      })

      expect(api.createWorkflow).toHaveBeenCalledWith(
        "/tmp/project",
        "new-flow",
        expect.objectContaining({ version: 1 }),
      )
      expect(result.filePath).toBe("/tmp/project/plan-the-change.flow.yaml")
      expect(result.projectPath).toBe("/tmp/project")
      expect(result.openOptions.pendingMessage).toBe("Build a landing page")
      expect(result.openOptions.pendingEntryRequest).toBe(
        "Build a landing page",
      )
      expect(result.openOptions.initialInputValue).toBe(
        "Build a landing page",
      )
      expect(result.openOptions.entryState).toBeUndefined()
      expect(result.openOptions.templateContext).toBeUndefined()
    })

    it("passes sourceAttachments through for blank workflows", async () => {
      stubApi()
      const attachments = [
        { kind: "text" as const, label: "Source", content: "result" },
      ]

      const result = await launchTemplate({
        projectPath: "/tmp/project",
        template: null,
        requestedResult: "Build it",
        sourceAttachments: attachments,
        webSearchBackend: "builtin",
      })

      expect(result.openOptions.initialAttachments).toEqual(attachments)
    })
  })

  describe("non-routed template", () => {
    it("creates workflow from template and builds entry state", async () => {
      const api = stubApi()

      const result = await launchTemplate({
        projectPath: "/tmp/project",
        template: createTemplate(),
        requestedResult: "Plan the refactor",
        webSearchBackend: "builtin",
      })

      expect(api.createWorkflow).toHaveBeenCalledWith(
        "/tmp/project",
        "Plan the change",
        expect.objectContaining({ name: "Plan the change" }),
      )
      expect(api.recordProjectTemplateUsage).toHaveBeenCalledWith(
        "/tmp/project",
        "delivery-plan-phase",
      )
      expect(result.openOptions.entryState).toBeDefined()
      expect(result.openOptions.templateContext).toBeDefined()
      expect(result.openOptions.templateContext?.templateId).toBe(
        "delivery-plan-phase",
      )
    })

    it("resolves hub templates before creating workflow", async () => {
      const api = stubApi()
      const hubTemplate = createTemplate({
        source: "hub",
        workflow: {
          ...createWorkflow(),
          nodes: [],
          edges: [],
        },
      })

      await launchTemplate({
        projectPath: "/tmp/project",
        template: hubTemplate,
        requestedResult: "Plan it",
        webSearchBackend: "builtin",
      })

      expect(api.fetchHubTemplate).toHaveBeenCalledWith("delivery-plan-phase")
    })

    it("applies contract matching for non-routed templates with contractIn", async () => {
      stubApi()
      const template = createTemplate({
        id: "content-post-drafter",
        name: "Post Drafter",
        contractIn: [{ kind: "trend_digest", title: "Trend digest" }],
      })
      const sourceArtifacts = [
        createArtifact({ kind: "trend_digest", title: "Trend Digest" }),
        createArtifact({
          id: "art-2",
          kind: "report",
          title: "Full Report",
          relativePath: "artifacts/report.md",
          contentPath: "/tmp/workspace/artifacts/report.md",
          metadataPath: "/tmp/workspace/artifacts/report.meta.json",
        }),
      ]

      const result = await launchTemplate({
        projectPath: "/tmp/project",
        template,
        requestedResult: "Draft posts",
        sourceArtifacts,
        webSearchBackend: "builtin",
      })

      // Contract matching should filter — only trend_digest should be attached
      const fileAttachments = result.openOptions.initialAttachments?.filter(
        (a) => a.kind === "file",
      )
      expect(fileAttachments).toHaveLength(1)
      expect(fileAttachments?.[0]).toMatchObject({
        kind: "file",
        name: "Trend Digest",
      })
    })

    it("passes all artifacts when template has no contractIn", async () => {
      stubApi()
      const sourceArtifacts = [
        createArtifact({ kind: "trend_digest" }),
        createArtifact({
          id: "art-2",
          kind: "report",
          relativePath: "artifacts/report.md",
          contentPath: "/tmp/workspace/artifacts/report.md",
          metadataPath: "/tmp/workspace/artifacts/report.meta.json",
        }),
      ]

      const result = await launchTemplate({
        projectPath: "/tmp/project",
        template: createTemplate(),
        requestedResult: "Plan it",
        sourceArtifacts,
        webSearchBackend: "builtin",
      })

      const fileAttachments = result.openOptions.initialAttachments?.filter(
        (a) => a.kind === "file",
      )
      expect(fileAttachments).toHaveLength(2)
    })

    it("sets awaitingInput on entry state when requested", async () => {
      stubApi()

      const result = await launchTemplate({
        projectPath: "/tmp/project",
        template: createTemplate(),
        requestedResult: "Plan the refactor",
        webSearchBackend: "builtin",
        awaitingInput: true,
      })

      expect(result.openOptions.entryState?.awaitingInput).toBe(true)
      expect(result.openOptions.initialInputValue).toBeUndefined()
      expect(result.openOptions.autoRunIfAllowed).toBe(false)
    })
  })

  describe("routed template", () => {
    it("delegates to prepareRoutedTemplateLaunch and returns structured result", async () => {
      stubApi()

      const result = await launchTemplate({
        projectPath: "/tmp/project",
        template: createTemplate(),
        requestedResult: "Plan the refactor",
        routeResult: createRouteResult(),
        webSearchBackend: "builtin",
      })

      expect(result.filePath).toBe("/tmp/project/plan-the-change.flow.yaml")
      expect(result.openOptions.entryState).toBeDefined()
      expect(result.openOptions.entryState?.routing).toBeDefined()
      expect(result.openOptions.templateContext).toBeDefined()
    })

    it("applies contract matching for routed templates with contractIn", async () => {
      stubApi()
      const template = createTemplate({
        id: "content-post-drafter",
        name: "Post Drafter",
        contractIn: [{ kind: "trend_digest", title: "Trend digest" }],
      })
      const sourceArtifacts = [
        createArtifact({ kind: "trend_digest" }),
        createArtifact({
          id: "art-2",
          kind: "report",
          relativePath: "artifacts/report.md",
          contentPath: "/tmp/workspace/artifacts/report.md",
          metadataPath: "/tmp/workspace/artifacts/report.meta.json",
        }),
      ]

      const result = await launchTemplate({
        projectPath: "/tmp/project",
        template,
        requestedResult: "Draft posts",
        sourceArtifacts,
        routeResult: createRouteResult({
          recommendedTemplateId: "content-post-drafter",
        }),
        webSearchBackend: "builtin",
      })

      // When contracts are matched for routed templates, initialInputValue
      // should be empty (artifact content becomes primary input)
      expect(result.openOptions.initialInputValue).toBe("")
    })

    it("sets awaitingInput for routed templates", async () => {
      stubApi()

      const result = await launchTemplate({
        projectPath: "/tmp/project",
        template: createTemplate(),
        requestedResult: "Plan the refactor",
        routeResult: createRouteResult(),
        webSearchBackend: "builtin",
        awaitingInput: true,
      })

      expect(result.openOptions.entryState?.awaitingInput).toBe(true)
      expect(result.openOptions.initialInputValue).toBeUndefined()
      expect(result.openOptions.autoRunIfAllowed).toBe(false)
    })

    it("follow-up: artifact becomes primary input when contract matches", async () => {
      stubApi()
      // Simulate: Trend Watch produced a trend_digest artifact,
      // user clicks follow-up → Content Post Drafter (expects trend_digest)
      const template = createTemplate({
        id: "content-post-drafter",
        name: "Post Drafter",
        contractIn: [{ kind: "trend_digest", title: "Trend Digest" }],
      })
      const trendDigest = createArtifact({
        kind: "trend_digest",
        title: "Trend Digest",
        relativePath: ".c8c/artifacts/trend-digest.md",
      })
      const routeResult = createRouteResult({
        recommendedTemplateId: "content-post-drafter",
      })

      const result = await launchTemplate({
        projectPath: "/tmp/project",
        template,
        requestedResult: "Content Post Drafter", // follow-up button label
        sourceArtifacts: [trendDigest],
        routeResult,
        webSearchBackend: "builtin",
      })

      // initialInputValue must be empty — artifact content is the real input
      expect(result.openOptions.initialInputValue).toBe("")

      // The artifact file must appear as an attachment
      const fileAttachments = (result.openOptions.initialAttachments ?? []).filter(
        (a) => a.kind === "file",
      )
      expect(fileAttachments).toHaveLength(1)
      expect(fileAttachments[0]).toMatchObject({
        kind: "file",
        path: ".c8c/artifacts/trend-digest.md",
        name: "Trend Digest",
      })
    })

    it("follow-up: label becomes input when no artifacts provided", async () => {
      stubApi()
      // After app restart: artifactRecords is empty, follow-up clicked
      const template = createTemplate({
        id: "content-post-drafter",
        name: "Post Drafter",
        contractIn: [{ kind: "trend_digest", title: "Trend Digest" }],
      })
      const routeResult = createRouteResult({
        recommendedTemplateId: "content-post-drafter",
      })

      const result = await launchTemplate({
        projectPath: "/tmp/project",
        template,
        requestedResult: "Content Post Drafter",
        sourceArtifacts: [], // empty — the bug scenario
        routeResult,
        webSearchBackend: "builtin",
      })

      // With no artifacts, the route seed's primaryInputValue is used
      // (which is the follow-up label). No file attachments.
      expect(result.openOptions.initialInputValue).toBe("Content Post Drafter")
      const fileAttachments = (result.openOptions.initialAttachments ?? []).filter(
        (a) => a.kind === "file",
      )
      expect(fileAttachments).toHaveLength(0)
    })

    it("follow-up: unmatched artifacts are filtered out by contractIn", async () => {
      stubApi()
      const template = createTemplate({
        id: "content-post-drafter",
        name: "Post Drafter",
        contractIn: [{ kind: "trend_digest", title: "Trend Digest" }],
      })
      // Project artifacts include a trend_digest AND an unrelated report
      const trendDigest = createArtifact({
        kind: "trend_digest",
        title: "Trend Digest",
        relativePath: ".c8c/artifacts/trend-digest.md",
      })
      const report = createArtifact({
        id: "art-report",
        kind: "deep_research",
        title: "Research Report",
        relativePath: ".c8c/artifacts/research-report.md",
        contentPath: "/tmp/workspace/artifacts/research-report.md",
        metadataPath: "/tmp/workspace/artifacts/research-report.json",
      })
      const routeResult = createRouteResult({
        recommendedTemplateId: "content-post-drafter",
      })

      const result = await launchTemplate({
        projectPath: "/tmp/project",
        template,
        requestedResult: "Content Post Drafter",
        sourceArtifacts: [trendDigest, report], // from listProjectArtifacts fallback
        routeResult,
        webSearchBackend: "builtin",
      })

      // Only trend_digest should survive contract matching
      expect(result.openOptions.initialInputValue).toBe("")
      const fileAttachments = (result.openOptions.initialAttachments ?? []).filter(
        (a) => a.kind === "file",
      )
      expect(fileAttachments).toHaveLength(1)
      expect(fileAttachments[0]).toMatchObject({ name: "Trend Digest" })
    })
  })
})
