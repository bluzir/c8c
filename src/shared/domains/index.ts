import type { ResultModeId } from "../types"
import type { DomainDefinition } from "./types"

const DOMAINS: DomainDefinition[] = []
const DOMAIN_MAP = new Map<ResultModeId, DomainDefinition>()

export function registerDomain(domain: DomainDefinition): void {
  if (DOMAIN_MAP.has(domain.id)) return
  DOMAINS.push(domain)
  DOMAIN_MAP.set(domain.id, domain)
}

export function getDomain(id: ResultModeId): DomainDefinition {
  const domain = DOMAIN_MAP.get(id)
  if (domain) return domain
  if (DOMAINS.length > 0) return DOMAINS[0]
  throw new Error(`No domains registered. Call initDomains() first.`)
}

export function allDomains(): readonly DomainDefinition[] {
  return DOMAINS
}

export function isGuidedDomain(id: ResultModeId): boolean {
  return DOMAIN_MAP.has(id) && getDomain(id).guidedRouting
}

export function isIntentEnabledDomain(id: ResultModeId): boolean {
  return DOMAIN_MAP.has(id) && getDomain(id).intentsEnabled
}

export type {
  DomainDefinition,
  DomainQuickStart,
  ResultModeConfigField,
} from "./types"
