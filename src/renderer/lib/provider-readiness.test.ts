import { describe, expect, it } from "vitest"
import { resolveProviderBannerState, resolveProviderReadinessVerdict, getProviderSignInMethod } from "./provider-readiness"

describe("provider-readiness", () => {
  it("marks unavailable providers as setup blockers", () => {
    expect(resolveProviderReadinessVerdict("claude", {
      provider: "claude",
      available: false,
      error: "Claude CLI is not installed.",
    }, null)).toMatchObject({
      badgeVariant: "destructive",
      badgeLabel: "Needs setup",
      blocking: true,
    })
  })

  it("does not show a blocking banner for codex unknown auth", () => {
    expect(resolveProviderReadinessVerdict("codex", {
      provider: "codex",
      available: true,
    }, {
      provider: "codex",
      authenticated: false,
      state: "unknown",
    })).toMatchObject({
      badgeLabel: "Check sign-in",
      blocking: false,
    })
    expect(resolveProviderBannerState("codex", {
      provider: "codex",
      available: true,
    }, {
      provider: "codex",
      authenticated: false,
      state: "unknown",
    })).toBeNull()
  })

  it("shows a blocking banner for claude unknown auth", () => {
    expect(resolveProviderBannerState("claude", {
      provider: "claude",
      available: true,
    }, {
      provider: "claude",
      authenticated: false,
      state: "unknown",
    })).toMatchObject({
      tone: "warning",
      dismissKey: "claude:unknown",
    })
  })

  it("formats provider sign-in labels consistently", () => {
    expect(getProviderSignInMethod("codex", "chatgpt", true)).toBe("ChatGPT account")
    expect(getProviderSignInMethod("claude", "oauth", true)).toBe("Claude account")
    expect(getProviderSignInMethod("claude", null, false)).toBe("Not signed in")
  })
})
