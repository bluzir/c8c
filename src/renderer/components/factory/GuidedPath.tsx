import { BadgeGroup } from "@/components/factory/FactoryPagePrimitives"
import {
  dedupePreserveOrder,
  type FactoryOption,
  type FactoryPackRecipe,
} from "@/components/factory/factory-page-helpers"
import { Badge } from "@/components/ui/badge"
import { SectionHeading } from "@/components/ui/page-shell"
import type { ProjectFactoryDefinition } from "@shared/types"

interface GuidedPathProps {
  selectedFactoryDefinition: ProjectFactoryDefinition | null
  selectedFactoryOption: FactoryOption | null
  selectedPackRecipes: FactoryPackRecipe[]
}

export function GuidedPath({
  selectedFactoryDefinition,
  selectedFactoryOption,
  selectedPackRecipes,
}: GuidedPathProps) {
  const hasPathDetails =
    Boolean(selectedFactoryDefinition) || selectedPackRecipes.length > 0

  return (
    <section className="space-y-4 ui-section-divider pt-4">
      <SectionHeading
        title="Guided path"
        meta={
          <Badge variant="outline" className="ui-meta-text px-2 py-0">
            {selectedPackRecipes.length} built-in
          </Badge>
        }
      />

      {!hasPathDetails ? (
        <div className="ui-empty-state-box px-4 py-6">
          Save an outcome to see its built-in path, reusable results, and review
          checkpoints.
        </div>
      ) : (
        <article className="ui-slab space-y-4">
          <div className="space-y-1">
            <h2 className="text-title-sm text-foreground">
              {selectedFactoryOption?.label || "Lab"} path
            </h2>
            <p className="text-body-sm text-muted-foreground">
              {selectedFactoryDefinition?.recipe?.summary ||
                "Steps, contracts, and review points for this outcome."}
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <BadgeGroup
              label="Built-in paths"
              items={dedupePreserveOrder([
                ...(selectedFactoryDefinition?.recipe?.packIds || []).map(
                  (packId) =>
                    selectedPackRecipes.find((recipe) => recipe.id === packId)
                      ?.label || packId,
                ),
                ...selectedPackRecipes.map((recipe) => recipe.label),
              ])}
              emptyLabel="No linked path"
              variant="outline"
            />
            <BadgeGroup
              label="Path steps"
              items={
                selectedFactoryDefinition?.recipe?.stageOrder ||
                selectedPackRecipes[0]?.stageLabels ||
                []
              }
              emptyLabel="No steps yet"
              variant="outline"
            />
            <BadgeGroup
              label="Reusable results"
              items={
                selectedFactoryDefinition?.recipe?.artifactContracts ||
                selectedPackRecipes[0]?.contractLabels ||
                []
              }
              emptyLabel="No contracts yet"
            />
            <BadgeGroup
              label="Quality rules"
              items={
                selectedFactoryDefinition?.recipe?.qualityPolicy ||
                selectedPackRecipes[0]?.policyLabels ||
                []
              }
              emptyLabel="No rules yet"
              variant="info"
            />
            <BadgeGroup
              label="Strategist checkpoints"
              items={
                selectedFactoryDefinition?.recipe?.strategistCheckpoints ||
                selectedPackRecipes[0]?.checkpointLabels ||
                []
              }
              emptyLabel="No checkpoints yet"
              variant="warning"
            />
            <BadgeGroup
              label="Scaling"
              items={
                selectedFactoryDefinition?.recipe?.caseGenerationRules ||
                (selectedPackRecipes[0]
                  ? [selectedPackRecipes[0].caseRule]
                  : [])
              }
              emptyLabel="No scale rule yet"
              variant="success"
            />
          </div>
        </article>
      )}

      {selectedPackRecipes.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {selectedPackRecipes.map((recipe) => (
            <article key={recipe.id} className="ui-slab space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-title-sm text-foreground">
                      {recipe.label}
                    </h2>
                    <Badge variant="outline" className="ui-meta-text px-2 py-0">
                      {recipe.activeCaseCount} track
                      {recipe.activeCaseCount === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-body-sm text-muted-foreground">
                    {recipe.caseRule}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <BadgeGroup
                  label="Steps"
                  items={recipe.stageLabels}
                  emptyLabel="No steps"
                  variant="outline"
                />
                <BadgeGroup
                  label="Results"
                  items={recipe.contractLabels.slice(0, 6)}
                  emptyLabel="No results"
                />
                <BadgeGroup
                  label="Quality"
                  items={recipe.policyLabels.slice(0, 6)}
                  emptyLabel="No rules"
                  variant="info"
                />
                <BadgeGroup
                  label="Checkpoints"
                  items={recipe.checkpointLabels}
                  emptyLabel="No checkpoints"
                  variant="warning"
                />
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}
