import { getDefaultModelForProvider } from "@shared/provider-metadata"
import type {
  CreateEntryHelpModeHint,
  CreateEntryRouteClarification,
  CreateEntryRouteInput,
  CreateEntryRouteOption,
  CreateEntryRouteResult,
  CreateEntryRouteSeed,
  ProjectInspectionSummary,
  WorkflowTemplate,
} from "@shared/types"
import {
  filterDirectCreateEntryOptions,
  sanitizeDirectCreateFallbackTemplateId,
} from "@shared/create-entry-routing"
import { drainExecutionHandle } from "./agent-execution"
import { withExecutionSlot } from "./execution-pool"
import { LogParser } from "./log-parser"
import { prepareTemporaryMcpConfig } from "./mcp-config"
import { getProviderSettings } from "./provider-settings"
import {
  applyProviderFeatureFlags,
  startProviderTask,
} from "./provider-runtime"
import { logWarn } from "./structured-log"

interface CreateEntryRouteDecision {
  kind?: "route"
  recommendedTemplateId: string
  alternateTemplateIds?: string[]
  reason?: string
  confidence?: number
}

interface CreateEntryClarificationDecision {
  kind: "clarification"
  recommendedTemplateId: string
  alternateTemplateIds?: string[]
  reason?: string
  confidence?: number
  clarification: CreateEntryRouteClarification
}

type CreateEntryAgentDecision =
  | CreateEntryRouteDecision
  | CreateEntryClarificationDecision

const DIRECTORY_ROUTE_TEMPLATES = new Set([
  "delivery-map-codebase",
  "ux-ui-polish-audit",
  "full-stack-code-audit",
])
const ROUTER_FAILURE_MESSAGE =
  "The AI router couldn't choose a starting point right now. Try again."

function deriveIntentValue(
  option: CreateEntryRouteOption,
): CreateEntryHelpModeHint | null {
  const label = normalize(option.intentLabel).toLowerCase()
  if (label === "do it") return "do"
  if (label === "plan it") return "plan"
  if (label === "review it") return "review"
  return null
}

function filterOptionsForIntent(
  options: CreateEntryRouteOption[],
  helpModeHint: CreateEntryHelpModeHint,
): CreateEntryRouteOption[] {
  return options.filter((option) => deriveIntentValue(option) === helpModeHint)
}

function normalize(value: string | undefined | null) {
  return (value || "").trim()
}

function buildAllowedOptionMap(
  options: CreateEntryRouteOption[],
  templates: WorkflowTemplate[],
) {
  const templateById = new Map(
    templates.map((template) => [template.id, template]),
  )
  return options
    .map((option) => {
      const template = templateById.get(option.templateId)
      return template ? { ...option, template } : null
    })
    .filter(
      (
        value,
      ): value is CreateEntryRouteOption & { template: WorkflowTemplate } =>
        Boolean(value),
    )
}

function buildRouteSeed(
  templateId: string,
  projectInspection: ProjectInspectionSummary,
  requestedResult: string,
): CreateEntryRouteSeed {
  const cleanRequestedResult = normalize(requestedResult)

  if (DIRECTORY_ROUTE_TEMPLATES.has(templateId)) {
    return {
      primaryInputMode: "directory",
      primaryInputValue: projectInspection.projectPath,
      attachments: cleanRequestedResult
        ? [
            {
              kind: "text",
              label: "Requested result",
              content: cleanRequestedResult,
            },
          ]
        : [],
    }
  }

  if (templateId === "delivery-verify-phase") {
    return {
      primaryInputMode: "branch_or_diff",
      primaryInputValue: projectInspection.git.branch || cleanRequestedResult,
      attachments:
        cleanRequestedResult &&
        cleanRequestedResult !== projectInspection.git.branch
          ? [
              {
                kind: "text",
                label: "Requested result",
                content: cleanRequestedResult,
              },
            ]
          : [],
    }
  }

  if (templateId === "delivery-review-phase") {
    return {
      primaryInputMode: "branch_or_diff",
      primaryInputValue: projectInspection.git.branch || cleanRequestedResult,
      attachments:
        cleanRequestedResult &&
        cleanRequestedResult !== projectInspection.git.branch
          ? [
              {
                kind: "text",
                label: "Requested result",
                content: cleanRequestedResult,
              },
            ]
          : [],
    }
  }

  return {
    primaryInputMode: "text",
    primaryInputValue: cleanRequestedResult,
    attachments: [],
  }
}

