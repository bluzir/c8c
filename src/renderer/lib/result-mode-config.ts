import type { ResultModeId } from "@shared/types"
import { getDomain } from "@shared/domains"
import type { ResultModeConfigField } from "@shared/domains"
import {
  buildWorkflowCreatePrompt,
  type WorkflowCreatePromptScaffold,
} from "@/lib/workflow-create-prompt"
import type { WorkflowResultMode } from "@/lib/result-modes"
import { initDomains } from "@/lib/domain-init"

// Ensure domains are registered before any module-level constants are built.
initDomains()

export type { ResultModeConfigField }

export type ResultModeConfigValues = Record<string, string>

function normalize(value: string | undefined | null) {
  return (value || "").trim()
}

export function getResultModeConfigFields(
  modeId: ResultModeId,
): ResultModeConfigField[] {
  return getDomain(modeId).configFields
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
  const configLabels = getDomain(modeId).configLabels
  return Object.entries(normalized)
    .filter(([, value]) => value.length > 0)
    .map(([id, value]) => ({
      label: configLabels[id] || id,
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
