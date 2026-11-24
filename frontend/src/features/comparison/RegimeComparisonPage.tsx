import React, { useMemo, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { AlertTriangle } from "lucide-react"
import { api } from "../../services/api/client"
import { useDataset } from "../../hooks/useDataset"
import { useDebounced } from "../../hooks/useDebounced"
import { Badge, RegimeBadge } from "../../components/ui/Badge"
import { ErrorState, LoadingState } from "../../components/ui/EmptyState"
import { Alert, PageHeader, Panel } from "../../components/ui/Panel"
import { Select } from "../../components/ui/Select"
import { SliderField } from "../../components/ui/Controls"
import { rechartsAxis, rechartsTooltip, useChartTheme } from "../../components/charts/chartTheme"
import { UseBuiltInDataButton } from "../../components/layout/AppShell"
import {
  METRIC_TOOLTIPS,
  REGIME_META,
  REGIME_ORDER,
  STRATEGY_META,
  type StrategyId,
  formatInt,
  formatPercent,
  formatRatio,
  regimeMeta,
} from "../../utils/format"
import { cn } from "../../utils/cn"

type MetricKey = "sharpe_ratio" | "annualized_return" | "annualized_volatility" | "hit_rate" | "exposure" | "trades_entered" | "observations"

const METRICS: { key: MetricKey; label: string; better: "high" | "low" | null; description: string }[] = [
  { key: "sharpe_ratio", label: "Sharpe ratio", better: "high", description: "Return per unit of risk" },
  { key: "annualized_return", label: "Yearly return", better: "high", description: "Average return per year" },
  { key: "annualized_volatility", label: "Volatility", better: "low", description: "Size of the ups and downs" },
  { key: "hit_rate", label: "Hit rate", better: "high", description: "Share of days with a gain" },
  { key: "exposure", label: "Time invested", better: null, description: "Share of days holding a position" },
  { key: "trades_entered", label: "Trades started", better: null, description: "Number of new trades" },
  { key: "observations", label: "Days in sample", better: null, description: "How many days the figures are based on" },
]

const STRATS = Object.keys(STRATEGY_META) as StrategyId[]
const LOW_SAMPLE = 60

/** Replace API labels like "Bear/Low Vol" with the plain names used in the interface. */
function plainInsight(text: string): string {
  let out = text
  ;(Object.keys(REGIME_META) as (keyof typeof REGIME_META)[]).forEach(k => {
    out = out.split(k).join(REGIME_META[k].name.toLowerCase())
  })
  return out
    .replace(/Mean Reversion/g, "Mean reversion")
    .replace(/MA Crossover/g, "Moving-average crossover")
    .replace(/Historical association, not causation\.?/g, "")
    .trim()
}

export const RegimeComparisonPage: React.FC = () => {
  const { ticker, adjusted, annualRf, defaultCommissionBps, defaultSlippageBps } = useDataset()
  const t = useChartTheme()
  const [metric, setMetric] = useState<MetricKey>("sharpe_ratio")
  const [cost, setCost] = useState(defaultCommissionBps + defaultSlippageBps)
  const debouncedCost = useDebounced(cost, 400)

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["comparison", ticker, adjusted, debouncedCost, annualRf],
    queryFn: () =>
      api.compareStrategies({
        ticker,
        adjusted,
        commission_bps: debouncedCost / 2,
        slippage_bps: debouncedCost / 2,
        annual_rf: annualRf,
      }),
    placeholderData: keepPreviousData,
  })

  const meta = METRICS.find(m => m.key === metric)!
  const matrix = data?.regime_matrix ?? {}

  const format = (v: number | null | undefined) => {
    if (v === null || v === undefined) return "—"
    if (metric === "annualized_return") return formatPercent(v)
    if (metric === "annualized_volatility" || metric === "hit_rate" || metric === "exposure") return formatPercent(v, false, 1)
    if (metric === "sharpe_ratio") return formatRatio(v)
    return formatInt(v)
  }

  const chartRows = useMemo(
    () =>
      REGIME_ORDER.map(r => {
        const row: Record<string, string | number | null> = { condition: regimeMeta(r).name }
        STRATS.forEach(s => {
          const cell = matrix[s]?.[r]
          const v = cell?.[metric]
          row[s] = v === null || v === undefined ? null : ["annualized_return", "annualized_volatility", "hit_rate", "exposure"].includes(metric) ? v * 100 : v
        })
        return row
      }),
    [matrix, metric]
  )

  if (isLoading) return <LoadingState message="Testing all four strategies in each market condition…" />
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} secondary={<UseBuiltInDataButton />} />

  const best = (r: string): StrategyId | null => {
    if (!meta.better) return null
    let pick: StrategyId | null = null
    let pv = meta.better === "high" ? -Infinity : Infinity
    STRATS.forEach(s => {
      const cell = matrix[s]?.[r]
      const v = cell?.[metric]
      if (v === null || v === undefined || (cell?.observations ?? 0) < LOW_SAMPLE) return
      if (meta.better === "high" ? v > pv : v < pv) {
        pv = v
        pick = s
      }
    })
    return pick
  }

  const strategyColors: Record<StrategyId, string> = {
    momentum: t.primary,
    mean_reversion: t.secondary,
    ma_crossover: t.isDark ? "#8FB3CF" : "#3F6E91",
    buy_and_hold: t.isDark ? "#56708A" : "#BCC5CC",
  }

  return (
    <div>
      <PageHeader
        title="Compare by Condition"
        description="All four strategies, run with their default settings, broken down by market condition. Use it to see which approach has historically suited which kind of market."
      />

      <div className="mb-4 flex flex-wrap items-end gap-6 rounded-lg border border-line bg-surface px-4 py-3">
        <Select
          label="Compare by"
          value={metric}
          onChange={setMetric}
          options={METRICS.map(m => ({ value: m.key, label: m.label, description: m.description }))}
          className="w-56"
        />
        <SliderField
          label="Trading cost per trade"
          value={cost}
          onChange={setCost}
          min={0}
          max={40}
          format={v => `${v} bps`}
          className="w-64"
          info="Commission plus slippage. Results update when you let go."
        />
        <p className="max-w-sm text-xs text-ink-3">
          A day's return is counted under the condition known at the close of the previous day, so the test never peeks ahead.
        </p>
      </div>

      <div className={cn("space-y-4 transition-opacity", isFetching && "opacity-60")} aria-busy={isFetching}>
        <Panel
          title={meta.label}
          description={METRIC_TOOLTIPS[metric]?.description}
          flush
          footer={
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 text-warn" aria-hidden="true" />
              Faded cells are based on fewer than {LOW_SAMPLE} days and are not reliable.
              {meta.better && " The highlighted cell is the best reliable figure in each row."}
            </span>
          }
        >
          <div className="overflow-x-auto">
            <table className="tm-table">
              <thead>
                <tr>
                  <th>Condition</th>
                  {STRATS.map(s => (
                    <th key={s} className="r">{STRATEGY_META[s].name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {REGIME_ORDER.map(r => {
                  const winner = best(r)
                  return (
                    <tr key={r}>
                      <td><RegimeBadge label={r} /></td>
                      {STRATS.map(s => {
                        const cell = matrix[s]?.[r]
                        const n = cell?.observations ?? 0
                        const low = n < LOW_SAMPLE
                        const isBest = winner === s
                        return (
                          <td key={s} className={cn("r", low && "text-ink-3", isBest && "bg-accent/10")}>
                            <div className={cn("num text-md", isBest ? "font-semibold text-ink" : "font-medium")}>{format(cell?.[metric])}</div>
                            <div className="num text-xs text-ink-3">
                              {formatInt(n)} days{low && " (few)"}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Side by side">
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={chartRows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke={t.grid} />
                <XAxis dataKey="condition" {...rechartsAxis(t)} />
                <YAxis {...rechartsAxis(t)} axisLine={false} tickFormatter={v => (["annualized_return", "annualized_volatility", "hit_rate", "exposure"].includes(metric) ? `${v}%` : String(v))} />
                <ReferenceLine y={0} stroke={t.axis} />
                <Tooltip
                  {...rechartsTooltip(t)}
                  cursor={{ fill: t.grid }}
                  formatter={(v: number, name: string) => [
                    ["annualized_return", "annualized_volatility", "hit_rate", "exposure"].includes(metric) ? `${v.toFixed(1)}%` : metric === "sharpe_ratio" ? v.toFixed(2) : formatInt(v),
                    STRATEGY_META[name as StrategyId]?.name ?? name,
                  ]}
                />
                <Legend formatter={(v: string) => <span style={{ color: t.text, fontSize: 12 }}>{STRATEGY_META[v as StrategyId]?.name ?? v}</span>} iconType="square" iconSize={10} />
                {STRATS.map(s => (
                  <Bar key={s} dataKey={s} fill={strategyColors[s]} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Whole-period results" flush>
          <div className="overflow-x-auto">
            <table className="tm-table">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th className="r">Yearly growth</th>
                  <th className="r">Sharpe ratio</th>
                  <th className="r">Largest drop</th>
                  <th className="r">Volatility</th>
                  <th className="r">Trades</th>
                  <th className="r">Time invested</th>
                </tr>
              </thead>
              <tbody>
                {STRATS.map(s => {
                  const o = data.overall_metrics[s]
                  if (!o) return null
                  return (
                    <tr key={s}>
                      <td className="font-medium">{STRATEGY_META[s].name}</td>
                      <td className={cn("r num", (o.cagr ?? 0) >= 0 ? "text-pos" : "text-neg")}>{formatPercent(o.cagr)}</td>
                      <td className="r num">{formatRatio(o.sharpe_ratio)}</td>
                      <td className="r num text-neg">{formatPercent(o.max_drawdown)}</td>
                      <td className="r num">{formatPercent(o.annualized_volatility, false, 1)}</td>
                      <td className="r num">{formatInt(o.trades_count)}</td>
                      <td className="r num">{formatPercent(o.exposure, false, 0)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="What stands out" description="Patterns found automatically, only where a condition has at least 60 days of data.">
          {data.insights.length === 0 ? (
            <p className="text-sm text-ink-2">No strategy stood out clearly from the others in any condition with enough data.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.insights.map((item, i) => (
                <li key={i} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-3">
                  <Badge variant="brand" className="shrink-0">{(c => c.charAt(0) + c.slice(1).toLowerCase())(item.category.replace(/Regime/g, "condition"))}</Badge>
                  <p className="text-sm text-ink">{plainInsight(item.statement)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Alert tone="info">
          These are patterns in past data, not proof that one causes the other. A strategy that did well in a condition before may not do
          so next time.
        </Alert>
      </div>
    </div>
  )
}
