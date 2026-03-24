import type { DomainDefinition } from "./types"

export const researchDomain: Omit<DomainDefinition, "scoreTemplate"> = {
  id: "research",
  label: "Research",
  emoji: "\u{1F50D}",

  // Display
  summary:
    "Gather and analyze external information — trends, competitors, segments, positioning, or any decision that needs data.",
  useFor:
    "Deep research, trend monitoring, competitor intelligence, segment analysis, JTBD research, and market positioning.",
  youProvide:
    "A research question, decision context, market, competitor set, or topic to investigate.",
  youGetFirst: "Research brief, trend digest, or competitive analysis.",
  userRole: "Approve research scope and review findings before synthesis.",
  composerPlaceholder:
    "Describe what you want to research — trends, competitors, market segments, positioning, or a decision you need data for...",
  scaffoldPlaceholders: {
    goal: "What research outcome should this flow create?",
    input:
      "Topic, market, competitors, segments, or decision context to investigate.",
    constraints:
      "Scope boundaries, preferred sources, data types, or depth requirements.",
    successCriteria:
      "What would make the research grounded, cited, and useful for decision-making?",
  },
  guidedPath: ["Understand", "Plan", "Build", "Check", "Ship"],
  startTemplateId: "deep-research",
  startActionLabel: "Start from request",
  runtimeLine: "Chooses the right research path after you submit.",

  // Routing
  guidedRouting: true,
  bannedEntryTemplateIds: new Set<string>(),

  // Templates + Scoring
  packIds: [],
  templateIds: new Set([
    "deep-research",
    "content-trend-watch",
    "segment-research-gate",
    "lead-research-machine",
    "competitor-ad-intelligence",
    "vertical-pain-to-target-list",
    "seed-account-map-pipeline",
    "indispensable-jtbd-pipeline",
    "irresistible-resonance-pipeline",
  ]),
  metadataTokens: [
    "research",
    "trend",
    "competitor",
    "segment",
    "audience",
    "market",
    "positioning",
    "jtbd",
    "lead",
    "analysis",
    "intelligence",
    "deep research",
    "exa",
  ],
  stagePreferences: ["research", "strategy"],
  quickStarts: [
    {
      templateId: "deep-research",
      label: "Deep research",
      summary:
        "Multi-lens research on any topic with parallel investigation and synthesis.",
      intentLabel: "Do it",
    },
    {
      templateId: "content-trend-watch",
      label: "Watch trends",
      summary: "Gather signals, themes, and launches in a topic space.",
      intentLabel: "Plan it",
    },
    {
      templateId: "segment-research-gate",
      label: "Research a segment",
      summary: "Analyze a market segment with validation gates.",
      intentLabel: "Do it",
    },
    {
      templateId: "competitor-ad-intelligence",
      label: "Competitor intelligence",
      summary: "Scan competitor ads, positioning, and messaging.",
      intentLabel: "Do it",
    },
  ],

  // Spine
  templateStageOverrides: {
    "deep-research": "shape_map",
    "content-trend-watch": "shape_map",
    "segment-research-gate": "shape_map",
    "lead-research-machine": "plan",
    "competitor-ad-intelligence": "shape_map",
    "vertical-pain-to-target-list": "plan",
    "seed-account-map-pipeline": "plan",
    "indispensable-jtbd-pipeline": "shape_map",
    "irresistible-resonance-pipeline": "plan",
  },
  spinePackIds: new Set<string>(),

  // Intents
  intentsEnabled: false,

  // Config form
  configFields: [
    {
      id: "research_goal",
      label: "Research goal",
      placeholder:
        "What question do you need answered, or what decision does this research support?",
    },
    {
      id: "scope",
      label: "Scope and sources",
      placeholder:
        "What markets, competitors, segments, or topics to cover. Any preferred sources or data types.",
      type: "textarea",
    },
    {
      id: "output_format",
      label: "Output format",
      placeholder:
        "Decision document, trend digest, segment map, competitive analysis, or other deliverable.",
      type: "textarea",
    },
  ],
  configLabels: {
    research_goal: "Research goal",
    scope: "Scope and sources",
    output_format: "Output format",
  },

  // Factory
  factoryFallbackLabel: "Research Lab",
  factoryTitleFieldId: "research_goal",
  factorySuccessFieldId: "output_format",
  factoryCheckpoints: [
    "Approve research scope",
    "Approve findings before synthesis",
  ],
  qualityPolicy: [
    "Evidence-first research",
    "Source attribution required",
    "Human review before conclusions",
  ],
  caseGenerationRule: "Research brief -> investigation tracks",
  successSignal:
    "A grounded research deliverable with cited evidence, ready for decision-making.",
  buildOutcomeSections: (
    values: Record<string, string>,
  ): Array<{ label: string; value: string }> => {
    const sections: Array<{ label: string; value: string }> = []
    const scope = (values.scope || "").trim()
    const outputFormat = (values.output_format || "").trim()
    if (scope) sections.push({ label: "Scope and sources", value: scope })
    if (outputFormat)
      sections.push({ label: "Output format", value: outputFormat })
    return sections
  },
  buildConstraints: (values: Record<string, string>): string[] => {
    return [...splitLines(values.scope), ...splitLines(values.output_format)]
  },
  buildAudience: (values: Record<string, string>): string | undefined => {
    const scope = (values.scope || "").trim()
    return scope || undefined
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
