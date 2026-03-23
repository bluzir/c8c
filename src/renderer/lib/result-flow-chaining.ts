import type { ArtifactRecord, WorkflowTemplate } from "@shared/types"

function resolveContractMatch(
  template: WorkflowTemplate,
  availableKinds: Set<string>,
) {
  const contracts = template.contractIn || []
  if (contracts.length === 0) return null

  const requiredKinds = contracts
    .filter((contract) => contract.required !== false)
    .map((contract) => contract.kind)
  const optionalKinds = contracts
    .filter((contract) => contract.required === false)
    .map((contract) => contract.kind)

  const requiredMatchCount = requiredKinds.filter((kind) =>
    availableKinds.has(kind),
  ).length
  const optionalMatchCount = optionalKinds.filter((kind) =>
    availableKinds.has(kind),
  ).length

  if (requiredKinds.length > 0 && requiredMatchCount !== requiredKinds.length) {
    return null
  }

  if (requiredKinds.length === 0 && optionalMatchCount === 0) {
    return null
  }

  return {
    template,
    requiredMatchCount,
    optionalMatchCount,
    structuralMatchCount: requiredMatchCount + optionalMatchCount,
    optionalOnly: requiredKinds.length === 0,
  }
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
    .map((template) => resolveContractMatch(template, availableKinds))
    .filter(
      (
        entry,
      ): entry is {
        template: WorkflowTemplate
        requiredMatchCount: number
        optionalMatchCount: number
        structuralMatchCount: number
        optionalOnly: boolean
      } => Boolean(entry),
    )
    .sort((left, right) => {
      if (left.optionalOnly !== right.optionalOnly) {
        return left.optionalOnly ? 1 : -1
      }
      if (left.requiredMatchCount !== right.requiredMatchCount) {
        return right.requiredMatchCount - left.requiredMatchCount
      }
      if (left.optionalMatchCount !== right.optionalMatchCount) {
        return right.optionalMatchCount - left.optionalMatchCount
      }
      if (left.structuralMatchCount !== right.structuralMatchCount) {
        return right.structuralMatchCount - left.structuralMatchCount
      }
      return left.template.name.localeCompare(right.template.name)
    })
    .slice(0, limit)
    .map((entry) => entry.template)
}
