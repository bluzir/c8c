import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { approvalTaskId, writeWorkflowHilTaskResponse } from "../hil-store.js"
import { writeFileAtomic } from "./atomic-write.js"
import { readJsonFile } from "./run-state-store.js"

export interface ApprovalResolution {
  approved: boolean
  editedContent?: string
  timedOut?: boolean
}

interface ApprovalResolve {
  resolve: (result: ApprovalResolution) => void
}

interface EvalOverrideResolve {
  resolve: (overridden: boolean) => void
}

export function approvalDecisionPath(workspace: string, nodeId: string): string {
  return join(workspace, "approvals", `${nodeId.replace(/[^a-zA-Z0-9-]/g, "_")}.decision.json`)
}

export async function readApprovalDecision(
  workspace: string,
  nodeId: string,
): Promise<ApprovalResolution | null> {
  return readJsonFile<ApprovalResolution>(approvalDecisionPath(workspace, nodeId))
}

export async function persistApprovalDecision(
  workspace: string,
  nodeId: string,
  decision: ApprovalResolution,
): Promise<void> {
  await mkdir(join(workspace, "approvals"), { recursive: true })
  await writeFileAtomic(
    approvalDecisionPath(workspace, nodeId),
    JSON.stringify(decision, null, 2),
  )
}

export async function persistResolvedApproval(
  workspace: string,
  nodeId: string,
  decision: ApprovalResolution,
  source: "runtime" | "openclaw" = "runtime",
): Promise<void> {
  await persistApprovalDecision(workspace, nodeId, decision)
  try {
    await writeWorkflowHilTaskResponse({
      workspace,
      taskId: approvalTaskId(nodeId),
      data: {
        approved: decision.approved,
        editedContent: decision.editedContent,
      },
      source,
    })
  } catch {
    // Ignore missing task artifacts for older runs or approval-only flows.
  }
}

export async function writeWorkflowApprovalDecision(
  workspace: string,
  nodeId: string,
  decision: { approved: boolean; editedContent?: string },
): Promise<void> {
  await persistResolvedApproval(workspace, nodeId, decision, "openclaw")
}

export function createRunInterruptRegistry() {
  const pendingApprovals = new Map<string, ApprovalResolve>()
  const pendingEvalOverrides = new Map<string, EvalOverrideResolve>()

  return {
    resolvePendingApprovalsForRun(runId: string, approved = false): void {
      const prefix = `${runId}:`
      for (const [key, pending] of pendingApprovals.entries()) {
        if (!key.startsWith(prefix)) continue
        pending.resolve({ approved })
        pendingApprovals.delete(key)
      }
    },

    resolvePendingEvalOverridesForRun(runId: string): void {
      const prefix = `${runId}:`
      for (const [key, pending] of pendingEvalOverrides.entries()) {
        if (!key.startsWith(prefix)) continue
        pending.resolve(false)
        pendingEvalOverrides.delete(key)
      }
    },

    async waitForApproval(
      runId: string,
      workspace: string,
      nodeId: string,
      timeoutMinutes?: number,
      timeoutAction: "auto_approve" | "auto_reject" | "skip" = "auto_reject",
    ): Promise<ApprovalResolution> {
      const persisted = await readApprovalDecision(workspace, nodeId)
      if (persisted) return persisted

      const key = `${runId}:${nodeId}`
      const minutes = timeoutMinutes ?? 60
      return new Promise<ApprovalResolution>((resolve) => {
        let settled = false
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined

        const finish = (result: ApprovalResolution) => {
          if (settled) return
          settled = true
          pendingApprovals.delete(key)
          if (timeoutHandle) {
            clearTimeout(timeoutHandle)
          }
          resolve(result)
        }

        pendingApprovals.set(key, { resolve: finish })

        if (minutes > 0) {
          timeoutHandle = setTimeout(() => {
            finish({
              approved: timeoutAction === "auto_approve",
              timedOut: true,
            })
          }, minutes * 60_000)
        }
      })
    },

    waitForEvalOverride(
      runId: string,
      nodeId: string,
      signal: AbortSignal,
    ): Promise<boolean> {
      const key = `${runId}:${nodeId}`
      return new Promise<boolean>((resolve) => {
        let settled = false
        const finish = (overridden: boolean) => {
          if (settled) return
          settled = true
          pendingEvalOverrides.delete(key)
          signal.removeEventListener("abort", onAbort)
          resolve(overridden)
        }

        const onAbort = () => finish(false)
        signal.addEventListener("abort", onAbort, { once: true })

        if (signal.aborted) {
          finish(false)
          return
        }

        pendingEvalOverrides.set(key, { resolve: finish })
      })
    },

    resolveApproval(runId: string, nodeId: string, decision: ApprovalResolution): boolean {
      const key = `${runId}:${nodeId}`
      const pending = pendingApprovals.get(key)
      if (!pending) return false
      pending.resolve(decision)
      pendingApprovals.delete(key)
      return true
    },

    resolveEvalOverride(runId: string, nodeId: string): boolean {
      const key = `${runId}:${nodeId}`
      const pending = pendingEvalOverrides.get(key)
      if (!pending) return false
      pending.resolve(true)
      pendingEvalOverrides.delete(key)
      return true
    },
  }
}
