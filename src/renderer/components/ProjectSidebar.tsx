import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  clearWorkflowContinuationEntryStateForKeyAtom,
  projectsAtom,
  selectedProjectAtom,
  expandedProjectsAtom,
  workflowsAtom,
  selectedWorkflowPathAtom,
  projectSidebarWidthAtom,
  currentWorkflowAtom,
  skillsAtom,
  mainViewAtom,
  viewModeAtom,
  clearWorkflowTemplateContextForKeyAtom,
  clearWorkflowRequestedResultForKeyAtom,
  moveWorkflowContinuationEntryStateAtom,
  moveWorkflowTemplateContextAtom,
  moveWorkflowRequestedResultAtom,
  templateLibraryContextAtom,
  workflowDirtyAtom,
  workflowCreateContextAtom,
  workflowEntryStateAtom,
  workflowSavedSnapshotAtom,
  unreadInboxCountAtom,
  workflowSidebarSeenRunIdsAtom,
  markWorkflowSidebarRunSeenAtom,
  multiRunDashboardOpenAtom,
  clearAllRoutingStateAtom,
} from "@/lib/store"
import {
  clearWorkflowExecutionStateAtom,
  moveWorkflowExecutionStateAtom,
  pastRunsAtom,
  toWorkflowExecutionKey,
  workflowExecutionStatesAtom,
} from "@/features/execution"
import { cn } from "@/lib/cn"
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from "@/lib/sidebar-layout"
import { FolderOpen, Settings, ChevronRight, Plus } from "lucide-react"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import {
  formatRelativeTime,
  deriveSidebarWorkflowRowState,
  latestRunByWorkflowPath,
  projectFolderName,
  resolveProjectRowSelectionState,
  isSidebarWorkflowReviewableRun,
  workflowHasActiveRunStatus,
} from "@/components/sidebar/projectSidebarUtils"
import { useProjectSidebarData } from "@/components/sidebar/useProjectSidebarData"
import { useProjectSidebarInteractions } from "@/components/sidebar/useProjectSidebarInteractions"
import { useSidebarResize } from "@/components/sidebar/useSidebarResize"
import { useWorkflowCrud } from "@/components/sidebar/useWorkflowCrud"
import { useProjectSidebarMetrics } from "@/components/sidebar/useProjectSidebarMetrics"
import {
  SidebarWorkflowDialogs,
  type SidebarContextMenuState,
} from "@/components/sidebar/SidebarWorkflowDialogs"
import { SidebarGlobalWorkflowRow } from "@/components/sidebar/SidebarGlobalWorkflowRow"
import { SidebarProjectWorkflowList } from "@/components/sidebar/SidebarProjectWorkflowList"
import { ProjectSidebarChrome } from "@/components/sidebar/ProjectSidebarChrome"
import { SidebarNavItem } from "@/components/sidebar/SidebarNavItem"
import { useWorkflowCreateNavigation } from "@/hooks/useWorkflowCreateNavigation"
import { Button } from "@/components/ui/button"
import { resolveProjectRequiredContract } from "@/lib/entry-state-contracts"

interface ProjectSidebarProps {
  collapsed?: boolean
  onProjectAdd?: (projectPath: string) => void
  onWorkflowCreate?: (workflowPath: string) => void
  onToggleVisibility?: () => void
  showVisibilityToggle?: boolean
}

