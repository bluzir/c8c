import { useCallback, useRef } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { toast } from "sonner"
import { useInboxNotifications } from "@/hooks/useInboxNotifications"
import { errorToUserMessage } from "@/lib/error-message"
import { toastError, toastErrorFromCatch } from "@/lib/toast-error"
import type { WebSearchBackend } from "@/lib/web-search-backend"
import {
  providerAuthStatusAtom,
  providerAvailabilityAtom,
  providerSettingsAtom,
  validationErrorsAtom,
} from "@/lib/store"
import {
  assembleInputWithAttachments,
  isRunInFlight,
  toWorkflowExecutionKey,
  type ExecutionRunStatus,
} from "@/lib/workflow-execution"
import type {
  InputAttachment,
  PermissionMode,
  ProviderId,
  RunResult,
  Workflow,
} from "@shared/types"
import {
  DEFAULT_EXECUTION_IPC_TIMEOUT_MS,
  prepareWorkflowForExecution,
  groupValidationIssuesByNode,
  resolveContinuationWorkflow,
  resolveExecutionInput,
  resolveExecutionStartResult,
  withIpcTimeout,
} from "./commands"
import {
  formatExecutionPreflightTitle,
  loadExecutionStartPreflight,
  resolveEffectiveExecutionProvider,
  type PreflightWarning,
} from "./preflight"
import type { WorkflowExecutionController } from "./controller"

interface UseExecutionCommandsArgs {
  controller: WorkflowExecutionController
  runStatus: ExecutionRunStatus
  workflow: Workflow
  inputValue: string
  requestedResult: string
  attachments: InputAttachment[]
  selectedProject: string | null
  selectedWorkflowPath: string | null
  workspace: string | null
  webSearchBackend: WebSearchBackend
  setActiveExecutionProvider: (provider: ProviderId) => void
  setCurrentWorkflow: (workflow: Workflow) => void
  setSelectedWorkflowPath: (workflowPath: string | null) => void
  onPreflightWarnings?: (warnings: PreflightWarning[]) => Promise<boolean>
}

type ExecutionStartWarningMode = "default" | "skip_token_budget"

export function canStartManualContinuation(runStatus: ExecutionRunStatus) {
  return (
    runStatus !== "starting" &&
    runStatus !== "running" &&
    runStatus !== "cancelling"
  )
}

export function filterExecutionStartWarnings(
  warnings: PreflightWarning[],
  mode: ExecutionStartWarningMode = "default",
) {
  if (mode === "skip_token_budget") {
    return warnings.filter((warning) => warning.kind !== "token_budget")
  }
  return warnings
}

