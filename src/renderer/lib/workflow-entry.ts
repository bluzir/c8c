import type {
  ArtifactContract,
  ArtifactRecord,
  InputAttachment,
  InputNodeConfig,
  OutputNodeConfig,
  ProjectFactoryDefinition,
  Workflow,
  WorkflowEntrySource,
  WorkflowEntryState,
  WorkflowTemplate,
  WorkflowTemplateRunContext,
} from "@shared/types"

export type {
  WorkflowEntrySource,
  WorkflowEntryState,
  WorkflowTemplateRunContext,
} from "@shared/types"

export function hasSavedWorkContinuationContext(
  context: WorkflowTemplateRunContext | null | undefined,
) {
  return Boolean(context?.sourceArtifactIds?.some((artifactId) => artifactId))
}

export interface WorkflowTemplateCaseOverride {
  caseId: string
  caseLabel?: string
}

export function getRequestedResultFromEntryState(
  entryState: WorkflowEntryState | null | undefined,
) {
  if (!entryState) return ""
  if (
    entryState.contractLabel !== "Requested result" &&
    entryState.contractLabel !== "What you asked for"
  ) {
    return ""
  }
  return entryState.contractText.trim()
}

const DEFAULT_INPUT_PLACEHOLDER =
  "Enter your input text, paste a URL, or describe what to run..."

function collapseWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

