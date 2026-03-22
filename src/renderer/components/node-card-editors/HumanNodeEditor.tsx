import type { HumanNodeConfig } from "@shared/types"
import { TextareaWithMention } from "@/components/input/TextareaWithMention"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { EDITOR_GROUP_CLASS, EDITOR_PANEL_CLASS, RuntimePolicyEditor, type RuntimeConfigurableNodeConfig } from "./shared"

export function HumanNodeEditor({
  nodeId,
  config,
  onConfigChange,
}: {
  nodeId: string
  config: HumanNodeConfig
  onConfigChange: (config: HumanNodeConfig) => void
}) {
  const request = config.staticRequest || {
    version: 1 as const,
    kind: config.mode,
    title: "",
    fields: [],
  }

  const firstField = request.fields?.[0]

  const updateRequest = (patch: Partial<NonNullable<HumanNodeConfig["staticRequest"]>>) => {
    onConfigChange({
      ...config,
      staticRequest: {
        ...request,
        ...patch,
        version: 1,
        kind: config.mode,
      },
    })
  }

  return (
    <div className={EDITOR_PANEL_CLASS}>
      <div className="flex items-center gap-3">
        <Label htmlFor={`human-mode-${nodeId}`} className="ui-meta-text text-muted-foreground">
          Mode
        </Label>
        <Select
          value={config.mode}
          onValueChange={(value) =>
            onConfigChange({
              ...config,
              mode: value as HumanNodeConfig["mode"],
              staticRequest: config.staticRequest
                ? { ...config.staticRequest, kind: value as HumanNodeConfig["mode"] }
                : config.staticRequest,
            })
          }
        >
          <SelectTrigger id={`human-mode-${nodeId}`} className="w-40 h-control-md text-body-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="form">Form</SelectItem>
            <SelectItem value="approval">Approval</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor={`human-source-${nodeId}`} className="ui-meta-text text-muted-foreground">
          Request Source
        </Label>
        <Select
          value={config.requestSource}
          onValueChange={(value) =>
            onConfigChange({ ...config, requestSource: value as HumanNodeConfig["requestSource"] })
          }
        >
          <SelectTrigger id={`human-source-${nodeId}`} className="w-44 h-control-md text-body-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="static">Static</SelectItem>
            <SelectItem value="upstream_json">Upstream JSON</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor={`human-title-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Task Title
        </Label>
        <Input
          id={`human-title-${nodeId}`}
          type="text"
          value={request.title || ""}
          onChange={(event) => updateRequest({ title: event.target.value })}
          placeholder="What the human should do"
          className="h-control-md text-body-sm"
        />
      </div>

      <div>
        <Label htmlFor={`human-instructions-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Instructions
        </Label>
        <TextareaWithMention
          id={`human-instructions-${nodeId}`}
          value={request.instructions || ""}
          onChange={(event) => updateRequest({ instructions: event.target.value })}
          rows={3}
          className="min-h-20 resize-y font-mono text-body-sm"
          placeholder="Explain what information is needed before the flow continues."
        />
      </div>

      {config.requestSource === "static" && config.mode === "form" && (
        <div className={EDITOR_GROUP_CLASS}>
          <div>
            <Label htmlFor={`human-field-label-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
              Primary Field Label
            </Label>
            <Input
              id={`human-field-label-${nodeId}`}
              type="text"
              value={firstField?.label || ""}
              onChange={(event) =>
                updateRequest({
                  fields: [
                    {
                      ...firstField,
                      id: firstField?.id || "response",
                      type: firstField?.type || "textarea",
                      required: firstField?.required ?? true,
                      label: event.target.value,
                    },
                  ],
                })
              }
              placeholder="Response"
              className="h-control-md text-body-sm"
            />
          </div>
          <div>
            <Label
              htmlFor={`human-field-placeholder-${nodeId}`}
              className="ui-meta-text text-muted-foreground mb-1 block"
            >
              Field Placeholder
            </Label>
            <Input
              id={`human-field-placeholder-${nodeId}`}
              type="text"
              value={firstField?.placeholder || ""}
              onChange={(event) =>
                updateRequest({
                  fields: [
                    {
                      ...firstField,
                      id: firstField?.id || "response",
                      label: firstField?.label || "Response",
                      type: firstField?.type || "textarea",
                      required: firstField?.required ?? true,
                      placeholder: event.target.value,
                    },
                  ],
                })
              }
              placeholder="Enter the required input..."
              className="h-control-md text-body-sm"
            />
          </div>
        </div>
      )}

      <div className={EDITOR_GROUP_CLASS}>
        <div className="flex items-center justify-between">
          <Label htmlFor={`human-allow-revisions-${nodeId}`} className="ui-meta-text text-muted-foreground">
            Allow revisions
          </Label>
          <Switch
            id={`human-allow-revisions-${nodeId}`}
            checked={config.allowRevisions ?? true}
            onCheckedChange={(checked) => onConfigChange({ ...config, allowRevisions: checked })}
            aria-label="Toggle human task revisions"
          />
        </div>
      </div>

      <RuntimePolicyEditor
        nodeId={nodeId}
        config={config}
        onConfigChange={onConfigChange as (next: RuntimeConfigurableNodeConfig) => void}
      />
    </div>
  )
}
