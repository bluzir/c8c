import { describe, expect, it } from "vitest"

import type { ArtifactRecord, WorkflowTemplate } from "@shared/types"
import { selectTemplatesForResultChaining } from "@/lib/result-flow-chaining"

function createArtifact(kind: string): ArtifactRecord {
  return {
    id: `artifact-${kind}`,
    kind,
    title: kind,
    projectPath: "/tmp/project",
    workspace: "/tmp/workspace",
    runId: "run-1",
    relativePath: `.c8c/${kind}.md`,
    contentPath: `/tmp/project/.c8c/${kind}.md`,
    metadataPath: `/tmp/project/.c8c/${kind}.json`,
    createdAt: 1,
    updatedAt: 1,
  }
}

function createTemplate(id: string, contractKinds: string[]): WorkflowTemplate {
  return {
    id,
    name: id,
    description: "",
    stage: "strategy",
    emoji: "x",
    headline: "",
    how: "",
    input: "",
    output: "",
    steps: [],
    contractIn: contractKinds.map((kind) => ({ kind })),
    workflow: {
      version: 1,
      name: id,
      nodes: [],
      edges: [],
    },
  }
}

describe("selectTemplatesForResultChaining", () => {
  it("returns templates whose required artifact contracts are satisfied", () => {
    const templates = [
      createTemplate("plan-from-audit", ["qa_report"]),
      createTemplate("implement-from-plan", ["phase_plan"]),
    ]

    const result = selectTemplatesForResultChaining({
      templates,
      sourceArtifacts: [createArtifact("qa_report")],
    })

    expect(result.map((template) => template.id)).toEqual(["plan-from-audit"])
  })

  it("prefers templates with stronger structural matches", () => {
    const templates = [
      createTemplate("single", ["qa_report"]),
      createTemplate("double", ["qa_report", "phase_plan"]),
    ]

    const result = selectTemplatesForResultChaining({
      templates,
      sourceArtifacts: [
        createArtifact("qa_report"),
        createArtifact("phase_plan"),
      ],
    })

    expect(result.map((template) => template.id)).toEqual(["double", "single"])
  })
})
