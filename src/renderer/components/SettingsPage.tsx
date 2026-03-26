import { useAtom } from "jotai"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { PageHeader, PageShell } from "@/components/ui/page-shell"
import { SingleDecisionDialog } from "@/components/ui/single-decision-dialog"
import { cn } from "@/lib/cn"
import { toastErrorFromCatch } from "@/lib/toast-error"
import {
  defaultProviderAtom,
  factoryBetaEnabledAtom,
  globalExecutionDefaultsAtom,
  providerAuthStatusAtom,
  providerAvailabilityAtom,
  providerSettingsAtom,
  webSearchBackendAtom,
} from "@/lib/store"
import type {
  ProviderDiagnostics,
  ProviderId,
  TelemetrySettings,
  UpdateInfo,
  UpdateEvent,
} from "@shared/types"
import {
  PROVIDER_LABELS,
  getDefaultModelForProvider,
  modelLooksCompatible,
} from "@shared/provider-metadata"
import { Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { McpIntegrationsSection } from "@/components/McpIntegrationsSection"
import { McpServersSection } from "@/components/McpServersSection"
import {
  getProviderInstallCommand,
  getProviderLoginCommand,
  resolveProviderReadinessVerdict,
} from "@/lib/provider-readiness"
import {
  SettingsChapterShell,
  SettingsExecutionDefaultsSection,
  SettingsLabSection,
  SettingsPrivacySection,
  SettingsProviderStatusStrip,
  SettingsProvidersSection,
  SettingsResearchSection,
  SettingsUpdatesSection,
  statusBadgeClassName,
} from "@/components/settings/SettingsSections"

export function SettingsPage() {
  const [webSearchBackend, setWebSearchBackend] = useAtom(webSearchBackendAtom)
  const [execDefaults, setExecDefaults] = useAtom(globalExecutionDefaultsAtom)
  const [factoryBetaEnabled, setFactoryBetaEnabled] = useAtom(
    factoryBetaEnabledAtom,
  )
  const [providerSettings, setProviderSettings] = useAtom(providerSettingsAtom)
  const [defaultProvider, setDefaultProvider] = useAtom(defaultProviderAtom)
  const [providerAvailability, setProviderAvailability] = useAtom(
    providerAvailabilityAtom,
  )
  const [providerAuthStatus, setProviderAuthStatus] = useAtom(
    providerAuthStatusAtom,
  )
  const [providerDiagnosticsLoading, setProviderDiagnosticsLoading] =
    useState(false)
  const [settingsRefreshLoading, setSettingsRefreshLoading] = useState(false)
  const [codexApiKeyDraft, setCodexApiKeyDraft] = useState("")
  const [codexApiKeySaving, setCodexApiKeySaving] = useState(false)
  const [telemetrySettings, setTelemetrySettings] =
    useState<TelemetrySettings | null>(null)
  const [telemetrySettingsLoading, setTelemetrySettingsLoading] =
    useState(false)
  const [telemetryConsentSaving, setTelemetryConsentSaving] = useState(false)
  const [appVersion, setAppVersion] = useState<string>("")
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>({ status: "idle" })
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateInstalling, setUpdateInstalling] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [execDefaultsSaveFlash, setExecDefaultsSaveFlash] = useState<
    "idle" | "saved"
  >("idle")
  const [dangerousConfirmOpen, setDangerousConfirmOpen] = useState(false)
  const [pendingProviderSettingsPatch, setPendingProviderSettingsPatch] =
    useState<Partial<typeof providerSettings> | null>(null)
  const hasMountedExecDefaultsRef = useRef(false)

  const telemetryApi = window.api as typeof window.api & {
    getTelemetrySettings?: () => Promise<TelemetrySettings>
    setTelemetryConsent?: (enabled: boolean) => Promise<TelemetrySettings>
    trackUiEvent?: (eventName: "settings_opened") => Promise<boolean>
  }

  const applyProviderDiagnostics = useCallback(
    (diagnostics: ProviderDiagnostics) => {
      setProviderSettings(diagnostics.settings)
      setProviderAvailability(diagnostics.health)
      setProviderAuthStatus(diagnostics.auth)
    },
    [setProviderAuthStatus, setProviderAvailability, setProviderSettings],
  )

  const refreshProviderDiagnostics = useCallback(async () => {
    setProviderDiagnosticsLoading(true)
    try {
      const diagnostics = await window.api.getProviderDiagnostics()
      applyProviderDiagnostics(diagnostics)
    } finally {
      setProviderDiagnosticsLoading(false)
    }
  }, [applyProviderDiagnostics])

  const persistProviderSettingsNow = useCallback(
    async (patch: Partial<typeof providerSettings>) => {
      const nextSettings = await window.api.updateProviderSettings(patch)
      setProviderSettings(nextSettings)
      toast.success("Settings saved")
    },
    [setProviderSettings],
  )

  const persistProviderSettings = useCallback(
    async (patch: Partial<typeof providerSettings>) => {
      if (
        patch.safetyProfile === "dangerous" &&
        providerSettings.safetyProfile !== "dangerous"
      ) {
        setPendingProviderSettingsPatch(patch)
        setDangerousConfirmOpen(true)
        return
      }
      await persistProviderSettingsNow(patch)
    },
    [persistProviderSettingsNow, providerSettings.safetyProfile],
  )

  const confirmDangerousSafetyProfile = useCallback(() => {
    if (!pendingProviderSettingsPatch) return
    void persistProviderSettingsNow(pendingProviderSettingsPatch)
    setPendingProviderSettingsPatch(null)
  }, [pendingProviderSettingsPatch, persistProviderSettingsNow])

  const refreshTelemetrySettings = useCallback(async () => {
    if (typeof telemetryApi.getTelemetrySettings !== "function") {
      setTelemetrySettings({
        buildFlavor: "oss",
        provider: "noop",
        enabledInBuild: false,
        consent: false,
        telemetryLocalTest: false,
        configDetected: false,
      })
      return
    }

    setTelemetrySettingsLoading(true)
    try {
      const nextSettings = await telemetryApi.getTelemetrySettings()
      setTelemetrySettings(nextSettings)
    } finally {
      setTelemetrySettingsLoading(false)
    }
  }, [telemetryApi])

  const refreshAllSettingsDiagnostics = useCallback(async () => {
    setSettingsRefreshLoading(true)
    try {
      await Promise.allSettled([
        refreshProviderDiagnostics(),
        refreshTelemetrySettings(),
      ])
    } finally {
      setSettingsRefreshLoading(false)
    }
  }, [refreshProviderDiagnostics, refreshTelemetrySettings])

  const updateTelemetryConsent = useCallback(
    async (enabled: boolean) => {
      if (typeof telemetryApi.setTelemetryConsent !== "function") return
      setTelemetryConsentSaving(true)
      try {
        const nextSettings = await telemetryApi.setTelemetryConsent(enabled)
        setTelemetrySettings(nextSettings)
      } finally {
        setTelemetryConsentSaving(false)
      }
    },
    [telemetryApi],
  )

  const handleCheckForUpdate = useCallback(async () => {
    setUpdateChecking(true)
    try {
      const info = await window.api.checkForUpdate()
      setUpdateInfo(info)
    } finally {
      setUpdateChecking(false)
    }
  }, [])

  const handleInstallUpdate = useCallback(() => {
    setUpdateInstalling(true)
    void window.api.installUpdate()
  }, [])

  const handleDefaultProviderChange = useCallback(
    async (provider: ProviderId) => {
      await persistProviderSettings({ defaultProvider: provider })
      setDefaultProvider(provider)
      setExecDefaults((prev) => ({
        ...prev,
        model: modelLooksCompatible(provider, prev.model)
          ? prev.model
          : getDefaultModelForProvider(provider),
      }))
      toast.success("Default provider updated")
    },
    [persistProviderSettings, setDefaultProvider, setExecDefaults],
  )

  const handleSaveCodexApiKey = useCallback(async () => {
    setCodexApiKeySaving(true)
    try {
      const diagnostics = await window.api.setCodexApiKey(codexApiKeyDraft)
      applyProviderDiagnostics(diagnostics)
      setCodexApiKeyDraft("")
      toast.success("API key saved")
    } catch (error) {
      toastErrorFromCatch("Could not save Codex API key", error)
    } finally {
      setCodexApiKeySaving(false)
    }
  }, [applyProviderDiagnostics, codexApiKeyDraft])

  const handleClearCodexApiKey = useCallback(async () => {
    setCodexApiKeySaving(true)
    try {
      const diagnostics = await window.api.clearCodexApiKey()
      applyProviderDiagnostics(diagnostics)
      setCodexApiKeyDraft("")
      toast.success("API key removed")
    } catch (error) {
      toastErrorFromCatch("Could not remove Codex API key", error)
    } finally {
      setCodexApiKeySaving(false)
    }
  }, [applyProviderDiagnostics])

  const handleLogoutProvider = useCallback(
    async (provider: ProviderId) => {
      setProviderDiagnosticsLoading(true)
      try {
        const diagnostics = await window.api.logoutProvider(provider)
        applyProviderDiagnostics(diagnostics)
      } finally {
        setProviderDiagnosticsLoading(false)
      }
    },
    [applyProviderDiagnostics],
  )

  useEffect(() => {
    void Promise.allSettled([
      refreshProviderDiagnostics(),
      refreshTelemetrySettings(),
      window.api.getAppVersion().then(setAppVersion),
      window.api.getUpdateStatus().then(setUpdateInfo),
    ]).then(() => setInitialLoading(false))
    if (typeof telemetryApi.trackUiEvent === "function") {
      void telemetryApi.trackUiEvent("settings_opened").catch(() => undefined)
    }

    const unsubUpdate = window.api.onUpdateEvent((event: UpdateEvent) => {
      switch (event.type) {
        case "checking":
          setUpdateInfo({ status: "checking" })
          break
        case "available":
          setUpdateInfo({ status: "available", version: event.version })
          break
        case "not-available":
          setUpdateInfo({ status: "not-available" })
          break
        case "download-progress":
          setUpdateInfo((prev) => ({
            ...prev,
            status: "downloading",
            progress: event.percent,
          }))
          break
        case "downloaded":
          setUpdateInfo({
            status: "downloaded",
            version: event.version,
            progress: 100,
          })
          break
        case "error":
          setUpdateInfo((prev) => ({
            ...prev,
            status: "error",
            error: event.message,
          }))
          break
      }
    })

    return unsubUpdate
  }, [refreshProviderDiagnostics, refreshTelemetrySettings, telemetryApi])

  useEffect(() => {
    if (!hasMountedExecDefaultsRef.current) {
      hasMountedExecDefaultsRef.current = true
      return
    }
    setExecDefaultsSaveFlash("saved")
    const timeoutId = window.setTimeout(
      () => setExecDefaultsSaveFlash("idle"),
      1400,
    )
    return () => window.clearTimeout(timeoutId)
  }, [execDefaults])
  const telemetryAvailable = Boolean(telemetrySettings?.enabledInBuild)
  const telemetryChecked = Boolean(telemetrySettings?.consent)
  const telemetryDisabled =
    telemetrySettingsLoading || telemetryConsentSaving || !telemetryAvailable
  const telemetryBuildLabel = telemetrySettings
    ? telemetrySettings.buildFlavor === "release"
      ? "Release build"
      : "OSS build"
    : "Unknown"
  const telemetryProviderLabel =
    telemetrySettings?.provider === "posthog" ? "PostHog" : "Disabled"
  const telemetryHint = useMemo(() => {
    if (!telemetrySettings) return "Telemetry configuration is still loading."
    if (telemetrySettings.enabledInBuild)
      return "Telemetry pipeline is compiled into this build."
    if (!telemetrySettings.configDetected) {
      return "Telemetry configuration error \u2014 check app settings or reinstall."
    }
    if (
      telemetrySettings.buildFlavor !== "release" &&
      !telemetrySettings.telemetryLocalTest
    ) {
      return "Telemetry is not active in development builds by default."
    }
    return "Telemetry is disabled by current build flags."
  }, [telemetrySettings])
  const telemetryStatusBadge = useMemo(() => {
    if (telemetrySettingsLoading && !telemetrySettings) {
      return (
        <span
          className={cn(
            statusBadgeClassName("outline"),
            "ui-meta-text text-muted-foreground",
          )}
        >
          Checking...
        </span>
      )
    }
    if (!telemetryAvailable) {
      return (
        <span
          className={cn(
            statusBadgeClassName("outline"),
            "ui-meta-text text-muted-foreground",
          )}
        >
          Disabled in build
        </span>
      )
    }
    if (telemetryChecked) {
      return (
        <span className={cn(statusBadgeClassName("success"), "ui-meta-text")}>
          Enabled
        </span>
      )
    }
    return (
      <span
        className={cn(
          statusBadgeClassName("outline"),
          "ui-meta-text text-muted-foreground",
        )}
      >
        Disabled
      </span>
    )
  }, [
    telemetryAvailable,
    telemetryChecked,
    telemetrySettings,
    telemetrySettingsLoading,
  ])
  const providers = useMemo(() => ["claude", "codex"] as ProviderId[], [])
  const currentProviderVerdict = useMemo(() => {
    const health = providerAvailability[defaultProvider]
    const auth = providerAuthStatus[defaultProvider]
    return resolveProviderReadinessVerdict(defaultProvider, health, auth)
  }, [defaultProvider, providerAuthStatus, providerAvailability])
  const currentProviderSetupHint = useMemo(() => {
    const health = providerAvailability[defaultProvider]
    const auth = providerAuthStatus[defaultProvider]

    if (!health?.available) {
      return `Next step: install ${PROVIDER_LABELS[defaultProvider]} with ${getProviderInstallCommand(defaultProvider)}.`
    }

    if (!auth?.authenticated && currentProviderVerdict.blocking) {
      return `Next step: finish sign-in with ${getProviderLoginCommand(defaultProvider)}.`
    }

    return null
  }, [
    currentProviderVerdict.blocking,
    defaultProvider,
    providerAuthStatus,
    providerAvailability,
  ])

  return (
    <PageShell>
      <PageHeader
        title="Global Settings"
        subtitle="Providers, MCP servers, and run defaults."
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void refreshAllSettingsDiagnostics()}
            disabled={
              settingsRefreshLoading ||
              providerDiagnosticsLoading ||
              telemetrySettingsLoading
            }
          >
            {settingsRefreshLoading ? (
              <Loader2 size={14} aria-hidden="true" className="animate-spin" />
            ) : (
              <RefreshCw size={14} aria-hidden="true" />
            )}
            Refresh status
          </Button>
        }
      />

      <SettingsProviderStatusStrip
        initialLoading={initialLoading}
        badgeVariant={currentProviderVerdict.badgeVariant}
        badgeLabel={currentProviderVerdict.badgeLabel}
        title={currentProviderVerdict.title}
        description={currentProviderVerdict.description}
        setupHint={currentProviderSetupHint}
        blocking={currentProviderVerdict.blocking}
        onOpenProviders={() => {
          document
            .getElementById("settings-providers")
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        }}
      />

      <div className="flex flex-col gap-6">
        <SettingsChapterShell
          title="Access & Providers"
          description="Choose the default provider, verify auth and CLI readiness, and manage MCP server access for the active runtime."
        >
          <SettingsProvidersSection
            defaultProvider={defaultProvider}
            providerSettings={providerSettings}
            providers={providers}
            providerAvailability={providerAvailability}
            providerAuthStatus={providerAuthStatus}
            providerDiagnosticsLoading={providerDiagnosticsLoading}
            codexApiKeyDraft={codexApiKeyDraft}
            codexApiKeySaving={codexApiKeySaving}
            onDefaultProviderChange={handleDefaultProviderChange}
            onPersistProviderSettings={persistProviderSettings}
            onCodexApiKeyDraftChange={setCodexApiKeyDraft}
            onSaveCodexApiKey={handleSaveCodexApiKey}
            onClearCodexApiKey={handleClearCodexApiKey}
            onLogoutProvider={handleLogoutProvider}
          />

          <McpIntegrationsSection />
          <McpServersSection provider={defaultProvider} />
        </SettingsChapterShell>

        <SettingsChapterShell
          title="Run behavior"
          description="Control default execution limits and research routing for new flows created from this app profile."
        >
          <SettingsExecutionDefaultsSection
            defaultProvider={defaultProvider}
            execDefaults={execDefaults}
            setExecDefaults={setExecDefaults}
            execDefaultsSaveFlash={execDefaultsSaveFlash}
          />

          <SettingsResearchSection
            webSearchBackend={webSearchBackend}
            onValueChange={(value) => setWebSearchBackend(value)}
          />
        </SettingsChapterShell>

        <SettingsChapterShell
          title="App controls"
          description="Review privacy, beta workspace behavior, and app update settings without mixing them into provider setup."
        >
          <SettingsPrivacySection
            telemetryStatusBadge={telemetryStatusBadge}
            telemetryBuildLabel={telemetryBuildLabel}
            telemetryProviderLabel={telemetryProviderLabel}
            telemetryConfigDetected={Boolean(telemetrySettings?.configDetected)}
            telemetryLocalTest={Boolean(telemetrySettings?.telemetryLocalTest)}
            telemetryAvailable={telemetryAvailable}
            telemetryChecked={telemetryChecked}
            telemetryDisabled={telemetryDisabled}
            telemetryHint={telemetryHint}
            saving={telemetryConsentSaving}
            onCheckedChange={(enabled) => {
              void updateTelemetryConsent(enabled)
            }}
          />

          <SettingsLabSection
            factoryBetaEnabled={factoryBetaEnabled}
            onCheckedChange={setFactoryBetaEnabled}
          />

          {process.env.NODE_ENV !== "development" && (
            <SettingsUpdatesSection
              appVersion={appVersion}
              updateInfo={updateInfo}
              updateChecking={updateChecking}
              updateInstalling={updateInstalling}
              onCheckForUpdate={() => void handleCheckForUpdate()}
              onInstallUpdate={handleInstallUpdate}
            />
          )}
        </SettingsChapterShell>
      </div>

      <SingleDecisionDialog
        open={dangerousConfirmOpen}
        onOpenChange={(open) => {
          setDangerousConfirmOpen(open)
          if (!open) {
            setPendingProviderSettingsPatch(null)
          }
        }}
        title="Enable dangerous mode?"
        description="This safety profile can bypass approvals and sandboxing for future runs."
        note="Use this only when you explicitly want unconfined agent execution."
        noteTone="danger"
        confirmLabel="Enable dangerous mode"
        confirmVariant="destructive"
        onConfirm={confirmDangerousSafetyProfile}
      />
    </PageShell>
  )
}
