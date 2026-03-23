import { useCallback, useEffect, useMemo, useState } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import type { McpIntegrationStatus } from "@shared/types"
import { SectionHeading } from "@/components/ui/page-shell"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { selectedProjectAtom, webSearchBackendAtom } from "@/lib/store"
import { toastErrorFromCatch } from "@/lib/toast-error"
import { McpIntegrationSetupDialog } from "@/components/integrations/McpIntegrationSetupDialog"

function statusLabel(status: McpIntegrationStatus): {
  label: string
  variant: "outline" | "secondary"
} {
  if (!status.configured) {
    return { label: "Not connected", variant: "outline" }
  }
  if (status.source === "server") {
    return { label: "Manual server", variant: "secondary" }
  }
  if (status.source === "env") {
    return { label: "Environment", variant: "secondary" }
  }
  return { label: "Connected", variant: "secondary" }
}

function buildInitialFieldValues(
  status: McpIntegrationStatus | null,
): Record<string, string> {
  if (!status) return {}
  return Object.fromEntries(
    status.integration.fields.map((field) => [field.id, ""]),
  )
}

export function McpIntegrationsSection() {
  const selectedProject = useAtomValue(selectedProjectAtom)
  const webSearchBackend = useAtomValue(webSearchBackendAtom)
  const setWebSearchBackend = useSetAtom(webSearchBackendAtom)
  const [integrationStatuses, setIntegrationStatuses] = useState<
    McpIntegrationStatus[]
  >([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeIntegrationId, setActiveIntegrationId] = useState<string | null>(
    null,
  )
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const activeIntegrationStatus = useMemo(
    () =>
      integrationStatuses.find(
        (status) => status.integration.id === activeIntegrationId,
      ) ?? null,
    [activeIntegrationId, integrationStatuses],
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const nextStatuses = await window.api.listMcpIntegrations(
        selectedProject ?? undefined,
      )
      setIntegrationStatuses(nextStatuses)
      return nextStatuses
    } finally {
      setLoading(false)
    }
  }, [selectedProject])

  useEffect(() => {
    void refresh().catch(() => {
      setIntegrationStatuses([])
    })
  }, [refresh])

  const handleOpenSetup = useCallback((status: McpIntegrationStatus) => {
    setActiveIntegrationId(status.integration.id)
    setValues(buildInitialFieldValues(status))
    setDialogOpen(true)
  }, [])

  const handleConfirmSetup = useCallback(async () => {
    if (!activeIntegrationStatus || saving) return

    setSaving(true)
    try {
      const savedStatus = await window.api.configureMcpIntegration(
        activeIntegrationStatus.integration.id,
        { values },
        selectedProject ?? undefined,
      )
      const nextBackend =
        savedStatus.integration.postConfigure?.webSearchBackend
      if (nextBackend && nextBackend !== webSearchBackend) {
        setWebSearchBackend(nextBackend)
      }
      await refresh()
      setDialogOpen(false)
      setActiveIntegrationId(null)
      setValues({})
    } catch (error) {
      toastErrorFromCatch("Could not save integration credentials", error)
    } finally {
      setSaving(false)
    }
  }, [
    activeIntegrationStatus,
    refresh,
    saving,
    selectedProject,
    setWebSearchBackend,
    values,
    webSearchBackend,
  ])

  return (
    <>
      <section className="space-y-3">
        <SectionHeading title="Integrations" />

        <article className="space-y-3 ui-section-divider">
          <div className="ui-slab space-y-4">
            <div className="space-y-1">
              <h3 className="text-body-md font-semibold">
                Curated MCP Integrations
              </h3>
              <p className="text-body-sm text-muted-foreground">
                Connect commonly used MCP-backed services here. Discovery still
                happens from flows at pre-run; this section is for management.
              </p>
            </div>

            <div className="divide-y divide-border/60">
              {integrationStatuses.map((status) => {
                const badge = statusLabel(status)
                return (
                  <div
                    key={status.integration.id}
                    className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-body-md font-medium text-foreground">
                          {status.integration.label}
                        </p>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </div>
                      <p className="text-body-sm text-muted-foreground">
                        {status.integration.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenSetup(status)}
                      >
                        {status.configured ? "Update key" : "Set up"}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="ui-meta-text text-muted-foreground">
              {loading
                ? "Checking integration status..."
                : "Credentials are stored in the local integrations keyring for this app profile."}
            </p>
          </div>
        </article>
      </section>

      <McpIntegrationSetupDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open && !saving) {
            setActiveIntegrationId(null)
            setValues({})
          }
        }}
        integrationStatus={activeIntegrationStatus}
        values={values}
        onValueChange={(fieldId, value) => {
          setValues((current) => ({
            ...current,
            [fieldId]: value,
          }))
        }}
        saving={saving}
        onConfirm={handleConfirmSetup}
      />
    </>
  )
}
