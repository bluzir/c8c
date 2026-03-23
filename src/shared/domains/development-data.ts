import type { DomainDefinition } from "./types"

export const developmentDomain: Omit<DomainDefinition, "scoreTemplate"> = {
  id: "development",
  label: "Dev",
  emoji: "\u{1F9E9}",
  primaryDomain: true,

  // Display
  summary:
    "Start from the result you want, then let the system route through the right dev path with visible checkpoints.",
  useFor:
    "Build from brief, change the current app, plan the next change, review current work, and verify completion.",
  youProvide: "A repo, feature brief, bug, PRD, or delivery goal.",
  youGetFirst: "Codebase map, project shape, or build plan.",
  userRole:
    "Approve scope, risky execution, and quality at a few high-leverage checkpoints.",
  composerPlaceholder:
    "Describe what you want by the end. Add repo context and delivery constraints if they matter...",
  scaffoldPlaceholders: {
    goal: "What product or feature outcome should this flow drive?",
    input: "Repository path, issue, PRD, user flow, or technical context.",
    constraints:
      "Stack constraints, deadlines, rollout risks, testing bar, design constraints, or delivery realities.",
    successCriteria:
      "What would make this feel genuinely ready to ship, verify, or review?",
  },
  guidedPath: ["Understand", "Plan", "Build", "Review", "Check"],
  startTemplateId: "delivery-map-codebase",
  startActionLabel: "Start from request",
  runtimeLine: "Chooses the right path after you submit.",

  // Routing
  guidedRouting: true,
  bannedEntryTemplateIds: new Set([
    "delivery-implement-phase",
    "delivery-verify-phase",
    "gstack-preflight-gate",
  ]),

  // Templates + Scoring
  packIds: ["delivery-foundation", "gstack-team"],
  templateIds: new Set([
    "delivery-map-codebase",
    "delivery-shape-project",
    "delivery-plan-phase",
    "delivery-implement-phase",
    "delivery-review-phase",
    "delivery-research-phase",
    "delivery-verify-phase",
    "full-stack-code-audit",
    "cto-product-spec",
    "cto-optimise-audit",
    "ux-ui-polish-audit",
    "playwright-visual-audit",
    "design-code-test",
    "deep-research",
    "impeccable-ui-pipeline",
    "gstack-feature-squad",
    "gstack-preflight-gate",
    "gstack-web-quality-board",
  ]),
  metadataTokens: [
    "codebase",
    "repository",
    "repo",
    "feature",
    "implementation",
    "verification",
    "spec",
    "audit",
    "bug",
    "architecture",
    "ui audit",
    "design system",
    "roadmap",
    "qa",
    "test",
    "ship",
  ],
  stagePreferences: ["research", "strategy", "code", "operations"],
  quickStarts: [
    {
      templateId: "delivery-map-codebase",
      label: "Understand the current app",
      summary:
        "Orient on the current codebase when you need context before changing it.",
      intentLabel: "Do it",
    },
    {
      templateId: "delivery-shape-project",
      label: "Build from brief",
      summary:
        "Turn a feature brief or messy context into a scoped build path.",
      intentLabel: "Do it",
    },
    {
      templateId: "delivery-plan-phase",
      label: "Plan the change",
      summary:
        "Turn the desired outcome into a concrete plan without jumping straight to implementation.",
      intentLabel: "Plan it",
    },
    {
      templateId: "delivery-review-phase",
      label: "Review before ship",
      summary:
        "Check the current work, surface concrete gaps, and prepare it for final verification.",
      intentLabel: "Review it",
    },
  ],

  // Spine
  templateStageOverrides: {
    "delivery-map-codebase": "shape_map",
    "delivery-shape-project": "shape_map",
    "delivery-plan-phase": "plan",
    "delivery-implement-phase": "implement",
    "delivery-review-phase": "review",
    "delivery-verify-phase": "verify",
    "delivery-investigate-bug": "shape_map",
    "full-stack-code-audit": "review",
    "ux-ui-polish-audit": "review",
    "impeccable-ui-pipeline": "review",
    "playwright-visual-audit": "review",
    "gstack-feature-squad": "shape_map",
    "gstack-web-quality-board": "review",
    "gstack-preflight-gate": "verify",
    "gstack-release-room": "ship",
  },
  spinePackIds: new Set(["delivery-foundation", "gstack-team"]),

  // Intents
  intentsEnabled: false,

  // Config form
  configFields: [
    {
      id: "project_goal",
      label: "Product goal",
      placeholder:
        "Ship a new onboarding loop, pressure-test a feature concept, or clean up a weak area of the product.",
    },
    {
      id: "source_context",
      label: "Product context",
      placeholder:
        "Repository path, issue link, PRD, notes, screenshots, or current product state.",
      type: "textarea",
    },
    {
      id: "quality_bar",
      label: "Quality bar",
      placeholder:
        "Testing expectations, design bar, rollout constraints, or risks that matter here.",
      type: "textarea",
    },
    {
      id: "strategist_checkpoints",
      label: "Decision checkpoints",
      placeholder:
        "Scope approval, architecture review, design sign-off, or other moments where you want control.",
      type: "textarea",
    },
  ],
  configLabels: {
    project_goal: "Product goal",
    source_context: "Product context",
    quality_bar: "Quality bar",
    strategist_checkpoints: "Decision checkpoints",
  },

  // Factory
  factoryFallbackLabel: "Product Lab",
  factoryTitleFieldId: "project_goal",
  factorySuccessFieldId: "quality_bar",
  factoryCheckpoints: [
    "Approve scope and direction",
    "Approve quality before wider execution",
  ],
  qualityPolicy: [
    "Spec-first delivery",
    "Visible verification before complete",
    "Sparse human approvals",
  ],
  caseGenerationRule: "Plan -> implementation tracks",
  successSignal:
    "A plan or implementation path that meets the requested quality bar.",
  buildOutcomeSections: (
    values: Record<string, string>,
  ): Array<{ label: string; value: string }> => {
    const sections: Array<{ label: string; value: string }> = []
    const sourceContext = (values.source_context || "").trim()
    const qualityBar = (values.quality_bar || "").trim()
    if (sourceContext)
      sections.push({ label: "Source context", value: sourceContext })
    if (qualityBar) sections.push({ label: "Quality bar", value: qualityBar })
    return sections
  },
  buildConstraints: (values: Record<string, string>): string[] => {
    return splitLines(values.quality_bar)
  },
}

function splitLines(value: string | undefined | null): string[] {
  const seen = new Set<string>()
  const next: string[] = []
  for (const line of (value || "").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    next.push(trimmed)
  }
  return next
}
