import { afterEach, describe, expect, it, vi } from "vitest"
import type {
  ArtifactRecord,
  Workflow,
  WorkflowFile,
  WorkflowTemplate,
} from "@shared/types"
import { prepareTemplateStageLaunch } from "./factory-launch"
import { workflowSnapshot } from "./workflow-snapshot"

function createWorkflow(name = "Stage workflow"): Workflow {
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

function createTemplate(): WorkflowTemplate {
  return {
    id: "delivery-plan-phase",
    name: "Delivery Plan Phase",
    description: "Turn a scoped change into a plan.",
    stage: "strategy",
    emoji: "P",
    headline: "Plan the change",
    how: "Convert the approved direction into a plan.",
    input: "An approved scope artifact.",
    output: "An execution-ready plan.",
    steps: ["Read", "Plan"],
    workflow: createWorkflow("Template workflow"),
    pack: {
      id: "delivery-foundation",
      label: "Delivery Factory",
      journeyStage: "plan",
    },
  }
}

function createArtifact(
  overrides: Partial<ArtifactRecord> = {},
): ArtifactRecord {
  return {
    id: "artifact-1",
    kind: "spec",
    title: "Approved Scope",
    caseId: "case:plan",
    caseLabel: "Plan landing page refresh",
    projectPath: "/tmp/project",
    workspace: "/tmp/workspace",
    runId: "run-1",
    workflowPath: "/tmp/project/shape.flow.yaml",
    workflowName: "Shape Project",
    relativePath: ".c8c/artifacts/approved-scope.md",
    contentPath: "/tmp/project/.c8c/artifacts/approved-scope.md",
    metadataPath: "/tmp/project/.c8c/artifacts/approved-scope.json",
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("prepareTemplateStageLaunch", () => {
  it("builds stage launch state from the selected template, artifacts, and factory scope", async () => {
    const loadedWorkflow = createWorkflow("Delivery Plan Phase")
    const refreshedWorkflows: WorkflowFile[] = [
      {
        name: "Delivery Plan Phase",
        path: "/tmp/project/delivery-plan-phase.flow.yaml",
        updatedAt: 10,
      },
    ]
    const api = {
      createWorkflow: vi
        .fn()
        .mockResolvedValue("/tmp/project/delivery-plan-phase.flow.yaml"),
      loadWorkflow: vi.fn().mockResolvedValue(loadedWorkflow),
      listProjectWorkflows: vi.fn().mockResolvedValue(refreshedWorkflows),
      recordProjectTemplateUsage: vi
        .fn()
        .mockRejectedValue(new Error("usage store unavailable")),
    }

    vi.stubGlobal("window", { api })

    const template = createTemplate()
    const artifact = createArtifact()
    const launch = await prepareTemplateStageLaunch({
      projectPath: "/tmp/project",
      template,
      webSearchBackend: "builtin",
      artifacts: [artifact],
      factory: {
        id: "factory:delivery",
        label: "Delivery Factory",
      },
      caseOverride: {
        caseId: "case:delivery-plan",
        caseLabel: "Delivery plan",
      },
      inputSeedPrefix: "Turn the approved scope into an execution-ready plan.",
    })

    expect(api.createWorkflow).toHaveBeenCalledWith(
      "/tmp/project",
      "Delivery Plan Phase",
      expect.objectContaining({
        name: "Delivery Plan Phase",
      }),
    )
    expect(api.loadWorkflow).toHaveBeenCalledWith(
      "/tmp/project/delivery-plan-phase.flow.yaml",
    )
    expect(api.listProjectWorkflows).toHaveBeenCalledWith("/tmp/project")
    expect(api.recordProjectTemplateUsage).toHaveBeenCalledWith(
      "/tmp/project",
      "delivery-plan-phase",
    )

    expect(launch.filePath).toBe("/tmp/project/delivery-plan-phase.flow.yaml")
    expect(launch.loadedWorkflow).toEqual(loadedWorkflow)
    expect(launch.refreshedWorkflows).toEqual(refreshedWorkflows)
    expect(launch.artifactAttachments).toEqual([
      {
        kind: "file",
        path: ".c8c/artifacts/approved-scope.md",
        name: "Approved Scope",
      },
    ])
    expect(launch.inputSeed).toBe(
      "Turn the approved scope into an execution-ready plan.\n\n---\n\nUse the attached result as the primary context for this step. Add any extra scope or constraints here before running.",
    )
    expect(launch.entryState).toMatchObject({
      workflowPath: "/tmp/project/delivery-plan-phase.flow.yaml",
      workflowName: "Delivery Plan Phase",
      source: "template",
    })
    expect(launch.templateContext).toMatchObject({
      templateId: "delivery-plan-phase",
      templateName: "Delivery Plan Phase",
      workflowPath: "/tmp/project/delivery-plan-phase.flow.yaml",
      workflowName: "Delivery Plan Phase",
      factoryId: "factory:delivery",
      factoryLabel: "Delivery Factory",
      caseId: "case:delivery-plan",
      caseLabel: "Delivery plan",
      sourceArtifactIds: ["artifact-1"],
    })
    expect(launch.savedSnapshot).toBe(workflowSnapshot(loadedWorkflow))
  })

  it("does not wait for template usage recording before returning launch data", async () => {
    let resolveUsage: (() => void) | undefined
    const usagePromise = new Promise<void>((resolve) => {
      resolveUsage = resolve
    })
    const api = {
      createWorkflow: vi
        .fn()
        .mockResolvedValue("/tmp/project/delivery-plan-phase.flow.yaml"),
      loadWorkflow: vi
        .fn()
        .mockResolvedValue(createWorkflow("Delivery Plan Phase")),
      listProjectWorkflows: vi.fn().mockResolvedValue([]),
      recordProjectTemplateUsage: vi.fn().mockReturnValue(usagePromise),
    }

    vi.stubGlobal("window", { api })

    const launchPromise = prepareTemplateStageLaunch({
      projectPath: "/tmp/project",
      template: createTemplate(),
      webSearchBackend: "builtin",
      artifacts: [],
    })

    const outcome = await Promise.race([
      launchPromise.then(() => "launched"),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve("timed-out"), 0),
      ),
    ])

    expect(outcome).toBe("launched")
    resolveUsage?.()
    await launchPromise
  })
})
