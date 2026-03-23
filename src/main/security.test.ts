import { describe, expect, it } from "vitest"
import {
  applyContentSecurityPolicyHeader,
  buildRendererContentSecurityPolicy,
  isSafeExternalUrl,
  shouldApplyRendererCsp,
} from "./security"

describe("main security helpers", () => {
  it("allows only https and mailto external urls", () => {
    expect(isSafeExternalUrl("https://c8c.app")).toBe(true)
    expect(isSafeExternalUrl("mailto:team@c8c.app")).toBe(true)
    expect(isSafeExternalUrl("http://c8c.app")).toBe(false)
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false)
  })

  it("builds a strict production CSP without remote script sources", () => {
    const csp = buildRendererContentSecurityPolicy()

    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toContain("http://")
    expect(csp).not.toContain("ws://")
  })

  it("adds renderer and websocket origins in dev CSP", () => {
    const csp = buildRendererContentSecurityPolicy("http://127.0.0.1:5173")

    expect(csp).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://127.0.0.1:5173",
    )
    expect(csp).toContain(
      "connect-src 'self' http://127.0.0.1:5173 ws://127.0.0.1:5173",
    )
  })

  it("replaces any existing CSP header", () => {
    expect(
      applyContentSecurityPolicyHeader(
        {
          "content-security-policy": ["default-src *"],
          "x-test": ["1"],
        },
        "default-src 'self'",
      ),
    ).toEqual({
      "x-test": ["1"],
      "Content-Security-Policy": ["default-src 'self'"],
    })
  })

  it("applies renderer CSP only to the configured renderer origin", () => {
    expect(
      shouldApplyRendererCsp("http://127.0.0.1:5173/", "http://127.0.0.1:5173"),
    ).toBe(true)
    expect(
      shouldApplyRendererCsp("http://127.0.0.1:4173/", "http://127.0.0.1:5173"),
    ).toBe(false)
    expect(
      shouldApplyRendererCsp("file:///tmp/index.html", "http://127.0.0.1:5173"),
    ).toBe(false)
    expect(shouldApplyRendererCsp("file:///tmp/index.html")).toBe(true)
  })
})
