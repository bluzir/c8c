import { Button } from "@/components/ui/button"
import type { WorkflowTemplate } from "@shared/types"
import { TemplateSuggestionCard } from "@/components/create/TemplateSuggestionCard"

type SuggestedTemplate = {
  template: WorkflowTemplate
  title?: string
  summary?: string
  eyebrow?: string
  recommended?: boolean
}

export function WorkflowCreateSuggestionsSection({
  loading,
  title,
  suggestions,
  onBrowseLibrary,
  onSelectTemplate,
}: {
  loading: boolean
  title: string
  suggestions: SuggestedTemplate[]
  onBrowseLibrary: () => void
  onSelectTemplate: (template: WorkflowTemplate) => void
}) {
  if (!loading && suggestions.length === 0) return null

  return (
    <section aria-label={title} className="w-full space-y-2">
      <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body-sm font-medium text-muted-foreground">{title}</p>
        <Button
          variant="ghost"
          size="xs"
          onClick={onBrowseLibrary}
          className="w-fit text-muted-foreground"
        >
          Browse starting points
        </Button>
      </div>

      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 2 }).map((_, index) => (
            <div
              key={`template-skeleton-${index}`}
              className="h-16 animate-pulse rounded-xl bg-surface-2/55"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {suggestions.map((suggestion) => (
            <TemplateSuggestionCard
              key={suggestion.template.id}
              template={suggestion.template}
              title={suggestion.title}
              summary={suggestion.summary}
              eyebrow={suggestion.eyebrow}
              recommended={suggestion.recommended}
              onSelect={onSelectTemplate}
            />
          ))}
        </div>
      )}
    </section>
  )
}
