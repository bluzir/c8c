import { app, screen, type BrowserWindow, type Rectangle } from "electron"
import { mkdir, readFile } from "node:fs/promises"
import { join } from "path"
import { writeFileAtomic } from "./lib/atomic-write"

export interface PersistedWindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized: boolean
}

const DEFAULT_WINDOW_STATE: PersistedWindowState = {
  width: 1280,
  height: 840,
  isMaximized: false,
}

export const MIN_WINDOW_WIDTH = 900
export const MIN_WINDOW_HEIGHT = 640

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function intersectionArea(a: Rectangle, b: Rectangle): number {
  const xOverlap = Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  )
  const yOverlap = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  )
  return xOverlap * yOverlap
}

export function normalizeBounds(bounds: Rectangle): Rectangle {
  const nearestDisplay = screen.getDisplayNearestPoint({
    x: bounds.x,
    y: bounds.y,
  }).workArea
  const width = clamp(
    bounds.width,
    MIN_WINDOW_WIDTH,
    Math.max(MIN_WINDOW_WIDTH, nearestDisplay.width),
  )
  const height = clamp(
    bounds.height,
    MIN_WINDOW_HEIGHT,
    Math.max(MIN_WINDOW_HEIGHT, nearestDisplay.height),
  )

  const candidate: Rectangle = { x: bounds.x, y: bounds.y, width, height }
  const isVisible = screen.getAllDisplays().some((display) => {
    const visibleArea = intersectionArea(candidate, display.workArea)
    return (
      visibleArea >=
      Math.min(candidate.width * candidate.height * 0.15, 120_000)
    )
  })

  if (!isVisible) {
    const primary = screen.getPrimaryDisplay().workArea
    const centeredWidth = clamp(
      width,
      MIN_WINDOW_WIDTH,
      Math.max(MIN_WINDOW_WIDTH, primary.width),
    )
    const centeredHeight = clamp(
      height,
      MIN_WINDOW_HEIGHT,
      Math.max(MIN_WINDOW_HEIGHT, primary.height),
    )
    return {
      x: Math.round(primary.x + (primary.width - centeredWidth) / 2),
      y: Math.round(primary.y + (primary.height - centeredHeight) / 2),
      width: centeredWidth,
      height: centeredHeight,
    }
  }

  const display = screen.getDisplayMatching(candidate).workArea
  const maxX = display.x + Math.max(0, display.width - width)
  const maxY = display.y + Math.max(0, display.height - height)

  return {
    x: clamp(candidate.x, display.x, maxX),
    y: clamp(candidate.y, display.y, maxY),
    width,
    height,
  }
}

export function normalizeWindowState(
  saved: PersistedWindowState,
): PersistedWindowState {
  const hasPosition = typeof saved.x === "number" && typeof saved.y === "number"
  if (!hasPosition) {
    const primary = screen.getPrimaryDisplay().workArea
    return {
      ...saved,
      width: clamp(
        saved.width,
        MIN_WINDOW_WIDTH,
        Math.max(MIN_WINDOW_WIDTH, primary.width),
      ),
      height: clamp(
        saved.height,
        MIN_WINDOW_HEIGHT,
        Math.max(MIN_WINDOW_HEIGHT, primary.height),
      ),
    }
  }

  const normalized = normalizeBounds({
    x: saved.x as number,
    y: saved.y as number,
    width: saved.width,
    height: saved.height,
  })

  return {
    ...saved,
    x: normalized.x,
    y: normalized.y,
    width: normalized.width,
    height: normalized.height,
  }
}

export function areBoundsEqual(a: Rectangle, b: Rectangle): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  )
}

export function windowStatePath(): string {
  return join(app.getPath("userData"), "window-state.json")
}

export async function loadWindowState(): Promise<PersistedWindowState> {
  try {
    const raw = await readFile(windowStatePath(), "utf-8")
    const parsed = JSON.parse(raw) as Partial<PersistedWindowState>
    return {
      width:
        typeof parsed.width === "number"
          ? Math.max(MIN_WINDOW_WIDTH, Math.round(parsed.width))
          : DEFAULT_WINDOW_STATE.width,
      height:
        typeof parsed.height === "number"
          ? Math.max(MIN_WINDOW_HEIGHT, Math.round(parsed.height))
          : DEFAULT_WINDOW_STATE.height,
      x: typeof parsed.x === "number" ? Math.round(parsed.x) : undefined,
      y: typeof parsed.y === "number" ? Math.round(parsed.y) : undefined,
      isMaximized: Boolean(parsed.isMaximized),
    }
  } catch {
    return DEFAULT_WINDOW_STATE
  }
}

export async function persistWindowState(window: BrowserWindow): Promise<void> {
  const isMaximized = window.isMaximized()
  const bounds: Rectangle = isMaximized
    ? window.getNormalBounds()
    : window.getBounds()
  const payload: PersistedWindowState = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized,
  }

  try {
    await mkdir(app.getPath("userData"), { recursive: true })
    await writeFileAtomic(windowStatePath(), JSON.stringify(payload, null, 2))
  } catch (error) {
    console.error("[main] failed to persist window state:", error)
  }
}
