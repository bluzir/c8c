import { mkdtemp, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { NodeState, WorkflowNode } from "../schema"
import {
  listProjectImprovementRecommendations,
  persistProjectImprovementEvidence,
} from "./improvement-store"
import { persistApprovalDecision } from "./run-interrupts"

function createSkillNode(
  id: string,
  prompt: string,
  skillRef: string,
): WorkflowNode {
  return {
    id,
    type: "skill",
    position: { x: 0, y: 0 },
    config: { prompt, skillRef },
  }
}

function createApprovalNode(id: string): WorkflowNode {
  return {
    id,
    type: "approval",
    position: { x: 0, y: 0 },
    config: {
      show_content: true,
      allow_edit: true,
    },
  }
}

function createEvaluatorNode(id: string, threshold: number): WorkflowNode {
  return {
    id,
    type: "evaluator",
    position: { x: 0, y: 0 },
    config: {
      criteria: "Check the output before ship.",
      threshold,
      maxRetries: 2,
    },
  }
}

function createNodeState(
  status: NodeState["status"],
  overrides: Partial<NodeState> = {},
): NodeState {
  return {
    status,
    attempts: status === "completed" || status === "failed" ? 1 : 0,
    log: [],
    ...overrides,
  }
}

describe("improvement-store", () => {
  it("recommends a stronger step variant when recent runs clearly outperform the baseline", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "improvement-store-"))
    const workflowPath = join(projectPath, "flows", "content-flow.yaml")
    const writerNode = createSkillNode(
      "writer",
      "Draft the post from the brief.",
      "content/writer",
    )

    const persistRun = async (
      runId: string,
      promptHash: string,
      status: NodeState["status"],
      retriesUsed: number,
    ) => {
      const workspace = await mkdtemp(
        join(tmpdir(), `improvement-run-${runId}-`),
      )
      await mkdir(workspace, { recursive: true })
      await persistProjectImprovementEvidence({
        projectPath,
        runId,
        workflowName: "Content flow",
        workflowPath,
        workspace,
        status: status === "failed" ? "failed" : "completed",
        startedAt: 10,
        completedAt: 20,
        durationMs: 10,
        runtimeNodes: [writerNode],
        nodeStates: {
          writer: createNodeState(status, {
            attempts: retriesUsed + 1,
            retriesUsed,
            meta: {
              model_id: "sonnet",
              prompt_hash: promptHash,
              skill_ref: "content/writer",
            },
          }),
        },
      })
    }

    await persistRun("run-old-1", "oldpromptaaaa111", "completed", 2)
    await persistRun("run-old-2", "oldpromptaaaa111", "failed", 1)
    await persistRun("run-new-1", "newpromptbbbb222", "completed", 0)
    await persistRun("run-new-2", "newpromptbbbb222", "completed", 0)

    const recommendations = await listProjectImprovementRecommendations(
      projectPath,
      { workflowPath },
    )

    const recommendation = recommendations.find(
      (entry) => entry.kind === "prefer_variant",
    )
    expect(recommendation).toBeTruthy()
    expect(recommendation?.nodeId).toBe("writer")
    expect(recommendation?.candidate?.promptHash).toBe("newpromptbbbb222")
    expect(recommendation?.baseline?.promptHash).toBe("oldpromptaaaa111")
    expect(recommendation?.evidence).toContain("clear vs")
  })

  it("flags repeated approval edits as manual-fix pressure", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "improvement-approval-"))
    const workflowPath = join(projectPath, "flows", "review-flow.yaml")
    const approvalNode = createApprovalNode("approval-1")

    const persistRun = async (
      runId: string,
      editedContent: string | null,
      approved = true,
    ) => {
      const workspace = await mkdtemp(join(tmpdir(), `approval-run-${runId}-`))
      await mkdir(workspace, { recursive: true })
      if (editedContent !== null) {
        await persistApprovalDecision(workspace, "approval-1", {
          approved,
          editedContent,
        })
      }
      await persistProjectImprovementEvidence({
        projectPath,
        runId,
        workflowName: "Review flow",
        workflowPath,
        workspace,
        status: "completed",
        startedAt: 100,
        completedAt: 150,
        durationMs: 50,
        runtimeNodes: [approvalNode],
        nodeStates: {
          "approval-1": createNodeState("completed", {
            output: {
              content: editedContent || "Approved",
              metadata: { source: "approval-1" },
            },
          }),
        },
      })
    }

    await persistRun("run-1", "Tightened final copy")
    await persistRun("run-2", "Reworked the ending")
    await persistRun("run-3", null)

    const recommendations = await listProjectImprovementRecommendations(
      projectPath,
      { workflowPath },
    )

    expect(
      recommendations.some((entry) => entry.kind === "reduce_manual_edits"),
    ).toBe(true)
  })

  it("tracks gate pass rates and retry saves for unstable evaluator steps", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "improvement-gates-"))
    const workflowPath = join(projectPath, "flows", "gate-flow.yaml")
    const evaluatorNode = createEvaluatorNode("qa-check", 0.8)

    const persistRun = async (
      runId: string,
      attempts: Array<{ score: number; passed: boolean }>,
      completedAt: number,
    ) => {
      const workspace = await mkdtemp(join(tmpdir(), `gate-run-${runId}-`))
      await mkdir(workspace, { recursive: true })
      const finalAttempt = attempts[attempts.length - 1]

      await persistProjectImprovementEvidence({
        projectPath,
        runId,
        workflowName: "Gate flow",
        workflowPath,
        workspace,
        status: finalAttempt.passed ? "completed" : "failed",
        startedAt: completedAt - 50,
        completedAt,
        durationMs: 50,
        runtimeNodes: [evaluatorNode],
        nodeStates: {
          "qa-check": createNodeState(
            finalAttempt.passed ? "completed" : "failed",
            {
              attempts: attempts.length,
              retriesUsed: Math.max(0, attempts.length - 1),
              output: {
                content: finalAttempt.passed ? "ok" : "needs work",
                metadata: {
                  source: "qa-check",
                  score: finalAttempt.score,
                },
              },
            },
          ),
        },
        evalResults: {
          "qa-check": attempts.map((attempt, index) => ({
            attempt: index + 1,
            score: attempt.score,
            reason: attempt.passed ? "Pass" : "Fail",
            passed: attempt.passed,
          })),
        },
      })
    }

    await persistRun(
      "run-1",
      [
        { score: 0.4, passed: false },
        { score: 0.86, passed: true },
      ],
      100,
    )
    await persistRun(
      "run-2",
      [
        { score: 0.35, passed: false },
        { score: 0.48, passed: false },
        { score: 0.55, passed: false },
      ],
      200,
    )
    await persistRun("run-3", [{ score: 0.9, passed: true }], 300)

    const recommendations = await listProjectImprovementRecommendations(
      projectPath,
      { workflowPath },
    )

    const recommendation = recommendations.find(
      (entry) => entry.kind === "stabilize_step" && entry.nodeId === "qa-check",
    )
    expect(recommendation).toBeTruthy()
    expect(recommendation?.metrics?.candidateGatePassAt1).toBeCloseTo(1 / 3)
    expect(recommendation?.metrics?.candidateGatePassAt3).toBeCloseTo(2 / 3)
    expect(recommendation?.metrics?.candidateEvaluatorSaveRate).toBeCloseTo(
      1 / 3,
    )
    expect(recommendation?.metrics?.candidateGatePassConsistency).toBe(0)
    expect(recommendation?.evidence).toContain("pass@1 33%")
    expect(recommendation?.evidence).toContain("pass@3 67%")
    expect(recommendation?.evidence).toContain("saved 33% after first fail")
  })
})
