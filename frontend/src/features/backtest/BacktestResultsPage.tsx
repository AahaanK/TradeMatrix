import React, { useMemo, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, Bookmark, Download, Pencil } from "lucide-react"
import { api } from "../../services/api/client"
import { useDataset } from "../../hooks/useDataset"
import { MetricCard } from "../../components/ui/MetricCard"
import { Badge, RegimeBadge } from "../../components/ui/Badge"
import { EquityChart, buyAndHoldFromCurve } from "../../components/charts/EquityChart"
import { DrawdownChart } from "../../components/charts/DrawdownChart"
import { PriceChart } from "../../components/charts/PriceChart"
import { ErrorState, LoadingState } from "../../components/ui/EmptyState"
import { Alert, PageHeader, Panel } from "../../components/ui/Panel"
import { Button, ButtonLink } from "../../components/ui/Button"
import { SegmentedControl } from "../../components/ui/Controls"
import { InfoTip } from "../../components/ui/InfoTip"
import { UseBuiltInDataButton } from "../../components/layout/AppShell"
import { BacktestResult, Trade } from "../../types"
import { downloadCsv } from "../../utils/csv"
import { loadLastBacktest } from "../../utils/lastBacktest"
import {
  REGIME_ORDER,
  describeParams,
  formatDateLong,
  formatInt,
  formatPercent,
  formatPrice,
  formatRatio,
  regimeName,
  strategyName,
} from "../../utils/format"
import { cn } from "../../utils/cn"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const DEFAULT_PARAMS = { lookback: 63, threshold: 0.0 }

type TradeSort = "entry" | "return" | "held"

