import { useState } from "react"
import {
  AlertCircle,
  ChevronRight,
  CheckCircle2,
  Wrench,
  Loader2,
  Bot,
} from "lucide-react"
import { cn } from "@/lib/cn"
import type { ChatMessageDisplay } from "@/lib/store"
import {
  isToolResultError,
  summarizeToolCall,
  summarizeToolResult,
} from "@/lib/chat-tool-summary"
import ReactMarkdown from "react-markdown"
import { CopyButton } from "@/components/ui/copy-button"
import { DEFAULT_MARKDOWN_PROPS } from "@/lib/markdown"

interface ChatMessageBubbleProps {
  message: ChatMessageDisplay
  groupedWithPrevious?: boolean
  groupedWithNext?: boolean
}

function compactPreview(
  value: string | undefined,
  maxLen = 120,
): string | null {
  if (!value) return null
  const firstLine = value.replace(/\s+/g, " ").trim()
  if (!firstLine) return null
  if (firstLine.length <= maxLen) return firstLine
  return `${firstLine.slice(0, maxLen - 1)}…`
}

export function ChatMessageBubble({
  message,
  groupedWithPrevious = false,
  groupedWithNext = false,
}: ChatMessageBubbleProps) {
  const [toolExpanded, setToolExpanded] = useState(false)

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className={cn(
            "max-w-[75%] rounded-2xl bg-surface-2/60 px-3.5 py-2.5",
            groupedWithPrevious && "rounded-tr-md",
            groupedWithNext && "rounded-br-md",
          )}
        >
          <p className="text-body-md whitespace-pre-wrap break-words">
            {message.content}
          </p>
        </div>
      </div>
    )
  }

  if (message.role === "assistant") {
    return (
      <div className="group group/msg space-y-1">
        {!groupedWithPrevious && (
          <div className="flex items-center gap-2">
            <div className="w-control-xs h-control-xs rounded-full bg-surface-3 flex items-center justify-center">
              <Bot size={13} className="text-muted-foreground" />
            </div>
            <span className="ui-meta-text text-muted-foreground font-medium">
              c8c
            </span>
          </div>
        )}
        <div className="relative">
          {message.streaming && !message.content ? (
            <div className="flex items-center gap-2 ui-meta-text text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              Thinking...
            </div>
          ) : (
            <>
              <div className="prose-c8c">
                <ReactMarkdown {...DEFAULT_MARKDOWN_PROPS}>
                  {message.content}
                </ReactMarkdown>
              </div>
              <CopyButton
                text={message.content}
                iconOnly
                className="ui-reveal-trailing absolute -right-1 top-0"
                idleLabel="Copy"
                idleAriaLabel="Copy message"
                copiedAriaLabel="Message copied"
              />
            </>
          )}
        </div>
      </div>
    )
  }

  if (message.role === "tool_call") {
    const summary = summarizeToolCall(message.toolName, message.toolInput)
    const preview = compactPreview(
      summary.preview ||
        (!summary.detail && message.toolInput
          ? JSON.stringify(message.toolInput)
          : undefined),
    )

    return (
      <div className="ml-8 rounded-lg surface-info-soft">
        <button
          type="button"
          onClick={() => setToolExpanded(!toolExpanded)}
          className={cn(
            "ui-pressable w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg",
            "ui-meta-text text-status-info ui-transition-colors ui-motion-fast hover:bg-status-info/10",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-control-xs w-control-xs shrink-0 items-center justify-center rounded-md bg-status-info/10">
              <Wrench size={11} />
            </span>
            <span className="min-w-0 text-left">
              <span className="block font-medium truncate">
                {summary.title}
              </span>
              <span className="block ui-meta-text text-muted-foreground truncate">
                {summary.detail || "Running tool"}
              </span>
            </span>
          </span>
          <ChevronRight
            size={12}
            className={cn("ui-chevron", toolExpanded && "rotate-90")}
          />
        </button>

        {!toolExpanded && preview && (
          <div className="px-2.5 pb-2 ui-meta-text text-muted-foreground truncate">
            {preview}
          </div>
        )}

        <div
          data-open={toolExpanded ? "true" : "false"}
          className="ui-collapsible"
        >
          <div className="ui-collapsible-inner">
            {message.toolInput && (
              <pre className="mx-2.5 mb-2 ui-meta-text font-mono rounded-md border border-hairline bg-surface-2/70 p-2 overflow-x-auto max-w-full max-h-[220px] overflow-y-auto">
                {JSON.stringify(message.toolInput, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (message.role === "tool_result") {
    const body = message.toolError || message.toolOutput || message.content
    const isError = isToolResultError(body, message.toolError)
    const summary = summarizeToolResult(message.toolName, body, { isError })
    const preview = compactPreview(
      summary.preview || (!summary.detail ? body : undefined),
    )

    return (
      <div
        className={cn(
          "ml-8 rounded-lg",
          isError ? "surface-danger-soft" : "surface-success-soft",
        )}
      >
        <button
          type="button"
          onClick={() => setToolExpanded(!toolExpanded)}
          className={cn(
            "ui-pressable w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg",
            "ui-meta-text ui-transition-colors ui-motion-fast",
            isError
              ? "text-status-danger hover:bg-status-danger/10"
              : "text-status-success hover:bg-status-success/10",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "inline-flex h-control-xs w-control-xs shrink-0 items-center justify-center rounded-md",
                isError ? "bg-status-danger/10" : "bg-status-success/10",
              )}
            >
              {isError ? <AlertCircle size={11} /> : <CheckCircle2 size={11} />}
            </span>
            <span className="min-w-0 text-left">
              <span className="block font-medium truncate">
                {summary.title}
              </span>
              <span
                className={cn(
                  "block ui-meta-text truncate",
                  isError ? "text-status-danger/80" : "text-status-success/80",
                )}
              >
                {summary.detail || (isError ? "Error" : "Success")}
              </span>
            </span>
          </span>
          <ChevronRight
            size={12}
            className={cn("ui-chevron", toolExpanded && "rotate-90")}
          />
        </button>

        {!toolExpanded && preview && (
          <div
            className={cn(
              "px-2.5 pb-2 ui-meta-text truncate",
              isError ? "text-status-danger/80" : "text-muted-foreground",
            )}
          >
            {preview}
          </div>
        )}

        <div
          data-open={toolExpanded ? "true" : "false"}
          className="ui-collapsible"
        >
          <div className="ui-collapsible-inner">
            <pre
              className={cn(
                "mx-2.5 mb-2 ui-meta-text font-mono rounded-md p-2 overflow-x-auto max-w-full max-h-[220px] overflow-y-auto border",
                isError
                  ? "bg-status-danger/10 border-status-danger/30 text-status-danger"
                  : "bg-surface-2/70 border-hairline text-muted-foreground",
              )}
            >
              {body}
            </pre>
          </div>
        </div>
      </div>
    )
  }

  return null
}