export function ProjectSidebar({
  collapsed = false,
  onProjectAdd,
  onWorkflowCreate,
  onToggleVisibility,
  showVisibilityToggle = false,
}: ProjectSidebarProps = {}) {
  const sidebarRef = useRef<HTMLElement | null>(null)
  const [projects, setProjects] = useAtom(projectsAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [expandedProjects, setExpandedProjects] = useAtom(expandedProjectsAtom)
  const [workflows, setWorkflows] = useAtom(workflowsAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(
    selectedWorkflowPathAtom,
  )
  const [workflowDirty] = useAtom(workflowDirtyAtom)
  const [sidebarWidth, setSidebarWidth] = useAtom(projectSidebarWidthAtom)
  const [currentWorkflow, setCurrentWorkflow] = useAtom(currentWorkflowAtom)
  const [workflowExecutionStates] = useAtom(workflowExecutionStatesAtom)
  const [pastRuns] = useAtom(pastRunsAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setSkills] = useAtom(skillsAtom)
  const [mainView, setMainView] = useAtom(mainViewAtom)
  const setViewMode = useSetAtom(viewModeAtom)
  const [workflowCreateContext] = useAtom(workflowCreateContextAtom)
  const [unreadInboxCount] = useAtom(unreadInboxCountAtom)
  const runsDashboardOpen = useAtomValue(multiRunDashboardOpenAtom)
  const [workflowSidebarSeenRunIds] = useAtom(workflowSidebarSeenRunIdsAtom)
  const setTemplateLibraryContext = useSetAtom(templateLibraryContextAtom)
  const setMultiRunDashboardOpen = useSetAtom(multiRunDashboardOpenAtom)
  const moveWorkflowExecutionState = useSetAtom(moveWorkflowExecutionStateAtom)
  const clearWorkflowExecutionState = useSetAtom(
    clearWorkflowExecutionStateAtom,
  )
  const moveWorkflowRequestedResult = useSetAtom(
    moveWorkflowRequestedResultAtom,
  )
  const moveWorkflowContinuationEntryState = useSetAtom(
    moveWorkflowContinuationEntryStateAtom,
  )
  const clearWorkflowRequestedResult = useSetAtom(
    clearWorkflowRequestedResultForKeyAtom,
  )
  const moveWorkflowTemplateContext = useSetAtom(
    moveWorkflowTemplateContextAtom,
  )
  const clearWorkflowContinuationEntryState = useSetAtom(
    clearWorkflowContinuationEntryStateForKeyAtom,
  )
  const clearWorkflowTemplateContext = useSetAtom(
    clearWorkflowTemplateContextForKeyAtom,
  )
  const markWorkflowSidebarRunSeen = useSetAtom(markWorkflowSidebarRunSeenAtom)
  const clearAllRoutingState = useSetAtom(clearAllRoutingStateAtom)
  const setWorkflowEntryState = useSetAtom(workflowEntryStateAtom)
  const [workflowSearchQuery, setWorkflowSearchQuery] = useState("")
  const [expandedWorkflowLists, setExpandedWorkflowLists] = useState<
    Record<string, boolean>
  >({})
  const [sidebarContextMenu, setSidebarContextMenu] =
    useState<SidebarContextMenuState | null>(null)
  const normalizedWorkflowSearchQuery = workflowSearchQuery.trim().toLowerCase()
  const hasWorkflowSearchQuery = normalizedWorkflowSearchQuery.length > 0
  const projectRequired = resolveProjectRequiredContract({
    resolvedProjectPath: selectedProject,
    primaryActionLabel: "Open project",
  })

  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()
  const workflowHasActiveRun = (workflowPath: string) => {
    return workflowHasActiveRunStatus(
      workflowExecutionStates[workflowPath]?.runStatus ?? "idle",
    )
  }
  const clearDraftExecutionState = () => {
    clearWorkflowExecutionState(toWorkflowExecutionKey(null))
    clearWorkflowRequestedResult(toWorkflowExecutionKey(null))
    clearWorkflowContinuationEntryState(toWorkflowExecutionKey(null))
    clearWorkflowTemplateContext(toWorkflowExecutionKey(null))
    setWorkflowEntryState(null)
  }
  const {
    projectWorkflowsCache,
    projectLatestRunsCache,
    projectWorkflowsLoading,
    setProjectWorkflowsCache,
    setProjectLatestRunsCache,
    globalWorkflows,
    toggleProjectExpansion,
  } = useProjectSidebarData({
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
  })
  const hasProjects = projects.length > 0
  const showSidebarSearch =
    hasProjects &&
    (workflows.length > 3 ||
      Object.values(projectWorkflowsCache).some((wfs) => wfs.length > 3))
  const visibleGlobalWorkflows = hasWorkflowSearchQuery
    ? globalWorkflows.filter((workflow) =>
        workflow.name.toLowerCase().includes(normalizedWorkflowSearchQuery),
      )
    : globalWorkflows
  const latestRunsByWorkflow = useMemo(
    () => latestRunByWorkflowPath(pastRuns),
    [pastRuns],
  )
  const resolveWorkflowReviewRun = useCallback(
    (workflowPath: string, projectPath?: string) => {
      const projectRun = projectPath
        ? projectLatestRunsCache[projectPath]?.[workflowPath] || null
        : null
      const latestRun =
        projectRun || latestRunsByWorkflow.get(workflowPath) || null
      return isSidebarWorkflowReviewableRun(latestRun) ? latestRun : null
    },
    [latestRunsByWorkflow, projectLatestRunsCache],
  )
  const hasVisibleProjectResults =
    hasWorkflowSearchQuery &&
    projects.some((projectPath) =>
      (projectWorkflowsCache[projectPath] || []).some((workflow) =>
        workflow.name.toLowerCase().includes(normalizedWorkflowSearchQuery),
      ),
    )
  const hasSearchResults =
    hasVisibleProjectResults || visibleGlobalWorkflows.length > 0
  const sidebarContentState = !hasProjects
    ? "empty_projects"
    : hasWorkflowSearchQuery
      ? "search_results"
      : "browse_projects"

  const {
    pendingRenameWorkflow,
    setPendingRenameWorkflow,
    renameInput,
    setRenameInput,
    pendingDeleteWorkflow,
    setPendingDeleteWorkflow,
    pendingRemoveProject,
    setPendingRemoveProject,
    addProject,
    commitRemoveProject,
    selectWorkflow,
    selectGlobalWorkflow,
    requestRenameWorkflow,
    commitRenameWorkflow,
    requestDeleteWorkflow,
    commitDeleteWorkflow,
    duplicateWorkflow,
    copyWorkflowToProject,
  } = useWorkflowCrud({
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
  })
  const { openWorkflowCreate } = useWorkflowCreateNavigation()
  const {
    getWorkflowRunMetrics,
    getProjectStatusRollup,
    sortProjectWorkflows,
    getHistoricalRunVisual,
  } = useProjectSidebarMetrics({
    projectLatestRunsCache,
    workflowExecutionStates,
  })
  const {
    sidebarScrolling,
    draggedProjectPath,
    projectDropIndicator,
    handleSidebarScroll,
    clearProjectDragState,
    handleProjectDragStart,
    handleProjectDragOver,
    handleProjectDragLeave,
    handleProjectDrop,
    handleSidebarKeyDown,
  } = useProjectSidebarInteractions({
    sidebarRef,
    projects,
    setProjects,
    workflows,
    projectWorkflowsCache,
    requestRenameWorkflow,
  })

  const { resizing, startResize, handleResizeKeyDown } = useSidebarResize(
    sidebarWidth,
    setSidebarWidth,
  )

  useEffect(() => {
    if (!selectedProject) return
    const latestRunsByWorkflowByProject = Object.fromEntries(
      latestRunsByWorkflow.entries(),
    )
    setProjectLatestRunsCache((prev) => {
      const current = prev[selectedProject]
      const currentKeys = Object.keys(current || {})
      const nextKeys = Object.keys(latestRunsByWorkflowByProject)
      if (
        current &&
        currentKeys.length === nextKeys.length &&
        nextKeys.every(
          (workflowPath) =>
            current[workflowPath]?.runId ===
            latestRunsByWorkflowByProject[workflowPath]?.runId,
        )
      ) {
        return prev
      }
      return {
        ...prev,
        [selectedProject]: latestRunsByWorkflowByProject,
      }
    })
  }, [latestRunsByWorkflow, selectedProject, setProjectLatestRunsCache])

  useEffect(() => {
    if (mainView !== "thread" || !selectedProject || !selectedWorkflowPath)
      return
    const latestRun =
      projectLatestRunsCache[selectedProject]?.[selectedWorkflowPath]
    if (!latestRun?.runId) return
    markWorkflowSidebarRunSeen({
      workflowPath: selectedWorkflowPath,
      runId: latestRun.runId,
    })
  }, [
    mainView,
    markWorkflowSidebarRunSeen,
    projectLatestRunsCache,
    selectedProject,
    selectedWorkflowPath,
  ])

  const removingSelectedDirtyProject =
    pendingRemoveProject !== null &&
    pendingRemoveProject === selectedProject &&
    workflowDirty

  const handleOpenWorkflowCreate = (projectPath?: string, locked = false) => {
    openWorkflowCreate({
      projectPath,
      locked,
    })
  }

  return (
    <aside
      ref={sidebarRef}
      aria-label="Project sidebar"
      style={{ width: sidebarWidth }}
      onKeyDown={handleSidebarKeyDown}
      className={cn(
        "relative h-full shrink-0 min-h-0 border-r border-border bg-sidebar flex flex-col pt-[var(--titlebar-height)] ui-motion-standard transition-[opacity,transform] will-change-transform",
        collapsed && "-translate-x-2 opacity-0 pointer-events-none",
        resizing && "select-none",
      )}
    >
      <ProjectSidebarChrome
        mainView={mainView}
        runsDashboardOpen={runsDashboardOpen}
        unreadInboxCount={unreadInboxCount}
        hasProjects={hasProjects}
        workflowSearchQuery={workflowSearchQuery}
        showSearch={showSidebarSearch}
        onSearchChange={setWorkflowSearchQuery}
        onOpenThread={() => {
          setMainView("thread")
          setViewMode("chat")
        }}
        onOpenCreate={() => handleOpenWorkflowCreate()}
        onOpenStartingPoints={() => {
          clearAllRoutingState()
          if (mainView === "workflow_create") {
            setTemplateLibraryContext({
              projectPath: workflowCreateContext.projectPath,
              createOnly: Boolean(workflowCreateContext.projectPath),
            })
          } else {
            setTemplateLibraryContext(null)
          }
          setMainView("templates")
        }}
        onOpenArtifacts={() => {
          clearAllRoutingState()
          setMainView("artifacts")
        }}
        onOpenSkills={() => {
          clearAllRoutingState()
          setMainView("skills")
        }}
        onOpenInbox={() => {
          clearAllRoutingState()
          setMainView("inbox")
        }}
        onOpenRunsDashboard={() => setMultiRunDashboardOpen(true)}
        onAddProject={() => {
          void addProject()
        }}
        onToggleVisibility={onToggleVisibility}
        showVisibilityToggle={showVisibilityToggle}
      />

      {/* Scrollable workflow list */}
      <div
        className="ui-scroll-region ui-scrollbar-transient flex-1 min-h-0 overflow-y-auto pb-1.5"
        data-scrolling={sidebarScrolling ? "true" : "false"}
        onScroll={handleSidebarScroll}
      >
        {sidebarContentState === "empty_projects" ? (
          <section className="mx-2.5 mt-3 text-center">
            <div className="ui-empty-state gap-3 px-2 py-1">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
                <FolderOpen size={17} />
              </div>
              <div className="space-y-1">
                <h2 className="text-sidebar-item font-medium text-foreground">
                  Project required
                </h2>
                <p className="text-sidebar-item text-muted-foreground">
                  {projectRequired.blockerStatement}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-sidebar-item="true"
                onClick={() => void addProject()}
              >
                {projectRequired.primaryActionLabel}
              </Button>
            </div>
          </section>
        ) : (
          <>
            {sidebarContentState === "search_results" ? (
              <div className="px-3 pb-1 pt-1 section-kicker text-muted-foreground">
                Results
              </div>
            ) : null}

            {projects.map((projectPath) => {
              const isSelectedProject = selectedProject === projectPath
              const isExpanded = expandedProjects.includes(projectPath)
              const isDraggingProject = draggedProjectPath === projectPath
              const projectDropPosition =
                projectDropIndicator?.projectPath === projectPath
                  ? projectDropIndicator.position
                  : null
              const projectWorkflows = projectWorkflowsCache[projectPath] || []
              const isProjectLoading =
                projectWorkflowsLoading[projectPath] === true
              const hasVisibleProjectWorkflows =
                !hasWorkflowSearchQuery ||
                projectWorkflows.some((workflow) =>
                  workflow.name
                    .toLowerCase()
                    .includes(normalizedWorkflowSearchQuery),
                )

              if (hasWorkflowSearchQuery && !hasVisibleProjectWorkflows) {
                return null
              }

              const projectRowSelection = resolveProjectRowSelectionState(
                projectPath,
                selectedProject,
                isExpanded,
              )
              const projectRollup = getProjectStatusRollup(
                projectPath,
                projectWorkflows,
              )
              const projectRollupMeta =
                projectRollup.blockedCount > 0
                  ? {
                      dotClass: "bg-status-warning",
                      title: `${projectRollup.blockedCount} flow${projectRollup.blockedCount === 1 ? "" : "s"} waiting for attention`,
                    }
                  : projectRollup.waitingCount > 0
                    ? {
                        dotClass: "bg-status-warning",
                        title: `${projectRollup.waitingCount} waiting flow${projectRollup.waitingCount === 1 ? "" : "s"}`,
                      }
                    : projectRollup.activeCount > 0
                      ? {
                          dotClass: "bg-status-info",
                          title: `${projectRollup.activeCount} active flow${projectRollup.activeCount === 1 ? "" : "s"}`,
                        }
                      : null
              const shouldShowProjectWorkflows =
                hasWorkflowSearchQuery || isExpanded

              return (
                <div
                  key={projectPath}
                  className={cn(
                    "sidebar-list-group mt-1 first:mt-0",
                    projectDropPosition === "before" &&
                      "sidebar-list-group--project-drop-before",
                    projectDropPosition === "after" &&
                      "sidebar-list-group--project-drop-after",
                  )}
                >
                  <div
                    className="group flex items-center gap-1"
                    onDragOver={(event) =>
                      handleProjectDragOver(projectPath, event)
                    }
                    onDragLeave={(event) =>
                      handleProjectDragLeave(projectPath, event)
                    }
                    onDrop={(event) => handleProjectDrop(projectPath, event)}
                  >
                    <button
                      type="button"
                      data-sidebar-item="true"
                      draggable={projects.length > 1 && !hasWorkflowSearchQuery}
                      className={cn(
                        "sidebar-project-row ui-pressable text-left text-sidebar-label",
                        projects.length > 1 &&
                          !hasWorkflowSearchQuery &&
                          "cursor-grab active:cursor-grabbing",
                        isSelectedProject
                          ? "text-foreground"
                          : "text-muted-foreground",
                        isDraggingProject && "sidebar-project-row--dragging",
                        projectDropPosition &&
                          "sidebar-project-row--drop-target",
                      )}
                      onDragStart={(event) =>
                        handleProjectDragStart(projectPath, event)
                      }
                      onDragEnd={clearProjectDragState}
                      onClick={() => {
                        if (projectRowSelection.shouldSelectProject) {
                          setSelectedProject(projectPath)
                        }
                        if (
                          !hasWorkflowSearchQuery &&
                          projectRowSelection.nextExpanded !== isExpanded
                        ) {
                          toggleProjectExpansion(projectPath)
                        }
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setSidebarContextMenu({
                          x: event.clientX,
                          y: event.clientY,
                          scope: "project",
                          projectPath,
                        })
                      }}
                      title={projectPath}
                    >
                      <ChevronRight
                        size={14}
                        className={cn(
                          "ui-chevron flex-shrink-0 text-muted-foreground",
                          (isExpanded || hasWorkflowSearchQuery) && "rotate-90",
                        )}
                      />
                      <FolderOpen size={14} className="flex-shrink-0" />
                      <span className="truncate flex-1">
                        {projectFolderName(projectPath)}
                      </span>
                      {projectRollupMeta ? (
                        <span
                          role="img"
                          aria-label={projectRollupMeta.title}
                          title={projectRollupMeta.title}
                          className={cn(
                            "ml-1 inline-flex h-2 w-2 rounded-full",
                            projectRollupMeta.dotClass,
                          )}
                        />
                      ) : null}
                    </button>
                    {!hasWorkflowSearchQuery ? (
                      <div className="ui-reveal-trailing flex items-center gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="ui-icon-button hover:bg-sidebar-hover hover:text-foreground"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleOpenWorkflowCreate(projectPath, true)
                              }}
                              aria-label={`New flow in ${projectFolderName(projectPath)}`}
                            >
                              <Plus size={14} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            New flow in {projectFolderName(projectPath)}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    ) : null}
                  </div>

                  {shouldShowProjectWorkflows
                    ? (() => {
                        const isWorkflowListExpanded =
                          expandedWorkflowLists[projectPath] ?? false

                        return (
                          <SidebarProjectWorkflowList
                            projectPath={projectPath}
                            projectLabel={projectFolderName(projectPath)}
                            projectWorkflows={projectWorkflows}
                            isProjectLoading={isProjectLoading}
                            workflowSearchQuery={workflowSearchQuery}
                            isWorkflowListExpanded={isWorkflowListExpanded}
                            selectedWorkflowPath={selectedWorkflowPath}
                            workflowDirty={workflowDirty}
                            workflowExecutionStates={workflowExecutionStates}
                            seenRunIds={workflowSidebarSeenRunIds}
                            getWorkflowRunMetrics={getWorkflowRunMetrics}
                            getHistoricalRunVisual={getHistoricalRunVisual}
                            sortProjectWorkflows={sortProjectWorkflows}
                            onToggleExpanded={() => {
                              setExpandedWorkflowLists((prev) => ({
                                ...prev,
                                [projectPath]: !isWorkflowListExpanded,
                              }))
                            }}
                            onOpenWorkflow={(workflow) =>
                              void selectWorkflow(workflow, projectPath)
                            }
                            onRenameWorkflow={requestRenameWorkflow}
                            onWorkflowContextMenu={setSidebarContextMenu}
                            onCreateFlow={() =>
                              handleOpenWorkflowCreate(projectPath, true)
                            }
                          />
                        )
                      })()
                    : null}
                </div>
              )
            })}

            {visibleGlobalWorkflows.length > 0 ? (
              <div className="mt-3 px-1.5">
                <div className="px-1.5 pb-1 section-kicker text-muted-foreground">
                  Global flows
                </div>
                <div
                  role="list"
                  aria-label="Global flows"
                  className="mt-0.5 ml-7 space-y-px sidebar-list-group"
                >
                  {visibleGlobalWorkflows.map((workflow) => {
                    const isSelected = selectedWorkflowPath === workflow.path
                    const latestRun =
                      latestRunsByWorkflow.get(workflow.path) || null
                    const workflowRowState = deriveSidebarWorkflowRowState({
                      executionState: workflowExecutionStates[workflow.path],
                      latestRun: latestRun
                        ? {
                            runId: latestRun.runId,
                            status: latestRun.status,
                          }
                        : null,
                      isSelected,
                    })
                    const idleMetaLabel =
                      workflowRowState.baseState === "idle"
                        ? formatRelativeTime(
                            latestRun?.completedAt || workflow.updatedAt,
                          )
                        : null
                    return (
                      <SidebarGlobalWorkflowRow
                        key={workflow.path}
                        workflow={workflow}
                        isSelected={isSelected}
                        isDirty={isSelected && workflowDirty}
                        idleMetaLabel={idleMetaLabel}
                        statusLabel={workflowRowState.statusLabel}
                        statusBadgeClass={workflowRowState.statusBadgeClass}
                        showStatusSpinner={workflowRowState.showStatusSpinner}
                        onOpen={() => void selectGlobalWorkflow(workflow)}
                        onContextMenu={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setSidebarContextMenu({
                            x: event.clientX,
                            y: event.clientY,
                            scope: "global_workflow",
                            workflow,
                          })
                        }}
                      />
                    )
                  })}
                </div>
              </div>
            ) : null}

            {sidebarContentState === "search_results" && !hasSearchResults ? (
              <div className="px-3 py-2 text-sidebar-item text-muted-foreground">
                No flows match this search.
              </div>
            ) : null}
          </>
        )}
      </div>

      <SidebarWorkflowDialogs
        sidebarContextMenu={sidebarContextMenu}
        setSidebarContextMenu={setSidebarContextMenu}
        selectWorkflow={selectWorkflow}
        selectGlobalWorkflow={selectGlobalWorkflow}
        requestRenameWorkflow={requestRenameWorkflow}
        duplicateWorkflow={duplicateWorkflow}
        requestDeleteWorkflow={requestDeleteWorkflow}
        pendingRenameWorkflow={pendingRenameWorkflow}
        setPendingRenameWorkflow={setPendingRenameWorkflow}
        renameInput={renameInput}
        setRenameInput={setRenameInput}
        commitRenameWorkflow={commitRenameWorkflow}
        pendingDeleteWorkflow={pendingDeleteWorkflow}
        setPendingDeleteWorkflow={setPendingDeleteWorkflow}
        selectedWorkflowPath={selectedWorkflowPath}
        workflowDirty={workflowDirty}
        commitDeleteWorkflow={commitDeleteWorkflow}
        selectedProject={selectedProject}
        copyWorkflowToProject={copyWorkflowToProject}
        pendingRemoveProject={pendingRemoveProject}
        setPendingRemoveProject={setPendingRemoveProject}
        pendingRemoveProjectFlowCount={
          pendingRemoveProject
            ? (projectWorkflowsCache[pendingRemoveProject]?.length ?? 0)
            : 0
        }
        removingSelectedDirtyProject={removingSelectedDirtyProject}
        commitRemoveProject={commitRemoveProject}
        openProjectFlow={(projectPath) => {
          handleOpenWorkflowCreate(projectPath, true)
        }}
      />

      {/* Settings */}
      <div className="border-t border-hairline px-1.5 pt-1.5 pb-1.5">
        <SidebarNavItem
          icon={Settings}
          label="Settings"
          active={mainView === "settings"}
          onClick={() => {
            clearAllRoutingState()
            setMainView("settings")
          }}
        />
      </div>

      {/* Resize handle */}
      <div
        role="slider"
        aria-label="Sidebar width"
        aria-orientation="horizontal"
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={handleResizeKeyDown}
        className={cn("absolute right-0 top-0 h-full no-drag ui-resize-handle")}
        data-resizing={resizing}
      />

      {unsavedChangesDialog}
    </aside>
  )
}
