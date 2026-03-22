import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { useAtom, useAtomValue } from "jotai"
import { cn } from "@/lib/cn"
import { useWorkflowWithUndo } from "@/hooks/useWorkflowWithUndo"
import {
  desktopRuntimeAtom,
  openSkillPickerAtom,
  selectedNodeIdAtom,
  type WorkflowNode,
} from "@/lib/store"
import { activeNodeIdAtom, inspectedNodeIdAtom, nodeStatesAtom, runtimeMetaAtom } from "@/features/execution"
import type {
  ApprovalNodeConfig,
  EvaluatorNodeConfig,
  HumanNodeConfig,
  InputNodeConfig,
  PersistedRunSnapshot,
  SplitterNodeConfig,
  MergerNodeConfig,
  OutputNodeConfig,
  SkillNodeConfig,
} from "@shared/types"
import { NodeCard } from "./NodeCard"
import { ArrowDown as ArrowDownIcon, ArrowRight as ArrowRightIcon } from "lucide-react"
import { toast } from "sonner"
import { cloneWorkflow } from "@/lib/workflow-graph-utils"
import { ChainBuilderAddControls } from "@/components/chain-builder/ChainBuilderAddControls"
import { ChainBuilderContextMenu } from "@/components/chain-builder/ChainBuilderContextMenu"
import { ChainBuilderRemoveDialog } from "@/components/chain-builder/ChainBuilderRemoveDialog"
import { ChainBuilderStartHint } from "@/components/chain-builder/ChainBuilderStartHint"
import { ChainBuilderSurfaceHeader } from "@/components/chain-builder/ChainBuilderSurfaceHeader"
import { resolveChainBuilderShortcutIntent } from "@/lib/chain-builder-shortcuts"
import { isEditableKeyboardTarget } from "@/lib/keyboard-shortcuts"
import {
  addApprovalNodeToWorkflow,
  addEvaluatorNodeToWorkflow,
  addFanOutPatternToWorkflow,
  addHumanNodeToWorkflow,
  getLinearChainReorderBlockReason,
  getMiddleNodeMoveBlockedReason,
  isLinearChainReorderSafe,
  moveMiddleNodeBeforeTarget,
  moveMiddleNodeByDirection,
  removeNodeAndRewireWorkflow,
} from "@/lib/workflow-mutations"
import { useChainBuilderRuntimeState } from "@/components/chain-builder/useChainBuilderRuntimeState"

interface ChainBuilderProps {
  compact?: boolean
  mode?: "edit" | "outline" | "monitor"
  onStageSelect?: (payload: { nodeId: string; preferredTab: "nodes" | "log" | "result" }) => void
  reviewSnapshot?: PersistedRunSnapshot | null
}

