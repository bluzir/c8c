import { useSetAtom } from "jotai"
import type { DiscoveredSkill, SkillNodeConfig } from "@shared/types"
import { TextareaWithMention } from "@/components/input/TextareaWithMention"
import { McpToolPicker } from "@/components/ui/mcp-tool-picker"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SkillRefInput } from "@/components/ui/skill-ref-input"
import { openSkillPickerAtom } from "@/lib/store"
import type { ValidationError } from "@/lib/validate-workflow"
import {
  EDITOR_GROUP_CLASS,
  EDITOR_PANEL_CLASS,
  FieldErrorMessage,
  getFieldError,
  OptionalClampedNumberInput,
  RuntimePolicyEditor,
  type RuntimeConfigurableNodeConfig,
} from "./shared"

export function SkillNodeEditor({
  nodeId,
  config,
  onConfigChange,
  validationErrors,
}: {
  nodeId: string
  config: SkillNodeConfig
  onConfigChange: (config: SkillNodeConfig) => void
  validationErrors?: ValidationError[]
}) {
  const openSkillPicker = useSetAtom(openSkillPickerAtom)
  const skillRefError = getFieldError(validationErrors, "skillRef")
  const promptError = getFieldError(validationErrors, "prompt")
  const outputModeError = getFieldError(validationErrors, "outputMode")
  const maxTurnsError = getFieldError(validationErrors, "maxTurns")
  const permissionModeError = getFieldError(validationErrors, "permissionMode")
  const skillRefErrorId = `skill-ref-error-${nodeId}`
  const promptErrorId = `prompt-error-${nodeId}`
  const outputModeErrorId = `skill-output-mode-error-${nodeId}`
  const maxTurnsErrorId = `skill-max-turns-error-${nodeId}`
  const permissionModeErrorId = `skill-permission-mode-error-${nodeId}`
  const handleBrowseSkills = () => {
    openSkillPicker({
      title: "Choose skill",
      description: "Browse reusable skills and set one for this step.",
      attachTargetLabel: "this step",
      onAddSkill: (skill: DiscoveredSkill) => {
        onConfigChange({
          ...config,
          skillRef: `${skill.category}/${skill.name}`,
        })
      },
    })
  }

  return (
    <div className={EDITOR_PANEL_CLASS}>
      <div>
        <Label htmlFor={`skill-ref-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Skill reference
        </Label>
        <SkillRefInput
          id={`skill-ref-${nodeId}`}
          value={config.skillRef || ""}
          onChange={(value) => onConfigChange({ ...config, skillRef: value })}
          onBrowseAllSkills={handleBrowseSkills}
          placeholder="category/skill-name"
          className="h-control-md font-mono text-body-sm"
          aria-invalid={Boolean(skillRefError) || undefined}
          aria-describedby={skillRefError ? skillRefErrorId : undefined}
        />
        <FieldErrorMessage id={skillRefErrorId} error={skillRefError} />
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={`skill-output-mode-${nodeId}`} className="ui-meta-text text-muted-foreground">
            Output
          </Label>
          <Select
            value={config.outputMode || "auto"}
            onValueChange={(value) =>
              onConfigChange({ ...config, outputMode: value as SkillNodeConfig["outputMode"] })
            }
          >
            <SelectTrigger
              id={`skill-output-mode-${nodeId}`}
              className="w-full h-control-md text-body-sm"
              aria-invalid={Boolean(outputModeError) || undefined}
              aria-describedby={outputModeError ? outputModeErrorId : undefined}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="stdout">Stdout</SelectItem>
              <SelectItem value="content_file">content.md</SelectItem>
            </SelectContent>
          </Select>
          <FieldErrorMessage id={outputModeErrorId} error={outputModeError} />
        </div>

        <div className="space-y-1">
          <Label htmlFor={`skill-max-turns-${nodeId}`} className="ui-meta-text text-muted-foreground">
            Turns
          </Label>
          <OptionalClampedNumberInput
            id={`skill-max-turns-${nodeId}`}
            min={1}
            max={200}
            value={config.maxTurns}
            onChange={(value) => onConfigChange({ ...config, maxTurns: value })}
            className="w-full h-control-md px-3 text-body-sm"
            aria-invalid={Boolean(maxTurnsError) || undefined}
            aria-describedby={maxTurnsError ? maxTurnsErrorId : undefined}
          />
          <FieldErrorMessage id={maxTurnsErrorId} error={maxTurnsError} />
        </div>

        <div className="space-y-1">
          <Label htmlFor={`skill-permission-mode-${nodeId}`} className="ui-meta-text text-muted-foreground">
            Mode
          </Label>
          <Select
            value={config.permissionMode || "__inherit__"}
            onValueChange={(value) =>
              onConfigChange({
                ...config,
                permissionMode: value === "__inherit__" ? undefined : (value as SkillNodeConfig["permissionMode"]),
              })
            }
          >
            <SelectTrigger
              id={`skill-permission-mode-${nodeId}`}
              className="w-full h-control-md text-body-sm"
              aria-invalid={Boolean(permissionModeError) || undefined}
              aria-describedby={permissionModeError ? permissionModeErrorId : undefined}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__inherit__">Inherit</SelectItem>
              <SelectItem value="plan">Plan</SelectItem>
              <SelectItem value="edit">Edit</SelectItem>
            </SelectContent>
          </Select>
          <FieldErrorMessage id={permissionModeErrorId} error={permissionModeError} />
        </div>
      </div>

      <p className="ui-meta-text text-muted-foreground">Provider and model are controlled from the flow Input step.</p>

      <div>
        <Label htmlFor={`prompt-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Prompt
        </Label>
        <TextareaWithMention
          id={`prompt-${nodeId}`}
          value={config.prompt || ""}
          onChange={(event) => onConfigChange({ ...config, prompt: event.target.value })}
          rows={4}
          className="min-h-24 resize-y font-mono text-body-sm"
          placeholder="Enter prompt for this skill..."
          aria-invalid={Boolean(promptError) || undefined}
          aria-describedby={promptError ? promptErrorId : undefined}
        />
        <FieldErrorMessage id={promptErrorId} error={promptError} />
      </div>

      <div className={EDITOR_GROUP_CLASS}>
        <p className="ui-meta-label text-muted-foreground">Tool Access</p>
        <McpToolPicker
          nodeId={`${nodeId}-allowed`}
          label="Allowed Tools"
          values={config.allowedTools || []}
          onChange={(next) => onConfigChange({ ...config, allowedTools: next })}
          placeholder="e.g. mcp__exa__web_search_exa"
        />
        <McpToolPicker
          nodeId={`${nodeId}-blocked`}
          label="Blocked Tools"
          values={config.disallowedTools || []}
          onChange={(next) => onConfigChange({ ...config, disallowedTools: next })}
          placeholder="e.g. Edit"
        />
      </div>

      <RuntimePolicyEditor
        nodeId={nodeId}
        config={config}
        onConfigChange={onConfigChange as (next: RuntimeConfigurableNodeConfig) => void}
      />
    </div>
  )
}
