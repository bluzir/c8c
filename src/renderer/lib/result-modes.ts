import type {
  ProjectInspectionKind,
  ResultModeDefinition,
  ResultModeId,
  WorkflowTemplate,
  WorkflowTemplateStage,
} from "@shared/types"
import type { WorkflowCreatePromptScaffold } from "@/lib/workflow-create-prompt"
import {
  isContentTemplate,
  isMarketingTemplate,
  isProductTemplate,
} from "@/lib/template-filters"

export interface WorkflowResultMode extends ResultModeDefinition {
  packIds?: string[]
  templateIds?: string[]
  stagePreferences?: WorkflowTemplateStage[]
  startTemplateId?: string
  startActionLabel?: string
  guidedPath?: string[]
  runtimeLine?: string
  composerPlaceholder: string
  scaffoldPlaceholders: WorkflowCreatePromptScaffold
}

export interface WorkflowResultModeQuickStart {
  templateId: string
  label: string
  summary: string
  intentLabel: string
  recommended?: boolean
}

export interface ResolvedWorkflowResultModeQuickStart extends WorkflowResultModeQuickStart {
  template: WorkflowTemplate
}

const DEVELOPMENT_PACK_IDS = new Set(["delivery-foundation", "gstack-team"])

const DEVELOPMENT_TEMPLATE_IDS = new Set([
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
])

const CONTENT_PACK_IDS = new Set(["content-factory-alpha"])

const MARKETING_PACK_IDS = new Set(["ai-cmo"])

const COURSES_PACK_IDS = new Set(["courses-factory-alpha"])

const CONTENT_TEMPLATE_IDS = new Set([
  "content-trend-watch",
  "content-idea-backlog",
  "content-editorial-calendar",
  "content-post-calendar",
  "content-draft-post",
  "content-ready-posts",
  "content-distribution-bundle",
  "content-qa-review",
  "content-repurposing-factory",
  "copy-quality-pipeline",
  "content-pipeline",
  "predictable-text-factory",
])

const MARKETING_TEMPLATE_IDS = new Set([
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
])

const COURSES_TEMPLATE_IDS = new Set([
  "courses-audience-offer",
  "courses-curriculum-map",
  "courses-lesson-system",
  "courses-trigger-playbook",
  "courses-launch-assets",
])

const DEVELOPMENT_METADATA_TOKENS = [
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
]

const CONTENT_METADATA_TOKENS = [
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
]

const MARKETING_METADATA_TOKENS = [
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
]

const COURSES_METADATA_TOKENS = [
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
]

const COURSES_STAGE_TOKENS = [
  "audience",
  "offer",
  "lesson",
  "curriculum",
  "launch",
]

const QUICK_STARTS_BY_MODE: Partial<
  Record<ResultModeId, WorkflowResultModeQuickStart[]>
