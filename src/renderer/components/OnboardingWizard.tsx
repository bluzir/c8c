import { useCallback, useEffect, useRef, useState } from "react"
import { useAtom } from "jotai"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"
import {
  firstLaunchAtom,
  globalExecutionDefaultsAtom,
  mainViewAtom,
  viewModeAtom,
  providerAuthStatusAtom,
  providerAvailabilityAtom,
  providerSettingsAtom,
  selectedProjectAtom,
} from "@/lib/store"
import { resolveOnboardingPrimaryProvider } from "@/lib/onboarding-provider"
import { PROVIDER_LABELS } from "@shared/provider-metadata"
import type { ProviderDiagnostics, ProviderId } from "@shared/types"
import {
  CheckCircle2,
  XCircle,
  Loader2,
  FolderOpen,
  ArrowRight,
  ArrowLeft,
  Terminal,
  Bot,
} from "lucide-react"
import { toastErrorFromCatch } from "@/lib/toast-error"
import { useWorkflowCreateNavigation } from "@/hooks/useWorkflowCreateNavigation"
import { resolveProjectRequiredContract } from "@/lib/entry-state-contracts"
import {
  getProviderInstallCommand,
  getProviderLoginCommand,
  resolveProviderReadinessVerdict,
} from "@/lib/provider-readiness"

const TOTAL_STEPS = 3

