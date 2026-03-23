import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { McpIntegrationStatus, PermissionMode } from "@shared/types"
import { toastErrorFromCatch } from "@/lib/toast-error"
import {
  getTemplateContextSuggestedTools,
  type WorkflowTemplateRunContext,
} from "@/lib/workflow-entry"
import type { WebSearchBackend } from "@/lib/web-search-backend"

function buildInitialFieldValues(
  status: McpIntegrationStatus | null,
): Record<string, string> {
  if (!status) return {}
  return Object.fromEntries(
    status.integration.fields.map((field) => [field.id, ""]),
  )
}

interface UseMcpIntegrationSetupParams {
  projectPath: string | null
  selectedWorkflowTemplateContext: WorkflowTemplateRunContext | null
  webSearchBackend: WebSearchBackend
  onWebSearchBackendChange: (backend: WebSearchBackend) => void
}

export function useMcpIntegrationSetup({
  projectPath,
  selectedWorkflowTemplateContext,
  webSearchBackend,
  onWebSearchBackendChange,
}: UseMcpIntegrationSetupParams) {
  const suggestedTools = useMemo(
    () => getTemplateContextSuggestedTools(selectedWorkflowTemplateContext),
    [selectedWorkflowTemplateContext],
  )
  const [integrationStatuses, setIntegrationStatuses] = useState<
    McpIntegrationStatus[]
  >([])
  const [activeIntegrationId, setActiveIntegrationId] = useState<string | null>(
    null,
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [pendingRunMode, setPendingRunMode] = useState<PermissionMode | null>(
    null,
  )
  const [pendingBackend, setPendingBackend] = useState<WebSearchBackend | null>(
    null,
  )

  const activeIntegrationStatus = useMemo(
    () =>
      integrationStatuses.find(
        (status) => status.integration.id === activeIntegrationId,
      ) ?? null,
    [activeIntegrationId, integrationStatuses],
  )

  const loadStatuses = useCallback(async () => {
    if (suggestedTools.length === 0) {
      setIntegrationStatuses([])
      return []
    }
    const statuses = await window.api.getMcpIntegrationStatuses(
      suggestedTools,
      projectPath ?? undefined,
    )
    setIntegrationStatuses(statuses)
    return statuses
  }, [projectPath, suggestedTools])

  useEffect(() => {
    if (suggestedTools.length === 0) {
      setIntegrationStatuses([])
      setActiveIntegrationId(null)
      setFieldValues({})
      setDialogOpen(false)
      setPendingRunMode(null)
      setPendingBackend(null)
      return
    }

    void loadStatuses().catch(() => {
      setIntegrationStatuses([])
    })
  }, [loadStatuses, suggestedTools])

  const openSetupDialog = useCallback(
    (status: McpIntegrationStatus, mode: PermissionMode | null) => {
      setActiveIntegrationId(status.integration.id)
      setFieldValues(buildInitialFieldValues(status))
      setDialogOpen(true)
      if (mode) {
        setPendingRunMode(mode)
      }
    },
    [],
  )

  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      setDialogOpen(open)
      if (!open && !saving) {
        setActiveIntegrationId(null)
        setFieldValues({})
        setPendingRunMode(null)
        setPendingBackend(null)
      }
    },
    [saving],
  )

  const ensureSuggestedToolsReady = useCallback(
    async (mode: PermissionMode) => {
      if (suggestedTools.length === 0) return true

      try {
        const statuses = await loadStatuses()
        const missing = statuses.find((status) => !status.configured)
        if (!missing) return true

        openSetupDialog(missing, mode)
        return false
      } catch (error) {
        toastErrorFromCatch("Could not check integration setup", error)
        return false
      }
    },
    [loadStatuses, openSetupDialog, suggestedTools.length],
  )

  const handleFieldValueChange = useCallback(
    (fieldId: string, value: string) => {
      setFieldValues((current) => ({
        ...current,
        [fieldId]: value,
      }))
    },
    [],
  )

  const handleConfirmSetup = useCallback(async () => {
    if (!activeIntegrationStatus || saving) return

    setSaving(true)
    try {
      const savedStatus = await window.api.configureMcpIntegration(
        activeIntegrationStatus.integration.id,
        {
          values: fieldValues,
        },
        projectPath ?? undefined,
      )
      toast.success(`${savedStatus.integration.label} is ready`)

      const nextBackend =
        savedStatus.integration.postConfigure?.webSearchBackend
      if (nextBackend && nextBackend !== webSearchBackend) {
        setPendingBackend(nextBackend)
        onWebSearchBackendChange(nextBackend)
      }

      const refreshedStatuses = await loadStatuses()
      const nextMissing = refreshedStatuses.find((status) => !status.configured)
      if (nextMissing) {
        setActiveIntegrationId(nextMissing.integration.id)
        setFieldValues(buildInitialFieldValues(nextMissing))
        return
      }

      setDialogOpen(false)
      setActiveIntegrationId(null)
      setFieldValues({})
    } catch (error) {
      toastErrorFromCatch("Could not save integration credentials", error)
    } finally {
      setSaving(false)
    }
  }, [
    activeIntegrationStatus,
    fieldValues,
    loadStatuses,
    onWebSearchBackendChange,
    projectPath,
    saving,
    webSearchBackend,
  ])

  const resumeBlocked =
    dialogOpen ||
    saving ||
    (pendingRunMode !== null &&
      pendingBackend !== null &&
      pendingBackend !== webSearchBackend)

  const consumePendingRunMode = useCallback(() => {
    if (resumeBlocked || pendingRunMode === null) return null
    const mode = pendingRunMode
    setPendingRunMode(null)
    setPendingBackend(null)
    return mode
  }, [pendingRunMode, resumeBlocked])

  return {
    ensureSuggestedToolsReady,
    integrationSetupOpen: dialogOpen,
    onIntegrationSetupOpenChange: handleDialogOpenChange,
    integrationSetupStatus: activeIntegrationStatus,
    integrationSetupValues: fieldValues,
    onIntegrationSetupValueChange: handleFieldValueChange,
    integrationSetupSaving: saving,
    onConfirmIntegrationSetup: handleConfirmSetup,
    pendingRunMode,
    resumeBlocked,
    consumePendingRunMode,
  }
}
