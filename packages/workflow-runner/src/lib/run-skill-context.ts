import { readFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import type { DiscoveredSkill } from "../schema.js"

interface SkillContextLogger {
  warn?(
    component: string,
    event: string,
    context?: Record<string, unknown>,
  ): void
}

export interface ResolvedSkillContext {
  text: string
  skillPaths: string[]
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === "string") return code
  }
  return undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function normalizeSkillLookupRef(ref: string): string {
  return ref.trim().toLowerCase()
}

export function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content
  const end = content.indexOf("\n---", 3)
  if (end === -1) return content
  return content.slice(end + 4).trim()
}

export function labelFromSkillPath(path: string): string {
  const normalized = path.replace(/\\/g, "/")
  if (normalized.endsWith("/SKILL.md")) {
    return basename(dirname(path))
  }
  if (normalized.endsWith(".md")) {
    return basename(path, ".md")
  }
  return basename(path)
}

export function buildSkillPathHint(path: string): string {
  const skillDir = path.endsWith(".md") ? dirname(path) : path
  const lines = [
    `Skill root directory: ${skillDir}`,
    "Use this real directory for any referenced checklists, templates, scripts, or sibling files.",
  ]

  const skillName = basename(skillDir)
  const packDir = dirname(skillDir)
  if (basename(packDir) === "gstack") {
    const reviewDir = join(packDir, "review")
    const qaDir = join(packDir, "qa")
    const browseDir = join(packDir, "browse")
    const binDir = join(packDir, "bin")
    lines.push(
      `If the instructions mention ".claude/skills/${skillName}", ".claude/skills/gstack/${skillName}", or "~/.claude/skills/gstack/${skillName}", use "${skillDir}" instead.`,
    )
    lines.push(
      `If the instructions mention ".claude/skills/gstack" or "~/.claude/skills/gstack", use "${packDir}" instead.`,
    )
    lines.push(`Sibling gstack skill pack directory: ${packDir}`)
    lines.push(
      `Resolve ".claude/skills/review/..." or "review/..." references under "${reviewDir}".`,
    )
    lines.push(`Resolve "qa/..." references under "${qaDir}".`)
    lines.push(`Resolve "browse/..." references under "${browseDir}".`)
    lines.push(`Resolve "bin/..." helper references under "${binDir}".`)
  }

  return lines.join("\n")
}

export function createSkillContextResolver(
  logger: SkillContextLogger,
  workspace: string,
  projectPath: string | undefined,
  scanSkills?: (scanRoot: string) => Promise<DiscoveredSkill[]>,
) {
  const contextCache = new Map<string, ResolvedSkillContext>()
  const skillBodyCache = new Map<string, string>()
  let scannedSkills: DiscoveredSkill[] | null = null

  const ensureScannedSkills = async () => {
    if (scannedSkills) return scannedSkills
    if (!scanSkills) {
      scannedSkills = []
      return scannedSkills
    }
    const scanRoot = projectPath || workspace
    try {
      scannedSkills = await scanSkills(scanRoot)
    } catch (error) {
      logger.warn?.("workflow-runner", "skill_context_scan_skills_failed", {
        scanRoot,
        error: errorMessage(error),
      })
      scannedSkills = []
    }
    return scannedSkills
  }

  const readSkillBody = async (path: string): Promise<string> => {
    const cached = skillBodyCache.get(path)
    if (cached !== undefined) return cached
    try {
      const content = await readFile(path, "utf-8")
      const body = stripFrontmatter(content).trim()
      skillBodyCache.set(path, body)
      return body
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        logger.warn?.("workflow-runner", "skill_context_skill_read_failed", {
          path,
          error: errorMessage(error),
        })
      }
      skillBodyCache.set(path, "")
      return ""
    }
  }

  return async (input: {
    skillRefs?: string[]
    skillPaths?: string[]
  }): Promise<ResolvedSkillContext> => {
    const refs = (input.skillRefs || [])
      .map((ref) => ref.trim())
      .filter(Boolean)
    const skillPaths = (input.skillPaths || [])
      .map((path) => path.trim())
      .filter(Boolean)
    if (refs.length === 0 && skillPaths.length === 0)
      return { text: "", skillPaths: [] }

    const cacheKey = [
      ...refs.map((ref) => `ref:${normalizeSkillLookupRef(ref)}`),
      ...skillPaths.map((path) => `path:${path}`),
    ].join("|")
    const cached = contextCache.get(cacheKey)
    if (cached !== undefined) return cached

    const sections: string[] = []
    const seenPaths = new Set<string>()

    for (const skillPath of skillPaths) {
      if (seenPaths.has(skillPath)) continue
      seenPaths.add(skillPath)
      const body = await readSkillBody(skillPath)
      const label = labelFromSkillPath(skillPath)
      if (!body) {
        sections.push(
          `### Skill: ${label}\nSkill file was found but could not be read.`,
        )
        continue
      }
      sections.push(
        `### Skill: ${label}\n${buildSkillPathHint(skillPath)}\n\n${body}`,
      )
    }

    const discovered = refs.length > 0 ? await ensureScannedSkills() : []
    for (const ref of refs) {
      const normalizedRef = normalizeSkillLookupRef(ref)
      const found = discovered.find(
        (skill) =>
          normalizeSkillLookupRef(`${skill.category}/${skill.name}`) ===
            normalizedRef ||
          normalizeSkillLookupRef(skill.name) === normalizedRef,
      )

      if (!found) {
        sections.push(
          `### Skill: ${ref}\nSkill not found in scanned project/user skills.`,
        )
        continue
      }
      if (seenPaths.has(found.path)) continue
      seenPaths.add(found.path)

      const body = await readSkillBody(found.path)
      if (!body) {
        sections.push(
          `### Skill: ${found.category}/${found.name}\nSkill file was found but could not be read.`,
        )
        continue
      }
      sections.push(
        `### Skill: ${found.category}/${found.name}\n${buildSkillPathHint(found.path)}\n\n${body}`,
      )
    }

    const context = {
      text: sections.join("\n\n"),
      skillPaths: Array.from(seenPaths),
    }
    contextCache.set(cacheKey, context)
    return context
  }
}
