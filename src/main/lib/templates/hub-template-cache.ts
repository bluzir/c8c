import { readFile, writeFile, mkdir, stat } from "node:fs/promises"
import { join } from "node:path"
import type { WorkflowTemplate } from "@shared/types"
import { fetchRemoteTemplate } from "./remote"
import { getHubCatalogGeneratedAt } from "./hub-catalog"
import { logInfo, logWarn } from "../structured-log"
import { resolveAppHomeDir } from "../runtime-paths"

function cacheDir(): string {
  return join(resolveAppHomeDir(), ".c8c", "hub-templates")
}

function templateCachePath(id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9._-]+/g, "-")
  return join(cacheDir(), `${safeId}.json`)
}

interface CachedTemplate {
  catalogGeneratedAt: string
  template: WorkflowTemplate
}

async function readCachedTemplate(id: string): Promise<CachedTemplate | null> {
  try {
    const raw = await readFile(templateCachePath(id), "utf8")
    const parsed = JSON.parse(raw) as CachedTemplate
    if (!parsed.template?.id || !parsed.catalogGeneratedAt) return null
    return parsed
  } catch {
    return null
  }
}

async function writeCachedTemplate(
  id: string,
  template: WorkflowTemplate,
  catalogGeneratedAt: string,
): Promise<void> {
  try {
    await mkdir(cacheDir(), { recursive: true })
    const entry: CachedTemplate = { catalogGeneratedAt, template }
    await writeFile(templateCachePath(id), JSON.stringify(entry), "utf8")
  } catch (error) {
    logWarn("hub-template-cache", "write_failed", {
      id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Get a full hub template by ID.
 * Uses local cache if fresh (matches current catalog generation),
 * otherwise fetches from hub and caches.
 */
export async function getHubTemplate(id: string): Promise<WorkflowTemplate> {
  const catalogGeneratedAt = getHubCatalogGeneratedAt()

  // Try local cache
  const cached = await readCachedTemplate(id)
  if (
    cached &&
    catalogGeneratedAt &&
    cached.catalogGeneratedAt === catalogGeneratedAt
  ) {
    logInfo("hub-template-cache", "cache_hit", { id })
    return cached.template
  }

  // Fetch from hub
  logInfo("hub-template-cache", "fetching", { id })
  const template = await fetchRemoteTemplate(id)
  template.source = "hub"

  // Cache with current catalog generation
  if (catalogGeneratedAt) {
    await writeCachedTemplate(id, template, catalogGeneratedAt)
  }

  return template
}
