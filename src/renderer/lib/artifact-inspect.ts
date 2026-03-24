import type {
  ArtifactRecord,
  CaseStateRecord,
  WorkflowTemplate,
} from "@shared/types"
import {
  deriveTemplateContinuationLabel,
  deriveTemplateDisplayLabel,
  deriveTemplateJobLabel,
} from "./workflow-entry"

export interface ArtifactInspectSummary {
  statusText: string
  savedFromText: string
  sourceText: string
  readyNextText: string
  readyNextLabels: string[]
  latestCheckText: string | null
}

function formatCompactList(labels: string[]) {
  if (labels.length === 0) return null
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels[0]}, ${labels[1]}, +${labels.length - 2} more`
}

function labelForTemplate(template: WorkflowTemplate) {
  return (
    deriveTemplateContinuationLabel(template) ||
    deriveTemplateJobLabel(template) ||
    deriveTemplateDisplayLabel(template) ||
    template.name
  )
}

export function deriveArtifactInspectSummary({
  artifact,
  relatedArtifacts,
  matchingTemplates,
  caseState,
}: {
  artifact: ArtifactRecord
  relatedArtifacts: ArtifactRecord[]
  matchingTemplates: WorkflowTemplate[]
  caseState?: CaseStateRecord | null
}): ArtifactInspectSummary {
  const readyNextLabels = Array.from(
    new Set(
      matchingTemplates
        .map((template) => labelForTemplate(template).trim())
        .filter(Boolean),
    ),
  )
  const sourceText = (artifact.sourceArtifactIds || [])
    .map(
      (sourceId) =>
        relatedArtifacts.find((candidate) => candidate.id === sourceId)?.title,
    )
    .filter((value): value is string => Boolean(value))

  return {
    statusText:
      readyNextLabels.length > 0
        ? `Ready for ${readyNextLabels[0]}${readyNextLabels.length > 1 ? ` and ${readyNextLabels.length - 1} more step${readyNextLabels.length === 2 ? "" : "s"}` : ""}.`
        : "Saved result. No next step is ready from this result alone yet.",
    savedFromText:
      artifact.templateName ||
      artifact.workflowName ||
      "Saved from a previous run",
    sourceText:
      sourceText.length > 0
        ? sourceText.join(" · ")
        : "No upstream results were recorded for this saved result.",
    readyNextText:
      readyNextLabels.length > 0
        ? formatCompactList(readyNextLabels) || ""
        : "No next step is ready from this result alone yet.",
    readyNextLabels,
    latestCheckText: caseState?.lastGate?.summaryText || null,
  }
}
