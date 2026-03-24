import type { DomainDefinition } from "./types"

export const marketingDomain: Omit<DomainDefinition, "scoreTemplate"> = {
  id: "marketing",
  label: "Marketing",
  emoji: "\u{1F4E3}",

  // Display
  summary:
    "Research a market, choose angles, and turn them into campaigns, pages, or growth loops.",
  useFor:
    "Research, positioning, SEO, messaging, outreach, landing pages, and marketing audits.",
  youProvide:
    "A product, market, audience, channel, competitor set, or growth question.",
  youGetFirst: "Segment map, growth thesis, or campaign plan.",
  userRole:
    "Approve audience choice, angle, and sample quality before scaling.",
  composerPlaceholder:
    "Describe the marketing result, audience, channel, and any brand constraints...",
  scaffoldPlaceholders: {
    goal: "What marketing outcome should this flow create?",
    input:
      "Product context, market notes, competitors, audience signals, links, or campaign context.",
    constraints:
      "Channels, brand rules, approved angles, timing, or budget realities.",
    successCriteria:
      "What would make the strategy or assets clearly useful, grounded, and worth shipping?",
  },
  guidedPath: ["Understand", "Plan", "Build", "Check", "Ship"],
  startTemplateId: "segment-research-gate",
  startActionLabel: "Start from request",
  runtimeLine: "Approves angle and sample quality before scaling.",

  // Routing
  guidedRouting: true,
  bannedEntryTemplateIds: new Set<string>(),

  // Templates + Scoring
  packIds: ["ai-cmo"],
  templateIds: new Set([
    "competitor-ad-intelligence",
    "lead-research-machine",
    "segment-research-gate",
    "seed-account-map-pipeline",
    "vertical-pain-to-target-list",
    "raw-list-to-verified-contacts",
    "segmented-outreach-launchpad",
    "new-vertical-to-live-campaign",
    "cold-outreach-pipeline",
    "landing-audit-loop",
    "landing-page-generator",
    "indispensable-jtbd-pipeline",
    "irresistible-resonance-pipeline",
    "twitter-growth-machine",
  ]),
  metadataTokens: [
    "marketing",
    "growth",
    "seo",
    "geo",
    "reddit",
    "hacker news",
    "campaign",
    "landing page",
    "positioning",
    "messaging",
    "outreach",
    "lead",
    "prospect",
    "segment",
    "audience",
    "jtbd",
    "competitive",
    "ad ",
    "ads",
  ],
  stagePreferences: ["research", "strategy", "outreach"],
  quickStarts: [
    {
      templateId: "segment-research-gate",
      label: "Research a segment",
      summary: "Validate a market segment with research gates.",
      intentLabel: "Do it",
    },
    {
      templateId: "landing-page-generator",
      label: "Build a landing page",
      summary: "Generate landing page copy from positioning.",
      intentLabel: "Do it",
    },
    {
      templateId: "indispensable-jtbd-pipeline",
      label: "Map jobs to be done",
      summary: "Research and map customer jobs, pains, and gains.",
      intentLabel: "Plan it",
    },
    {
      templateId: "cold-outreach-pipeline",
      label: "Build outreach pipeline",
      summary: "Create targeted outreach sequences.",
      intentLabel: "Do it",
    },
  ],

  // Spine
  templateStageOverrides: {},
  spinePackIds: new Set<string>(),

  // Intents
  intentsEnabled: true,

  // Config form
  configFields: [
    {
      id: "content_goal",
      label: "Marketing goal",
      placeholder:
        "Validate a segment, shape a GTM angle, plan SEO content, or build a launch campaign.",
    },
    {
      id: "channel_and_audience",
      label: "Market and audience",
      placeholder:
        "Who this is for, where they live, and which channels or surfaces matter most.",
      type: "textarea",
    },
    {
      id: "tone_of_voice",
      label: "Angles and constraints",
      placeholder:
        "Approved angles, banned claims, tone constraints, brand rules, or no-slop requirements.",
      type: "textarea",
    },
    {
      id: "volume_and_quality",
      label: "Success signal",
      placeholder:
        "What output you need first and what would make it strategically useful.",
      type: "textarea",
    },
  ],
  configLabels: {
    content_goal: "Marketing goal",
    channel_and_audience: "Market and audience",
    tone_of_voice: "Angles and constraints",
    volume_and_quality: "Success signal",
  },

  // Factory
  factoryFallbackLabel: "Marketing Lab",
  factoryTitleFieldId: "content_goal",
  factorySuccessFieldId: "volume_and_quality",
  factoryCheckpoints: [
    "Approve audience and angle",
    "Approve sample asset quality",
  ],
  qualityPolicy: [
    "Evidence-first market research",
    "Angle before asset production",
    "Human review before scaling",
  ],
  caseGenerationRule: "Research brief -> campaign or asset tracks",
  successSignal:
    "A grounded market angle, campaign plan, or asset pack that is ready for review.",
  buildOutcomeSections: (
    values: Record<string, string>,
  ): Array<{ label: string; value: string }> => {
    const sections: Array<{ label: string; value: string }> = []
    const channelAndAudience = (values.channel_and_audience || "").trim()
    const toneOfVoice = (values.tone_of_voice || "").trim()
    const volumeAndQuality = (values.volume_and_quality || "").trim()
    if (channelAndAudience)
      sections.push({
        label: "Channel and audience",
        value: channelAndAudience,
      })
    if (toneOfVoice)
      sections.push({ label: "Tone of voice", value: toneOfVoice })
    if (volumeAndQuality)
      sections.push({
        label: "Volume and quality bar",
        value: volumeAndQuality,
      })
    return sections
  },
  buildConstraints: (values: Record<string, string>): string[] => {
    return [
      ...splitLines(values.tone_of_voice),
      ...splitLines(values.volume_and_quality),
    ]
  },
  buildAudience: (values: Record<string, string>): string | undefined => {
    const channelAndAudience = (values.channel_and_audience || "").trim()
    return channelAndAudience || undefined
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
