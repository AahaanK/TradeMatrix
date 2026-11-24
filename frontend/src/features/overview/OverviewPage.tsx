import React, { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { api } from "../../services/api/client"
import { useDataset } from "../../hooks/useDataset"
import { MetricCard } from "../../components/ui/MetricCard"
import { RegimeBadge, RegimeSwatch } from "../../components/ui/Badge"
import { ErrorState, LoadingState } from "../../components/ui/EmptyState"
import { PageHeader, Panel } from "../../components/ui/Panel"
import { ButtonLink } from "../../components/ui/Button"
import { PriceChart } from "../../components/charts/PriceChart"
import { UseBuiltInDataButton } from "../../components/layout/AppShell"
import {
  REGIME_ORDER,
  describeBars,
  formatDateLong,
  formatInt,
  formatPercent,
  formatPrice,
  regimeMeta,
} from "../../utils/format"

const NEXT_STEPS = [
  {
    to: "/regimes",
    title: "See the market conditions",
    body: "Find out when the market was calm or stressed, and how long each phase usually lasts.",
  },
  {
    to: "/strategy",
    title: "Test a strategy",
    body: "Pick one of four rule sets, set realistic trading costs and run it on the full history.",
  },
  {
    to: "/risk",
    title: "Check the risk",
    body: "Look at bad-day losses, the longest losing stretch, and how the strategy held up in sell-offs.",
  },
  {
    to: "/oos",
    title: "Make sure it holds up",
    body: "Tune settings on older data, then test them on years the strategy has never seen.",
  },
]

export const OverviewPage: React.FC = () => {
  const { ticker, adjusted } = useDataset()

  const market = useQuery({
    queryKey: ["marketData", ticker, "1d", adjusted],
    queryFn: () => api.getMarketData({ ticker, interval: "1d", adjusted }),
  })
  const regimes = useQuery({
    queryKey: ["regimes", ticker, "1d", adjusted],
    queryFn: () => api.analyzeRegimes({ ticker, interval: "1d", adjusted }),
  })

  const chartData = useMemo(
    () => regimes.data?.timeline.map(t => ({ date: t.date, close: t.close, regime: t.regime })) ?? [],
    [regimes.data]
  )

  // Derived facts for the summary cards
  const facts = useMemo(() => {
    const bars = market.data?.bars ?? []
    const tl = regimes.data?.timeline ?? []
    if (bars.length < 2 || tl.length === 0) return null
    const last = bars[bars.length - 1]
    const prev = bars[bars.length - 2]
    const yearAgo = bars[Math.max(0, bars.length - 253)]
    let i = tl.length - 1
    const current = tl[i].regime
    while (i > 0 && tl[i - 1].regime === current) i--
    const vols = tl.map(t => t.rolling_volatility).filter((v): v is number => v !== null).sort((a, b) => a - b)
    const medianVol = vols.length ? vols[Math.floor(vols.length / 2)] : null
    return {
      last,
      dayChange: last.close / prev.close - 1,
      yearChange: last.close / yearAgo.close - 1,
      regimeSince: tl[i].date,
      regimeDays: tl.length - i,
      medianVol,
    }
  }, [market.data, regimes.data])

  if (market.isLoading || regimes.isLoading) return <LoadingState message={`Loading ${ticker} price history and market conditions…`} />
  if (market.error || regimes.error)
    return (
      <ErrorState
        error={market.error ?? regimes.error}
        onRetry={() => {
          market.refetch()
          regimes.refetch()
        }}
        secondary={<UseBuiltInDataButton />}
      />
    )

  const latest = regimes.data!.latest_regime
  const dq = market.data!.data_quality
  const dist = regimes.data!.distribution
  const vol = latest.rolling_volatility

  return (
    <div>
      <PageHeader
        title={`${ticker} overview`}
        description={
          <>
            {formatInt(market.data!.total_bars)} trading days from {formatDateLong(dq.start_date)} to {formatDateLong(dq.end_date)}.
            Start here for a quick read on the price, the current market condition and where to go next.
          </>
        }
        actions={
          <>
            <ButtonLink to="/market">Explore prices</ButtonLink>
            <ButtonLink to="/strategy" variant="primary">
              Test a strategy
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          id="latest_close"
          label="Latest close"
          value={formatPrice(facts?.last.close)}
          subValue={
            <span>
              {formatDateLong(facts?.last.date)},{" "}
              <span className={(facts?.dayChange ?? 0) >= 0 ? "text-pos" : "text-neg"}>{formatPercent(facts?.dayChange)}</span> on the day
            </span>
          }
        />
        <MetricCard
          id="year_change"
          label="Change over the last year"
          value={formatPercent(facts?.yearChange)}
          trend={(facts?.yearChange ?? 0) >= 0 ? "positive" : "negative"}
          subValue="Last 252 trading days"
        />
        <MetricCard
          id="annualized_volatility"
          label="Current volatility"
          value={formatPercent(vol, false)}
          subValue={
            facts?.medianVol
              ? vol !== null && vol > facts.medianVol
                ? `Above the usual ${formatPercent(facts.medianVol, false, 1)}`
                : `Below the usual ${formatPercent(facts.medianVol, false, 1)}`
              : "Last 21 trading days, yearly rate"
          }
        />
        <MetricCard
          id="data_quality"
          label="Data checks"
          value={dq.is_valid ? "Passed" : "Needs attention"}
          trend={dq.is_valid ? "positive" : "negative"}
          subValue={dq.issues.length === 0 ? "No problems found" : `${dq.issues.length} note${dq.issues.length > 1 ? "s" : ""} to review`}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Panel
          title="Price history by market condition"
          description="The background colour shows which of four market conditions the price was in on each day."
        >
          <PriceChart data={chartData} height={340} controls ariaLabel={`${ticker} closing price with market conditions`} />
        </Panel>

        <div className="space-y-4">
          <Panel title="Market condition today">
            <RegimeBadge label={latest.label} size="md" />
            <p className="mt-2 text-sm text-ink-2">{regimeMeta(latest.label).description}</p>
            {facts && (
              <p className="mt-3 text-sm text-ink-2">
                In this condition since <span className="font-medium text-ink">{formatDateLong(facts.regimeSince)}</span>, about{" "}
                {describeBars(facts.regimeDays)}.
              </p>
            )}
            <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
              <div>
                <dt className="text-xs text-ink-3">3-month change</dt>
                <dd className={`num font-medium ${(latest.medium_momentum ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>
                  {formatPercent(latest.medium_momentum)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Vs. 200-day average</dt>
                <dd className={`num font-medium ${(latest.price_to_sma ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>
                  {formatPercent(latest.price_to_sma)}
                </dd>
              </div>
            </dl>
            <Link to="/regimes" className="mt-3 inline-block text-sm font-medium no-underline hover:underline">
              How conditions are decided
            </Link>
          </Panel>

          <Panel title="Time spent in each condition">
            <ul className="space-y-2.5">
              {REGIME_ORDER.map(r => {
                const pct = dist[r]?.percentage ?? 0
                return (
                  <li key={r}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-ink">
                        <RegimeSwatch label={r} />
                        {regimeMeta(r).name}
                      </span>
                      <span className="num text-ink-2">{(pct * 100).toFixed(0)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-subtle">
                      <div className="h-full rounded-full bg-ink-3/60" style={{ width: `${pct * 100}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </Panel>
        </div>
      </div>

      <section className="mt-8" aria-labelledby="next-steps">
        <h2 id="next-steps" className="text-md font-semibold">
          A good order to work in
        </h2>
        <ol className="mt-3 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
          {NEXT_STEPS.map((s, i) => (
            <li key={s.to} className="bg-surface">
              <Link
                to={s.to}
                className="group flex h-full gap-3 p-4 text-ink no-underline transition-colors hover:bg-subtle/60 focus-visible:bg-subtle/60"
              >
                <span className="num flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-xs font-medium text-ink-2">
                  {i + 1}
                </span>
                <span>
                  <span className="block text-sm font-medium group-hover:text-brand">{s.title}</span>
                  <span className="mt-0.5 block text-sm text-ink-2">{s.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
