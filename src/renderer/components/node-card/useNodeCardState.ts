import { useEffect, useState } from "react"
import { useAtom } from "jotai"
import { Zap } from "lucide-react"

import {
  validationErrorsAtom,
  validationNavigationTargetAtom,
} from "@/lib/store"
import { NODE_ICONS, NODE_LABELS } from "@/lib/node-ui-config"
import type {
  ApprovalNodeConfig,
  EvaluatorNodeConfig,
  HumanNodeConfig,
  InputNodeConfig,
  MergerNodeConfig,
  NodeState,
  OutputNodeConfig,
  SkillNodeConfig,
  SplitterNodeConfig,
  WorkflowNode,
} from "@shared/types"

const FIELD_ERRORS_RENDERED_INLINE = new Set([
  "skillRef",
  "prompt",
  "outputMode",
  "maxTurns",
  "permissionMode",
  "criteria",
  "threshold",
  "maxRetries",
  "strategy",
  "maxBranches",
])

const STATUS_CLASSES: Record<string, string> = {
  completed: "border-status-success/60",
  failed: "border-status-danger/60",
  running: "border-foreground/40",
  waiting_approval: "border-status-warning/60 ring-1 ring-status-warning/40",
  waiting_human: "border-status-warning/60 ring-1 ring-status-warning/40",
  skipped: "border-status-warning/50",
  queued: "border-foreground/20",
  pending: "",
  idle: "",
}

const STATUS_LABELS: Record<string, string> = {
  running: "running",
  completed: "completed",
  failed: "failed",
  queued: "waiting",
  skipped: "skipped",
  waiting_approval: "waiting for approval",
  waiting_human: "waiting for input",
  pending: "pending",
  idle: "idle",
}

