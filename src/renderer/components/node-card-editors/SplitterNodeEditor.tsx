import type { SplitterNodeConfig } from "@shared/types"
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

export function SplitterNodeEditor({
  nodeId,
  config,
  onConfigChange,
  validationErrors,
}: {
  nodeId: string
  config: SplitterNodeConfig
  onConfigChange: (config: SplitterNodeConfig) => void
  validationErrors?: ValidationError[]
}) {
  const strategyError = getFieldError(validationErrors, "strategy")
  const maxBranchesError = getFieldError(validationErrors, "maxBranches")
  const strategyErrorId = `split-strategy-error-${nodeId}`
  const maxBranchesErrorId = `max-branches-error-${nodeId}`

  return (
    <div className={EDITOR_PANEL_CLASS}>
      <div>
        <Label htmlFor={`split-strategy-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Decomposition Strategy
          <RequiredMark />
        </Label>
        <TextareaWithMention
          id={`split-strategy-${nodeId}`}
          value={config.strategy || ""}
          onChange={(event) => onConfigChange({ ...config, strategy: event.target.value })}
          rows={2}
          className="min-h-20 resize-y font-mono text-body-sm"
          placeholder="e.g. Split by page section, Split by topic..."
          aria-invalid={Boolean(strategyError) || undefined}
          aria-describedby={strategyError ? strategyErrorId : undefined}
        />
        <FieldErrorMessage id={strategyErrorId} error={strategyError} />
        <p className="mt-1 ui-meta-text text-muted-foreground">
          Describe how to break work into independent subtasks. Clear strategy = more stable fan-out.
        </p>
      </div>
      <p className="ui-meta-text text-muted-foreground">Provider and model are controlled from the flow Input step.</p>
      <div className="flex items-center gap-3">
        <Label htmlFor={`max-branches-${nodeId}`} className="ui-meta-text text-muted-foreground">
          Max branches
        </Label>
        <ClampedNumberInput
          id={`max-branches-${nodeId}`}
          min={1}
          max={20}
          value={config.maxBranches || 8}
          onChange={(value) => onConfigChange({ ...config, maxBranches: value })}
          className="w-20 h-control-md px-2 py-1 text-body-sm text-center"
          aria-invalid={Boolean(maxBranchesError) || undefined}
          aria-describedby={maxBranchesError ? maxBranchesErrorId : undefined}
        />
        <FieldErrorMessage id={maxBranchesErrorId} error={maxBranchesError} />
      </div>

      <RuntimePolicyEditor
        nodeId={nodeId}
        config={config}
        onConfigChange={onConfigChange as (next: RuntimeConfigurableNodeConfig) => void}
      />
    </div>
  )
}
