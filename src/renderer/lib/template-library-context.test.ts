import { describe, expect, it } from "vitest"
import {
  resolveTemplateLibraryProjectPath,
  templateLibraryRequiresProjectCreation,
} from "./template-library-context"

describe("template library context", () => {
  it("prefers the workflow-create project over the stale selected project", () => {
    expect(
      resolveTemplateLibraryProjectPath(
        ["/tmp/alpha", "/tmp/beta"],
        "/tmp/alpha",
        { projectPath: "/tmp/beta", createOnly: true },
      ),
    ).toBe("/tmp/beta")
  })

  it("falls back to the selected project and then the first available project", () => {
    expect(
      resolveTemplateLibraryProjectPath(
        ["/tmp/alpha", "/tmp/beta"],
        "/tmp/alpha",
        null,
      ),
    ).toBe("/tmp/alpha")

    expect(
      resolveTemplateLibraryProjectPath(
        ["/tmp/alpha", "/tmp/beta"],
        "/tmp/missing",
        null,
      ),
    ).toBe("/tmp/alpha")
  })

  it("tracks when the template library should create a new workflow directly", () => {
    expect(
      templateLibraryRequiresProjectCreation({
        projectPath: "/tmp/beta",
        createOnly: true,
      }),
    ).toBe(true)
    expect(
      templateLibraryRequiresProjectCreation({
        projectPath: "/tmp/beta",
        createOnly: false,
      }),
    ).toBe(false)
    expect(templateLibraryRequiresProjectCreation(null)).toBe(false)
  })
})
