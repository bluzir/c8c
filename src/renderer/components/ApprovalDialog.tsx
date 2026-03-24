import { useState, useEffect, useMemo, useRef } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  approvalRequestsAtom,
  workflowExecutionStatesAtom,
} from "@/features/execution"
import { desktopRuntimeAtom, multiRunDashboardOpenAtom } from "@/lib/store"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Check, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/cn"
import { toastError } from "@/lib/toast-error"
import {
  DEFAULT_EXECUTION_IPC_TIMEOUT_MS,
  withIpcTimeout,
} from "@/features/execution"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import {
  consumeShortcut,
  isShortcutConsumed,
  matchesPrimaryShortcut,
} from "@/lib/keyboard-shortcuts"
import { ExecutionApprovalSummary } from "@/components/ui/execution-approval-summary"
import type { WorkflowNode } from "@shared/types"
import { deriveExecutionLoopSummary } from "@/lib/execution-loops"
import { ExecutionLoopCard } from "@/components/ui/execution-loop-card"
import {
  getRuntimeNodeLabel,
  getRuntimeStagePresentation,
} from "@/lib/runtime-flow-labels"
import { deriveExecutionLoopFlowRules } from "@/lib/flow-rules"
import { FlowRulesPreview } from "@/components/ui/flow-rules-preview"

type EvaluatorWorkflowNode = Extract<WorkflowNode, { type: "evaluator" }>

function isEvaluatorNode(
  node: WorkflowNode | null | undefined,
): node is EvaluatorWorkflowNode {
  return node?.type === "evaluator"
}

function labelFromPathLike(value: string | null | undefined, fallback: string) {
  if (!value) return fallback
  const leaf = value.split(/[\\/]/).pop() || value
  const normalized = leaf.replace(/\.(ya?ml|json)$/i, "").trim()
  return normalized || fallback
}