function validateClarification(
  clarification: unknown,
  allowedTemplateIds: Set<string>,
): CreateEntryRouteClarification | null {
  if (
    !clarification ||
    typeof clarification !== "object" ||
    Array.isArray(clarification)
  )
    return null
  const raw = clarification as Record<string, unknown>
  const kind = normalize(typeof raw.kind === "string" ? raw.kind : "")
  const title = normalize(typeof raw.title === "string" ? raw.title : "")
  const message = normalize(typeof raw.message === "string" ? raw.message : "")
  if (!kind || !title || !message || !Array.isArray(raw.options)) return null

  if (kind === "help_mode") {
    const options = raw.options
      .map((option) => {
        if (!option || typeof option !== "object" || Array.isArray(option))
          return null
        const candidate = option as Record<string, unknown>
        const value = normalize(
          typeof candidate.value === "string" ? candidate.value : "",
        )
        if (value !== "do" && value !== "plan" && value !== "review")
          return null
        const label = normalize(
          typeof candidate.label === "string" ? candidate.label : "",
        )
        if (!label) return null
        return {
          value: value as CreateEntryHelpModeHint,
          label,
          description:
            normalize(
              typeof candidate.description === "string"
                ? candidate.description
                : "",
            ) || undefined,
          disabled: candidate.disabled === true,
        }
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value))

    if (options.length < 2) return null
    return { kind: "help_mode", title, message, options }
  }

  if (kind === "job_route") {
    const options = raw.options
      .map((option) => {
        if (!option || typeof option !== "object" || Array.isArray(option))
          return null
        const candidate = option as Record<string, unknown>
        const templateId = normalize(
          typeof candidate.templateId === "string" ? candidate.templateId : "",
        )
        if (!templateId || !allowedTemplateIds.has(templateId)) return null
        const label = normalize(
          typeof candidate.label === "string" ? candidate.label : "",
        )
        if (!label) return null
        const value =
          normalize(
            typeof candidate.value === "string" ? candidate.value : templateId,
          ) || templateId
        return {
          value,
          label,
          description:
            normalize(
              typeof candidate.description === "string"
                ? candidate.description
                : "",
            ) || undefined,
          templateId,
        }
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value))

    if (options.length < 2) return null
    return { kind: "job_route", title, message, options }
  }

  return null
}

function validateAgentDecision(
  decision: CreateEntryAgentDecision,
  allowedTemplateIds: Set<string>,
): CreateEntryAgentDecision | null {
  const recommendedTemplateId = normalize(decision.recommendedTemplateId)
  if (!recommendedTemplateId || !allowedTemplateIds.has(recommendedTemplateId))
    return null

  const alternateTemplateIds = Array.isArray(decision.alternateTemplateIds)
    ? decision.alternateTemplateIds
        .map((value) => normalize(value))
        .filter(
          (value) =>
            value &&
            value !== recommendedTemplateId &&
            allowedTemplateIds.has(value),
        )
    : []

  const normalizedDecision = {
    recommendedTemplateId,
    alternateTemplateIds,
    reason: normalize(decision.reason),
    confidence:
      typeof decision.confidence === "number" ? decision.confidence : undefined,
  }

  const clarification =
    "clarification" in decision
      ? validateClarification(decision.clarification, allowedTemplateIds)
      : null

  if (decision.kind === "clarification" || clarification) {
    if (!clarification) return null
    return {
      kind: "clarification",
      ...normalizedDecision,
      clarification,
    }
  }

  return {
    kind: "route",
    ...normalizedDecision,
  }
}

