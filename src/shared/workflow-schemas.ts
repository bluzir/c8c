import { z, ZodError } from "zod"

const providerIdSchema = z.enum(["claude", "codex"])
const permissionModeSchema = z.enum(["plan", "edit"])
const errorKindSchema = z.enum([
  "tool",
  "model",
  "timeout",
  "policy",
  "network",
  "unknown",
])
const nodeOnErrorPolicySchema = z.enum([
  "stop",
  "continue",
  "continue_error_output",
])
const nodeRetryBackoffSchema = z.enum(["none", "linear", "exponential"])
const edgeTypeSchema = z.enum(["default", "pass", "fail"])
const workflowTemplateStageSchema = z.enum([
  "research",
  "strategy",
  "content",
  "code",
  "outreach",
  "operations",
])
const mergerStrategySchema = z.enum(["concatenate", "summarize", "select_best"])
const humanTaskFieldTypeSchema = z.enum([
  "text",
  "textarea",
  "number",
  "boolean",
  "select",
  "multiselect",
  "json",
])
const templateSourceSchema = z.enum(["builtin", "plugin", "user", "hub"])

const nodePositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
})

const nodeRetryPolicySchema = z
  .object({
    enabled: z.boolean().optional(),
    maxTries: z.number().int().positive().optional(),
    waitMs: z.number().int().nonnegative().optional(),
    backoff: nodeRetryBackoffSchema.optional(),
    retryOn: z.array(errorKindSchema).optional(),
  })
  .passthrough()

const nodeExecutionPolicySchema = z
  .object({
    onError: nodeOnErrorPolicySchema.optional(),
    alwaysOutputData: z.boolean().optional(),
    executeOnce: z.boolean().optional(),
  })
  .passthrough()

const nodeRuntimeConfigSchema = z
  .object({
    retry: nodeRetryPolicySchema.optional(),
    execution: nodeExecutionPolicySchema.optional(),
  })
  .passthrough()

const skillNodeConfigSchema = z
  .object({
    skillRef: z.string().optional(),
    prompt: z.string().optional(),
    outputMode: z.enum(["auto", "stdout", "content_file"]).optional(),
    maxTurns: z.number().int().positive().optional(),
    permissionMode: permissionModeSchema.optional(),
    skillPaths: z.array(z.string()).optional(),
    allowedTools: z.array(z.string()).optional(),
    disallowedTools: z.array(z.string()).optional(),
    runtime: nodeRuntimeConfigSchema.optional(),
  })
  .passthrough()

const evaluatorNodeConfigSchema = z
  .object({
    criteria: z.string().optional(),
    threshold: z.number().finite().optional(),
    maxRetries: z.number().int().nonnegative().optional(),
    retryFrom: z.string().optional(),
    skillRefs: z.array(z.string()).optional(),
    runtime: nodeRuntimeConfigSchema.optional(),
  })
  .passthrough()

const splitterNodeConfigSchema = z
  .object({
    strategy: z.string().optional(),
    maxBranches: z.number().int().positive().optional(),
    runtime: nodeRuntimeConfigSchema.optional(),
  })
  .passthrough()

const mergerNodeConfigSchema = z
  .object({
    strategy: mergerStrategySchema.optional(),
    prompt: z.string().optional(),
    runtime: nodeRuntimeConfigSchema.optional(),
  })
  .passthrough()

const approvalNodeConfigSchema = z
  .object({
    message: z.string().optional(),
    show_content: z.boolean().optional(),
    allow_edit: z.boolean().optional(),
    timeout_minutes: z.number().finite().optional(),
    timeout_action: z.enum(["auto_approve", "auto_reject", "skip"]).optional(),
    runtime: nodeRuntimeConfigSchema.optional(),
  })
  .passthrough()

const humanTaskFieldOptionSchema = z
  .object({
    value: z.string(),
    label: z.string(),
  })
  .passthrough()

const humanTaskFieldSchema = z
  .object({
    id: z.string(),
    type: humanTaskFieldTypeSchema,
    label: z.string(),
    description: z.string().optional(),
    required: z.boolean().optional(),
    options: z.array(humanTaskFieldOptionSchema).optional(),
    placeholder: z.string().optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  })
  .passthrough()

