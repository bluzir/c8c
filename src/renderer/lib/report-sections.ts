/**
 * Extracts structured findings and limitations from markdown report content.
 *
 * Looks for heading-based sections (## Findings, ## Key Findings, ## Limitations, etc.)
 * and pulls out bullet points from those sections.
 */

export interface ReportSections {
  findings: string[]
  limitations: string[]
}

const FINDINGS_HEADINGS = /^#{1,3}\s+(key\s+)?findings|^#{1,3}\s+issues|^#{1,3}\s+recommendations/i
const LIMITATIONS_HEADINGS = /^#{1,3}\s+limitations|^#{1,3}\s+caveats|^#{1,3}\s+constraints/i

/**
 * Parse markdown content and extract findings + limitations bullet points.
 * Returns empty arrays when no structured sections are found.
 */
export function extractReportSections(content: string | undefined): ReportSections {
  if (!content) return { findings: [], limitations: [] }

  const lines = content.split("\n")
  const findings: string[] = []
  const limitations: string[] = []

  let currentTarget: string[] | null = null

  for (const line of lines) {
    const trimmed = line.trim()

    // Check if this line is a heading that starts a new section
    if (/^#{1,3}\s+/.test(trimmed)) {
      if (FINDINGS_HEADINGS.test(trimmed)) {
        currentTarget = findings
      } else if (LIMITATIONS_HEADINGS.test(trimmed)) {
        currentTarget = limitations
      } else {
        // Any other heading ends the current section
        currentTarget = null
      }
      continue
    }

    // Extract bullet points in the active section
    if (currentTarget !== null) {
      const bulletMatch = trimmed.match(/^[-*]\s+(.+)/)
      if (bulletMatch) {
        const text = bulletMatch[1].trim()
        if (text.length > 0) {
          currentTarget.push(text)
        }
      }
    }
  }

  // Cap at reasonable limits for display
  return {
    findings: findings.slice(0, 8),
    limitations: limitations.slice(0, 5),
  }
}
