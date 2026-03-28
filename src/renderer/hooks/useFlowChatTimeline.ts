import { useMemo } from "react"
import { useAtomValue } from "jotai"
import {
  chatRoutingProgressAtom,
  currentWorkflowAtom,
  inputValueAtom,
  selectedWorkflowPathAtom,
  workflowEntryStateAtom,
  type ChatMessageDisplay,
} from "@/lib/store"
import { currentFlowChatMessagesAtom } from "@/features/execution/flow-chat-state"
import {
  effectiveExecutionStateAtom,
  workflowHistoryRunsAtom,
} from "@/features/execution/state"
import { buildCompleteMessage } from "@/lib/flow-chat-transformer"
import type { FlowChatMessage } from "@/lib/flow-chat-types"
import { usePastRunTimeline } from "./usePastRunTimeline"

export type TimelineEntry =
  | { kind: "chat"; message: ChatMessageDisplay }
  | { kind: "flow"; message: FlowChatMessage }

export function useFlowChatTimeline(messages: ChatMessageDisplay[]) {
  const selectedWorkflowPath = useAtomValue(selectedWorkflowPathAtom)
  const flowMessages = useAtomValue(currentFlowChatMessagesAtom)
  const workflow = useAtomValue(currentWorkflowAtom)
  const entryState = useAtomValue(workflowEntryStateAtom)
  const chatRoutingProgress = useAtomValue(chatRoutingProgressAtom)
  const inputValue = useAtomValue(inputValueAtom)
  const executionState = useAtomValue(effectiveExecutionStateAtom)
  const workflowHistoryRuns = useAtomValue(workflowHistoryRunsAtom)

  // Synthesize a Complete message for runs that finished before chat existed
  const syntheticCompleteMessage = useMemo<FlowChatMessage | null>(() => {
    if (flowMessages.length > 0) return null
    if (executionState.runOutcome !== "completed") return null
    // P0-5 fix: prefer disk timeline when a past run workspace is available
    // (disk timeline has full progress, findings, follow-ups; synthetic is minimal)
    const hasEligiblePastRun = workflowHistoryRuns.some(
      (r) => r.status === "completed" && r.workspace,
    )
    if (hasEligiblePastRun) return null

    const durationMs =
      executionState.completedAt && executionState.runStartedAt
        ? executionState.completedAt - executionState.runStartedAt
        : 0
    const costUsd = Object.values(executionState.nodeStates).reduce(
      (sum, ns) => sum + (ns.metrics?.cost_usd ?? 0),
      0,
    )

    const reportPath = executionState.reportPath

    return buildCompleteMessage({
      runId: executionState.runId ?? "past-run",
      flowName: executionState.workflowName || workflow?.name || "Flow",
      summary: "Flow completed.",
      findings: [],
      limitations: [],
      artifacts: reportPath
        ? [{ name: "report.md", path: reportPath, kind: "report" }]
        : [],
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
    workflowHistoryRuns,
  ])

  // Fallback: if no synthetic from execution state, load full timeline from disk
  const latestEligibleRun = useMemo(() => {
    if (syntheticCompleteMessage) return null
    if (flowMessages.length > 0) return null

    return (
      workflowHistoryRuns
        .filter(
          (r) =>
            r.status === "completed" ||
            r.status === "failed" ||
            r.status === "cancelled",
        )
        .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))[0] ?? null
    )
  }, [syntheticCompleteMessage, flowMessages.length, workflowHistoryRuns])

  const pastRunMessages = usePastRunTimeline({
    enabled: flowMessages.length === 0 && !syntheticCompleteMessage,
    latestRun: latestEligibleRun,
    flowName: workflow?.name || "Flow",
  })

  // Synthesize a routing message from workflowEntryState when template was
  // routed. This surfaces the routing decision (selected starting point) as a
  // native chat message so the user sees it in the timeline.
  const syntheticRoutingMessage = useMemo<FlowChatMessage | null>(() => {
    if (!entryState) return null
    if (
      entryState.workflowPath &&
      entryState.workflowPath !== selectedWorkflowPath
    )
      return null

    const routingSteps: Array<{
      label: string
      status: "pending" | "running" | "done"
    }> = [
      { label: "Read your goal", status: "done" },
      { label: "Inspect project context", status: "done" },
      {
        label: `Open ${entryState.title || "starting point"}`,
        status: "done",
      },
    ]

    const firstFlowTs =
      flowMessages.length > 0 ? flowMessages[0].timestamp : Date.now()
    const routingTs = firstFlowTs - 1

    return {
      id: `routing-${entryState.workflowPath || "entry"}`,
      flowName: entryState.workflowName || workflow?.name || "Flow",
      timestamp: routingTs,
      content: {
        type: "routing" as const,
        data: {
          steps: routingSteps,
          selectedTemplate: {
            name: entryState.title,
            description: entryState.summary,
          },
        },
      },
    }
  }, [entryState, selectedWorkflowPath, flowMessages, workflow?.name])

  // Live in-progress routing message driven by chatRoutingProgressAtom.
  const liveRoutingMessage = useMemo<FlowChatMessage | null>(() => {
    if (!chatRoutingProgress) return null
    if (syntheticRoutingMessage) return null

    // Error phase — show failed routing steps + error message
    if (chatRoutingProgress.phase === "error") {
      return {
        id: "routing-live",
        flowName: "Flow",
        timestamp: Date.now(),
        content: {
          type: "routing" as const,
          data: {
            steps: [
              { label: "Read your goal", status: "done" as const },
              { label: "Inspect project context", status: "done" as const },
            ],
            error: chatRoutingProgress.errorMessage || "Something went wrong.",
          },
        },
      }
    }

    // Clarification phase — show completed inspection + clarification options
    if (
      chatRoutingProgress.phase === "clarifying" &&
      chatRoutingProgress.clarification
    ) {
      const clarification = chatRoutingProgress.clarification
      return {
        id: "routing-live",
        flowName: "Flow",
        timestamp: Date.now(),
        content: {
          type: "routing" as const,
          data: {
            steps: [
              { label: "Read your goal", status: "done" as const },
              { label: "Choose a direction", status: "running" as const },
            ],
            clarification: {
              kind: clarification.kind,
              title: clarification.title,
              message: clarification.message,
              options: clarification.options.map((opt) => ({
                value: opt.value,
                label: opt.label,
                description: opt.description,
                templateId:
                  "templateId" in opt
                    ? (opt as { templateId: string }).templateId
                    : undefined,
              })),
            },
          },
        },
      }
    }

    const isOpening = chatRoutingProgress.phase === "opening"
    const templateLabel =
      chatRoutingProgress.templateName || "the best starting point"

    const routingSteps: Array<{
      label: string
      status: "pending" | "running" | "done"
    }> = [
      { label: "Read your goal", status: "done" },
      {
        label: "Inspect project context",
        status: isOpening ? "done" : "running",
      },
      {
        label: isOpening
          ? `Open ${templateLabel}`
          : "Open the best starting point",
        status: isOpening ? "running" : "pending",
      },
    ]

    return {
      id: "routing-live",
      flowName: "Flow",
      timestamp: Date.now(),
      content: {
        type: "routing" as const,
        data: {
          steps: routingSteps,
          selectedTemplate:
            isOpening && chatRoutingProgress.templateName
              ? {
                  name: chatRoutingProgress.templateName,
                  description: chatRoutingProgress.templateDescription || "",
                }
              : undefined,
        },
      },
    }
  }, [chatRoutingProgress, syntheticRoutingMessage])

  // Synthesize a user bubble showing what the user typed to trigger routing
  // or start the flow. This survives workflow path changes (unlike chatMessagesAtom).
  const syntheticUserMessage = useMemo<ChatMessageDisplay | null>(() => {
    // During live routing — show the user's request from routing progress
    const routingRequest = chatRoutingProgress?.userRequest
    if (routingRequest) {
      return {
        id: "synthetic-user-routing",
        role: "user",
        content: routingRequest,
        timestamp: Date.now() - 2000, // before routing message
      }
    }
    // After routing completed — show the input value if we have a routing entry
    // and no real user messages exist yet
    if (
      entryState?.routing?.source === "agent" &&
      inputValue?.trim() &&
      messages.length === 0
    ) {
      const firstFlowTs =
        flowMessages.length > 0 ? flowMessages[0].timestamp : Date.now()
      return {
        id: "synthetic-user-input",
        role: "user",
        content: inputValue.trim(),
        timestamp: firstFlowTs - 2000, // before any flow messages
      }
    }
    return null
  }, [
    chatRoutingProgress?.userRequest,
    entryState?.routing?.source,
    inputValue,
    messages.length,
    flowMessages,
  ])

  const timeline = useMemo<TimelineEntry[]>(() => {
    const chatEntries: TimelineEntry[] = messages.map((m) => ({
      kind: "chat",
      message: m,
    }))
    // Add synthetic user bubble if no real user messages exist
    if (syntheticUserMessage && !messages.some((m) => m.role === "user")) {
      chatEntries.push({ kind: "chat", message: syntheticUserMessage })
    }
    const extraFlowMessages: FlowChatMessage[] = []
    if (liveRoutingMessage) extraFlowMessages.push(liveRoutingMessage)
    if (syntheticRoutingMessage) extraFlowMessages.push(syntheticRoutingMessage)
    if (syntheticCompleteMessage)
      extraFlowMessages.push(syntheticCompleteMessage)
    extraFlowMessages.push(...pastRunMessages)
    const allFlowMessages =
      extraFlowMessages.length > 0
        ? [...flowMessages, ...extraFlowMessages]
        : flowMessages
    const flowEntries: TimelineEntry[] = allFlowMessages.map((m) => ({
      kind: "flow",
      message: m,
    }))
    return [...chatEntries, ...flowEntries].sort(
      (a, b) => a.message.timestamp - b.message.timestamp,
    )
  }, [
    messages,
    syntheticUserMessage,
    flowMessages,
    liveRoutingMessage,
    syntheticRoutingMessage,
    syntheticCompleteMessage,
    pastRunMessages,
  ])

  return { timeline, flowMessages, entryState }
}
