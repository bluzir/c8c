import { describe, expect, it } from "vitest"
import {
  DEVELOPMENT_BANNED_DIRECT_ENTRY_TEMPLATE_IDS,
  filterDirectCreateEntryOptions,
  isBannedDirectCreateEntryTemplateId,
  sanitizeDirectCreateFallbackTemplateId,
} from "./create-entry-routing"

describe("create-entry-routing", () => {
  it("keeps the direct-entry ban list explicit for development mode", () => {
    expect(Array.from(DEVELOPMENT_BANNED_DIRECT_ENTRY_TEMPLATE_IDS)).toEqual([
      "delivery-implement-phase",
      "delivery-verify-phase",
      "gstack-preflight-gate",
    ])
  })

  it("blocks banned development templates from direct entry", () => {
    expect(
      isBannedDirectCreateEntryTemplateId(
        "development",
        "delivery-implement-phase",
      ),
    ).toBe(true)
    expect(
      isBannedDirectCreateEntryTemplateId(
        "development",
        "delivery-verify-phase",
      ),
    ).toBe(true)
    expect(
      isBannedDirectCreateEntryTemplateId(
        "development",
        "gstack-preflight-gate",
      ),
    ).toBe(true)
    expect(
      isBannedDirectCreateEntryTemplateId(
        "development",
        "delivery-review-phase",
      ),
    ).toBe(false)
  })

  it("does not apply the development ban list to other modes", () => {
    expect(
      isBannedDirectCreateEntryTemplateId(
        "content",
        "delivery-implement-phase",
      ),
    ).toBe(false)
    expect(
      isBannedDirectCreateEntryTemplateId("courses", "delivery-verify-phase"),
    ).toBe(false)
  })

  it("filters disallowed development options while preserving allowed ones", () => {
    const options = [
      { templateId: "delivery-map-codebase", label: "Map codebase" },
      { templateId: "delivery-implement-phase", label: "Implement phase" },
      { templateId: "delivery-review-phase", label: "Review phase" },
      { templateId: "delivery-verify-phase", label: "Verify phase" },
    ]

    expect(filterDirectCreateEntryOptions("development", options)).toEqual([
      { templateId: "delivery-map-codebase", label: "Map codebase" },
      { templateId: "delivery-review-phase", label: "Review phase" },
    ])
    expect(filterDirectCreateEntryOptions("content", options)).toEqual(options)
  })

  it("sanitizes banned direct-entry fallback templates in development mode", () => {
    expect(
      sanitizeDirectCreateFallbackTemplateId(
        "development",
        "delivery-implement-phase",
      ),
    ).toBeUndefined()
    expect(
      sanitizeDirectCreateFallbackTemplateId(
        "development",
        " delivery-verify-phase ",
      ),
    ).toBeUndefined()
    expect(
      sanitizeDirectCreateFallbackTemplateId(
        "development",
        "delivery-review-phase",
      ),
    ).toBe("delivery-review-phase")
    expect(
      sanitizeDirectCreateFallbackTemplateId(
        "content",
        "delivery-implement-phase",
      ),
    ).toBe("delivery-implement-phase")
    expect(
      sanitizeDirectCreateFallbackTemplateId("development", "  "),
    ).toBeUndefined()
  })
})
