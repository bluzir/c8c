import { describe, expect, it } from "vitest"

import type { EvaluationResult, NodeState, RunResult } from "@shared/types"
import type { RuntimeStagePresentation } from "@/lib/runtime-flow-labels"
import { deriveVerdictData } from "@/components/output/useVerdictData"
import type { ExecutionLoopSummary } from "@/lib/execution-loops"

const RESULT_PRESENTATION: RuntimeStagePresentation = {
  kind: "Result",
  group: "Output",
  title: "QA report",
  outcomeLabel: "Delivers",
  outcomeText: "This step delivers a QA report ready to review.",
  artifactLabel: "QA report",
  artifactRoleLabel: "Final",
}

function createCompletedNodeState(overrides?: Partial<NodeState>): NodeState {
  return {
    status: "completed",
    attempts: 1,
    log: [],
    output: {
      content: "# Result\nBody",
      metadata: {
        source: "agent",
        artifact_label: "QA report",
        reason: "SSR race condition in login component.",
        score: 8.5,
      },
    },
    metrics: {
      tokens_in: 10,
      tokens_out: 20,
      cost_usd: 0.42,
      latency_ms: 2_000,
    },
    warnings: [],
    ...overrides,
  }
}

function createEvalResult(
  overrides?: Partial<EvaluationResult>,
): EvaluationResult {
  return {
    attempt: 1,
    score: 8.5,
    reason: "Evaluator fallback reason",
    passed: true,
    ...overrides,
  }
}

function createExecutionLoopSummary(
  overrides?: Partial<ExecutionLoopSummary>,
): ExecutionLoopSummary {
  return {
    evaluatorNodeId: "result",
    loopLabel: "Review loop",
    title: "Quality check",
    attempt: 1,
    maxAttempts: 2,
    threshold: 8,
    score: 6.5,
    failedCriteriaCount: 2,
    criteriaText: "Check clarity and accessibility",
    criteriaBreakdown: [
      { id: "clarity", score: 7 },
      { id: "accessibility", score: 5 },
    ],
    outcome: "human decision",
    outcomeLabel: "Human decision",
    outcomeSentence: "Human decision required.",
    reason: "Accessibility needs attention before continuing.",
    fixInstructions: "Fix contrast and focus order first.",
    deltaLabel: "8/10 -> 6.5/10",
    ...overrides,
  }
}

function createReviewRun(overrides?: Partial<RunResult>): RunResult {
  return {
    runId: "run-1",
    workflowPath: "/tmp/flow.yaml",
    workflowName: "CTO Optimise Audit",
    status: "failed",
    startedAt: 1,
    completedAt: 2,
    durationMs: 1_000,
    workspace: "/tmp/workspace",
    reportPath: null,
    totalCost: 1.23,
    ...overrides,
  }
}

