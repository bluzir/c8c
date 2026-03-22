import type { InputNodeConfig } from "@shared/types"
import { TextareaWithMention } from "@/components/input/TextareaWithMention"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { EDITOR_PANEL_CLASS, EDITOR_TOGGLE_ROW_CLASS } from "./shared"

export function InputNodeEditor({
  nodeId,
  config,
  onConfigChange,
}: {
  nodeId: string
  config: InputNodeConfig
  onConfigChange: (config: InputNodeConfig) => void
}) {
  return (
    <div className={EDITOR_PANEL_CLASS}>
      <div className="flex items-center gap-3">
        <Label htmlFor={`input-type-${nodeId}`} className="ui-meta-text text-muted-foreground">
          Input Type
        </Label>
        <Select
          value={config.inputType || "auto"}
          onValueChange={(value) =>
            onConfigChange({ ...config, inputType: value as InputNodeConfig["inputType"] })
          }
        >
          <SelectTrigger id={`input-type-${nodeId}`} className="w-36 h-control-md text-body-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto detect</SelectItem>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="url">URL</SelectItem>
            <SelectItem value="directory">Directory</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className={EDITOR_TOGGLE_ROW_CLASS}>
        <Label htmlFor={`input-required-${nodeId}`} className="ui-meta-text text-muted-foreground">
          Input required
        </Label>
        <Switch
          id={`input-required-${nodeId}`}
          checked={config.required ?? true}
          onCheckedChange={(checked) => onConfigChange({ ...config, required: checked })}
          aria-label="Toggle input required"
        />
      </div>

      {config.required === false && (
        <div>
          <Label htmlFor={`input-default-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
            Default value
          </Label>
          <TextareaWithMention
            id={`input-default-${nodeId}`}
            value={config.defaultValue || ""}
            onChange={(event) => onConfigChange({ ...config, defaultValue: event.target.value })}
            rows={3}
            className="min-h-20 resize-y font-mono text-body-sm"
            placeholder="Used when input is empty and the node is optional."
          />
        </div>
      )}

      <div>
        <Label htmlFor={`input-placeholder-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Placeholder
        </Label>
        <Input
          id={`input-placeholder-${nodeId}`}
          type="text"
          value={config.placeholder || ""}
          onChange={(event) => onConfigChange({ ...config, placeholder: event.target.value })}
          placeholder="Shown in the run input field"
          className="h-control-md text-body-sm"
        />
      </div>
    </div>
  )
}
