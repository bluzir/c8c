import { ChevronDown, Ellipsis, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { CreateEntryHelpModeHint, ResultModeId } from "@shared/types"
import { RESULT_MODES, type WorkflowResultMode } from "@/lib/result-modes"
import {
  DETAIL_BUDGET_PRESETS,
  getDetailBudgetPresetById,
  resolveDetailBudgetPreset,
} from "@/lib/workflow-detail-budget"

const DEFAULT_HELP_MODE_LABEL = "Intent"
const DEVELOPMENT_HELP_MODE_OPTIONS: Array<{
  value: CreateEntryHelpModeHint
  label: string
}> = [
  { value: "do", label: "Do it" },
  { value: "plan", label: "Plan it" },
  { value: "review", label: "Review it" },
]

export function WorkflowCreateComposerFooter({
  selectedResultMode,
  developmentHelpModeHint,
  showSupportControls,
  onSelectMode,
  onToggleHelpMode,
  promptHelperOpen,
  onTogglePromptHelper,
  optionalDetailCount,
  detailBudget,
  onDetailBudgetChange,
  shortcutHint,
}: {
  selectedResultMode: WorkflowResultMode
  developmentHelpModeHint: CreateEntryHelpModeHint | null
  showSupportControls: boolean
  onSelectMode: (modeId: ResultModeId) => void
  onToggleHelpMode: (helpMode: CreateEntryHelpModeHint | null) => void
  promptHelperOpen: boolean
  onTogglePromptHelper: () => void
  optionalDetailCount: number
  detailBudget: number
  onDetailBudgetChange: (value: number) => void
  /** @deprecated Shortcut hint is now shown via tooltip on the submit button. Kept for API compat. */
  shortcutHint: string
}) {
  const selectedHelpModeLabel =
    DEVELOPMENT_HELP_MODE_OPTIONS.find(
      (option) => option.value === developmentHelpModeHint,
    )?.label || DEFAULT_HELP_MODE_LABEL
  const selectedDetailBudgetPreset = resolveDetailBudgetPreset(detailBudget)
  const detailsBadge =
    optionalDetailCount > 0 ? ` (${optionalDetailCount})` : ""

  return (
    <div className="flex items-center justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {showSupportControls ? (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="gap-1.5 text-muted-foreground"
                >
                  <span aria-hidden>{selectedResultMode.emoji}</span>
                  {selectedResultMode.label}
                  <ChevronDown size={13} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {RESULT_MODES.map((mode) => (
                  <DropdownMenuItem
                    key={mode.id}
                    onSelect={() => onSelectMode(mode.id)}
                  >
                    <span className="mr-2" aria-hidden>
                      {mode.emoji}
                    </span>
                    {mode.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {selectedResultMode.id === "development" ||
            selectedResultMode.id === "content" ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="gap-1.5 text-muted-foreground"
                  >
                    {selectedHelpModeLabel}
                    <ChevronDown size={13} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {DEVELOPMENT_HELP_MODE_OPTIONS.map((option) => (
                    <DropdownMenuCheckboxItem
                      key={option.label}
                      checked={developmentHelpModeHint === option.value}
                      onCheckedChange={() =>
                        onToggleHelpMode(
                          developmentHelpModeHint === option.value
                            ? null
                            : option.value,
                        )
                      }
                    >
                      {option.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        ) : null}
      </div>

      {showSupportControls ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              aria-label="More options"
            >
              <Ellipsis size={15} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuCheckboxItem
              checked={promptHelperOpen}
              onCheckedChange={onTogglePromptHelper}
            >
              <Sparkles size={13} className="mr-1.5" />
              Details{detailsBadge}
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Exploration depth</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={selectedDetailBudgetPreset.id}
              onValueChange={(value) => {
                const preset = getDetailBudgetPresetById(value)
                if (preset) onDetailBudgetChange(preset.value)
              }}
            >
              {DETAIL_BUDGET_PRESETS.map((preset) => (
                <DropdownMenuRadioItem key={preset.id} value={preset.id}>
                  {preset.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
