import React, { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Play, RotateCcw } from "lucide-react"
import { useDataset } from "../../hooks/useDataset"
import { api } from "../../services/api/client"
import { Badge } from "../../components/ui/Badge"
import { ErrorState, LoadingState } from "../../components/ui/EmptyState"
import { Alert, PageHeader, Panel, Stat } from "../../components/ui/Panel"
import { Button } from "../../components/ui/Button"
import { Select } from "../../components/ui/Select"
import { Field, SegmentedControl } from "../../components/ui/Controls"
import { InfoTip } from "../../components/ui/InfoTip"
import { UseBuiltInDataButton } from "../../components/layout/AppShell"
import { SensitivityCell } from "../../types"
import { downloadCsv } from "../../utils/csv"
import { formatPercent, formatRatio, strategyName } from "../../utils/format"
import { cn } from "../../utils/cn"

interface Axis {
  name: string
  label: string
  unit?: string
  min: number
  max: number
  integer: boolean
  defaults: number[]
  /** Multiply for display (e.g. threshold 0.02 -> 2%) */
  display?: (v: number) => string
}

interface GridConfig {
  id: "momentum" | "mean_reversion" | "ma_crossover"
  p1: Axis
  p2: Axis
  base: Record<string, unknown>
  check?: (a: number, b: number) => string | null
}

// Parameter names and ranges match the backend strategy models exactly.
const GRIDS: GridConfig[] = [
  {
    id: "momentum",
    p1: { name: "lookback", label: "Look-back period", unit: "days", min: 5, max: 252, integer: true, defaults: [10, 21, 42, 63, 126, 252] },
    p2: { name: "threshold", label: "Minimum gain to buy", min: -0.5, max: 0.5, integer: false, defaults: [-0.02, 0, 0.02, 0.04], display: v => `${(v * 100).toFixed(0)}%`.replace("-", "−") },
    base: {},
  },
  {
    id: "mean_reversion",
    p1: { name: "lookback", label: "Average length", unit: "days", min: 5, max: 252, integer: true, defaults: [10, 15, 20, 30, 45] },
    p2: { name: "entry_z", label: "Buy at (std. dev.)", min: -5, max: -0.6, integer: false, defaults: [-2.5, -2, -1.75, -1.5, -1.25], display: v => v.toFixed(2).replace("-", "−") },
    base: { exit_z: -0.5 },
  },
  {
    id: "ma_crossover",
    p1: { name: "fast", label: "Short-term average", unit: "days", min: 3, max: 100, integer: true, defaults: [5, 10, 20, 30, 40] },
    p2: { name: "slow", label: "Long-term average", unit: "days", min: 10, max: 300, integer: true, defaults: [50, 100, 150, 200] },
    base: {},
    check: (fast, slow) => (fast >= slow ? "Every short-term value must be smaller than every long-term value." : null),
  },
]

type Metric = "sharpe_ratio" | "total_return" | "max_drawdown"

function parseList(text: string, axis: Axis): { values: number[]; error: string | null } {
  const parts = text.split(/[,\s]+/).filter(Boolean)
  if (parts.length < 2) return { values: [], error: "Enter at least two values, separated by commas." }
  if (parts.length > 10) return { values: [], error: "Use at most 10 values." }
  const nums = parts.map(Number)
  if (nums.some(n => Number.isNaN(n))) return { values: [], error: "Only numbers are allowed." }
  if (axis.integer && nums.some(n => !Number.isInteger(n))) return { values: [], error: "Use whole numbers." }
  if (nums.some(n => n < axis.min || n > axis.max)) return { values: [], error: `Values must be between ${axis.min} and ${axis.max}.` }
  return { values: Array.from(new Set(nums)).sort((a, b) => a - b), error: null }
}

