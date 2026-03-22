import type { OutputNodeConfig } from "@shared/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EDITOR_PANEL_CLASS } from "./shared"

export function OutputNodeEditor({
  nodeId,
  config,
  onConfigChange,
}: {
  nodeId: string
  config: OutputNodeConfig
  onConfigChange: (config: OutputNodeConfig) => void
}) {
  return (
    <div className={EDITOR_PANEL_CLASS}>
      <div>
        <Label htmlFor={`output-title-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Output title
        </Label>
        <Input
          id={`output-title-${nodeId}`}
          type="text"
          value={config.title || ""}
          onChange={(event) => onConfigChange({ ...config, title: event.target.value })}
          placeholder="Optional title for the output node"
          className="h-control-md text-body-sm"
        />
      </div>
      <div className="flex items-center gap-3">
        <Label htmlFor={`output-format-${nodeId}`} className="ui-meta-text text-muted-foreground">
          Format
        </Label>
        <Select
          value={config.format || "markdown"}
          onValueChange={(value) =>
            onConfigChange({ ...config, format: value as OutputNodeConfig["format"] })
          }
        >
          <SelectTrigger id={`output-format-${nodeId}`} className="w-40 h-control-md text-body-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="markdown">Markdown</SelectItem>
            <SelectItem value="text">Plain text</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
