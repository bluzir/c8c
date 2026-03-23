import { memo, useState } from "react"

import type { LogEntry } from "@shared/types"
import { ChevronRight, FileCode2, Wrench } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/cn"
import { getToolPermissionHint } from "@/lib/tool-permission-hints"

function mcpServerLabel(qualifiedName: string): string {
  const match = qualifiedName.match(/^mcp__([^_]+)__/)
  return match ? `MCP: ${match[1]}` : "MCP"
}

function PermissionHintNotice({
  toolName,
  domain,
}: {
  toolName: string
  domain?: string | null
}) {
  return (
    <div className="mt-1 border-l-2 border-status-warning/35 pl-3 py-0.5">
      <p className="ui-meta-text text-status-warning">
        Permission hint: add <span className="font-mono">{toolName}</span> to
        this skill step&apos;s Allowed Tools, then rerun this step.
      </p>
      {domain ? (
        <p className="ui-meta-text text-muted-foreground mt-1">
          If domain allowlist blocks access, add{" "}
          <span className="font-mono">WebFetch(domain:{domain})</span> to{" "}
          <span className="font-mono">.claude/settings.local.json</span>.
        </p>
      ) : null}
    </div>
  )
}

export const LogEntryCard = memo(function LogEntryCard({
  entry,
}: {
  entry: LogEntry
}) {
  const permissionHint = getToolPermissionHint(entry)
  const [collapsed, setCollapsed] = useState(
    entry.type === "thinking" ||
      entry.type === "tool_use" ||
      entry.type === "tool_result",
  )

  if (entry.type === "thinking") {
    return (
      <div className="border-l-2 border-muted pl-3 py-1">
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={
            collapsed ? "Expand thinking block" : "Collapse thinking block"
          }
          className="flex items-center gap-1 ui-meta-text text-muted-foreground hover:text-foreground ui-pressable"
        >
          <ChevronRight
            size={12}
            className={cn("ui-chevron", !collapsed && "rotate-90")}
          />
          <span className="italic">thinking...</span>
        </button>
        {!collapsed && (
          <pre className="ui-meta-text text-muted-foreground whitespace-pre-wrap font-mono mt-1">
            {entry.content}
          </pre>
        )}
      </div>
    )
  }

  if (entry.type === "text") {
    if (entry.content.startsWith("[progress]")) {
      return (
        <div className="border-l-2 border-status-info/35 pl-3 py-1">
          <div className="ui-meta-label text-status-info">progress</div>
          <pre className="ui-meta-text text-muted-foreground whitespace-pre-wrap font-mono mt-1">
            {entry.content.replace(/^\[progress\]\s*/i, "")}
          </pre>
        </div>
      )
    }

    return (
      <div className="py-1">
        <pre className="text-body-md whitespace-pre-wrap font-mono">
          {entry.content}
        </pre>
      </div>
    )
  }

  if (entry.type === "tool_use") {
    const inputPreview = JSON.stringify(entry.input, null, 2)
    const isMcp = entry.tool.startsWith("mcp__")
    const toolDisplayName = isMcp
      ? entry.tool.replace(/^mcp__/, "").replace(/__/, " / ")
      : entry.tool

    return (
      <div className="border-l-2 border-hairline pl-3 py-1">
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={
            collapsed
              ? `Expand ${toolDisplayName} input`
              : `Collapse ${toolDisplayName} input`
          }
          className="flex items-center gap-2 ui-meta-label text-foreground-subtle hover:text-foreground ui-pressable"
        >
          <ChevronRight
            size={12}
            className={cn("ui-chevron", !collapsed && "rotate-90")}
          />
          <Wrench size={12} />
          <span>{toolDisplayName}</span>
          {isMcp && (
            <Badge variant="info" className="ui-meta-text px-1.5 py-0">
              {mcpServerLabel(entry.tool)}
            </Badge>
          )}
        </button>
        {!collapsed && (
          <pre className="ui-meta-text text-muted-foreground whitespace-pre-wrap font-mono mt-1 max-h-60 overflow-y-auto ui-scroll-region">
            {inputPreview}
          </pre>
        )}
      </div>
    )
  }

  if (entry.type === "tool_result") {
    const isError = entry.status === "error"
    const isMcp = entry.tool.startsWith("mcp__")
    const toolDisplayName = isMcp
      ? entry.tool.replace(/^mcp__/, "").replace(/__/, " / ")
      : entry.tool

    const borderColor = isError
      ? "border-status-danger/50"
      : isMcp
        ? "border-accent/30"
        : "border-status-success/50"
    const textColor = isError
      ? "text-status-danger hover:text-status-danger/80"
      : isMcp
        ? "text-foreground-subtle hover:text-foreground"
        : "text-status-success hover:text-status-success/80"

    return (
      <div className={cn("border-l-2 pl-3 py-1", borderColor)}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={
            collapsed
              ? `Expand ${toolDisplayName} result`
              : `Collapse ${toolDisplayName} result`
          }
          className={cn(
            "flex items-center gap-2 ui-meta-label ui-pressable",
            textColor,
          )}
        >
          <ChevronRight
            size={12}
            className={cn("ui-chevron", !collapsed && "rotate-90")}
          />
          <span>
            {toolDisplayName} {isError ? "failed" : "result"}
          </span>
          {isMcp && (
            <Badge variant="info" className="ui-meta-text px-1.5 py-0">
              {mcpServerLabel(entry.tool)}
            </Badge>
          )}
        </button>
        {permissionHint ? (
          <PermissionHintNotice
            toolName={permissionHint.toolName}
            domain={permissionHint.domain}
          />
        ) : null}
        {!collapsed && (
          <pre
            className={cn(
              "ui-meta-text whitespace-pre-wrap font-mono mt-1 max-h-60 overflow-y-auto ui-scroll-region",
              isError ? "text-status-danger/80" : "text-muted-foreground",
            )}
          >
            {entry.output}
          </pre>
        )}
      </div>
    )
  }

  if (entry.type === "error") {
    return (
      <div className="py-1">
        <pre className="ui-meta-text text-status-danger whitespace-pre-wrap font-mono">
          {entry.content}
        </pre>
        {permissionHint ? (
          <PermissionHintNotice
            toolName={permissionHint.toolName}
            domain={permissionHint.domain}
          />
        ) : null}
      </div>
    )
  }

  if (entry.type === "diff") {
    return (
      <div className="border-l-2 border-accent/40 pl-3 py-1">
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand diff" : "Collapse diff"}
          className="flex items-center gap-2 ui-meta-label text-foreground-subtle hover:text-foreground ui-pressable"
        >
          <ChevronRight
            size={12}
            className={cn("ui-chevron", !collapsed && "rotate-90")}
          />
          <FileCode2 size={12} />
          <span>
            {entry.files.length} file{entry.files.length !== 1 ? "s" : ""}{" "}
            changed
          </span>
        </button>
        {!collapsed && (
          <>
            <div className="mt-1 flex flex-wrap gap-1">
              {entry.files.map((file) => (
                <span
                  key={file}
                  className="inline-flex items-center rounded-sm border border-hairline px-1.5 py-0 ui-meta-text text-muted-foreground bg-surface-1/80 font-mono"
                >
                  {file}
                </span>
              ))}
            </div>
            <pre className="ui-meta-text whitespace-pre-wrap font-mono mt-2 max-h-80 overflow-y-auto ui-scroll-region">
              {entry.content.split("\n").map((line, index) => {
                const color =
                  line.startsWith("+") && !line.startsWith("+++")
                    ? "text-status-success"
                    : line.startsWith("-") && !line.startsWith("---")
                      ? "text-status-danger"
                      : line.startsWith("@@")
                        ? "text-status-info"
                        : "text-muted-foreground"
                return (
                  <span key={index} className={color}>
                    {line}
                    {"\n"}
                  </span>
                )
              })}
            </pre>
          </>
        )}
      </div>
    )
  }

  return null
})
