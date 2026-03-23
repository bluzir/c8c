import type {
  CreateEntryRouteOption,
  CreateEntryRouteSeed,
  ProjectInspectionSummary,
  ResultModeId,
} from "./types"
import { getDomain } from "./domains"

export function isBannedDirectCreateEntryTemplateId(
  modeId: ResultModeId,
  templateId: string,
): boolean {
  return getDomain(modeId).bannedEntryTemplateIds.has(templateId)
}

export function filterDirectCreateEntryOptions<
  T extends { templateId: string },
>(modeId: ResultModeId, options: T[]): T[] {
  return options.filter(
    (option) => !isBannedDirectCreateEntryTemplateId(modeId, option.templateId),
  )
}

export function sanitizeDirectCreateFallbackTemplateId(
  modeId: ResultModeId,
  fallbackTemplateId?: string | null,
): string | undefined {
  const normalized = (fallbackTemplateId || "").trim()
  if (!normalized) return undefined
  return isBannedDirectCreateEntryTemplateId(modeId, normalized)
    ? undefined
    : normalized
}

const DIRECTORY_ROUTE_TEMPLATES = new Set([
  "delivery-map-codebase",
  "ux-ui-polish-audit",
  "full-stack-code-audit",
])

function normalize(value: string | undefined | null) {
  return (value || "").trim()
}

export function buildCreateEntryRouteSeed(
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

  if (
    templateId === "delivery-verify-phase" ||
    templateId === "delivery-review-phase"
  ) {
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