export function OnboardingWizard() {
  const [step, setStep] = useState(1)
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [, setFirstLaunch] = useAtom(firstLaunchAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [, setViewMode] = useAtom(viewModeAtom)
  const [, setSelectedProject] = useAtom(selectedProjectAtom)
  const { openWorkflowCreate } = useWorkflowCreateNavigation()

  const skip = useCallback(() => {
    setFirstLaunch(false)
    setMainView("thread")
    setViewMode("chat")
  }, [setFirstLaunch, setMainView, setViewMode])

  const next = useCallback(() => {
    if (step === 2 && !projectPath) return
    if (step < TOTAL_STEPS) setStep((s) => s + 1)
  }, [projectPath, step])

  const prev = useCallback(() => {
    if (step > 1) setStep((s) => s - 1)
  }, [step])

  const openCreateSurface = useCallback(() => {
    setFirstLaunch(false)
    openWorkflowCreate()
  }, [openWorkflowCreate, setFirstLaunch])

  const goTemplates = useCallback(() => {
    setFirstLaunch(false)
    setMainView("templates")
  }, [setFirstLaunch, setMainView])
  const canContinue = step !== 2 || Boolean(projectPath)

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pt-[var(--titlebar-height)]">
      <div className="flex min-h-full flex-col items-center justify-start px-6 py-10">
        <div className="w-full max-w-3xl space-y-6">
          {/* Progress indicator */}
          <div className="flex items-center justify-center gap-2">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                style={{ transitionProperty: "width, background-color" }}
                className={`h-1.5 rounded-full ui-motion-fast ${
                  i + 1 === step
                    ? "w-8 bg-foreground"
                    : i + 1 < step
                      ? "w-4 bg-foreground/40"
                      : "w-4 bg-muted"
                }`}
              />
            ))}
          </div>

          <div className="overflow-hidden rounded-xl surface-panel">
            <div className="px-6 py-6 sm:px-8 sm:py-8">
              <div className={cn("mx-auto w-full min-h-[30rem]", "max-w-xl")}>
                {step === 1 && <StepCheckCli />}
                {step === 2 && (
                  <StepOpenProject
                    projectPath={projectPath}
                    onProjectAdded={(path) => {
                      setProjectPath(path)
                      setSelectedProject(path)
                    }}
                  />
                )}
                {step === 3 && (
                  <StepUnderstandWorkflow
                    onStartFlow={openCreateSurface}
                    onGoTemplates={goTemplates}
                  />
                )}
              </div>
            </div>

            <div className="surface-depth-footer px-6 py-4 sm:px-8">
              <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
                <div>
                  {step > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={prev}
                    >
                      <ArrowLeft size={14} />
                      Back
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={skip}
                    className="text-muted-foreground"
                  >
                    {step === TOTAL_STEPS ? "Finish" : "Skip setup"}
                  </Button>
                  {step < TOTAL_STEPS && (
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={next}
                      disabled={!canContinue}
                    >
                      Continue
                      <ArrowRight size={14} />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Step 1: Check CLI ───────────────────────────────────── */

function StepCheckCli() {
  const [, setProviderSettings] = useAtom(providerSettingsAtom)
  const [, setProviderAvailability] = useAtom(providerAvailabilityAtom)
  const [, setProviderAuthStatus] = useAtom(providerAuthStatusAtom)
  const [execDefaults, setExecDefaults] = useAtom(globalExecutionDefaultsAtom)
  const currentModelRef = useRef(execDefaults.model)
  const mountedRef = useRef(true)
  const [diagnostics, setDiagnostics] = useState<ProviderDiagnostics | null>(
    null,
  )
  const [primaryProvider, setPrimaryProvider] = useState<ProviderId | null>(
    null,
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    currentModelRef.current = execDefaults.model
  }, [execDefaults.model])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const applyDiagnostics = useCallback(
    (nextDiagnostics: ProviderDiagnostics) => {
      if (!mountedRef.current) return
      setDiagnostics(nextDiagnostics)
      setProviderSettings(nextDiagnostics.settings)
      setProviderAvailability(nextDiagnostics.health)
      setProviderAuthStatus(nextDiagnostics.auth)
    },
    [setProviderAuthStatus, setProviderAvailability, setProviderSettings],
  )

  const refreshDiagnostics = useCallback(async () => {
    if (!mountedRef.current) return
    setLoadError(null)
    setLoading(true)
    try {
      const initialDiagnostics = await window.api.getProviderDiagnostics()
      applyDiagnostics(initialDiagnostics)

      const resolvedPrimary = resolveOnboardingPrimaryProvider(
        initialDiagnostics,
        currentModelRef.current,
      )

      if (!mountedRef.current) return
      setPrimaryProvider(resolvedPrimary?.provider ?? null)

      if (resolvedPrimary?.providerChanged) {
        const nextSettings = await window.api.updateProviderSettings({
          defaultProvider: resolvedPrimary.provider,
        })

        applyDiagnostics({
          ...initialDiagnostics,
          settings: nextSettings,
        })
      }

      if (resolvedPrimary?.modelChanged) {
        if (!mountedRef.current) return
        setExecDefaults((prev) => ({
          ...prev,
          model: resolvedPrimary.model,
        }))
      }
    } catch (error) {
      if (!mountedRef.current) return
      setLoadError(
        error instanceof Error ? error.message : "Could not check CLI status.",
      )
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [applyDiagnostics, setExecDefaults])

  useEffect(() => {
    void refreshDiagnostics()
  }, [refreshDiagnostics])

  const providers: ProviderId[] = ["claude", "codex"]
  const readyProviders = providers.filter((provider) => {
    const health = diagnostics?.health[provider]
    const auth = diagnostics?.auth[provider]
    return Boolean(health?.available && auth?.authenticated)
  })
  const hasMultipleAvailableProviders =
    providers.filter((provider) => diagnostics?.health[provider].available)
      .length > 1

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Terminal size={20} className="text-foreground" />
        <h2 className="text-title-md text-foreground">Check CLI</h2>
      </div>
      <p className="text-body-md text-muted-foreground">
        c8c can run flows through Claude Code or Codex. If only one CLI is
        detected, it becomes the default provider automatically.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          Checking CLI status...
        </div>
      ) : loadError ? (
        <p className="text-body-sm text-status-danger">{loadError}</p>
      ) : (
        <div className="space-y-3">
          {providers.map((provider) => {
            const health = diagnostics?.health[provider]
            const auth = diagnostics?.auth[provider]
            const available = health?.available ?? false
            const authenticated = auth?.authenticated ?? false
            const authState = auth?.state ?? "unknown"
            const verdict = resolveProviderReadinessVerdict(
              provider,
              health,
              auth,
            )
            const installCommand = getProviderInstallCommand(provider)
            const loginCommand = getProviderLoginCommand(provider)

            return (
              <div
                key={provider}
                className={cn(
                  "space-y-2 py-3",
                  provider !== providers[0] && "ui-section-divider",
                )}
              >
                <div className="text-body-md font-medium text-foreground">
                  {PROVIDER_LABELS[provider]}
                </div>

                <div className="flex items-center gap-2 text-body-sm">
                  {available ? (
                    <CheckCircle2
                      size={16}
                      className="text-status-success shrink-0"
                    />
                  ) : (
                    <XCircle
                      size={16}
                      className="text-status-danger shrink-0"
                    />
                  )}
                  <span
                    className={
                      available ? "text-foreground" : "text-status-danger"
                    }
                  >
                    CLI {available ? "detected" : "not found"}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-body-sm">
                  {authenticated ? (
                    <CheckCircle2
                      size={16}
                      className="text-status-success shrink-0"
                    />
                  ) : authState === "unknown" ? (
                    <Loader2
                      size={16}
                      className="text-status-warning shrink-0"
                    />
                  ) : (
                    <XCircle
                      size={16}
                      className="text-status-danger shrink-0"
                    />
                  )}
                  <span
                    className={
                      authenticated
                        ? "text-foreground"
                        : authState === "unknown"
                          ? "text-status-warning"
                          : "text-status-danger"
                    }
                  >
                    {available
                      ? authenticated
                        ? "Authenticated"
                        : verdict.badgeLabel === "Check sign-in"
                          ? "Sign-in could not be verified — try running the CLI manually"
                          : "Not authenticated"
                      : "Authentication unavailable until the CLI is installed"}
                  </span>
                </div>

                {!available && (
                  <p className="text-body-sm text-muted-foreground">
                    Install:{" "}
                    <code className="inline-code">{installCommand}</code>
                  </p>
                )}

                {available && authState === "unauthenticated" && (
                  <p className="text-body-sm text-muted-foreground">
                    Authenticate:{" "}
                    <code className="inline-code">{loginCommand}</code>
                  </p>
                )}

                {available && authState === "unknown" && auth?.error ? (
                  <p className="text-body-sm text-muted-foreground">
                    Status check:{" "}
                    <code className="inline-code">{auth.error}</code>
                  </p>
                ) : null}
              </div>
            )
          })}

          {primaryProvider ? (
            <p className="text-body-sm text-status-success font-medium">
              {PROVIDER_LABELS[primaryProvider]} is the only detected CLI, so it
              will be used as the default provider.
            </p>
          ) : readyProviders.length > 0 ? (
            <p className="text-body-sm text-status-success font-medium">
              {hasMultipleAvailableProviders
                ? "Multiple providers are available. You can switch between them later in Settings."
                : `${PROVIDER_LABELS[readyProviders[0]]} is ready.`}
            </p>
          ) : (
            <p className="ui-meta-text text-muted-foreground">
              You can still continue setup and install or authenticate a CLI
              later.
            </p>
          )}

          <div className="pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refreshDiagnostics()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Terminal size={14} />
              )}
              Re-check CLI
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Step 2: Open a project ──────────────────────────────── */

function StepOpenProject({
  projectPath,
  onProjectAdded,
}: {
  projectPath: string | null
  onProjectAdded: (path: string | null) => void
}) {
  const [adding, setAdding] = useState(false)
  const projectRequired = resolveProjectRequiredContract({
    resolvedProjectPath: projectPath,
  })

  const handleAddProject = useCallback(async () => {
    setAdding(true)
    try {
      const result = await window.api.addProject()
      if (result) {
        onProjectAdded(result)
      }
    } catch (error) {
      toastErrorFromCatch("Could not add project", error)
    } finally {
      setAdding(false)
    }
  }, [onProjectAdded])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <FolderOpen size={20} className="text-foreground" />
        <h2 className="text-title-md text-foreground">Open a project</h2>
      </div>
      <p className="text-body-md text-muted-foreground">
        Select a folder to use as your project root. Flows and skills will be
        stored relative to this directory.
      </p>

      {projectPath ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-body-sm">
            <CheckCircle2 size={16} className="text-status-success shrink-0" />
            <span className="font-medium text-foreground">Project ready</span>
          </div>
          <p className="truncate text-body-sm text-foreground">{projectPath}</p>
          <p className="ui-meta-text text-muted-foreground">
            Continue to start your first flow.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => void handleAddProject()}
            disabled={adding}
          >
            {adding ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <FolderOpen size={14} />
            )}
            {projectRequired.primaryActionLabel}
          </Button>
          <p className="ui-meta-text text-muted-foreground">
            {projectRequired.blockerStatement}{" "}
            {projectRequired.actionInstruction}
          </p>
        </div>
      )}

      <p className="ui-meta-text text-muted-foreground">
        You can add more projects later from the sidebar.
      </p>
    </div>
  )
}

