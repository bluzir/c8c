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

function createTemplate(
  id: string,
  contracts: Array<{ kind: string; required?: boolean }>,
): WorkflowTemplate {
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
    contractIn: contracts.map((contract) => ({
      kind: contract.kind,
      required: contract.required,
    })),
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
      createTemplate("plan-from-audit", [{ kind: "qa_report" }]),
      createTemplate("implement-from-plan", [{ kind: "phase_plan" }]),
    ]

    const result = selectTemplatesForResultChaining({
      templates,
      sourceArtifacts: [createArtifact("qa_report")],
    })

    expect(result.map((template) => template.id)).toEqual(["plan-from-audit"])
  })

  it("prefers templates with stronger structural matches", () => {
    const templates = [
      createTemplate("single", [{ kind: "qa_report" }]),
      createTemplate("double", [{ kind: "qa_report" }, { kind: "phase_plan" }]),
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

  it("surfaces optional-contract templates when they match the result", () => {
    const templates = [
      createTemplate("spec-from-audit", [
        { kind: "audit_report", required: false },
      ]),
      createTemplate("needs-plan", [{ kind: "phase_plan" }]),
    ]

    const result = selectTemplatesForResultChaining({
      templates,
      sourceArtifacts: [createArtifact("audit_report")],
    })

    expect(result.map((template) => template.id)).toEqual(["spec-from-audit"])
  })

  it("keeps fully satisfied required matches ahead of optional-only suggestions", () => {
    const templates = [
      createTemplate("optional-audit-followup", [
        { kind: "audit_report", required: false },
      ]),
      createTemplate("required-plan-followup", [{ kind: "phase_plan" }]),
    ]

    const result = selectTemplatesForResultChaining({
      templates,
      sourceArtifacts: [
        createArtifact("audit_report"),
        createArtifact("phase_plan"),
      ],
    })

    expect(result.map((template) => template.id)).toEqual([
      "required-plan-followup",
      "optional-audit-followup",
    ])
  })
})
