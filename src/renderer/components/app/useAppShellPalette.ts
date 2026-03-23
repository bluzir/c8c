import { useCallback, useMemo, useState } from "react"
import type { Dispatch, SetStateAction } from "react"

import { toast } from "sonner"

import { applyLoadedWorkflow } from "@/components/sidebar/useWorkflowCrud"
import {
  buildAppShellActionEntries,
  buildAppShellProjectEntries,
  buildAppShellWorkflowEntries,
  buildDesktopCommandEntries,
  buildOutputSurfaceActionEntries,
  type AppShellCommandEntry,
} from "@/lib/app-shell-command-palette"
import { dispatchDesktopCommand } from "@/lib/desktop-command-bus"
import { dispatchOutputSurfaceCommand } from "@/lib/output-surface-command-bus"
import type { TemplateLibraryContextState } from "@/lib/template-library-context"
import { toastErrorFromCatch } from "@/lib/toast-error"
import type { MainView } from "@/lib/store"
import type { WorkflowFile, Workflow } from "@shared/types"

type WorkflowExecutionStates = Parameters<
  typeof buildAppShellWorkflowEntries
>[0]["workflowExecutionStates"]
type DesktopMenuState = Parameters<typeof buildDesktopCommandEntries>[0]
type OutputSurfaceCommandState = Parameters<
  typeof buildOutputSurfaceActionEntries
>[0]

