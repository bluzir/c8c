import { useCallback } from "react"

import { toast } from "sonner"

import { addSkillNodeToWorkflow } from "@/lib/workflow-mutations"
import type { DiscoveredSkill } from "@shared/types"

export function useWorkflowPanelEntryActions({
  effectiveEntryStageLabel,
  blockedResumeSummary,
  openSkillPicker,
  setWorkflow,
  setSelectedNodeId,
  setShowEntryEditor,
  setFlowSurfaceMode,
  setPrepareNewRun,
  setSelectedInboxTaskKey,
  setWorkflowEntryState,
}: {
  effectiveEntryStageLabel: string | null
  blockedResumeSummary: { currentStepLabel?: string | null } | null
  openSkillPicker: (request: {
    title: string
    description?: string
    searchPlaceholder?: string
    emptyStateMessage?: string
    emptyResultsMessage?: (query: string) => string
    stageLabel?: string | null
    attachTargetLabel?: string
    onAddSkill: (skill: DiscoveredSkill) => void
  }) => void
  setWorkflow: ReturnType<
    typeof import("@/hooks/useWorkflowWithUndo").useWorkflowWithUndo
  >["setWorkflow"]
  setSelectedNodeId: (value: string | null) => void
  setShowEntryEditor: (value: boolean) => void
  setFlowSurfaceMode: (value: "outline" | "edit") => void
  setPrepareNewRun: (value: boolean) => void
  setSelectedInboxTaskKey: (value: string | null) => void
  setWorkflowEntryState: (
    value: import("@/lib/workflow-entry").WorkflowEntryState | null,
  ) => void
}) {
  const handleAddSkillToFlow = useCallback(
    (skill: DiscoveredSkill) => {
      let nextSelectedId: string | null = null
      setWorkflow((previous) => {
        const previousNodeIds = new Set(previous.nodes.map((node) => node.id))
        const next = addSkillNodeToWorkflow(previous, skill)
        nextSelectedId =
          next.nodes.find((node) => !previousNodeIds.has(node.id))?.id ?? null
        return next
      })
      if (nextSelectedId) {
        setSelectedNodeId(nextSelectedId)
      }
      setShowEntryEditor(true)
      setFlowSurfaceMode("edit")
    },
    [setFlowSurfaceMode, setSelectedNodeId, setShowEntryEditor, setWorkflow],
  )

  const handleAddSkillSelection = useCallback(
    (skill: DiscoveredSkill) => {
      handleAddSkillToFlow(skill)
      toast.success(`Added ${skill.name}`, {
        description: "Added to this flow as a new step.",
      })
    },
    [handleAddSkillToFlow],
  )

  const handleAttachCapability = useCallback(() => {
    openSkillPicker({
      title: "Attach skill",
      description: "Choose a reusable skill to add to the current flow.",
      searchPlaceholder: "Search skills...",
      emptyStateMessage:
        "No skills available. Open a project with local skills, or visit Skills to connect a skill source.",
      emptyResultsMessage: (query) => `No skills found for “${query}”`,
      stageLabel: effectiveEntryStageLabel,
      attachTargetLabel: "this flow",
      onAddSkill: (skill) => {
        handleAddSkillToFlow(skill)
        toast.success(`Attached ${skill.name}`, {
          description: "Added to this flow. Review the new skill in Edit flow.",
        })
      },
    })
  }, [effectiveEntryStageLabel, handleAddSkillToFlow, openSkillPicker])

  const handleDismissEntry = useCallback(() => {
    setPrepareNewRun(true)
    if (blockedResumeSummary) {
      setSelectedInboxTaskKey(null)
      return
    }
    setWorkflowEntryState(null)
  }, [
    blockedResumeSummary,
    setPrepareNewRun,
    setSelectedInboxTaskKey,
    setWorkflowEntryState,
  ])

  return {
    handleAddSkillSelection,
    handleAttachCapability,
    handleDismissEntry,
  }
}
