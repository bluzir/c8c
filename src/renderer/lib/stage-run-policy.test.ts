import { describe, expect, it } from "vitest"
import type { WorkflowTemplate } from "@shared/types"
import type { WorkflowTemplateRunContext } from "./workflow-entry"
import {
  contextAutoRunsOnContinue,
  contextRequiresStartApproval,
  templateAutoRunsOnContinue,
  templateRequiresStartApproval,
} from "./stage-run-policy"

function createTemplate(tags: string[] = []): WorkflowTemplate {
  return {
    id: "template-1",
    name: "Template",
    description: "",
    stage: "operations",
    emoji: "T",
    headline: "",
    how: "",
    input: "",
    output: "",
    steps: [],
    executionPolicy: {
      tags,
    },
    workflow: {
      version: 1,
      name: "Template",
      description: "",
      defaults: {},
      nodes: [],
      edges: [],
    },
  }
}

function createContext(tags: string[] = []): WorkflowTemplateRunContext {
  return {
    templateId: "template-1",
    templateName: "Template",
    workflowPath: null,
    workflowName: "Template",
    source: "template",
    executionPolicy: {
      tags,
    },
  }
}

describe("stage run policy", () => {
  it("requires start approval when the template has a human gate tag", () => {
    expect(
      templateRequiresStartApproval(createTemplate(["human_gate_required"])),
    ).toBe(true)
    expect(
      contextRequiresStartApproval(createContext(["human_gate_required"])),
    ).toBe(true)
  })

  it("does not require start approval without a human gate tag", () => {
    expect(
      templateRequiresStartApproval(createTemplate(["review_gates"])),
    ).toBe(false)
    expect(contextRequiresStartApproval(createContext(["review_gates"]))).toBe(
      false,
    )
    expect(templateRequiresStartApproval(null)).toBe(false)
    expect(contextRequiresStartApproval(null)).toBe(false)
  })

  it("auto-runs continuation only for non-gated templates", () => {
    expect(templateAutoRunsOnContinue(createTemplate(["review_gates"]))).toBe(
      true,
    )
    expect(
      templateAutoRunsOnContinue(createTemplate(["human_gate_required"])),
    ).toBe(false)
    expect(templateAutoRunsOnContinue(null)).toBe(false)
    expect(contextAutoRunsOnContinue(createContext(["review_gates"]))).toBe(
      true,
    )
    expect(
      contextAutoRunsOnContinue(createContext(["human_gate_required"])),
    ).toBe(false)
    expect(contextAutoRunsOnContinue(null)).toBe(false)
  })
})
