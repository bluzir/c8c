import type { MergerNodeConfig } from "@shared/types"
import { TextareaWithMention } from "@/components/input/TextareaWithMention"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ValidationError } from "@/lib/validate-workflow"
import {
  EDITOR_PANEL_CLASS,
  FieldErrorMessage,
  getFieldError,
  RuntimePolicyEditor,
  type RuntimeConfigurableNodeConfig,
} from "./shared"

export function MergerNodeEditor({
  nodeId,
  config,
  onConfigChange,
  validationErrors,
}: {
  nodeId: string
  config: MergerNodeConfig
  onConfigChange: (config: MergerNodeConfig) => void
  validationErrors?: ValidationError[]
}) {
  const strategyError = getFieldError(validationErrors, "strategy")
  const promptError = getFieldError(validationErrors, "prompt")
  const strategyErrorId = `merger-strategy-error-${nodeId}`
  const promptErrorId = `merge-prompt-error-${nodeId}`

  return (
    <div className={EDITOR_PANEL_CLASS}>
      <div className="flex items-center gap-3">
        <Label htmlFor={`merger-strategy-${nodeId}`} className="ui-meta-text text-muted-foreground">
          Strategy
        </Label>
        <Select
          value={config.strategy}
          onValueChange={(value) => onConfigChange({ ...config, strategy: value as MergerNodeConfig["strategy"] })}
        >
          <SelectTrigger
            id={`merger-strategy-${nodeId}`}
            className="w-40 h-control-md text-body-sm"
            aria-invalid={Boolean(strategyError) || undefined}
            aria-describedby={strategyError ? strategyErrorId : undefined}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="concatenate">Concatenate</SelectItem>
            <SelectItem value="summarize">Summarize</SelectItem>
            <SelectItem value="select_best">Select Best</SelectItem>
          </SelectContent>
        </Select>
        <FieldErrorMessage id={strategyErrorId} error={strategyError} />
      </div>
      <p className="ui-meta-text text-muted-foreground">
        {config.strategy === "concatenate" && "Concatenate keeps all branch outputs in order without rewriting."}
        {config.strategy === "summarize" && "Summarize compresses all branch outputs into a shorter synthesis."}
        {config.strategy === "select_best" && "Select best picks a single strongest branch output."}
      </p>
      {config.strategy !== "concatenate" && (
        <div>
          <Label htmlFor={`merge-prompt-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
            Merge Instructions
          </Label>
          <TextareaWithMention
            id={`merge-prompt-${nodeId}`}
            value={config.prompt || ""}
            onChange={(event) => onConfigChange({ ...config, prompt: event.target.value })}
            rows={2}
            className="min-h-20 resize-y font-mono text-body-sm"
            placeholder="How to combine the results..."
            aria-invalid={Boolean(promptError) || undefined}
            aria-describedby={promptError ? promptErrorId : undefined}
          />
          <FieldErrorMessage id={promptErrorId} error={promptError} />
        </div>
      )}

      <RuntimePolicyEditor
        nodeId={nodeId}
        config={config}
        onConfigChange={onConfigChange as (next: RuntimeConfigurableNodeConfig) => void}
      />
    </div>
  )
}