function ensureSentence(value: string, fallback: string) {
  const normalized = collapseWhitespace(value)
  if (!normalized) return fallback
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`
}

function lowerFirst(value: string) {
  if (!value) return value
  return value.charAt(0).toLowerCase() + value.slice(1)
}

function titleCaseFromIdentifier(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function stripPackPrefix(name: string, packLabel?: string | null) {
  const trimmedName = collapseWhitespace(name)
  const trimmedPackLabel = collapseWhitespace(packLabel || "")
  if (trimmedPackLabel && trimmedName.startsWith(`${trimmedPackLabel}: `)) {
    return trimmedName.slice(trimmedPackLabel.length + 2).trim()
  }
  return trimmedName
}

function createFactoryCaseId(seed: string) {
  return `case:${seed}:${Date.now().toString(36)}`
}

export function deriveArtifactCaseKey(
  artifact: Pick<ArtifactRecord, "caseId" | "workflowPath" | "runId">,
) {
  if (
    typeof artifact.caseId === "string" &&
    artifact.caseId.trim().length > 0
  ) {
    return artifact.caseId
  }
  return `legacy:${artifact.workflowPath || artifact.runId}`
}

function factorySeed(factoryId: string) {
  return (
    factoryId
      .replace(/^(factory|pack):/i, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "factory"
  )
}

function deriveFactoryIdentity(
  template: WorkflowTemplate,
  sourceArtifacts?: ArtifactRecord[],
  factory?: Pick<ProjectFactoryDefinition, "id" | "label"> | null,
) {
  const sourcedFactory = sourceArtifacts?.find(
    (artifact) =>
      typeof artifact.factoryId === "string" &&
      artifact.factoryId.trim().length > 0,
  )
  if (sourcedFactory?.factoryId) {
    return {
      factoryId: sourcedFactory.factoryId,
      factoryLabel:
        sourcedFactory.factoryLabel ||
        factory?.label ||
        template.pack?.label ||
        template.name,
    }
  }

  if (factory?.id) {
    return {
      factoryId: factory.id,
      factoryLabel: factory.label || template.pack?.label || template.name,
    }
  }

  return {
    factoryId: undefined,
    factoryLabel: undefined,
  }
}

function deriveCaseIdentity(
  template: WorkflowTemplate,
  sourceArtifacts?: ArtifactRecord[],
  factory?: Pick<ProjectFactoryDefinition, "id" | "label"> | null,
  caseOverride?: WorkflowTemplateCaseOverride | null,
) {
  if (caseOverride?.caseId) {
    return {
      caseId: caseOverride.caseId,
      caseLabel: caseOverride.caseLabel || template.name,
    }
  }

  const firstArtifactWithCase = sourceArtifacts?.find(
    (artifact) =>
      typeof artifact.caseId === "string" && artifact.caseId.trim().length > 0,
  )
  if (firstArtifactWithCase?.caseId) {
    return {
      caseId: firstArtifactWithCase.caseId,
      caseLabel: firstArtifactWithCase.caseLabel || template.name,
    }
  }

  const { factoryId } = deriveFactoryIdentity(
    template,
    sourceArtifacts,
    factory,
  )
  if (factoryId) {
    return {
      caseId: createFactoryCaseId(factorySeed(factoryId)),
      caseLabel: template.name,
    }
  }

  return {
    caseId: undefined,
    caseLabel: undefined,
  }
}

const JOURNEY_STAGE_LABELS: Record<string, string> = {
  map: "Map",
  intake: "Intake",
  shape: "Shape",
  research: "Research",
  plan: "Plan",
  execute: "Execute",
  review: "Review",
  verify: "Check",
  operate: "Operate",
}

const TEMPLATE_STAGE_LABELS: Record<string, string> = {
  "delivery-map-codebase": "Understand",
  "delivery-shape-project": "Understand",
  "delivery-investigate-bug": "Understand",
  "gstack-feature-squad": "Understand",
  "delivery-plan-phase": "Plan",
  "delivery-implement-phase": "Build",
  "delivery-review-phase": "Review",
  "delivery-verify-phase": "Check",
  "full-stack-code-audit": "Review",
  "gstack-preflight-gate": "Check",
  "gstack-release-room": "Ship",
  "content-trend-watch": "Understand",
  "content-post-drafter": "Build",
  "content-editorial-calendar": "Plan",
  "content-idea-backlog": "Plan",
  "content-repurposing-factory": "Build",
  "predictable-text-factory": "Build",
  "content-qa-review": "Check",
  "copy-quality-pipeline": "Check",
  "content-ready-posts": "Ship",
  "content-distribution-bundle": "Ship",
  "content-pipeline": "Ship",
}

const TEMPLATE_JOB_LABELS: Record<string, string> = {
  "delivery-map-codebase": "Change the current app",
  "delivery-shape-project": "Build from brief",
  "delivery-investigate-bug": "Investigate the bug",
  "delivery-plan-phase": "Prepare the implementation plan",
  "delivery-implement-phase": "Apply approved changes",
  "delivery-review-phase": "Review before ship",
  "delivery-verify-phase": "Verify completion",
  "gstack-preflight-gate": "Verify completion",
  "gstack-release-room": "Ship approved work",
  "ux-ui-polish-audit": "Audit and polish this UI",
  "impeccable-ui-pipeline": "Improve this UI flow",
  "playwright-visual-audit": "Audit this UI in browser",
}

const TEMPLATE_CONTINUATION_LABELS: Record<string, string> = {
  "delivery-map-codebase": "Understand the current app",
  "delivery-shape-project": "Define the change",
  "delivery-plan-phase": "Plan the change",
  "delivery-implement-phase": "Apply approved changes",
  "delivery-review-phase": "Review before ship",
  "delivery-verify-phase": "Check completion",
  "gstack-preflight-gate": "Check completion",
  "gstack-release-room": "Ship approved work",
  "ux-ui-polish-audit": "Audit this UI",
  "impeccable-ui-pipeline": "Polish this UI",
  "playwright-visual-audit": "Run a visual test",
  "full-stack-code-audit": "Audit the codebase",
}

const TEMPLATE_CONTINUATION_DESCRIPTIONS: Record<string, string> = {
  "delivery-map-codebase": "Explore the current codebase before changing it.",
  "delivery-shape-project":
    "Define what should change before planning or implementation starts.",
  "delivery-plan-phase": "Turn the scoped change into an execution-ready plan.",
  "delivery-implement-phase": "Apply the approved change to the current app.",
  "delivery-review-phase":
    "Review the current work and surface concrete gaps before final checks.",
  "delivery-verify-phase": "Check completion against the expected outcome.",
  "gstack-preflight-gate": "Check completion before moving toward release.",
  "gstack-release-room": "Ship the approved work.",
  "ux-ui-polish-audit": "Audit the current UI and surface concrete UX gaps.",
  "impeccable-ui-pipeline":
    "Improve the current UI flow and polish weak spots.",
  "playwright-visual-audit":
    "Run a browser-based visual check on the current UI.",
  "full-stack-code-audit":
    "Audit the codebase for security, quality, and architecture risks.",
}

const EXECUTION_POLICY_TAG_LABELS: Record<string, string> = {
  evidence_first: "Evidence-first",
  spec_first: "Spec-first",
  small_tasks: "Small tasks",
  fresh_workers: "Fresh workers",
  test_first: "Test-first",
  review_gates: "Review checks",
  isolated_workspace: "Isolated workspace",
  human_gate_required: "Human approval required",
  voice_locked: "Voice-locked",
  no_slop: "No-slop review",
  publish_gate: "Publish approval",
  critique_loops: "Critique loops",
  variant_exploration: "Variant exploration",
  consistency_checks: "Consistency checks",
}

function deriveEntryTitle(name: string | undefined) {
  const normalized = collapseWhitespace(name || "")
  if (
    !normalized ||
    normalized === "new-workflow" ||
    normalized === "new-flow"
  ) {
    return "Runnable flow"
  }
  return normalized
}

export function deriveTemplateUseWhen(template: WorkflowTemplate) {
  const explicitUseWhen = collapseWhitespace(template.useWhen || "")
  if (explicitUseWhen) {
    return ensureSentence(
      explicitUseWhen,
      "You want a ready-to-run flow that you can adapt to this job.",
    )
  }

  const base = collapseWhitespace(
    template.description || template.headline || template.how,
  )
  if (!base) {
    return "You want a ready-to-run flow that you can adapt to this job."
  }
  if (/^(you|when|if)\b/i.test(base)) {
    return ensureSentence(
      base,
      "You want a ready-to-run flow that you can adapt to this job.",
    )
  }
  return ensureSentence(
    `You need to ${lowerFirst(base)}`,
    "You want a ready-to-run flow that you can adapt to this job.",
  )
}

export function deriveTemplateCardCopy(template: WorkflowTemplate) {
  return deriveTemplateUseWhen(template)
}

export function deriveTemplateJourneyStageLabel(template: WorkflowTemplate) {
  const explicitTemplateLabel = TEMPLATE_STAGE_LABELS[template.id]
  if (explicitTemplateLabel) return explicitTemplateLabel
  const stage = template.pack?.journeyStage
  if (!stage) return null
  return JOURNEY_STAGE_LABELS[stage] ?? titleCaseFromIdentifier(stage)
}

export function deriveTemplateContextJourneyStageLabel(
  context?: Pick<WorkflowTemplateRunContext, "templateId" | "pack"> | null,
) {
  if (!context) return null
  const explicitTemplateLabel = TEMPLATE_STAGE_LABELS[context.templateId]
  if (explicitTemplateLabel) return explicitTemplateLabel
  const stage = context.pack?.journeyStage
  if (!stage) return null
  return JOURNEY_STAGE_LABELS[stage] ?? titleCaseFromIdentifier(stage)
}

export function getTemplateRecommendedNext(
  template?: Pick<WorkflowTemplate, "recommendedNext" | "pack"> | null,
) {
  return template?.recommendedNext ?? template?.pack?.recommendedNext ?? []
}

export function getTemplateContextRecommendedNext(
  context?: Pick<WorkflowTemplateRunContext, "recommendedNext" | "pack"> | null,
) {
  return context?.recommendedNext ?? context?.pack?.recommendedNext ?? []
}

export function getTemplateSuggestedTools(
  template?: Pick<WorkflowTemplate, "suggestedTools"> | null,
) {
  return template?.suggestedTools ?? []
}

export function getTemplateContextSuggestedTools(
  context?: Pick<WorkflowTemplateRunContext, "suggestedTools"> | null,
) {
  return context?.suggestedTools ?? []
}

export function deriveTemplateDisplayLabel(
  template?: Pick<WorkflowTemplate, "id" | "name" | "pack"> | null,
) {
  if (!template) return null
  return (
    TEMPLATE_JOB_LABELS[template.id] ||
    stripPackPrefix(template.name, template.pack?.label) ||
    TEMPLATE_STAGE_LABELS[template.id] ||
    deriveTemplateJourneyStageLabel(template as WorkflowTemplate)
  )
}

export function deriveTemplateJobLabel(
  template?: Pick<WorkflowTemplate, "id" | "name" | "pack"> | null,
) {
  if (!template) return null
  return (
    TEMPLATE_JOB_LABELS[template.id] ||
    stripPackPrefix(template.name, template.pack?.label) ||
    null
  )
}

export function deriveTemplateContinuationLabel(
  template?: Pick<WorkflowTemplate, "id" | "name" | "pack"> | null,
) {
  if (!template) return null
  return (
    TEMPLATE_CONTINUATION_LABELS[template.id] ||
    deriveTemplateJobLabel(template) ||
    stripPackPrefix(template.name, template.pack?.label) ||
    null
  )
}

export function deriveTemplateContinuationDescription(
  template?: Pick<
    WorkflowTemplate,
    "id" | "name" | "pack" | "description" | "headline" | "how" | "output"
  > | null,
) {
  if (!template) return null
  const explicit = TEMPLATE_CONTINUATION_DESCRIPTIONS[template.id]
  if (explicit) return explicit

  const fallback = collapseWhitespace(
    template.output ||
      template.description ||
      template.headline ||
      template.how ||
      "",
  )
  return fallback ? ensureSentence(fallback, "") : null
}

export function deriveTemplateContextDisplayLabel(
  context?: Pick<
    WorkflowTemplateRunContext,
    "templateId" | "templateName" | "pack"
  > | null,
) {
  if (!context) return null
  return (
    TEMPLATE_JOB_LABELS[context.templateId] ||
    stripPackPrefix(context.templateName, context.pack?.label) ||
    TEMPLATE_STAGE_LABELS[context.templateId] ||
    deriveTemplateContextJourneyStageLabel(context)
  )
}

export function deriveTemplateContextJobLabel(
  context?: Pick<
    WorkflowTemplateRunContext,
    "templateId" | "templateName" | "pack"
  > | null,
) {
  if (!context) return null
  return (
    TEMPLATE_JOB_LABELS[context.templateId] ||
    stripPackPrefix(context.templateName, context.pack?.label) ||
    null
  )
}

export function deriveTemplateExecutionDisciplineLabels(
  template: WorkflowTemplate,
) {
  const tags = template.executionPolicy?.tags || []
  if (tags.length > 0) {
    return tags.map(
      (tag) => EXECUTION_POLICY_TAG_LABELS[tag] ?? titleCaseFromIdentifier(tag),
    )
  }

  const summary = collapseWhitespace(template.executionPolicy?.summary || "")
  return summary ? [summary] : []
}

export function formatArtifactContractLabel(
  contract: ArtifactContract | string,
) {
  if (typeof contract === "string") {
    return titleCaseFromIdentifier(contract)
  }

  const explicitTitle = collapseWhitespace(contract.title || "")
  if (explicitTitle) return explicitTitle
  return titleCaseFromIdentifier(contract.kind)
}

export function deriveTemplatePackStagePath(
  templates: WorkflowTemplate[],
  packId: string,
) {
  const labels: string[] = []
  const seen = new Set<string>()

  for (const template of templates) {
    if (template.pack?.id !== packId) continue
    const label = deriveTemplateJourneyStageLabel(template)
    if (!label || seen.has(label)) continue
    seen.add(label)
    labels.push(label)
  }

  return labels
}

function buildTemplateEntrySummary(
  template: WorkflowTemplate,
  source: Extract<WorkflowEntrySource, "template" | "template_customize">,
) {
  const packLabel = collapseWhitespace(template.pack?.label || "")
  const stageLabel = deriveTemplateJourneyStageLabel(template)
  const disciplineSummary = collapseWhitespace(
    template.executionPolicy?.summary || "",
  )
  const summaryParts: string[] = []
  const jobLabel = deriveTemplateJobLabel(template)

  if (packLabel && jobLabel) {
    summaryParts.push(
      `This ${packLabel} flow helps you ${lowerFirst(jobLabel)}.`,
    )
  } else if (packLabel && stageLabel) {
    summaryParts.push(
      `This ${packLabel} flow begins in ${lowerFirst(stageLabel)}.`,
    )
  } else if (source === "template_customize") {
    summaryParts.push("This proven flow is open for agent refinement.")
  } else {
    summaryParts.push("This flow is ready to run as-is.")
  }

  if (disciplineSummary) {
    summaryParts.push(
      ensureSentence(`It follows ${lowerFirst(disciplineSummary)}`, ""),
    )
  }

  summaryParts.push(
    source === "template_customize"
      ? "You can run it as soon as the flow looks right."
      : "Add the input below, then run it or refine it.",
  )

  return summaryParts.join(" ").trim()
}

function deriveWorkflowInputText(workflow: Workflow) {
  const inputNode = workflow.nodes.find((node) => node.type === "input")
  const inputConfig = (inputNode?.config || {}) as InputNodeConfig
  const placeholder = collapseWhitespace(inputConfig.placeholder || "")
  if (placeholder && placeholder !== DEFAULT_INPUT_PLACEHOLDER) {
    return ensureSentence(
      placeholder.replace(/\.\.\.$/, ""),
      "Add the source input this flow should work from.",
    )
  }

  switch (inputConfig.inputType) {
    case "url":
      return "A URL or site to analyze."
    case "directory":
      return "A project folder or codebase path."
    case "text":
      return "Text, notes, or other source material."
    default:
      return "Text, URLs, files, or project context for the flow to work from."
  }
}

function deriveWorkflowOutputText(workflow: Workflow, fallback: string) {
  const outputNode = workflow.nodes.find((node) => node.type === "output")
  const outputConfig = (outputNode?.config || {}) as OutputNodeConfig
  const explicitTitle = collapseWhitespace(outputConfig.title || "")
  if (explicitTitle) {
    return ensureSentence(explicitTitle, fallback)
  }

  if (workflow.description?.trim()) {
    return ensureSentence(workflow.description!, fallback)
  }

  return fallback
}

function describeWorkflowReadiness(workflow: Workflow) {
  const workingStages = workflow.nodes.filter(
    (node) => node.type !== "input" && node.type !== "output",
  )
  const branchCount = workingStages.filter(
    (node) => node.type === "splitter",
  ).length
  const qualityGateCount = workingStages.filter(
    (node) => node.type === "evaluator",
  ).length
  const approvalCount = workingStages.filter(
    (node) => node.type === "approval",
  ).length
  const parts = [
    `${workingStages.length} working ${workingStages.length === 1 ? "step" : "steps"}`,
  ]

  if (branchCount > 0) {
    parts.push(
      `${branchCount} branch ${branchCount === 1 ? "point" : "points"}`,
    )
  }
  if (qualityGateCount > 0) {
    parts.push(
      `${qualityGateCount} quality ${qualityGateCount === 1 ? "check" : "checks"}`,
    )
  }
  if (approvalCount > 0) {
    parts.push(
      `${approvalCount} human ${approvalCount === 1 ? "review" : "reviews"}`,
    )
  }

  return ensureSentence(
    `Ready to run with ${parts.join(", ")}`,
    "Ready to run.",
  )
}

export function buildGeneratedWorkflowEntryState({
  workflow,
  workflowPath,
  request,
  source,
}: {
  workflow: Workflow
  workflowPath: string | null
  request: string
  source: Extract<WorkflowEntrySource, "generated" | "agent_create">
}): WorkflowEntryState {
  const cleanRequest = ensureSentence(
    request,
    "Turn this request into a runnable flow.",
  )

  return {
    workflowPath,
    workflowName: workflow.name,
    source,
    title: deriveEntryTitle(workflow.name),
    summary:
      source === "generated"
        ? "The agent turned your request into a runnable flow. Add the input below, then run it or refine it."
        : "The agent prepared a first draft from your request. Review the input below, then run it or keep refining it.",
    contractLabel: "What you asked for",
    contractText: cleanRequest,
    inputText: deriveWorkflowInputText(workflow),
    outputText: deriveWorkflowOutputText(
      workflow,
      "A final result ready to review, copy, or iterate on.",
    ),
    readinessText: describeWorkflowReadiness(workflow),
  }
}

export function buildTemplateWorkflowEntryState({
  template,
  workflowPath,
  source = "template",
}: {
  template: WorkflowTemplate
  workflowPath: string | null
  source?: Extract<WorkflowEntrySource, "template" | "template_customize">
}): WorkflowEntryState {
  return {
    workflowPath,
    workflowName: template.workflow.name || template.name,
    source,
    title: deriveTemplateJobLabel(template) || template.name,
    summary: buildTemplateEntrySummary(template, source),
    contractLabel: "Use this when",
    contractText: deriveTemplateUseWhen(template),
    inputText: ensureSentence(
      template.input,
      "Add the source material this flow should work from.",
    ),
    outputText: ensureSentence(
      template.output,
      "A final result ready to review.",
    ),
    readinessText: describeWorkflowReadiness(template.workflow),
  }
}

export function buildTemplateRunContext({
  template,
  workflowPath,
  source = "template",
  sourceArtifacts = [],
  factory = null,
  caseOverride = null,
}: {
  template: WorkflowTemplate
  workflowPath: string | null
  source?: Extract<WorkflowEntrySource, "template" | "template_customize">
  sourceArtifacts?: ArtifactRecord[]
  factory?: Pick<ProjectFactoryDefinition, "id" | "label"> | null
  caseOverride?: WorkflowTemplateCaseOverride | null
}): WorkflowTemplateRunContext {
  const { factoryId, factoryLabel } = deriveFactoryIdentity(
    template,
    sourceArtifacts,
    factory,
  )
  const { caseId, caseLabel } = deriveCaseIdentity(
    template,
    sourceArtifacts,
    factory,
    caseOverride,
  )
  return {
    templateId: template.id,
    templateName: template.name,
    workflowPath,
    workflowName: template.workflow.name || template.name,
    source,
    recommendedNext: getTemplateRecommendedNext(template),
    suggestedTools: getTemplateSuggestedTools(template),
    useWhen: deriveTemplateUseWhen(template),
    inputText: ensureSentence(
      template.input,
      "Add the source material this flow should work from.",
    ),
    outputText: ensureSentence(
      template.output,
      "A final result ready to review.",
    ),
    factoryId,
    factoryLabel,
    caseId,
    caseLabel,
    sourceArtifactIds: (sourceArtifacts || []).map((artifact) => artifact.id),
    pack: template.pack,
    contractIn: template.contractIn,
    contractOut: template.contractOut,
    executionPolicy: template.executionPolicy,
  }
}

export function areTemplateContractsSatisfied(
  contracts: ArtifactContract[] | undefined,
  artifacts: ArtifactRecord[],
) {
  if (!contracts?.length) return true
  const availableKinds = new Set(artifacts.map((artifact) => artifact.kind))
  return contracts
    .filter((contract) => contract.required !== false)
    .every((contract) => availableKinds.has(contract.kind))
}

export function selectArtifactsForTemplateContracts(
  contracts: ArtifactContract[] | undefined,
  artifacts: ArtifactRecord[],
) {
  if (!contracts?.length) return artifacts
  const firstArtifactByKind = new Map<string, ArtifactRecord>()

  for (const artifact of artifacts) {
    if (!firstArtifactByKind.has(artifact.kind)) {
      firstArtifactByKind.set(artifact.kind, artifact)
    }
  }

  const selected: ArtifactRecord[] = []
  const seenKinds = new Set<string>()
  for (const contract of contracts) {
    if (seenKinds.has(contract.kind)) continue
    seenKinds.add(contract.kind)
    const artifact = firstArtifactByKind.get(contract.kind)
    if (artifact) {
      selected.push(artifact)
    }
  }

  return selected
}

export function buildContinuationArtifactPool({
  currentArtifacts,
  projectArtifacts,
  context,
}: {
  currentArtifacts: ArtifactRecord[]
  projectArtifacts: ArtifactRecord[]
  context?: Pick<
    WorkflowTemplateRunContext,
    "caseId" | "sourceArtifactIds"
  > | null
}) {
  const pool: ArtifactRecord[] = []
  const seenIds = new Set<string>()
  const orderedCurrentArtifacts = [...currentArtifacts].sort(
    (left, right) => right.updatedAt - left.updatedAt,
  )
  const orderedProjectArtifacts = [...projectArtifacts].sort(
    (left, right) => right.updatedAt - left.updatedAt,
  )
  const sourceArtifactIds = new Set(
    (context?.sourceArtifactIds || []).filter(Boolean),
  )
  const caseId = context?.caseId?.trim()

  const pushUnique = (artifacts: ArtifactRecord[]) => {
    for (const artifact of artifacts) {
      if (seenIds.has(artifact.id)) continue
      seenIds.add(artifact.id)
      pool.push(artifact)
    }
  }

  pushUnique(orderedCurrentArtifacts)

  if (sourceArtifactIds.size > 0) {
    pushUnique(
      orderedProjectArtifacts.filter((artifact) =>
        sourceArtifactIds.has(artifact.id),
      ),
    )
  }

  if (caseId) {
    pushUnique(
      orderedProjectArtifacts.filter((artifact) => artifact.caseId === caseId),
    )
  }

  return [...pool].sort((left, right) => right.updatedAt - left.updatedAt)
}

export function buildArtifactAttachmentSeedInput(
  artifactAttachments: InputAttachment[],
) {
  if (artifactAttachments.length === 0) {
    return "Add the context this step should work from before running."
  }

  if (artifactAttachments.length === 1) {
    return "Use the attached result as the primary context for this step. Add any extra scope or constraints here before running."
  }

  return "Use the attached results as the primary context for this step. Add any extra scope or constraints here before running."
}

export function buildArtifactInputAttachments(
  artifacts: ArtifactRecord[],
): InputAttachment[] {
  return artifacts.map((artifact) => ({
    kind: "file" as const,
    path: artifact.relativePath,
    name: artifact.title,
  }))
}

function inputAttachmentKey(attachment: InputAttachment) {
  if (attachment.kind === "file")
    return `file:${attachment.path}:${attachment.name}`
  if (attachment.kind === "run")
    return `run:${attachment.runId}:${attachment.workspace}`
  return `text:${attachment.label}:${attachment.content}`
}

export function mergeInputAttachments(
  ...groups: InputAttachment[][]
): InputAttachment[] {
  const seen = new Set<string>()
  const merged: InputAttachment[] = []

  for (const group of groups) {
    for (const attachment of group) {
      const key = inputAttachmentKey(attachment)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(attachment)
    }
  }

  return merged
}