export function ChainBuilder({
  compact = false,
  mode = "edit",
  onStageSelect,
  reviewSnapshot = null,
}: ChainBuilderProps = {}) {
  const { workflow, setWorkflow, setWorkflowDirect } = useWorkflowWithUndo()
  const desktopRuntime = useAtomValue(desktopRuntimeAtom)
  const [nodeStates] = useAtom(nodeStatesAtom)
  const [activeNodeId] = useAtom(activeNodeIdAtom)
  const [runtimeMeta] = useAtom(runtimeMetaAtom)
  const [builderSelectedNodeId, setBuilderSelectedNodeId] = useAtom(selectedNodeIdAtom)
  const [inspectedNodeId, setInspectedNodeId] = useAtom(inspectedNodeIdAtom)
  const [, openSkillPicker] = useAtom(openSkillPickerAtom)
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)
  const isReorderSafe = isLinearChainReorderSafe(workflow)
  const reorderBlockReason = useMemo(() => getLinearChainReorderBlockReason(workflow), [workflow])
  const draggedNodeIdRef = useRef<string | null>(null)
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null)
  const undoToastIdRef = useRef<string | number | null>(null)
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [chainContextMenu, setChainContextMenu] = useState<{
    x: number
    y: number
    nodeId: string
  } | null>(null)
  const flowCardMode = mode === "outline" || mode === "monitor"
  const runtimeMode = mode === "monitor"
  // Order nodes: input first, then middle nodes in array order, then output last
  const orderedNodes = useMemo(() => {
    const inputNodes: WorkflowNode[] = []
    const middleNodes: WorkflowNode[] = []
    const outputNodes: WorkflowNode[] = []
    for (const n of workflow.nodes) {
      if (n.type === "input") inputNodes.push(n)
      else if (n.type === "output") outputNodes.push(n)
      else middleNodes.push(n)
    }
    return [...inputNodes, ...middleNodes, ...outputNodes]
  }, [workflow.nodes])
  const selectedNodeId = flowCardMode ? inspectedNodeId : builderSelectedNodeId
  const {
    displayNodeStates,
    resolvedActiveNodeId,
    resolvedSelectedNodeId,
    getNodePresentation,
    orderedMonitorStages,
    monitorCurrentStage,
    monitorNextStage,
    monitorLatestCompletedStage,
    monitorFocusNodeId,
    monitorCounts,
  } = useChainBuilderRuntimeState({
    workflowNodes: orderedNodes,
    nodeStates,
    runtimeMeta,
    reviewSnapshot,
    runtimeMode,
    flowCardMode,
    activeNodeId,
    selectedNodeId,
  })

  useEffect(() => {
    return () => {
      if (undoToastIdRef.current != null) {
        toast.dismiss(undoToastIdRef.current)
      }
    }
  }, [])
  const hasSkillNodes = useMemo(
    () => workflow.nodes.some((n) => n.type === "skill"),
    [workflow.nodes],
  )
  const contextNode = chainContextMenu
    ? workflow.nodes.find((node) => node.id === chainContextMenu.nodeId) || null
    : null

  const setSelectedNode = (nodeId: string) => {
    if (flowCardMode) {
      setInspectedNodeId(nodeId)
      return
    }
    setBuilderSelectedNodeId(nodeId)
  }

  useEffect(() => {
    if (!runtimeMode || !monitorFocusNodeId) return
    const step = stepRefs.current[monitorFocusNodeId]
    step?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
  }, [monitorFocusNodeId, runtimeMode])

  useEffect(() => {
    if (!runtimeMode || !monitorFocusNodeId) return

    const selectedMonitorStatus = orderedMonitorStages.find((entry) => entry.node.id === resolvedSelectedNodeId)?.status || null
    const shouldResyncSelection = !resolvedSelectedNodeId
      || (
        monitorCurrentStage !== null
        && resolvedSelectedNodeId !== monitorCurrentStage.node.id
        && (selectedMonitorStatus === "pending" || selectedMonitorStatus === "queued")
      )

    if (shouldResyncSelection) {
      setInspectedNodeId(monitorFocusNodeId)
    }
  }, [monitorCurrentStage, monitorFocusNodeId, orderedMonitorStages, resolvedSelectedNodeId, runtimeMode, setInspectedNodeId])

  useEffect(() => {
    if (flowCardMode || !resolvedSelectedNodeId) return
    const step = stepRefs.current[resolvedSelectedNodeId]
    step?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
  }, [flowCardMode, resolvedSelectedNodeId])

  const nodeLabelMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const node of workflow.nodes) {
      if (node.type === "skill") map.set(node.id, node.config.skillRef || "Skill")
      else if (node.type === "evaluator") map.set(node.id, "Check")
      else if (node.type === "splitter") map.set(node.id, "Split work")
      else if (node.type === "merger") map.set(node.id, "Merger")
      else if (node.type === "approval") map.set(node.id, "Approval")
      else if (node.type === "human") map.set(node.id, "Human")
      else if (node.type === "input") map.set(node.id, "Input")
      else if (node.type === "output") map.set(node.id, "Output")
      else map.set(node.id, node.id)
    }
    return map
  }, [workflow.nodes])
  const getNodeDisplayLabel = (nodeId: string) => nodeLabelMap.get(nodeId) || nodeId

  const getAddedNodes = (previous: typeof workflow, next: typeof workflow) => {
    const previousIds = new Set(previous.nodes.map((node) => node.id))
    return next.nodes.filter((node) => !previousIds.has(node.id))
  }

  const selectFirstNewNode = (previous: typeof workflow, next: typeof workflow) => {
    return getAddedNodes(previous, next)[0]?.id ?? null
  }

  const confirmRemove = (nodeId: string) => {
    const node = workflow.nodes.find((n) => n.id === nodeId)
    if (!node || node.type === "input" || node.type === "output") return
    setPendingRemoveId(nodeId)
  }

  const executeRemove = () => {
    if (!pendingRemoveId) return
    const nodeId = pendingRemoveId
    setPendingRemoveId(null)

    const previousWorkflow = cloneWorkflow(workflow)

    setWorkflow((prev) => removeNodeAndRewireWorkflow(prev, nodeId))

    if (undoToastIdRef.current != null) {
      toast.dismiss(undoToastIdRef.current)
    }

    undoToastIdRef.current = toast.success("Step removed", {
      duration: Infinity,
      action: {
        label: "Undo",
        onClick: () => setWorkflowDirect(previousWorkflow),
      },
    })
  }

  const moveNode = (nodeId: string, direction: "up" | "down") => {
    const blockedReason = getMiddleNodeMoveBlockedReason(workflow, nodeId, direction)
    if (blockedReason) {
      toast.warning(blockedReason, {
        duration: 8000,
      })
      return
    }
    setWorkflow((prev) => moveMiddleNodeByDirection(prev, nodeId, direction))
  }

  const updateNodeConfig = (
    nodeId: string,
    config: InputNodeConfig | OutputNodeConfig | SkillNodeConfig | EvaluatorNodeConfig | SplitterNodeConfig | MergerNodeConfig | ApprovalNodeConfig | HumanNodeConfig,
  ) => {
    setWorkflow((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, config } as typeof n : n)),
    }), { coalesceKey: `node-config:${nodeId}` })
  }

  const addEvaluator = () => {
    let nextSelectedId: string | null = null
    setWorkflow((prev) => {
      const next = addEvaluatorNodeToWorkflow(prev)
      nextSelectedId = selectFirstNewNode(prev, next)
      return next
    })
    if (nextSelectedId) {
      setSelectedNode(nextSelectedId)
    }
  }

  const addFanOut = () => {
    let nextSelectedId: string | null = null
    setWorkflow((prev) => {
      const next = addFanOutPatternToWorkflow(prev)
      const addedNodes = getAddedNodes(prev, next)
      nextSelectedId = addedNodes.find((node) => node.type === "skill")?.id ?? addedNodes[0]?.id ?? null
      return next
    })
    if (nextSelectedId) {
      setSelectedNode(nextSelectedId)
    }
    toast.info("Created split -> branch -> merge", {
      description: "Configure the branch skill to define the parallel work.",
    })
  }

  const addApproval = () => {
    let nextSelectedId: string | null = null
    setWorkflow((prev) => {
      const next = addApprovalNodeToWorkflow(prev)
      nextSelectedId = selectFirstNewNode(prev, next)
      return next
    })
    if (nextSelectedId) {
      setSelectedNode(nextSelectedId)
    }
  }

  const addHuman = () => {
    let nextSelectedId: string | null = null
    setWorkflow((prev) => {
      const next = addHumanNodeToWorkflow(prev)
      nextSelectedId = selectFirstNewNode(prev, next)
      return next
    })
    if (nextSelectedId) {
      setSelectedNode(nextSelectedId)
    }
  }

  // Ref holds mutable state so the keyboard listener doesn't need frequent re-attachment
  const kbStateRef = useRef({
    orderedNodes,
    resolvedSelectedNodeId,
    selectedNodeId,
    workflowNodes: workflow.nodes,
    primaryModifierKey: desktopRuntime.primaryModifierKey,
  })
  kbStateRef.current = {
    orderedNodes,
    resolvedSelectedNodeId,
    selectedNodeId,
    workflowNodes: workflow.nodes,
    primaryModifierKey: desktopRuntime.primaryModifierKey,
  }

  useEffect(() => {
    if (flowCardMode) return

    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (isEditableKeyboardTarget(event.target as HTMLElement | null)) return

      const state = kbStateRef.current
      const selectedNode = state.selectedNodeId
        ? state.workflowNodes.find((node) => node.id === state.selectedNodeId) ?? null
        : null
      const intent = resolveChainBuilderShortcutIntent({
        event,
        primaryModifierKey: state.primaryModifierKey,
        flowCardMode,
        isEditable: false,
        orderedNodeIds: state.orderedNodes.map((node) => node.id),
        resolvedSelectedNodeId: state.resolvedSelectedNodeId,
        selectedNodeId: selectedNode?.id ?? null,
        selectedNodeType: selectedNode?.type ?? null,
      })
      if (!intent) return

      event.preventDefault()

      if (intent.type === "open_skill_picker") {
        openSkillPicker()
        return
      }

      if (intent.type === "select") {
        setSelectedNode(intent.nodeId)
        return
      }

      if (intent.type === "remove_selected") {
        confirmRemove(intent.nodeId)
        return
      }

      if (intent.type === "move_selected") {
        moveNode(intent.nodeId, intent.direction)
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [flowCardMode, openSkillPicker])

  const handleInsertBlock = (value: "evaluator" | "fanout" | "approval" | "human") => {
    if (value === "evaluator") {
      addEvaluator()
      return
    }
    if (value === "fanout") {
      addFanOut()
      return
    }
    if (value === "approval") {
      addApproval()
      return
    }
    if (value === "human") {
      addHuman()
    }
  }

  const handleDragStart = (node: WorkflowNode, event: React.DragEvent<HTMLDivElement>) => {
    if (flowCardMode) return
    if (node.type === "input" || node.type === "output") return
    if (reorderBlockReason) {
      event.preventDefault()
      toast.warning(reorderBlockReason, {
        duration: 8000,
      })
      return
    }
    draggedNodeIdRef.current = node.id
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", node.id)
  }

  const handleDragOver = (node: WorkflowNode, event: React.DragEvent<HTMLDivElement>) => {
    if (!draggedNodeIdRef.current) return
    if (node.type === "input" || node.type === "output" || draggedNodeIdRef.current === node.id) {
      if (dragOverNodeId) {
        setDragOverNodeId(null)
      }
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    setDragOverNodeId(node.id)
  }

  const handleDragLeave = (nodeId: string, event: React.DragEvent<HTMLDivElement>) => {
    if (dragOverNodeId !== nodeId) return
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && event.currentTarget.contains(nextTarget)) return
    setDragOverNodeId(null)
  }

  const handleDrop = (node: WorkflowNode, event: React.DragEvent<HTMLDivElement>) => {
    if (flowCardMode) return
    if (!draggedNodeIdRef.current) return
    if (node.type === "input" || node.type === "output") return
    const blockedReason = getLinearChainReorderBlockReason(workflow)
    if (blockedReason) {
      event.preventDefault()
      toast.warning(blockedReason, {
        duration: 8000,
      })
      clearDragState()
      return
    }
    event.preventDefault()
    setWorkflow((prev) => moveMiddleNodeBeforeTarget(prev, draggedNodeIdRef.current!, node.id))
    setDragOverNodeId(null)
    draggedNodeIdRef.current = null
  }

  const clearDragState = () => {
    draggedNodeIdRef.current = null
    setDragOverNodeId(null)
  }

  const renderNodeStep = (node: WorkflowNode, i: number) => {
    const { effectiveState, runtimeBranchSummary } = getNodePresentation(node)
    const preferredTab: "nodes" | "log" | "result" = typeof effectiveState?.output?.content === "string" && effectiveState.output.content.trim().length > 0
      ? "result"
      : effectiveState?.status === "running" || effectiveState?.status === "waiting_approval" || effectiveState?.status === "waiting_human" || effectiveState?.status === "failed"
        ? "log"
        : "nodes"

    const moveUpBlockedReason = node.type === "input" || node.type === "output"
      ? "Only editable steps can be reordered."
      : getMiddleNodeMoveBlockedReason(workflow, node.id, "up")
    const moveDownBlockedReason = node.type === "input" || node.type === "output"
      ? "Only editable steps can be reordered."
      : getMiddleNodeMoveBlockedReason(workflow, node.id, "down")

    return (
      <div
        key={node.id}
        ref={(element) => {
          stepRefs.current[node.id] = element
        }}
        draggable={!flowCardMode && node.type !== "input" && node.type !== "output" && isReorderSafe}
        onDragStart={(event) => handleDragStart(node, event)}
        onDragEnd={clearDragState}
        onDragOver={(event) => handleDragOver(node, event)}
        onDragLeave={(event) => handleDragLeave(node.id, event)}
        onDrop={(event) => handleDrop(node, event)}
        onContextMenu={(event) => {
          if (flowCardMode) return
          event.preventDefault()
          event.stopPropagation()
          setSelectedNode(node.id)
          setChainContextMenu({
            x: event.clientX,
            y: event.clientY,
            nodeId: node.id,
          })
        }}
        className={cn(
          "rounded-lg ui-transition-colors ui-motion-fast",
          runtimeMode
            ? "w-full"
            : flowCardMode
            ? "w-[14.5rem] shrink-0 snap-start md:w-[15rem] xl:w-[15.5rem]"
            : "w-full",
          dragOverNodeId === node.id && "ring-2 ring-primary/50 ring-offset-2 ring-offset-surface-1",
        )}
      >
        {!flowCardMode && i > 0 && (
          <div className={cn("flex flex-col items-center", compact ? "py-0.5" : "py-1")}>
            <div className="flex flex-col items-center">
              <div className={cn("w-px bg-border", compact ? "h-1.5" : "h-3")} />
              <ArrowDownIcon size={compact ? 8 : 10} className="text-muted-foreground/50 -mt-0.5" />
            </div>
            {!compact && node.type === "evaluator" && (
              <span className="ui-meta-text text-status-warning font-mono">
                retry loop
              </span>
            )}
          </div>
        )}
        {!flowCardMode && !compact && node.type !== "input" && node.type !== "output" && isReorderSafe && (
          <div className="px-1 pb-1 ui-meta-text text-muted-foreground/70">
            Drag to reorder
          </div>
        )}
        <NodeCard
          node={node}
          index={i}
          total={orderedNodes.length}
          state={effectiveState}
          isActive={resolvedActiveNodeId === node.id}
          isSelected={resolvedSelectedNodeId === node.id}
          onRemove={() => confirmRemove(node.id)}
          onMoveUp={moveUpBlockedReason ? undefined : () => moveNode(node.id, "up")}
          onMoveDown={moveDownBlockedReason ? undefined : () => moveNode(node.id, "down")}
          moveUpDisabledReason={moveUpBlockedReason}
          moveDownDisabledReason={moveDownBlockedReason}
          onConfigChange={(config) => updateNodeConfig(node.id, config)}
          onSelect={() => {
            setSelectedNode(node.id)
            onStageSelect?.({ nodeId: node.id, preferredTab })
          }}
          resolveNodeLabel={getNodeDisplayLabel}
          compact={compact}
          runtimeMode={flowCardMode}
          runtimePresentationMode={runtimeMode ? "monitor" : "outline"}
          runtimeFocusKind={monitorCurrentStage?.node.id === node.id ? "current" : monitorNextStage?.node.id === node.id ? "next" : null}
          runtimeBranchSummary={runtimeBranchSummary}
        />
      </div>
    )
  }

  return (
    <section
      aria-label={flowCardMode ? "Flow preview" : "Flow builder"}
      className={cn(
        "ui-fade-slide-in",
        runtimeMode
          ? "space-y-2"
          : flowCardMode
            ? "surface-panel rounded-xl p-3.5 space-y-3 md:p-4"
            : compact
              ? "surface-panel rounded-lg p-2.5 space-y-2"
              : "surface-panel rounded-lg p-4 space-y-3",
      )}
    >
      {flowCardMode ? (
        <ChainBuilderSurfaceHeader
          reviewSnapshot={Boolean(reviewSnapshot)}
          runtimeMode={runtimeMode}
          currentStep={monitorCurrentStage
            ? {
              label: getNodeDisplayLabel(monitorCurrentStage.node.id),
              status: monitorCurrentStage.status,
            }
            : null}
          nextStepLabel={monitorNextStage ? getNodeDisplayLabel(monitorNextStage.node.id) : null}
          completedCount={monitorCounts.completed}
          pendingCount={monitorCounts.pending}
          totalMonitoredSteps={orderedMonitorStages.length}
          totalSteps={orderedNodes.length}
        />
      ) : (
        <h2 className="section-kicker">Flow builder</h2>
      )}

      <div className="space-y-0">
        {!flowCardMode && !workflow.nodes.some((n) => n.type !== "input" && n.type !== "output") && (
          <ChainBuilderStartHint compact={compact} onAddFirstStep={() => openSkillPicker()} />
        )}
        {runtimeMode ? (
          <div className="space-y-0 border-t border-hairline/70">
            {orderedNodes.map((node, i) => (
              <div key={node.id} className={cn(i > 0 && "border-t border-hairline/70")}>
                {renderNodeStep(node, i)}
              </div>
            ))}
          </div>
        ) : flowCardMode ? (
          <div className="overflow-x-auto pb-2 ui-scrollbar-hidden">
            <div className="flex min-w-max snap-x snap-mandatory items-stretch gap-2 pr-4">
              {orderedNodes.map((node, i) => (
                <Fragment key={node.id}>
                  {renderNodeStep(node, i)}
                  {i < orderedNodes.length - 1 && (
                    <div className="flex shrink-0 items-center justify-center gap-1 px-0.5">
                      <div className="h-px w-3 bg-border/70" />
                      <ArrowRightIcon size={12} className="text-muted-foreground/45" />
                      <div className="h-px w-3 bg-border/70" />
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          </div>
        ) : (
          orderedNodes.map((node, i) => renderNodeStep(node, i))
        )}

        {!flowCardMode && (
          <ChainBuilderAddControls
            compact={compact}
            hasSkillNodes={hasSkillNodes}
            primaryModifierLabel={desktopRuntime.primaryModifierLabel}
            onAddSkill={() => openSkillPicker()}
            onAddStep={handleInsertBlock}
          />
        )}
      </div>

      <ChainBuilderContextMenu
        open={!runtimeMode && chainContextMenu !== null}
        x={chainContextMenu?.x || 0}
        y={chainContextMenu?.y || 0}
        stepLabel={contextNode ? getNodeDisplayLabel(contextNode.id) : null}
        moveUpDisabledReason={contextNode ? getMiddleNodeMoveBlockedReason(workflow, contextNode.id, "up") : null}
        moveDownDisabledReason={contextNode ? getMiddleNodeMoveBlockedReason(workflow, contextNode.id, "down") : null}
        removeDisabled={!contextNode || contextNode.type === "input" || contextNode.type === "output"}
        onOpenChange={(open) => {
          if (!open) setChainContextMenu(null)
        }}
        onSelect={() => {
          if (!contextNode) return
          setSelectedNode(contextNode.id)
          setChainContextMenu(null)
        }}
        onMoveUp={() => {
          if (!contextNode) return
          moveNode(contextNode.id, "up")
          setChainContextMenu(null)
        }}
        onMoveDown={() => {
          if (!contextNode) return
          moveNode(contextNode.id, "down")
          setChainContextMenu(null)
        }}
        onRemove={() => {
          if (!contextNode || contextNode.type === "input" || contextNode.type === "output") return
          confirmRemove(contextNode.id)
          setChainContextMenu(null)
        }}
      />
      <ChainBuilderRemoveDialog
        open={!runtimeMode && pendingRemoveId !== null}
        stepLabel={pendingRemoveId ? getNodeDisplayLabel(pendingRemoveId) : ""}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRemoveId(null)
          }
        }}
        onConfirm={executeRemove}
      />
    </section>
  )
}