const humanTaskRequestSchema = z
  .object({
    version: z.literal(1),
    kind: z.enum(["form", "approval"]),
    title: z.string(),
    instructions: z.string().optional(),
    summary: z.string().optional(),
    fields: z.array(humanTaskFieldSchema),
    defaults: z.record(z.string(), z.unknown()).optional(),
    metadata: z
      .object({
        externalRef: z.string().optional(),
        generatedByNodeId: z.string().optional(),
        suggestedAssignee: z.string().optional(),
        priority: z.enum(["low", "normal", "high"]).optional(),
        allowEdit: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

const humanNodeConfigSchema = z
  .object({
    mode: z.enum(["form", "approval"]).optional(),
    requestSource: z.enum(["upstream_json", "static"]).optional(),
    staticRequest: humanTaskRequestSchema.optional(),
    timeoutMinutes: z.number().finite().optional(),
    timeoutAction: z
      .enum(["fail_node", "complete_with_timeout_response"])
      .optional(),
    submitAction: z.literal("complete_node").optional(),
    rejectAction: z
      .enum(["fail_node", "complete_with_reject_response"])
      .optional(),
    allowRevisions: z.boolean().optional(),
    autoContinue: z.boolean().optional(),
    runtime: nodeRuntimeConfigSchema.optional(),
  })
  .passthrough()

const inputNodeConfigSchema = z
  .object({
    inputType: z.enum(["auto", "text", "url", "directory"]).optional(),
    required: z.boolean().optional(),
    defaultValue: z.string().optional(),
    placeholder: z.string().optional(),
    runtime: nodeRuntimeConfigSchema.optional(),
  })
  .passthrough()

const outputNodeConfigSchema = z
  .object({
    title: z.string().optional(),
    format: z.enum(["markdown", "text"]).optional(),
    runtime: nodeRuntimeConfigSchema.optional(),
  })
  .passthrough()

const workflowNodeBaseSchema = z.object({
  id: z.string().min(1),
  position: nodePositionSchema,
})

const inputWorkflowNodeSchema = workflowNodeBaseSchema
  .extend({
    type: z.literal("input"),
    config: inputNodeConfigSchema,
  })
  .passthrough()

const skillWorkflowNodeSchema = workflowNodeBaseSchema
  .extend({
    type: z.literal("skill"),
    config: skillNodeConfigSchema,
  })
  .passthrough()

const evaluatorWorkflowNodeSchema = workflowNodeBaseSchema
  .extend({
    type: z.literal("evaluator"),
    config: evaluatorNodeConfigSchema,
  })
  .passthrough()

const splitterWorkflowNodeSchema = workflowNodeBaseSchema
  .extend({
    type: z.literal("splitter"),
    config: splitterNodeConfigSchema,
  })
  .passthrough()

const mergerWorkflowNodeSchema = workflowNodeBaseSchema
  .extend({
    type: z.literal("merger"),
    config: mergerNodeConfigSchema,
  })
  .passthrough()

const outputWorkflowNodeSchema = workflowNodeBaseSchema
  .extend({
    type: z.literal("output"),
    config: outputNodeConfigSchema,
  })
  .passthrough()

const approvalWorkflowNodeSchema = workflowNodeBaseSchema
  .extend({
    type: z.literal("approval"),
    config: approvalNodeConfigSchema,
  })
  .passthrough()

const humanWorkflowNodeSchema = workflowNodeBaseSchema
  .extend({
    type: z.literal("human"),
    config: humanNodeConfigSchema,
  })
  .passthrough()

const workflowNodeSchema = z.discriminatedUnion("type", [
  inputWorkflowNodeSchema,
  skillWorkflowNodeSchema,
  evaluatorWorkflowNodeSchema,
  splitterWorkflowNodeSchema,
  mergerWorkflowNodeSchema,
  outputWorkflowNodeSchema,
  approvalWorkflowNodeSchema,
  humanWorkflowNodeSchema,
])

const workflowEdgeSchema = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
    type: edgeTypeSchema,
  })
  .passthrough()

const workflowDefaultsSchema = z
  .object({
    provider: providerIdSchema.optional(),
    model: z.string().optional(),
    maxTurns: z.number().int().positive().optional(),
    maxParallel: z.number().int().positive().optional(),
    detailBudget: z.number().finite().optional(),
    timeout_minutes: z.number().finite().optional(),
    allowedTools: z.array(z.string()).optional(),
    disallowedTools: z.array(z.string()).optional(),
    permissionMode: permissionModeSchema.optional(),
    budget_tokens: z.number().finite().optional(),
    budget_cost_usd: z.number().finite().optional(),
    stop_on: z
      .array(z.enum(["budget_exceeded", "mandatory_node_failed"]))
      .optional(),
  })
  .passthrough()

const artifactContractSchema = z
  .object({
    kind: z.string().min(1),
    title: z.string().optional(),
    description: z.string().optional(),
    required: z.boolean().optional(),
  })
  .passthrough()

const templatePackMetadataInputSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    journeyStage: z.string().optional(),
    journey_stage: z.string().optional(),
    entrypoint: z.boolean().optional(),
    recommendedNext: z.array(z.string()).optional(),
    recommended_next: z.array(z.string()).optional(),
  })
  .passthrough()

