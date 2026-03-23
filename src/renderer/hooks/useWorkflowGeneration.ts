import { useEffect, useRef, useState } from "react"
import type {
  DiscoveredSkill,
  GenerationProgress,
  RunResult,
  Workflow,
  WorkflowFile,
} from "@shared/types"
import { toast } from "sonner"
import { cloneWorkflow } from "@/lib/workflow-graph-utils"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import type {
  WorkflowEntryState,
  WorkflowTemplateRunContext,
} from "@/lib/workflow-entry"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import { applyWorkflowDetailBudget } from "@/lib/workflow-detail-budget"

type GenerationTarget = "replace" | "new"

interface UseWorkflowGenerationArgs {
  workflow: Workflow
  setWorkflow: (next: Workflow) => void
  selectedWorkflowPath: string | null
  setSelectedWorkflowPath: (next: string | null) => void
  setWorkflowSavedSnapshot: (next: string) => void
  setWorkflows: (next: WorkflowFile[]) => void
  selectedInboxTaskKey: string | null
  setSelectedInboxTaskKey: (next: string | null) => void
  selectedPastRun: RunResult | null
  setSelectedPastRun: (next: RunResult | null) => void
  workflowEntryState: WorkflowEntryState | null
  setWorkflowEntryState: (next: WorkflowEntryState | null) => void
  selectedWorkflowTemplateContext: WorkflowTemplateRunContext | null
  setWorkflowTemplateContextForKey: (params: {
    key: string
    context: WorkflowTemplateRunContext | null
  }) => void
  skills: DiscoveredSkill[]
  setSkills: (next: DiscoveredSkill[]) => void
  selectedProject: string | null
  detailBudget: number
  onOpenChange: (open: boolean) => void
  onGenerated?: (payload: {
    workflow: Workflow
    workflowPath: string | null
    request: string
    target: GenerationTarget
  }) => void
}

export function useWorkflowGeneration({
  workflow,
  setWorkflow,
  selectedWorkflowPath,
  setSelectedWorkflowPath,
  setWorkflowSavedSnapshot,
  setWorkflows,
  selectedInboxTaskKey,
  setSelectedInboxTaskKey,
  selectedPastRun,
  setSelectedPastRun,
  workflowEntryState,
  setWorkflowEntryState,
  selectedWorkflowTemplateContext,
  setWorkflowTemplateContextForKey,
  skills,
  setSkills,
  selectedProject,
  detailBudget,
  onOpenChange,
  onGenerated,
}: UseWorkflowGenerationArgs) {
  const [description, setDescription] = useState("")
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const generationTokenRef = useRef(0)

  useEffect(() => {
    return () => {
      generationTokenRef.current += 1
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [])

  const cancelPendingGeneration = () => {
    generationTokenRef.current += 1
    cleanupRef.current?.()
    cleanupRef.current = null
    setGenerating(false)
    setProgress(null)
    window.api.cancelGenerate()
  }

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && generating) {
      cancelPendingGeneration()
    }
    onOpenChange(nextOpen)
  }

  const hasWorkflowContent = (candidate: Workflow): boolean =>
    candidate.nodes.some(
      (node) => node.type !== "input" && node.type !== "output",
    ) ||
    candidate.name.trim().length > 0 ||
    (candidate.description || "").trim().length > 0

  const generate = async (target: GenerationTarget) => {
    if (!description.trim()) return
    if (target === "new" && !selectedProject) {
      setError("Select a project before generating a new flow file.")
      return
    }

    const token = generationTokenRef.current + 1
    generationTokenRef.current = token

    setGenerating(true)
    setError(null)
    setProgress({ step: "starting", count: 0 })

    cleanupRef.current?.()
    cleanupRef.current = window.api.onGenerateProgress((nextProgress) => {
      if (generationTokenRef.current !== token) return
      setProgress(nextProgress)
    })

    try {
      const skillInfos = skills.map((skill) => ({
        name: skill.name,
        category: skill.category,
        description: skill.description,
      }))

      const generatedWorkflow = applyWorkflowDetailBudget(
        await window.api.generateWorkflow(
          description,
          skillInfos,
          selectedProject || undefined,
        ),
        detailBudget,
      )
      if (generationTokenRef.current !== token) return

      const previousWorkflow = cloneWorkflow(workflow)
      const previousWorkflowPath = selectedWorkflowPath
      const previousWorkflowKey = toWorkflowExecutionKey(previousWorkflowPath)

      if (target === "new") {
        const baseName = generatedWorkflow.name.trim() || "generated-flow"
        const createdPath = await window.api.createWorkflow(
          selectedProject!,
          baseName,
          generatedWorkflow,
        )
        const savedWorkflow = await window.api.loadWorkflow(createdPath)
        const refreshed = await window.api.listProjectWorkflows(
          selectedProject!,
        )

        if (generationTokenRef.current !== token) return

        setWorkflows(refreshed)
        setSelectedWorkflowPath(createdPath)
        setWorkflow(savedWorkflow)
        setWorkflowSavedSnapshot(workflowSnapshot(savedWorkflow))
        setSelectedInboxTaskKey(null)
        setSelectedPastRun(null)
        onGenerated?.({
          workflow: savedWorkflow,
          workflowPath: createdPath,
          request: description,
          target,
        })
        toast.success("Ready to run", {
          description: "The agent prepared a new flow in your project.",
        })
      } else {
        const previousReviewState = {
          selectedInboxTaskKey,
          selectedPastRun,
        }
        const previousEntryState = workflowEntryState
        const previousTemplateContext = selectedWorkflowTemplateContext

        setWorkflow(generatedWorkflow)
        setSelectedInboxTaskKey(null)
        setSelectedPastRun(null)
        setWorkflowEntryState(null)
        setWorkflowTemplateContextForKey({
          key: previousWorkflowKey,
          context: null,
        })
        onGenerated?.({
          workflow: generatedWorkflow,
          workflowPath: previousWorkflowPath,
          request: description,
          target,
        })
        // Replacing current workflow intentionally marks editor dirty.
        toast.success("Ready to review", {
          description:
            "The agent replaced the current draft with a runnable flow.",
          action: hasWorkflowContent(previousWorkflow)
            ? {
                label: "Undo",
                onClick: () => {
                  setWorkflow(previousWorkflow)
                  setSelectedWorkflowPath(previousWorkflowPath)
                  setSelectedInboxTaskKey(
                    previousReviewState.selectedInboxTaskKey,
                  )
                  setSelectedPastRun(previousReviewState.selectedPastRun)
                  setWorkflowEntryState(previousEntryState)
                  setWorkflowTemplateContextForKey({
                    key: previousWorkflowKey,
                    context: previousTemplateContext,
                  })
                },
              }
            : undefined,
        })
      }

      onOpenChange(false)
      // Keep description so user can refine and regenerate

      if (selectedProject) {
        const updatedSkills = await window.api.scanSkills(selectedProject)
        if (generationTokenRef.current !== token) return
        setSkills(updatedSkills)
      }
    } catch (err) {
      if (generationTokenRef.current !== token) return
      const msg = String(err).replace(
        /^Error: Error invoking remote method '[^']+': Error: /,
        "",
      )
      setError(msg)
    } finally {
      if (generationTokenRef.current !== token) return
      setGenerating(false)
      setProgress(null)
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }

  return {
    description,
    setDescription,
    generating,
    error,
    progress,
    generate,
    cancelPendingGeneration,
    handleDialogOpenChange,
  }
}
