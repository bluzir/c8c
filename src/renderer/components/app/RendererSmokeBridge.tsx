import { useAtom, useAtomValue } from "jotai"
import { useLayoutEffect, useCallback } from "react"
import {
  currentWorkflowAtom,
  factoryBetaEnabledAtom,
  firstLaunchAtom,
  mainViewAtom,
  projectWorkflowsCacheAtom,
  projectsAtom,
  selectedInboxTaskKeyAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  viewModeAtom,
  workflowSavedSnapshotAtom,
  workflowsAtom,
  desktopRuntimeAtom,
} from "@/lib/store"
import {
  approvalRequestsAtom,
  selectedPastRunAtom,
  workflowExecutionStatesAtom,
} from "@/features/execution"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { createEmptyWorkflowExecutionState } from "@/lib/workflow-execution"
import type {
  ElectronRendererSmokeHarness,
  ElectronSmokeExecutionSeedInput,
  ElectronSmokeMainViewInput,
  ElectronSmokeUiState,
  ElectronSmokeWorkflowOpenInput,
} from "@shared/electron-smoke"

function hasGlobalSettingsHeading() {
  return Array.from(document.querySelectorAll("h1")).some(
    (heading) => heading.textContent?.trim() === "Global Settings",
  )
}

function ensureRendererSmokeHarness(): ElectronRendererSmokeHarness {
  const existing = (window.__C8C_RENDERER_SMOKE__ ??
    {}) as Partial<ElectronRendererSmokeHarness>
  window.__C8C_RENDERER_SMOKE__ = existing as ElectronRendererSmokeHarness
  return window.__C8C_RENDERER_SMOKE__ as ElectronRendererSmokeHarness
}

