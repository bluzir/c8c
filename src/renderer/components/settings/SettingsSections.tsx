import type { Dispatch, ReactNode, SetStateAction } from "react"
import { Download, Loader2, RefreshCw } from "lucide-react"
import type {
  ProviderAuthStatus,
  ProviderHealth,
  ProviderId,
  ProviderSettings,
  UpdateInfo,
} from "@shared/types"
import { PROVIDER_LABELS, SAFETY_PROFILE_LABELS, getDefaultModelForProvider } from "@shared/provider-metadata"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SectionHeading } from "@/components/ui/page-shell"
import { cn } from "@/lib/cn"
import { ProviderModelInput, ProviderSelect } from "@/components/provider-controls"
import { getProviderInstallCommand, getProviderLoginCommand, getProviderSignInMethod, resolveProviderReadinessVerdict } from "@/lib/provider-readiness"

export function statusBadgeClassName(variant: "outline" | "success" | "warning" | "destructive") {
  if (variant === "success") return "ui-status-badge ui-status-badge-success"
  if (variant === "warning") return "ui-status-badge ui-status-badge-warning"
  if (variant === "destructive") return "ui-status-badge ui-status-badge-danger"
  return "ui-status-badge ui-status-badge-info"
}

interface SettingsProviderStatusStripProps {
  badgeVariant: "outline" | "success" | "warning" | "destructive"
  badgeLabel: string
  title: string
  description: string
  setupHint?: string | null
  blocking: boolean
  onOpenProviders: () => void
}

export function SettingsProviderStatusStrip({
  badgeVariant,
  badgeLabel,
  title,
  description,
  setupHint = null,
  blocking,
  onOpenProviders,
}: SettingsProviderStatusStripProps) {
  return (
    <section className="rounded-lg border border-hairline bg-surface-1/60 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="section-kicker">Provider status</span>
            <span className={cn(statusBadgeClassName(badgeVariant), "ui-meta-text")}>
              {badgeLabel}
            </span>
          </div>
          <p className="text-body-sm font-medium text-foreground">{title}</p>
          <p className="ui-meta-text text-muted-foreground">{description}</p>
          {setupHint ? <p className="ui-meta-text text-foreground">{setupHint}</p> : null}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onOpenProviders}>
          {blocking ? "Open provider setup" : "Open providers"}
        </Button>
      </div>
    </section>
  )
}

interface SettingsUpdatesSectionProps {
  appVersion: string
  updateInfo: UpdateInfo
  updateChecking: boolean
  onCheckForUpdate: () => void
  onInstallUpdate: () => void
}

export function SettingsUpdatesSection({
  appVersion,
  updateInfo,
  updateChecking,
  onCheckForUpdate,
  onInstallUpdate,
}: SettingsUpdatesSectionProps) {
  return (
    <section className="order-7 space-y-3">
      <SectionHeading title="Updates" />

      <article className="rounded-lg surface-panel p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-body-md font-semibold">Application Updates</h3>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Current version: <span className="font-medium">{appVersion || "..."}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {updateInfo.status === "downloaded" ? (
              <Button type="button" variant="default" size="sm" onClick={onInstallUpdate}>
                <Download size={14} />
                Restart to update
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onCheckForUpdate}
                disabled={updateChecking || updateInfo.status === "checking" || updateInfo.status === "downloading"}
              >
                {updateChecking || updateInfo.status === "checking"
                  ? <Loader2 size={14} className="animate-spin" />
                  : <RefreshCw size={14} />}
                Check for updates
              </Button>
            )}
          </div>
        </div>

        {updateInfo.status === "available" && updateInfo.version ? (
          <p className="text-body-sm text-status-info">
            Version {updateInfo.version} is available. Downloading...
          </p>
        ) : null}

        {updateInfo.status === "downloading" ? (
          <div className="space-y-1">
            <p className="text-body-sm text-muted-foreground">
              Downloading update... {updateInfo.progress ?? 0}%
            </p>
            <div className="ui-progress-track">
              <div
                className="ui-progress-bar"
                style={{ transform: `scaleX(${(updateInfo.progress ?? 0) / 100})` }}
              />
            </div>
          </div>
        ) : null}

        {updateInfo.status === "downloaded" ? (
          <p className="text-body-sm text-status-success">
            Version {updateInfo.version} is ready to install. Restart the app to apply the update.
          </p>
        ) : null}

        {updateInfo.status === "not-available" ? (
          <p className="ui-meta-text text-muted-foreground">You're on the latest version.</p>
        ) : null}

        {updateInfo.status === "error" ? (
          <div className="space-y-1">
            <p className="text-body-sm text-status-danger">{updateInfo.error}</p>
            <p className="ui-meta-text text-muted-foreground">
              You can download the latest version from{" "}
              <a
                href="https://github.com/c8c-ai/c8c/releases"
                className="text-primary underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub Releases
              </a>.
            </p>
          </div>
        ) : null}
      </article>
    </section>
  )
}

