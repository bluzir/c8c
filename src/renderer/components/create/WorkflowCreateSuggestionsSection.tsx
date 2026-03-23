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
  emptyPrompt,
  onBrowseLibrary,
  onSelectTemplate,
}: {
  loading: boolean
  title: string
  suggestions: SuggestedTemplate[]
  emptyPrompt?: string | null
  onBrowseLibrary: () => void
  onSelectTemplate: (template: WorkflowTemplate) => void
}) {
  return (
    <section aria-label={title} className="w-full space-y-2">
      <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body-sm font-medium text-muted-foreground">
          {title}
        </p>
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
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`template-skeleton-${index}`}
              className="h-16 ui-skeleton rounded-xl"
            />
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="ui-empty-state-box px-4">
          <p className="text-body-sm font-medium text-foreground">
            No suggested starting points yet
          </p>
          <p className="mt-1 text-body-sm text-muted-foreground">
            {emptyPrompt ||
              "Describe what you want to accomplish and start from there."}
          </p>
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