export function useAppShellPalette({
  factoryBetaEnabled,
  outputSurfaceCommandState,
  desktopMenuState,
  projects,
  projectWorkflowsCache,
  selectedProject,
  workflows,
  workflowExecutionStates,
  workflowCreateContext,
  mainView,
  workflowDirty,
  clearReviewState,
  confirmDiscard,
  openWorkflowCreate,
  openSkillPickerRequest,
  setProjects,
  setSelectedProject,
  setWorkflows,
  setWorkflowCreateContext,
  setMainView,
  setSelectedWorkflowPath,
  setWorkflow,
  setWorkflowSavedSnapshot,
  setTemplateLibraryContext,
  setMultiRunDashboardOpen,
}: {
  factoryBetaEnabled: boolean
  outputSurfaceCommandState: OutputSurfaceCommandState
  desktopMenuState: DesktopMenuState
  projects: string[]
  projectWorkflowsCache: Record<string, WorkflowFile[]>
  selectedProject: string | null
  workflows: WorkflowFile[]
  workflowExecutionStates: WorkflowExecutionStates
  workflowCreateContext: {
    projectPath: string | null
    locked: boolean
  }
  mainView: MainView
  workflowDirty: boolean
  clearReviewState: () => void
  confirmDiscard: (actionLabel: string, dirty: boolean) => Promise<boolean>
  openWorkflowCreate: (options?: {
    projectPath?: string | null
    prompt?: string
    modeId?: string
  }) => void
  openSkillPickerRequest: () => void
  setProjects: Dispatch<SetStateAction<string[]>>
  setSelectedProject: (value: string | null) => void
  setWorkflows: (value: WorkflowFile[]) => void
  setWorkflowCreateContext: (value: {
    projectPath: string | null
    locked: boolean
  }) => void
  setMainView: (value: MainView) => void
  setSelectedWorkflowPath: Dispatch<SetStateAction<string | null>>
  setWorkflow: Dispatch<SetStateAction<Workflow>>
  setWorkflowSavedSnapshot: Dispatch<
    SetStateAction<
      ReturnType<typeof import("@/lib/workflow-snapshot").workflowSnapshot>
    >
  >
  setTemplateLibraryContext: (value: TemplateLibraryContextState | null) => void
  setMultiRunDashboardOpen: (value: boolean) => void
}) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  const paletteWorkflowCache = useMemo(
    () =>
      selectedProject
        ? {
            ...projectWorkflowsCache,
            [selectedProject]: workflows,
          }
        : projectWorkflowsCache,
    [projectWorkflowsCache, selectedProject, workflows],
  )

  const commandPaletteProjectPath =
    workflowCreateContext.projectPath ?? selectedProject ?? null

  const commandPaletteEntries = useMemo(
    () => [
      ...buildAppShellActionEntries({ includeLab: factoryBetaEnabled }),
      ...buildOutputSurfaceActionEntries(outputSurfaceCommandState),
      ...buildDesktopCommandEntries(desktopMenuState),
      ...buildAppShellProjectEntries({
        projects,
        selectedProject: commandPaletteProjectPath,
      }),
      ...buildAppShellWorkflowEntries({
        projects,
        selectedProject: commandPaletteProjectPath,
        projectWorkflowsCache: paletteWorkflowCache,
        workflowExecutionStates,
      }),
    ],
    [
      commandPaletteProjectPath,
      desktopMenuState,
      factoryBetaEnabled,
      outputSurfaceCommandState,
      paletteWorkflowCache,
      projects,
      workflowExecutionStates,
    ],
  )

  const workflowCommandEntries = useMemo(
    () =>
      commandPaletteEntries.filter(
        (entry): entry is Extract<AppShellCommandEntry, { kind: "workflow" }> =>
          entry.kind === "workflow",
      ),
    [commandPaletteEntries],
  )

  const quickSwitchTargets = useMemo(() => {
    return workflowCommandEntries.slice(0, 5).map((entry) => ({
      workflowPath: entry.workflowPath,
      projectPath: entry.projectPath,
    }))
  }, [workflowCommandEntries])

  const openWorkflowFromPalette = useCallback(
    async ({
      workflowPath,
      projectPath,
    }: {
      workflowPath: string
      projectPath: string
    }) => {
      if (!(await confirmDiscard("open another flow", workflowDirty))) {
        return
      }

      if (projectPath !== selectedProject) {
        setSelectedProject(projectPath)
        const projectWorkflows = paletteWorkflowCache[projectPath]
        if (projectWorkflows) {
          setWorkflows(projectWorkflows)
        }
      }

      setMainView("thread")
      try {
        const loadedWorkflow = await window.api.loadWorkflow(workflowPath)
        applyLoadedWorkflow(
          workflowPath,
          loadedWorkflow,
          setSelectedWorkflowPath,
          setWorkflow,
          setWorkflowSavedSnapshot,
          clearReviewState,
        )
      } catch (error) {
        toastErrorFromCatch("Could not open flow", error)
      }
    },
    [
      clearReviewState,
      confirmDiscard,
      paletteWorkflowCache,
      selectedProject,
      setMainView,
      setSelectedProject,
      setSelectedWorkflowPath,
      setWorkflow,
      setWorkflowSavedSnapshot,
      setWorkflows,
      workflowDirty,
    ],
  )

  const addProjectFromPalette = useCallback(async () => {
    try {
      const projectPath = await window.api.addProject()
      if (!projectPath) return
      setProjects((previous) =>
        previous.includes(projectPath) ? previous : [...previous, projectPath],
      )
      setSelectedProject(projectPath)
      setWorkflows(paletteWorkflowCache[projectPath] || [])
      if (mainView === "workflow_create" && !workflowCreateContext.locked) {
        setWorkflowCreateContext({
          projectPath,
          locked: false,
        })
      }
      toast.success(
        `Added ${projectPath.split(/[\\/]/).filter(Boolean).pop() || "project"}`,
      )
    } catch (error) {
      toastErrorFromCatch("Could not add project", error)
    }
  }, [
    mainView,
    paletteWorkflowCache,
    setProjects,
    setSelectedProject,
    setWorkflowCreateContext,
    setWorkflows,
    workflowCreateContext.locked,
  ])

  const openSkillPicker = useCallback(() => {
    if (mainView !== "thread") {
      setMainView("thread")
    }
    openSkillPickerRequest()
  }, [mainView, openSkillPickerRequest, setMainView])

  const handleCommandPaletteSelect = useCallback(
    (entry: AppShellCommandEntry) => {
      if (entry.kind === "start") {
        openWorkflowCreate({
          projectPath: entry.requiresProjectSelection
            ? null
            : (entry.projectPath ?? commandPaletteProjectPath ?? undefined),
          prompt: entry.prompt,
          modeId: entry.modeId,
        })
        return
      }
      if (entry.kind === "project") {
        setSelectedProject(entry.projectPath)
        const projectWorkflows = paletteWorkflowCache[entry.projectPath]
        if (projectWorkflows) {
          setWorkflows(projectWorkflows)
        }
        if (mainView === "workflow_create" && !workflowCreateContext.locked) {
          setWorkflowCreateContext({
            projectPath: entry.projectPath,
            locked: false,
          })
        }
        return
      }
      if (entry.kind === "workflow") {
        void openWorkflowFromPalette({
          workflowPath: entry.workflowPath,
          projectPath: entry.projectPath,
        })
        return
      }
      if (entry.kind === "desktop_command") {
        dispatchDesktopCommand(entry.commandId)
        return
      }

      const action = entry.action
      if (action === "output_view_result") {
        dispatchOutputSurfaceCommand("output.view_result")
        return
      }
      if (action === "output_view_activity") {
        dispatchOutputSurfaceCommand("output.view_activity")
        return
      }
      if (action === "output_view_log") {
        dispatchOutputSurfaceCommand("output.view_log")
        return
      }
      if (action === "output_view_history") {
        dispatchOutputSurfaceCommand("output.view_history")
        return
      }
      if (action === "output_rerun_from_step") {
        dispatchOutputSurfaceCommand("output.rerun_from_step")
        return
      }
      if (action === "output_use_in_new_flow") {
        dispatchOutputSurfaceCommand("output.use_in_new_flow")
        return
      }
      if (action === "new_process") {
        openWorkflowCreate()
        return
      }
      if (action === "add_project") {
        void addProjectFromPalette()
        return
      }
      if (action === "runs_dashboard") {
        setMultiRunDashboardOpen(true)
        return
      }
      if (action === "process_library") {
        setTemplateLibraryContext(
          mainView === "workflow_create"
            ? {
                projectPath: workflowCreateContext.projectPath,
                createOnly: Boolean(workflowCreateContext.projectPath),
              }
            : null,
        )
        setMainView("templates")
        return
      }
      if (action === "lab") {
        setMainView("factory")
        return
      }
      if (action === "skills") {
        setMainView("skills")
        return
      }
      if (action === "attach_skill") {
        openSkillPicker()
        return
      }
      if (action === "inbox") {
        setMainView("inbox")
        return
      }
      setMainView("settings")
    },
    [
      commandPaletteProjectPath,
      addProjectFromPalette,
      mainView,
      openWorkflowCreate,
      openSkillPicker,
      openWorkflowFromPalette,
      paletteWorkflowCache,
      setMainView,
      setMultiRunDashboardOpen,
      setSelectedProject,
      setTemplateLibraryContext,
      setWorkflowCreateContext,
      setWorkflows,
      workflowCreateContext.locked,
      workflowCreateContext.projectPath,
    ],
  )

  return {
    commandPaletteOpen,
    setCommandPaletteOpen,
    commandPaletteProjectPath,
    commandPaletteEntries,
    workflowCommandEntries,
    quickSwitchTargets,
    openWorkflowFromPalette,
    openSkillPicker,
    clearReviewState,
    handleCommandPaletteSelect,
  }
}
