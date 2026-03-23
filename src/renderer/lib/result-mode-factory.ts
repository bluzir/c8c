import type {
  ProjectFactoryBlueprint,
  ProjectFactoryDefinition,
} from "@shared/types"
import type { ResultModeConfigValues } from "@/lib/result-mode-config"
import type { WorkflowResultMode } from "@/lib/result-modes"

function trim(value: string | undefined | null) {
  return (value || "").trim()
}

function dedupe(values: string[]) {
  const seen = new Set<string>()
  const next: string[] = []
  for (const value of values) {
    const normalized = trim(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    next.push(normalized)
  }
  return next
}

function splitLines(value: string | undefined | null) {
  return dedupe(
    (value || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  )
}

function titleCaseFromIdentifier(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function slugifyFactorySeed(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

function buildFactoryId(value: string) {
  const slug = slugifyFactorySeed(value)
  return slug ? `factory:${slug}` : `factory:${Date.now().toString(36)}`
}

function firstFilled(...values: Array<string | undefined | null>) {
  for (const value of values) {
    const normalized = trim(value)
    if (normalized) return normalized
  }
  return undefined
}

function extractTargetDefinition(values: string[]) {
  const combined = values.join("\n")
  const targetMatch = combined.match(
    /\b(\d+)\s+(posts?|articles?|lessons?|modules?|emails?|assets?|videos?)\b/i,
  )
  const horizonMatch = combined.match(
    /\b(next\s+\d+\s+(?:days?|weeks?|months?)|\d+\s+(?:days?|weeks?|months?))\b/i,
  )

  return {
    targetCount: targetMatch ? Number(targetMatch[1]) : null,
    targetUnit: targetMatch?.[2]?.toLowerCase(),
    timeHorizon: horizonMatch?.[1],
  }
}

function factoryLabelForMode(
  mode: WorkflowResultMode,
  values: ResultModeConfigValues,
  existingFactory?: ProjectFactoryDefinition | null,
) {
  if (mode.id === "development") {
    return firstFilled(
      values.project_goal,
      existingFactory?.label,
      existingFactory?.outcome?.title,
      "Product Lab",
    )
  }
  if (mode.id === "content") {
    return firstFilled(
      values.content_goal,
      existingFactory?.label,
      existingFactory?.outcome?.title,
      "Marketing Lab",
    )
  }
  if (mode.id === "courses") {
    return firstFilled(
      values.course_outcome,
      existingFactory?.label,
      existingFactory?.outcome?.title,
      "Content Lab",
    )
  }
  return firstFilled(
    existingFactory?.label,
    existingFactory?.outcome?.title,
    `${mode.label} Lab`,
  )
}

function buildOutcomeStatement(
  mode: WorkflowResultMode,
  values: ResultModeConfigValues,
) {
  const sections: Array<{ label: string; value: string }> = []

  if (mode.id === "development") {
    if (trim(values.source_context))
      sections.push({
        label: "Source context",
        value: trim(values.source_context),
      })
    if (trim(values.quality_bar))
      sections.push({ label: "Quality bar", value: trim(values.quality_bar) })
  } else if (mode.id === "content") {
    if (trim(values.channel_and_audience))
      sections.push({
        label: "Channel and audience",
        value: trim(values.channel_and_audience),
      })
    if (trim(values.tone_of_voice))
      sections.push({
        label: "Tone of voice",
        value: trim(values.tone_of_voice),
      })
    if (trim(values.volume_and_quality))
      sections.push({
        label: "Volume and quality bar",
        value: trim(values.volume_and_quality),
      })
  } else if (mode.id === "courses") {
    if (trim(values.audience))
      sections.push({ label: "Audience", value: trim(values.audience) })
    if (trim(values.format_and_depth))
      sections.push({
        label: "Format and depth",
        value: trim(values.format_and_depth),
      })
    if (trim(values.launch_needs))
      sections.push({ label: "Launch needs", value: trim(values.launch_needs) })
  }

  if (sections.length === 0) return undefined
  return sections
    .map((section) => `${section.label}: ${section.value}`)
    .join("\n")
}

function buildConstraints(
  mode: WorkflowResultMode,
  values: ResultModeConfigValues,
  existingFactory?: ProjectFactoryDefinition | null,
) {
  const next = [...(existingFactory?.outcome?.constraints || [])]
  if (mode.id === "development") {
    next.push(...splitLines(values.quality_bar))
  } else if (mode.id === "content") {
    next.push(...splitLines(values.tone_of_voice))
    next.push(...splitLines(values.volume_and_quality))
  } else if (mode.id === "courses") {
    next.push(...splitLines(values.format_and_depth))
    next.push(...splitLines(values.launch_needs))
  }
  return dedupe(next)
}

function buildStrategistCheckpoints(
  mode: WorkflowResultMode,
  values: ResultModeConfigValues,
  existingFactory?: ProjectFactoryDefinition | null,
) {
  if (mode.id === "development") {
    const configured = splitLines(values.strategist_checkpoints)
    if (configured.length > 0) return configured
  }
  if (existingFactory?.recipe?.strategistCheckpoints?.length) {
    return existingFactory.recipe.strategistCheckpoints
  }
  if (mode.id === "content") {
    return ["Approve audience and angle", "Approve sample asset quality"]
  }
  if (mode.id === "courses") {
    return ["Approve voice and structure", "Approve sample asset quality"]
  }
  return [
    "Approve scope and direction",
    "Approve quality before wider execution",
  ]
}

function defaultQualityPolicy(mode: WorkflowResultMode) {
  if (mode.id === "content") {
    return [
      "Evidence-first market research",
      "Angle before asset production",
      "Human review before scaling",
    ]
  }
  if (mode.id === "courses") {
    return [
      "Voice-locked drafting",
      "Structure before scale",
      "Human publish or launch approval",
    ]
  }
  return [
    "Spec-first delivery",
    "Visible verification before complete",
    "Sparse human approvals",
  ]
}

function defaultCaseGenerationRule(mode: WorkflowResultMode) {
  if (mode.id === "content") return "Research brief -> campaign or asset tracks"
  if (mode.id === "courses") return "Content plan -> production tracks"
  return "Plan -> implementation tracks"
}

function defaultSuccessSignal(mode: WorkflowResultMode) {
  if (mode.id === "content")
    return "A grounded market angle, campaign plan, or asset pack that is ready for review."
  if (mode.id === "courses")
    return "A publishable content system or lesson asset set that is ready for human review."
  return "A plan or implementation path that meets the requested quality bar."
}

function buildAudience(
  mode: WorkflowResultMode,
  values: ResultModeConfigValues,
  existingFactory?: ProjectFactoryDefinition | null,
) {
  if (mode.id === "content") {
    return firstFilled(
      values.channel_and_audience,
      existingFactory?.outcome?.audience,
    )
  }
  if (mode.id === "courses") {
    return firstFilled(values.audience, existingFactory?.outcome?.audience)
  }
  return existingFactory?.outcome?.audience
}

export function pickReusableFactoryForMode({
  blueprint,
  selectedFactoryId,
  mode,
}: {
  blueprint: ProjectFactoryBlueprint | null
  selectedFactoryId?: string | null
  mode: WorkflowResultMode
}): ProjectFactoryDefinition | null {
  const factories = blueprint?.factories || []
  if (selectedFactoryId) {
    const selected =
      factories.find((factory) => factory.id === selectedFactoryId) || null
    if (
      selected &&
      (selected.modeId === mode.id ||
        selected.recipe?.packIds?.some((packId) =>
          mode.packIds?.includes(packId),
        ))
    ) {
      return selected
    }
  }

  return (
    factories.find(
      (factory) =>
        factory.modeId === mode.id ||
        factory.recipe?.packIds?.some((packId) =>
          mode.packIds?.includes(packId),
        ),
    ) || null
  )
}

export function buildFactoryFromResultMode({
  mode,
  values,
  existingFactory = null,
  now = Date.now(),
}: {
  mode: WorkflowResultMode
  values: ResultModeConfigValues
  existingFactory?: ProjectFactoryDefinition | null
  now?: number
}): ProjectFactoryDefinition {
  const normalizedValues = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, trim(value)]),
  ) as ResultModeConfigValues
  const allTexts = Object.values(normalizedValues).filter(Boolean)
  const target = extractTargetDefinition(allTexts)
  const label =
    factoryLabelForMode(mode, normalizedValues, existingFactory) ||
    `${mode.label} Lab`
  const outcomeTitle =
    firstFilled(
      mode.id === "development" ? normalizedValues.project_goal : undefined,
      mode.id === "content" ? normalizedValues.content_goal : undefined,
      mode.id === "courses" ? normalizedValues.course_outcome : undefined,
      existingFactory?.outcome?.title,
      label,
    ) || label
  const outcomeStatement =
    buildOutcomeStatement(mode, normalizedValues) ||
    existingFactory?.outcome?.statement ||
    mode.useFor
  const qualityPolicy = existingFactory?.recipe?.qualityPolicy?.length
    ? existingFactory.recipe.qualityPolicy
    : defaultQualityPolicy(mode)

  return {
    id: existingFactory?.id || buildFactoryId(label),
    modeId: mode.id,
    label,
    outcome: {
      title: outcomeTitle,
      statement: outcomeStatement,
      successSignal: firstFilled(
        mode.id === "development" ? normalizedValues.quality_bar : undefined,
        mode.id === "content" ? normalizedValues.volume_and_quality : undefined,
        mode.id === "courses" ? normalizedValues.launch_needs : undefined,
        existingFactory?.outcome?.successSignal,
        defaultSuccessSignal(mode),
      ),
      timeHorizon: firstFilled(
        target.timeHorizon,
        existingFactory?.outcome?.timeHorizon,
      ),
      targetCount:
        target.targetCount ?? existingFactory?.outcome?.targetCount ?? null,
      targetUnit: firstFilled(
        target.targetUnit,
        existingFactory?.outcome?.targetUnit,
      ),
      audience: buildAudience(mode, normalizedValues, existingFactory),
      constraints: buildConstraints(mode, normalizedValues, existingFactory),
    },
    recipe: {
      summary: firstFilled(
        existingFactory?.recipe?.summary,
        `${mode.label} guided path`,
      ),
      packIds: dedupe([
        ...(existingFactory?.recipe?.packIds || []),
        ...(mode.packIds || []),
      ]),
      stageOrder: existingFactory?.recipe?.stageOrder?.length
        ? existingFactory.recipe.stageOrder
        : mode.guidedPath,
      artifactContracts: existingFactory?.recipe?.artifactContracts,
      qualityPolicy,
      strategistCheckpoints: buildStrategistCheckpoints(
        mode,
        normalizedValues,
        existingFactory,
      ),
      caseGenerationRules: existingFactory?.recipe?.caseGenerationRules?.length
        ? existingFactory.recipe.caseGenerationRules
        : [defaultCaseGenerationRule(mode)],
    },
    createdAt: existingFactory?.createdAt || now,
    updatedAt: now,
  }
}

export function formatResultModeLabel(modeId?: string) {
  return modeId ? titleCaseFromIdentifier(modeId) : "Not defined"
}
