import type { ApprovalNodeConfig } from "@shared/types"
import { TextareaWithMention } from "@/components/input/TextareaWithMention"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  EDITOR_GROUP_CLASS,
  EDITOR_PANEL_CLASS,
  OptionalClampedNumberInput,
  RuntimePolicyEditor,
  type RuntimeConfigurableNodeConfig,
} from "./shared"

export function ApprovalNodeEditor({
  nodeId,
  config,
  onConfigChange,
}: {
  nodeId: string
  config: ApprovalNodeConfig
  onConfigChange: (config: ApprovalNodeConfig) => void
}) {
  return (
    <div className={EDITOR_PANEL_CLASS}>
      <p className="ui-meta-text text-muted-foreground">
        Pauses the flow and asks you to review before continuing.
      </p>

      <div>
        <Label
          htmlFor={`approval-message-${nodeId}`}
          className="ui-meta-text text-muted-foreground mb-1 block"
        >
          Message
        </Label>
        <TextareaWithMention
          id={`approval-message-${nodeId}`}
          value={config.message || ""}
          onChange={(event) =>
            onConfigChange({ ...config, message: event.target.value })
          }
          rows={3}
          className="min-h-20 resize-y font-mono text-body-sm"
          placeholder="Optional instructions shown to the reviewer..."
        />
      </div>
      <div className={EDITOR_GROUP_CLASS}>
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <Label
              htmlFor={`approval-show-content-${nodeId}`}
              className="ui-meta-text text-muted-foreground"
            >
              Show content for review
            </Label>
            <Switch
              id={`approval-show-content-${nodeId}`}
              checked={config.show_content}
              onCheckedChange={(checked) =>
                onConfigChange({ ...config, show_content: checked })
              }
              aria-label="Toggle content visibility in approval dialog"
            />
          </div>
          <p className="ui-meta-text text-muted-foreground">
            Display the previous step's output in the approval dialog
          </p>
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <Label
              htmlFor={`approval-allow-edit-${nodeId}`}
              className="ui-meta-text text-muted-foreground"
            >
              Allow content edits
            </Label>
            <Switch
              id={`approval-allow-edit-${nodeId}`}
              checked={config.allow_edit}
              onCheckedChange={(checked) =>
                onConfigChange({ ...config, allow_edit: checked })
              }
              aria-label="Toggle editing before approval"
            />
          </div>
          <p className="ui-meta-text text-muted-foreground">
            Let the reviewer modify the content before approving
          </p>
        </div>
      </div>

      <div className={EDITOR_GROUP_CLASS}>
        <div className="flex items-center justify-between gap-2">
          <Label
            htmlFor={`approval-timeout-${nodeId}`}
            className="ui-meta-text text-muted-foreground"
          >
            Timeout (minutes)
          </Label>
          <OptionalClampedNumberInput
            id={`approval-timeout-${nodeId}`}
            min={1}
            max={1440}
            value={config.timeout_minutes}
            onChange={(value) =>
              onConfigChange({ ...config, timeout_minutes: value })
            }
            placeholder="None"
            className="w-20 h-control-sm text-body-sm text-right"
          />
        </div>
        {config.timeout_minutes != null && config.timeout_minutes > 0 && (
          <div className="flex items-center justify-between gap-2">
            <Label
              htmlFor={`approval-timeout-action-${nodeId}`}
              className="ui-meta-text text-muted-foreground"
            >
              On timeout
            </Label>
            <Select
              value={config.timeout_action || "auto_reject"}
              onValueChange={(value) =>
                onConfigChange({
                  ...config,
                  timeout_action: value as ApprovalNodeConfig["timeout_action"],
                })
              }
            >
              <SelectTrigger
                id={`approval-timeout-action-${nodeId}`}
                className="w-36 h-control-sm text-body-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto_approve">Auto-approve</SelectItem>
                <SelectItem value="auto_reject">Auto-reject</SelectItem>
                <SelectItem value="skip">Skip step</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <p className="ui-meta-text text-muted-foreground">
          {config.timeout_minutes != null && config.timeout_minutes > 0
            ? "If no one responds in time, the timeout action runs automatically."
            : "No timeout — the flow will wait indefinitely for approval."}
        </p>
      </div>

      <p className="ui-meta-text text-muted-foreground">
        Rejecting at this approval will stop the entire flow run.
      </p>

      <RuntimePolicyEditor
        nodeId={nodeId}
        config={config}
        onConfigChange={
          onConfigChange as (next: RuntimeConfigurableNodeConfig) => void
        }
      />
    </div>
  )
}
