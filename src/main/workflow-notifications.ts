import { app, BrowserWindow, Notification } from "electron"
import type { WorkflowEvent } from "@shared/types"

function focusWindow(window: BrowserWindow): void {
  window.show()
  window.focus()
}

function showNotification(
  window: BrowserWindow,
  params: {
    body: string
    bounce?: "informational" | "critical"
    flash?: boolean
  },
): void {
  const notification = new Notification({
    title: "c8c",
    body: params.body,
  })
  notification.on("click", () => {
    focusWindow(window)
  })
  notification.show()

  if (params.flash) {
    window.flashFrame(true)
  }
  if (process.platform === "darwin" && app.dock && params.bounce) {
    app.dock.bounce(params.bounce)
  }
}

function handleWorkflowNotification(
  window: BrowserWindow,
  event: WorkflowEvent,
): void {
  if (window.isFocused()) return

  if (event.type === "run-done") {
    if (event.status === "completed") {
      showNotification(window, {
        body: "Flow completed",
        bounce: "informational",
      })
    } else if (event.status === "failed" || event.status === "interrupted") {
      showNotification(window, {
        body: "Flow failed",
      })
    }
    return
  }

  if (event.type === "approval-requested") {
    showNotification(window, {
      body: "Approval needed to continue",
      bounce: "critical",
      flash: true,
    })
  }

  if (event.type === "human-task-created") {
    showNotification(window, {
      body: `Human input needed: ${event.title}`,
      bounce: "critical",
      flash: true,
    })
  }
}

export function sendWorkflowEvent(
  window: BrowserWindow,
  event: WorkflowEvent,
): void {
  try {
    if (window.isDestroyed()) return
    window.webContents.send("workflow:event", event)
    handleWorkflowNotification(window, event)
  } catch {
    // Window may have been destroyed between the check and the send (TOCTOU).
    // Swallow — the renderer is gone anyway.
  }
}
