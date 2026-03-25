import { useEffect, useState } from "react"
import { useAtomValue } from "jotai"
import { currentFlowChatMessagesAtom } from "@/features/execution/flow-chat-state"
import { runStatusAtom } from "@/features/execution"

function formatElapsed(startedAt: number): string {
  const seconds = Math.round((Date.now() - startedAt) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  return `${minutes}m`
}

export function FlowProgressBar() {
  const runStatus = useAtomValue(runStatusAtom)
  const flowMessages = useAtomValue(currentFlowChatMessagesAtom)

  // Find the latest progress message (iterate backwards)
  const progressMsg = [...flowMessages]
    .reverse()
    .find((m) => m.content.type === "progress")

  const progressData =
    progressMsg?.content.type === "progress"
      ? progressMsg.content.data
      : undefined

  // Live elapsed timer
  const [elapsed, setElapsed] = useState<string | null>(null)
  useEffect(() => {
    const startedAt = progressData?.startedAt
    if (!startedAt || runStatus !== "running") {
      setElapsed(null)
      return
    }
    setElapsed(formatElapsed(startedAt))
    const interval = setInterval(() => {
      setElapsed(formatElapsed(startedAt))
    }, 1_000)
    return () => clearInterval(interval)
  }, [progressData?.startedAt, runStatus])

  if (!progressData || runStatus !== "running") return null
  if (progressData.collapsed) return null

  const doneCount = progressData.steps.filter((s) => s.status === "done").length
  const totalCount = progressData.steps.length
  const runningStep = progressData.steps.find((s) => s.status === "running")

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t border-hairline bg-surface-1/60">
      <span
        className="inline-block h-2 w-2 rounded-full bg-status-info animate-pulse shrink-0"
        aria-hidden="true"
      />
      <span className="flex-1 min-w-0 truncate text-body-sm text-foreground">
        {runningStep?.label ?? "Running\u2026"}
      </span>
      <span className="shrink-0 ui-meta-text text-muted-foreground whitespace-nowrap">
        {doneCount}/{totalCount} steps
        {elapsed ? ` \u00b7 ${elapsed}` : ""}
      </span>
    </div>
  )
}
