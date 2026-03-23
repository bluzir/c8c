import { useState, type Dispatch, type SetStateAction } from "react"
import { useSetAtom } from "jotai"
import type { MainView } from "@/lib/store"
import type { RunResult, Workflow, WorkflowFile } from "@shared/types"
import { toast } from "sonner"
import { errorToUserMessage } from "@/lib/error-message"
import { toastError, toastErrorFromCatch } from "@/lib/toast-error"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { selectedInboxTaskKeyAtom, workflowOpenStateAtom } from "@/lib/store"
import {
  selectedPastRunAtom,
  toWorkflowExecutionKey,
} from "@/features/execution"

interface UseWorkflowCrudParams {
  selectedProject: string | null
  setProjects: Dispatch<SetStateAction<string[]>>
  setSelectedProject: Dispatch<SetStateAction<string | null>>
  setExpandedProjects: Dispatch<SetStateAction<string[]>>
  setWorkflows: Dispatch<SetStateAction<WorkflowFile[]>>
  setProjectWorkflowsCache: Dispatch<
    SetStateAction<Record<string, WorkflowFile[]>>
  >
  selectedWorkflowPath: string | null
  setSelectedWorkflowPath: Dispatch<SetStateAction<string | null>>
  currentWorkflow: Workflow
  setCurrentWorkflow: Dispatch<SetStateAction<Workflow>>
  setWorkflowSavedSnapshot: Dispatch<SetStateAction<string>>
  setMainView: Dispatch<SetStateAction<MainView>>
  workflowDirty: boolean
  confirmDiscard: (action: string, workflowDirty: boolean) => Promise<boolean>
  clearDraftExecutionState: () => void
  workflowHasActiveRun: (workflowPath: string) => boolean
  moveWorkflowExecutionState: (params: {
    fromKey: string
    toKey: string
  }) => void
  clearWorkflowExecutionState: (workflowKey: string) => void
  moveWorkflowRequestedResult: (params: {
    fromKey: string
    toKey: string
  }) => void
  clearWorkflowRequestedResult: (workflowKey: string) => void
  moveWorkflowContinuationEntryState: (params: {
    fromKey: string
    toKey: string
  }) => void
  clearWorkflowContinuationEntryState: (workflowKey: string) => void
  moveWorkflowTemplateContext: (params: {
    fromKey: string
    toKey: string
  }) => void
  clearWorkflowTemplateContext: (workflowKey: string) => void
  resolveWorkflowReviewRun?: (
    workflowPath: string,
    projectPath?: string,
  ) => RunResult | null
  onProjectAdd?: (projectPath: string) => void
  onWorkflowCreate?: (workflowPath: string) => void
}

export function createEmptySelectionState(
  setSelectedWorkflowPath: Dispatch<SetStateAction<string | null>>,
  setCurrentWorkflow: Dispatch<SetStateAction<Workflow>>,
  setWorkflowSavedSnapshot: Dispatch<SetStateAction<string>>,
  clearDraftExecutionState: () => void,
  clearReviewState?: () => void,
): void {
  setSelectedWorkflowPath(null)
  const emptyWorkflow = createEmptyWorkflow()
  setCurrentWorkflow(emptyWorkflow)
  setWorkflowSavedSnapshot(workflowSnapshot(emptyWorkflow))
  clearDraftExecutionState()
  clearReviewState?.()
}

export function applyLoadedWorkflow(
  workflowPath: string,
  workflow: Workflow,
  setSelectedWorkflowPath: Dispatch<SetStateAction<string | null>>,
  setCurrentWorkflow: Dispatch<SetStateAction<Workflow>>,
  setWorkflowSavedSnapshot: Dispatch<SetStateAction<string>>,
  clearReviewState?: () => void,
): void {
  // Execution state is keyed by workflow path and must survive workflow switches.
  setSelectedWorkflowPath(workflowPath)
  setCurrentWorkflow(workflow)
  setWorkflowSavedSnapshot(workflowSnapshot(workflow))
  clearReviewState?.()
}