export function RendererSmokeBridge({
  commandPaletteOpen,
  sidebarOpen,
  availableWorkflowNames,
}: {
  commandPaletteOpen: boolean
  sidebarOpen: boolean
  availableWorkflowNames: string[]
}) {
  const [mainView, setMainView] = useAtom(mainViewAtom)
  const [viewMode, setViewMode] = useAtom(viewModeAtom)
  const [firstLaunch, setFirstLaunch] = useAtom(firstLaunchAtom)
  const [factoryBetaEnabled, setFactoryBetaEnabled] = useAtom(
    factoryBetaEnabledAtom,
  )
  const [projects, setProjects] = useAtom(projectsAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(
    selectedWorkflowPathAtom,
  )
  const [currentWorkflow, setCurrentWorkflow] = useAtom(currentWorkflowAtom)
  const [projectWorkflowsCache, setProjectWorkflowsCache] = useAtom(
    projectWorkflowsCacheAtom,
  )
  const [, setSelectedInboxTaskKey] = useAtom(selectedInboxTaskKeyAtom)
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setWorkflowExecutionStates] = useAtom(workflowExecutionStatesAtom)
  const [, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const [approvalRequests, setApprovalRequests] = useAtom(approvalRequestsAtom)
  const desktopRuntime = useAtomValue(desktopRuntimeAtom)
  const clearReviewState = useCallback(() => {
    setSelectedInboxTaskKey(null)
    setSelectedPastRun(null)
  }, [setSelectedInboxTaskKey, setSelectedPastRun])

  useLayoutEffect(() => {
    if (!__TEST_MODE__) return
    if (firstLaunch) {
      setFirstLaunch(false)
    }
    if (!factoryBetaEnabled) {
      setFactoryBetaEnabled(true)
    }
    if (mainView === "onboarding") {
      setMainView("thread")
    }
  }, [
    factoryBetaEnabled,
    firstLaunch,
    mainView,
    setFactoryBetaEnabled,
    setFirstLaunch,
    setMainView,
  ])

  const openWorkflow = useCallback(
    async ({
      projectPath,
      workflowPath,
      viewMode: nextViewMode = "list",
    }: ElectronSmokeWorkflowOpenInput) => {
      const [loadedWorkflow, projectWorkflows] = await Promise.all([
        window.api.loadWorkflow(workflowPath),
        window.api.listProjectWorkflows(projectPath),
      ])

      setProjects((previous) =>
        previous.includes(projectPath) ? previous : [...previous, projectPath],
      )
      setSelectedProject(projectPath)
      setProjectWorkflowsCache((previous) => ({
        ...previous,
        [projectPath]: projectWorkflows,
      }))
      setWorkflows(projectWorkflows)
      setSelectedWorkflowPath(workflowPath)
      setCurrentWorkflow(loadedWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
      clearReviewState()
      setMainView("thread")
      setViewMode(nextViewMode === "settings" ? "settings" : "list")
      return true
    },
    [
      clearReviewState,
      setCurrentWorkflow,
      setMainView,
      setProjectWorkflowsCache,
      setProjects,
      setSelectedProject,
      setSelectedWorkflowPath,
      setViewMode,
      setWorkflowSavedSnapshot,
      setWorkflows,
    ],
  )

  const setSmokeMainView = useCallback(
    async ({
      mainView: nextMainView,
      projectPath,
    }: ElectronSmokeMainViewInput) => {
      if (projectPath) {
        setProjects((previous) =>
          previous.includes(projectPath)
            ? previous
            : [...previous, projectPath],
        )
        setSelectedProject(projectPath)
      }
      if (nextMainView === "thread" || nextMainView === "workflow_create") {
        clearReviewState()
        setViewMode("list")
      }
      setMainView(nextMainView)
      return true
    },
    [
      clearReviewState,
      setMainView,
      setProjects,
      setSelectedProject,
      setViewMode,
    ],
  )

  const seedExecutionState = useCallback(
    async ({
      workflowKey,
      state,
      approvalRequests: nextApprovalRequests,
    }: ElectronSmokeExecutionSeedInput) => {
      const workflowSnapshotValue =
        state.workflowSnapshot === undefined
          ? currentWorkflow
          : state.workflowSnapshot

      setWorkflowExecutionStates((previous) => ({
        ...previous,
        [workflowKey]: {
          ...createEmptyWorkflowExecutionState(),
          ...state,
          runWorkflowPath: state.runWorkflowPath ?? workflowKey,
          workflowName:
            state.workflowName ??
            workflowSnapshotValue?.name ??
            currentWorkflow.name ??
            "",
          projectPath: state.projectPath ?? selectedProject ?? null,
          workflowSnapshot: workflowSnapshotValue,
          lastUpdatedAt: Date.now(),
        },
      }))

      if (nextApprovalRequests) {
        setApprovalRequests(nextApprovalRequests)
      }

      return true
    },
    [
      currentWorkflow,
      selectedProject,
      setApprovalRequests,
      setWorkflowExecutionStates,
    ],
  )

  if (__TEST_MODE__) {
    const harness = ensureRendererSmokeHarness()
    harness.getUiState = (): ElectronSmokeUiState => ({
      mainView,
      viewMode,
      firstLaunch,
      projectCount: projects.length,
      selectedProject,
      selectedWorkflowPath,
      currentWorkflowName: currentWorkflow.name || "",
      commandPaletteOpen,
      commandPaletteVisible: Boolean(
        document.querySelector('[aria-label="Command palette"]'),
      ),
      sidebarOpen,
      sidebarVisible: Boolean(
        document.querySelector('[aria-label="Project sidebar"]'),
      ),
      applicationShellVisible: Boolean(
        document.querySelector('[role="application"][aria-label="c8c"]'),
      ),
      desktopPlatform: desktopRuntime.platform,
      primaryModifierKey: desktopRuntime.primaryModifierKey,
      availableWorkflowNames,
      approvalDialogOpen:
        approvalRequests.length > 0 &&
        Boolean(document.querySelector('[data-approval-dialog="true"]')),
      settingsPageVisible:
        mainView === "settings" && hasGlobalSettingsHeading(),
    })
    harness.openWorkflow = openWorkflow
    harness.setMainView = setSmokeMainView
    harness.seedExecutionState = seedExecutionState
  }

  useLayoutEffect(() => {
    if (!__TEST_MODE__) return

    const harness = ensureRendererSmokeHarness()
    return () => {
      if (window.__C8C_RENDERER_SMOKE__ !== harness) return
      const nextHarness = harness as Partial<ElectronRendererSmokeHarness>
      delete nextHarness.getUiState
      delete nextHarness.openWorkflow
      delete nextHarness.setMainView
      delete nextHarness.seedExecutionState
    }
  }, [])

  return null
}
