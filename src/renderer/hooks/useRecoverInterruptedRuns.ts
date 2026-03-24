import { useEffect } from "react"
import { useSetAtom, useStore } from "jotai"
import {
  workflowExecutionStatesAtom,
  updateWorkflowExecutionStateAtom,
} from "@/features/execution/state"
import {
  createEmptyWorkflowExecutionState,
  isRunInFlight,
} from "@/lib/workflow-execution"
import { mainViewAtom, selectedWorkflowPathAtom } from "@/lib/store"
import type { InFlightManifestEntry } from "@shared/types"

const MANIFEST_KEY = "c8c:in-flight-runs"

/**
 * Delay (ms) to let the existing `getActiveExecutions` rehydrate settle
 * before scanning the manifest. Alive CLI runs will already be in
 * workflowExecutionStatesAtom by the time this fires.
 */
const REHYDRATE_SETTLE_MS = 600

/**
 * Startup hook that recovers interrupted or completed runs from a previous
 * session. Reads the in-flight manifest persisted by the `beforeunload`
 * handler in `useExecutionController`, checks each workspace on disk via
 * `getTerminalRunSnapshot`, and merges the result into execution state.
 *
 * Mount once in the app root, inside the JotaiProvider.
 */
export function useRecoverInterruptedRuns(): void {
  const store = useStore()
  const updateExecutionState = useSetAtom(updateWorkflowExecutionStateAtom)
  const setSelectedWorkflowPath = useSetAtom(selectedWorkflowPathAtom)
  const setMainView = useSetAtom(mainViewAtom)

  useEffect(() => {
    let cancelled = false

    const timer = setTimeout(() => {
      if (cancelled) return
      void recoverInterruptedRuns()
    }, REHYDRATE_SETTLE_MS)

    async function recoverInterruptedRuns() {
      // 1. Read manifest from localStorage
      const raw = localStorage.getItem(MANIFEST_KEY)
      if (!raw) return

      let manifest: Record<string, InFlightManifestEntry>
      try {
        manifest = JSON.parse(raw)
      } catch {
        localStorage.removeItem(MANIFEST_KEY)
        return
      }

      const entries = Object.entries(manifest)
      if (entries.length === 0) {
        localStorage.removeItem(MANIFEST_KEY)
        return
      }

      const recoveredKeys: string[] = []

      // 2. For each entry, check if already rehydrated, then scan disk
      for (const [key, entry] of entries) {
        if (cancelled) return

        // Read the latest execution states from the store (not a stale closure)
        const currentStates = store.get(workflowExecutionStatesAtom)
        const existingState = currentStates[key]

        // Skip if this run was already reconnected by getActiveExecutions
        if (existingState && isRunInFlight(existingState.runStatus)) {
          continue
        }

        try {
          const snapshot = await window.api.getTerminalRunSnapshot(
            entry.workspace,
          )
          if (cancelled) return

          if (!snapshot) {
            // Workspace gone — discard stale entry
            continue
          }

          if (snapshot.status === "completed") {
            updateExecutionState({
              key,
              update: {
                ...createEmptyWorkflowExecutionState(),
                runStatus: "done",
                runOutcome: "completed",
                runId: entry.runId,
                workspace: entry.workspace,
                runWorkflowPath: entry.workflowPath,
                workflowName: entry.workflowName,
                reportPath: snapshot.result.reportPath || null,
              },
            })
            recoveredKeys.push(key)
          } else if (snapshot.status === "interrupted") {
            updateExecutionState({
              key,
              update: {
                ...createEmptyWorkflowExecutionState(),
                runStatus: "done",
                runOutcome: "interrupted",
                runId: entry.runId,
                workspace: entry.workspace,
                runWorkflowPath: entry.workflowPath,
                workflowName: entry.workflowName,
                nodeStates: snapshot.snapshot.nodeStates || {},
                runtimeNodes: snapshot.snapshot.runtimeNodes || [],
                runtimeEdges: snapshot.snapshot.runtimeEdges || [],
                runtimeMeta: snapshot.snapshot.runtimeMeta || {},
                evalResults: snapshot.snapshot.evalResults || {},
                resumeNodeId: snapshot.resumeNodeId,
              },
            })
            recoveredKeys.push(key)
          }
        } catch (error) {
          console.error(
            `[useRecoverInterruptedRuns] Failed to recover ${key}:`,
            error,
          )
        }
      }

      // 3. Clear manifest
      localStorage.removeItem(MANIFEST_KEY)

      // 4. Auto-open if single recovered flow
      if (cancelled) return
      if (recoveredKeys.length === 1) {
        const singleKey = recoveredKeys[0]
        // The key is either a workflow path or "__draft__"
        const workflowPath = singleKey === "__draft__" ? null : singleKey
        setSelectedWorkflowPath(workflowPath)
        setMainView("thread")
      }
    }

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // Run once on mount — stable setters from useSetAtom + store from useStore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
