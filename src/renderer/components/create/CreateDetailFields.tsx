import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResultModeConfigField } from "@/lib/result-mode-config"

export function ScaffoldField({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="ui-meta-text text-muted-foreground">
        {label}
      </Label>
      <Textarea
        id={id}
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-20 resize-y"
      />
    </div>
  )
}

export function ModeConfigField({
  field,
  value,
  onChange,
}: {
  field: ResultModeConfigField
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={`mode-config-${field.id}`}
        className="ui-meta-text text-muted-foreground"
      >
        {field.label}
      </Label>
      {field.type === "textarea" ? (
        <Textarea
          id={`mode-config-${field.id}`}
          rows={2}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className="min-h-20 resize-y"
        />
      ) : (
        <Input
          id={`mode-config-${field.id}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
        />
      )}
      {field.helpText ? (
        <p className="ui-meta-text text-muted-foreground">{field.helpText}</p>
      ) : null}
    </div>
  )
}
