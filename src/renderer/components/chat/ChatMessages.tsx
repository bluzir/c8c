import { useCallback, useEffect, useRef, useState, useMemo } from "react"
import { useAtom } from "jotai"
import { useAtomValue, useSetAtom } from "jotai"
import { ChatMessageBubble } from "./ChatMessageBubble"
import { FlowDecisionMessage } from "./FlowDecisionMessage"
import { FlowCompleteMessage } from "./FlowCompleteMessage"
import { FlowErrorMessage } from "./FlowErrorMessage"
import { FlowStartMessage } from "./FlowStartMessage"
import { FlowProgressMessage } from "./FlowProgressMessage"
import { cn } from "@/lib/cn"
import { ArrowDown } from "lucide-react"
import {
  chatScrollTopByWorkflowAtom,
  currentWorkflowAtom,
  mainViewAtom,
  queuedFollowUpTemplateIdAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  selectedWorkflowTemplateContextAtom,
  templateLibraryContextAtom,
  type ChatMessageDisplay,
} from "@/lib/store"
import {
  currentFlowChatMessagesAtom,
  resolvedDecisionIdsAtom,
  resolveFlowChatDecisionAtom,
} from "@/features/execution/flow-chat-state"
import {
  selectedWorkflowExecutionAtom,
  workflowHistoryRunsAtom,
} from "@/features/execution/state"
import { buildCompleteMessage } from "@/lib/flow-chat-transformer"
import type { FlowChatMessage, FlowFollowUp } from "@/lib/flow-chat-types"

type TimelineEntry =
  | { kind: "chat"; message: ChatMessageDisplay }
  | { kind: "flow"; message: FlowChatMessage }

interface ChatMessagesProps {
  messages: ChatMessageDisplay[]
  status: "idle" | "thinking" | "streaming" | "error"
}

