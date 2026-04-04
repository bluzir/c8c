import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ContentDocViewer,
  ContentDocViewerHeader,
  type ContentDocAlert,
} from "@/components/ui/content-doc-viewer"
import { getSkillSourceKind, getSkillSourceLabel } from "@/lib/skill-source"
import { analyzeSkillSafety } from "@/lib/skill-safety"
import { parseSkillContent } from "@/lib/skill-content-parser"
import type { DiscoveredSkill } from "@shared/types"
import {
  Zap,
  Bot,
  Terminal,
  ShieldAlert,
  AlertTriangle,
  Info,
  Cpu,
  RotateCw,
  Wrench,
  FileText,
} from "lucide-react"

const TYPE_ICONS = {
  skill: Zap,
  agent: Bot,
  command: Terminal,
} as const

const SEVERITY_ICONS = {
  danger: ShieldAlert,
  warning: AlertTriangle,
  info: Info,
} as const

export function SkillDetailViewer({
  skill,
  onClose,
  onAttach,
  attachDisabledReason,
}: {
  skill: DiscoveredSkill | null
  onClose: () => void
  onAttach?: (skill: DiscoveredSkill) => void
  attachDisabledReason?: string | null
}) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadContent = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)
    setContent(null)
    try {
      const raw = await window.api.readSkillContent(path)
      setContent(raw)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (skill) void loadContent(skill.path)
  }, [skill?.path, loadContent])

  const parsed = useMemo(
    () => (content ? parseSkillContent(content) : null),
    [content],
  )

  const toolsList = skill ? (skill.tools ?? skill.allowedTools ?? []) : []

  const alerts: ContentDocAlert[] = useMemo(() => {
    if (!content) return []
    const warnings = analyzeSkillSafety(
      content,
      toolsList.length > 0 ? toolsList : undefined,
    )
    return warnings.map((w) => ({
      severity: w.severity,
      icon: SEVERITY_ICONS[w.severity],
      message: w.message,
    }))
  }, [content, toolsList])

  if (!skill) return null

  const Icon = TYPE_ICONS[skill.type] ?? Zap
  const sourceKind = getSkillSourceKind(skill)
  const sourceLabel = getSkillSourceLabel(skill)

  const metaItems: Array<{ icon: typeof Cpu; label: string; value: string }> =
    []
  if (skill.model) metaItems.push({ icon: Cpu, label: "Model", value: skill.model })
  if (skill.maxTurns != null)
    metaItems.push({ icon: RotateCw, label: "Max turns", value: String(skill.maxTurns) })

  return (
    <ContentDocViewer
      open={!!skill}
      onOpenChange={(open) => { if (!open) onClose() }}
      loading={loading}
      error={error}
      alerts={alerts}
      frontmatter={parsed?.frontmatter}
      body={parsed?.body}
      emptyMessage="No skill details available."
      header={
        <ContentDocViewerHeader onClose={onClose}>
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2"
              aria-hidden="true"
            >
              <Icon size={16} className="text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-title-md">{skill.name}</h2>
                <Badge variant="outline" size="compact">
                  {skill.type}
                </Badge>
                <Badge variant="secondary" size="compact">
                  {sourceLabel}
                </Badge>
              </div>

              {skill.description && (
                <p className="text-body-sm text-muted-foreground mt-1">
                  {skill.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                {metaItems.map(({ icon: MetaIcon, label, value }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 text-body-sm text-muted-foreground"
                  >
                    <MetaIcon size={12} className="shrink-0" aria-hidden="true" />
                    <span className="ui-meta-label">{label}:</span>
                    <span className="text-foreground font-medium">{value}</span>
                  </span>
                ))}
                {toolsList.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-body-sm text-muted-foreground">
                    <Wrench size={12} className="shrink-0" aria-hidden="true" />
                    <span className="ui-meta-label">Tools:</span>
                    <span className="text-foreground font-medium">
                      {toolsList.length}
                    </span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 text-body-sm text-muted-foreground">
                  <FileText size={12} className="shrink-0" aria-hidden="true" />
                  <button
                    type="button"
                    className="ui-pressable text-left font-mono ui-meta-text text-foreground hover:underline"
                    title={skill.path}
                    onClick={() => void window.api.showInFinder(skill.path)}
                  >
                    {skill.path.split("/").pop()}
                  </button>
                </span>
              </div>
            </div>

            {onAttach && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 mt-0.5"
                onClick={() => onAttach(skill)}
                disabled={!!attachDisabledReason}
                title={
                  attachDisabledReason ||
                  "Attach this skill to the current flow."
                }
              >
                Attach to flow
              </Button>
            )}
          </div>
        </ContentDocViewerHeader>
      }
    />
  )
}
