import { useState, type ComponentProps } from "react"
import type {
  ApprovalNodeConfig,
  ErrorKind,
  EvaluatorNodeConfig,
  HumanNodeConfig,
  MergerNodeConfig,
  NodeOnErrorPolicy,
  NodeRetryBackoff,
  NodeRuntimeConfig,
  SkillNodeConfig,
  SplitterNodeConfig,
} from "@shared/types"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import type { ValidationError } from "@/lib/validate-workflow"

const ON_ERROR_OPTIONS: NodeOnErrorPolicy[] = [
  "stop",
  "continue",
  "continue_error_output",
]
const RETRY_ERROR_KINDS: ErrorKind[] = [
  "tool",
  "model",
  "timeout",
  "policy",
  "unknown",
]

export const EDITOR_PANEL_CLASS =
  "ui-fade-slide-in border-t border-hairline px-3 pb-3 pt-2.5 space-y-2"
export const EDITOR_DISCLOSURE_CLASS = "ui-disclosure"
export const EDITOR_GROUP_CLASS = "ui-inset-well space-y-2"
export const EDITOR_TOGGLE_ROW_CLASS =
  "ui-inset-well flex items-center justify-between"

export type RuntimeConfigurableNodeConfig =
  | SkillNodeConfig
  | EvaluatorNodeConfig
  | SplitterNodeConfig
  | MergerNodeConfig
  | ApprovalNodeConfig
  | HumanNodeConfig

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeValidationField(field: string): string {
  return field.replace(/^config\./, "")
}

export function getFieldError(
  validationErrors: ValidationError[] | undefined,
  ...fields: string[]
): ValidationError | null {
  const fieldSet = new Set(fields)
  return (
    validationErrors?.find((error) =>
      fieldSet.has(normalizeValidationField(error.field)),
    ) || null
  )
}

export function RequiredMark() {
  return (
    <>
      <span
        className="ml-0.5 text-label-xs text-status-danger"
        aria-hidden="true"
      >
        *
      </span>
      <span className="sr-only"> (required)</span>
    </>
  )
}

export function FieldErrorMessage({
  id,
  error,
}: {
  id: string
  error: ValidationError | null
}) {
  if (!error) return null
  return (
    <p id={id} className="mt-1 text-label-xs text-status-danger">
      {error.message}
    </p>
  )
}

export function ClampedNumberInput({
  value,
  min,
  max,
  onChange,
  ...props
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
} & Omit<ComponentProps<typeof Input>, "value" | "onChange">) {
  const [local, setLocal] = useState<string | null>(null)
  return (
    <Input
      {...props}
      type="number"
      min={min}
      max={max}
      value={local ?? value}
      onChange={(event) => setLocal(event.target.value)}
      onBlur={() => {
        if (local !== null) {
          const parsed = parseInt(local, 10)
          onChange(Number.isNaN(parsed) ? value : clampNumber(parsed, min, max))
          setLocal(null)
        }
      }}
    />
  )
}

export function OptionalClampedNumberInput({
  value,
  min,
  max,
  onChange,
  ...props
}: {
  value: number | undefined
  min: number
  max: number
  onChange: (v: number | undefined) => void
} & Omit<ComponentProps<typeof Input>, "value" | "onChange">) {
  const [local, setLocal] = useState<string | null>(null)

  return (
    <Input
      {...props}
      type="number"
      min={min}
      max={max}
      value={local ?? value ?? ""}
      onChange={(event) => setLocal(event.target.value)}
      onBlur={() => {
        if (local === null) return
        const trimmed = local.trim()
        if (!trimmed) {
          onChange(undefined)
          setLocal(null)
          return
        }
        const parsed = parseInt(trimmed, 10)
        onChange(Number.isNaN(parsed) ? value : clampNumber(parsed, min, max))
        setLocal(null)
      }}
    />
  )
}

