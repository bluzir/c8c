import type { ArtifactContract, ArtifactRecord, ContractWarning } from "@shared/types"

export interface ArtifactResolutionResult {
  matched: ArtifactRecord[]
  warnings: ContractWarning[]
}

export function matchArtifactsToContracts(
  contracts: ArtifactContract[] | undefined,
  artifacts: ArtifactRecord[],
): ArtifactResolutionResult {
  if (!contracts?.length) return { matched: artifacts, warnings: [] }

  const warnings: ContractWarning[] = []
  const firstByKind = new Map<string, ArtifactRecord>()
  for (const a of artifacts) {
    if (!firstByKind.has(a.kind)) firstByKind.set(a.kind, a)
  }

  const matched: ArtifactRecord[] = []
  const seen = new Set<string>()
  for (const contract of contracts) {
    if (seen.has(contract.kind)) continue
    seen.add(contract.kind)
    const artifact = firstByKind.get(contract.kind)
    if (artifact) {
      matched.push(artifact)
    } else if (contract.required !== false) {
      warnings.push({
        kind: "missing_artifact",
        contractKind: contract.kind,
        message: `Expected "${contract.title || contract.kind}" but none was found. The flow will run with your prompt as input instead.`,
      })
    }
  }

  return { matched, warnings }
}