/* ── Step 3: Flow mental model + first action ────────── */

function StepUnderstandWorkflow({
  onStartFlow,
  onGoTemplates,
}: {
  onStartFlow: () => void
  onGoTemplates: () => void
}) {
  const examplePrompt =
    "Build a flow that reviews this codebase for risky files, then summarizes what to fix first."
  const flowSteps = [
    "Describe the result you want in plain language.",
    "c8c picks the best starting point and runs the first steps.",
    "Review the first result, then refine if needed.",
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Bot size={20} className="text-foreground" />
        <div className="space-y-1">
          <h2 className="text-title-md text-foreground">
            Start your first flow
          </h2>
          <div className="ui-meta-text text-muted-foreground">
            Describe the result you want in plain language, then let the system
            choose the best starting path.
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-body-sm font-mono leading-6 text-foreground">
          {examplePrompt}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onStartFlow}
          >
            Start a flow
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onGoTemplates}
          >
            Browse starting points
          </Button>
        </div>
        <p className="ui-meta-text text-muted-foreground">
          Tip: write the goal first. You can browse starting points if you want
          a curated way to begin.
        </p>
      </div>

      <div className="space-y-2 ui-section-divider">
        {flowSteps.map((stepLabel) => (
          <p key={stepLabel} className="text-body-sm text-muted-foreground">
            {stepLabel}
          </p>
        ))}
      </div>
    </div>
  )
}
