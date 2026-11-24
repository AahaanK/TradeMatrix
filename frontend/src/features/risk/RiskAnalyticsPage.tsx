import React, { useMemo, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { useDataset } from "../../hooks/useDataset"
import { useDebounced } from "../../hooks/useDebounced"
import { api } from "../../services/api/client"
import { MetricCard } from "../../components/ui/MetricCard"
import { Badge } from "../../components/ui/Badge"
import { ErrorState, LoadingState } from "../../components/ui/EmptyState"
import { Alert, PageHeader, Panel } from "../../components/ui/Panel"
import { Select } from "../../components/ui/Select"
import { SegmentedControl, SliderField } from "../../components/ui/Controls"
import { LegendItem } from "../../components/charts/RangeButtons"
import { rechartsAxis, rechartsTooltip, shortDateTick, useChartTheme } from "../../components/charts/chartTheme"
import { UseBuiltInDataButton } from "../../components/layout/AppShell"
import {
  STRATEGY_OPTIONS,
  describeBars,
  formatDateLong,
  formatLoss,
  formatPercent,
  formatRatio,
  strategyName,
} from "../../utils/format"
import { cn } from "../../utils/cn"

export const RiskAnalyticsPage: React.FC = () => {
  const { ticker, adjusted, defaultCommissionBps, defaultSlippageBps } = useDataset()
  const t = useChartTheme()
  const [strategy, setStrategy] = useState("momentum")
  const [confidence, setConfidence] = useState<"0.95" | "0.99">("0.95")
  const [cost, setCost] = useState(defaultCommissionBps + defaultSlippageBps)
  const debouncedCost = useDebounced(cost, 400)

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["riskAnalysis", ticker, strategy, confidence, debouncedCost, adjusted],
    queryFn: () =>
      api.analyzeRisk({
        ticker,
        strategy,
        confidence_level: Number(confidence),
        commission_bps: debouncedCost / 2,
        slippage_bps: debouncedCost / 2,
        adjusted,
      }),
    placeholderData: keepPreviousData,
  })

  const rolling = useMemo(() => data?.rolling_risk.filter(r => r.beta !== null) ?? [], [data])

  const header = (
    <PageHeader
      title="Risk Analysis"
      description="How much a strategy could lose on a bad day, how long its losing stretches lasted, and how it behaved in real market sell-offs."
    />
  )

  const controls = (
    <div className="mb-4 flex flex-wrap items-end gap-6 rounded-lg border border-line bg-surface px-4 py-3">
      <Select label="Strategy" value={strategy} onChange={setStrategy} options={STRATEGY_OPTIONS} className="w-64" />
      <div>
        <span className="tm-label">Bad-day threshold</span>
        <SegmentedControl
          ariaLabel="Confidence level"
          value={confidence}
          onChange={setConfidence}
          options={[
            { value: "0.95", label: "1 day in 20", title: "95% confidence" },
            { value: "0.99", label: "1 day in 100", title: "99% confidence" },
          ]}
        />
      </div>
      <SliderField label="Trading cost per trade" value={cost} onChange={setCost} min={0} max={40} format={v => `${v} bps`} className="w-60" />
    </div>
  )

  if (isLoading)
    return (
      <div>
        {header}
        {controls}
        <LoadingState variant="panel" message="Measuring losses, drawdowns and crisis behaviour…" />
      </div>
    )
  if (error || !data)
    return (
      <div>
        {header}
        {controls}
        <ErrorState error={error} onRetry={() => refetch()} secondary={<UseBuiltInDataButton />} />
      </div>
    )

  const is95 = confidence === "0.95"
  const v = is95 ? data.var : data.var_99
  const cv = is95 ? data.cvar : data.cvar_99
  const dd = data.drawdown_analytics
  const cs = data.cost_sensitivity
  const covered = data.stress_presets.filter(p => p.applicable)
  const notCovered = data.stress_presets.filter(p => !p.applicable)
  const currentPoint = cs.curve.reduce((a, b) => (Math.abs(b.cost_bps - cost) < Math.abs(a.cost_bps - cost) ? b : a), cs.curve[0])

  return (
    <div>
      {header}
      {controls}

      <div className={cn("space-y-4 transition-opacity", isFetching && "opacity-60")} aria-busy={isFetching}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard id="var" label="Bad-day loss (VaR)" value={formatLoss(v)} subValue={is95 ? "Worse only 1 day in 20" : "Worse only 1 day in 100"} trend="negative" />
          <MetricCard id="cvar" label="Avg. loss on worst days" value={formatLoss(cv)} subValue="Expected shortfall (CVaR)" trend="negative" />
          <MetricCard id="max_drawdown" label="Largest drop" value={formatPercent(dd.max_drawdown)} subValue={dd.longest_dd_trough ? `Low point ${formatDateLong(dd.longest_dd_trough)}` : undefined} trend="negative" />
          <MetricCard id="longest_dd" label="Longest losing stretch" value={describeBars(dd.longest_drawdown_duration_bars)} subValue={dd.longest_dd_start ? `From ${formatDateLong(dd.longest_dd_start)}` : undefined} />
          <MetricCard
            id="recovery"
            label="Back at its high?"
            value={dd.is_recovered ? "Yes" : "Not yet"}
            trend={dd.is_recovered ? "positive" : "negative"}
            subValue={dd.recovery_status.replace("Under active drawdown", "Currently down")}
          />
          <MetricCard
            id="break_even_cost"
            label="Break-even cost"
            value={cs.break_even_cost_bps !== null ? `${cs.break_even_cost_bps.toFixed(1)} bps` : "Over 50 bps"}
            subValue="Cost where Sharpe falls to 0"
          />
        </div>

        <Alert tone="info">
          On a typical bad day ({is95 ? "1 in 20" : "1 in 100"}), {strategyName(strategy).toLowerCase()} on {ticker} lost{" "}
          <span className="num font-medium text-ink">{formatLoss(v)}</span> or more. On $10,000 that is about{" "}
          <span className="num font-medium text-ink">${v !== null ? Math.round(Math.abs(v) * 10000).toLocaleString() : "—"}</span>. These are
          one-day figures from past data; real losses can be larger.
        </Alert>

        <Panel title="How it behaved in real sell-offs" description="Each window is a real market stress period. Only periods inside the dataset can be tested." flush>
          <div className="overflow-x-auto">
            <table className="tm-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Dates</th>
                  <th className="r">Strategy return</th>
                  <th className="r">Buy and hold</th>
                  <th className="r">Difference</th>
                  <th className="r">Strategy largest drop</th>
                  <th className="r">Buy and hold largest drop</th>
                  <th className="r">Time invested</th>
                </tr>
              </thead>
              <tbody>
                {covered.map(p => {
                  const diff = (p.strategy_total_return ?? 0) - (p.benchmark_total_return ?? 0)
                  return (
                    <tr key={p.name}>
                      <td className="whitespace-normal">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-ink-3">{p.description}</div>
                      </td>
                      <td className="text-ink-2">{formatDateLong(p.start)} to {formatDateLong(p.end)}</td>
                      <td className={cn("r num font-medium", (p.strategy_total_return ?? 0) < 0 ? "text-neg" : "text-pos")}>{formatPercent(p.strategy_total_return)}</td>
                      <td className={cn("r num", (p.benchmark_total_return ?? 0) < 0 ? "text-neg" : "text-pos")}>{formatPercent(p.benchmark_total_return)}</td>
                      <td className="r"><Badge variant={diff >= 0 ? "success" : "error"}>{formatPercent(diff)}</Badge></td>
                      <td className="r num">{formatPercent(p.strategy_max_dd)}</td>
                      <td className="r num">{formatPercent(p.benchmark_max_dd)}</td>
                      <td className="r num">{formatPercent(p.exposure ?? null, false, 0)}</td>
                    </tr>
                  )
                })}
                {covered.length === 0 && (
                  <tr><td colSpan={8} className="py-6 text-center text-ink-3">None of the stress periods fall inside this dataset.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {notCovered.length > 0 && (
            <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">
              Not in this dataset: {notCovered.map(p => `${p.name} (${p.start.slice(0, 4)})`).join(", ")}.
            </p>
          )}
        </Panel>

        <div className="grid gap-4 2xl:grid-cols-2">
          <Panel
            title="How closely it follows the market"
            description="Measured over rolling 3-month windows. A beta of 1 means it moves one-for-one with buy and hold; 0 means it doesn't follow it at all."
          >
            <div className="mb-2 flex gap-4">
              <LegendItem color={t.primary} label="Beta" />
              <LegendItem color={t.secondary} label="Correlation" dashed />
            </div>
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={rolling} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={t.grid} />
                  <XAxis dataKey="date" {...rechartsAxis(t)} minTickGap={60} tickFormatter={shortDateTick} />
                  <YAxis {...rechartsAxis(t)} axisLine={false} domain={[-0.5, 1.5]} ticks={[-0.5, 0, 0.5, 1, 1.5]} />
                  <ReferenceLine y={1} stroke={t.axis} strokeDasharray="4 3" />
                  <ReferenceLine y={0} stroke={t.axis} />
                  <Tooltip {...rechartsTooltip(t)} labelFormatter={formatDateLong} formatter={(val: number, name: string) => [formatRatio(val), name]} />
                  <Line type="monotone" dataKey="beta" name="Beta" stroke={t.primary} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  <Line type="monotone" dataKey="correlation" name="Correlation" stroke={t.secondary} strokeDasharray="4 2" dot={false} strokeWidth={1.25} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel
            title="What higher trading costs would do"
            description={`Sharpe ratio at different costs per trade. The dot marks your current setting (${cost} bps).`}
          >
            <div className="h-[280px]">
              <ResponsiveContainer>
                <LineChart data={cs.curve} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={t.grid} />
                  <XAxis dataKey="cost_bps" type="number" domain={[0, "dataMax"]} {...rechartsAxis(t)} tickFormatter={v => `${v} bps`} />
                  <YAxis {...rechartsAxis(t)} axisLine={false} />
                  <ReferenceLine y={0} stroke={t.neg} strokeDasharray="4 3" label={{ value: "Sharpe 0: no better than cash", position: "insideBottomLeft", fill: t.neg, fontSize: 11 }} />
                  {cs.break_even_cost_bps !== null && <ReferenceLine x={cs.break_even_cost_bps} stroke={t.neg} strokeDasharray="2 3" />}
                  <Tooltip
                    {...rechartsTooltip(t)}
                    labelFormatter={v => `${v} bps per trade`}
                    formatter={(val: number, name: string) => [name === "Yearly growth" ? formatPercent(val) : formatRatio(val), name]}
                  />
                  <Line type="monotone" dataKey="sharpe_ratio" name="Sharpe ratio" stroke={t.primary} strokeWidth={2} dot={false} isAnimationActive={false} />
                  {currentPoint && currentPoint.sharpe_ratio !== null && (
                    <ReferenceDot x={currentPoint.cost_bps} y={currentPoint.sharpe_ratio} r={4} fill={t.primary} stroke={t.bg} strokeWidth={2} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-ink-3">{cs.disclaimer}</p>
          </Panel>
        </div>

        <p className="text-xs text-ink-3">{data.disclaimer}</p>
      </div>
    </div>
  )
}
