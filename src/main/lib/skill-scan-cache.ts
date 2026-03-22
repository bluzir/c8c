import type { DiscoveredSkill } from "@shared/types"
import { scanAllSkills } from "./skill-scanner"

const DEFAULT_SKILL_SCAN_CACHE_TTL_MS = 30_000

interface SkillScanCacheEntry {
  expiresAt: number
  promise?: Promise<DiscoveredSkill[]>
  value?: DiscoveredSkill[]
}

const skillScanCache = new Map<string, SkillScanCacheEntry>()

function skillScanCacheTtlMs(): number {
  const raw = Number(process.env.C8C_SKILL_SCAN_CACHE_TTL_MS)
  if (Number.isFinite(raw) && raw >= 0) {
    return Math.max(0, Math.floor(raw))
  }
  return DEFAULT_SKILL_SCAN_CACHE_TTL_MS
}

export function invalidateProjectSkillScan(projectPath?: string): void {
  if (!projectPath) {
    skillScanCache.clear()
    return
  }
  skillScanCache.delete(projectPath)
}

export async function getCachedProjectSkills(projectPath: string): Promise<DiscoveredSkill[]> {
  const ttlMs = skillScanCacheTtlMs()
  const now = Date.now()
  const cached = skillScanCache.get(projectPath)

  if (cached?.value && cached.expiresAt > now) {
    return cached.value
  }

  if (cached?.promise) {
    return cached.promise
  }

  const promise = scanAllSkills(projectPath).then((skills) => {
    skillScanCache.set(projectPath, {
      value: skills,
      expiresAt: Date.now() + ttlMs,
    })
    return skills
  }).catch((error) => {
    if (skillScanCache.get(projectPath)?.promise === promise) {
      skillScanCache.delete(projectPath)
    }
    throw error
  })

  skillScanCache.set(projectPath, {
    promise,
    expiresAt: now + ttlMs,
  })
  return promise
}
