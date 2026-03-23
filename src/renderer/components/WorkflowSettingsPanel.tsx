import { useEffect, useState } from "react"
import { useAtom, useAtomValue } from "jotai"
import type { WorkflowDefaults } from "@shared/types"
import {
  currentWorkflowAtom,
  globalExecutionDefaultsAtom,
  mcpServersAtom,
  mainViewAtom,
  viewModeAtom,
} from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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

const SETTINGS_GROUP_CLASS = "w-full max-w-[620px] ui-slab space-y-3"
const SETTINGS_INLINE_STATUS_CLASS =
  "flex w-full max-w-[620px] items-center justify-between ui-section-divider"

export function WorkflowSettingsPanel() {
  const [workflow] = useAtom(currentWorkflowAtom)
  const { setWorkflow } = useWorkflowWithUndo()
  const [mcpServers] = useAtom(mcpServersAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [, setViewMode] = useAtom(viewModeAtom)
  const globalExecutionDefaults = useAtomValue(globalExecutionDefaultsAtom)
  const [approvedPluginMcpCount, setApprovedPluginMcpCount] = useState(0)
  const defaults = workflow.defaults || {}
  const enabledMcpCount =
    mcpServers.filter((s) => !s.disabled).length + approvedPluginMcpCount

  useEffect(() => {
    let cancelled = false

    const loadPluginMcpCount = async () => {
      try {
        const pluginServers = await window.api.mcpListPluginServers()
        if (!cancelled) {
          setApprovedPluginMcpCount(
            pluginServers.filter(
              (server) => server.approved && !server.disabled,
            ).length,
          )
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

  const updateDefaultField = <K extends keyof WorkflowDefaults>(
    field: K,
    value: WorkflowDefaults[K],
  ) => {
    setWorkflow(
      (prev) => ({
        ...prev,
        defaults: {
          ...(prev.defaults || {}),
          [field]: value,
        },
      }),
      { coalesceKey: `workflow-defaults:${String(field)}` },
    )
  }
  const stopConditions = defaults.stop_on ?? []
  const toggleStopCondition = (
    condition: NonNullable<WorkflowDefaults["stop_on"]>[number],
    checked: boolean,
  ) => {
    const nextConditions = checked
      ? Array.from(new Set([...stopConditions, condition]))
      : stopConditions.filter((entry) => entry !== condition)
    updateDefaultField(
      "stop_on",
      nextConditions.length > 0 ? nextConditions : undefined,
    )
  }

  return (
    <section aria-label="Flow defaults" className="space-y-4 ui-fade-slide-in">
      <div className="flex w-full max-w-[620px] items-center justify-between gap-3">
        <h2 className="text-title-sm text-foreground">Flow defaults</h2>
        <Button variant="ghost" size="sm" onClick={() => setViewMode("list")}>
          Back to flow
        </Button>
      </div>

      <div className={SETTINGS_GROUP_CLASS}>
        <div className="space-y-1">
          <h3 className="section-kicker">Execution Defaults</h3>
          <p className="ui-meta-text text-muted-foreground">
            Overrides global defaults. Leave empty to inherit from{" "}
            <Button
              variant="link"
              size="bare"
              className="h-auto align-baseline text-primary"
              onClick={() => setMainView("settings")}
            >
              Settings
            </Button>
            .
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label
              htmlFor="workflow-default-max-turns"
              className="ui-meta-text text-muted-foreground"
            >
              Max turns per step
            </Label>
            <Input
              id="workflow-default-max-turns"
              type="number"
              min={1}
              max={1000}
              step="1"
              value={defaults.maxTurns ?? ""}
              placeholder={`Inherited: ${globalExecutionDefaults.maxTurns}`}
              className="h-control-sm text-body-md"
              onChange={(event) => {
                const maxTurns = parseOptionalPositiveInt(event.target.value)
                updateDefaultField("maxTurns", maxTurns)
              }}
            />
          </div>
          <div className="space-y-1">
            <Label
              htmlFor="workflow-default-max-parallel"
              className="ui-meta-text text-muted-foreground"
            >
              Max parallel steps
            </Label>
            <Input
              id="workflow-default-max-parallel"
              type="number"
              min={1}
              max={32}
              step="1"
              value={defaults.maxParallel ?? ""}
              placeholder={`Inherited: ${globalExecutionDefaults.maxParallel}`}
              className="h-control-sm text-body-md"
              onChange={(event) => {
                const maxParallel = parseOptionalPositiveInt(event.target.value)
                updateDefaultField("maxParallel", maxParallel)
              }}
            />
          </div>
          <div className="space-y-1">
            <Label
              htmlFor="workflow-default-timeout-minutes"
              className="ui-meta-text text-muted-foreground"
            >
              Step timeout (minutes)
            </Label>
            <Input
              id="workflow-default-timeout-minutes"
              type="number"
              min={1}
              max={480}
              step="1"
              value={defaults.timeout_minutes ?? ""}
              placeholder={`Inherited: ${globalExecutionDefaults.timeout_minutes}`}
              className="h-control-sm text-body-md"
              onChange={(event) => {
                const timeoutMinutes = parseOptionalPositiveInt(
                  event.target.value,
                )
                updateDefaultField("timeout_minutes", timeoutMinutes)
              }}
            />
          </div>
        </div>
        <p className="ui-meta-text text-muted-foreground">
          Provider and model stay in the input section.
        </p>
      </div>

      <div className={SETTINGS_GROUP_CLASS}>
        <div className="space-y-1">
          <h3 className="section-kicker">Budget & Limits</h3>
          <p className="ui-meta-text text-muted-foreground">
            Set a limit and a stop condition when this flow should halt
            automatically.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label
              htmlFor="workflow-budget-cost"
              className="ui-meta-text text-muted-foreground"
            >
              Cost limit (USD)
            </Label>
            <Input
              id="workflow-budget-cost"
              type="number"
              min={0}
              step="0.001"
              value={defaults.budget_cost_usd ?? ""}
              placeholder="Optional"
              className="h-control-sm text-body-md"
              onChange={(event) => {
                const budgetCostUsd = parseOptionalNumber(event.target.value)
                updateDefaultField("budget_cost_usd", budgetCostUsd)
              }}
            />
          </div>
          <div className="space-y-1">
            <Label
              htmlFor="workflow-budget-tokens"
              className="ui-meta-text text-muted-foreground"
            >
              Token limit
            </Label>
            <Input
              id="workflow-budget-tokens"
              type="number"
              min={0}
              step="1"
              value={defaults.budget_tokens ?? ""}
              placeholder="Optional"
              className="h-control-sm text-body-md"
              onChange={(event) => {
                const budgetTokens = parseOptionalNumber(event.target.value)
                updateDefaultField("budget_tokens", budgetTokens)
              }}
            />
          </div>
        </div>
        <div className="space-y-2">
          <p className="ui-meta-text text-muted-foreground">
            Stop the flow when
          </p>
          <label className="flex items-start gap-2 text-body-sm text-foreground">
            <Checkbox
              checked={stopConditions.includes("budget_exceeded")}
              onChange={(event) =>
                toggleStopCondition("budget_exceeded", event.target.checked)
              }
            />
            <span>Budget is exceeded</span>
          </label>
          <label className="flex items-start gap-2 text-body-sm text-foreground">
            <Checkbox
              checked={stopConditions.includes("mandatory_node_failed")}
              onChange={(event) =>
                toggleStopCondition(
                  "mandatory_node_failed",
                  event.target.checked,
                )
              }
            />
            <span>A required step fails</span>
          </label>
        </div>
      </div>

      <div className={SETTINGS_INLINE_STATUS_CLASS}>
        <div className="flex items-center gap-2">
          <Server size={14} className="text-muted-foreground" />
          <span className="text-body-sm text-muted-foreground">
            {enabledMcpCount > 0
              ? `${enabledMcpCount} MCP server${enabledMcpCount !== 1 ? "s" : ""} available`
              : "No MCP servers configured"}
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
