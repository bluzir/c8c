import { describe, expect, it } from "vitest"
import type { ProviderReadiness } from "./provider-runtime"
import { providerReadinessError } from "./provider-runtime"

function makeReadiness(
  overrides: Partial<ProviderReadiness>,
): ProviderReadiness {
  return {
    provider: "codex",
    health: {
      provider: "codex",
      available: true,
      executablePath: "/opt/homebrew/bin/codex",
      version: "0.1.2505172129",
      error: null,
    },
    auth: {
      provider: "codex",
      state: "authenticated",
      authenticated: true,
      authMethod: "chatgpt",
      accountLabel: "ChatGPT subscription",
      apiKeyConfigured: false,
      error: null,
    },
    ...overrides,
  }
}

describe("providerReadinessError", () => {
  it("allows Codex runs to proceed when auth verification is indeterminate", () => {
    expect(
      providerReadinessError(
        makeReadiness({
          auth: {
            provider: "codex",
            state: "unknown",
            authenticated: false,
            authMethod: null,
            accountLabel: null,
            apiKeyConfigured: false,
            error:
              "Codex ACP could not verify the current authentication state.",
          },
        }),
      ),
    ).toBeNull()
  })

  it("still blocks Codex when ACP definitively reports missing auth", () => {
    expect(
      providerReadinessError(
        makeReadiness({
          auth: {
            provider: "codex",
            state: "unauthenticated",
            authenticated: false,
            authMethod: null,
            accountLabel: null,
            apiKeyConfigured: false,
            error: "Codex CLI is not authenticated.",
          },
        }),
      ),
    ).toContain("Codex CLI is not authenticated")
  })
})