> = {
  content: [
    {
      templateId: "content-trend-watch",
      label: "Watch trends",
      summary:
        "Gather signals, themes, and launches in your space before planning content.",
      intentLabel: "Plan it",
    },
    {
      templateId: "content-draft-post",
      label: "Draft a post",
      summary:
        "Turn a topic or calendar slot into a channel-ready draft with voice control.",
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
      intentLabel: "Do it",
    },
  ],
  development: [
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
}

function getDevelopmentCreateQuickStartPresentation(
  templateId: string,
  projectKind?: ProjectInspectionKind | null,
): Pick<
  WorkflowResultModeQuickStart,
  "label" | "summary" | "intentLabel"
> | null {
  switch (projectKind) {
    case "greenfield_empty":
    case "greenfield_scaffold":
      if (templateId === "delivery-shape-project") {
        return {
          label: "Build from brief",
          summary:
            "Turn the brief into a scoped build path and move toward a working result.",
          intentLabel: "Do it",
        }
      }
      if (templateId === "delivery-plan-phase") {
        return {
          label: "Plan from brief",
          summary:
            "Turn the brief into a concrete plan without forcing implementation.",
          intentLabel: "Plan it",
        }
      }
      return null
    case "existing_repo":
      if (templateId === "delivery-map-codebase") {
        return {
          label: "Understand the current app",
          summary:
            "Orient on the current codebase when you need context before changing it.",
          intentLabel: "Do it",
        }
      }
      if (templateId === "delivery-shape-project") {
        return {
          label: "Change the app",
          summary:
            "Turn the repo context and desired outcome into a concrete change plan.",
          intentLabel: "Do it",
        }
      }
      if (templateId === "delivery-plan-phase") {
        return {
          label: "Plan the change",
          summary:
            "Take the scoped work and turn it into an execution-ready plan.",
          intentLabel: "Plan it",
        }
      }
      return null
    case "review_ready":
      if (templateId === "delivery-review-phase") {
        return {
          label: "Review before ship",
          summary:
            "Check the current work, surface gaps, and decide what must change before verification.",
          intentLabel: "Review it",
        }
      }
      if (templateId === "delivery-map-codebase") {
        return {
          label: "Understand the current app",
          summary:
            "Orient on the current codebase when you need context before changing it.",
          intentLabel: "Do it",
        }
      }
      if (templateId === "delivery-shape-project") {
        return {
          label: "Change the app",
          summary:
            "Turn the repo context and desired outcome into a concrete change plan.",
          intentLabel: "Do it",
        }
      }
      if (templateId === "delivery-plan-phase") {
        return {
          label: "Plan the change",
          summary:
            "Turn the reviewed context into a concrete execution plan before implementation starts.",
          intentLabel: "Plan it",
        }
      }
      return null
    default:
      if (templateId === "delivery-shape-project") {
        return {
          label: "Build from brief",
          summary:
            "Turn the desired outcome into a scoped build path with visible checkpoints.",
          intentLabel: "Do it",
        }
      }
      if (templateId === "delivery-map-codebase") {
        return {
          label: "Understand the current app",
          summary:
            "Orient on the current codebase when you need context before changing it.",
          intentLabel: "Do it",
        }
      }
      if (templateId === "delivery-plan-phase") {
        return {
          label: "Plan the change",
          summary:
            "Turn the desired outcome into a concrete plan without jumping straight to implementation.",
          intentLabel: "Plan it",
        }
      }
      if (templateId === "delivery-review-phase") {
        return {
          label: "Review before ship",
          summary:
            "Review the current work, surface concrete gaps, and prepare it for final verification.",
          intentLabel: "Review it",
        }
      }
      return null
  }
}

export function getResultModeQuickStartOptions(
  modeId: ResultModeId,
): WorkflowResultModeQuickStart[] {
  return [...(QUICK_STARTS_BY_MODE[modeId] || [])]
}

export function prioritizeDevelopmentCreateQuickStarts<
  T extends { templateId: string },
>(quickStarts: T[], projectKind?: ProjectInspectionKind | null): T[] {
  if (quickStarts.length === 0) return []

  const templateIds =
    projectKind === "review_ready"
      ? [
          "delivery-review-phase",
          "delivery-shape-project",
          "delivery-plan-phase",
          "delivery-map-codebase",
        ]
      : projectKind === "existing_repo"
        ? [
            "delivery-shape-project",
            "delivery-plan-phase",
            "delivery-map-codebase",
          ]
        : projectKind === "greenfield_empty" ||
            projectKind === "greenfield_scaffold"
          ? ["delivery-shape-project", "delivery-plan-phase"]
          : [
              "delivery-shape-project",
              "delivery-map-codebase",
              "delivery-plan-phase",
            ]

  const quickStartById = new Map(
    quickStarts.map((quickStart) => [quickStart.templateId, quickStart]),
  )
  return templateIds.flatMap((templateId) => {
    const quickStart = quickStartById.get(templateId)
    return quickStart ? [quickStart] : []
  })
}

export function presentDevelopmentCreateQuickStarts<
  T extends WorkflowResultModeQuickStart,
>(quickStarts: T[], projectKind?: ProjectInspectionKind | null): T[] {
  return quickStarts.map((quickStart) => {
    const presentation = getDevelopmentCreateQuickStartPresentation(
      quickStart.templateId,
      projectKind,
    )
    if (!presentation) return quickStart
    return {
      ...quickStart,
      ...presentation,
    } as T
  })
}

export function presentDevelopmentCreateRouteOptions<
  T extends { templateId: string; label: string; intentLabel?: string },
>(options: T[], projectKind?: ProjectInspectionKind | null): T[] {
  return options.map((option) => {
    const presentation = getDevelopmentCreateQuickStartPresentation(
      option.templateId,
      projectKind,
    )
    if (!presentation) return option
    return {
      ...option,
      label: presentation.label,
      intentLabel: presentation.intentLabel,
    }
  })
}

function compactText(values: Array<string | undefined | null>): string {
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .join(" ")
}

function metadataText(template: WorkflowTemplate): string {
  return compactText([
    template.id,
    template.name,
    template.description,
    template.headline,
    template.how,
    template.input,
    template.output,
    template.useWhen,
    template.pack?.id,
    template.pack?.label,
    template.executionPolicy?.summary,
    template.executionPolicy?.description,
    template.executionPolicy?.tags?.join(" "),
  ]).toLowerCase()
}

function metadataIncludesAny(text: string, tokens: string[]) {
  return tokens.some((token) => text.includes(token))
}

export const RESULT_MODES: WorkflowResultMode[] = [
  {
    id: "development",
    label: "Dev",
    emoji: "🧩",
    summary:
      "Start from the result you want, then let the system route through the right dev path with visible checkpoints.",
    useFor:
      "Build from brief, change the current app, plan the next change, review current work, and verify completion.",
    youProvide: "A repo, feature brief, bug, PRD, or delivery goal.",
    youGetFirst: "Codebase map, project shape, or build plan.",
    userRole:
      "Approve scope, risky execution, and quality at a few high-leverage checkpoints.",
    packIds: ["delivery-foundation", "gstack-team"],
    templateIds: Array.from(DEVELOPMENT_TEMPLATE_IDS),
    stagePreferences: ["research", "strategy", "code", "operations"],
    startTemplateId: "delivery-map-codebase",
    startActionLabel: "Start from request",
    guidedPath: ["Understand", "Plan", "Build", "Review", "Check"],
    runtimeLine: "Chooses the right path after you submit.",
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
  },
  {
    id: "content",
    label: "Content",
    emoji: "✍️",
    summary:
      "Turn ideas into posts, calendars, and publishable content with voice and quality control.",
    useFor:
      "Posts, newsletters, editorial calendars, trend research, content repurposing, and quality review.",
    youProvide:
      "A topic, trend brief, audience, tone of voice rules, or existing material to repurpose.",
    youGetFirst: "Trend digest, editorial calendar, or draft post.",
    userRole: "Approve voice, angle, and quality before publishing.",
    packIds: ["content-factory-alpha"],
    templateIds: Array.from(CONTENT_TEMPLATE_IDS),
    stagePreferences: ["content", "research", "strategy"],
    startTemplateId: "content-trend-watch",
    startActionLabel: "Start from request",
    guidedPath: ["Understand", "Plan", "Build", "Check", "Ship"],
    runtimeLine: "Chooses the right path after you submit.",
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
  },
  {
    id: "marketing",
    label: "Marketing",
    emoji: "📣",
    summary:
      "Research a market, choose angles, and turn them into campaigns, pages, or growth loops.",
    useFor:
      "Research, positioning, SEO, messaging, outreach, landing pages, and marketing audits.",
    youProvide:
      "A product, market, audience, channel, competitor set, or growth question.",
    youGetFirst: "Segment map, growth thesis, or campaign plan.",
    userRole:
      "Approve audience choice, angle, and sample quality before scaling.",
    packIds: ["ai-cmo"],
    templateIds: Array.from(MARKETING_TEMPLATE_IDS),
    stagePreferences: ["research", "strategy", "outreach"],
    startTemplateId: "segment-research-gate",
    startActionLabel: "Start guided path",
    guidedPath: ["Research the market", "Choose the angle", "Ship the assets"],
    runtimeLine: "Approves angle and sample quality before scaling.",
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
  },
  {
    id: "courses",
    label: "Courses",
    emoji: "🎓",
    summary:
      "Turn expertise into structured courses, lessons, and launch-ready education assets.",
    useFor:
      "Course material, curriculum design, lesson production, and education launches.",
    youProvide:
      "A topic, expertise, audience, offer, or existing material to structure.",
    youGetFirst: "Audience offer, curriculum map, or lesson system.",
    userRole:
      "Approve structure, lesson quality, and launch assets before shipping.",
    packIds: ["courses-factory-alpha"],
    templateIds: Array.from(COURSES_TEMPLATE_IDS),
    stagePreferences: ["strategy", "content"],
    startTemplateId: "courses-audience-offer",
    startActionLabel: "Start guided path",
    guidedPath: [
      "Clarify audience",
      "Plan the structure",
      "Produce the assets",
    ],
    runtimeLine: "Approves structure and quality before output scales.",
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
  },
]

const MODE_BY_ID = new Map<ResultModeId, WorkflowResultMode>(
  RESULT_MODES.map((mode) => [mode.id, mode]),
)

export function getResultMode(modeId: ResultModeId): WorkflowResultMode {
  return MODE_BY_ID.get(modeId) || RESULT_MODES[0]
}

export function getResultModeQuickStarts(
  templates: WorkflowTemplate[],
  modeId: ResultModeId,
): ResolvedWorkflowResultModeQuickStart[] {
  const quickStarts = getResultModeQuickStartOptions(modeId)
  if (quickStarts.length === 0) return []

  const templatesById = new Map(
    templates.map((template) => [template.id, template]),
  )
  return quickStarts.flatMap((quickStart) => {
    const template = templatesById.get(quickStart.templateId)
    return template ? [{ ...quickStart, template }] : []
  })
}

function templateScoreForMode(
  template: WorkflowTemplate,
  modeId: ResultModeId,
): number {
  const text = metadataText(template)

  if (modeId === "development") {
    let score = 0
    const matchesDevelopment = metadataIncludesAny(
      text,
      DEVELOPMENT_METADATA_TOKENS,
    )
    if (template.pack?.id && DEVELOPMENT_PACK_IDS.has(template.pack.id))
      score += 100
    if (DEVELOPMENT_TEMPLATE_IDS.has(template.id)) score += 80
    if (isProductTemplate(template)) score += 35
    if (template.stage === "code") score += 30
    if (
      (template.stage === "research" ||
        template.stage === "strategy" ||
        template.stage === "operations") &&
      matchesDevelopment
    )
      score += 20
    if (matchesDevelopment) score += 10
    return score
  }

  if (modeId === "content") {
    let score = 0
    const matchesContent = metadataIncludesAny(text, CONTENT_METADATA_TOKENS)
    if (template.pack?.id && CONTENT_PACK_IDS.has(template.pack.id))
      score += 100
    if (CONTENT_TEMPLATE_IDS.has(template.id)) score += 80
    if (isContentTemplate(template)) score += 35
    if (template.stage === "content") score += 30
    if (matchesContent) score += 10
    return score
  }

  if (modeId === "marketing") {
    let score = 0
    const matchesMarketing = metadataIncludesAny(
      text,
      MARKETING_METADATA_TOKENS,
    )
    if (template.pack?.id && MARKETING_PACK_IDS.has(template.pack.id))
      score += 100
    if (MARKETING_TEMPLATE_IDS.has(template.id)) score += 80
    if (isMarketingTemplate(template)) score += 35
    if (
      template.stage === "research" ||
      template.stage === "strategy" ||
      template.stage === "outreach"
    )
      score += 30
    if (matchesMarketing) score += 10
    return score
  }

  if (modeId === "courses") {
    let score = 0
    const matchesCourses = metadataIncludesAny(text, COURSES_METADATA_TOKENS)
    if (template.pack?.id && COURSES_PACK_IDS.has(template.pack.id))
      score += 100
    if (COURSES_TEMPLATE_IDS.has(template.id)) score += 90
    if (matchesCourses) score += 60
    if (
      (template.stage === "strategy" || template.stage === "content") &&
      metadataIncludesAny(text, COURSES_STAGE_TOKENS)
    )
      score += 20
    return score
  }

  return 0
}

export function templateMatchesResultMode(
  template: WorkflowTemplate,
  modeId: ResultModeId,
): boolean {
  return templateScoreForMode(template, modeId) > 0
}

export function filterTemplatesForResultMode(
  templates: WorkflowTemplate[],
  modeId: ResultModeId,
): WorkflowTemplate[] {
  return templates.filter((template) =>
    templateMatchesResultMode(template, modeId),
  )
}

export function prioritizeTemplatesForResultMode(
  templates: WorkflowTemplate[],
  modeId: ResultModeId,
): WorkflowTemplate[] {
  return templates
    .map((template, index) => ({
      template,
      index,
      score: templateScoreForMode(template, modeId),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return left.index - right.index
    })
    .map((entry) => entry.template)
}

export function splitTemplatesForResultMode(
  templates: WorkflowTemplate[],
  modeId: ResultModeId,
) {
  const prioritizedModeTemplates = prioritizeTemplatesForResultMode(
    templates,
    modeId,
  )
  const quickStarts = getResultModeQuickStarts(prioritizedModeTemplates, modeId)
  const quickStartIds = new Set(
    quickStarts.map((quickStart) => quickStart.template.id),
  )
  const modeTemplates = prioritizedModeTemplates.filter(
    (template) => !quickStartIds.has(template.id),
  )
  const otherTemplates = templates.filter(
    (template) => !templateMatchesResultMode(template, modeId),
  )

  return {
    quickStarts,
    modeTemplates,
    otherTemplates,
  }
}
