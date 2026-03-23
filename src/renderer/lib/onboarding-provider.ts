import {
  getDefaultModelForProvider,
  modelLooksCompatible,
} from "@shared/provider-metadata"
import type { ProviderDiagnostics, ProviderId } from "@shared/types"

const PROVIDERS: ProviderId[] = ["claude", "codex"]

export interface OnboardingPrimaryProviderResolution {
  provider: ProviderId
  model: string
  providerChanged: boolean
  modelChanged: boolean
}

export function resolveOnboardingPrimaryProvider(
  diagnostics: Pick<ProviderDiagnostics, "settings" | "health">,
  currentModel: string,
): OnboardingPrimaryProviderResolution | null {
  const availableProviders = PROVIDERS.filter((provider) => {
    if (provider === "codex" && !diagnostics.settings.features.codexProvider) {
      return false
    }
    return diagnostics.health[provider].available
  })

  if (availableProviders.length !== 1) {
    return null
  }

  const provider = availableProviders[0]
  const model = modelLooksCompatible(provider, currentModel)
    ? currentModel
    : getDefaultModelForProvider(provider)

  return {
    provider,
    model,
    providerChanged: diagnostics.settings.defaultProvider !== provider,
    modelChanged: model !== currentModel,
  }
}