interface GlobalExecutionDefaults {
  model: string
  maxTurns: number
  timeout_minutes: number
  maxParallel: number
}

interface SettingsExecutionDefaultsSectionProps {
  defaultProvider: ProviderId
  execDefaults: GlobalExecutionDefaults
  setExecDefaults: Dispatch<SetStateAction<GlobalExecutionDefaults>>
  execDefaultsSaveFlash: "idle" | "saved"
}

export function SettingsExecutionDefaultsSection({
  defaultProvider,
  execDefaults,
  setExecDefaults,
  execDefaultsSaveFlash,
}: SettingsExecutionDefaultsSectionProps) {
  return (
    <section className="order-3 space-y-3">
      <SectionHeading title="Execution Defaults" />

      <article className="rounded-lg surface-panel p-4 space-y-3">
        <div>
          <h3 className="text-body-md font-semibold">New Flow Defaults</h3>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Default values applied when creating new flows. These do not affect existing saved flows.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="exec-default-model" className="text-body-sm font-medium text-foreground">Model</Label>
            <ProviderModelInput
              id="exec-default-model"
              provider={defaultProvider}
              value={execDefaults.model}
              onValueChange={(value) => setExecDefaults((prev) => ({ ...prev, model: value }))}
              placeholder={getDefaultModelForProvider(defaultProvider)}
              className="w-full"
            />
            <p className="ui-meta-text text-muted-foreground">
              Suggested models follow the current default provider.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exec-default-max-turns" className="text-body-sm font-medium text-foreground">Max Turns</Label>
            <Input
              id="exec-default-max-turns"
              type="number"
              min={1}
              max={1000}
              value={execDefaults.maxTurns}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (!isNaN(v) && v >= 1) setExecDefaults((prev) => ({ ...prev, maxTurns: v }))
              }}
            />
            <p className="ui-meta-text text-muted-foreground">Maximum agentic turns per skill node.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exec-default-timeout" className="text-body-sm font-medium text-foreground">Timeout (minutes)</Label>
            <Input
              id="exec-default-timeout"
              type="number"
              min={1}
              max={480}
              value={execDefaults.timeout_minutes}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (!isNaN(v) && v >= 1) setExecDefaults((prev) => ({ ...prev, timeout_minutes: v }))
              }}
            />
            <p className="ui-meta-text text-muted-foreground">Per-node execution timeout.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exec-default-max-parallel" className="text-body-sm font-medium text-foreground">Max Parallel</Label>
            <Input
              id="exec-default-max-parallel"
              type="number"
              min={1}
              max={32}
              value={execDefaults.maxParallel}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (!isNaN(v) && v >= 1) setExecDefaults((prev) => ({ ...prev, maxParallel: v }))
              }}
            />
            <p className="ui-meta-text text-muted-foreground">Max concurrent branches for splitter fan-out.</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="ui-meta-text text-muted-foreground">
            Stored locally for this app profile.
          </p>
          <span
            className={cn(
              "ui-meta-text ui-transition-colors ui-motion-fast",
              execDefaultsSaveFlash === "saved" ? "text-status-success" : "text-transparent",
            )}
            aria-live="polite"
          >
            Saved
          </span>
        </div>
      </article>
    </section>
  )
}

interface SettingsLabSectionProps {
  factoryBetaEnabled: boolean
  onCheckedChange: (checked: boolean) => void
}

export function SettingsLabSection({ factoryBetaEnabled, onCheckedChange }: SettingsLabSectionProps) {
  return (
    <section className="order-6 space-y-3">
      <SectionHeading title="Lab" />

      <article className="rounded-lg surface-panel p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-body-md font-semibold text-foreground">Enable lab view</h3>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Shows the advanced lab workspace and related navigation. Leave this off for the simpler flow editor and library view.
            </p>
          </div>
          <Switch
            checked={factoryBetaEnabled}
            aria-label="Enable lab view beta"
            onCheckedChange={onCheckedChange}
          />
        </div>

        <p className="ui-meta-text text-muted-foreground">
          Stored locally for this app profile.
        </p>
      </article>
    </section>
  )
}

interface SettingsResearchSectionProps {
  webSearchBackend: "builtin" | "exa"
  onValueChange: (value: "builtin" | "exa") => void
}