export const RobustnessLabPage: React.FC = () => {
  const { ticker, adjusted, defaultCommissionBps, defaultSlippageBps } = useDataset()
  const [strategyId, setStrategyId] = useState<GridConfig["id"]>("momentum")
  const grid = GRIDS.find(g => g.id === strategyId)!
  const [p1Text, setP1Text] = useState(grid.p1.defaults.join(", "))
  const [p2Text, setP2Text] = useState(grid.p2.defaults.join(", "))
  const [submitted, setSubmitted] = useState({ id: grid.id, p1: grid.p1.defaults, p2: grid.p2.defaults })
  const [metric, setMetric] = useState<Metric>("sharpe_ratio")
  const [selected, setSelected] = useState<SensitivityCell | null>(null)

  const p1 = parseList(p1Text, grid.p1)
  const p2 = parseList(p2Text, grid.p2)
  const crossError = !p1.error && !p2.error && grid.check ? grid.check(Math.max(...p1.values), Math.min(...p2.values)) : null
  const formError = p1.error || p2.error || crossError
  const dirty = submitted.id !== grid.id || submitted.p1.join() !== p1.values.join() || submitted.p2.join() !== p2.values.join()

  const changeStrategy = (id: GridConfig["id"]) => {
    const g = GRIDS.find(x => x.id === id)!
    setStrategyId(id)
    setP1Text(g.p1.defaults.join(", "))
    setP2Text(g.p2.defaults.join(", "))
    setSubmitted({ id, p1: g.p1.defaults, p2: g.p2.defaults })
    setSelected(null)
  }

  const runGrid = GRIDS.find(g => g.id === submitted.id)!
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["robustness", ticker, adjusted, submitted, defaultCommissionBps, defaultSlippageBps],
    queryFn: () =>
      api.runSensitivity({
        ticker,
        adjusted,
        strategy: submitted.id,
        param1_name: runGrid.p1.name,
        param1_values: submitted.p1,
        param2_name: runGrid.p2.name,
        param2_values: submitted.p2,
        base_params: runGrid.base,
        commission_bps: defaultCommissionBps,
        slippage_bps: defaultSlippageBps,
      }),
  })

  const lookup = useMemo(() => {
    const m = new Map<string, SensitivityCell>()
    data?.cells.forEach(c => m.set(`${c.i}:${c.j}`, c))
    return m
  }, [data])

  // Is the best result a broad plateau or a lone spike? Compare it to its neighbours.
  const verdict = useMemo(() => {
    const top = data?.highest_in_sample_cell
    if (!data || !top || top.sharpe_ratio === null) return null
    const neighbours: number[] = []
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        if (di === 0 && dj === 0) continue
        const c = lookup.get(`${top.i + di}:${top.j + dj}`)
        if (c && c.sharpe_ratio !== null) neighbours.push(c.sharpe_ratio)
      }
    const avg = neighbours.length ? neighbours.reduce((a, b) => a + b, 0) / neighbours.length : null
    const ratio = avg !== null && top.sharpe_ratio > 0 ? avg / top.sharpe_ratio : null
    const positive = data.cells.filter(c => (c.sharpe_ratio ?? 0) > 0).length
    let level: "plateau" | "slope" | "spike" = "spike"
    if (ratio !== null && ratio >= 0.8) level = "plateau"
    else if (ratio !== null && ratio >= 0.5) level = "slope"
    return { top, avg, ratio, level, positive }
  }, [data, lookup])

  const range = useMemo(() => {
    const vals = data?.cells.map(c => c[metric]).filter((v): v is number => v !== null) ?? []
    return { min: Math.min(...vals), max: Math.max(...vals) }
  }, [data, metric])

  const cellStyle = (v: number | null): React.CSSProperties => {
    if (v === null) return {}
    // Sharpe/return: diverge around zero. Drawdown: closer to 0 is better.
    let score: number
    if (metric === "max_drawdown") {
      const span = range.max - range.min || 1
      score = ((v - range.min) / span) * 2 - 1 // -1 worst, +1 best
    } else {
      const bound = Math.max(Math.abs(range.min), Math.abs(range.max)) || 1
      score = v / bound
    }
    const a = Math.min(1, Math.abs(score)) * 0.55 + 0.06
    return { backgroundColor: score >= 0 ? `rgb(var(--tm-accent) / ${a})` : `rgb(var(--tm-neg) / ${a})` }
  }

  const fmt = (v: number | null) => (metric === "sharpe_ratio" ? formatRatio(v) : formatPercent(v))
  const fmtAxis = (axis: Axis, v: number) => (axis.display ? axis.display(v) : String(v))

  const exportGrid = () =>
    data &&
    downloadCsv(`${ticker}_${data.strategy}_parameter_grid`, data.cells.map(c => ({ ...c })), [
      { key: "param1", label: runGrid.p1.label },
      { key: "param2", label: runGrid.p2.label },
      { key: "sharpe_ratio", label: "Sharpe ratio" },
      { key: "total_return", label: "Total return" },
      { key: "max_drawdown", label: "Largest drop" },
      { key: "stability_score", label: "Stability score" },
    ])

  return (
    <div>
      <PageHeader
        title="Parameter Stability"
        description="Runs the strategy across a grid of settings. Good settings sit on a broad high area where small changes don't matter much; a single bright cell surrounded by weak ones usually means the result was luck."
      />

      <Panel className="mb-4" title="Settings to scan">
        <div className="grid gap-4 lg:grid-cols-[220px_1fr_1fr_auto] lg:items-start">
          <Select
            label="Strategy"
            value={strategyId}
            onChange={changeStrategy}
            options={GRIDS.map(g => ({ value: g.id, label: strategyName(g.id) }))}
          />
          <Field
            label={`${grid.p1.label}${grid.p1.unit ? ` (${grid.p1.unit})` : ""}`}
            value={p1Text}
            onChange={e => setP1Text(e.target.value)}
            error={p1.error}
            hint={`Comma-separated, ${grid.p1.min} to ${grid.p1.max}`}
          />
          <Field
            label={grid.p2.label}
            value={p2Text}
            onChange={e => setP2Text(e.target.value)}
            error={p2.error || crossError}
            hint={grid.p2.name === "threshold" ? "As decimals: 0.02 means 2%" : `Comma-separated, ${grid.p2.min} to ${grid.p2.max}`}
          />
          <div className="flex gap-2 lg:pt-[26px]">
            <Button
              variant="primary"
              icon={<Play />}
              disabled={!!formError || (!dirty && !error)}
              loading={isFetching}
              onClick={() => {
                setSelected(null)
                setSubmitted({ id: grid.id, p1: p1.values, p2: p2.values })
                if (!dirty) refetch()
              }}
            >
              Run scan
            </Button>
            <Button
              variant="ghost"
              icon={<RotateCcw />}
              onClick={() => changeStrategy(strategyId)}
              title="Restore the default grid"
            >
              Defaults
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-3">
          {(p1.values.length || 0) * (p2.values.length || 0)} combinations. Each one is a full backtest with{" "}
          {defaultCommissionBps + defaultSlippageBps} bps costs (change the default in Settings).
        </p>
      </Panel>

      {isLoading && <LoadingState variant="panel" message="Running a backtest for every combination…" />}
      {error && <ErrorState error={error} onRetry={() => refetch()} secondary={<UseBuiltInDataButton />} />}

      {data && verdict && (
        <div className={cn("space-y-4 transition-opacity", isFetching && "opacity-60")} aria-busy={isFetching}>
          <Panel>
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-md font-semibold">
                    {verdict.level === "plateau" ? "Broad plateau" : verdict.level === "slope" ? "Some drop-off around the best result" : "Isolated peak"}
                  </h2>
                  <Badge variant={verdict.level === "plateau" ? "success" : verdict.level === "slope" ? "warning" : "error"}>
                    {verdict.level === "plateau" ? "Looks stable" : verdict.level === "slope" ? "Use with care" : "Likely overfit"}
                  </Badge>
                </div>
                <p className="mt-1.5 max-w-2xl text-sm text-ink-2">
                  The best in-sample result was a Sharpe ratio of <span className="num font-medium text-ink">{formatRatio(verdict.top.sharpe_ratio)}</span> at{" "}
                  {runGrid.p1.label.toLowerCase()} {fmtAxis(runGrid.p1, verdict.top.param1)} and {runGrid.p2.label.toLowerCase()}{" "}
                  {fmtAxis(runGrid.p2, verdict.top.param2)}. Its neighbouring settings averaged{" "}
                  <span className="num font-medium text-ink">{formatRatio(verdict.avg)}</span>
                  {verdict.ratio !== null && <> ({Math.round(verdict.ratio * 100)}% of the best)</>}.{" "}
                  {verdict.level === "plateau"
                    ? "Small changes to the settings would not have changed the outcome much."
                    : verdict.level === "slope"
                      ? "Results fall away noticeably when settings move, so the exact choice matters."
                      : "Nearby settings did much worse, so the top result is probably a lucky fit to this particular history."}
                </p>
              </div>
              <dl className="grid grid-cols-3 gap-6 md:grid-cols-1 md:gap-3 md:text-right">
                <Stat label="Combinations tested" value={data.total_combinations} />
                <Stat label="With Sharpe above 0" value={`${verdict.positive} of ${data.total_combinations}`} />
                <Stat
                  label={
                    <span className="inline-flex items-center gap-1 md:justify-end">
                      Stability score
                      <InfoTip label="Stability score">
                        Average Sharpe ratio of the best cell and its neighbours, divided by (1 + how much they vary). Higher means a higher and
                        flatter neighbourhood.
                      </InfoTip>
                    </span>
                  }
                  value={verdict.top.stability_score.toFixed(2)}
                />
              </dl>
            </div>
          </Panel>

          <Panel
            title="Results grid"
            description={`Rows: ${runGrid.p1.label.toLowerCase()}. Columns: ${runGrid.p2.label.toLowerCase()}. Select a cell for details.`}
            actions={
              <>
                <SegmentedControl
                  size="sm"
                  ariaLabel="Value shown in each cell"
                  value={metric}
                  onChange={setMetric}
                  options={[
                    { value: "sharpe_ratio", label: "Sharpe" },
                    { value: "total_return", label: "Total return" },
                    { value: "max_drawdown", label: "Largest drop" },
                  ]}
                />
                <Button size="sm" onClick={exportGrid}>CSV</Button>
              </>
            }
          >
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-1 text-sm" role="grid" aria-label="Parameter grid results">
                <thead>
                  <tr>
                    <th className="px-2 text-right text-xs font-medium text-ink-3">
                      {runGrid.p1.label}
                    </th>
                    {data.param2_values.map(v => (
                      <th key={String(v)} className="min-w-[76px] px-2 text-center text-xs font-medium text-ink-2">
                        {fmtAxis(runGrid.p2, v)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.param1_values.map((v1, i) => (
                    <tr key={String(v1)}>
                      <th scope="row" className="num px-2 text-right text-xs font-medium text-ink-2">
                        {fmtAxis(runGrid.p1, v1)}
                      </th>
                      {data.param2_values.map((v2, j) => {
                        const cell = lookup.get(`${i}:${j}`)
                        const val = cell ? cell[metric] : null
                        const isTop = verdict.top.i === i && verdict.top.j === j
                        const isSel = selected?.i === i && selected?.j === j
                        return (
                          <td key={String(v2)} className="p-0">
                            <button
                              type="button"
                              onClick={() => cell && setSelected(cell)}
                              aria-pressed={isSel}
                              aria-label={`${runGrid.p1.label} ${fmtAxis(runGrid.p1, v1)}, ${runGrid.p2.label} ${fmtAxis(runGrid.p2, v2)}: ${fmt(val)}${isTop ? ", best in-sample" : ""}`}
                              style={cellStyle(val)}
                              className={cn(
                                "num relative flex h-12 w-full flex-col items-center justify-center rounded px-2 text-sm font-medium text-ink transition-shadow",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                                isSel && "ring-2 ring-ink",
                                isTop && !isSel && "ring-2 ring-brand"
                              )}
                            >
                              {fmt(val)}
                              {isTop && <span className="text-2xs font-normal text-ink-2">best</span>}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 min-h-[52px] rounded-md border border-line bg-subtle px-3 py-2.5 text-sm">
              {selected ? (
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <span className="font-medium text-ink">
                    {runGrid.p1.label} {fmtAxis(runGrid.p1, selected.param1)}, {runGrid.p2.label.toLowerCase()} {fmtAxis(runGrid.p2, selected.param2)}
                  </span>
                  <span>Sharpe <span className="num font-medium text-ink">{formatRatio(selected.sharpe_ratio)}</span></span>
                  <span>Total return <span className="num font-medium text-ink">{formatPercent(selected.total_return)}</span></span>
                  <span>Largest drop <span className="num font-medium text-neg">{formatPercent(selected.max_drawdown)}</span></span>
                  <span>Stability <span className="num font-medium text-ink">{selected.stability_score.toFixed(2)}</span></span>
                </div>
              ) : (
                <span className="text-ink-3">Select a cell to see all its results.</span>
              )}
            </div>
          </Panel>

          <Alert tone="info" title="Picking the best cell is itself a form of fitting">
            The best cell was chosen after looking at all of them, so its result is optimistic. Use the Out-of-Sample Test to check whether
            settings picked on older data still work on newer data.
          </Alert>
        </div>
      )}
    </div>
  )
}
