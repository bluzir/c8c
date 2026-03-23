import { mkdir, stat } from "node:fs/promises"
import { join, dirname, resolve } from "node:path"
import type { Workflow, SkillNodeConfig } from "@shared/types"
import YAML from "yaml"
import { isWithinRoot } from "./security-paths"
import { writeFileAtomic } from "./atomic-write"

interface AvailableSkill {
  name: string
  category: string
}

const WEB_ACCESS_HINT_RE =
  /https?:\/\/|www\.|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b|\b(website|site|url|domain|internet|online|browse|crawl|scrape|fetch|web\s*search|search the web)\b/i
const INFERRED_WEB_TOOLS = ["WebFetch", "WebSearch"] as const

function uniqueStrings(values: string[] | undefined): string[] | undefined {
  if (!values || values.length === 0) return undefined
  const deduped = [
    ...new Set(values.map((value) => value.trim()).filter(Boolean)),
  ]
  return deduped.length > 0 ? deduped : undefined
}

function appendUnique(values: string[] | undefined, item: string): string[] {
  return [...new Set([...(values || []), item])]
}

function shouldInferWebAccess(config: SkillNodeConfig): boolean {
  const text = `${config.skillRef || ""}\n${config.prompt || ""}`
  return WEB_ACCESS_HINT_RE.test(text)
}

function resolveAllowedTools(config: SkillNodeConfig): string[] | undefined {
  const explicitAllowed = uniqueStrings(config.allowedTools)
  if (!shouldInferWebAccess(config)) return explicitAllowed

  const disallowed = new Set(uniqueStrings(config.disallowedTools) || [])
  const inferred = INFERRED_WEB_TOOLS.filter((tool) => !disallowed.has(tool))
  return uniqueStrings([...(explicitAllowed || []), ...inferred])
}

export async function scaffoldMissingSkills(
  workflow: Workflow,
  availableSkills: AvailableSkill[],
  projectPath: string,
): Promise<Workflow> {
  const knownRefs = new Set(
    availableSkills.map((s) => `${s.category}/${s.name}`),
  )

  const updatedNodes = [...workflow.nodes]

  const skillsRoot = resolve(projectPath, ".claude", "skills")

  const assertSafePathPart = (part: string): string => {
    const value = part.trim()
    if (
      !value ||
      value === "." ||
      value === ".." ||
      value.includes("/") ||
      value.includes("\\") ||
      value.includes("\0")
    ) {
      throw new Error(`Invalid skillRef segment: "${part}"`)
    }
    return value
  }

  for (let i = 0; i < updatedNodes.length; i++) {
    const node = updatedNodes[i]
    if (node.type !== "skill") continue

    const config = node.config as SkillNodeConfig
    if (!config.skillRef) continue
    if (knownRefs.has(config.skillRef)) continue
    const skillRef = config.skillRef
    const allowedTools = resolveAllowedTools(config)
    const enrichedConfig: SkillNodeConfig = {
      ...config,
      ...(allowedTools ? { allowedTools } : {}),
    }

    // Parse category/name from skillRef
    const parts = skillRef.split("/")
    let category: string
    let name: string
    if (parts.length >= 2) {
      category = parts.slice(0, -1).map(assertSafePathPart).join("/")
      name = assertSafePathPart(parts[parts.length - 1] || "")
    } else {
      category = "generated"
      name = assertSafePathPart(parts[0] || "")
    }

    const skillPath = resolve(
      projectPath,
      ".claude",
      "skills",
      category,
      `${name}.md`,
    )
    if (!isWithinRoot(skillPath, skillsRoot)) {
      throw new Error("Resolved skill path is outside project skills directory")
    }

    // Skip file creation if already exists, but still set skillPaths
    try {
      await stat(skillPath)
      updatedNodes[i] = {
        ...node,
        config: {
          ...enrichedConfig,
          skillPaths: appendUnique(enrichedConfig.skillPaths, skillPath),
        },
      }
      continue
    } catch {
      // File doesn't exist — create it below
    }

    const description = enrichedConfig.prompt
      ? enrichedConfig.prompt.slice(0, 120).replace(/\n/g, " ")
      : name

    const frontmatterData: Record<string, unknown> = { name, description }
    if (allowedTools && allowedTools.length > 0) {
      frontmatterData.allowedTools = allowedTools
    }
    const frontmatter = YAML.stringify(frontmatterData).trimEnd()
    const content = `---\n${frontmatter}\n---\n\n${enrichedConfig.prompt || `Instructions for ${name}`}\n`

    await mkdir(dirname(skillPath), { recursive: true })
    await writeFileAtomic(skillPath, content)

    // Set skillPaths on the node config
    updatedNodes[i] = {
      ...node,
      config: {
        ...enrichedConfig,
        skillPaths: appendUnique(enrichedConfig.skillPaths, skillPath),
      },
    }
  }

  return { ...workflow, nodes: updatedNodes }
}