export function SettingsResearchSection({ webSearchBackend, onValueChange }: SettingsResearchSectionProps) {
  return (
    <section className="order-4 space-y-3">
      <SectionHeading title="Research" />

      <article className="rounded-lg surface-panel p-4 space-y-3">
        <div>
          <h3 className="text-body-md font-semibold">Web Search Backend</h3>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Defines which web-search path is preferred when using library flows from the
            <span className="font-medium"> research </span>
            category.
          </p>
        </div>

        <Select value={webSearchBackend} onValueChange={(value) => onValueChange(value as "builtin" | "exa")}>
          <SelectTrigger className="w-full max-w-[340px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Backend</SelectLabel>
              <SelectItem value="builtin">Built-in (default)</SelectItem>
              <SelectItem value="exa">Exa MCP</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        <p className="ui-meta-text text-muted-foreground">
          Current setting is stored locally for this app profile and does not modify existing flow files.
        </p>
      </article>
    </section>
  )
}

interface SettingsProvidersSectionProps {
  defaultProvider: ProviderId
  providerSettings: ProviderSettings
  providers: ProviderId[]
  providerAvailability: Record<ProviderId, ProviderHealth | null>
  providerAuthStatus: Record<ProviderId, ProviderAuthStatus | null>
  providerDiagnosticsLoading: boolean
  codexApiKeyDraft: string
  codexApiKeySaving: boolean
  onDefaultProviderChange: (provider: ProviderId) => Promise<void> | void
  onPersistProviderSettings: (patch: Partial<ProviderSettings>) => Promise<void> | void
  onCodexApiKeyDraftChange: (value: string) => void
  onSaveCodexApiKey: () => Promise<void> | void
  onClearCodexApiKey: () => Promise<void> | void
  onLogoutProvider: (provider: ProviderId) => Promise<void> | void
}

