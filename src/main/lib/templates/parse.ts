import YAML from "yaml"
import {
  formatSchemaValidationError,
  templateDocumentSchema,
} from "@shared/workflow-schemas"
import type {
  ArtifactContract,
  ExecutionPolicyTag,
  Workflow,
  StageFamily,
  WorkflowExecutionPolicyProfile,
  WorkflowTemplate,
  WorkflowTemplateCredit,
  WorkflowTemplateJourneyStage,
  WorkflowTemplatePackMetadata,
  WorkflowTemplateStage,
} from "@shared/types"

interface FlatTemplatePackMetadata {
  id: string
  label: string
  journeyStage?: WorkflowTemplateJourneyStage
  journey_stage?: WorkflowTemplateJourneyStage
  entrypoint?: boolean
  recommendedNext?: string[]
  recommended_next?: string[]
}

interface FlatExecutionPolicyProfile {
  profileId?: string
  profile_id?: string
  summary?: string
  description?: string
  tags?: ExecutionPolicyTag[]
  notes?: Array<string | Record<string, string>>
}

interface FlatTemplate {
  id: string
  stage: WorkflowTemplateStage
  stageFamily?: StageFamily
  stage_family?: StageFamily
  emoji: string
  headline: string
  how: string
  input: string
  output: string
  steps: string[]
  version: number
  name: string
  description?: string
  useWhen?: string
  use_when?: string
  pack?: FlatTemplatePackMetadata
  contractIn?: ArtifactContract[]
  contract_in?: ArtifactContract[]
  contractOut?: ArtifactContract[]
  contract_out?: ArtifactContract[]
  executionPolicy?: FlatExecutionPolicyProfile
  execution_policy?: FlatExecutionPolicyProfile
  credits?: WorkflowTemplateCredit[]
  defaults?: Workflow["defaults"]
  nodes: Workflow["nodes"]
  edges: Workflow["edges"]
}

type TemplateOverrides = Partial<
  Pick<
    WorkflowTemplate,
    | "id"
    | "source"
    | "pluginId"
    | "pluginName"
    | "marketplaceId"
    | "marketplaceName"
    | "pluginVersion"
    | "templatePath"
  >
>

function normalizePackMetadata(
  pack?: FlatTemplatePackMetadata,
): WorkflowTemplatePackMetadata | undefined {
  if (!pack) return undefined
  return {
    id: pack.id,
    label: pack.label,
    journeyStage: pack.journeyStage ?? pack.journey_stage ?? "operate",
    entrypoint: pack.entrypoint,
    recommendedNext: pack.recommendedNext ?? pack.recommended_next,
  }
}

function normalizeExecutionPolicy(
  policy?: FlatExecutionPolicyProfile,
): WorkflowExecutionPolicyProfile | undefined {
  if (!policy) return undefined
  return {
    profileId: policy.profileId ?? policy.profile_id,
    summary: policy.summary,
    description: policy.description,
    tags: policy.tags,
    notes: policy.notes?.map((note) =>
      typeof note === "string"
        ? note
        : Object.entries(note)
            .map(([key, value]) => `${key}: ${value}`)
            .join(" "),
    ),
  }
}

export function parseTemplate(
  raw: string,
  overrides: TemplateOverrides = {},
): WorkflowTemplate {
  const parsed = templateDocumentSchema.safeParse(YAML.parse(raw))
  if (!parsed.success) {
    throw new Error(
      formatSchemaValidationError("Invalid template YAML", parsed.error),
    )
  }

  const {
    id,
    stage,
    stageFamily,
    stage_family,
    emoji,
    headline,
    how,
    input,
    output,
    steps,
    useWhen,
    use_when,
    pack,
    contractIn,
    contract_in,
    contractOut,
    contract_out,
    executionPolicy,
    execution_policy,
    credits,
    ...workflow
  } = parsed.data as FlatTemplate
  return {
    id: overrides.id || id,
    name: workflow.name,
    description: workflow.description ?? "",
    stage,
    stageFamily: stageFamily ?? stage_family,
    emoji,
    headline,
    how,
    input,
    output,
    steps,
    useWhen: useWhen ?? use_when,
    pack: normalizePackMetadata(pack),
    contractIn: contractIn ?? contract_in,
    contractOut: contractOut ?? contract_out,
    executionPolicy: normalizeExecutionPolicy(
      executionPolicy ?? execution_policy,
    ),
    credits,
    workflow,
    ...overrides,
  }
}