const executionPolicyProfileInputSchema = z
  .object({
    profileId: z.string().optional(),
    profile_id: z.string().optional(),
    summary: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    notes: z
      .array(z.union([z.string(), z.record(z.string(), z.string())]))
      .optional(),
  })
  .passthrough()

const workflowTemplateCreditSchema = z
  .object({
    label: z.string().min(1),
    href: z.string().min(1),
    note: z.string().optional(),
  })
  .passthrough()

const workflowTemplateSuggestedToolSchema = z.string().min(1)

export const workflowSchema = z
  .object({
    id: z.string().optional(),
    version: z.number().int().positive().optional().default(1),
    name: z.string(),
    description: z.string().optional(),
    defaults: workflowDefaultsSchema.optional(),
    nodes: z.array(workflowNodeSchema),
    edges: z.array(workflowEdgeSchema),
  })
  .passthrough()

export const templateDocumentSchema = workflowSchema
  .extend({
    id: z.string().min(1),
    stage: workflowTemplateStageSchema,
    recommendedNext: z.array(z.string()).optional(),
    recommended_next: z.array(z.string()).optional(),
    suggestedTools: z.array(workflowTemplateSuggestedToolSchema).optional(),
    suggested_tools: z.array(workflowTemplateSuggestedToolSchema).optional(),
    emoji: z.string().min(1),
    headline: z.string().min(1),
    how: z.string().min(1),
    input: z.string().min(1),
    output: z.string().min(1),
    steps: z.array(z.string().min(1)).min(1),
    useWhen: z.string().optional(),
    use_when: z.string().optional(),
    pack: templatePackMetadataInputSchema.optional(),
    contractIn: z.array(artifactContractSchema).optional(),
    contract_in: z.array(artifactContractSchema).optional(),
    contractOut: z.array(artifactContractSchema).optional(),
    contract_out: z.array(artifactContractSchema).optional(),
    executionPolicy: executionPolicyProfileInputSchema.optional(),
    execution_policy: executionPolicyProfileInputSchema.optional(),
    credits: z.array(workflowTemplateCreditSchema).optional(),
    source: templateSourceSchema.optional(),
    pluginId: z.string().optional(),
    pluginName: z.string().optional(),
    marketplaceId: z.string().optional(),
    marketplaceName: z.string().optional(),
    pluginVersion: z.string().optional(),
    templatePath: z.string().optional(),
  })
  .passthrough()

function formatIssuePath(path: PropertyKey[]): string {
  return path.reduce<string>((result, segment) => {
    if (typeof segment === "number") {
      return `${result}[${String(segment)}]`
    }
    return result ? `${result}.${String(segment)}` : String(segment)
  }, "")
}

export function formatSchemaValidationError(
  prefix: string,
  error: unknown,
): string {
  if (!(error instanceof ZodError)) {
    return `${prefix}: ${error instanceof Error ? error.message : String(error)}`
  }

  const [issue] = error.issues
  if (!issue) return prefix

  const path = formatIssuePath(issue.path)
  if (!path) return `${prefix}: ${issue.message}`
  return `${prefix} at ${path}: ${issue.message}`
}
