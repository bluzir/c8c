import type { RunResult } from "@shared/types"
import { cn } from "@/lib/cn"

// Simple SVG sparkline for score/cost trends
function Sparkline({
  values,
  maxValue,
  color = "hsl(var(--accent))",
  width = 120,
  height = 24,
}: {
  values: number[]
  maxValue: number
  color?: string
  width?: number
  height?: number
}) {
  if (values.length < 2) return null
  const padding = 2
  const w = width - padding * 2
  const h = height - padding * 2

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * w
    const y = padding + h - (maxValue > 0 ? (v / maxValue) * h : 0)
    return `${x},${y}`
  })

  return (
    <svg
      width={width}
      height={height}
      className="inline-block"
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dot on latest value */}
      {values.length > 0 &&
        (() => {
          const lastIdx = values.length - 1
          const x = padding + (lastIdx / (values.length - 1)) * w
          const y =
            padding + h - (maxValue > 0 ? (values[lastIdx] / maxValue) * h : 0)
          return <circle cx={x} cy={y} r={2} fill={color} />
        })()}
    </svg>
  )
}

export function RunTrends({ runs }: { runs: RunResult[] }) {
  // Only use completed runs with metrics, sorted chronologically
  const metricsRuns = runs
    .filter((r) => r.status === "completed" && r.durationMs != null)
    .sort((a, b) => a.startedAt - b.startedAt)

  if (metricsRuns.length === 0) return null

  if (metricsRuns.length < 2) {
    return (
      <div className="space-y-2 px-1 pb-2">
        <div className="ui-meta-label">Trends</div>
        <div className="rounded-md border border-hairline bg-surface-2 px-2.5 py-1.5 ui-meta-text text-muted-foreground">
          Complete one more run to enable trend charts.
        </div>
      </div>
    )
  }

  const runsWithCost = metricsRuns.filter(
    (r) => typeof r.totalCost === "number",
  )
  const costs = runsWithCost.map((r) => r.totalCost ?? 0)
  const durations = metricsRuns.map((r) => (r.durationMs || 0) / 1000)

  // Collect all eval node scores across runs
  const allEvalNodeIds = new Set<string>()
  for (const r of metricsRuns) {
    if (r.evalScores) {
      for (const id of Object.keys(r.evalScores)) allEvalNodeIds.add(id)
    }
  }
  const firstEvalId = [...allEvalNodeIds].sort((a, b) => a.localeCompare(b))[0]
  const evalScorePoints = firstEvalId
    ? metricsRuns
        .map((r) => r.evalScores?.[firstEvalId])
        .filter((score): score is number => typeof score === "number")
    : []

  const maxCost = costs.reduce((max, value) => Math.max(max, value), 0.001)
  const maxDuration = durations.reduce((max, value) => Math.max(max, value), 1)
  const latestCost = costs.length > 0 ? costs[costs.length - 1] : null
  const latestDuration = durations[durations.length - 1]

  return (
    <div className="space-y-2 px-1 pb-2">
      <div className="ui-meta-label">Trends ({metricsRuns.length} runs)</div>
      <div className="grid grid-cols-2 gap-2">
        <TrendCard
          label="Cost"
          value={latestCost == null ? "n/a" : `$${latestCost.toFixed(4)}`}
          sparkline={
            costs.length >= 2 ? (
              <Sparkline values={costs} maxValue={maxCost} />
            ) : null
          }
        />
        <TrendCard
          label="Duration"
          value={`${latestDuration.toFixed(1)}s`}
          sparkline={
            <Sparkline
              values={durations}
              maxValue={maxDuration}
              color="hsl(var(--status-info))"
            />
          }
        />
        {evalScorePoints.length >= 2 && (
          <TrendCard
            className="col-span-2"
            label={firstEvalId ? `Eval: ${firstEvalId}` : "Eval Score"}
            labelTitle={firstEvalId ?? undefined}
            value={`${evalScorePoints[evalScorePoints.length - 1]}/10`}
            sparkline={
              <Sparkline
                values={evalScorePoints}
                maxValue={10}
                color="hsl(var(--status-success))"
              />
            }
          />
        )}
      </div>
    </div>
  )
}

