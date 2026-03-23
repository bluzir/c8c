import {
  useState,
  type Dispatch,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react"
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from "@/lib/sidebar-layout"

export {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "@/lib/sidebar-layout"

export function clampSidebarWidth(width: number): number {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, width))
}

export function useSidebarResize(
  sidebarWidth: number,
  setSidebarWidth: Dispatch<SetStateAction<number>>,
) {
  const [resizing, setResizing] = useState(false)

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()

    const startX = event.clientX
    const startWidth = sidebarWidth
    setResizing(true)

    const handleMove = (moveEvent: PointerEvent) => {
      setSidebarWidth(
        clampSidebarWidth(startWidth + (moveEvent.clientX - startX)),
      )
    }

    const stopResize = () => {
      setResizing(false)
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", stopResize)
      window.removeEventListener("pointercancel", stopResize)
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", stopResize, { once: true })
    window.addEventListener("pointercancel", stopResize, { once: true })
  }

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const baseStep = event.shiftKey ? 24 : 12
    const keyStep =
      event.key === "PageUp" || event.key === "PageDown"
        ? baseStep * 2
        : baseStep
    let nextWidth = sidebarWidth

    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      nextWidth = sidebarWidth - keyStep
    } else if (event.key === "ArrowRight" || event.key === "PageDown") {
      nextWidth = sidebarWidth + keyStep
    } else if (event.key === "Home") {
      nextWidth = SIDEBAR_MIN_WIDTH
    } else if (event.key === "End") {
      nextWidth = SIDEBAR_MAX_WIDTH
    } else {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    setSidebarWidth(clampSidebarWidth(nextWidth))
  }

  return {
    resizing,
    startResize,
    handleResizeKeyDown,
  }
}