export function ToolArrayEditor({
  nodeId,
  label,
  values,
  onChange,
  placeholder,
  normalizeValue,
}: {
  nodeId: string
  label: string
  values: string[]
  onChange: (next: string[] | undefined) => void
  placeholder: string
  normalizeValue?: (value: string) => string | null
}) {
  const [draft, setDraft] = useState("")

  const normalizedValues = values.filter(Boolean)
  const commitDraft = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    const normalized = normalizeValue ? normalizeValue(trimmed) : trimmed
    if (!normalized) return
    const next = [...new Set([...normalizedValues, normalized])]
    onChange(next.length > 0 ? next : undefined)
    setDraft("")
  }

  const removeValue = (value: string) => {
    const next = normalizedValues.filter((item) => item !== value)
    onChange(next.length > 0 ? next : undefined)
  }

  return (
    <div>
      <Label
        htmlFor={`${nodeId}-${label.toLowerCase().replace(/\s+/g, "-")}`}
        className="ui-meta-text text-muted-foreground mb-1 block"
      >
        {label}
      </Label>
      {normalizedValues.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {normalizedValues.map((tool) => (
            <Badge
              key={tool}
              variant="secondary"
              className="inline-flex items-center gap-1 px-2 py-0.5"
            >
              <span className="font-mono">{tool}</span>
              <button
                type="button"
                className="ui-icon-button shrink-0 rounded-sm"
                onClick={() => removeValue(tool)}
                aria-label={`Remove ${tool}`}
              >
                <X size={10} />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Input
          id={`${nodeId}-${label.toLowerCase().replace(/\s+/g, "-")}`}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return
            event.preventDefault()
            commitDraft()
          }}
          placeholder={placeholder}
          className="h-control-md font-mono text-body-sm"
        />
        <Button type="button" variant="outline" size="sm" onClick={commitDraft}>
          <Plus size={12} />
          Add
        </Button>
      </div>
    </div>
  )
}

export function RuntimePolicyEditor({
  nodeId,
  config,
  onConfigChange,
}: {
  nodeId: string
  config: RuntimeConfigurableNodeConfig
  onConfigChange: (next: RuntimeConfigurableNodeConfig) => void
}) {
  const runtime: NodeRuntimeConfig = config.runtime || {}
  const execution = runtime.execution || {}
  const retry = runtime.retry || {}
  const onError = execution.onError || "stop"
  const retryEnabled = Boolean(retry.enabled)

  const updateRuntime = (nextRuntime: NodeRuntimeConfig) => {
    onConfigChange({
      ...config,
      runtime: nextRuntime,
    })
  }

  const updateExecution = (patch: Partial<NodeRuntimeConfig["execution"]>) => {
    updateRuntime({
      ...runtime,
      execution: {
        ...execution,
        ...patch,
      },
    })
  }

  const updateRetry = (patch: Partial<NodeRuntimeConfig["retry"]>) => {
    updateRuntime({
      ...runtime,
      retry: {
        ...retry,
        ...patch,
      },
    })
  }

  return (
    <details className={EDITOR_DISCLOSURE_CLASS}>
      <summary className="cursor-pointer list-none px-2 py-2 ui-meta-label text-muted-foreground hover:text-foreground ui-transition-colors ui-motion-fast">
        Runtime Policy (Advanced)
      </summary>
      <div className="space-y-2 border-t border-hairline px-2 py-2">
        <div className="flex items-center gap-3">
          <Label
            htmlFor={`runtime-on-error-${nodeId}`}
            className="ui-meta-text text-muted-foreground"
          >
            On error
          </Label>
          <Select
            value={onError}
            onValueChange={(value) =>
              updateExecution({ onError: value as NodeOnErrorPolicy })
            }
          >
            <SelectTrigger
              id={`runtime-on-error-${nodeId}`}
              className="w-52 h-control-md text-body-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ON_ERROR_OPTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={EDITOR_TOGGLE_ROW_CLASS}>
          <Label
            htmlFor={`runtime-retry-${nodeId}`}
            className="ui-meta-text text-muted-foreground"
          >
            Retry on fail
          </Label>
          <Switch
            id={`runtime-retry-${nodeId}`}
            checked={retryEnabled}
            onCheckedChange={(checked) =>
              updateRetry({
                enabled: checked,
                maxTries: retry.maxTries || 2,
                waitMs: retry.waitMs || 0,
                backoff: (retry.backoff || "none") as NodeRetryBackoff,
              })
            }
            aria-label="Toggle retry on failure"
          />
        </div>

        {retryEnabled && (
          <div className={EDITOR_GROUP_CLASS}>
            <div className="flex items-center gap-3">
              <Label
                htmlFor={`runtime-max-tries-${nodeId}`}
                className="ui-meta-text text-muted-foreground"
              >
                Max tries
              </Label>
              <ClampedNumberInput
                id={`runtime-max-tries-${nodeId}`}
                min={1}
                max={10}
                value={retry.maxTries || 2}
                onChange={(value) => updateRetry({ maxTries: value })}
                className="w-16 h-control-sm px-2 text-body-sm text-center"
              />
            </div>

            <div className="flex items-center gap-3">
              <Label
                htmlFor={`runtime-wait-ms-${nodeId}`}
                className="ui-meta-text text-muted-foreground"
              >
                Wait ms
              </Label>
              <Input
                id={`runtime-wait-ms-${nodeId}`}
                type="number"
                min={0}
                value={retry.waitMs || 0}
                onChange={(event) =>
                  updateRetry({
                    waitMs: Math.max(0, Number(event.target.value) || 0),
                  })
                }
                className="w-24 h-control-sm px-2 text-body-sm text-center"
              />
            </div>

            <div className="flex items-center gap-3">
              <Label
                htmlFor={`runtime-backoff-${nodeId}`}
                className="ui-meta-text text-muted-foreground"
              >
                Backoff
              </Label>
              <Select
                value={(retry.backoff || "none") as NodeRetryBackoff}
                onValueChange={(value) =>
                  updateRetry({ backoff: value as NodeRetryBackoff })
                }
              >
                <SelectTrigger
                  id={`runtime-backoff-${nodeId}`}
                  className="w-36 h-control-md text-body-sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">none</SelectItem>
                  <SelectItem value="linear">linear</SelectItem>
                  <SelectItem value="exponential">exponential</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <ToolArrayEditor
              nodeId={`runtime-retry-on-${nodeId}`}
              label="Retry on"
              values={(retry.retryOn || []) as string[]}
              onChange={(next) => {
                const parsed = (next || [])
                  .map((token) => token.toLowerCase())
                  .filter((token): token is ErrorKind =>
                    RETRY_ERROR_KINDS.includes(token as ErrorKind),
                  )
                updateRetry({ retryOn: parsed.length > 0 ? parsed : undefined })
              }}
              placeholder="tool, model, timeout"
              normalizeValue={(value) => {
                const normalized = value.toLowerCase()
                return RETRY_ERROR_KINDS.includes(normalized as ErrorKind)
                  ? normalized
                  : null
              }}
            />
            <p className="ui-meta-text text-muted-foreground">
              Allowed: {RETRY_ERROR_KINDS.join(", ")}
            </p>
          </div>
        )}
      </div>
    </details>
  )
}
