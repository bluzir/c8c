import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react"
import { Check, Copy } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/cn"

interface CopyButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "onClick" | "title"
> {
  text: string
  iconOnly?: boolean
  idleLabel?: string
  copiedLabel?: string
  idleAriaLabel?: string
  copiedAriaLabel?: string
  onCopyError?: (error: unknown) => void
}

export function CopyButton({
  text,
  iconOnly = false,
  idleLabel = "Copy",
  copiedLabel = "Copied",
  idleAriaLabel,
  copiedAriaLabel,
  onCopyError,
  className,
  disabled,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const resetTimerRef = useRef<number | null>(null)
  const isDisabled = disabled || text.length === 0

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  const handleCopy = async () => {
    if (isDisabled) return

    try {
      await navigator.clipboard.writeText(text)
      navigator.vibrate?.(10)
      setCopied(true)
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current)
      }
      resetTimerRef.current = window.setTimeout(() => setCopied(false), 1600)
    } catch (error) {
      setCopied(false)
      onCopyError?.(error)
    }
  }

  return (
    <button
      type="button"
      className={cn(
        iconOnly
          ? "ui-icon-button"
          : buttonVariants({ variant: "outline", size: "sm" }),
        !iconOnly && "gap-1.5",
        className,
      )}
      aria-label={
        copied ? copiedAriaLabel || copiedLabel : idleAriaLabel || idleLabel
      }
      title={copied ? copiedLabel : idleLabel}
      disabled={isDisabled}
      onClick={() => {
        void handleCopy()
      }}
      {...props}
    >
      <span
        className="ui-crossfade-stack h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      >
        <Copy size={12} data-active={!copied} />
        <Check size={12} data-active={copied} className="text-status-success" />
      </span>
      {!iconOnly && (
        <span className="ui-crossfade-stack min-w-[5.5rem] text-left">
          <span data-active={!copied}>{idleLabel}</span>
          <span data-active={copied} className="text-status-success">
            {copiedLabel}
          </span>
        </span>
      )}
    </button>
  )
}
