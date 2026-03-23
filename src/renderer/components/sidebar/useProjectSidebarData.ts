import { useEffect, useState, type Dispatch, type SetStateAction } from "react"
import { useAtom, useSetAtom } from "jotai"
import type {
  DiscoveredSkill,
  RunResult,
  Workflow,
  WorkflowFile,
} from "@shared/types"
import { toastErrorFromCatch } from "@/lib/toast-error"
import { errorToUserMessage } from "@/lib/error-message"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import {
  clearWorkflowTemplateContextForKeyAtom,
  projectLatestRunsCacheAtom,
  projectWorkflowsCacheAtom,
  projectWorkflowsLoadingAtom,
  selectedInboxTaskKeyAtom,
  workflowEntryStateAtom,
  workflowOpenStateAtom,
} from "@/lib/store"
import {
  selectedPastRunAtom,
  toWorkflowExecutionKey,
} from "@/features/execution"
import { latestRunByWorkflowPath } from "./projectSidebarUtils"
import {
  restoreSelectedWorkflowIfNeeded,
  shouldRestoreSelectedWorkflow,
} from "./workflowRestore"

interface UseProjectSidebarDataParams {
  projects: string[]
  selectedProject: string | null
  setProjects: Dispatch<SetStateAction<string[]>>
  setSelectedProject: Dispatch<SetStateAction<string | null>>
  expandedProjects: string[]
  setExpandedProjects: Dispatch<SetStateAction<string[]>>
  workflows: WorkflowFile[]
  setWorkflows: Dispatch<SetStateAction<WorkflowFile[]>>
  setSkills: Dispatch<SetStateAction<DiscoveredSkill[]>>
  selectedWorkflowPath: string | null
  setSelectedWorkflowPath: Dispatch<SetStateAction<string | null>>
  currentWorkflow: Workflow
  setCurrentWorkflow: Dispatch<SetStateAction<Workflow>>
  setWorkflowSavedSnapshot: Dispatch<SetStateAction<string>>
}