function buildRouterPrompt(
  input: CreateEntryRouteInput,
  projectInspection: ProjectInspectionSummary,
  allowedOptions: CreateEntryRouteOption[],
): string {
  const requestSections = {
    draftPrompt: normalize(input.draftPrompt),
    requestedResult: normalize(input.requestedResult),
    helpModeHint: input.helpModeHint || null,
    modeConfig: input.modeConfig || {},
    promptScaffold: input.promptScaffold || {},
  }

  const allowedOptionSummary = allowedOptions
    .map(
      (option) =>
        `- ${option.templateId}: ${option.label}${option.intentLabel ? ` [${option.intentLabel}]` : ""}`,
    )
    .join("\n")

  return [
    "You are c8c's bounded entry router.",
    "Choose the best FIRST starting point for the user's point B. Do not design a whole flow.",
    "Return JSON only.",
    "",
    "Product contract you must follow:",
    "- Think in the user's job and desired result, not in internal process mechanics.",
    "- The router chooses the best first move under the hood so the user can get to a result without understanding the internal spine.",
    "- The router picks the first meaningful start, not the final destination. A request like 'change the app' may still start with orientation or shaping.",
    "- `Map Codebase` / explore is correct only when orientation is genuinely needed. It must not be the blind default for every selected project.",
    "- Broad audit or review requests should prefer audit entries instead of mapping first, unless the user explicitly asks to map or understand the project before doing the work.",
    "- Bug reports, production incidents, regressions, and 'something broke' requests should prefer the bug-investigation start when it is available.",
    "- Detailed PRDs, specs, and requirements docs are plan-ready starts. Prefer planning over reshaping when the user already did the shaping work.",
    "- Small edits, quick tweaks, and straightforward app changes should stay on the lightweight change path instead of being escalated into audit-heavy starts.",
    "- If the request is ambiguous, ask for a short clarification instead of silently guessing.",
    "- Help mode is a hard constraint when present.",
    "- Handle English, Russian, and mixed-language requests.",
    "",
    "Allowed starting points:",
    allowedOptionSummary,
    "",
    "Project inspection:",
    JSON.stringify(projectInspection, null, 2),
    "",
    "User request:",
    JSON.stringify(requestSections, null, 2),
    "",
    "Clarification policy:",
    "- Use `help_mode` clarification when the ambiguity is mainly about kind of help: Do it vs Plan it vs Review it.",
    "- Use `job_route` clarification when the ambiguity is mainly between different review jobs such as code audit vs UX audit vs browser visual audit vs CTO audit.",
    "- If helpModeHint is already present, avoid clarification unless the request is still ambiguous between distinct job entries inside that intent.",
    "",
    "Route output schema:",
    '{"kind":"route","recommendedTemplateId":"string","alternateTemplateIds":["string"],"reason":"one sentence","confidence":0.0}',
    "",
    "Clarification output schema:",
    '{"kind":"clarification","recommendedTemplateId":"string","alternateTemplateIds":["string"],"reason":"one sentence","confidence":0.0,"clarification":{"kind":"help_mode|job_route","title":"string","message":"string","options":[{"value":"string","label":"string","description":"string","disabled":false,"templateId":"string"}]}}',
  ].join("\n")
}

function extractRouterJsonCandidate(rawText: string) {
  const trimmed = rawText.trim()
  if (!trimmed) return ""

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch) return fencedMatch[1].trim()

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    return trimmed
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/)
  return objectMatch ? objectMatch[0] : trimmed
}

function parseRouterDecision(
  rawText: string,
  allowedTemplateIds: Set<string>,
): CreateEntryAgentDecision | null {
  try {
    const parsed = JSON.parse(
      extractRouterJsonCandidate(rawText),
    ) as CreateEntryAgentDecision
    return validateAgentDecision(parsed, allowedTemplateIds)
  } catch {
    return null
  }
}