export function ChatMessages({ messages, status }: ChatMessagesProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const [showScrollIndicator, setShowScrollIndicator] = useState(false)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [chatScrollTopByWorkflow, setChatScrollTopByWorkflow] = useAtom(
    chatScrollTopByWorkflowAtom,
  )
  const flowMessages = useAtomValue(currentFlowChatMessagesAtom)
  const resolvedIds = useAtomValue(resolvedDecisionIdsAtom)
  const resolveDecision = useSetAtom(resolveFlowChatDecisionAtom)
  const workflow = useAtomValue(currentWorkflowAtom)
  const templateContext = useAtomValue(selectedWorkflowTemplateContextAtom)
  const executionState = useAtomValue(selectedWorkflowExecutionAtom)
  const workflowHistoryRuns = useAtomValue(workflowHistoryRunsAtom)
  const setQueuedFollowUpTemplateId = useSetAtom(queuedFollowUpTemplateIdAtom)
  const setMainView = useSetAtom(mainViewAtom)
  const setTemplateLibraryContext = useSetAtom(templateLibraryContextAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)

  const handleFollowUp = useCallback(
    (followUp: FlowFollowUp) => {
      if (!followUp.templateId) return
      setQueuedFollowUpTemplateId(followUp.templateId)
      setTemplateLibraryContext({
        projectPath: selectedProject,
        createOnly: Boolean(selectedProject),
      })
      setMainView("templates")
    },
    [
      selectedProject,
      setMainView,
      setQueuedFollowUpTemplateId,
      setTemplateLibraryContext,
    ],
  )

  // Synthesize a Complete message for runs that finished before chat existed
  const syntheticCompleteMessage = useMemo<FlowChatMessage | null>(() => {
    if (flowMessages.length > 0) return null
    if (executionState.runOutcome !== "completed") return null
    if (!executionState.reportPath) return null

    const durationMs =
      executionState.completedAt && executionState.runStartedAt
        ? executionState.completedAt - executionState.runStartedAt
        : 0
    const costUsd = Object.values(executionState.nodeStates).reduce(
      (sum, ns) => sum + (ns.metrics?.cost_usd ?? 0),
      0,
    )

    return buildCompleteMessage({
      runId: executionState.runId ?? "past-run",
      flowName: executionState.workflowName || workflow?.name || "Flow",
      summary: "Flow completed.",
      findings: [],
      limitations: [],
      artifacts: [
        { name: "report.md", path: executionState.reportPath, kind: "report" },
      ],
      followUps: [],
      durationMs,
      costUsd,
    })
  }, [
    flowMessages.length,
    executionState.runOutcome,
    executionState.reportPath,
    executionState.completedAt,
    executionState.runStartedAt,
    executionState.nodeStates,
    executionState.runId,
    executionState.workflowName,
    workflow?.name,
  ])

  // Fallback: if no synthetic from execution state, try the latest past run
  const latestPastRunMessage = useMemo<FlowChatMessage | null>(() => {
    if (syntheticCompleteMessage) return null
    if (flowMessages.length > 0) return null

    const completed = workflowHistoryRuns
      .filter((r) => r.status === "completed")
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))

    const latest = completed[0]
    if (!latest) return null

    return buildCompleteMessage({
      runId: latest.runId,
      flowName: latest.workflowName || workflow?.name || "Flow",
      summary: "Last run completed.",
      findings: [],
      limitations: [],
      artifacts: latest.reportPath
        ? [{ name: "report.md", path: latest.reportPath, kind: "report" }]
        : [],
      followUps: [],
      durationMs: latest.durationMs || 0,
      costUsd: latest.totalCost || 0,
    })
  }, [
    syntheticCompleteMessage,
    flowMessages.length,
    workflowHistoryRuns,
    workflow?.name,
  ])

  const syntheticMessage = syntheticCompleteMessage ?? latestPastRunMessage

  const timeline = useMemo<TimelineEntry[]>(() => {
    const chatEntries: TimelineEntry[] = messages.map((m) => ({
      kind: "chat",
      message: m,
    }))
    const allFlowMessages = syntheticMessage
      ? [...flowMessages, syntheticMessage]
      : flowMessages
    const flowEntries: TimelineEntry[] = allFlowMessages.map((m) => ({
      kind: "flow",
      message: m,
    }))
    return [...chatEntries, ...flowEntries].sort((a, b) => {
      const tsA = a.kind === "chat" ? a.message.timestamp : a.message.timestamp
      const tsB = b.kind === "chat" ? b.message.timestamp : b.message.timestamp
      return tsA - tsB
    })
  }, [messages, flowMessages, syntheticMessage])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleScroll = () => {
      const threshold = 80
      const nearBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < threshold
      isNearBottomRef.current = nearBottom
      setShowScrollIndicator(!nearBottom)
      if (selectedWorkflowPath) {
        setChatScrollTopByWorkflow((prev) => ({
          ...prev,
          [selectedWorkflowPath]: el.scrollTop,
        }))
      }
    }

    el.addEventListener("scroll", handleScroll)
    return () => el.removeEventListener("scroll", handleScroll)
  }, [selectedWorkflowPath, setChatScrollTopByWorkflow])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const savedScrollTop = selectedWorkflowPath
      ? chatScrollTopByWorkflow[selectedWorkflowPath]
      : null
    if (typeof savedScrollTop === "number" && savedScrollTop > 0) {
      el.scrollTop = savedScrollTop
      isNearBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < 80
      return
    }
    el.scrollTop = el.scrollHeight
    isNearBottomRef.current = true
  }, [selectedWorkflowPath])

  // Auto-scroll when new messages arrive or content streams
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight
      if (selectedWorkflowPath) {
        setChatScrollTopByWorkflow((prev) => ({
          ...prev,
          [selectedWorkflowPath]: el.scrollTop,
        }))
      }
    } else if (messages.length > 0 || flowMessages.length > 0) {
      setShowScrollIndicator(true)
    }
  }, [
    messages,
    flowMessages,
    selectedWorkflowPath,
    setChatScrollTopByWorkflow,
    status,
  ])

  if (timeline.length === 0) {
    const flowName = workflow?.name || templateContext?.workflowName || "Flow"
    const description =
      workflow?.description || templateContext?.useWhen || null
    const hasPastRuns = workflowHistoryRuns.length > 0

    return (
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="ui-empty-state-box max-w-md text-center space-y-3">
          <p className="text-body-md font-medium text-foreground">{flowName}</p>
          {description && (
            <p className="text-body-sm text-muted-foreground">{description}</p>
          )}
          <p className="ui-meta-text text-muted-foreground">
            {hasPastRuns
              ? "No completed runs yet. Click Run to start a new one."
              : "Click Run to start, or type a message below"}
          </p>
        </div>
      </div>
    )
  }

  const scrollToBottom = () => {
    const el = containerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    setShowScrollIndicator(false)
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto ui-scroll-region"
      >
        <div className="max-w-3xl mx-auto w-full px-4 py-4 space-y-0">
          {timeline.map((entry, index) => {
            if (entry.kind === "flow") {
              const flowMsg = entry.message
              if (flowMsg.content.type === "start") {
                return (
                  <div
                    key={flowMsg.id}
                    className={cn(
                      "ui-fade-slide-in pt-4",
                      index === 0 && "pt-0",
                    )}
                  >
                    <FlowStartMessage
                      flowName={flowMsg.flowName}
                      data={flowMsg.content.data}
                    />
                  </div>
                )
              }
              if (flowMsg.content.type === "progress") {
                return (
                  <div
                    key={flowMsg.id}
                    className={cn(
                      "ui-fade-slide-in pt-4",
                      index === 0 && "pt-0",
                    )}
                  >
                    <FlowProgressMessage data={flowMsg.content.data} />
                  </div>
                )
              }
              if (flowMsg.content.type === "complete") {
                return (
                  <div
                    key={flowMsg.id}
                    className={cn(
                      "ui-fade-slide-in pt-4",
                      index === 0 && "pt-0",
                    )}
                  >
                    <FlowCompleteMessage
                      flowName={flowMsg.flowName}
                      data={flowMsg.content.data}
                      onFollowUp={handleFollowUp}
                      onOpenReport={(path) => window.api.openPath(path)}
                    />
                  </div>
                )
              }
              if (flowMsg.content.type === "error") {
                return (
                  <div
                    key={flowMsg.id}
                    className={cn(
                      "ui-fade-slide-in pt-4",
                      index === 0 && "pt-0",
                    )}
                  >
                    <FlowErrorMessage
                      flowName={flowMsg.flowName}
                      data={flowMsg.content.data}
                    />
                  </div>
                )
              }
              if (flowMsg.content.type === "decision") {
                return (
                  <div
                    key={flowMsg.id}
                    className={cn(
                      "ui-fade-slide-in pt-4",
                      index === 0 && "pt-0",
                    )}
                  >
                    <FlowDecisionMessage
                      flowName={flowMsg.flowName}
                      data={flowMsg.content.data}
                      resolved={resolvedIds.has(flowMsg.id)}
                      onResolved={() => resolveDecision(flowMsg.id)}
                    />
                  </div>
                )
              }
              return null
            }

            const msg = entry.message
            const prevEntry = timeline[index - 1]
            const nextEntry = timeline[index + 1]
            const prev =
              prevEntry?.kind === "chat" ? prevEntry.message : undefined
            const next =
              nextEntry?.kind === "chat" ? nextEntry.message : undefined
            const isTurnMessage =
              msg.role === "user" || msg.role === "assistant"
            const groupedWithPrevious = Boolean(
              isTurnMessage && prev && prev.role === msg.role,
            )
            const groupedWithNext = Boolean(
              isTurnMessage && next && next.role === msg.role,
            )

            return (
              <div
                key={msg.id}
                className={cn(
                  "ui-fade-slide-in",
                  groupedWithPrevious ? "pt-1" : "pt-4",
                  index === 0 && "pt-0",
                )}
              >
                <ChatMessageBubble
                  message={msg}
                  groupedWithPrevious={groupedWithPrevious}
                  groupedWithNext={groupedWithNext}
                />
              </div>
            )
          })}
        </div>
      </div>
      <div
        data-visible={showScrollIndicator ? "true" : "false"}
        className="ui-inline-presence absolute bottom-3 left-1/2 z-10 -translate-x-1/2"
      >
        <button
          type="button"
          onClick={scrollToBottom}
          className="ui-pressable ui-surface-lift inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-2/70 px-3 py-1 ui-meta-text text-muted-foreground"
        >
          <ArrowDown size={11} />
          New messages
        </button>
      </div>
    </div>
  )
}
