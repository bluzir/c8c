/**
 * Lightweight frontmatter/body splitter for skill markdown files.
 * Avoids pulling gray-matter into the renderer bundle.
 */

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export interface ParsedSkillContent {
  frontmatter: string | null
  body: string
}

export function parseSkillContent(raw: string): ParsedSkillContent {
  const match = FRONTMATTER_RE.exec(raw)
  if (!match) return { frontmatter: null, body: raw }
  return { frontmatter: match[1], body: match[2] }
}
