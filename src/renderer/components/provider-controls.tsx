import type { ProviderId } from "@shared/types"
import { PROVIDER_LABELS, getProviderModels } from "@shared/provider-metadata"
import { cn } from "@/lib/cn"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const PROVIDER_SHORT_LABELS: Record<ProviderId, string> = {
  claude: "Claude",
  codex: "Codex",
}

export function ProviderSelect({
  id,
  value,
  onValueChange,
  codexEnabled = true,
  className,
  ariaLabel,
  labelMode = "full",
}: {
  id?: string
  value: ProviderId
  onValueChange: (value: ProviderId) => void
  codexEnabled?: boolean
  className?: string
  ariaLabel?: string
  labelMode?: "full" | "short"
}) {
  const labels = labelMode === "short" ? PROVIDER_SHORT_LABELS : PROVIDER_LABELS
  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next as ProviderId)}
    >
      <SelectTrigger id={id} className={className} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="claude">{labels.claude}</SelectItem>
        <SelectItem value="codex" disabled={!codexEnabled}>
          {labels.codex}
        </SelectItem>
      </SelectContent>
    </Select>
  )
}

export function ProviderModelInput({
  id,
  provider,
  value,
  onValueChange,
  placeholder,
  className,
}: {
  id: string
  provider: ProviderId
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  const datalistId = `${id}-models`
  return (
    <>
      <Input
        id={id}
        list={datalistId}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        className={className}
      />
      <datalist id={datalistId}>
        {getProviderModels(provider).map((model) => (
          <option key={model} value={model} />
        ))}
      </datalist>
    </>
  )
}

export function ProviderModelSelect({
  id,
  provider,
  value,
  onValueChange,
  placeholder,
  className,
  ariaLabel,
  monospace = false,
}: {
  id?: string
  provider: ProviderId
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
  ariaLabel?: string
  monospace?: boolean
}) {
  const models = getProviderModels(provider)
  const selectedValue = value.trim()
  const options =
    selectedValue && !models.includes(selectedValue)
      ? [selectedValue, ...models]
      : models

  return (
    <Select value={selectedValue} onValueChange={onValueChange}>
      <SelectTrigger
        id={id}
        className={cn(monospace && "font-mono tracking-[-0.01em]", className)}
        aria-label={ariaLabel}
      >
        <SelectValue placeholder={placeholder || "Select model"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((model) => (
          <SelectItem key={model} value={model}>
            <span className={cn(monospace && "font-mono tracking-[-0.01em]")}>
              {model}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
