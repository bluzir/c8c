import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RESULT_MODES } from "@/lib/result-modes"
import type { ResultModeId } from "@shared/types"

export function WorkflowCreateModeTabs({
  selectedModeId,
  onSelectMode,
}: {
  selectedModeId: ResultModeId
  onSelectMode: (modeId: ResultModeId) => void
}) {
  return (
    <div className="px-1">
      <Tabs
        value={selectedModeId}
        onValueChange={(value) => onSelectMode(value as ResultModeId)}
        className="w-full"
      >
        <TabsList variant="plain" className="h-auto w-fit flex-wrap gap-1">
          {RESULT_MODES.map((mode) => (
            <TabsTrigger
              key={mode.id}
              value={mode.id}
              variant="plain"
              className="h-8 gap-2 px-3 text-[15px]"
            >
              <span aria-hidden>{mode.emoji}</span>
              <span>{mode.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
