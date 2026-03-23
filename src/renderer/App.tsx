import { memo, useCallback, useEffect, useRef, type ReactNode } from "react"
import { Provider as JotaiProvider } from "jotai"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { Toaster } from "sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ProjectSidebar } from "@/components/ProjectSidebar"
import { AppStatusBar } from "@/components/AppStatusBar"
import { MultiRunDashboard } from "@/components/MultiRunDashboard"
import { AppCommandPalette } from "@/components/app/AppCommandPalette"
import { DeepLinkTemplateDialog } from "@/components/app/DeepLinkTemplateDialog"
import { useAppShellDeepLinkTemplate } from "@/components/app/useAppShellDeepLinkTemplate"
import { AppMainView } from "@/components/app/AppMainView"
import { RendererSmokeBridge } from "@/components/app/RendererSmokeBridge"
import { SidebarVisibilityToggle } from "@/components/app/SidebarVisibilityToggle"
import { useAppShellPalette } from "@/components/app/useAppShellPalette"
import { ApprovalDialog } from "@/components/ApprovalDialog"
import { SectionErrorBoundary } from "@/components/ui/error-boundary"
import { CliBanner } from "@/components/CliBanner"
import { ExecutionProvider } from "@/hooks/useChainExecution"
import { useCostWarning } from "@/hooks/useCostWarning"
import { CostWarningDialog } from "@/components/workflow-panel/CostWarningDialog"
import {
  mainViewAtom,
  desktopRuntimeAtom,
  chatPanelOpenAtom,
  factoryBetaEnabledAtom,
  workflowDirtyAtom,
  firstLaunchAtom,
  deepLinkPendingTemplateAtom,
  currentWorkflowAtom,
  webSearchBackendAtom,
  projectsAtom,
  projectWorkflowsCacheAtom,
  selectedProjectAtom,
  selectedWorkflowTemplateContextAtom,
  setWorkflowTemplateContextForKeyAtom,
  templateLibraryContextAtom,
  workflowsAtom,
  workflowSavedSnapshotAtom,
  selectedWorkflowPathAtom,
  selectedFactoryCaseIdAtom,
  selectedFactoryIdAtom,
  providerSettingsAtom,
  providerAvailabilityAtom,
  providerAuthStatusAtom,
  projectSidebarOpenAtom,
  projectSidebarWidthAtom,
  selectedInboxTaskKeyAtom,
  openSkillPickerAtom,
  workflowCreateContextAtom,
  desktopMenuStateAtom,
  outputSurfaceCommandStateAtom,
  multiRunDashboardOpenAtom,
} from "@/lib/store"
import { cn } from "@/lib/cn"
import {
  selectedPastRunAtom,
  workflowExecutionStatesAtom,
} from "@/features/execution"
import { resolveAppShellShortcutIntent } from "@/lib/app-shell-shortcuts"
import { isEditableKeyboardTarget } from "@/lib/keyboard-shortcuts"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import { useWorkflowCreateNavigation } from "@/hooks/useWorkflowCreateNavigation"
import { dispatchDesktopCommand } from "@/lib/desktop-command-bus"

