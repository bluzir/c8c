import type { DiscoveredSkill, SkillCategoryNode } from "@shared/types"

function normalizeTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

export function toSkillRef(
  skill: Pick<DiscoveredSkill, "category" | "name">,
): string {
  return `${skill.category}/${skill.name}`
}

export function scoreSkillMatch(
  skill: Pick<DiscoveredSkill, "name" | "category" | "description">,
  query: string,
): number {
  const terms = normalizeTerms(query)
  if (terms.length === 0) return 0

  const searchable =
    `${skill.name} ${skill.category} ${skill.description}`.toLowerCase()
  let score = 0

  for (const term of terms) {
    if (skill.name.toLowerCase() === term) {
      score += 10
    } else if (skill.name.toLowerCase().includes(term)) {
      score += 5
    }
    if (skill.category.toLowerCase().includes(term)) {
      score += 3
    }
    if (skill.description.toLowerCase().includes(term)) {
      score += 2
    }
    if (searchable.includes(term)) {
      score += 1
    }
  }

  return score
}

/**
 * Build a category tree from flat skill list.
 * Skills have category like "marketing/seo" or "code/analysis".
 */
export function buildCategoryTree(
  skills: DiscoveredSkill[],
): SkillCategoryNode {
  const root: SkillCategoryNode = {
    name: "root",
    path: "",
    count: 0,
    children: [],
  }

  for (const skill of skills) {
    const parts = skill.category.split("/").filter(Boolean)
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      let child = current.children.find((c) => c.name === part)
      if (!child) {
        child = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          count: 0,
          children: [],
        }
        current.children.push(child)
      }
      current = child
    }

    current.count++
    if (!current.skills) current.skills = []
    current.skills.push({
      name: skill.name,
      description: skill.description,
      skillRef: toSkillRef(skill),
    })
  }

  // Propagate counts up
  function propagateCounts(node: SkillCategoryNode): number {
    let total = node.skills?.length || 0
    for (const child of node.children) {
      total += propagateCounts(child)
    }
    node.count = total
    return total
  }
  propagateCounts(root)

  return root
}

/**
 * Format category tree as a summary string for the system prompt.
 */
export function formatCategoryTreeSummary(root: SkillCategoryNode): string {
  const lines: string[] = [`Skill Categories (${root.count} total):`]

  function renderLevel(node: SkillCategoryNode, indent: number) {
    for (const child of node.children.sort((a, b) => b.count - a.count)) {
      const prefix = "  ".repeat(indent)
      const subcats = child.children.map((c) => c.name).join(", ")
      lines.push(
        `${prefix}${child.name}/ (${child.count})${subcats ? ` — ${subcats}` : ""}`,
      )
      if (indent < 1 && child.children.length > 0) {
        renderLevel(child, indent + 1)
      }
    }
  }

  renderLevel(root, 1)
  return lines.join("\n")
}

/**
 * Browse a specific category path, returning its node.
 */
export function browseCategory(
  root: SkillCategoryNode,
  path?: string,
): SkillCategoryNode | null {
  if (!path) return root

  const parts = path.split("/").filter(Boolean)
  let current = root

  for (const part of parts) {
    const child = current.children.find(
      (c) => c.name.toLowerCase() === part.toLowerCase(),
    )
    if (!child) return null
    current = child
  }

  return current
}

/**
 * Fuzzy search skills by query. Returns top N matches.
 */
export function searchSkills(
  skills: DiscoveredSkill[],
  query: string,
  limit = 20,
): Array<{
  name: string
  category: string
  description: string
  skillRef: string
  score: number
}> {
  const terms = normalizeTerms(query)
  if (terms.length === 0) return []

  const scored = skills.map((skill) => {
    return {
      name: skill.name,
      category: skill.category,
      description: skill.description,
      skillRef: toSkillRef(skill),
      score: scoreSkillMatch(skill, query),
    }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
