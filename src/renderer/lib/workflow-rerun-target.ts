import type { NodeState, WorkflowRuntimeMeta } from "@shared/types"

export interface SelectStageRerunNodeIdArgs {
  stageNodeId: string | null
  stageNodeType: string | null
  stageTemplateId: string | null
  runtimeBranchIds: string[]
  runtimeMeta: WorkflowRuntimeMeta
  nodeStates: Record<string, NodeState>
}

const RERUN_BRANCH_PRIORITY = [
  "failed",
  "waiting_approval",
  "waiting_human",
  "running",
  "queued",
  "pending",
] as const

export function selectStageRerunNodeId({
  stageNodeId,
  stageNodeType,
  stageTemplateId,
  runtimeBranchIds,
  runtimeMeta,
  nodeStates,
}: SelectStageRerunNodeIdArgs) {
  if (!stageNodeId) return null

  const stageBranchIds = stageTemplateId
    ? runtimeBranchIds.filter(
        (id) => runtimeMeta[id]?.templateId === stageTemplateId,
      )
    : stageNodeType === "splitter"
      ? runtimeBranchIds
      : runtimeBranchIds.filter(
          (id) => runtimeMeta[id]?.templateId === stageNodeId,
        )

  const incompleteBranchId =
    RERUN_BRANCH_PRIORITY.flatMap((status) =>
      stageBranchIds.filter(
        (branchId) => (nodeStates[branchId]?.status || "pending") === status,
      ),
    )[0] || null

  return incompleteBranchId || stageNodeId
}
