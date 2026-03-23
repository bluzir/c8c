import type { ArtifactRecord, CaseStateRecord } from "@shared/types"
import type { WorkflowTemplateRunContext } from "./workflow-entry"
import { deriveTemplateDisplayLabel } from "./workflow-entry"

export interface WorkflowResumeEntrySummary {
  workLabel: string
  currentStepLabel: string | null
  readyBecauseText: string
  checksText: string
  attachText: string
  latestResultText: string | null
  continueLabel: string
  primaryArtifact: ArtifactRecord | null
}

function formatArtifactList(artifacts: ArtifactRecord[]) {
  if (artifacts.length === 0) return "saved results"
  if (artifacts.length === 1) return artifacts[0].title
  if (artifacts.length === 2)
    return `${artifacts[0].title} and ${artifacts[1].title}`
  return `${artifacts[0].title}, ${artifacts[1].title}, +${artifacts.length - 2} more`
}

function artifactStepLabel(artifact: ArtifactRecord | null) {
  if (!artifact?.templateId) return null
  return (
    deriveTemplateDisplayLabel({
      id: artifact.templateId,
      name: artifact.templateName || artifact.workflowName || artifact.title,
      pack: undefined,
    }) ||
    artifact.templateName ||
    artifact.workflowName ||
    null
  )
}

export function deriveWorkflowResumeEntrySummary({
  context,
  currentStepLabel,
  sourceArtifacts,
  caseState,
  startApprovalRequired,
}: {
  context: WorkflowTemplateRunContext | null
  currentStepLabel: string | null
  sourceArtifacts: ArtifactRecord[]
  caseState?: CaseStateRecord | null
  startApprovalRequired: boolean
}): WorkflowResumeEntrySummary | null {
  const primaryArtifact = sourceArtifacts[0] || null
  const workLabel =
    context?.caseLabel?.trim() || primaryArtifact?.caseLabel || null

  if (!workLabel && sourceArtifacts.length === 0) return null

  const artifactNames = formatArtifactList(sourceArtifacts)
  const primaryArtifactStep = artifactStepLabel(primaryArtifact)
  const readyBecauseText =
    sourceArtifacts.length > 0
      ? sourceArtifacts.length === 1
        ? `Ready because ${primaryArtifact?.title}${primaryArtifactStep ? ` from ${primaryArtifactStep}` : ""} is saved.`
        : `Ready because ${artifactNames} are saved.`
      : "Ready because the saved work is already attached to this step."

  const checksText = startApprovalRequired
    ? "Approval is still required before continue."
    : caseState?.lastGate?.summaryText || "No blocking checks or approvals."

  const latestResultText = primaryArtifact
    ? `Latest result: ${primaryArtifact.title}${primaryArtifactStep ? ` from ${primaryArtifactStep}` : ""}.`
    : null

  return {
    workLabel:
      workLabel ||
      currentStepLabel ||
      context?.workflowName ||
      context?.templateName ||
      "Saved work",
    currentStepLabel,
    readyBecauseText,
    checksText,
    attachText:
      sourceArtifacts.length > 0
        ? artifactNames
        : "Resolved from the saved work context",
    latestResultText,
    continueLabel: currentStepLabel
      ? `Continue to ${currentStepLabel}`
      : "Continue work",
    primaryArtifact,
  }
}
