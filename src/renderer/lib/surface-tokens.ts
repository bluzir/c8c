/**
 * Surface-token helpers — maps semantic tone/severity to CSS utility classes.
 *
 * Centralises the tone → surface mapping so individual components don't
 * reinvent which `surface-*-soft` class to use.
 */

export type SurfaceTone = "success" | "warning" | "danger" | "info" | "neutral"

const TONE_SURFACE_MAP: Record<SurfaceTone, string> = {
  success: "surface-success-soft",
  warning: "surface-warning-soft",
  danger: "surface-danger-soft",
  info: "surface-info-soft",
  neutral: "ui-inset-well",
}

const TONE_BADGE_MAP: Record<SurfaceTone, string> = {
  success: "ui-status-badge ui-status-badge-success",
  warning: "ui-status-badge ui-status-badge-warning",
  danger: "ui-status-badge ui-status-badge-danger",
  info: "ui-status-badge ui-status-badge-info",
  neutral: "ui-status-badge border border-hairline",
}

/** Returns the soft-surface class for a given tone. */
export function toneToSurface(tone: SurfaceTone): string {
  return TONE_SURFACE_MAP[tone]
}

/** Returns the status badge class for a given tone. */
export function toneToBadge(tone: SurfaceTone): string {
  return TONE_BADGE_MAP[tone]
}