export function useNodeCardState({
  node,
  index,
  total,
  state,
  compact,
  runtimeMode,
  onMoveUp,
  onMoveDown,
  moveUpDisabledReasonProp,
  moveDownDisabledReasonProp,
  resolveNodeLabel,
}: {
  node: WorkflowNode
  index: number
  total: number
  state?: NodeState
  compact: boolean
  runtimeMode: boolean
  onMoveUp?: () => void
  onMoveDown?: () => void
  moveUpDisabledReasonProp?: string | null
  moveDownDisabledReasonProp?: string | null
  resolveNodeLabel?: (nodeId: string) => string
}) {
  const [expanded, setExpanded] = useState(false)
  const [validationNavigationTarget, setValidationNavigationTarget] = useAtom(validationNavigationTargetAtom)
  const [allValidationErrors] = useAtom(validationErrorsAtom)
  const nodeValidationErrors = allValidationErrors[node.id] || []
  const hasValidationErrors = nodeValidationErrors.some((error) => error.severity === "error")
  const remainingValidationErrors = nodeValidationErrors.filter((error) => {
    const field = error.field.replace(/^config\./, "")
    return !FIELD_ERRORS_RENDERED_INLINE.has(field)
  })

  const Icon = NODE_ICONS[node.type] || Zap
  const isInput = node.type === "input"
  const isOutput = node.type === "output"
  const isSkill = node.type === "skill"
  const isEvaluator = node.type === "evaluator"
  const isSplitter = node.type === "splitter"
  const isMerger = node.type === "merger"
  const isApproval = node.type === "approval"
  const isHuman = node.type === "human"
  const isExpandable = isInput || isOutput || isSkill || isEvaluator || isSplitter || isMerger || isApproval || isHuman
  const isTerminal = isInput || isOutput
  const inputConfig = isInput ? (node.config as InputNodeConfig) : null
  const outputConfig = isOutput ? (node.config as OutputNodeConfig) : null
  const skillConfig = isSkill ? (node.config as SkillNodeConfig) : null
  const evalConfig = isEvaluator ? (node.config as EvaluatorNodeConfig) : null
  const splitterConfig = isSplitter ? (node.config as SplitterNodeConfig) : null
  const mergerConfig = isMerger ? (node.config as MergerNodeConfig) : null
  const approvalConfig = isApproval ? (node.config as ApprovalNodeConfig) : null
  const humanConfig = isHuman ? (node.config as HumanNodeConfig) : null

  const title = isSkill
    ? skillConfig?.skillRef || "Unnamed Skill"
    : isOutput && outputConfig?.title
      ? outputConfig.title
      : isHuman && humanConfig?.staticRequest?.title
        ? humanConfig.staticRequest.title
        : NODE_LABELS[node.type] || node.type

  const retryLabel = evalConfig?.retryFrom
    ? resolveNodeLabel?.(evalConfig.retryFrom) || evalConfig.retryFrom
    : null

  const statusLabel = state?.status ? STATUS_LABELS[state.status] || state.status : null
  const statusClass = state?.status ? (STATUS_CLASSES[state.status] ?? "") : ""
  const showStatusBadge = statusLabel
    && statusLabel !== "pending"
    && (!compact || state?.status === "running" || state?.status === "failed" || state?.status === "waiting_approval" || state?.status === "waiting_human")
  const showInlineInput = !runtimeMode && compact && isInput && Boolean(inputConfig)
  const hasExpandedPanel = Boolean(
    (isInput && inputConfig)
    || (isOutput && outputConfig)
    || (isSkill && skillConfig)
    || (isEvaluator && evalConfig)
    || (isSplitter && splitterConfig)
    || (isMerger && mergerConfig)
    || (isApproval && approvalConfig)
    || (isHuman && humanConfig)
  )
  const moveUpDisabledReason = moveUpDisabledReasonProp ?? (!onMoveUp
    ? "Reordering is only available for linear flows."
    : index <= 1
      ? "This step is already the first editable step."
      : null)
  const moveDownDisabledReason = moveDownDisabledReasonProp ?? (!onMoveDown
    ? "Reordering is only available for linear flows."
    : index >= total - 2
      ? "This step is already the last editable step."
      : null)

  useEffect(() => {
    if (runtimeMode) {
      setExpanded(false)
    }
  }, [runtimeMode])

  useEffect(() => {
    if (runtimeMode || !hasExpandedPanel || !hasValidationErrors) return
    setExpanded(true)
  }, [hasExpandedPanel, hasValidationErrors, runtimeMode])

  useEffect(() => {
    if (runtimeMode || !validationNavigationTarget) return
    if (validationNavigationTarget.nodeId && validationNavigationTarget.nodeId !== node.id) return

    let cancelled = false
    let timeoutId: number | null = null
    let attempts = 0

    const focusTarget = () => {
      if (cancelled) return
      const target = document.getElementById(validationNavigationTarget.fieldId)
      if (target instanceof HTMLElement) {
        target.focus()
        target.scrollIntoView({ block: "center", behavior: "smooth" })
        setValidationNavigationTarget(null)
        return
      }
      if (hasExpandedPanel && !expanded) {
        setExpanded(true)
      }
      if (attempts >= 6) {
        setValidationNavigationTarget(null)
        return
      }
      attempts += 1
      timeoutId = window.setTimeout(focusTarget, 60)
    }

    timeoutId = window.setTimeout(focusTarget, 0)
    return () => {
      cancelled = true
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [expanded, hasExpandedPanel, node.id, runtimeMode, setValidationNavigationTarget, validationNavigationTarget])

  return {
    expanded,
    setExpanded,
    nodeValidationErrors,
    hasValidationErrors,
    remainingValidationErrors,
    Icon,
    isInput,
    isOutput,
    isSkill,
    isEvaluator,
    isSplitter,
    isMerger,
    isApproval,
    isHuman,
    isExpandable,
    isTerminal,
    inputConfig,
    outputConfig,
    skillConfig,
    evalConfig,
    splitterConfig,
    mergerConfig,
    approvalConfig,
    humanConfig,
    title,
    retryLabel,
    statusLabel,
    statusClass,
    showStatusBadge,
    showInlineInput,
    hasExpandedPanel,
    moveUpDisabledReason,
    moveDownDisabledReason,
  }
}
