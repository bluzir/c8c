import { describe, expect, it } from "vitest"
import type { NodeState, WorkflowRuntimeMeta } from "@shared/types"
import { selectStageRerunNodeId } from "./workflow-rerun-target"

describe("selectStageRerunNodeId", () => {
  it("targets the failed branch before rerunning the whole stage", () => {
    const runtimeMeta: WorkflowRuntimeMeta = {
      "branch-a": {
        subtaskKey: "security",
        branchIndex: 0,
        totalBranches: 3,
        splitterId: "fanout",
        templateId: "repo-auditor",
      },
      "branch-b": {
        subtaskKey: "quality",
        branchIndex: 1,
        totalBranches: 3,
        splitterId: "fanout",
        templateId: "repo-auditor",
      },
      "branch-c": {
        subtaskKey: "architecture",
        branchIndex: 2,
        totalBranches: 3,
        splitterId: "fanout",
        templateId: "repo-auditor",
      },
    }
    const nodeStates: Record<string, NodeState> = {
      "branch-a": { status: "completed", attempts: 1, log: [] },
      "branch-b": { status: "failed", attempts: 1, log: [], error: "merge failed" },
      "branch-c": { status: "completed", attempts: 1, log: [] },
    }

    expect(selectStageRerunNodeId({
      stageNodeId: "repo-auditor",
      stageNodeType: "skill",
      stageTemplateId: null,
      runtimeBranchIds: ["branch-a", "branch-b", "branch-c"],
      runtimeMeta,
      nodeStates,
    })).toBe("branch-b")
  })

  it("falls back to the stage node when there is no incomplete branch", () => {
    expect(selectStageRerunNodeId({
      stageNodeId: "summary",
      stageNodeType: "merger",
      stageTemplateId: null,
      runtimeBranchIds: [],
      runtimeMeta: {},
      nodeStates: {},
    })).toBe("summary")
  })
})