export function SettingsProvidersSection({
  defaultProvider,
  providerSettings,
  providers,
  providerAvailability,
  providerAuthStatus,
  providerDiagnosticsLoading,
  codexApiKeyDraft,
  codexApiKeySaving,
  onDefaultProviderChange,
  onPersistProviderSettings,
  onCodexApiKeyDraftChange,
  onSaveCodexApiKey,
  onClearCodexApiKey,
  onLogoutProvider,
}: SettingsProvidersSectionProps) {
  return (
    <section id="settings-providers" className="order-1 space-y-3">
      <SectionHeading title="Providers" />

      <article className="rounded-lg bg-surface-1/40 px-4 py-4 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="default-provider" className="text-body-sm font-medium text-foreground">
              Default provider
            </Label>
            <ProviderSelect
              id="default-provider"
              value={defaultProvider}
              onValueChange={(value) => void onDefaultProviderChange(value)}
              codexEnabled={providerSettings.features.codexProvider}
              className="w-full"
            />
            <p className="ui-meta-text text-muted-foreground">
              Used when a flow does not set its own provider override.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="safety-profile" className="text-body-sm font-medium text-foreground">
              Safety profile
            </Label>
            <Select
              value={providerSettings.safetyProfile}
              onValueChange={(value) => void onPersistProviderSettings({ safetyProfile: value as typeof providerSettings.safetyProfile })}
            >
              <SelectTrigger id="safety-profile" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Profile</SelectLabel>
                  {Object.entries(SAFETY_PROFILE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="ui-meta-text text-muted-foreground">
              Mapped to provider-specific sandbox and approval flags at runtime.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {providers.map((providerId, index) => {
            const health = providerAvailability[providerId]
            const auth = providerAuthStatus[providerId]
            const available = Boolean(health?.available)
            const authenticated = Boolean(auth?.authenticated)
            const providerVerdict = resolveProviderReadinessVerdict(providerId, health, auth)

            return (
              <div
                key={providerId}
                className={index > 0 ? "space-y-3 border-t border-hairline pt-3" : "space-y-3"}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-body-md font-semibold">{PROVIDER_LABELS[providerId]}</h3>
                    <p className="mt-1 text-body-sm text-muted-foreground">
                      {health?.version || (available ? "CLI version unknown" : `Install: ${getProviderInstallCommand(providerId)}`)}
                    </p>
                  </div>
                  <span className={cn(statusBadgeClassName(providerVerdict.badgeVariant), "ui-meta-text")}>
                    {providerVerdict.badgeLabel}
                  </span>
                </div>

                {available ? (
                  <div className="grid grid-cols-1 gap-2 text-body-sm text-muted-foreground sm:grid-cols-2">
                    <p>CLI path: <span className="text-foreground">{health?.executablePath || "not found"}</span></p>
                    <p>
                      Signed in via:{" "}
                      <span className="text-foreground">
                        {getProviderSignInMethod(providerId, auth?.authMethod, authenticated)}
                      </span>
                    </p>
                    <p>Signed in as: <span className="text-foreground">{auth?.accountLabel || "n/a"}</span></p>
                    <p>Custom API key: <span className="text-foreground">{auth?.apiKeyConfigured ? "configured" : "not set"}</span></p>
                  </div>
                ) : (
                  <p className="text-body-sm text-muted-foreground">
                    Install: <code className="inline-code">{getProviderInstallCommand(providerId)}</code>
                  </p>
                )}

                {available && !authenticated ? (
                  <p className="text-body-sm text-muted-foreground">
                    Sign in with <code className="inline-code">{getProviderLoginCommand(providerId)}</code>
                    {providerId === "codex" ? " or save a CODEX_API_KEY override below." : "."}
                  </p>
                ) : null}

                {health?.error ? <p className="text-body-sm text-status-danger">{health.error}</p> : null}
                {auth?.error ? <p className="text-body-sm text-status-danger">{auth.error}</p> : null}

                {providerId === "codex" ? (
                  <div className="space-y-2 border-l border-hairline pl-4">
                    <Label htmlFor="codex-api-key" className="text-body-sm font-medium text-foreground">
                      CODEX_API_KEY override
                    </Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="codex-api-key"
                        type="password"
                        value={codexApiKeyDraft}
                        onChange={(event) => onCodexApiKeyDraftChange(event.target.value)}
                        placeholder="Paste API key to store in the app"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void onSaveCodexApiKey()}
                        disabled={codexApiKeySaving || !codexApiKeyDraft.trim()}
                      >
                        Save key
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void onClearCodexApiKey()}
                        disabled={codexApiKeySaving}
                      >
                        Clear key
                      </Button>
                    </div>
                    <p className="ui-meta-text text-muted-foreground">
                      ChatGPT subscription login works via <code className="inline-code">codex login</code> and does not require an API key. The app-managed key is only an optional override stored in the app.
                    </p>
                  </div>
                ) : null}

                {authenticated ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void onLogoutProvider(providerId)}
                      disabled={providerDiagnosticsLoading}
                      title={`Removes CLI credentials for ${PROVIDER_LABELS[providerId]}. You will need to sign in again to use this provider.`}
                    >
                      Sign out of {PROVIDER_LABELS[providerId]}
                    </Button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </article>
    </section>
  )
}

interface SettingsPrivacySectionProps {
  telemetryStatusBadge: ReactNode
  telemetryBuildLabel: string
  telemetryProviderLabel: string
  telemetryConfigDetected: boolean
  telemetryLocalTest: boolean
  telemetryAvailable: boolean
  telemetryChecked: boolean
  telemetryDisabled: boolean
  telemetryHint: string
  onCheckedChange: (enabled: boolean) => void
}

export function SettingsPrivacySection({
  telemetryStatusBadge,
  telemetryBuildLabel,
  telemetryProviderLabel,
  telemetryConfigDetected,
  telemetryLocalTest,
  telemetryAvailable,
  telemetryChecked,
  telemetryDisabled,
  telemetryHint,
  onCheckedChange,
}: SettingsPrivacySectionProps) {
  return (
    <section className="order-5 space-y-3">
      <SectionHeading title="Privacy" />

      <article className="rounded-lg surface-panel p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-body-md font-semibold">Product Analytics</h3>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Sends anonymized runtime metrics to improve reliability and update safety. No prompts, content, paths, or secrets are sent.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {telemetryStatusBadge}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 text-body-sm text-muted-foreground sm:grid-cols-2">
          <p>
            Build: <span className="text-foreground">{telemetryBuildLabel || "unknown"}</span>
          </p>
          <p>
            Provider: <span className="text-foreground">{telemetryProviderLabel}</span>
          </p>
          <p>
            Config: <span className="text-foreground">{telemetryConfigDetected ? "present" : "missing"}</span>
          </p>
          <p>
            Local test flag: <span className="text-foreground">{telemetryLocalTest ? "on" : "off"}</span>
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3">
          <div>
            <p className="text-body-sm font-medium text-foreground">Allow product analytics</p>
            <p className="ui-meta-text text-muted-foreground">
              {telemetryAvailable
                ? "You can opt in or out at any time."
                : "Telemetry is not available in this build."}
            </p>
          </div>
          <Switch
            checked={telemetryChecked}
            disabled={telemetryDisabled}
            aria-label="Allow product analytics"
            onCheckedChange={onCheckedChange}
          />
        </div>

        <p className="ui-meta-text text-muted-foreground">{telemetryHint}</p>
      </article>
    </section>
  )
}