export const BacktestResultsPage: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { ticker, adjusted } = useDataset()
  const [savedId, setSavedId] = useState<string | null>(null)
  const [tradeFilter, setTradeFilter] = useState<"all" | "wins" | "losses">("all")
  const [sort, setSort] = useState<{ key: TradeSort; desc: boolean }>({ key: "entry", desc: true })

  const navState = location.state as { backtestResult?: BacktestResult; strategyParams?: Record<string, unknown>; strategy?: string } | null
  const stored = useMemo(() => (navState?.backtestResult ? null : loadLastBacktest()), [navState])
  const userResult = navState?.backtestResult ?? (stored && stored.result.ticker === ticker ? stored.result : undefined)
  const strategyParams = navState?.strategyParams ?? (userResult ? stored?.params : undefined) ?? DEFAULT_PARAMS

  const example = useQuery({
    queryKey: ["backtestDefault", ticker, adjusted],
    queryFn: () => api.runBacktest({ ticker, strategy: "momentum", params: DEFAULT_PARAMS, adjusted }),
    enabled: !userResult,
  })

  const result = userResult ?? example.data
  const isExample = !userResult

  const save = useMutation({
    mutationFn: () => {
      if (!result) throw new Error("There is no result to save yet.")
      return api.createExperiment({
        name: `${result.ticker} ${strategyName(result.strategy)}`,
        ticker: result.ticker,
        strategy: result.strategy,
        interval: "1d",
        adjusted,
        source: result.source || "bundled",
        dataset_fingerprint: result.dataset_fingerprint,
        params: strategyParams,
        metrics: result.metrics,
        regime_metrics: result.regime_metrics,
        equity_curve: result.equity_curve,
        trades: result.trades,
        costs: result.cost_assumptions,
        initial_capital: result.equity_curve[0]?.net_equity,
      })
    },
    onSuccess: exp => {
      setSavedId(exp.id)
      queryClient.invalidateQueries({ queryKey: ["experiments"] })
    },
  })

  const curve = useMemo(() => result?.equity_curve ?? [], [result])
  const benchmark = useMemo(() => buyAndHoldFromCurve(curve), [curve])
  const priceData = useMemo(() => curve.map(c => ({ date: c.date, close: c.close, regime: c.regime })), [curve])

  // Monthly and yearly returns, compounded from daily net returns
  const calendar = useMemo(() => {
    const months: Record<number, Record<number, number>> = {}
    const years: Record<number, number> = {}
    curve.forEach(bar => {
      const y = Number(bar.date.slice(0, 4))
      const m = Number(bar.date.slice(5, 7))
      months[y] ??= {}
      months[y][m] = (1 + (months[y][m] ?? 0)) * (1 + bar.net_return) - 1
      years[y] = (1 + (years[y] ?? 0)) * (1 + bar.net_return) - 1
    })
    const maxAbs = Math.max(0.02, ...Object.values(months).flatMap(r => Object.values(r).map(Math.abs)))
    return { months, years, list: Object.keys(months).map(Number).sort((a, b) => b - a), maxAbs }
  }, [curve])

  const closedTrades = useMemo(() => (result?.trades ?? []).filter(t => !t.is_open), [result])
  const openTrade = result?.trades.find(t => t.is_open)
  const shownTrades = useMemo(() => {
    const list = closedTrades.filter(t => (tradeFilter === "wins" ? t.net_return > 0 : tradeFilter === "losses" ? t.net_return <= 0 : true))
    const val = (t: Trade) => (sort.key === "return" ? t.net_return : sort.key === "held" ? t.bars_held : t.entry_date)
    return [...list].sort((a, b) => {
      const va = val(a)
      const vb = val(b)
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sort.desc ? -cmp : cmp
    })
  }, [closedTrades, tradeFilter, sort])

  if (!result && example.isLoading) return <LoadingState message="Running an example backtest…" />
  if (!result) return <ErrorState error={example.error} onRetry={() => example.refetch()} secondary={<UseBuiltInDataButton />} />

  const m = result.metrics
  const gross = result.gross_metrics
  const bm = result.benchmark_metrics
  const start = curve[0]?.net_equity ?? 100000
  const end = curve[curve.length - 1]?.net_equity ?? start
  const bmEnd = benchmark[benchmark.length - 1]?.value ?? start
  const beatBenchmark = (m.sharpe_ratio ?? 0) > (bm.sharpe_ratio ?? 0)

  const sortHeader = (key: TradeSort, label: string, align = "r") => (
    <th className={align} aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        onClick={() => setSort(s => ({ key, desc: s.key === key ? !s.desc : true }))}
        className="inline-flex items-center gap-1 font-medium hover:text-ink"
      >
        {label}
        {sort.key === key && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </th>
  )

  const exportTrades = () =>
    downloadCsv(`${result.ticker}_${result.strategy}_trades`, closedTrades.map(t => ({ ...t, condition: regimeName(t.entry_regime) })), [
      { key: "id", label: "Trade" },
      { key: "direction", label: "Direction" },
      { key: "entry_date", label: "Entry date" },
      { key: "entry_price", label: "Entry price" },
      { key: "exit_date", label: "Exit date" },
      { key: "exit_price", label: "Exit price" },
      { key: "bars_held", label: "Days held" },
      { key: "gross_return", label: "Return before costs" },
      { key: "net_return", label: "Return after costs" },
      { key: "condition", label: "Condition at entry" },
    ])

  const exportDaily = () =>
    downloadCsv(`${result.ticker}_${result.strategy}_daily`, curve as unknown as Record<string, unknown>[])

  return (
    <div>
      <PageHeader
        title={`${strategyName(result.strategy)} on ${result.ticker}`}
        description={
          <>
            {describeParams(strategyParams)}. Costs of {result.cost_assumptions.total_bps} bps per trade are included.
          </>
        }
        actions={
          <>
            <Button icon={<Pencil />} onClick={() => navigate("/strategy")}>
              Change settings
            </Button>
            <Button icon={<Download />} onClick={exportDaily}>
              Daily results
            </Button>
            {savedId ? (
              <ButtonLink to="/experiments" variant="secondary" icon={<Bookmark />}>
                Saved. View history
              </ButtonLink>
            ) : (
              <Button variant="primary" icon={<Bookmark />} loading={save.isPending} onClick={() => save.mutate()}>
                Save to history
              </Button>
            )}
          </>
        }
      />

      {isExample && (
        <Alert tone="info" className="mb-4" title="You're looking at an example" action={<ButtonLink to="/strategy" size="sm" variant="primary">Set up your own</ButtonLink>}>
          This is the default 3-month momentum strategy. Run your own test in Strategy Testing and the results will appear here.
        </Alert>
      )}
      {save.error && (
        <Alert tone="error" className="mb-4" title="Couldn't save this result">
          {(save.error as Error).message}
        </Alert>
      )}

      {/* Plain-language summary */}
      <Panel className="mb-4">
        <p className="text-base text-ink">
          After costs, the strategy turned <span className="num font-semibold">{formatPrice(start)}</span> into{" "}
          <span className={cn("num font-semibold", end >= start ? "text-pos" : "text-neg")}>{formatPrice(end)}</span> between{" "}
          {formatDateLong(curve[0]?.date)} and {formatDateLong(curve[curve.length - 1]?.date)}. Simply buying and holding would have
          ended at <span className="num font-semibold">{formatPrice(bmEnd)}</span>. Its worst fall from a peak was{" "}
          <span className="num font-semibold text-neg">{formatPercent(m.max_drawdown)}</span>, compared with{" "}
          <span className="num font-semibold">{formatPercent(bm.max_drawdown)}</span> for buy and hold.
        </p>
        <p className="mt-2 text-sm text-ink-2">
          {beatBenchmark
            ? "It earned more return for the risk it took than buy and hold (higher Sharpe ratio)."
            : "It earned less return for the risk it took than buy and hold (lower Sharpe ratio)."}{" "}
          Costs reduced the total return from {formatPercent(gross.total_return)} to {formatPercent(m.total_return)}.
        </p>
      </Panel>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard id="total_return" label="Total return" value={formatPercent(m.total_return)} subValue={`Buy and hold ${formatPercent(bm.total_return)}`} trend={(m.total_return ?? 0) >= 0 ? "positive" : "negative"} />
        <MetricCard id="cagr" label="Yearly growth" value={formatPercent(m.cagr)} subValue={`Buy and hold ${formatPercent(bm.cagr)}`} trend={(m.cagr ?? 0) >= 0 ? "positive" : "negative"} />
        <MetricCard id="sharpe_ratio" label="Sharpe ratio" value={formatRatio(m.sharpe_ratio)} subValue={`Buy and hold ${formatRatio(bm.sharpe_ratio)}`} highlight />
        <MetricCard id="max_drawdown" label="Largest drop" value={formatPercent(m.max_drawdown)} subValue={`Buy and hold ${formatPercent(bm.max_drawdown)}`} trend="negative" />
        <MetricCard id="sortino_ratio" label="Sortino ratio" value={formatRatio(m.sortino_ratio)} subValue={`Buy and hold ${formatRatio(bm.sortino_ratio)}`} />
        <MetricCard id="calmar_ratio" label="Calmar ratio" value={formatRatio(m.calmar_ratio)} subValue={`Buy and hold ${formatRatio(bm.calmar_ratio)}`} />
        <MetricCard id="annualized_volatility" label="Volatility" value={formatPercent(m.annualized_volatility, false)} subValue={`Buy and hold ${formatPercent(bm.annualized_volatility, false)}`} />
        <MetricCard id="win_rate" label="Win rate" value={formatPercent(m.win_rate, false)} subValue={`${formatInt(closedTrades.length)} closed trades`} />
        <MetricCard id="profit_factor" label="Profit factor" value={formatRatio(m.profit_factor)} subValue="Gains ÷ losses" />
        <MetricCard id="exposure" label="Time invested" value={formatPercent(m.exposure, false)} subValue="Share of days holding" />
        <MetricCard id="annualized_turnover" label="Yearly turnover" value={formatRatio(m.annualized_turnover)} subValue="Full position changes a year" />
        <MetricCard id="total_cost" label="Costs paid" value={formatPrice(result.cost_assumptions.total_cost_paid)} subValue={`${result.cost_assumptions.commission_bps} + ${result.cost_assumptions.slippage_bps} bps per trade`} />
      </div>

      {m.notes.length > 0 && (
        <Alert tone="warning" className="mt-4" title="Read these results with care">
          <ul className="list-disc pl-4">
            {m.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </Alert>
      )}

      <Panel className="mt-4" title="Account value" description="Strategy after costs, compared with buying and holding the same asset with no costs.">
        <EquityChart data={curve} benchmarkData={benchmark} benchmarkLabel="Buy and hold" height={360} />
      </Panel>

      <Panel className="mt-4" title="Drops from the previous high" description="How far below its best value so far the account was on each day.">
        <DrawdownChart data={curve} height={170} />
      </Panel>

      <Panel className="mt-4" title="When it traded" description="Buys and exits on the price chart. Background colour shows the market condition.">
        <PriceChart data={priceData} trades={result.trades} height={320} controls ariaLabel="Price with trade markers" />
      </Panel>

      {/* Performance by market condition */}
      <Panel className="mt-4" title="Performance in each market condition" flush
        actions={<Link to="/comparison" className="text-sm font-medium no-underline hover:underline">Compare all strategies</Link>}
      >
        <div className="overflow-x-auto">
          <table className="tm-table">
            <thead>
              <tr>
                <th>Condition</th>
                <th className="r">Days</th>
                <th className="r">Yearly return</th>
                <th className="r">Volatility</th>
                <th className="r">Sharpe</th>
                <th className="r">
                  <span className="inline-flex items-center gap-1">Hit rate<InfoTip label="Hit rate">Share of days in this condition when the strategy made money.</InfoTip></span>
                </th>
                <th className="r">Time invested</th>
                <th className="r">Trades started</th>
              </tr>
            </thead>
            <tbody>
              {REGIME_ORDER.map(r => {
                const row = result.regime_metrics[r]
                if (!row) return null
                return (
                  <tr key={r} className={cn(row.low_sample_warning && "text-ink-3")}>
                    <td>
                      <span className="inline-flex items-center gap-2">
                        <RegimeBadge label={r} />
                        {row.low_sample_warning && <Badge variant="warning" title="Fewer than 60 days: treat with caution">Few days</Badge>}
                      </span>
                    </td>
                    <td className="r num">{formatInt(row.observations)}</td>
                    <td className={cn("r num", (row.annualized_return ?? 0) >= 0 ? "text-pos" : "text-neg")}>{formatPercent(row.annualized_return)}</td>
                    <td className="r num">{formatPercent(row.annualized_volatility, false)}</td>
                    <td className="r num font-medium">{formatRatio(row.sharpe_ratio)}</td>
                    <td className="r num">{formatPercent(row.hit_rate, false, 1)}</td>
                    <td className="r num">{formatPercent(row.exposure, false, 0)}</td>
                    <td className="r num">{formatInt(row.trades_entered)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Calendar of returns */}
      <Panel className="mt-4" title="Monthly returns after costs" flush>
        <div className="overflow-x-auto">
          <table className="tm-table text-xs">
            <thead>
              <tr>
                <th>Year</th>
                {MONTHS.map(mo => <th key={mo} className="r">{mo}</th>)}
                <th className="r">Year</th>
              </tr>
            </thead>
            <tbody>
              {calendar.list.map(y => (
                <tr key={y}>
                  <td className="font-medium">{y}</td>
                  {MONTHS.map((_, i) => {
                    const ret = calendar.months[y]?.[i + 1]
                    if (ret === undefined) return <td key={i} className="r text-ink-3">—</td>
                    const a = Math.min(1, Math.abs(ret) / calendar.maxAbs) * 0.32
                    return (
                      <td
                        key={i}
                        className="r num"
                        style={{ backgroundColor: ret >= 0 ? `rgb(var(--tm-accent) / ${a})` : `rgb(var(--tm-neg) / ${a})` }}
                        title={`${MONTHS[i]} ${y}: ${formatPercent(ret)}`}
                      >
                        {(ret * 100).toFixed(1).replace("-", "−")}
                      </td>
                    )
                  })}
                  <td className={cn("r num font-semibold", calendar.years[y] >= 0 ? "text-pos" : "text-neg")}>
                    {(calendar.years[y] * 100).toFixed(1).replace("-", "−")}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-2 text-xs text-ink-3">Values are percentages. Darker shading means a bigger move.</p>
      </Panel>

      {/* Trades */}
      <Panel
        className="mt-4"
        title={`Trades (${formatInt(closedTrades.length)} closed)`}
        description={openTrade ? `One position is still open from ${formatDateLong(openTrade.entry_date)}.` : undefined}
        flush
        actions={
          <>
            <SegmentedControl size="sm" ariaLabel="Filter trades" value={tradeFilter} onChange={setTradeFilter}
              options={[{ value: "all", label: "All" }, { value: "wins", label: "Winners" }, { value: "losses", label: "Losers" }]} />
            <Button size="sm" icon={<Download />} onClick={exportTrades} disabled={closedTrades.length === 0}>CSV</Button>
          </>
        }
      >
        {closedTrades.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-3">No trades were completed with these settings. Try a shorter look-back or a lower threshold.</p>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="tm-table tm-table-sticky">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Side</th>
                  {sortHeader("entry", "Bought", "")}
                  <th className="r">Price</th>
                  <th>Sold</th>
                  <th className="r">Price</th>
                  {sortHeader("held", "Days held")}
                  {sortHeader("return", "Return after costs")}
                  <th>Condition at entry</th>
                </tr>
              </thead>
              <tbody>
                {shownTrades.map(tr => (
                  <tr key={tr.id}>
                    <td className="num text-ink-3">{tr.id}</td>
                    <td>{tr.direction === "long" ? "Buy" : "Short"}</td>
                    <td>{tr.entry_date}</td>
                    <td className="r num">{formatPrice(tr.entry_price)}</td>
                    <td>{tr.exit_date}</td>
                    <td className="r num">{formatPrice(tr.exit_price)}</td>
                    <td className="r num">{tr.bars_held}</td>
                    <td className={cn("r num font-medium", tr.net_return >= 0 ? "text-pos" : "text-neg")}>{formatPercent(tr.net_return)}</td>
                    <td><RegimeBadge label={tr.entry_regime} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="mt-4 text-xs text-ink-3">
        Dataset ID <span className="font-mono">{result.dataset_fingerprint.slice(0, 16)}</span>. Saving to history stores this ID so you can
        check later that the same data was used.
      </p>
    </div>
  )
}