export function removeWorkflowFromProjectCaches(
  caches: Record<string, WorkflowFile[]>,
  workflowPath: string,
): Record<string, WorkflowFile[]> {
  let changed = false
  const next: Record<string, WorkflowFile[]> = {}

  for (const [projectPath, workflows] of Object.entries(caches)) {
    const filtered = workflows.filter(
      (workflow) => workflow.path !== workflowPath,
    )
    next[projectPath] = filtered
    if (filtered.length !== workflows.length) {
      changed = true
    }
  }

  return changed ? next : caches
}

export function applyWorkflowSelectionReviewState(
  reviewRun: RunResult | null,
  clearReviewState: () => void,
  setSelectedPastRun: (value: RunResult | null) => void,
): void {
  clearReviewState()
  if (reviewRun) {
    setSelectedPastRun(reviewRun)
  }
}

export function useWorkflowCrud({
  selectedProject,
  setProjects,
  setSelectedProject,
  setExpandedProjects,
  setWorkflows,
  setProjectWorkflowsCache,
  selectedWorkflowPath,
  setSelectedWorkflowPath,
  currentWorkflow,
  setCurrentWorkflow,
  setWorkflowSavedSnapshot,
  setMainView,
  workflowDirty,
  confirmDiscard,
  clearDraftExecutionState,
  workflowHasActiveRun,
  moveWorkflowExecutionState,
  clearWorkflowExecutionState,
  moveWorkflowRequestedResult,
  clearWorkflowRequestedResult,
  moveWorkflowContinuationEntryState,
  clearWorkflowContinuationEntryState,
  moveWorkflowTemplateContext,
  clearWorkflowTemplateContext,
  resolveWorkflowReviewRun,
  onProjectAdd,
  onWorkflowCreate,
}: UseWorkflowCrudParams) {
  const setWorkflowOpenState = useSetAtom(workflowOpenStateAtom)
  const setSelectedInboxTaskKey = useSetAtom(selectedInboxTaskKeyAtom)
  const setSelectedPastRun = useSetAtom(selectedPastRunAtom)
  const [pendingRenameWorkflow, setPendingRenameWorkflow] =
    useState<WorkflowFile | null>(null)
  const [renameInput, setRenameInput] = useState("")
  const [pendingDeleteWorkflow, setPendingDeleteWorkflow] =
    useState<WorkflowFile | null>(null)
  const [pendingRemoveProject, setPendingRemoveProject] = useState<
    string | null
  >(null)
  const [creatingWorkflow, setCreatingWorkflow] = useState(false)
  const clearReviewState = () => {
    setSelectedInboxTaskKey(null)
    setSelectedPastRun(null)
  }

  const addProject = async () => {
    if (
      selectedProject &&
      !(await confirmDiscard("switch projects", workflowDirty))
    ) {
      return
    }

    try {
      const projectPath = await window.api.addProject()
      if (!projectPath) return

      setProjects((prev) =>
        prev.includes(projectPath) ? prev : [...prev, projectPath],
      )
      setSelectedProject(projectPath)
      createEmptySelectionState(
        setSelectedWorkflowPath,
        setCurrentWorkflow,
        setWorkflowSavedSnapshot,
        clearDraftExecutionState,
        clearReviewState,
      )
      onProjectAdd?.(projectPath)
    } catch (error) {
      toastErrorFromCatch("Could not add project", error)
    }
  }

  const requestRemoveProject = (projectPath: string) => {
    setPendingRemoveProject(projectPath)
  }

  const commitRemoveProject = async () => {
    const projectPath = pendingRemoveProject
    if (!projectPath) return
    setPendingRemoveProject(null)

    try {
      await window.api.removeProject(projectPath)
      setProjects((prev) => prev.filter((path) => path !== projectPath))
      setExpandedProjects((prev) => prev.filter((path) => path !== projectPath))
      setProjectWorkflowsCache((prev) => {
        const next = { ...prev }
        delete next[projectPath]
        return next
      })
    } catch (error) {
      toastErrorFromCatch("Could not remove project", error)
      return
    }

    if (selectedProject !== projectPath) return

    setSelectedProject(null)
    setWorkflows([])
    createEmptySelectionState(
      setSelectedWorkflowPath,
      setCurrentWorkflow,
      setWorkflowSavedSnapshot,
      clearDraftExecutionState,
      clearReviewState,
    )
  }

  const selectWorkflow = async (
    workflow: WorkflowFile,
    projectPath?: string,
  ) => {
    const reviewRun =
      resolveWorkflowReviewRun?.(workflow.path, projectPath) || null
    if (selectedWorkflowPath === workflow.path) {
      applyWorkflowSelectionReviewState(
        reviewRun,
        clearReviewState,
        setSelectedPastRun,
      )
      setMainView("thread")
      return
    }
    if (!(await confirmDiscard("open another flow", workflowDirty))) {
      return
    }

    if (projectPath && selectedProject !== projectPath) {
      setSelectedProject(projectPath)
    }

    setMainView("thread")
    const loadingToastId = toast.loading("Opening flow...")
    setWorkflowOpenState({
      status: "loading",
      targetPath: workflow.path,
      message: null,
    })
    try {
      const loadedWorkflow = await window.api.loadWorkflow(workflow.path)
      toast.dismiss(loadingToastId)
      setWorkflowOpenState({
        status: "idle",
        targetPath: null,
        message: null,
      })
      applyLoadedWorkflow(
        workflow.path,
        loadedWorkflow,
        setSelectedWorkflowPath,
        setCurrentWorkflow,
        setWorkflowSavedSnapshot,
        clearReviewState,
      )
      if (reviewRun) {
        setSelectedPastRun(reviewRun)
      }
    } catch (error) {
      toast.dismiss(loadingToastId)
      setWorkflowOpenState({
        status: "error",
        targetPath: workflow.path,
        message: errorToUserMessage(error),
      })
      toastErrorFromCatch("Could not open flow", error)
    }
  }

  const createWorkflow = async (projectPath: string) => {
    if (creatingWorkflow) return
    if (!(await confirmDiscard("create a new flow", workflowDirty))) {
      return
    }

    setCreatingWorkflow(true)
    try {
      const name = "new-flow"
      const chain = createEmptyWorkflow()
      const filePath = await window.api.createWorkflow(projectPath, name, chain)
      const loadedWorkflow = await window.api.loadWorkflow(filePath)
      const workflowNameFromPath =
        filePath
          .split(/[\\/]/)
          .pop()
          ?.replace(/\.(chain|yaml|yml)$/i, "") || name

      setMainView("thread")
      setWorkflows((prev) => [
        {
          name: loadedWorkflow.name || workflowNameFromPath,
          path: filePath,
          updatedAt: Date.now(),
        },
        ...prev,
      ])
      applyLoadedWorkflow(
        filePath,
        loadedWorkflow,
        setSelectedWorkflowPath,
        setCurrentWorkflow,
        setWorkflowSavedSnapshot,
        clearReviewState,
      )
      onWorkflowCreate?.(filePath)
      setPendingRenameWorkflow({
        name: loadedWorkflow.name || workflowNameFromPath,
        path: filePath,
        updatedAt: Date.now(),
      })
    } catch (error) {
      toastErrorFromCatch("Could not create flow", error)
    } finally {
      setCreatingWorkflow(false)
    }
  }

  const createNewWorkflow = async () => {
    if (selectedProject) {
      await createWorkflow(selectedProject)
      return
    }

    const projectPath = await window.api.addProject()
    if (!projectPath) return

    setProjects((prev) =>
      prev.includes(projectPath) ? prev : [...prev, projectPath],
    )
    setSelectedProject(projectPath)
    await createWorkflow(projectPath)
  }

  const selectGlobalWorkflow = async (workflow: WorkflowFile) => {
    const reviewRun = resolveWorkflowReviewRun?.(workflow.path) || null
    if (!selectedProject) {
      toastError("Open a project first to run this flow")
      return
    }
    if (selectedWorkflowPath === workflow.path) {
      applyWorkflowSelectionReviewState(
        reviewRun,
        clearReviewState,
        setSelectedPastRun,
      )
      setMainView("thread")
      return
    }
    if (!(await confirmDiscard("open another flow", workflowDirty))) {
      return
    }

    setMainView("thread")
    const loadingToastId = toast.loading("Opening flow...")
    setWorkflowOpenState({
      status: "loading",
      targetPath: workflow.path,
      message: null,
    })
    try {
      const loadedWorkflow = await window.api.loadWorkflow(workflow.path)
      toast.dismiss(loadingToastId)
      setWorkflowOpenState({
        status: "idle",
        targetPath: null,
        message: null,
      })
      applyLoadedWorkflow(
        workflow.path,
        loadedWorkflow,
        setSelectedWorkflowPath,
        setCurrentWorkflow,
        setWorkflowSavedSnapshot,
        clearReviewState,
      )
      if (reviewRun) {
        setSelectedPastRun(reviewRun)
      }
    } catch (error) {
      toast.dismiss(loadingToastId)
      setWorkflowOpenState({
        status: "error",
        targetPath: workflow.path,
        message: errorToUserMessage(error),
      })
      toastErrorFromCatch("Could not open flow", error)
    }
  }

  const requestRenameWorkflow = (workflow: WorkflowFile) => {
    if (workflowHasActiveRun(workflow.path)) {
      toastError("Stop the flow before renaming it")
      return
    }
    setRenameInput(workflow.name)
    setPendingRenameWorkflow(workflow)
  }

  const commitRenameWorkflow = async () => {
    const workflow = pendingRenameWorkflow
    if (!workflow) return
    const nextName = renameInput.trim()
    if (!nextName || nextName === workflow.name) {
      setPendingRenameWorkflow(null)
      return
    }
    if (workflowHasActiveRun(workflow.path)) {
      toastError("Stop the flow before renaming it")
      setPendingRenameWorkflow(null)
      return
    }

    let renamedPath: string
    try {
      renamedPath = await window.api.renameWorkflow(workflow.path, nextName)
      moveWorkflowExecutionState({
        fromKey: toWorkflowExecutionKey(workflow.path),
        toKey: toWorkflowExecutionKey(renamedPath),
      })
      moveWorkflowRequestedResult({
        fromKey: toWorkflowExecutionKey(workflow.path),
        toKey: toWorkflowExecutionKey(renamedPath),
      })
      moveWorkflowContinuationEntryState({
        fromKey: toWorkflowExecutionKey(workflow.path),
        toKey: toWorkflowExecutionKey(renamedPath),
      })
      moveWorkflowTemplateContext({
        fromKey: toWorkflowExecutionKey(workflow.path),
        toKey: toWorkflowExecutionKey(renamedPath),
      })

      if (selectedWorkflowPath === workflow.path) {
        setSelectedWorkflowPath(renamedPath)
        const renamedWorkflow = { ...currentWorkflow, name: nextName }
        setCurrentWorkflow(renamedWorkflow)
        setWorkflowSavedSnapshot(workflowSnapshot(renamedWorkflow))
      }

      setPendingRenameWorkflow(null)
      toast.success(`Flow renamed: ${nextName}`)
    } catch (error) {
      toastErrorFromCatch("Could not rename flow", error)
      return
    }

    if (selectedProject) {
      try {
        const refreshed = await window.api.listProjectWorkflows(selectedProject)
        setWorkflows(refreshed)
      } catch (error) {
        toastErrorFromCatch("Flow renamed but sidebar refresh failed", error)
      }
    }
  }

  const requestDeleteWorkflow = (workflow: WorkflowFile) => {
    if (workflowHasActiveRun(workflow.path)) {
      toastError("Stop the flow before deleting it")
      return
    }
    setPendingDeleteWorkflow(workflow)
  }

  const commitDeleteWorkflow = async () => {
    const workflow = pendingDeleteWorkflow
    if (!workflow) return
    setPendingDeleteWorkflow(null)
    if (workflowHasActiveRun(workflow.path)) {
      toastError("Stop the flow before deleting it")
      return
    }

    try {
      await window.api.deleteWorkflow(workflow.path)
      clearWorkflowExecutionState(toWorkflowExecutionKey(workflow.path))
      clearWorkflowRequestedResult(toWorkflowExecutionKey(workflow.path))
      clearWorkflowContinuationEntryState(toWorkflowExecutionKey(workflow.path))
      clearWorkflowTemplateContext(toWorkflowExecutionKey(workflow.path))

      setWorkflows((previous) =>
        previous.filter((entry) => entry.path !== workflow.path),
      )
      setProjectWorkflowsCache((previous) =>
        removeWorkflowFromProjectCaches(previous, workflow.path),
      )

      if (selectedProject) {
        const refreshed = await window.api.listProjectWorkflows(selectedProject)
        setWorkflows(refreshed)
        setProjectWorkflowsCache((previous) => ({
          ...previous,
          [selectedProject]: refreshed,
        }))
      }

      if (selectedWorkflowPath === workflow.path) {
        createEmptySelectionState(
          setSelectedWorkflowPath,
          setCurrentWorkflow,
          setWorkflowSavedSnapshot,
          clearDraftExecutionState,
          clearReviewState,
        )
      }

      toast.success(`Flow deleted: ${workflow.name}`)
    } catch (error) {
      toastErrorFromCatch("Could not delete flow", error)
    }
  }

  const duplicateWorkflow = async (
    workflow: WorkflowFile,
    projectPath?: string,
  ) => {
    try {
      const newPath = await window.api.duplicateWorkflow(workflow.path)
      if (projectPath) {
        const refreshed = await window.api.listProjectWorkflows(projectPath)
        if (projectPath === selectedProject) {
          setWorkflows(refreshed)
        } else {
          setProjectWorkflowsCache((prev) => ({
            ...prev,
            [projectPath]: refreshed,
          }))
        }
      }

      if (!(await confirmDiscard("open duplicated flow", workflowDirty))) {
        toast.success("Flow duplicated")
        return
      }

      const loadedWorkflow = await window.api.loadWorkflow(newPath)
      if (projectPath && projectPath !== selectedProject) {
        setSelectedProject(projectPath)
      }
      setSelectedWorkflowPath(newPath)
      setCurrentWorkflow(loadedWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
      clearReviewState()
      setMainView("thread")
      toast.success("Flow duplicated")
    } catch (error) {
      toastErrorFromCatch("Could not duplicate flow", error)
    }
  }

  const copyWorkflowToProject = async (
    workflow: WorkflowFile,
    projectPath: string,
  ) => {
    try {
      const loadedWorkflow = await window.api.loadWorkflow(workflow.path)
      await window.api.createWorkflow(
        projectPath,
        loadedWorkflow.name || workflow.name || "flow",
        loadedWorkflow,
      )
      const refreshed = await window.api.listProjectWorkflows(projectPath)
      if (projectPath === selectedProject) {
        setWorkflows(refreshed)
      } else {
        setProjectWorkflowsCache((prev) => ({
          ...prev,
          [projectPath]: refreshed,
        }))
      }
      const projectName =
        projectPath.split(/[\\/]/).filter(Boolean).pop() || projectPath
      toast.success(`Copied to ${projectName}`)
    } catch (error) {
      toastErrorFromCatch("Could not copy flow to project", error)
    }
  }

  return {
    pendingRenameWorkflow,
    setPendingRenameWorkflow,
    renameInput,
    setRenameInput,
    pendingDeleteWorkflow,
    setPendingDeleteWorkflow,
    pendingRemoveProject,
    setPendingRemoveProject,
    creatingWorkflow,
    addProject,
    requestRemoveProject,
    commitRemoveProject,
    selectWorkflow,
    createNewWorkflow,
    selectGlobalWorkflow,
    requestRenameWorkflow,
    commitRenameWorkflow,
    requestDeleteWorkflow,
    commitDeleteWorkflow,
    duplicateWorkflow,
    copyWorkflowToProject,
  }
}