const AppShell = memo(function AppShell() {
  const [mainView, setMainView] = useAtom(mainViewAtom)
  const [, setChatPanelOpen] = useAtom(chatPanelOpenAtom)
  const [desktopRuntime, setDesktopRuntime] = useAtom(desktopRuntimeAtom)
  const workflowDirty = useAtomValue(workflowDirtyAtom)
  const [firstLaunch] = useAtom(firstLaunchAtom)
  const [deepLinkTemplate, setDeepLinkTemplate] = useAtom(
    deepLinkPendingTemplateAtom,
  )
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
  const [factoryBetaEnabled] = useAtom(factoryBetaEnabledAtom)
  const [projects, setProjects] = useAtom(projectsAtom)
  const [projectWorkflowsCache] = useAtom(projectWorkflowsCacheAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [workflows, setWorkflows] = useAtom(workflowsAtom)
  const [workflowCreateContext, setWorkflowCreateContext] = useAtom(
    workflowCreateContextAtom,
  )
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(
    selectedWorkflowPathAtom,
  )
  const [selectedWorkflowTemplateContext] = useAtom(
    selectedWorkflowTemplateContextAtom,
  )
  const setSelectedFactoryId = useSetAtom(selectedFactoryIdAtom)
  const setSelectedFactoryCaseId = useSetAtom(selectedFactoryCaseIdAtom)
  const [selectedInboxTaskKey, setSelectedInboxTaskKey] = useAtom(
    selectedInboxTaskKeyAtom,
  )
  const [selectedPastRun, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const setWorkflowTemplateContextForKey = useSetAtom(
    setWorkflowTemplateContextForKeyAtom,
  )
  const setTemplateLibraryContext = useSetAtom(templateLibraryContextAtom)
  const [, setProviderSettings] = useAtom(providerSettingsAtom)
  const [, setProviderAvailability] = useAtom(providerAvailabilityAtom)
  const [, setProviderAuthStatus] = useAtom(providerAuthStatusAtom)
  const [, openSkillPickerRequest] = useAtom(openSkillPickerAtom)
  const setMultiRunDashboardOpen = useSetAtom(multiRunDashboardOpenAtom)
  const [sidebarOpen, setSidebarOpen] = useAtom(projectSidebarOpenAtom)
  const [sidebarWidth] = useAtom(projectSidebarWidthAtom)
  const [workflowExecutionStates] = useAtom(workflowExecutionStatesAtom)
  const desktopMenuState = useAtomValue(desktopMenuStateAtom)
  const outputSurfaceCommandState = useAtomValue(outputSurfaceCommandStateAtom)
  const sidebarShellRef = useRef<HTMLDivElement | null>(null)
  const sidebarToggleRef = useRef<HTMLButtonElement | null>(null)
  const showDragRegion =
    desktopRuntime.titlebarHeight > 0 && !desktopRuntime.isFullscreen
  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()
  const { openWorkflowCreate } = useWorkflowCreateNavigation()
  const toggleSidebar = useCallback(
    (nextOpen = !sidebarOpen) => {
      if (!nextOpen) {
        const activeElement = document.activeElement as HTMLElement | null
        if (activeElement && sidebarShellRef.current?.contains(activeElement)) {
          window.requestAnimationFrame(() => {
            sidebarToggleRef.current?.focus()
          })
        }
      }
      setSidebarOpen(nextOpen)
    },
    [setSidebarOpen, sidebarOpen],
  )
  const {
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
  } = useAppShellPalette({
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
    clearReviewState: () => {
      setSelectedInboxTaskKey(null)
      setSelectedPastRun(null)
    },
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
  })
  const {
    deepLinkTargetProject,
    setDeepLinkTargetProject,
    applyDeepLinkTemplate,
    createDeepLinkTemplate,
  } = useAppShellDeepLinkTemplate({
    deepLinkTemplate,
    setDeepLinkTemplate,
    selectedProject,
    projects,
    workflow,
    selectedWorkflowPath,
    selectedInboxTaskKey,
    selectedPastRun,
    selectedWorkflowTemplateContext,
    webSearchBackend,
    clearReviewState,
    setSelectedProject,
    setWorkflows,
    setWorkflow,
    setWorkflowSavedSnapshot,
    setSelectedWorkflowPath,
    setSelectedInboxTaskKey,
    setSelectedPastRun,
    setWorkflowTemplateContextForKey,
    setMainView,
  })

  // Redirect to onboarding on first launch
  useEffect(() => {
    if (__TEST_MODE__) return
    if (firstLaunch) {
      setMainView("onboarding")
    }
  }, [firstLaunch, setMainView])

  useEffect(() => {
    if (factoryBetaEnabled) return
    setSelectedFactoryId(null)
    setSelectedFactoryCaseId(null)
    if (mainView === "factory") {
      setMainView("thread")
    }
  }, [
    factoryBetaEnabled,
    mainView,
    setMainView,
    setSelectedFactoryCaseId,
    setSelectedFactoryId,
  ])

  useEffect(() => {
    document.documentElement.dataset.platform = desktopRuntime.platform
    document.documentElement.dataset.windowFullscreen =
      desktopRuntime.isFullscreen ? "true" : "false"
    document.documentElement.dataset.windowMaximized =
      desktopRuntime.isMaximized ? "true" : "false"
    document.documentElement.style.setProperty(
      "--titlebar-height",
      `${desktopRuntime.titlebarHeight}px`,
    )
  }, [desktopRuntime])

  useEffect(() => {
    let cancelled = false

    const applyFallbackRuntime = () => {
      if (cancelled) return
      const nav = navigator as Navigator & {
        userAgentData?: { platform?: string }
      }
      const platform = (
        nav.userAgentData?.platform ||
        navigator.platform ||
        ""
      ).toLowerCase()
      const fallbackPlatform = platform.includes("mac")
        ? "macos"
        : platform.includes("win")
          ? "windows"
          : "linux"
      setDesktopRuntime({
        platform: fallbackPlatform,
        titlebarHeight: fallbackPlatform === "macos" ? 24 : 0,
        primaryModifierKey: fallbackPlatform === "macos" ? "meta" : "ctrl",
        primaryModifierLabel: fallbackPlatform === "macos" ? "⌘" : "Ctrl",
        isFullscreen: false,
        isMaximized: false,
      })
    }

    void window.api
      .getDesktopRuntime()
      .then((runtime) => {
        if (cancelled) return
        setDesktopRuntime(runtime)
      })
      .catch(applyFallbackRuntime)

    const unsubscribeRuntime = window.api.onDesktopRuntimeChange((runtime) => {
      if (cancelled) return
      setDesktopRuntime(runtime)
    })

    return () => {
      cancelled = true
      unsubscribeRuntime()
    }
  }, [setDesktopRuntime])

  useEffect(() => {
    void window.api.updateDesktopMenuState(desktopMenuState).catch(() => {})
  }, [desktopMenuState])

  useEffect(() => {
    return window.api.onDesktopCommand((commandId) => {
      dispatchDesktopCommand(commandId)
    })
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isEditable = isEditableKeyboardTarget(
        event.target as HTMLElement | null,
      )
      const intent = resolveAppShellShortcutIntent({
        event,
        primaryModifierKey: desktopRuntime.primaryModifierKey,
        isEditable,
        quickSwitchCount: quickSwitchTargets.length,
      })
      if (!intent) return

      event.preventDefault()

      if (intent.type === "open_settings") {
        setMainView("settings")
        return
      }

      if (intent.type === "toggle_command_palette") {
        setCommandPaletteOpen((open) => !open)
        return
      }

      if (intent.type === "new_flow") {
        openWorkflowCreate()
        return
      }

      if (intent.type === "attach_skill") {
        openSkillPicker()
        return
      }

      if (intent.type === "quick_switch") {
        const targetEntry = quickSwitchTargets[intent.index]
        if (!targetEntry) return
        void openWorkflowFromPalette({
          workflowPath: targetEntry.workflowPath,
          projectPath: targetEntry.projectPath,
        })
        return
      }

      if (intent.type === "toggle_thread") {
        if (mainView !== "thread") {
          setMainView("thread")
        }
        setChatPanelOpen((open) => !open)
        return
      }

      if (intent.type === "toggle_sidebar") {
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", handler)
    return () => {
      window.removeEventListener("keydown", handler)
    }
  }, [
    desktopRuntime.primaryModifierKey,
    mainView,
    openSkillPicker,
    openWorkflowCreate,
    openWorkflowFromPalette,
    quickSwitchTargets,
    setChatPanelOpen,
    setMainView,
    toggleSidebar,
  ])

  useEffect(() => {
    window.api
      .getProviderDiagnostics()
      .then((diagnostics) => {
        setProviderSettings(diagnostics.settings)
        setProviderAvailability(diagnostics.health)
        setProviderAuthStatus(diagnostics.auth)
      })
      .catch(() => {})
  }, [setProviderAuthStatus, setProviderAvailability, setProviderSettings])

  useEffect(() => {
    if (!workflowDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [workflowDirty])

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:m-2"
      >
        Skip to main content
      </a>
      {showDragRegion && (
        <div
          aria-hidden="true"
          className="drag-region fixed top-0 left-0 right-0 z-50"
          style={{ height: "var(--titlebar-height,0px)" }}
        />
      )}
      <SidebarVisibilityToggle
        desktopRuntime={desktopRuntime}
        sidebarOpen={sidebarOpen}
        sidebarWidth={sidebarWidth}
        onToggle={() => toggleSidebar()}
        buttonRef={sidebarToggleRef}
      />
      {__TEST_MODE__ && (
        <RendererSmokeBridge
          commandPaletteOpen={commandPaletteOpen}
          sidebarOpen={sidebarOpen}
          availableWorkflowNames={workflowCommandEntries.map(
            (entry) => entry.label,
          )}
        />
      )}

      <AppCommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        entries={commandPaletteEntries}
        onSelect={handleCommandPaletteSelect}
        primaryModifierLabel={desktopRuntime.primaryModifierLabel}
        selectedProject={commandPaletteProjectPath}
        projects={projects}
      />

      {/* Left sidebar — projects */}
      <SectionErrorBoundary sectionName="project sidebar">
        <div
          ref={sidebarShellRef}
          aria-hidden={!sidebarOpen}
          className={cn(
            "relative h-full shrink-0 min-h-0 overflow-hidden border-r ui-motion-standard transition-[width,opacity,border-color]",
            sidebarOpen
              ? "opacity-100 border-border"
              : "opacity-0 border-transparent",
          )}
          style={{ width: sidebarOpen ? sidebarWidth : 0 }}
          inert={!sidebarOpen}
        >
          <ProjectSidebar
            collapsed={!sidebarOpen}
            onToggleVisibility={() => toggleSidebar(false)}
            showVisibilityToggle={desktopRuntime.titlebarHeight === 0}
          />
        </div>
      </SectionErrorBoundary>

      <main id="main-content" className="min-w-0 min-h-0 flex-1 flex flex-col">
        <CliBanner />
        {/* Main area — workflow editor */}
        <SectionErrorBoundary sectionName="flow view">
          <AppMainView />
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="status bar">
          <AppStatusBar />
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="runs dashboard">
          <MultiRunDashboard />
        </SectionErrorBoundary>
      </main>

      <DeepLinkTemplateDialog
        template={deepLinkTemplate}
        open={deepLinkTemplate !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeepLinkTemplate(null)
          }
        }}
        projects={projects}
        targetProject={deepLinkTargetProject}
        onTargetProjectChange={setDeepLinkTargetProject}
        onCreateInProject={() => void createDeepLinkTemplate()}
        onReplaceCurrent={async () => {
          if (
            !(await confirmDiscard("replace the current draft", workflowDirty))
          ) {
            return
          }
          applyDeepLinkTemplate()
        }}
      />
      <ApprovalDialog />
      {unsavedChangesDialog}
    </div>
  )
})

function ExecutionShell({ children }: { children: ReactNode }) {
  const {
    costWarningOpen,
    costWarning,
    setCostWarningOpen,
    confirmCostWarning,
    cancelCostWarning,
    handlePreflightWarnings,
  } = useCostWarning()

  return (
    <ExecutionProvider onPreflightWarnings={handlePreflightWarnings}>
      {children}
      <CostWarningDialog
        open={costWarningOpen}
        onOpenChange={setCostWarningOpen}
        warning={costWarning}
        onConfirm={confirmCostWarning}
        onCancel={cancelCostWarning}
      />
    </ExecutionProvider>
  )
}

export function App() {
  return (
    <JotaiProvider>
      <ExecutionShell>
        <TooltipProvider delayDuration={180}>
          <AppShell />
          <Toaster position="bottom-right" closeButton />
        </TooltipProvider>
      </ExecutionShell>
    </JotaiProvider>
  )
}