function formatNextStageLabel(labels: string[]) {
  if (labels.length === 0) return null
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels[0]} +${labels.length - 1} more`
}

export function ApprovalDialog() {
  const [requests, setRequests] = useAtom(approvalRequestsAtom)
  const executionStates = useAtomValue(workflowExecutionStatesAtom)
  const desktopRuntime = useAtomValue(desktopRuntimeAtom)
  const multiRunDashboardOpen = useAtomValue(multiRunDashboardOpenAtom)
  const setMultiRunDashboardOpen = useSetAtom(multiRunDashboardOpenAtom)
  const [editedContent, setEditedContent] = useState("")
  const [pendingAction, setPendingAction] = useState<
    "approve" | "reject" | null
  >(null)
  const [dismissedRequestKey, setDismissedRequestKey] = useState<string | null>(
    null,
  )
  const [selectedIndex, setSelectedIndex] = useState(0)
  const mountedRef = useRef(true)

  const clampedIndex = Math.min(selectedIndex, Math.max(0, requests.length - 1))
  const request = requests[clampedIndex] ?? null
  const queueCount = requests.length
  const requestKey = request
    ? `${request.workflowKey}::${request.runId}::${request.nodeId}`
    : null
  const requestExecutionState = useMemo(
    () =>
      request
        ? executionStates[request.workflowKey] ||
          Object.values(executionStates).find(
            (state) => state.runId === request.runId,
          ) ||
          null
        : null,
    [executionStates, request],
  )
  const evaluatorSummary = useMemo(() => {
    if (!request || !requestExecutionState?.workflowSnapshot) return null

    const workflow = requestExecutionState.workflowSnapshot
    const directPredecessorIds = workflow.edges
      .filter((edge) => edge.target === request.nodeId)
      .map((edge) => edge.source)
    const directEvaluatorNode = directPredecessorIds
      .map(
        (nodeId) => workflow.nodes.find((node) => node.id === nodeId) || null,
      )
      .find(isEvaluatorNode)
    return deriveExecutionLoopSummary({
      workflow,
      nodeStates: requestExecutionState.nodeStates,
      evalResults: requestExecutionState.evalResults,
      runOutcome: requestExecutionState.runOutcome,
      preferredEvaluatorNodeId: directEvaluatorNode?.id || null,
    })
  }, [request, requestExecutionState])
  const primaryShortcutLabel = `${desktopRuntime.primaryModifierLabel}↵`
  const queueLabels = useMemo(() => {
    return requests.map((req) => {
      const execState =
        executionStates[req.workflowKey] ||
        Object.values(executionStates).find(
          (state) => state.runId === req.runId,
        ) ||
        null
      const workflow = execState?.workflowSnapshot
      const stageNode =
        workflow?.nodes.find((node) => node.id === req.nodeId) || null
      const stepLabel = stageNode
        ? getRuntimeNodeLabel(stageNode, { fallbackId: stageNode.id })
        : labelFromPathLike(req.nodeId, "Step")
      const flowLabel =
        execState?.workflowName.trim() ||
        labelFromPathLike(
          execState?.runWorkflowPath,
          labelFromPathLike(req.workflowKey, "Flow"),
        )
      return { stepLabel, flowLabel }
    })
  }, [requests, executionStates])
  const hasMultipleFlows =
    queueLabels.length > 1 &&
    new Set(queueLabels.map((l) => l.flowLabel)).size > 1
  const requestContext = useMemo(() => {
    if (!request) return null

    const workflow = requestExecutionState?.workflowSnapshot
    const workflowName =
      requestExecutionState?.workflowName.trim() ||
      labelFromPathLike(
        requestExecutionState?.runWorkflowPath,
        labelFromPathLike(request.workflowKey, "Flow"),
      )
    const stageNode =
      workflow?.nodes.find((node) => node.id === request.nodeId) || null
    const stageLabel = stageNode
      ? getRuntimeNodeLabel(stageNode, { fallbackId: stageNode.id })
      : labelFromPathLike(request.nodeId, "Step")
    const stagePresentation = stageNode
      ? getRuntimeStagePresentation(stageNode, { fallbackId: stageNode.id })
      : null
    const nextStageLabels = workflow
      ? Array.from(
          new Set(
            workflow.edges
              .filter((edge) => edge.source === request.nodeId)
              .map(
                (edge) =>
                  workflow.nodes.find((node) => node.id === edge.target) ||
                  null,
              )
              .filter((node): node is WorkflowNode => Boolean(node))
              .map((node) =>
                getRuntimeNodeLabel(node, { fallbackId: node.id }),
              ),
          ),
        )
      : []
    const nextStageLabel = formatNextStageLabel(nextStageLabels)

    return {
      workflowName,
      stageLabel,
      stageKind: stagePresentation?.group || "Step",
      stepDescription:
        request.message ||
        stagePresentation?.outcomeText ||
        "Review this exact step before the flow continues.",
      expectedResult: stagePresentation?.artifactLabel || "Reviewable result",
      approveConsequence: nextStageLabel
        ? `Continues to ${nextStageLabel}`
        : workflow
          ? "Completes this flow run"
          : "Continues this flow run",
      rejectConsequence: "Stops this flow run",
    }
  }, [request, requestExecutionState])
  const flowRules = useMemo(
    () => deriveExecutionLoopFlowRules(evaluatorSummary),
    [evaluatorSummary],
  )
  const gateTitle = requestContext
    ? `Approve ${requestContext.stageLabel}`
    : "Approve this step"
  const gateDescription =
    request?.message || "Review this exact step before the flow continues."
  const dialogOpen = Boolean(request && requestKey !== dismissedRequestKey)
  const hasDecisionDetails = flowRules.length > 0 || evaluatorSummary !== null

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (request) {
      setEditedContent(request.content)
    }
  }, [request])

  useEffect(() => {
    if (!requestKey) {
      setDismissedRequestKey(null)
      return
    }
    if (dismissedRequestKey && dismissedRequestKey !== requestKey) {
      setDismissedRequestKey(null)
    }
  }, [dismissedRequestKey, requestKey])

  useEffect(() => {
    if (multiRunDashboardOpen) return
    setDismissedRequestKey(null)
  }, [multiRunDashboardOpen])

  // Clamp selectedIndex when queue shrinks externally
  useEffect(() => {
    if (selectedIndex >= requests.length && requests.length > 0) {
      setSelectedIndex(requests.length - 1)
    }
  }, [requests.length, selectedIndex])

  useEffect(() => {
    if (!request) return

    const handler = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        isShortcutConsumed(event) ||
        pendingAction !== null
      )
        return

      if (
        !matchesPrimaryShortcut(event, {
          key: "Enter",
          primaryModifierKey: desktopRuntime.primaryModifierKey,
        })
      )
        return
      consumeShortcut(event)
      void handleApprove()
    }

    window.addEventListener("keydown", handler, true)
    return () => {
      window.removeEventListener("keydown", handler, true)
    }
  }, [desktopRuntime.primaryModifierKey, pendingAction, request, editedContent])

  if (!request) return null

  const removeCurrentRequest = () => {
    setRequests((prev) => prev.filter((_, i) => i !== clampedIndex))
    setSelectedIndex((prev) =>
      prev >= requests.length - 1 ? Math.max(0, prev - 1) : prev,
    )
  }

  const handleDismiss = () => {
    if (!requestKey || pendingAction !== null) return
    setDismissedRequestKey(requestKey)
    setMultiRunDashboardOpen(true)
  }

  const handleApprove = async () => {
    if (pendingAction !== null) return
    const content = request.allowEdit ? editedContent : undefined
    setPendingAction("approve")
    try {
      const ok = await withIpcTimeout(
        window.api.approveNode(request.runId, request.nodeId, content),
        DEFAULT_EXECUTION_IPC_TIMEOUT_MS,
        "Approval timed out. Try again, or restart the app if the problem continues.",
      )
      if (!ok) {
        toastError("Could not approve step: this flow is no longer active")
        removeCurrentRequest()
        return
      }
      toast.success("Step approved — flow continuing.")
      removeCurrentRequest()
    } catch (err) {
      console.error("[ApprovalDialog] approve failed:", err)
      toastError("Could not approve step")
    } finally {
      if (mountedRef.current) {
        setPendingAction(null)
      }
    }
  }

  const handleReject = async () => {
    if (pendingAction !== null) return
    setPendingAction("reject")
    try {
      const ok = await withIpcTimeout(
        window.api.rejectNode(request.runId, request.nodeId),
        DEFAULT_EXECUTION_IPC_TIMEOUT_MS,
        "Stopping the flow timed out. Try again, or restart the app if the problem continues.",
      )
      if (!ok) {
        toastError("Could not stop flow: it is no longer active")
        removeCurrentRequest()
        return
      }
      toast.success("Step rejected — flow stopped.")
      removeCurrentRequest()
    } catch (err) {
      console.error("[ApprovalDialog] reject failed:", err)
      toastError("Could not stop flow")
    } finally {
      if (mountedRef.current) {
        setPendingAction(null)
      }
    }
  }

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        if (!open) handleDismiss()
      }}
    >
      <DialogContent
        className={cn(
          "max-h-[80vh] overflow-hidden",
          queueCount > 1 ? "max-w-4xl" : "max-w-2xl",
        )}
        data-approval-dialog="true"
      >
        <div
          className={cn(
            queueCount > 1
              ? "grid grid-cols-[200px_minmax(0,1fr)] gap-0"
              : undefined,
          )}
        >
          {queueCount > 1 && (
            <div className="ui-slab border-r border-hairline overflow-y-auto ui-scroll-region max-h-[calc(80vh-2rem)]">
              {requests.map((req, index) => {
                const label = queueLabels[index]
                return (
                  <button
                    key={`${req.workflowKey}::${req.runId}::${req.nodeId}`}
                    type="button"
                    onClick={() => setSelectedIndex(index)}
                    className={cn(
                      "w-full border-b border-hairline px-3 py-2.5 text-left ui-motion-fast last:border-b-0",
                      index === clampedIndex
                        ? "ui-selected-row-tint"
                        : "bg-transparent hover:bg-surface-2/25",
                    )}
                  >
                    <p className="truncate text-body-sm font-medium text-foreground">
                      {label?.stepLabel || "Step"}
                    </p>
                    {hasMultipleFlows && label?.flowLabel && (
                      <p className="mt-0.5 truncate ui-meta-text text-muted-foreground">
                        {label.flowLabel}
                      </p>
                    )}
                  </button>
                )
              })}
            </div>
          )}
          <div className="overflow-y-auto ui-scroll-region max-h-[calc(80vh-2rem)] px-6 py-6 space-y-4">
            <DialogHeader className="p-0">
              <DialogTitle>{gateTitle}</DialogTitle>
              <DialogDescription>{gateDescription}</DialogDescription>
            </DialogHeader>

            {requestContext && (
              <ExecutionApprovalSummary
                flowName={requestContext.workflowName}
                stepName={requestContext.stageLabel}
                stepKind={requestContext.stageKind}
                stepDescription={requestContext.stepDescription}
                expectedResult={requestContext.expectedResult}
                inputPreview={request.content}
                approveConsequence={requestContext.approveConsequence}
                rejectConsequence={requestContext.rejectConsequence}
                topBadges={
                  queueCount > 1 ? (
                    <Badge variant="secondary" size="compact">
                      {clampedIndex + 1}/{queueCount}
                    </Badge>
                  ) : null
                }
              />
            )}

            {hasDecisionDetails ? (
              <DisclosurePanel
                summary="Decision details"
                surface="plain"
                className="ui-section-divider"
                summaryClassName="px-0 py-1.5"
                contentClassName="space-y-3 pt-2"
                unmountWhenClosed
              >
                <FlowRulesPreview
                  rules={flowRules}
                  collapsible
                  defaultOpen={false}
                />

                {evaluatorSummary ? (
                  <ExecutionLoopCard
                    summary={evaluatorSummary}
                    compact
                    detailSummary="Technical details"
                    surface="flat"
                    showTechnicalBadges={false}
                  />
                ) : null}
              </DisclosurePanel>
            ) : null}

            {request.content &&
              (request.allowEdit ? (
                <DisclosurePanel
                  summary={
                    <span className="flex items-center gap-2">
                      <span>Review and edit input</span>
                      <Badge variant="outline" size="compact">
                        Editable
                      </Badge>
                    </span>
                  }
                  surface="plain"
                  className="ui-section-divider"
                  summaryClassName="px-0 py-1.5"
                  contentClassName="space-y-2 pt-2"
                  unmountWhenClosed
                >
                  <Textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    rows={12}
                    aria-label="Edit step output before continuing"
                    className="font-mono text-body-sm"
                    autoFocus
                  />
                  <p className="ui-meta-text text-muted-foreground">
                    Your edits will be used as the step output when approved.
                  </p>
                </DisclosurePanel>
              ) : (
                <DisclosurePanel
                  summary="Show full input"
                  surface="plain"
                  className="ui-section-divider"
                  summaryClassName="px-0 py-1.5"
                  contentClassName="pt-2"
                  unmountWhenClosed
                >
                  <div className="max-h-64 overflow-y-auto border-l border-hairline pl-3 ui-scroll-region">
                    <pre className="text-body-sm text-foreground-subtle whitespace-pre-wrap">
                      {request.content}
                    </pre>
                  </div>
                </DisclosurePanel>
              ))}

            <DialogFooter className="ui-section-divider">
              <span className="mr-auto ui-meta-text text-muted-foreground">
                {primaryShortcutLabel} approve
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleReject}
                isLoading={pendingAction === "reject"}
                disabled={pendingAction !== null}
              >
                {pendingAction !== "reject" && <X size={14} />}
                Reject & stop
              </Button>
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={pendingAction !== null}
                isLoading={pendingAction === "approve"}
                autoFocus
              >
                {pendingAction !== "approve" && <Check size={14} />}
                Approve & continue
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
