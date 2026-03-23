import { Badge } from "@/components/ui/badge"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import { cn } from "@/lib/cn"
import type { FlowRulePreview } from "@/lib/flow-rules"

function FlowRulesList({ rules }: { rules: FlowRulePreview[] }) {
  return (
    <div className="space-y-1.5">
      {rules.map((rule) => (
        <div
          key={rule.id}
          className="ui-inset-well flex flex-wrap items-start justify-between gap-2 px-2.5 py-2"
        >
          <p className="min-w-0 flex-1 text-body-sm text-foreground">
            {rule.label}
          </p>
          <Badge variant="outline" size="compact">
            {rule.scope}
          </Badge>
        </div>
      ))}
    </div>
  )
}

export function FlowRulesPreview({
  rules,
  className,
  collapsible = false,
  defaultOpen = false,
  surface = "chapter",
}: {
  rules: FlowRulePreview[]
  className?: string
  collapsible?: boolean
  defaultOpen?: boolean
  surface?: "chapter" | "flat"
}) {
  if (rules.length === 0) return null

  const summary = (
    <span className="flex items-center gap-2">
      <span>Active rules</span>
      <Badge variant="outline" size="compact">
        {rules.length}
      </Badge>
    </span>
  )

  if (collapsible) {
    return (
      <DisclosurePanel
        summary={summary}
        className={cn(surface === "chapter" && "ui-chapter-shell", className)}
        summaryClassName="py-1.5"
        contentClassName="space-y-2"
        defaultOpen={defaultOpen}
        unmountWhenClosed
      >
        <FlowRulesList rules={rules} />
      </DisclosurePanel>
    )
  }

  return (
    <section
      className={cn(
        "space-y-2",
        surface === "chapter" && "ui-chapter-shell px-3 py-2.5",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <p className="ui-meta-label text-muted-foreground">Active rules</p>
        <Badge variant="outline" size="compact">
          {rules.length}
        </Badge>
      </div>
      <FlowRulesList rules={rules} />
    </section>
  )
}
