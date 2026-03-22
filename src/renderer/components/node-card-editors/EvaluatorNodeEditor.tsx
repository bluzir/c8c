import type { EvaluatorNodeConfig } from "@shared/types"
import { TextareaWithMention } from "@/components/input/TextareaWithMention"
import { Label } from "@/components/ui/label"
import type { ValidationError } from "@/lib/validate-workflow"
import {
  ClampedNumberInput,
  EDITOR_PANEL_CLASS,
  FieldErrorMessage,
  getFieldError,
  RequiredMark,
  RuntimePolicyEditor,
  type RuntimeConfigurableNodeConfig,
} from "./shared"

export function EvaluatorNodeEditor({
  nodeId,
  config,
  onConfigChange,
  validationErrors,
}: {
  nodeId: string
  config: EvaluatorNodeConfig
  onConfigChange: (config: EvaluatorNodeConfig) => void
  validationErrors?: ValidationError[]
}) {
  const criteriaError = getFieldError(validationErrors, "criteria")
  const thresholdError = getFieldError(validationErrors, "threshold")
  const maxRetriesError = getFieldError(validationErrors, "maxRetries")
  const criteriaErrorId = `criteria-error-${nodeId}`
  const thresholdErrorId = `threshold-error-${nodeId}`
  const maxRetriesErrorId = `max-retries-error-${nodeId}`

  return (
    <div className={EDITOR_PANEL_CLASS}>
      <div>
        <Label htmlFor={`criteria-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Criteria
          <RequiredMark />
        </Label>
        <TextareaWithMention
          id={`criteria-${nodeId}`}
          value={config.criteria || ""}
          onChange={(event) => onConfigChange({ ...config, criteria: event.target.value })}
          rows={3}
          className="min-h-20 resize-y font-mono text-body-sm"
          placeholder="Score 1-10 on clarity, engagement, CTA strength..."
          aria-invalid={Boolean(criteriaError) || undefined}
          aria-describedby={criteriaError ? criteriaErrorId : undefined}
        />
        <FieldErrorMessage id={criteriaErrorId} error={criteriaError} />
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor={`threshold-${nodeId}`} className="ui-meta-text text-muted-foreground">
            Threshold
          </Label>
          <ClampedNumberInput
            id={`threshold-${nodeId}`}
            min={1}
            max={10}
            value={config.threshold}
            onChange={(value) => onConfigChange({ ...config, threshold: value })}
            className="w-16 h-control-sm px-2 text-body-sm text-center"
            aria-invalid={Boolean(thresholdError) || undefined}
            aria-describedby={thresholdError ? thresholdErrorId : undefined}
          />
          <span className="ui-meta-text text-muted-foreground">/10</span>
        </div>
        <FieldErrorMessage id={thresholdErrorId} error={thresholdError} />

        <div className="flex items-center gap-2">
          <Label htmlFor={`max-retries-${nodeId}`} className="ui-meta-text text-muted-foreground">
            Max Retries
          </Label>
          <ClampedNumberInput
            id={`max-retries-${nodeId}`}
            min={1}
            max={10}
            value={config.maxRetries}
            onChange={(value) => onConfigChange({ ...config, maxRetries: value })}
            className="w-16 h-control-sm px-2 text-body-sm text-center"
            aria-invalid={Boolean(maxRetriesError) || undefined}
            aria-describedby={maxRetriesError ? maxRetriesErrorId : undefined}
          />
        </div>
        <FieldErrorMessage id={maxRetriesErrorId} error={maxRetriesError} />
      </div>

      <RuntimePolicyEditor
        nodeId={nodeId}
        config={config}
        onConfigChange={onConfigChange as (next: RuntimeConfigurableNodeConfig) => void}
      />
    </div>
  )
}
