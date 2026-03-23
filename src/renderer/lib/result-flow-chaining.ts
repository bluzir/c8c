import type { ArtifactRecord, WorkflowTemplate } from "@shared/types"

function requiredContractKinds(template: WorkflowTemplate) {
  return (template.contractIn || [])
    .filter((contract) => contract.required !== false)
    .map((contract) => contract.kind)
}

export function selectTemplatesForResultChaining({
  templates,
  sourceArtifacts,
  limit = 3,
}: {
  templates: WorkflowTemplate[]
  sourceArtifacts: ArtifactRecord[]
  limit?: number
}) {
  const availableKinds = new Set(
    sourceArtifacts.map((artifact) => artifact.kind),
  )
  if (availableKinds.size === 0) return []

  return templates
    .map((template) => {
      const contractKinds = requiredContractKinds(template)
      if (contractKinds.length === 0) return null
      if (!contractKinds.every((kind) => availableKinds.has(kind))) return null

      return {
        template,
        matchCount: contractKinds.length,
      }
    })
    .filter(
      (entry): entry is { template: WorkflowTemplate; matchCount: number } =>
        Boolean(entry),
    )
    .sort((left, right) => {
      if (left.matchCount !== right.matchCount)
        return right.matchCount - left.matchCount
      return left.template.name.localeCompare(right.template.name)
    })
    .slice(0, limit)
    .map((entry) => entry.template)
}