function TrendCard({
  label,
  labelTitle,
  value,
  sparkline,
  className,
}: {
  label: string
  labelTitle?: string
  value: string
  sparkline: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-hairline bg-surface-2 px-2.5 py-1.5",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className="ui-meta-text text-muted-foreground truncate"
          title={labelTitle ?? label}
        >
          {label}
        </span>
        <span className="ui-metric-text">{value}</span>
      </div>
      <div className="mt-1">{sparkline}</div>
    </div>
  )
}

export function RunCompare({
  runA,
  runB,
}: {
  runA: RunResult
  runB: RunResult
}) {
  const costA = typeof runA.totalCost === "number" ? runA.totalCost : null
  const costB = typeof runB.totalCost === "number" ? runB.totalCost : null
  const durationA = typeof runA.durationMs === "number" ? runA.durationMs : null
  const durationB = typeof runB.durationMs === "number" ? runB.durationMs : null
  const costDiff = costA != null && costB != null ? costB - costA : null
  const durationDiff =
    durationA != null && durationB != null ? durationB - durationA : null

  // Compare eval scores
  const allEvalIds = new Set([
    ...Object.keys(runA.evalScores || {}),
    ...Object.keys(runB.evalScores || {}),
  ])

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1 ui-meta-text">
        <div className="text-muted-foreground" />
        <div className="text-body-md font-medium text-center">Run A</div>
        <div className="text-body-md font-medium text-center">Run B</div>
      </div>
      <CompareRow
        label="Cost"
        valueA={costA != null ? `$${costA.toFixed(4)}` : "n/a"}
        valueB={costB != null ? `$${costB.toFixed(4)}` : "n/a"}
        diff={costDiff}
        formatDiff={(d) => `${d > 0 ? "+" : ""}$${d.toFixed(4)}`}
        betterWhenLower
      />
      <CompareRow
        label="Duration"
        valueA={durationA != null ? `${(durationA / 1000).toFixed(1)}s` : "n/a"}
        valueB={durationB != null ? `${(durationB / 1000).toFixed(1)}s` : "n/a"}
        diff={durationDiff}
        formatDiff={(d) => `${d > 0 ? "+" : ""}${(d / 1000).toFixed(1)}s`}
        betterWhenLower
      />
      {[...allEvalIds].map((id) => {
        const scoreA =
          typeof runA.evalScores?.[id] === "number" ? runA.evalScores[id] : null
        const scoreB =
          typeof runB.evalScores?.[id] === "number" ? runB.evalScores[id] : null
        return (
          <CompareRow
            key={id}
            label={`Score: ${id}`}
            labelTitle={id}
            valueA={scoreA != null ? `${scoreA}/10` : "n/a"}
            valueB={scoreB != null ? `${scoreB}/10` : "n/a"}
            diff={scoreA != null && scoreB != null ? scoreB - scoreA : null}
            formatDiff={(d) => `${d > 0 ? "+" : ""}${d}`}
            betterWhenLower={false}
          />
        )
      })}
    </div>
  )
}

function CompareRow({
  label,
  labelTitle,
  valueA,
  valueB,
  diff,
  formatDiff,
  betterWhenLower,
}: {
  label: string
  labelTitle?: string
  valueA: string
  valueB: string
  diff: number | null
  formatDiff: (d: number) => string
  betterWhenLower: boolean
}) {
  const improved = diff != null && (betterWhenLower ? diff < 0 : diff > 0)
  const worsened = diff != null && (betterWhenLower ? diff > 0 : diff < 0)

  return (
    <div className="grid grid-cols-3 gap-1 ui-meta-text items-center">
      <div
        className="text-muted-foreground truncate"
        title={labelTitle ?? label}
      >
        {label}
      </div>
      <div className="ui-metric-text text-center">{valueA}</div>
      <div className="ui-metric-text flex items-center justify-center gap-1 text-center">
        {valueB}
        {diff != null && diff !== 0 && (
          <span
            className={cn(
              "ui-meta-text",
              improved && "text-status-success",
              worsened && "text-status-danger",
            )}
          >
            ({formatDiff(diff)})
          </span>
        )}
      </div>
    </div>
  )
}