export function useProjectSidebarData({
  projects,
  selectedProject,
  setProjects,
  setSelectedProject,
  expandedProjects,
  setExpandedProjects,
  workflows,
  setWorkflows,
  setSkills,
  selectedWorkflowPath,
  setSelectedWorkflowPath,
  currentWorkflow,
  setCurrentWorkflow,
  setWorkflowSavedSnapshot,
}: UseProjectSidebarDataParams) {
  const setWorkflowOpenState = useSetAtom(workflowOpenStateAtom)
  const clearWorkflowTemplateContextForKey = useSetAtom(
    clearWorkflowTemplateContextForKeyAtom,
  )
  const setSelectedInboxTaskKey = useSetAtom(selectedInboxTaskKeyAtom)
  const setSelectedPastRun = useSetAtom(selectedPastRunAtom)
  const setWorkflowEntryState = useSetAtom(workflowEntryStateAtom)
  const [projectWorkflowsCache, setProjectWorkflowsCache] = useAtom(
    projectWorkflowsCacheAtom,
  )
  const [projectLatestRunsCache, setProjectLatestRunsCache] = useAtom(
    projectLatestRunsCacheAtom,
  )
  const [projectWorkflowsLoading, setProjectWorkflowsLoading] = useAtom(
    projectWorkflowsLoadingAtom,
  )
  const [globalWorkflows, setGlobalWorkflows] = useState<WorkflowFile[]>([])

  const toLatestRunRecord = (runs: RunResult[]) => {
    const map = latestRunByWorkflowPath(runs)
    return Object.fromEntries(map.entries())
  }

  useEffect(() => {
    let cancelled = false

    void window.api
      .listProjects()
      .then((projects) => {
        if (cancelled) return
        setProjects(projects)
      })
      .catch((error) => {
        if (cancelled) return
        setProjects([])
        toastErrorFromCatch("Could not load projects", error)
      })

    void window.api
      .getSelectedProject()
      .then((projectPath) => {
        if (cancelled || !projectPath) return
        setSelectedProject(projectPath)
      })
      .catch((error) => {
        if (cancelled) return
        toastErrorFromCatch("Could not restore the selected project", error)
      })

    return () => {
      cancelled = true
    }
  }, [setProjects, setSelectedProject])

  useEffect(() => {
    if (selectedProject) {
      let cancelled = false
      setProjectWorkflowsLoading((prev) => ({
        ...prev,
        [selectedProject]: true,
      }))

      void window.api
        .listProjectWorkflows(selectedProject)
        .then((workflows) => {
          if (cancelled) return
          setWorkflows(workflows)
          setProjectWorkflowsCache((prev) => ({
            ...prev,
            [selectedProject]: workflows,
          }))
          setProjectWorkflowsLoading((prev) => ({
            ...prev,
            [selectedProject]: false,
          }))
        })
        .catch((error) => {
          if (cancelled) return
          setWorkflows([])
          setProjectWorkflowsLoading((prev) => ({
            ...prev,
            [selectedProject]: false,
          }))
          toastErrorFromCatch("Could not load project data", error)
        })

      void window.api
        .scanSkills(selectedProject)
        .then((skills) => {
          if (cancelled) return
          setSkills(skills)
        })
        .catch((error) => {
          if (cancelled) return
          setSkills([])
          toastErrorFromCatch("Could not load project skills", error)
        })

      void window.api
        .listRuns(selectedProject)
        .then((runs) => {
          if (cancelled) return
          setProjectLatestRunsCache((prev) => ({
            ...prev,
            [selectedProject]: toLatestRunRecord(runs),
          }))
        })
        .catch(() => {
          // Ignore run-history refresh failures in the sidebar; activity surfaces handle deeper errors.
        })

      void window.api.setSelectedProject(selectedProject).catch((error) => {
        if (cancelled) return
        toastErrorFromCatch("Could not persist the selected project", error)
      })

      return () => {
        cancelled = true
      }
    }

    setWorkflows([])
    setSkills([])
  }, [selectedProject, setSkills, setWorkflows])

  useEffect(() => {
    if (!selectedProject) return
    setProjectWorkflowsCache((prev) => {
      const current = prev[selectedProject]
      if (current === workflows) return prev
      if (
        Array.isArray(current) &&
        current.length === workflows.length &&
        current.every((workflow, index) => {
          const next = workflows[index]
          return (
            workflow.path === next?.path &&
            workflow.name === next?.name &&
            workflow.updatedAt === next?.updatedAt
          )
        })
      ) {
        return prev
      }
      return {
        ...prev,
        [selectedProject]: workflows,
      }
    })
  }, [selectedProject, workflows])

  useEffect(() => {
    window.api
      .listGlobalWorkflows()
      .then(setGlobalWorkflows)
      .catch(() => setGlobalWorkflows([]))
  }, [])

  useEffect(() => {
    if (!shouldRestoreSelectedWorkflow(selectedWorkflowPath, currentWorkflow))
      return

    let cancelled = false
    setWorkflowOpenState({
      status: "loading",
      targetPath: selectedWorkflowPath,
      message: null,
    })

    void restoreSelectedWorkflowIfNeeded({
      selectedWorkflowPath,
      currentWorkflow,
      loadWorkflow: (workflowPath) => window.api.loadWorkflow(workflowPath),
    })
      .then((loadedWorkflow) => {
        if (cancelled || !loadedWorkflow) return
        setWorkflowOpenState({
          status: "idle",
          targetPath: null,
          message: null,
        })
        setCurrentWorkflow(loadedWorkflow)
        setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
      })
      .catch((error) => {
        if (cancelled) return
        setWorkflowOpenState({
          status: "error",
          targetPath: selectedWorkflowPath,
          message: errorToUserMessage(error),
        })
        setSelectedWorkflowPath(null)
        setSelectedInboxTaskKey(null)
        setSelectedPastRun(null)
        clearWorkflowTemplateContextForKey(toWorkflowExecutionKey(null))
        setWorkflowEntryState(null)
        const emptyWorkflow = createEmptyWorkflow()
        setCurrentWorkflow(emptyWorkflow)
        setWorkflowSavedSnapshot(workflowSnapshot(emptyWorkflow))
        toastErrorFromCatch(
          "Could not restore the previously opened flow",
          error,
        )
      })

    return () => {
      cancelled = true
    }
  }, [
    currentWorkflow,
    selectedWorkflowPath,
    setCurrentWorkflow,
    clearWorkflowTemplateContextForKey,
    setSelectedInboxTaskKey,
    setSelectedPastRun,
    setSelectedWorkflowPath,
    setWorkflowEntryState,
    setWorkflowSavedSnapshot,
    setWorkflowOpenState,
  ])

  useEffect(() => {
    setExpandedProjects((prev) => {
      if (prev.length < 2) return prev
      const unique = Array.from(new Set(prev))
      return unique.length === prev.length ? prev : unique
    })
  }, [setExpandedProjects])

  useEffect(() => {
    let cancelled = false

    for (const path of projects) {
      if (path === selectedProject) continue
      if (projectWorkflowsCache[path] && projectLatestRunsCache[path]) continue
      if (projectWorkflowsLoading[path]) continue
      setProjectWorkflowsLoading((prev) => ({ ...prev, [path]: true }))
      void window.api
        .listProjectWorkflows(path)
        .then((wfs) => {
          if (cancelled) return
          setProjectWorkflowsCache((prev) => {
            if (prev[path]) return prev
            return {
              ...prev,
              [path]: wfs,
            }
          })
          setProjectWorkflowsLoading((prev) => ({ ...prev, [path]: false }))
        })
        .catch(() => {
          // Ignore background prefetch failures; the active project effect surfaces foreground errors.
          if (cancelled) return
          setProjectWorkflowsLoading((prev) => ({ ...prev, [path]: false }))
        })

      void window.api
        .listRuns(path)
        .then((runs) => {
          if (cancelled) return
          setProjectLatestRunsCache((prev) => ({
            ...prev,
            [path]: toLatestRunRecord(runs),
          }))
        })
        .catch(() => {
          // Ignore background run-history failures for non-selected projects.
        })
    }

    return () => {
      cancelled = true
    }
  }, [
    projectLatestRunsCache,
    projectWorkflowsCache,
    projectWorkflowsLoading,
    projects,
    selectedProject,
  ])

  const toggleProjectExpansion = (projectPath: string) => {
    setExpandedProjects((prev) =>
      prev.includes(projectPath)
        ? prev.filter((path) => path !== projectPath)
        : [...prev, projectPath],
    )
  }

  return {
    projectWorkflowsCache,
    projectLatestRunsCache,
    projectWorkflowsLoading,
    setProjectWorkflowsCache,
    setProjectLatestRunsCache,
    globalWorkflows,
    toggleProjectExpansion,
  }
}
