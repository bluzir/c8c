import type { ResultModeId } from "@shared/types"
import {
  buildWorkflowCreatePrompt,
  type WorkflowCreatePromptScaffold,
} from "@/lib/workflow-create-prompt"
import type { WorkflowResultMode } from "@/lib/result-modes"

export type ResultModeConfigFieldType = "text" | "textarea"

export interface ResultModeConfigField {
  id: string
  label: string
  placeholder: string
  type?: ResultModeConfigFieldType
  helpText?: string
}

export type ResultModeConfigValues = Record<string, string>

const RESULT_MODE_CONFIG_FIELDS: Record<string, ResultModeConfigField[]> = {
  development: [
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
  content: [
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
  marketing: [
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
  courses: [
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
}

const RESULT_MODE_CONFIG_LABELS: Record<string, string> = {
  project_goal: "Product goal",
  source_context: "Product context",
  quality_bar: "Quality bar",
  strategist_checkpoints: "Decision checkpoints",
  content_goal: "Content goal",
  channel_and_audience: "Market and audience",
  tone_of_voice: "Tone and constraints",
  volume_and_quality: "Success signal",
  course_outcome: "Course goal",
  audience: "Audience",
  format_and_depth: "Format and source material",
  launch_needs: "Publishing or launch needs",
}

function normalize(value: string | undefined | null) {
  return (value || "").trim()
}

export function getResultModeConfigFields(
  modeId: ResultModeId,
): ResultModeConfigField[] {
  return RESULT_MODE_CONFIG_FIELDS[modeId] || []
}

export function normalizeResultModeConfig(
  modeId: ResultModeId,
  values?: ResultModeConfigValues | null,
): ResultModeConfigValues {
  const next: ResultModeConfigValues = {}
  for (const field of getResultModeConfigFields(modeId)) {
    next[field.id] = normalize(values?.[field.id])
  }
  return next
}

export function countResultModeConfigFields(
  modeId: ResultModeId,
  values?: ResultModeConfigValues | null,
): number {
  const normalized = normalizeResultModeConfig(modeId, values)
  return Object.values(normalized).filter((value) => value.length > 0).length
}

export function buildResultModeConfigSections(
  modeId: ResultModeId,
  values?: ResultModeConfigValues | null,
): Array<{ label: string; value: string }> {
  const normalized = normalizeResultModeConfig(modeId, values)
  return Object.entries(normalized)
    .filter(([, value]) => value.length > 0)
    .map(([id, value]) => ({
      label: RESULT_MODE_CONFIG_LABELS[id] || id,
      value,
    }))
}

export function buildResultModeSeedInput(
  mode: WorkflowResultMode,
  values: ResultModeConfigValues,
  draftPrompt: string,
  scaffold: WorkflowCreatePromptScaffold,
): string {
  const sections = buildResultModeConfigSections(mode.id, values)
  const basePrompt = buildWorkflowCreatePrompt(draftPrompt, scaffold)

  if (sections.length === 0) {
    if (basePrompt.trim()) return basePrompt
    return [
      `Build a starter flow for the ${mode.label} result mode.`,
      `Focus: ${mode.useFor}`,
      `First useful result: ${mode.youGetFirst}`,
      `Human role: ${mode.userRole}`,
    ].join("\n")
  }

  const lines: string[] = [
    `${mode.label} brief:`,
    `Requested outcome type: ${mode.useFor}`,
    "",
  ]

  for (const section of sections) {
    lines.push(`${section.label}:`, section.value, "")
  }

  if (basePrompt.trim()) {
    lines.push("Additional request context:", basePrompt)
  }

  return lines.join("\n").trim()
}
