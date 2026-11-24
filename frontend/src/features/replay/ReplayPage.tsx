import React, { useEffect, useMemo, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Pause, Play } from "lucide-react"
import { useDataset } from "../../hooks/useDataset"
import { useDebounced } from "../../hooks/useDebounced"
import { api } from "../../services/api/client"
import { MetricCard } from "../../components/ui/MetricCard"
import { RegimeBadge } from "../../components/ui/Badge"
import { ErrorState, LoadingState } from "../../components/ui/EmptyState"
import { PageHeader, Panel, Stat } from "../../components/ui/Panel"
import { Button, IconButton } from "../../components/ui/Button"
import { Select } from "../../components/ui/Select"
import { SegmentedControl } from "../../components/ui/Controls"
import { rechartsAxis, rechartsTooltip, shortDateTick, useChartTheme } from "../../components/charts/chartTheme"
import { UseBuiltInDataButton } from "../../components/layout/AppShell"
import {
  STRATEGY_OPTIONS,
  formatDateLong,
  formatPercent,
  formatPrice,
  formatRatio,
  regimeName,
} from "../../utils/format"
import { cn } from "../../utils/cn"

const START_CAPITAL = 100_000

export const ReplayPage: React.FC = () => {
  const { ticker, adjusted } = useDataset()
  const t = useChartTheme()
  const [strategy, setStrategy] = useState("momentum")
  const [index, setIndex] = useState(300)
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState<1 | 5 | 21>(5)

  const market = useQuery({
    queryKey: ["marketData", ticker, "1d", adjusted],
    queryFn: () => api.getMarketData({ ticker, interval: "1d", adjusted }),
  })
  const dates = useMemo(() => market.data?.bars.map(b => b.date) ?? [], [market.data])
  const maxIndex = Math.max(0, dates.length - 1)
  const safeIndex = Math.min(index, maxIndex)
  const currentDate = dates[safeIndex]
  // While dragging the slider, wait for it to settle; while playing, request every step.
  const settledDate = useDebounced(currentDate, playing ? 0 : 180)

  const replay = useQuery({
    queryKey: ["replay", ticker, adjusted, strategy, settledDate],
    queryFn: () => api.replayBacktest({ ticker, adjusted, strategy, target_date: settledDate!, initial_capital: START_CAPITAL }),
    enabled: !!settledDate,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  })

  // Advance only after the previous step has loaded, so playback never queues requests.
  useEffect(() => {
    if (!playing || replay.isFetching) return
    if (safeIndex >= maxIndex) {
      setPlaying(false)
      return
    }
    const id = setTimeout(() => setIndex(i => Math.min(maxIndex, i + step)), 220)
    return () => clearTimeout(id)
  }, [playing, replay.isFetching, safeIndex, maxIndex, step, replay.data])

  // Keyboard: left/right arrows step through time when focus isn't in a field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag) || (e.target as HTMLElement)?.getAttribute("role")) return
      if (e.key === "ArrowRight") setIndex(i => Math.min(maxIndex, i + (e.shiftKey ? 21 : 1)))
      if (e.key === "ArrowLeft") setIndex(i => Math.max(0, i - (e.shiftKey ? 21 : 1)))
      if (e.key === " ") {
        e.preventDefault()
        setPlaying(p => !p)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [maxIndex])

  // Full date axis with values only up to "today", so the future is visibly empty
  const chartData = useMemo(() => {
    const known = new Map(replay.data?.historical_equity_slice.map(p => [p.date, p.net_equity]) ?? [])
    const step = Math.max(1, Math.floor(dates.length / 600))
    return dates.filter((_, i) => i % step === 0 || i === safeIndex).map(d => ({ date: d, equity: known.get(d) ?? null }))
  }, [replay.data, dates, safeIndex])

  if (market.isLoading) return <LoadingState message="Loading the timeline…" />
  if (market.error) return <ErrorState error={market.error} onRetry={() => market.refetch()} secondary={<UseBuiltInDataButton />} />

  const s = replay.data
  const m = s?.metrics_to_date
  const move = (delta: number) => {
    setPlaying(false)
    setIndex(i => Math.max(0, Math.min(maxIndex, i + delta)))
  }

  return (
    <div>
      <PageHeader
        title="Time Replay"
        description="Step through history one day at a time and see exactly what the strategy knew and held on that date. Everything after the chosen day is hidden from the calculation."
        actions={<Select ariaLabel="Strategy" value={strategy} onChange={setStrategy} options={STRATEGY_OPTIONS} className="w-60" />}
      />

      <Panel className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <IconButton label="Back one month" onClick={() => move(-21)}><ChevronsLeft /></IconButton>
            <IconButton label="Back one day" onClick={() => move(-1)}><ChevronLeft /></IconButton>
            <Button
              variant="primary"
              className="mx-1 w-24"
              icon={playing ? <Pause /> : <Play />}
              onClick={() => {
                if (safeIndex >= maxIndex) setIndex(0)
                setPlaying(p => !p)
              }}
            >
              {playing ? "Pause" : "Play"}
            </Button>
            <IconButton label="Forward one day" onClick={() => move(1)}><ChevronRight /></IconButton>
            <IconButton label="Forward one month" onClick={() => move(21)}><ChevronsRight /></IconButton>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-ink-2">
              Speed
              <SegmentedControl<1 | 5 | 21>
                size="sm"
                ariaLabel="Playback step"
                value={step}
                onChange={setStep}
                options={[
                  { value: 1, label: "Day" },
                  { value: 5, label: "Week" },
                  { value: 21, label: "Month" },
                ]}
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="jump" className="text-sm text-ink-2">Date</label>
              <input
                id="jump"
                type="date"
                className="tm-input h-8 w-40"
                min={dates[0]}
                max={dates[maxIndex]}
                value={currentDate ?? ""}
                onChange={e => {
                  const target = e.target.value
                  const i = dates.findIndex(d => d >= target)
                  if (i >= 0) {
                    setPlaying(false)
                    setIndex(i)
                  }
                }}
              />
            </div>
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={maxIndex}
          value={safeIndex}
          aria-label="Replay date"
          aria-valuetext={formatDateLong(currentDate)}
          onChange={e => {
            setPlaying(false)
            setIndex(Number(e.target.value))
          }}
          className="tm-range mt-4"
          style={{ ["--fill" as string]: `${(safeIndex / Math.max(1, maxIndex)) * 100}%` }}
        />
        <div className="mt-1 flex justify-between text-xs text-ink-3">
          <span>{formatDateLong(dates[0])}</span>
          <span className="font-medium text-ink">
            {formatDateLong(currentDate)}, day {safeIndex + 1} of {dates.length}
          </span>
          <span>{formatDateLong(dates[maxIndex])}</span>
        </div>
        <p className="mt-2 text-xs text-ink-3">Tip: use the left and right arrow keys to step one day (hold Shift for a month), and Space to play or pause.</p>
      </Panel>

      {replay.error && <ErrorState error={replay.error} onRetry={() => replay.refetch()} />}

      {!s && replay.isLoading && <LoadingState variant="panel" message="Rebuilding the account up to this date…" />}

      {s && m && (
        <div className={cn("space-y-4 transition-opacity", replay.isFetching && !playing && "opacity-70")}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <MetricCard id="equity" label="Account value" value={formatPrice(s.equity)} subValue={`Started with ${formatPrice(START_CAPITAL)}`} trend={s.equity >= START_CAPITAL ? "positive" : "negative"} />
            <MetricCard id="total_return" label="Return so far" value={formatPercent(s.cumulative_net_return)} subValue="After costs" trend={s.cumulative_net_return >= 0 ? "positive" : "negative"} />
            <MetricCard
              id="position"
              label="Holding at the close"
              value={s.position_held > 0 ? "Invested" : s.position_held < 0 ? "Short" : "Cash"}
              subValue={s.position_held !== 0 ? `${Math.abs(s.position_held * 100).toFixed(0)}% of the account` : "No position"}
            />
            <MetricCard id="max_drawdown" label="Below its high" value={formatPercent(s.drawdown)} subValue={`High so far ${formatPrice(s.running_peak)}`} trend={s.drawdown < -0.05 ? "negative" : "neutral"} />
            <MetricCard id="sharpe_ratio" label="Sharpe ratio so far" value={formatRatio(m.sharpe_ratio)} subValue={`Yearly growth ${formatPercent(m.cagr)}`} />
            <MetricCard id="trades" label="Trades so far" value={s.total_trades_to_date} subValue={`Win rate ${formatPercent(m.win_rate, false, 0)}`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Panel title={`Account value up to ${formatDateLong(s.as_of_date)}`} description="The right-hand side stays empty: the strategy cannot see the future.">
              <div className="h-72">
                <ResponsiveContainer>
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="replayFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={t.primary} stopOpacity={0.18} />
                        <stop offset="100%" stopColor={t.primary} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={t.grid} />
                    <XAxis dataKey="date" {...rechartsAxis(t)} minTickGap={70} tickFormatter={shortDateTick} />
                    <YAxis {...rechartsAxis(t)} axisLine={false} domain={["auto", "auto"]} tickFormatter={v => `$${Math.round(v / 1000)}k`} width={48} />
                    <ReferenceLine x={currentDate} stroke={t.crosshair} strokeDasharray="3 3" />
                    <ReferenceLine y={START_CAPITAL} stroke={t.axis} strokeDasharray="2 3" />
                    <Tooltip {...rechartsTooltip(t)} labelFormatter={formatDateLong} formatter={(v: number) => [formatPrice(v), "Account value"]} />
                    <Area type="monotone" dataKey="equity" stroke={t.primary} strokeWidth={1.75} fill="url(#replayFill)" connectNulls={false} dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <div className="space-y-4">
              <Panel title="What it knew that day">
                <dl className="space-y-3">
                  <Stat label="Closing price" value={formatPrice(s.close_price)} />
                  <div>
                    <dt className="text-xs text-ink-3">Market condition</dt>
                    <dd className="mt-1"><RegimeBadge label={s.regime_known} /></dd>
                  </div>
                </dl>
              </Panel>
              <Panel title="Most recent trade">
                {s.latest_trade ? (
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <Stat label="Bought" value={formatPrice(s.latest_trade.entry_price)} sub={formatDateLong(s.latest_trade.entry_date)} />
                    <Stat
                      label={s.latest_trade.is_open ? "Still open" : "Sold"}
                      value={s.latest_trade.is_open ? "—" : formatPrice(s.latest_trade.exit_price)}
                      sub={s.latest_trade.is_open ? undefined : formatDateLong(s.latest_trade.exit_date)}
                    />
                    <Stat label="Return after costs" value={formatPercent(s.latest_trade.net_return)} tone={s.latest_trade.net_return >= 0 ? "pos" : "neg"} />
                    <Stat label="Days held" value={s.latest_trade.bars_held} sub={`Entered in ${regimeName(s.latest_trade.entry_regime).toLowerCase()}`} />
                  </dl>
                ) : (
                  <p className="text-sm text-ink-3">No trades yet at this date.</p>
                )}
              </Panel>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
