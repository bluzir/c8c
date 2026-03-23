import { useCallback, useEffect, useRef } from "react"
import { useAtom } from "jotai"
import { currentWorkflowAtom } from "@/lib/store"
import {
  undoStackAtom,
  redoStackAtom,
  pushUndoSnapshot,
} from "@/lib/undo-manager"
import type { Workflow } from "@shared/types"

interface WorkflowMutationOptions {
  coalesceKey?: string | null
  coalesceWindowMs?: number
}

/**
 * Returns a `setWorkflow` that automatically pushes an undo snapshot
 * before applying the mutation. Use this in components that mutate
 * the workflow (ChainBuilder, create flows, settings edits, etc.).
 */
export function useWorkflowWithUndo() {
  const [workflow, setWorkflowDirect] = useAtom(currentWorkflowAtom)
  const [, setUndoStack] = useAtom(undoStackAtom)
  const [, setRedoStack] = useAtom(redoStackAtom)
  const workflowRef = useRef(workflow)
  const lastMutationRef = useRef<{
    key: string
    at: number
    baseline: Workflow
  } | null>(null)

  useEffect(() => {
    workflowRef.current = workflow
  }, [workflow])

  const setWorkflowWithUndo = useCallback(
    (
      updater: Workflow | ((prev: Workflow) => Workflow),
      options: WorkflowMutationOptions = {},
    ) => {
      const previousWorkflow = workflowRef.current
      const nextWorkflow =
        typeof updater === "function" ? updater(previousWorkflow) : updater

      const coalesceKey = options.coalesceKey ?? null
      const coalesceWindowMs = options.coalesceWindowMs ?? 500
      const now = Date.now()
      const shouldCoalesce = Boolean(
        coalesceKey &&
        lastMutationRef.current &&
        lastMutationRef.current.key === coalesceKey &&
        lastMutationRef.current.baseline === previousWorkflow &&
        now - lastMutationRef.current.at < coalesceWindowMs,
      )

      if (!shouldCoalesce) {
        pushUndoSnapshot(previousWorkflow, setUndoStack, setRedoStack)
      }

      workflowRef.current = nextWorkflow
      lastMutationRef.current = coalesceKey
        ? {
            key: coalesceKey,
            at: now,
            baseline: nextWorkflow,
          }
        : null

      setWorkflowDirect(nextWorkflow)
    },
    [setRedoStack, setUndoStack, setWorkflowDirect],
  )

  return { workflow, setWorkflow: setWorkflowWithUndo, setWorkflowDirect }
}
