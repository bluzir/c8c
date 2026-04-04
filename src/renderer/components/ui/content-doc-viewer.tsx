import type { ReactNode } from "react"
import { Copy, Check } from "lucide-react"
import { useState } from "react"
import ReactMarkdown from "react-markdown"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import {
  Dialog,
  CanvasDialogContent,
} from "@/components/ui/dialog"
import { DEFAULT_MARKDOWN_PROPS } from "@/lib/markdown"

interface ContentDocAlert {
  severity: "danger" | "warning" | "info"
  icon: React.ComponentType<{ size?: number; className?: string }>
  message: string
}

interface ContentDocViewerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  header: ReactNode
  alerts?: ContentDocAlert[]
  frontmatter?: string | null
  body?: string | null
  loading?: boolean
  error?: string | null
  emptyMessage?: string
}

export function ContentDocViewer({
  open,
  onOpenChange,
  header,
  alerts,
  frontmatter,
  body,
  loading,
  error,
  emptyMessage = "No content available.",
}: ContentDocViewerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent
        size="xl"
        showCloseButton={false}
        className="flex flex-col overflow-hidden"
      >
        {header}

        <div className="min-h-0 flex-1 overflow-y-auto ui-scroll-region px-6 pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <div className="ui-skeleton h-4 w-32" />
            </div>
          ) : error ? (
            <div className="rounded-lg surface-danger-soft px-4 py-3 text-body-sm text-status-danger">
              {error}
            </div>
          ) : (
            <>
              {alerts && alerts.length > 0 && (
                <div className="mb-4 space-y-2" role="alert">
                  {alerts.map((alert, index) => {
                    const Icon = alert.icon
                    return (
                      <div
                        key={index}
                        className={`flex items-start gap-2 rounded-lg px-3 py-2 text-body-sm ${
                          alert.severity === "danger"
                            ? "surface-danger-soft text-status-danger"
                            : alert.severity === "warning"
                              ? "surface-warning-soft text-status-warning"
                              : "surface-info-soft text-status-info"
                        }`}
                      >
                        <Icon size={14} className="mt-0.5 shrink-0" />
                        <span>{alert.message}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {frontmatter && <FrontmatterBlock yaml={frontmatter} />}

              {body ? (
                <div className="prose-c8c">
                  <ReactMarkdown {...DEFAULT_MARKDOWN_PROPS}>
                    {body}
                  </ReactMarkdown>
                </div>
              ) : !frontmatter ? (
                <div className="py-8 text-center text-body-sm text-muted-foreground">
                  {emptyMessage}
                </div>
              ) : null}
            </>
          )}
        </div>
      </CanvasDialogContent>
    </Dialog>
  )
}

export { type ContentDocAlert }

// ── Frontmatter code block ──────────────────────────────

function FrontmatterBlock({ yaml }: { yaml: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(yaml)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="relative mb-6 rounded-lg bg-surface-3 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
        <span className="ui-meta-text text-muted-foreground">frontmatter</span>
        <button
          type="button"
          className="ui-icon-button"
          onClick={() => void handleCopy()}
          title="Copy frontmatter"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-3 text-body-sm font-mono text-foreground leading-relaxed">
        {yaml}
      </pre>
    </div>
  )
}

// ── Dialog header helper ────────────────────────────────

export function ContentDocViewerHeader({
  children,
  onClose,
}: {
  children: ReactNode
  onClose?: () => void
}) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-border px-6 py-4 shrink-0">
      <div className="min-w-0 flex-1">{children}</div>
      <DialogPrimitive.Close
        className="ui-icon-button shrink-0"
        aria-label="Close"
        onClick={onClose}
      >
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" aria-hidden="true">
          <path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
        </svg>
      </DialogPrimitive.Close>
    </header>
  )
}
