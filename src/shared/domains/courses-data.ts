import type { DomainDefinition } from "./types"

/** Used by the courses scoring function to boost stage-matched templates. */
export const COURSES_STAGE_TOKENS = [
  "audience",
  "offer",
  "lesson",
  "curriculum",
  "launch",
]

export const coursesDomain: Omit<DomainDefinition, "scoreTemplate"> = {
  id: "courses",
  label: "Courses",
  emoji: "\u{1F393}",

  // Display
  summary:
    "Turn expertise into structured courses, lessons, and launch-ready education assets.",
  useFor:
    "Course material, curriculum design, lesson production, and education launches.",
  youProvide:
    "A topic, expertise, audience, offer, or existing material to structure.",
  youGetFirst: "Audience offer, curriculum map, or lesson system.",
  userRole:
    "Approve structure, lesson quality, and launch assets before shipping.",
  composerPlaceholder:
    "Describe the course you want to create, your audience, and what good looks like...",
  scaffoldPlaceholders: {
    goal: "What education outcome should this flow create?",
    input:
      "Source docs, expertise, audience context, offer material, or existing content.",
    constraints:
      "Lesson length, format, cohort needs, launch timing, or platform constraints.",
    successCriteria:
      "What would make the course structure and lessons feel strong and usable?",
  },
  guidedPath: ["Clarify audience", "Plan the structure", "Produce the assets"],
  startTemplateId: "courses-audience-offer",
  startActionLabel: "Start guided path",
  runtimeLine: "Approves structure and quality before output scales.",

  // Routing
  guidedRouting: false,
  bannedEntryTemplateIds: new Set<string>(),

  // Templates + Scoring
  packIds: ["courses-factory-alpha"],
  templateIds: new Set([
    "courses-audience-offer",
    "courses-curriculum-map",
    "courses-lesson-system",
    "courses-trigger-playbook",
    "courses-launch-assets",
  ]),
  metadataTokens: [
    "course",
    "curriculum",
    "lesson",
    "module",
    "education",
    "workshop",
    "cohort",
    "training",
    "launch bundle",
    "transformation",
    "video",
    "script",
  ],
  stagePreferences: ["strategy", "content"],
  quickStarts: [],

  // Spine
  templateStageOverrides: {},
  spinePackIds: new Set<string>(),

  // Intents
  intentsEnabled: false,

  // Config form
  configFields: [
    {
      id: "course_outcome",
      label: "Course goal",
      placeholder:
        "Build a course, workshop, or structured lesson set from your expertise.",
    },
    {
      id: "audience",
      label: "Audience",
      placeholder:
        "Who this is for, what they already know, and what they should walk away with.",
      type: "textarea",
    },
    {
      id: "format_and_depth",
      label: "Format and source material",
      placeholder:
        "Course, workshop, lesson set, plus the raw material available.",
      type: "textarea",
    },
    {
      id: "launch_needs",
      label: "Launch needs",
      placeholder:
        "Approvals, launch assets, delivery format, or platform constraints.",
      type: "textarea",
    },
  ],
  configLabels: {
    course_outcome: "Course goal",
    audience: "Audience",
    format_and_depth: "Format and source material",
    launch_needs: "Publishing or launch needs",
  },

  // Factory
  factoryFallbackLabel: "Courses Lab",
  factoryTitleFieldId: "course_outcome",
  factorySuccessFieldId: "launch_needs",
  factoryCheckpoints: [
    "Approve structure and curriculum",
    "Approve lesson quality",
  ],
  qualityPolicy: [
    "Structure before content",
    "Lesson quality gates",
    "Human launch approval",
  ],
  caseGenerationRule: "Curriculum plan -> lesson production",
  successSignal: "A structured course with lessons ready for human review.",
  buildOutcomeSections: (
    values: Record<string, string>,
  ): Array<{ label: string; value: string }> => {
    const sections: Array<{ label: string; value: string }> = []
    const audience = (values.audience || "").trim()
    const formatAndDepth = (values.format_and_depth || "").trim()
    const launchNeeds = (values.launch_needs || "").trim()
    if (audience) sections.push({ label: "Audience", value: audience })
    if (formatAndDepth)
      sections.push({ label: "Format and depth", value: formatAndDepth })
    if (launchNeeds)
      sections.push({ label: "Launch needs", value: launchNeeds })
    return sections
  },
  buildConstraints: (values: Record<string, string>): string[] => {
    return [
      ...splitLines(values.format_and_depth),
      ...splitLines(values.launch_needs),
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
