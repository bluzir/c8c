import type { DomainDefinition } from "./types"

export const contentDomain: Omit<DomainDefinition, "scoreTemplate"> = {
  id: "content",
  label: "Content",
  emoji: "\u270F\uFE0F",

  // Display
  summary:
    "Turn ideas into posts, calendars, and publishable content with voice and quality control.",
  useFor:
    "Posts, newsletters, editorial calendars, trend research, content repurposing, and quality review.",
  youProvide:
    "A topic, trend brief, audience, tone of voice rules, or existing material to repurpose.",
  youGetFirst: "Trend digest, editorial calendar, or draft post.",
  userRole: "Approve voice, angle, and quality before publishing.",
  composerPlaceholder:
    "Describe the content you want — a post, a calendar, a trend digest, a strategy. Add audience and tone constraints if they matter...",
  scaffoldPlaceholders: {
    goal: "What content outcome should this flow create?",
    input:
      "Topic, trend brief, audience context, tone rules, or existing material to repurpose.",
    constraints:
      "Tone of voice, no-slop rules, channel format, publishing cadence, or brand constraints.",
    successCriteria:
      "What would make the content feel specific, on-voice, and ready to publish?",
  },
  guidedPath: ["Understand", "Plan", "Build", "Check", "Ship"],
  startTemplateId: "content-trend-watch",
  startActionLabel: "Start from request",
  runtimeLine: "Chooses the right path after you submit.",

  // Routing
  guidedRouting: true,
  bannedEntryTemplateIds: new Set([
    "content-ready-posts",
    "content-distribution-bundle",
    "content-editorial-calendar",
    "content-idea-backlog",
  ]),

  // Templates + Scoring
  packIds: ["content-factory-alpha"],
  templateIds: new Set([
    "content-trend-watch",
    "content-idea-backlog",
    "content-editorial-calendar",
    "content-post-drafter",
    "content-ready-posts",
    "content-distribution-bundle",
    "content-qa-review",
    "content-repurposing-factory",
    "copy-quality-pipeline",
    "content-pipeline",
    "predictable-text-factory",
  ]),
  metadataTokens: [
    "content",
    "post",
    "copy",
    "editorial",
    "newsletter",
    "draft",
    "publish",
    "trend",
    "calendar",
    "repurpose",
    "tone of voice",
    "slop",
    "blog",
    "social",
  ],
  stagePreferences: ["content", "research", "strategy"],
  quickStarts: [
    {
      templateId: "content-trend-watch",
      label: "Watch trends",
      summary:
        "Gather signals, themes, and launches in your space before planning content.",
      intentLabel: "Plan it",
    },
    {
      templateId: "content-post-drafter",
      label: "Draft posts",
      summary:
        "Split a source document into topics and draft one post per topic, merged into a single file.",
      intentLabel: "Do it",
    },
    {
      templateId: "content-qa-review",
      label: "Review content quality",
      summary:
        "Check a draft for slop, tone consistency, and channel fit before publishing.",
      intentLabel: "Review it",
    },
    {
      templateId: "content-pipeline",
      label: "Build content strategy",
      summary:
        "Turn a product brief into positioning, messaging, and content plan.",
      intentLabel: "Do it / Plan it",
      intentValues: ["do", "plan"],
    },
  ],
  routeDestinations: [
    {
      templateId: "content-trend-watch",
      label: "Watch trends",
      summary:
        "Gather signals, themes, and launches in your space before planning content.",
      intentLabel: "Plan it",
    },
    {
      templateId: "content-post-drafter",
      label: "Draft posts",
      summary:
        "Split a source document into topics and draft one post per topic, merged into a single file.",
      intentLabel: "Do it",
    },
    {
      templateId: "content-qa-review",
      label: "Review content quality",
      summary:
        "Check a draft for slop, tone consistency, and channel fit before publishing.",
      intentLabel: "Review it",
    },
    {
      templateId: "content-pipeline",
      label: "Build content strategy",
      summary:
        "Turn a product brief into positioning, messaging, and content plan.",
      intentLabel: "Do it / Plan it",
      intentValues: ["do", "plan"],
    },
    {
      templateId: "content-repurposing-factory",
      label: "Repurpose content",
      summary:
        "Turn one strong source piece into channel-ready variants without rewriting from scratch.",
      intentLabel: "Do it",
    },
    {
      templateId: "predictable-text-factory",
      label: "Generate text",
      summary:
        "Write structured long-form or batch copy from a brief with quality checks.",
      intentLabel: "Do it",
    },
    {
      templateId: "copy-quality-pipeline",
      label: "Check copy quality",
      summary:
        "Clean up existing copy for clarity, specificity, and anti-slop quality.",
      intentLabel: "Review it",
    },
  ],

  // Spine
  templateStageOverrides: {
    "content-trend-watch": "shape_map",
    "content-post-drafter": "implement",
    "content-qa-review": "verify",
    "content-ready-posts": "ship",
    "content-repurposing-factory": "implement",
    "content-pipeline": "ship",
    "content-editorial-calendar": "plan",
    "content-idea-backlog": "shape_map",
    "content-distribution-bundle": "ship",
    "predictable-text-factory": "implement",
    "copy-quality-pipeline": "verify",
  },
  spinePackIds: new Set(["content-factory-alpha"]),

  // Intents
  intentsEnabled: true,

  // Config form
  configFields: [
    {
      id: "content_goal",
      label: "Content goal",
      placeholder:
        "Write posts, build a content calendar, research trends, or review existing drafts.",
    },
    {
      id: "audience",
      label: "Audience",
      placeholder:
        "Who reads this — founders, developers, marketers — and where they see it.",
      type: "textarea",
    },
    {
      id: "tone_of_voice",
      label: "Tone and constraints",
      placeholder:
        "Tone of voice rules, no-slop requirements, brand constraints, or channel format.",
      type: "textarea",
    },
    {
      id: "volume_and_quality",
      label: "Success signal",
      placeholder:
        "What good content looks like for this — specific, on-voice, publishable without rewrites.",
      type: "textarea",
    },
  ],
  configLabels: {
    content_goal: "Content goal",
    audience: "Audience",
    tone_of_voice: "Tone and constraints",
    volume_and_quality: "Success signal",
  },

  // Factory
  factoryFallbackLabel: "Content Lab",
  factoryTitleFieldId: "course_outcome",
  factorySuccessFieldId: "volume_and_quality",
  factoryCheckpoints: ["Approve voice and angle", "Approve draft quality"],
  qualityPolicy: [
    "Voice-locked drafting",
    "Evidence-first trend research",
    "Human publish approval",
  ],
  caseGenerationRule: "Trend research -> editorial plan -> drafts",
  successSignal:
    "Publishable content that is on-voice, specific, and ready for review.",
  buildOutcomeSections: (
    values: Record<string, string>,
  ): Array<{ label: string; value: string }> => {
    const sections: Array<{ label: string; value: string }> = []
    const audience = (values.audience || "").trim()
    const toneOfVoice = (values.tone_of_voice || "").trim()
    const volumeAndQuality = (values.volume_and_quality || "").trim()
    if (audience) sections.push({ label: "Audience", value: audience })
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
    const audience = (values.audience || "").trim()
    return audience || undefined
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
