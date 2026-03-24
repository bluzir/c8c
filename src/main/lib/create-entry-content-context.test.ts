import { describe, expect, it } from "vitest"
import type { ArtifactRecord } from "@shared/types"
import {
  buildContentDomainContext,
  inspectContentDomainContext,
  resolveAvailableContentTools,
} from "./create-entry-content-context"

function createArtifact(
  overrides: Partial<ArtifactRecord> = {},
): ArtifactRecord {
  return {
    id: "artifact:1",
    kind: "draft",
    title: "Launch draft",
    projectPath: "/tmp/project",
    workspace: "/tmp/project/.c8c/runs/run-1",
    runId: "run-1",
    relativePath: ".c8c/artifacts/run-1-draft.md",
    contentPath: "/tmp/project/.c8c/artifacts/run-1-draft.md",
    metadataPath: "/tmp/project/.c8c/artifacts/run-1-draft.json",
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  }
}

describe("create-entry-content-context", () => {
  it("deduplicates configured search-capable MCP tools", () => {
    expect(
      resolveAvailableContentTools([
        {
          configured: true,
          requestedToolIds: ["web_search", "exa"],
        },
        {
          configured: true,
          requestedToolIds: ["serper", "web_search"],
        },
        {
          configured: false,
          requestedToolIds: ["serper"],
        },
      ]),
    ).toEqual(["web_search", "exa", "serper"])
  })

  it("builds a content context from artifacts and available tools", () => {
    const context = buildContentDomainContext(
      [
        createArtifact({
          kind: "trend_digest",
          title: "AI agents weekly",
          templateId: "content-trend-watch",
          createdAt: 2_000,
        }),
        createArtifact({
          id: "artifact:2",
          kind: "draft",
          title: "Claude launch post",
          templateId: "content-draft-post",
          createdAt: 3_000,
        }),
        createArtifact({
          id: "artifact:3",
          kind: "qa_report",
          title: "Unrelated review",
          templateId: "ux-ui-polish-audit",
          createdAt: 4_000,
        }),
      ],
      {
        availableTools: ["web_search", "exa", "web_search", "github"],
        now: 10_000,
      },
    )

    expect(context.previousResults).toEqual([
      { kind: "trend_digest", title: "AI agents weekly", ageMs: 8_000 },
      { kind: "draft", title: "Claude launch post", ageMs: 7_000 },
    ])
    expect(context.templatesRun).toEqual([
      "content-trend-watch",
      "content-draft-post",
    ])
    expect(context.availableTools).toEqual(["web_search", "exa"])
  })

  it("merges recorded template history and builtin search availability", async () => {
    const context = await inspectContentDomainContext("/tmp/project", {
      listProjectArtifacts: async () => [
        createArtifact({
          kind: "draft",
          title: "Claude launch post",
          templateId: "content-draft-post",
          createdAt: 3_000,
        }),
      ],
      getSearchToolStatuses: async () => [
        {
          configured: true,
          requestedToolIds: ["exa"],
        },
      ],
      listRecordedTemplateIds: async () => [
        "delivery-plan-phase",
        "content-trend-watch",
        "content-draft-post",
      ],
      webSearchBackend: "builtin",
      now: () => 5_000,
    })

    expect(context.templatesRun).toEqual([
      "content-draft-post",
      "content-trend-watch",
    ])
    expect(context.availableTools).toEqual(["web_search", "exa"])
  })

  it("inspects content context fail-closed when providers error", async () => {
    const context = await inspectContentDomainContext("/tmp/project", {
      listProjectArtifacts: async () => {
        throw new Error("artifacts unavailable")
      },
      getSearchToolStatuses: async () => {
        throw new Error("mcp unavailable")
      },
      listRecordedTemplateIds: async () => {
        throw new Error("history unavailable")
      },
      now: () => 5_000,
    })

    expect(context).toEqual({
      previousResults: [],
      templatesRun: [],
      availableTools: [],
    })
  })
})
