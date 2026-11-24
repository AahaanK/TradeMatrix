import React, { useMemo, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { RotateCcw } from "lucide-react"
import { api } from "../../services/api/client"
import { useDataset } from "../../hooks/useDataset"
import { useDebounced } from "../../hooks/useDebounced"
import { RegimeBadge, RegimeSwatch } from "../../components/ui/Badge"
import { ErrorState, LoadingState } from "../../components/ui/EmptyState"
import { Alert, PageHeader, Panel, Stat } from "../../components/ui/Panel"
import { Button } from "../../components/ui/Button"
import { SegmentedControl, SliderField, Switch } from "../../components/ui/Controls"
import { InfoTip } from "../../components/ui/InfoTip"
import { PriceChart } from "../../components/charts/PriceChart"
import { rechartsAxis, rechartsTooltip, useChartTheme } from "../../components/charts/chartTheme"
import { UseBuiltInDataButton } from "../../components/layout/AppShell"
import { downloadCsv } from "../../utils/csv"
import {
  REGIME_ORDER,
  formatDateLong,
  formatInt,
  formatPercent,
  regimeColor,
  regimeMeta,
  regimeName,
} from "../../utils/format"
import { cn } from "../../utils/cn"

const DEFAULTS = { volPercentile: 0.6, minHistory: 252, persistence: 1, requireSma: true, requireMomentum: true }

export const RegimeAnalysisPage: React.FC = () => {
  const { ticker, adjusted } = useDataset()
  const t = useChartTheme()
  const [method, setMethod] = useState<"rules" | "kmeans">("rules")
  const [s, setS] = useState(DEFAULTS)
  const settings = useDebounced(s, 350)
  const isDefault = JSON.stringify(s) === JSON.stringify(DEFAULTS)

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["regimeAnalysis", ticker, adjusted, method, method === "rules" ? settings : null],
    queryFn: () =>
      api.analyzeRegimes({
        ticker,
        interval: "1d",
        adjusted,
        method,
        vol_percentile: settings.volPercentile,
        min_history: settings.minHistory,
        persistence_filter: settings.persistence,
        require_sma: settings.requireSma,
        require_momentum: settings.requireMomentum,
      }),
    placeholderData: keepPreviousData,
  })

  const chartData = useMemo(
    () => data?.timeline.map(p => ({ date: p.date, close: p.close, regime: p.regime })) ?? [],
    [data]
  )

  // Days in each condition per calendar year, for the stacked bar chart
  const byYear = useMemo(() => {
    const m = new Map<string, Record<string, number>>()
    data?.timeline.forEach(p => {
      const y = p.date.slice(0, 4)
      const row = m.get(y) ?? { year: Number(y) }
      row[p.regime] = (row[p.regime] ?? 0) + 1
      m.set(y, row)
    })
    return Array.from(m.values())
  }, [data])

  // Average volatility and 3-month change within each condition
  const profile = useMemo(() => {
    const acc: Record<string, { vol: number; mom: number; n: number }> = {}
    data?.timeline.forEach(p => {
      if (p.rolling_volatility === null || p.medium_momentum === null) return
      const a = (acc[p.regime] ??= { vol: 0, mom: 0, n: 0 })
      a.vol += p.rolling_volatility
      a.mom += p.medium_momentum
      a.n++
    })
    return acc
  }, [data])

  if (isLoading) return <LoadingState message="Sorting every trading day into a market condition…" />
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} secondary={<UseBuiltInDataButton />} />

  const latest = data.latest_regime
  const trans = data.transition_intelligence
  const dist = data.distribution
  const km = data.kmeans_metadata

  return (
    <div>
      <PageHeader
        title="Market Conditions"
        description="Every trading day is sorted into one of four conditions, using only prices known on that day. Strategies often behave very differently in each one."
        actions={
          <SegmentedControl
            ariaLabel="How conditions are decided"
            value={method}
            onChange={setMethod}
            options={[
              { value: "rules", label: "Simple rules", title: "Clear, explainable thresholds" },
              { value: "kmeans", label: "Clustering", title: "K-means groups similar days automatically" },
            ]}
          />
        }
      />

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* Settings */}
        <Panel
          title="How conditions are decided"
          actions={
            method === "rules" && !isDefault ? (
              <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => setS(DEFAULTS)}>
                Reset
              </Button>
            ) : undefined
          }
          className="xl:sticky xl:top-20 xl:self-start"
        >
          {method === "kmeans" ? (
            <div className="space-y-3 text-sm text-ink-2">
              <p>
                Clustering groups days with similar 3-month change, volatility and distance from the 200-day average into four
                groups, then names each group by its average trend and volatility.
              </p>
              <p>The model only learns from the first part of the history and is then frozen, so later labels never use future prices.</p>
              {km && (
                <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3">
                  <Stat label="Days used to learn" value={formatInt(km.training_bars)} />
                  <Stat
                    label={
                      <span className="inline-flex items-center gap-1">
                        Separation score
                        <InfoTip label="Separation score">
                          The silhouette score runs from −1 to 1. Above 0.25 means the four groups are reasonably distinct; near 0 means
                          they overlap a lot.
                        </InfoTip>
                      </span>
                    }
                    value={km.silhouette_score !== null ? km.silhouette_score.toFixed(2) : "—"}
                  />
                </dl>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <SliderField
                label="High volatility starts at"
                value={s.volPercentile}
                onChange={v => setS({ ...s, volPercentile: v })}
                min={0.3}
                max={0.8}
                step={0.05}
                format={v => `${Math.round(v * 100)}th percentile`}
                minLabel="30th"
                maxLabel="80th"
                info="A day counts as 'volatile' when recent swings are bigger than this share of all earlier days. At the 60th percentile, the calmest 60% of history counts as calm."
              />
              <SliderField
                label="Warm-up period"
                value={s.minHistory}
                onChange={v => setS({ ...s, minHistory: v })}
                min={100}
                max={500}
                step={25}
                format={v => `${v} days`}
                info="Days of history needed before the first label is given, so 'normal' volatility can be measured."
              />
              <SliderField
                label="Days needed to confirm a change"
                value={s.persistence}
                onChange={v => setS({ ...s, persistence: v })}
                min={1}
                max={5}
                format={v => (v === 1 ? "1 day (no filter)" : `${v} days`)}
                info="A new condition must last this many days before the label switches. Higher values remove one-day flickers."
              />
              <div className="space-y-3 border-t border-line pt-4">
                <p className="text-sm font-medium text-ink">An uptrend needs</p>
                <Switch checked={s.requireSma} onChange={v => setS({ ...s, requireSma: v })} label="Price above its 200-day average" />
                <Switch checked={s.requireMomentum} onChange={v => setS({ ...s, requireMomentum: v })} label="A gain over the last 3 months" />
              </div>
            </div>
          )}
        </Panel>

        <div className={cn("min-w-0 space-y-4 transition-opacity", isFetching && "opacity-60")} aria-busy={isFetching}>
          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm text-ink-2">Condition on {formatDateLong(latest.as_of_date)}</div>
                <div className="mt-1.5">
                  <RegimeBadge label={latest.label} size="md" />
                </div>
                <p className="mt-2 max-w-md text-sm text-ink-2">{regimeMeta(latest.label).description}</p>
              </div>
              <dl className="grid grid-cols-3 gap-6">
                <Stat label="Volatility, 21 days" value={formatPercent(latest.rolling_volatility, false)} />
                <Stat label="3-month change" value={formatPercent(latest.medium_momentum)} tone={(latest.medium_momentum ?? 0) >= 0 ? "pos" : "neg"} />
                <Stat label="Vs. 200-day average" value={formatPercent(latest.price_to_sma)} tone={(latest.price_to_sma ?? 0) >= 0 ? "pos" : "neg"} />
              </dl>
            </div>
          </Panel>

          <Panel title={`${ticker} price, coloured by condition`}>
            <PriceChart data={chartData} height={360} controls ariaLabel="Price with market condition bands" />
          </Panel>

          <div className="grid gap-4 2xl:grid-cols-2">
            <Panel title="How each condition behaves" flush>
              <div className="overflow-x-auto">
                <table className="tm-table">
                  <thead>
                    <tr>
                      <th>Condition</th>
                      <th className="r">Share of days</th>
                      <th className="r">
                        <span className="inline-flex items-center gap-1">
                          Typical length
                          <InfoTip label="Typical length">Average number of trading days a stretch of this condition lasted.</InfoTip>
                        </span>
                      </th>
                      <th className="r">
                        <span className="inline-flex items-center gap-1">
                          Stays next day
                          <InfoTip label="Stays next day">Chance that tomorrow is in the same condition as today.</InfoTip>
                        </span>
                      </th>
                      <th className="r">Avg. volatility</th>
                      <th className="r">Avg. 3-month change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {REGIME_ORDER.map(r => {
                      const p = profile[r]
                      return (
                        <tr key={r}>
                          <td><RegimeBadge label={r} /></td>
                          <td className="r num">{formatPercent(dist[r]?.percentage ?? 0, false, 1)}</td>
                          <td className="r num">{trans.observed_mean_duration[r] ? `${Math.round(trans.observed_mean_duration[r] as number)} days` : "—"}</td>
                          <td className="r num">{formatPercent(trans.persistence[r] ?? null, false, 1)}</td>
                          <td className="r num">{p ? formatPercent(p.vol / p.n, false, 1) : "—"}</td>
                          <td className={cn("r num", p && p.mom / p.n < 0 ? "text-neg" : "text-pos")}>{p ? formatPercent(p.mom / p.n, true, 1) : "—"}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel
              title="What tends to come next"
              description="If today is in the row's condition, the chance that tomorrow is in each column's condition."
              flush
            >
              <div className="overflow-x-auto">
                <table className="tm-table">
                  <thead>
                    <tr>
                      <th>Today</th>
                      {REGIME_ORDER.map(r => (
                        <th key={r} className="r" title={regimeName(r)}>
                          <span className="inline-flex items-center justify-end gap-1.5"><RegimeSwatch label={r} />{regimeMeta(r).short}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {REGIME_ORDER.map(r1 => (
                      <tr key={r1}>
                        <td className="font-medium">{regimeName(r1)}</td>
                        {REGIME_ORDER.map(r2 => {
                          const p = trans.transition_matrix[r1]?.[r2] ?? 0
                          return (
                            <td
                              key={r2}
                              className={cn("r num", r1 === r2 ? "font-semibold text-ink" : "text-ink-2")}
                              style={{ backgroundColor: `rgb(var(--tm-accent) / ${Math.min(0.35, p * 0.4)})` }}
                            >
                              {(p * 100).toFixed(1)}%
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">
                {formatInt(trans.total_transitions)} changes in total, about {trans.transition_frequency_per_year} per year. Based on
                past data only; not a forecast.
              </p>
            </Panel>
          </div>

          <Panel title="Days in each condition, by year" description="Hover a bar to see the breakdown for that year.">
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={byYear} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={t.grid} />
                  <XAxis dataKey="year" {...rechartsAxis(t)} />
                  <YAxis {...rechartsAxis(t)} axisLine={false} />
                  <Tooltip
                    {...rechartsTooltip(t)}
                    cursor={{ fill: t.grid }}
                    formatter={(v: number, name: string) => [`${v} days`, regimeName(name)]}
                  />
                  {[...REGIME_ORDER, "Undefined" as const].map(r => (
                    <Bar key={r} dataKey={r} stackId="a" fill={regimeColor(r, t.isDark)} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {trans.last_changes.length > 0 && (
            <Panel
              title="Recent changes"
              flush
              actions={
                <Button
                  size="sm"
                  onClick={() =>
                    downloadCsv(
                      `${ticker}_market_conditions`,
                      data.timeline.map(p => ({ ...p, condition: regimeName(p.regime) })),
                      [
                        { key: "date", label: "Date" },
                        { key: "close", label: "Close" },
                        { key: "regime", label: "Label" },
                        { key: "condition", label: "Condition" },
                        { key: "rolling_volatility", label: "Volatility (21d)" },
                        { key: "medium_momentum", label: "3-month change" },
                      ]
                    )
                  }
                >
                  Download all days
                </Button>
              }
            >
              <div className="overflow-x-auto">
                <table className="tm-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Changed from</th>
                      <th className="r">After</th>
                      <th>Changed to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trans.last_changes.map((ch, i) => (
                      <tr key={i}>
                        <td>{formatDateLong(ch.date)}</td>
                        <td><RegimeBadge label={ch.from_regime} /></td>
                        <td className="r num text-ink-2">{ch.previous_duration_bars} {ch.previous_duration_bars === 1 ? "day" : "days"}</td>
                        <td><RegimeBadge label={ch.to_regime} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          <Alert tone="info">
            Labels describe the past. A condition's typical length and the "what comes next" table are averages from history and
            should not be read as predictions.
          </Alert>
        </div>
      </div>
    </div>
  )
}
