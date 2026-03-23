import { describe, expect, it } from "vitest"
import type { WorkflowTemplate } from "@shared/types"
import {
  DEMOTED_DESTINATION_ACCESS_CONTRACTS,
  resolveGuidedTemplateEntryContract,
  resolveProjectRequiredContract,
  splitGuidedTemplateEntryContracts,
} from "@/lib/entry-state-contracts"

function createTemplate(
  overrides: Partial<WorkflowTemplate> = {},
): WorkflowTemplate {
  return {
    id: "delivery-map-codebase",
    name: "Delivery: Map Codebase",
    description: "Map the current codebase.",
    stage: "code",
    emoji: "🧭",
    headline: "Map the current codebase quickly.",
    how: "Inspect the repo before shaping changes.",
    input: "A project folder or codebase path.",
    output: "A codebase map you can build from.",
    steps: ["Inspect repo", "Map architecture"],
    pack: {
      id: "delivery-foundation",
      label: "Delivery",
      journeyStage: "map",
      entrypoint: true,
      recommendedNext: ["delivery-shape-project"],
    },
    workflow: {
      version: 1,
      name: "Delivery: Map Codebase",
      nodes: [],
      edges: [],
    },
    ...overrides,
  }
}

describe("resolveProjectRequiredContract", () => {
  it("blocks project-bound flows when no project is resolved", () => {
    expect(
      resolveProjectRequiredContract({ resolvedProjectPath: null }),
    ).toMatchObject({
      projectRequired: true,
      blockerStatement: "A project is required before this flow can start.",
      actionInstruction: "Select or add one now.",
      primaryActionLabel: "Choose folder",
    })
  })

  it("does not block when a project is already resolved", () => {
    expect(
      resolveProjectRequiredContract({ resolvedProjectPath: "/tmp/project" }),
    ).toMatchObject({
      projectRequired: false,
      resolvedProjectPath: "/tmp/project",
    })
  })
})

describe("guided entry contracts", () => {
  it("treats explicit pack entrypoints as guided entries", () => {
    const template = createTemplate()

    expect(
      resolveGuidedTemplateEntryContract(template, [template]),
    ).toMatchObject({
      entryKind: "guided",
      jobLabel: "Change the current app",
      primaryActionLabel: "Start first stage",
      useWhen: expect.any(String),
      youProvide: "A project folder or codebase path.",
      youGetFirst: "A codebase map you can build from.",
      firstStageLabel: expect.any(String),
    })
  })

  it("falls back to isolated when guided metadata is missing", () => {
    const template = createTemplate({
      id: "ux-ui-polish-audit",
      name: "UX/UI Polish Audit",
      pack: undefined,
    })

    expect(
      resolveGuidedTemplateEntryContract(template, [template]),
    ).toMatchObject({
      entryKind: "isolated",
      primaryActionLabel: "Start this flow",
      stagePath: [],
      stagePathLabel: null,
    })
  })

  it("splits guided entries before isolated entries", () => {
    const guided = createTemplate()
    const isolated = createTemplate({
      id: "ux-ui-polish-audit",
      name: "UX/UI Polish Audit",
      pack: undefined,
    })

    const split = splitGuidedTemplateEntryContracts(
      [guided, isolated],
      [guided, isolated],
    )

    expect(split.guidedEntries.map((entry) => entry.template.id)).toEqual([
      "delivery-map-codebase",
    ])
    expect(split.isolatedEntries.map((entry) => entry.template.id)).toEqual([
      "ux-ui-polish-audit",
    ])
  })
})

describe("demoted destination access contracts", () => {
  it("keeps product-valid destinations reachable through explicit fallback paths", () => {
    expect(DEMOTED_DESTINATION_ACCESS_CONTRACTS.lab).toMatchObject({
      sidebarAccessible: false,
      commandPaletteAccessible: true,
      commandPaletteLabel: "Lab",
    })
    expect(DEMOTED_DESTINATION_ACCESS_CONTRACTS.skills).toMatchObject({
      sidebarAccessible: true,
      commandPaletteAccessible: true,
      commandPaletteLabel: "Skills",
    })
    expect(
      DEMOTED_DESTINATION_ACCESS_CONTRACTS.settings.keyboardShortcutLabel,
    ).toBe("Cmd/Ctrl+,")
  })
})