async function runAgentRouteDecision(
  input: CreateEntryRouteInput,
  projectInspection: ProjectInspectionSummary,
  allowedOptions: CreateEntryRouteOption[],
): Promise<CreateEntryAgentDecision | null> {
  if (input.modeId !== "development" || allowedOptions.length === 0) return null

  const allowedTemplateIds = new Set(
    allowedOptions.map((option) => option.templateId),
  )
  const prompt = buildRouterPrompt(input, projectInspection, allowedOptions)
  const settings = await getProviderSettings()
  const providerId = applyProviderFeatureFlags(
    settings.defaultProvider,
    settings.features.codexProvider,
  )
  const model = getDefaultModelForProvider(providerId)
  const logParser = new LogParser()
  const runtimeMcpConfig = await prepareTemporaryMcpConfig(
    projectInspection.projectPath,
  )

  try {
    const result = await withExecutionSlot(async () => {
      const handle = await startProviderTask(providerId, {
        workdir: projectInspection.projectPath,
        prompt,
        model,
        maxTurns: 8,
        systemPrompts: [
          "You are a flow entry router. Output ONLY valid JSON. Do NOT use tools. Do NOT inspect files. Either choose one allowed starting point or return a short clarification fork in the provided schema.",
        ],
        mcpConfigPath: runtimeMcpConfig.path,
        disableBuiltInTools: providerId === "claude",
        disableSlashCommands: providerId === "claude",
        timeout: 20_000,
      })
      return drainExecutionHandle(handle, {
        onLogEntry: (entry) => {
          logParser.appendEntry(entry)
        },
        onUsage: (usage) => {
          logParser.applyUsage(usage)
        },
      })
    })

    logParser.flush()

    if (!result.success || result.killed || result.aborted) return null
    const text = logParser.textContent.trim()
    if (!text) return null
    return parseRouterDecision(text, allowedTemplateIds)
  } catch (error) {
    logWarn("create-entry-router", "agent_route_failed", {
      error: String(error),
    })
    return null
  } finally {
    await runtimeMcpConfig.cleanup()
  }
}

export async function routeCreateEntry(
  input: CreateEntryRouteInput,
  projectInspection: ProjectInspectionSummary,
  templates: WorkflowTemplate[],
): Promise<CreateEntryRouteResult> {
  if (input.modeId !== "development") {
    throw new Error(
      "Agent routing is currently available only for development mode.",
    )
  }

  const fallbackTemplateId = sanitizeDirectCreateFallbackTemplateId(
    input.modeId,
    input.fallbackTemplateId,
  )
  const sanitizedInput =
    fallbackTemplateId === input.fallbackTemplateId
      ? input
      : { ...input, fallbackTemplateId }
  const allowedOptions = filterDirectCreateEntryOptions(
    input.modeId,
    buildAllowedOptionMap(input.allowedOptions || [], templates),
  )
  const boundedOptions =
    allowedOptions.length > 0
      ? allowedOptions.map(({ template, ...option }) => option)
      : fallbackTemplateId
        ? [{ templateId: fallbackTemplateId, label: "Default start" }]
        : []
  const intentOptions = input.helpModeHint
    ? filterOptionsForIntent(boundedOptions, input.helpModeHint)
    : boundedOptions
  const optionsAfterIntent =
    intentOptions.length > 0 ? intentOptions : boundedOptions
  const constrainedOptions = normalize(input.templateConstraintId)
    ? optionsAfterIntent.filter(
        (option) => option.templateId === normalize(input.templateConstraintId),
      )
    : optionsAfterIntent
  const effectiveOptions =
    constrainedOptions.length > 0 ? constrainedOptions : optionsAfterIntent
  if (effectiveOptions.length === 0) {
    throw new Error(
      "No allowed starting points are available for this request.",
    )
  }

  const agentDecision = await runAgentRouteDecision(
    sanitizedInput,
    projectInspection,
    effectiveOptions,
  )
  if (!agentDecision) {
    throw new Error(ROUTER_FAILURE_MESSAGE)
  }

  if (agentDecision.kind === "clarification") {
    return {
      recommendedTemplateId: agentDecision.recommendedTemplateId,
      alternateTemplateIds: agentDecision.alternateTemplateIds || [],
      reason: agentDecision.reason || agentDecision.clarification.message,
      projectInspection,
      seed: buildRouteSeed(
        agentDecision.recommendedTemplateId,
        projectInspection,
        input.requestedResult || "",
      ),
      confidence: agentDecision.confidence ?? 0.7,
      source: "agent",
      clarification: agentDecision.clarification,
    }
  }

  return {
    recommendedTemplateId: agentDecision.recommendedTemplateId,
    alternateTemplateIds: agentDecision.alternateTemplateIds || [],
    reason:
      agentDecision.reason ||
      "Recommended from the current request and project context.",
    projectInspection,
    seed: buildRouteSeed(
      agentDecision.recommendedTemplateId,
      projectInspection,
      input.requestedResult || "",
    ),
    confidence: agentDecision.confidence ?? 0.8,
    source: "agent",
    clarification: null,
  }
}
