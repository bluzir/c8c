import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type KeyboardEvent,
  type MutableRefObject,
  type SetStateAction,
} from "react"

import {
  moveProjectBeforeOrAfterTarget,
  type ProjectDropPosition,
} from "@shared/project-order"

import type { WorkflowFile } from "@/lib/store"
import { toastErrorFromCatch } from "@/lib/toast-error"
import { isEditableKeyboardTarget } from "@/lib/keyboard-shortcuts"
import { MOTION_BASE_MS } from "@/lib/tokens"

export function useProjectSidebarInteractions({
  sidebarRef,
  projects,
  setProjects,
  workflows,
  projectWorkflowsCache,
  requestRenameWorkflow,
}: {
  sidebarRef: MutableRefObject<HTMLElement | null>
  projects: string[]
  setProjects: Dispatch<SetStateAction<string[]>>
  workflows: WorkflowFile[]
  projectWorkflowsCache: Record<string, WorkflowFile[]>
  requestRenameWorkflow: (workflow: WorkflowFile) => void
}) {
  const scrollHideTimerRef = useRef<number | null>(null)
  const projectReorderRequestIdRef = useRef(0)
  const [sidebarScrolling, setSidebarScrolling] = useState(false)
  const [draggedProjectPath, setDraggedProjectPath] = useState<string | null>(
    null,
  )
  const [projectDropIndicator, setProjectDropIndicator] = useState<{
    projectPath: string
    position: ProjectDropPosition
  } | null>(null)

  useEffect(() => {
    return () => {
      if (scrollHideTimerRef.current !== null) {
        window.clearTimeout(scrollHideTimerRef.current)
      }
    }
  }, [])

  const handleSidebarScroll = () => {
    setSidebarScrolling(true)
    if (scrollHideTimerRef.current !== null) {
      window.clearTimeout(scrollHideTimerRef.current)
    }
    scrollHideTimerRef.current = window.setTimeout(() => {
      setSidebarScrolling(false)
      scrollHideTimerRef.current = null
    }, MOTION_BASE_MS)
  }

  const clearProjectDragState = () => {
    setDraggedProjectPath(null)
    setProjectDropIndicator(null)
  }

  const resolveProjectDropPosition = (
    event: DragEvent<HTMLElement>,
  ): ProjectDropPosition => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return event.clientY >= bounds.top + bounds.height / 2 ? "after" : "before"
  }

  const handleProjectDragStart = (
    projectPath: string,
    event: DragEvent<HTMLButtonElement>,
  ) => {
    if (projects.length < 2) {
      event.preventDefault()
      return
    }

    setDraggedProjectPath(projectPath)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", projectPath)
  }

  const handleProjectDragOver = (
    projectPath: string,
    event: DragEvent<HTMLDivElement>,
  ) => {
    if (!draggedProjectPath || draggedProjectPath === projectPath) {
      if (projectDropIndicator) {
        setProjectDropIndicator(null)
      }
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    const position = resolveProjectDropPosition(event)
    setProjectDropIndicator((current) => {
      if (
        current?.projectPath === projectPath &&
        current.position === position
      ) {
        return current
      }
      return { projectPath, position }
    })
  }

  const handleProjectDragLeave = (
    projectPath: string,
    event: DragEvent<HTMLDivElement>,
  ) => {
    if (projectDropIndicator?.projectPath !== projectPath) return
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && event.currentTarget.contains(nextTarget)) return
    setProjectDropIndicator(null)
  }

  const handleProjectDrop = (
    targetProjectPath: string,
    event: DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault()

    if (!draggedProjectPath || draggedProjectPath === targetProjectPath) {
      clearProjectDragState()
      return
    }

    const position = resolveProjectDropPosition(event)
    const previousProjects = projects
    const nextProjects = moveProjectBeforeOrAfterTarget(
      projects,
      draggedProjectPath,
      targetProjectPath,
      position,
    )

    clearProjectDragState()
    if (
      nextProjects.every(
        (projectPath, index) => projectPath === previousProjects[index],
      )
    ) {
      return
    }

    const requestId = projectReorderRequestIdRef.current + 1
    projectReorderRequestIdRef.current = requestId
    setProjects(nextProjects)

    void window.api
      .reorderProjects(nextProjects)
      .then((persistedProjects) => {
        if (projectReorderRequestIdRef.current !== requestId) return
        setProjects(persistedProjects)
      })
      .catch(async (error) => {
        if (projectReorderRequestIdRef.current !== requestId) return
        try {
          const persistedProjects = await window.api.listProjects()
          if (projectReorderRequestIdRef.current !== requestId) return
          setProjects(persistedProjects)
        } catch {
          setProjects(previousProjects)
        }
        toastErrorFromCatch("Could not reorder projects", error)
      })
  }

  const handleSidebarKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null
    if (!target) return

    if (isEditableKeyboardTarget(target)) return

    if (event.key === "F2") {
      const focusedEl = target.closest(
        "[data-sidebar-item]",
      ) as HTMLElement | null
      if (focusedEl && focusedEl.dataset.workflowPath) {
        event.preventDefault()
        const workflow =
          workflows.find(
            (candidate) => candidate.path === focusedEl.dataset.workflowPath,
          ) ||
          Object.values(projectWorkflowsCache)
            .flat()
            .find(
              (candidate) => candidate.path === focusedEl.dataset.workflowPath,
            )
        if (workflow) {
          requestRenameWorkflow(workflow)
        }
      }
      return
    }

    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return
    }

    const root = sidebarRef.current
    if (!root) return
    const items = Array.from(
      root.querySelectorAll<HTMLElement>(
        '[data-sidebar-item="true"]:not([disabled])',
      ),
    ).filter((item) => item.offsetParent !== null)
    if (items.length === 0) return

    const currentIndex = items.findIndex(
      (item) => item === document.activeElement,
    )
    let nextIndex = 0
    if (event.key === "Home") {
      nextIndex = 0
    } else if (event.key === "End") {
      nextIndex = items.length - 1
    } else if (event.key === "ArrowDown") {
      nextIndex =
        currentIndex < 0 ? 0 : Math.min(currentIndex + 1, items.length - 1)
    } else {
      nextIndex = currentIndex < 0 ? 0 : Math.max(currentIndex - 1, 0)
    }

    event.preventDefault()
    const nextItem = items[nextIndex]
    nextItem.focus()
    nextItem.scrollIntoView({ block: "nearest" })
  }

  return {
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
  }
}
