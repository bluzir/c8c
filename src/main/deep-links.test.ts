import { describe, expect, it } from "vitest"
import { extractDeepLinkUrl, parseTemplateDeepLink } from "./deep-links"

describe("deep-links", () => {
  it("extracts c8c protocol URLs from argv", () => {
    expect(extractDeepLinkUrl(["/tmp/app", "c8c://hub/template-123"])).toBe(
      "c8c://hub/template-123",
    )
    expect(
      extractDeepLinkUrl([
        "/tmp/app",
        "c8c://install?url=https://c8c.app/hub/deep-research.yaml",
      ]),
    ).toBe("c8c://install?url=https://c8c.app/hub/deep-research.yaml")
    expect(extractDeepLinkUrl(["/tmp/app"])).toBeNull()
  })

  it("parses valid template links and rejects unsupported ones", () => {
    expect(parseTemplateDeepLink("c8c://hub/template-123")).toEqual({
      templateId: "template-123",
    })
    expect(
      parseTemplateDeepLink(
        "c8c://install?url=https://c8c.app/hub/deep-research.yaml",
      ),
    ).toEqual({
      templateId: "deep-research",
      templateUrl: "https://c8c.app/hub/deep-research.yaml",
    })
    expect(
      parseTemplateDeepLink(
        "c8c://install?url=https%3A%2F%2Fc8c.app%2Fhub%2Fdeep-research.yaml",
      ),
    ).toEqual({
      templateId: "deep-research",
      templateUrl: "https://c8c.app/hub/deep-research.yaml",
    })
    expect(parseTemplateDeepLink("c8c://other/template-123")).toBeNull()
    expect(
      parseTemplateDeepLink(
        "c8c://install?url=http://c8c.app/hub/deep-research.yaml",
      ),
    ).toBeNull()
    expect(
      parseTemplateDeepLink(
        "c8c://install?url=https://c8c.app/hub/deep-research",
      ),
    ).toBeNull()
    expect(parseTemplateDeepLink("https://hub/template-123")).toBeNull()
    expect(parseTemplateDeepLink("c8c://hub/not allowed")).toBeNull()
  })
})
