import { FileStack, Inbox, Loader2 } from "lucide-react"
import { BadgeGroup } from "@/components/factory/FactoryPagePrimitives"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SectionHeading } from "@/components/ui/page-shell"
import { SummaryRail } from "@/components/ui/summary-rail"
import { Textarea } from "@/components/ui/textarea"
import { formatResultModeLabel } from "@/lib/result-mode-factory"
import type { ProjectFactoryDefinition } from "@shared/types"
import {
  formatFactoryDate,
  type FactoryBlueprintDraft,
  type FactoryOption,
  type FactoryPackRecipe,
} from "@/components/factory/factory-page-helpers"

interface BlueprintFormProps {
  draft: FactoryBlueprintDraft
  editing: boolean
  error: string | null
  loading: boolean
  saving: boolean
  selectedFactoryDefinition: ProjectFactoryDefinition | null
  selectedFactoryOption: FactoryOption | null
  selectedPackRecipes: FactoryPackRecipe[]
  onCancelEditing: () => void
  onFieldChange: (key: keyof FactoryBlueprintDraft, value: string) => void
  onOpenArtifacts: () => void
  onOpenInbox: () => void
  onSave: () => void
  onStartEditing: () => void
}

export function BlueprintForm({
  draft,
  editing,
  error,
  loading,
  saving,
  selectedFactoryDefinition,
  selectedFactoryOption,
  selectedPackRecipes,
  onCancelEditing,
  onFieldChange,
  onOpenArtifacts,
  onOpenInbox,
  onSave,
  onStartEditing,
}: BlueprintFormProps) {
  return (
    <article className="space-y-4 ui-section-divider pt-4">
      <SectionHeading
        title="Selected outcome"
        meta={
          editing ? (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancelEditing}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={onSave} disabled={saving}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Save outcome
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={onStartEditing}>
              {selectedFactoryOption ? "Edit outcome" : "Define outcome"}
            </Button>
          )
        }
      />

      {error ? (
        <div role="alert" className="ui-alert-danger text-status-danger">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="ui-empty-state-box px-4 py-8">
          Loading the saved outcome and guided path for this project...
        </div>
      ) : editing ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="factory-label">Path name</Label>
              <Input
                id="factory-label"
                value={draft.factoryLabel}
                onChange={(event) =>
                  onFieldChange("factoryLabel", event.target.value)
                }
                placeholder="AI trends content engine"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="factory-outcome-title">Outcome title</Label>
              <Input
                id="factory-outcome-title"
                value={draft.outcomeTitle}
                onChange={(event) =>
                  onFieldChange("outcomeTitle", event.target.value)
                }
                placeholder="30-day AI trends content run"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="factory-outcome-statement">
                Outcome statement
              </Label>
              <Textarea
                id="factory-outcome-statement"
                value={draft.outcomeStatement}
                onChange={(event) =>
                  onFieldChange("outcomeStatement", event.target.value)
                }
                placeholder="Generate 100 strong Facebook posts about AI and agents over the next 30 days."
                rows={4}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="factory-success-signal">Success signal</Label>
                <Input
                  id="factory-success-signal"
                  value={draft.successSignal}
                  onChange={(event) =>
                    onFieldChange("successSignal", event.target.value)
                  }
                  placeholder="Approved calendar and ready-to-publish posts"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="factory-time-horizon">Time horizon</Label>
                <Input
                  id="factory-time-horizon"
                  value={draft.timeHorizon}
                  onChange={(event) =>
                    onFieldChange("timeHorizon", event.target.value)
                  }
                  placeholder="Next 30 days"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="factory-window-start">Window start</Label>
                <Input
                  id="factory-window-start"
                  type="date"
                  value={draft.windowStart}
                  onChange={(event) =>
                    onFieldChange("windowStart", event.target.value)
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="factory-window-end">Window end</Label>
                <Input
                  id="factory-window-end"
                  type="date"
                  value={draft.windowEnd}
                  onChange={(event) =>
                    onFieldChange("windowEnd", event.target.value)
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="factory-target-count">Target count</Label>
                <Input
                  id="factory-target-count"
                  type="number"
                  min={0}
                  value={draft.targetCount}
                  onChange={(event) =>
                    onFieldChange("targetCount", event.target.value)
                  }
                  placeholder="100"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="factory-target-unit">Target unit</Label>
                <Input
                  id="factory-target-unit"
                  value={draft.targetUnit}
                  onChange={(event) =>
                    onFieldChange("targetUnit", event.target.value)
                  }
                  placeholder="posts"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="factory-audience">Audience</Label>
                <Input
                  id="factory-audience"
                  value={draft.audience}
                  onChange={(event) =>
                    onFieldChange("audience", event.target.value)
                  }
                  placeholder="Founders and operators following AI"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="factory-constraints">Constraints</Label>
              <Textarea
                id="factory-constraints"
                value={draft.constraintsText}
                onChange={(event) =>
                  onFieldChange("constraintsText", event.target.value)
                }
                placeholder={
                  "Use company ToV\nNo AI slop\nKeep posts concise and evidence-backed"
                }
                rows={4}
              />
              <p className="ui-meta-text text-muted-foreground">
                One constraint per line.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="factory-recipe-summary">
                Guided path summary
              </Label>
              <Textarea
                id="factory-recipe-summary"
                value={draft.recipeSummary}
                onChange={(event) =>
                  onFieldChange("recipeSummary", event.target.value)
                }
                placeholder="Trend watch -> ideas -> editorial calendar -> draft -> QA -> distribution"
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="factory-stage-order">Path steps</Label>
              <Textarea
                id="factory-stage-order"
                value={draft.stageOrderText}
                onChange={(event) =>
                  onFieldChange("stageOrderText", event.target.value)
                }
                placeholder={
                  "Trend watch\nIdea backlog\nEditorial calendar\nDraft post\nQA review\nDistribution bundle"
                }
                rows={5}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="factory-case-rules">How this scales</Label>
              <Textarea
                id="factory-case-rules"
                value={draft.caseGenerationRulesText}
                onChange={(event) =>
                  onFieldChange("caseGenerationRulesText", event.target.value)
                }
                placeholder={
                  "Editorial calendar -> post tracks\nApproved sample set -> scale production"
                }
                rows={4}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="factory-quality-policy">Quality rules</Label>
                <Textarea
                  id="factory-quality-policy"
                  value={draft.qualityPolicyText}
                  onChange={(event) =>
                    onFieldChange("qualityPolicyText", event.target.value)
                  }
                  placeholder={"Voice-locked\nNo-slop review\nPublish approval"}
                  rows={4}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="factory-checkpoints">
                  Strategist checkpoints
                </Label>
                <Textarea
                  id="factory-checkpoints"
                  value={draft.strategistCheckpointsText}
                  onChange={(event) =>
                    onFieldChange(
                      "strategistCheckpointsText",
                      event.target.value,
                    )
                  }
                  placeholder={
                    "Approve direction\nApprove calendar\nApprove sample quality"
                  }
                  rows={4}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="factory-artifact-contracts">
                Reusable results
              </Label>
              <Textarea
                id="factory-artifact-contracts"
                value={draft.artifactContractsText}
                onChange={(event) =>
                  onFieldChange("artifactContractsText", event.target.value)
                }
                placeholder={
                  "Trend Digest\nIdea Backlog\nEditorial Calendar\nDraft\nQA Report\nDistribution Bundle"
                }
                rows={4}
              />
            </div>
          </div>
        </div>
      ) : selectedFactoryDefinition || selectedFactoryOption ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-title-sm text-foreground">
                  {selectedFactoryDefinition?.outcome?.title ||
                    selectedFactoryOption?.label ||
                    "Untitled lab"}
                </h3>
                <Badge variant="outline" className="ui-meta-text px-2 py-0">
                  {formatResultModeLabel(selectedFactoryDefinition?.modeId)}
                </Badge>
              </div>
              <p className="text-body-sm text-muted-foreground">
                {selectedFactoryDefinition?.outcome?.statement ||
                  selectedFactoryOption?.summary ||
                  "No saved outcome statement yet."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onOpenArtifacts}>
                <FileStack size={14} />
                Results
              </Button>
              <Button variant="outline" size="sm" onClick={onOpenInbox}>
                <Inbox size={14} />
                Inbox
              </Button>
            </div>
          </div>

          <SummaryRail
            items={[
              {
                label: "Success signal",
                value:
                  selectedFactoryDefinition?.outcome?.successSignal ||
                  "Not defined",
              },
              {
                label: "Time horizon",
                value:
                  selectedFactoryDefinition?.outcome?.timeHorizon ||
                  "Not defined",
              },
              {
                label: "Window",
                value:
                  selectedFactoryDefinition?.outcome?.windowStart ||
                  selectedFactoryDefinition?.outcome?.windowEnd
                    ? `${formatFactoryDate(selectedFactoryDefinition?.outcome?.windowStart)} -> ${formatFactoryDate(selectedFactoryDefinition?.outcome?.windowEnd)}`
                    : "Not defined",
              },
              {
                label: "Target",
                value:
                  typeof selectedFactoryDefinition?.outcome?.targetCount ===
                  "number"
                    ? `${selectedFactoryDefinition.outcome.targetCount}${selectedFactoryDefinition.outcome.targetUnit ? ` ${selectedFactoryDefinition.outcome.targetUnit}` : ""}`
                    : "Not defined",
              },
              {
                label: "Audience",
                value:
                  selectedFactoryDefinition?.outcome?.audience || "Not defined",
              },
            ]}
            className="xl:grid-cols-5"
            compact
          />

          <BadgeGroup
            label="Constraints"
            items={selectedFactoryDefinition?.outcome?.constraints || []}
            emptyLabel="No constraints"
          />
        </div>
      ) : (
        <div className="ui-empty-state-box px-4 py-8">
          No saved outcome yet.
        </div>
      )}
    </article>
  )
}