describe("deriveVerdictData", () => {
  it("prefers structured reason over artifact label for completed results", () => {
    const result = deriveVerdictData({
      nodeStates: {
        result: createCompletedNodeState(),
      },
      evalResults: {
        result: [createEvalResult()],
      },
      selectedResultNodeId: "result",
      selectedResultPresentation: RESULT_PRESENTATION,
      selectedResultBranchLabel: null,
      selectedStagePresentation: RESULT_PRESENTATION,
      selectedStageIndex: 1,
      workflowStepCount: 3,
      completedStageCount: 3,
      failedStageCount: 0,
      reviewingRunHistory: false,
      selectedReviewRun: null,
      executionLoopSummary: null,
      runStatus: "done",
      runOutcome: "completed",
      hasPrimaryContinuation: false,
      isDisplayedResultEmpty: false,
      failedNodeErrors: [],
    })

    expect(result.headline).toBe("SSR race condition in login component.")
    expect(result.surfaceMode).toBe("document")
    expect(result.evidenceItems).toContain("8.5/10")
  })

  it("uses structured failure reason before raw error text", () => {
    const result = deriveVerdictData({
      nodeStates: {
        result: createCompletedNodeState({
          status: "failed",
          output: {
            content: "",
            metadata: {
              source: "agent",
              artifact_label: "QA report",
              reason:
                "Accessibility review failed on contrast and focus order.",
            },
          },
        }),
      },
      evalResults: {
        result: [
          createEvalResult({
            passed: false,
            reason: "Evaluator said something less specific",
          }),
        ],
      },
      selectedResultNodeId: "result",
      selectedResultPresentation: RESULT_PRESENTATION,
      selectedResultBranchLabel: null,
      selectedStagePresentation: RESULT_PRESENTATION,
      selectedStageIndex: 2,
      workflowStepCount: 3,
      completedStageCount: 1,
      failedStageCount: 1,
      reviewingRunHistory: false,
      selectedReviewRun: null,
      executionLoopSummary: null,
      runStatus: "error",
      runOutcome: "failed",
      hasPrimaryContinuation: false,
      isDisplayedResultEmpty: true,
      failedNodeErrors: [
        ["result", { error: "Raw stack trace line 1\nline 2" }],
      ],
    })

    expect(result.headline).toBe(
      "Accessibility review failed on contrast and focus order.",
    )
    expect(result.tone).toBe("danger")
    expect(result.preservedText).toBe("Previous 1 step remains available.")
  })

  it("keeps failed saved runs in failed verdict mode", () => {
    const result = deriveVerdictData({
      nodeStates: {
        system_mapper: createCompletedNodeState({
          status: "failed",
          output: undefined,
        }),
      },
      evalResults: {
        system_mapper: [],
      },
      selectedResultNodeId: "system_mapper",
      selectedResultPresentation: {
        ...RESULT_PRESENTATION,
        title: "System Mapper",
        artifactLabel: "System Mapper output",
        artifactRoleLabel: "Working",
      },
      selectedResultBranchLabel: null,
      selectedStagePresentation: {
        ...RESULT_PRESENTATION,
        title: "System Mapper",
        artifactLabel: "System Mapper output",
        artifactRoleLabel: "Working",
      },
      selectedStageIndex: 1,
      workflowStepCount: 3,
      completedStageCount: 1,
      failedStageCount: 1,
      reviewingRunHistory: true,
      selectedReviewRun: createReviewRun(),
      executionLoopSummary: null,
      runStatus: "idle",
      runOutcome: null,
      hasPrimaryContinuation: false,
      isDisplayedResultEmpty: true,
      failedNodeErrors: [
        ["system_mapper", { error: "CLI crashed while mapping the repo." }],
      ],
    })

    expect(result.terminalVariant).toBe("failed")
    expect(result.variant).toBe("diagnostic")
    expect(result.headline).toBe("CLI crashed while mapping the repo.")
  })

  it("promotes evaluator-backed reviews to diagnostic verdicts with an evidence panel", () => {
    const result = deriveVerdictData({
      nodeStates: {
        result: createCompletedNodeState(),
      },
      evalResults: {
        result: [
          createEvalResult({
            score: 6.5,
            passed: false,
            criteria: [
              { id: "clarity", score: 7 },
              { id: "accessibility", score: 5 },
            ],
            fix_instructions: "Fix contrast and focus order first.",
          }),
        ],
      },
      selectedResultNodeId: "result",
      selectedResultPresentation: RESULT_PRESENTATION,
      selectedResultBranchLabel: null,
      selectedStagePresentation: RESULT_PRESENTATION,
      selectedStageIndex: 1,
      workflowStepCount: 3,
      completedStageCount: 3,
      failedStageCount: 0,
      reviewingRunHistory: false,
      selectedReviewRun: null,
      executionLoopSummary: createExecutionLoopSummary(),
      runStatus: "done",
      runOutcome: "completed",
      hasPrimaryContinuation: false,
      isDisplayedResultEmpty: false,
      failedNodeErrors: [],
    })

    expect(result.variant).toBe("diagnostic")
    expect(result.surfaceMode).toBe("decision")
    expect(result.evidencePanelTitle).toBe("Review loop")
    expect(result.evidencePanelItems).toHaveLength(2)
    expect(result.followUpLabel).toBe("Create follow-up flow")
  })

  it("renders structured diagnostic summaries outside evaluator loops", () => {
    const result = deriveVerdictData({
      nodeStates: {
        result: createCompletedNodeState({
          output: {
            content: "# Audit report\nBody",
            metadata: {
              source: "agent",
              artifact_label: "Audit report",
              diagnostic_summary: {
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
                    detail:
                      "Users can lose a live approval request when they leave the workflow view.",
                    severity: "danger",
                  },
                ],
              },
            },
          },
        }),
      },
      evalResults: {
        result: [],
      },
      selectedResultNodeId: "result",
      selectedResultPresentation: RESULT_PRESENTATION,
      selectedResultBranchLabel: null,
      selectedStagePresentation: RESULT_PRESENTATION,
      selectedStageIndex: 1,
      workflowStepCount: 3,
      completedStageCount: 3,
      failedStageCount: 0,
      reviewingRunHistory: false,
      selectedReviewRun: null,
      executionLoopSummary: null,
      runStatus: "done",
      runOutcome: "completed",
      hasPrimaryContinuation: false,
      isDisplayedResultEmpty: false,
      failedNodeErrors: [],
    })

    expect(result.variant).toBe("diagnostic")
    expect(result.tone).toBe("danger")
    expect(result.headline).toBe("Critical UX debt blocks reliable execution.")
    expect(result.evidenceItems).toContain("2 critical")
    expect(result.evidenceItems).toContain("3 high")
    expect(result.evidencePanelTitle).toBe("Top findings")
    expect(result.evidencePanelItems).toMatchObject([
      {
        id: "approval-dialog-unmount",
        title: "Approval dialog unmounts on navigation",
        detail:
          "Users can lose a live approval request when they leave the workflow view.",
      },
    ])
  })
})
