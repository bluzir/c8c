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
})
