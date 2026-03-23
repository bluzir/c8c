import type { WorkflowTemplateStage } from "@shared/types"

export const STAGE_ORDER: WorkflowTemplateStage[] = [
  "research",
  "strategy",
  "content",
  "code",
  "outreach",
  "operations",
]

export const STAGE_META: Record<
  WorkflowTemplateStage,
  { label: string; shortLabel: string; description: string }
> = {
  research: {
    label: "Understand a topic",
    shortLabel: "Research",
    description:
      "Research a market, repo, user problem, or decision before acting.",
  },
  strategy: {
    label: "Shape a plan",
    shortLabel: "Strategy",
    description:
      "Turn messy inputs into strategy, positioning, specs, or decisions.",
  },
  content: {
    label: "Create content",
    shortLabel: "Content",
    description:
      "Draft, repurpose, and quality-check content that is ready to publish.",
  },
  code: {
    label: "Build or audit software",
    shortLabel: "Software",
    description:
      "Design, implement, review, or harden software systems and UI.",
  },
  outreach: {
    label: "Find leads and reach out",
    shortLabel: "Outreach",
    description:
      "Research prospects, generate outreach, and prepare go-to-market work.",
  },
  operations: {
    label: "Handle ops work",
    shortLabel: "Ops",
    description:
      "Organize admin, extract structured data, and tame recurring busywork.",
  },
}
