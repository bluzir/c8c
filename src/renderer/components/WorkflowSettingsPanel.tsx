import { useEffect, useState } from "react"
import { useAtom } from "jotai"
import {
  currentWorkflowAtom,
  mcpServersAtom,
  mainViewAtom,
} from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Server } from "lucide-react"
import { useWorkflowWithUndo } from "@/hooks/useWorkflowWithUndo"

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  if (Number.isNaN(parsed)) return undefined
  return Math.max(0, parsed)
}

function parseOptionalPositiveInt(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  if (Number.isNaN(parsed)) return undefined
  return Math.max(1, Math.floor(parsed))
}

const SETTINGS_GROUP_CLASS = "w-full max-w-[620px] rounded-lg bg-surface-2/35 px-3 py-3 space-y-2"
const SETTINGS_INLINE_STATUS_CLASS = "flex w-full max-w-[620px] items-center justify-between rounded-lg bg-surface-2/35 px-3 py-2"

export function WorkflowSettingsPanel() {
  const [workflow] = useAtom(currentWorkflowAtom)
  const { setWorkflow } = useWorkflowWithUndo()
  const [mcpServers] = useAtom(mcpServersAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [approvedPluginMcpCount, setApprovedPluginMcpCount] = useState(0)
  const defaults = workflow.defaults || {}
  const enabledMcpCount = mcpServers.filter((s) => !s.disabled).length + approvedPluginMcpCount

  useEffect(() => {
    let cancelled = false

    const loadPluginMcpCount = async () => {
      try {
        const pluginServers = await window.api.mcpListPluginServers()
        if (!cancelled) {
          setApprovedPluginMcpCount(pluginServers.filter((server) => server.approved && !server.disabled).length)
        }
      } catch {
        if (!cancelled) {
          setApprovedPluginMcpCount(0)
        }
      }
    }

    void loadPluginMcpCount()
    return () => {
      cancelled = true
    }
  }, [])

  const updateDefaults = (patch: Partial<typeof defaults>) => {
    setWorkflow((prev) => ({
      ...prev,
      defaults: {
        ...(prev.defaults || {}),
        ...patch,
      },
    }), { coalesceKey: "workflow-defaults:settings" })
  }

  return (
    <section aria-label="Flow defaults" className="space-y-3 ui-fade-slide-in">
      <h2 className="section-kicker">Flow Defaults</h2>
      <p className="max-w-[620px] text-body-sm text-muted-foreground">
        App-wide provider access lives in Settings, the flow provider and model live in the Input step, and any node-specific overrides stay with that step.
      </p>

      <div className={SETTINGS_GROUP_CLASS}>
        <h3 className="section-kicker">Execution Defaults</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="workflow-default-max-turns" className="ui-meta-text text-muted-foreground">
              Max turns per step
            </Label>
            <Input
              id="workflow-default-max-turns"
              type="number"
              min={1}
              max={200}
              step="1"
              value={defaults.maxTurns ?? ""}
              placeholder="e.g. 60"
              className="h-control-sm ui-body-text"
              onChange={(event) => {
                const maxTurns = parseOptionalPositiveInt(event.target.value)
                updateDefaults({ maxTurns })
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="workflow-default-max-parallel" className="ui-meta-text text-muted-foreground">
              Max parallel steps
            </Label>
            <Input
              id="workflow-default-max-parallel"
              type="number"
              min={1}
              max={32}
              step="1"
              value={defaults.maxParallel ?? ""}
              placeholder="e.g. 8"
              className="h-control-sm ui-body-text"
              onChange={(event) => {
                const maxParallel = parseOptionalPositiveInt(event.target.value)
                updateDefaults({ maxParallel })
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="workflow-default-timeout-minutes" className="ui-meta-text text-muted-foreground">
              Step timeout (minutes)
            </Label>
            <Input
              id="workflow-default-timeout-minutes"
              type="number"
              min={1}
              max={240}
              step="1"
              value={defaults.timeout_minutes ?? ""}
              placeholder="e.g. 30"
              className="h-control-sm ui-body-text"
              onChange={(event) => {
                const timeoutMinutes = parseOptionalPositiveInt(event.target.value)
                updateDefaults({ timeout_minutes: timeoutMinutes })
              }}
            />
          </div>
        </div>
        <p className="ui-meta-text text-muted-foreground">
          Provider and model are configured from the flow Input step. These values stay as flow-wide execution defaults.
        </p>
      </div>

      <div className={SETTINGS_GROUP_CLASS}>
        <h3 className="section-kicker">Budget & Limits</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="workflow-budget-cost" className="ui-meta-text text-muted-foreground">
              Cost limit (USD)
            </Label>
            <Input
              id="workflow-budget-cost"
              type="number"
              min={0}
              step="0.001"
              value={defaults.budget_cost_usd ?? ""}
              placeholder="e.g. 0.10"
              className="h-control-sm ui-body-text"
              onChange={(event) => {
                const budgetCostUsd = parseOptionalNumber(event.target.value)
                updateDefaults({ budget_cost_usd: budgetCostUsd })
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="workflow-budget-tokens" className="ui-meta-text text-muted-foreground">
              Token limit
            </Label>
            <Input
              id="workflow-budget-tokens"
              type="number"
              min={0}
              step="1"
              value={defaults.budget_tokens ?? ""}
              placeholder="e.g. 120000"
              className="h-control-sm ui-body-text"
              onChange={(event) => {
                const budgetTokens = parseOptionalNumber(event.target.value)
                updateDefaults({ budget_tokens: budgetTokens })
              }}
            />
          </div>
        </div>
        <p className="ui-meta-text text-muted-foreground">
          Limits are optional. When set, execution stops as soon as a limit is exceeded.
        </p>
      </div>

      {/* MCP status indicator */}
      <div className={SETTINGS_INLINE_STATUS_CLASS}>
        <div className="flex items-center gap-2">
          <Server size={14} className="text-muted-foreground" />
          <span className="text-body-sm text-muted-foreground">
            {enabledMcpCount > 0
              ? `${enabledMcpCount} MCP server${enabledMcpCount !== 1 ? "s" : ""} available`
              : "No MCP servers configured"
            }
          </span>
        </div>
        <Button
          variant="link"
          size="bare"
          onClick={() => setMainView("settings")}
          className="text-body-sm text-primary"
        >
          Manage
        </Button>
      </div>
    </section>
  )
}