export function useExecutionCommands({
  controller,
  runStatus,
  workflow,
  inputValue,
  requestedResult,
  attachments,
  selectedProject,
  selectedWorkflowPath,
  workspace,
  webSearchBackend,
  setActiveExecutionProvider,
  setCurrentWorkflow,
  setSelectedWorkflowPath,
  onPreflightWarnings,
}: UseExecutionCommandsArgs) {
  const { addNotification } = useInboxNotifications()
  const onPreflightWarningsRef = useRef(onPreflightWarnings)
  onPreflightWarningsRef.current = onPreflightWarnings
  const runStartingRef = useRef(false)
  const providerSettings = useAtomValue(providerSettingsAtom)
  const setProviderSettings = useSetAtom(providerSettingsAtom)
  const setProviderAvailability = useSetAtom(providerAvailabilityAtom)
  const setProviderAuthStatus = useSetAtom(providerAuthStatusAtom)
  const setValidationErrors = useSetAtom(validationErrorsAtom)
  const recordExecutionError = useCallback(
    (title: string, description?: string) => {
      addNotification({
        title,
        description,
        level: "error",
        source: "workflow",
      })
    },
    [addNotification],
  )
  const stopLateStartedRun = useCallback(
    async (startedRunId: string, title: string) => {
      const description =
        "Run started after the UI had already cancelled or rolled back start. It may still be running in the background."

      try {
        const cancelled = await withIpcTimeout(
          window.api.cancelRun(startedRunId),
          DEFAULT_EXECUTION_IPC_TIMEOUT_MS,
          "A late-started run could not be stopped. Try again, or restart the app if the problem continues.",
        )
        if (cancelled) return
      } catch (error) {
        console.warn(
          "[useChainExecution] late-started run cancel failed:",
          error,
        )
      }

      toastError(title, {
        description,
      })
      recordExecutionError(title, description)
    },
    [recordExecutionError],
  )

  const preflightExecutionStart = useCallback(
    async (
      workflowForRun: Workflow,
      fallbackTitle: string,
      options?: {
        warningMode?: ExecutionStartWarningMode
      },
    ): Promise<{ effectiveProvider: ProviderId } | null> => {
      try {
        const preflight = await loadExecutionStartPreflight(
          window.api,
          workflowForRun,
        )
        setProviderSettings(preflight.snapshot.diagnostics.settings)
        setProviderAvailability(preflight.snapshot.diagnostics.health)
        setProviderAuthStatus(preflight.snapshot.diagnostics.auth)

        if (!preflight.ok) {
          const title =
            formatExecutionPreflightTitle(
              preflight.effectiveProvider,
              preflight.reason,
            ) || fallbackTitle
          toastError(title, {
            description: preflight.message,
          })
          recordExecutionError(title, preflight.message)
          return null
        }

        // Surface non-blocking warnings (e.g. token budget) before proceeding
        const visibleWarnings = filterExecutionStartWarnings(
          preflight.warnings,
          options?.warningMode ?? "default",
        )
        if (visibleWarnings.length > 0 && onPreflightWarningsRef.current) {
          const confirmed =
            await onPreflightWarningsRef.current(visibleWarnings)
          if (!confirmed) return null
        }

        return {
          effectiveProvider: preflight.effectiveProvider,
        }
      } catch (error) {
        console.warn("[useChainExecution] execution preflight failed:", error)
        return {
          effectiveProvider: resolveEffectiveExecutionProvider(
            workflowForRun,
            providerSettings,
          ),
        }
      }
    },
    [
      providerSettings,
      recordExecutionError,
      setProviderAuthStatus,
      setProviderAvailability,
      setProviderSettings,
    ],
  )

  const run = useCallback(
    async (executionMode: PermissionMode = "edit") => {
      if (runStartingRef.current) return
      if (isRunInFlight(runStatus)) return
      if (!workflow.nodes.length) return

      runStartingRef.current = true
      const resolvedInput = resolveExecutionInput(workflow, inputValue)
      if (!resolvedInput.valid) {
        runStartingRef.current = false
        toast.error("This flow requires input before it can run.")
        return
      }

      const assembledValue = await assembleInputWithAttachments(
        resolvedInput.value,
        resolvedInput.type !== "text" ? requestedResult : "",
        attachments,
        selectedProject,
        {
          readFileContent: window.api.readFileContent,
          loadRunResult: window.api.loadRunResult,
        },
      )

      const { workflowForRun, workflowForExecution } =
        prepareWorkflowForExecution(workflow, webSearchBackend, executionMode)
      const preflight = await preflightExecutionStart(
        workflowForRun,
        "Could not start run",
      )
      if (!preflight) {
        runStartingRef.current = false
        return
      }
      const startHandle = controller.beginExecution(
        workflowForRun,
        selectedWorkflowPath ?? null,
        selectedProject ?? null,
      )
      if (!startHandle) {
        runStartingRef.current = false
        return
      }
      setActiveExecutionProvider(preflight.effectiveProvider)

      try {
        const result = await withIpcTimeout(
          window.api.runChain(
            workflowForExecution,
            {
              type: resolvedInput.type,
              value: assembledValue,
              ...(requestedResult?.trim()
                ? { context: requestedResult.trim() }
                : {}),
            },
            selectedProject ?? undefined,
            selectedWorkflowPath ?? undefined,
            webSearchBackend,
          ),
          DEFAULT_EXECUTION_IPC_TIMEOUT_MS,
          "Run start timed out. Try again, or restart the app if the problem continues.",
        )

        const { startedRunId, errorMessage, validationIssues } =
          resolveExecutionStartResult(
            result,
            "No active window is available for execution.",
          )

        if (!startedRunId) {
          if (validationIssues.length > 0) {
            setValidationErrors(groupValidationIssuesByNode(validationIssues))
          }
          toastError("Could not start run", {
            description: errorMessage || undefined,
          })
          recordExecutionError("Could not start run", errorMessage || undefined)
          controller.rollbackExecutionStart(startHandle)
          return
        }
        const finishResult = controller.finishStartWithRunId(
          startedRunId,
          startHandle,
        )
        if (!finishResult.accepted && finishResult.shouldCancelRun) {
          await stopLateStartedRun(
            startedRunId,
            "Could not finish starting run",
          )
        }
      } catch (error) {
        console.error("[useChainExecution] runChain failed:", error)
        toastErrorFromCatch("Could not start run", error)
        recordExecutionError("Could not start run", errorToUserMessage(error))
        controller.rollbackExecutionStart(startHandle)
      } finally {
        runStartingRef.current = false
      }
    },
    [
      attachments,
      controller,
      inputValue,
      requestedResult,
      preflightExecutionStart,
      runStatus,
      selectedProject,
      selectedWorkflowPath,
      setActiveExecutionProvider,
      setValidationErrors,
      stopLateStartedRun,
      webSearchBackend,
      workflow,
      recordExecutionError,
    ],
  )

  const cancel = useCallback(async () => {
    const executionKey = toWorkflowExecutionKey(selectedWorkflowPath ?? null)
    const currentState = controller.getExecutionState(executionKey)
    if (!isRunInFlight(currentState.runStatus)) return

    const previousRunStatus = currentState.runStatus
    const currentRunId = currentState.runId

    controller.updateExecutionForKey(executionKey, (previous) => {
      if (!isRunInFlight(previous.runStatus)) {
        return previous
      }
      return {
        ...previous,
        runStatus: "cancelling",
      }
    })

    if (!currentRunId) {
      controller.cancelExecution(executionKey, null)
      return
    }

    try {
      const cancelled = await withIpcTimeout(
        window.api.cancelRun(currentRunId),
        DEFAULT_EXECUTION_IPC_TIMEOUT_MS,
        "Run cancel timed out. Try again, or restart the app if the problem continues.",
      )
      if (!cancelled) {
        toastError("Could not cancel run")
        recordExecutionError("Could not cancel run")
        controller.rollbackCancellation(
          executionKey,
          previousRunStatus,
          currentRunId,
        )
        return
      }
      controller.cancelExecution(executionKey, currentRunId)
    } catch (error) {
      console.error("[useChainExecution] cancelRun failed:", error)
      toastErrorFromCatch("Could not cancel run", error)
      recordExecutionError("Could not cancel run", errorToUserMessage(error))
      controller.rollbackCancellation(
        executionKey,
        previousRunStatus,
        currentRunId,
      )
    }
  }, [controller, recordExecutionError, selectedWorkflowPath])

  const rerunFrom = useCallback(
    async (fromNodeId: string, options?: { workspace?: string | null }) => {
      if (isRunInFlight(runStatus)) return
      const rerunWorkspace = options?.workspace ?? workspace
      if (!rerunWorkspace || !workflow.nodes.length) return

      const workflowKeyForRun = toWorkflowExecutionKey(
        selectedWorkflowPath ?? null,
      )
      const workflowForRun =
        controller.getExecutionState(workflowKeyForRun).workflowSnapshot ??
        workflow
      const preflight = await preflightExecutionStart(
        workflowForRun,
        "Could not restart from selected node",
        {
          // Resume-from-step only runs the downstream tail, so full-flow worst-case
          // estimates are misleading here. Keep blocking preflight checks, skip the
          // generic token-budget warning.
          warningMode: "skip_token_budget",
        },
      )
      if (!preflight) return
      const startHandle = controller.beginExecution(
        workflowForRun,
        selectedWorkflowPath ?? null,
        selectedProject ?? null,
        {
          preserveExecutionSnapshot: true,
        },
      )
      if (!startHandle) return
      setActiveExecutionProvider(preflight.effectiveProvider)
      const { workflowForExecution } = prepareWorkflowForExecution(
        workflowForRun,
        webSearchBackend,
      )

      try {
        const result = await withIpcTimeout(
          window.api.rerunFrom(
            fromNodeId,
            workflowForExecution,
            rerunWorkspace,
            selectedProject ?? undefined,
            selectedWorkflowPath ?? undefined,
            webSearchBackend,
          ),
          DEFAULT_EXECUTION_IPC_TIMEOUT_MS,
          "Restart timed out. Try again, or restart the app if the problem continues.",
        )

        const { startedRunId, errorMessage, validationIssues } =
          resolveExecutionStartResult(result, "")
        if (startedRunId) {
          const finishResult = controller.finishStartWithRunId(
            startedRunId,
            startHandle,
          )
          if (!finishResult.accepted && finishResult.shouldCancelRun) {
            await stopLateStartedRun(
              startedRunId,
              "Could not finish restarting run",
            )
          }
          return
        }

        if (errorMessage) {
          if (validationIssues.length > 0) {
            setValidationErrors(groupValidationIssuesByNode(validationIssues))
          }
          toastError("Could not restart from selected node", {
            description: errorMessage,
          })
          recordExecutionError(
            "Could not restart from selected node",
            errorMessage,
          )
          controller.rollbackExecutionStart(startHandle)
          return
        }
        toastError("Could not restart from selected node")
        recordExecutionError("Could not restart from selected node")
      } catch (error) {
        console.error("[useChainExecution] rerunFrom failed:", error)
        toastErrorFromCatch("Could not restart from selected node", error)
        recordExecutionError(
          "Could not restart from selected node",
          errorToUserMessage(error),
        )
      }

      controller.rollbackExecutionStart(startHandle)
    },
    [
      controller,
      preflightExecutionStart,
      runStatus,
      selectedProject,
      selectedWorkflowPath,
      setActiveExecutionProvider,
      setValidationErrors,
      stopLateStartedRun,
      webSearchBackend,
      workflow,
      workspace,
      recordExecutionError,
    ],
  )

  const continueWithWorkflow = useCallback(
    async (
      runToContinue: RunResult,
      workflowForRun: Workflow,
      workflowPathForRun: string | null,
    ) => {
      if (!canStartManualContinuation(runStatus)) return false
      if (!runToContinue.workspace) {
        toastError("Could not continue run", {
          description: "Run workspace is missing.",
        })
        recordExecutionError(
          "Could not continue run",
          "Run workspace is missing.",
        )
        return false
      }
      if (!workflowForRun.nodes.length) {
        toastError("Could not continue run", {
          description: "Flow has no steps.",
        })
        recordExecutionError("Could not continue run", "Flow has no steps.")
        return false
      }

      const preflight = await preflightExecutionStart(
        workflowForRun,
        "Could not continue run",
      )
      if (!preflight) return false
      const startHandle = controller.beginExecution(
        workflowForRun,
        workflowPathForRun,
        selectedProject ?? null,
        {
          preserveExecutionSnapshot: true,
        },
      )
      if (!startHandle) return false
      setActiveExecutionProvider(preflight.effectiveProvider)
      controller.updateExecutionForKey(startHandle.workflowKey, (previous) => ({
        ...previous,
        workspace: runToContinue.workspace,
      }))

      const { workflowForExecution } = prepareWorkflowForExecution(
        workflowForRun,
        webSearchBackend,
      )

      try {
        const result = await withIpcTimeout(
          window.api.continueRun(
            workflowForExecution,
            runToContinue.workspace,
            selectedProject ?? undefined,
            workflowPathForRun ?? undefined,
            webSearchBackend,
          ),
          DEFAULT_EXECUTION_IPC_TIMEOUT_MS,
          "Continue timed out. Try again, or restart the app if the problem continues.",
        )

        const { startedRunId, errorMessage, validationIssues } =
          resolveExecutionStartResult(
            result,
            "No active window is available for execution.",
          )

        if (startedRunId) {
          setCurrentWorkflow(workflowForRun)
          setSelectedWorkflowPath(workflowPathForRun)
          const finishResult = controller.finishStartWithRunId(
            startedRunId,
            startHandle,
          )
          if (!finishResult.accepted && finishResult.shouldCancelRun) {
            await stopLateStartedRun(
              startedRunId,
              "Could not finish continuing run",
            )
            return false
          }
          return true
        }

        if (validationIssues.length > 0) {
          setValidationErrors(groupValidationIssuesByNode(validationIssues))
        }
        toastError("Could not continue run", {
          description: errorMessage || undefined,
        })
        recordExecutionError(
          "Could not continue run",
          errorMessage || undefined,
        )
      } catch (error) {
        console.error("[useChainExecution] continueRun failed:", error)
        toastErrorFromCatch("Could not continue run", error)
        recordExecutionError(
          "Could not continue run",
          errorToUserMessage(error),
        )
      }

      controller.rollbackExecutionStart(startHandle)
      return false
    },
    [
      controller,
      preflightExecutionStart,
      recordExecutionError,
      runStatus,
      selectedProject,
      setActiveExecutionProvider,
      setCurrentWorkflow,
      setSelectedWorkflowPath,
      setValidationErrors,
      stopLateStartedRun,
      webSearchBackend,
    ],
  )

  const continueRun = useCallback(
    async (runToContinue: RunResult) => {
      if (!canStartManualContinuation(runStatus)) return
      if (!runToContinue.workspace) {
        toastError("Could not continue run", {
          description: "Run workspace is missing.",
        })
        recordExecutionError(
          "Could not continue run",
          "Run workspace is missing.",
        )
        return
      }

      let workflowForRun = workflow
      let workflowPathForRun = selectedWorkflowPath ?? null

      try {
        const resolvedContinuation = await resolveContinuationWorkflow(
          runToContinue,
          workflow,
          selectedWorkflowPath,
          (workflowPath) => window.api.loadWorkflow(workflowPath),
        )
        workflowForRun = resolvedContinuation.workflowForRun
        workflowPathForRun = resolvedContinuation.workflowPathForRun
      } catch (error) {
        toastErrorFromCatch("Could not continue run", error)
        recordExecutionError(
          "Could not continue run",
          errorToUserMessage(error, "Could not load flow file."),
        )
        return
      }

      if (!workflowForRun.nodes.length) {
        toastError("Could not continue run", {
          description: "Flow has no steps.",
        })
        recordExecutionError("Could not continue run", "Flow has no steps.")
        return
      }

      await continueWithWorkflow(
        runToContinue,
        workflowForRun,
        workflowPathForRun,
      )
    },
    [
      continueWithWorkflow,
      recordExecutionError,
      runStatus,
      selectedWorkflowPath,
      workflow,
    ],
  )

  return {
    run,
    cancel,
    rerunFrom,
    continueRun,
    continueWithWorkflow,
  }
}
