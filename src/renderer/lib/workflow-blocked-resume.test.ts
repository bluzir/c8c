import { describe, expect, it } from "vitest"
import type {
  ArtifactRecord,
  EvaluationResult,
  HumanTaskSnapshot,
  NodeState,
  Workflow,
} from "@shared/types"
import { deriveWorkflowBlockedResumeSummary } from "./workflow-blocked-resume"

function createWorkflow(): Workflow {
  return {
    version: 1,
    name: "PDF export preflight",
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
        id: "approval-1",
        type: "approval",
        position: { x: 120, y: 0 },
        config: { message: "Ship", show_content: true, allow_edit: false },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 240, y: 0 },
        config: { title: "Verification report" },
      },
    ],
    edges: [
      {
        id: "edge-1",
        source: "input-1",
        target: "approval-1",
        type: "default",
      },
      {
        id: "edge-2",
        source: "approval-1",
        target: "output-1",
        type: "default",
      },
    ],
  }
}

function createTask(
  overrides: Partial<HumanTaskSnapshot> = {},
): HumanTaskSnapshot {
  return {
    task: "Review block",
    taskId: "approval-1",
    kind: "approval",
    status: "open",
    workspace: "/tmp/workspace",
    chainId: "chain-1",
    sourceRunId: "run-1",
    nodeId: "approval-1",
    workflowName: "PDF export preflight",
    workflowPath: "/tmp/project/ship.flow.yaml",
    projectPath: "/tmp/project",
    title: "Ship approval",
    summary:
      "Review and Check passed; final release decision not yet recorded.",
    createdAt: 1,
    updatedAt: 10,
    responseRevision: 0,
    allowEdit: false,
    request: {
      version: 1,
      kind: "approval",
      title: "Ship approval",
      summary: "Approve the release step.",
      fields: [],
    },
    latestResponse: null,
    ...overrides,
  }
}

function createArtifact(
  overrides: Partial<ArtifactRecord> = {},
): ArtifactRecord {
  return {
    id: "artifact-1",
    kind: "verification_report",
    title: "Verification Report",
    caseId: "case:pdf-export",
    caseLabel: "PDF export preflight",
    projectPath: "/tmp/project",
    workspace: "/tmp/workspace",
    runId: "run-1",
    workflowPath: "/tmp/project/ship.flow.yaml",
    workflowName: "PDF export preflight",
    relativePath: ".c8c/artifacts/verification-report.md",
    contentPath: "/tmp/project/.c8c/artifacts/verification-report.md",
    metadataPath: "/tmp/project/.c8c/artifacts/verification-report.json",
    createdAt: 1,
    updatedAt: 10,
    ...overrides,
  }
}

function createEvaluatorWorkflow(): Workflow {
  return {
    version: 1,
    name: "Ship review",
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
        id: "review-1",
        type: "skill",
        position: { x: 120, y: 0 },
        config: { prompt: "Review changes" },
      },
      {
        id: "eval-1",
        type: "evaluator",
        position: { x: 240, y: 0 },
        config: {
          criteria: "Security, regressions, clarity",
          threshold: 8,
          maxRetries: 1,
        },
      },
      {
        id: "approval-1",
        type: "approval",
        position: { x: 360, y: 0 },
        config: { message: "Ship", show_content: true, allow_edit: false },
      },
    ],
    edges: [
      { id: "edge-1", source: "input-1", target: "review-1", type: "default" },
      { id: "edge-2", source: "review-1", target: "eval-1", type: "default" },
      { id: "edge-3", source: "eval-1", target: "approval-1", type: "default" },
    ],
  }
}

describe("workflow-blocked-resume", () => {
  it("builds a blocked approval summary with durable context", () => {
    const summary = deriveWorkflowBlockedResumeSummary({
      workflow: createWorkflow(),
      task: createTask(),
      sourceArtifacts: [createArtifact()],
    })

    expect(summary).toMatchObject({
      workLabel: "PDF export preflight",
      currentStepLabel: "Ship",
      statusText: "Blocked: awaiting your approval before Ship can continue.",
      reasonText:
        "Review and Check passed; final release decision not yet recorded.",
      attachText: "Verification Report",
      latestResultText: "Latest result: Verification Report.",
      primaryActionLabel: "Open approval",
    })
  })

  it("falls back to input-specific copy when a form task blocks continuation", () => {
    const summary = deriveWorkflowBlockedResumeSummary({
      workflow: createWorkflow(),
      task: createTask({
        kind: "form",
        summary: undefined,
        instructions: undefined,
        request: {
          version: 1,
          kind: "form",
          title: "Missing environment input",
          fields: [],
        },
      }),
      sourceArtifacts: [],
    })

    expect(summary.statusText).toBe(
      "Blocked: waiting for input before Ship can continue.",
    )
    expect(summary.reasonText).toBe(
      "Ship is waiting for the missing input before the flow can continue.",
    )
    expect(summary.attachText).toBe(
      "Saved work context is already tied to this step.",
    )
    expect(summary.primaryActionLabel).toBe("Provide input")
  })

  it("uses the most recent artifact even when saved results arrive unsorted", () => {
    const summary = deriveWorkflowBlockedResumeSummary({
      workflow: createWorkflow(),
      task: createTask(),
      sourceArtifacts: [
        createArtifact({
          id: "artifact-older",
          title: "Older verification",
          updatedAt: 5,
        }),
        createArtifact({
          id: "artifact-newer",
          title: "Newest verification",
          updatedAt: 20,
        }),
      ],
    })

    expect(summary.primaryArtifact?.id).toBe("artifact-newer")
    expect(summary.latestResultText).toBe("Latest result: Newest verification.")
    expect(summary.attachText).toBe(
      "Newest verification and Older verification",
    )
  })

  it("derives top findings from evaluator criteria when blocked data exists", () => {
    const nodeStates: Record<string, NodeState> = {
      "eval-1": {
        status: "completed",
        attempts: 1,
        log: [],
      },
      "approval-1": {
        status: "waiting_approval",
        attempts: 0,
        log: [],
      },
    }
    const evalResults: Record<string, EvaluationResult[]> = {
      "eval-1": [
        {
          attempt: 1,
          score: 6.5,
          reason: "Two issues need decision before ship.",
          passed: false,
          criteria: [
            { id: "Security", score: 5 },
            { id: "Regressions", score: 6 },
            { id: "Clarity", score: 9 },
          ],
        },
      ],
    }

    const summary = deriveWorkflowBlockedResumeSummary({
      workflow: createEvaluatorWorkflow(),
      task: createTask({
        request: {
          version: 1,
          kind: "approval",
          title: "Ship approval",
          summary: "Approve the release step.",
          fields: [],
          metadata: { generatedByNodeId: "eval-1" },
        },
      }),
      sourceArtifacts: [createArtifact()],
      nodeStates,
      evalResults,
    })

    expect(summary.findings).toEqual(["Security (5/8)", "Regressions (6/8)"])
  })
})
