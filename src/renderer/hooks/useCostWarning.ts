import { useCallback, useRef, useState } from "react"
import type { PreflightWarning } from "@/features/execution/preflight"

interface CostWarningState {
  open: boolean
  warning: PreflightWarning | null
}

interface CostWarningController {
  handlePreflightWarnings: (warnings: PreflightWarning[]) => Promise<boolean>
  confirm: () => void
  cancel: () => void
  setOpen: (open: boolean) => void
}

export function createCostWarningController(
  setState: (state: CostWarningState) => void,
): CostWarningController {
  let resolver: ((confirmed: boolean) => void) | null = null
  let open = false

  return {
    async handlePreflightWarnings(
      warnings: PreflightWarning[],
    ): Promise<boolean> {
      const budgetWarning = warnings.find(
        (warning) => warning.kind === "token_budget",
      )
      if (!budgetWarning) return true
      if (open) return false

      return new Promise<boolean>((resolve) => {
        open = true
        resolver = resolve
        setState({ open: true, warning: budgetWarning })
      })
    },
    confirm() {
      open = false
      setState({ open: false, warning: null })
      resolver?.(true)
      resolver = null
    },
    cancel() {
      open = false
      setState({ open: false, warning: null })
      resolver?.(false)
      resolver = null
    },
    setOpen(nextOpen: boolean) {
      if (!nextOpen) {
        open = false
        setState({ open: false, warning: null })
        resolver?.(false)
        resolver = null
      }
    },
  }
}

/**
 * Manages the cost warning dialog lifecycle.
 *
 * Returns a `handlePreflightWarnings` callback suitable for passing to
 * `ExecutionProvider.onPreflightWarnings`. When called, it opens the dialog
 * and returns a promise that resolves to `true` (user confirmed) or `false`
 * (user cancelled).
 */
export function useCostWarning() {
  const [state, setState] = useState<CostWarningState>({
    open: false,
    warning: null,
  })
  const controllerRef = useRef<CostWarningController | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = createCostWarningController(setState)
  }

  const handlePreflightWarnings = useCallback(
    (warnings: PreflightWarning[]) => {
      return controllerRef.current!.handlePreflightWarnings(warnings)
    },
    [],
  )

  const confirm = useCallback(() => {
    controllerRef.current!.confirm()
  }, [])

  const cancel = useCallback(() => {
    controllerRef.current!.cancel()
  }, [])

  const setOpen = useCallback((open: boolean) => {
    controllerRef.current!.setOpen(open)
  }, [])

  return {
    costWarningOpen: state.open,
    costWarning: state.warning,
    setCostWarningOpen: setOpen,
    confirmCostWarning: confirm,
    cancelCostWarning: cancel,
    handlePreflightWarnings,
  }
}
