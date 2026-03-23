import type { CreateEntryRouteOption, ResultModeId } from "./types"

export const DEVELOPMENT_BANNED_DIRECT_ENTRY_TEMPLATE_IDS = new Set([
  "delivery-implement-phase",
  "delivery-verify-phase",
  "gstack-preflight-gate",
])

export function isBannedDirectCreateEntryTemplateId(
  modeId: ResultModeId,
  templateId: string,
): boolean {
  if (modeId !== "development") return false
  return DEVELOPMENT_BANNED_DIRECT_ENTRY_TEMPLATE_IDS.has(templateId)
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
