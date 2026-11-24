import React, { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { Play, RotateCcw } from "lucide-react"
import { api } from "../../services/api/client"
import { useDataset } from "../../hooks/useDataset"
import { Alert, PageHeader, Panel } from "../../components/ui/Panel"
import { Button } from "../../components/ui/Button"
import { Checkbox, Field, SegmentedControl, SliderField, Switch } from "../../components/ui/Controls"
import { Select } from "../../components/ui/Select"
import { RegimeSwatch } from "../../components/ui/Badge"
import { REGIME_ORDER, STRATEGY_META, type StrategyId, formatPrice, regimeMeta, regimeName } from "../../utils/format"
import { saveLastBacktest } from "../../utils/lastBacktest"
import { cn } from "../../utils/cn"

type Preset = { id: string; label: string; apply: () => void }

export const StrategyLabPage: React.FC = () => {
  const { ticker, adjusted, annualRf: defaultRf, defaultCommissionBps, defaultSlippageBps } = useDataset()
  const navigate = useNavigate()

  const [strategy, setStrategy] = useState<StrategyId>("momentum")
  const [commissionBps, setCommissionBps] = useState(defaultCommissionBps)
  const [slippageBps, setSlippageBps] = useState(defaultSlippageBps)
  const [initialCapital, setInitialCapital] = useState("100000")
  const [rfPercent, setRfPercent] = useState(String(+(defaultRf * 100).toFixed(2)))

  // Momentum
  const [momLookback, setMomLookback] = useState(63)
  const [momThreshold, setMomThreshold] = useState(0.0)
  const [momRebalance, setMomRebalance] = useState<"daily" | "weekly" | "monthly">("daily")
  const [momTrendOn, setMomTrendOn] = useState(true)
  const [momTrendFilter, setMomTrendFilter] = useState("200")
  const [momMode, setMomMode] = useState<"long_flat" | "long_short">("long_flat")

  // Mean reversion
  const [mrLookback, setMrLookback] = useState(20)
  const [mrEntryZ, setMrEntryZ] = useState(-2.0)
  const [mrExitZ, setMrExitZ] = useState(-0.5)
  const [mrMaxHold, setMrMaxHold] = useState(21)
  const [mrVolCap, setMrVolCap] = useState("")

  // Moving-average crossover
  const [maFast, setMaFast] = useState(20)
  const [maSlow, setMaSlow] = useState(50)
  const [maVolFilter, setMaVolFilter] = useState("")

  const [allowedRegimes, setAllowedRegimes] = useState<string[]>([])

  const toggleRegime = (r: string) =>
    setAllowedRegimes(prev => (prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]))

  /* ---------------- validation ---------------- */
  const capital = Number(initialCapital)
  const rf = Number(rfPercent) / 100
  const trendSma = Number(momTrendFilter)
  const mrCap = mrVolCap === "" ? null : Number(mrVolCap) / 100
  const maCap = maVolFilter === "" ? null : Number(maVolFilter) / 100

  const errors: Record<string, string> = {}
  if (!(capital > 0)) errors.capital = "Enter a starting amount above zero."
  if (rfPercent === "" || Number.isNaN(rf) || rf < -0.1 || rf > 0.5) errors.rf = "Use a rate between −10% and 50%."
  if (strategy === "momentum" && momTrendOn && (!Number.isInteger(trendSma) || trendSma < 10 || trendSma > 500))
    errors.trend = "Use a whole number of days from 10 to 500."
  if (strategy === "mean_reversion" && mrCap !== null && (Number.isNaN(mrCap) || mrCap < 0.05 || mrCap > 2))
    errors.mrCap = "Use a value from 5% to 200%, or leave blank for no limit."
  if (strategy === "ma_crossover" && maCap !== null && (Number.isNaN(maCap) || maCap < 0.05 || maCap > 2))
    errors.maCap = "Use a value from 5% to 200%, or leave blank for no limit."
  if (strategy === "ma_crossover" && maFast >= maSlow)
    errors.ma = `Fast period (${maFast}) must be strictly less than Slow period (${maSlow}).`
  if (strategy === "mean_reversion" && mrEntryZ >= mrExitZ)
    errors.mr = `Entry Z-score (${mrEntryZ}) must be strictly less than Exit Z-score (${mrExitZ}).`
  const hasErrors = Object.keys(errors).length > 0

  /* ---------------- plain-language rule ---------------- */
  const regimeClause =
    allowedRegimes.length > 0 ? ` Only trade during: ${allowedRegimes.map(r => regimeName(r).toLowerCase()).join(", ")}.` : ""

  const plainRule = (): string => {
    if (strategy === "momentum") {
      const action = momMode === "long_short" ? "Buy when" : "Hold the asset when"
      const trend = momTrendOn ? ` and the price is above its ${momTrendFilter}-day average` : ""
      const short = momMode === "long_short" ? ` Bet against it (short) when the return is below −${(momThreshold * 100).toFixed(1)}%.` : " Otherwise stay in cash."
      return `${action} the last ${momLookback} days' return is above ${(momThreshold * 100).toFixed(1)}%${trend}.${short} Check ${momRebalance === "daily" ? "every day" : momRebalance === "weekly" ? "once a week" : "once a month"}.${regimeClause}`
    }
    if (strategy === "mean_reversion") {
      const cap = mrCap ? ` and yearly volatility is ${(mrCap * 100).toFixed(0)}% or less` : ""
      return `Buy when the price falls ${Math.abs(mrEntryZ).toFixed(1)} standard deviations below its ${mrLookback}-day average${cap}. Sell once it recovers to ${mrExitZ.toFixed(1)} deviations, or after ${mrMaxHold} days, whichever comes first.${regimeClause}`
    }
    if (strategy === "ma_crossover") {
      const cap = maCap ? ` and yearly volatility is ${(maCap * 100).toFixed(0)}% or less` : ""
      return `Hold the asset while its ${maFast}-day average price is above its ${maSlow}-day average${cap}. Otherwise stay in cash.${regimeClause}`
    }
    return "Buy on the first day and hold until the end, whatever the market does."
  }

  const buildParams = (): Record<string, unknown> => {
    const allowed = allowedRegimes.length > 0 ? allowedRegimes : null
    if (strategy === "momentum")
      return {
        lookback: momLookback,
        threshold: momThreshold,
        rebalance: momRebalance,
        trend_filter_sma: momTrendOn ? trendSma : null,
        mode: momMode,
        allowed_regimes: allowed,
      }
    if (strategy === "mean_reversion")
      return {
        lookback: mrLookback,
        entry_z: mrEntryZ,
        exit_z: mrExitZ,
        max_holding_period: mrMaxHold,
        volatility_cap: mrCap,
        allowed_regimes: allowed,
      }
    if (strategy === "ma_crossover") return { fast: maFast, slow: maSlow, volatility_filter: maCap, allowed_regimes: allowed }
    return {}
  }

  const run = useMutation({
    mutationFn: () =>
      api.runBacktest({
        ticker,
        strategy,
        params: buildParams(),
        commission_bps: commissionBps,
        slippage_bps: slippageBps,
        initial_capital: capital,
        annual_rf: rf,
        adjusted,
      }),
    onSuccess: data => {
      const params = buildParams()
      saveLastBacktest({ result: data, params, strategy, savedAt: new Date().toISOString(), initialCapital: capital })
      navigate("/backtest", { state: { backtestResult: data, strategyParams: params, strategy } })
    },
  })

  const resetDefaults = () => {
    setCommissionBps(defaultCommissionBps)
    setSlippageBps(defaultSlippageBps)
    setInitialCapital("100000")
    setRfPercent(String(+(defaultRf * 100).toFixed(2)))
    setAllowedRegimes([])
    setMomLookback(63)
    setMomThreshold(0)
    setMomRebalance("daily")
    setMomTrendOn(true)
    setMomTrendFilter("200")
    setMomMode("long_flat")
    setMrLookback(20)
    setMrEntryZ(-2)
    setMrExitZ(-0.5)
    setMrMaxHold(21)
    setMrVolCap("")
    setMaFast(20)
    setMaSlow(50)
    setMaVolFilter("")
  }

  const presets: Record<StrategyId, Preset[]> = {
    momentum: [
      { id: "m3", label: "3-month trend with 200-day filter (default)", apply: () => { setMomLookback(63); setMomThreshold(0); setMomTrendOn(true); setMomTrendFilter("200"); setMomRebalance("daily") } },
      { id: "m12", label: "12-month trend, checked monthly", apply: () => { setMomLookback(252); setMomThreshold(0); setMomTrendOn(false); setMomRebalance("monthly") } },
      { id: "m1", label: "1-month trend, checked weekly", apply: () => { setMomLookback(21); setMomThreshold(0.01); setMomTrendOn(false); setMomRebalance("weekly") } },
    ],
    mean_reversion: [
      { id: "r20", label: "Classic: 20 days, buy at −2.0 (default)", apply: () => { setMrLookback(20); setMrEntryZ(-2); setMrExitZ(-0.5); setMrMaxHold(21) } },
      { id: "r10", label: "Fast: 10 days, buy at −1.5", apply: () => { setMrLookback(10); setMrEntryZ(-1.5); setMrExitZ(0); setMrMaxHold(10) } },
      { id: "r50", label: "Patient: 50 days, buy at −2.5", apply: () => { setMrLookback(50); setMrEntryZ(-2.5); setMrExitZ(-0.5); setMrMaxHold(42) } },
    ],
    ma_crossover: [
      { id: "c2050", label: "20 / 50 days (default)", apply: () => { setMaFast(20); setMaSlow(50) } },
      { id: "c50200", label: "50 / 200 days, the 'golden cross'", apply: () => { setMaFast(50); setMaSlow(200) } },
      { id: "c1030", label: "10 / 30 days, quick", apply: () => { setMaFast(10); setMaSlow(30) } },
    ],
    buy_and_hold: [],
  }

  const totalCostBps = commissionBps + slippageBps

  return (
    <div>
      <PageHeader
        title="Strategy Testing"
        description={`Choose a set of trading rules, set realistic costs, and test it on every trading day of ${ticker}'s history.`}
        actions={
          <Button icon={<RotateCcw />} onClick={resetDefaults}>
            Reset to defaults
          </Button>
        }
      />

      {/* 1. Pick a strategy */}
      <div role="radiogroup" aria-label="Strategy" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(STRATEGY_META) as StrategyId[]).map(id => {
          const selected = id === strategy
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setStrategy(id)}
              className={cn(
                "flex flex-col items-start rounded-lg border bg-surface px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                selected ? "border-brand shadow-[inset_0_0_0_1px_rgb(var(--tm-brand))]" : "border-line hover:border-line-strong"
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border",
                    selected ? "border-brand" : "border-line-strong"
                  )}
                  aria-hidden="true"
                >
                  {selected && <span className="size-2 rounded-full bg-brand" />}
                </span>
                <span className="text-sm font-semibold text-ink">{STRATEGY_META[id].name}</span>
              </span>
              <span className="mt-1 block pl-6 text-sm text-ink-2">{STRATEGY_META[id].summary}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-4 rounded-lg border border-line bg-subtle px-4 py-3">
        <div className="text-xs font-medium text-ink-3">The rule in plain words</div>
        <p className="mt-0.5 text-base text-ink">{plainRule()}</p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* 2. Settings */}
        <Panel
          title="Strategy settings"
          actions={
            presets[strategy].length > 0 ? (
              <Select<string>
                ariaLabel="Load a preset"
                size="sm"
                value=""
                placeholder="Load a preset"
                onChange={v => presets[strategy].find(p => p.id === v)?.apply()}
                options={presets[strategy].map(p => ({ value: p.id, label: p.label }))}
                align="end"
                className="w-44"
              />
            ) : undefined
          }
        >
          {strategy === "momentum" && (
            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
              <SliderField label="Look-back period" value={momLookback} onChange={setMomLookback} min={5} max={252} format={v => `${v} days`}
                info="How far back to measure the price change. 21 days is about a month, 63 about three months, 252 about a year." />
              <SliderField label="Minimum gain to buy" value={momThreshold} onChange={setMomThreshold} min={-0.1} max={0.2} step={0.01}
                format={v => `${(v * 100).toFixed(0)}%`} info="The look-back return must be above this level before the strategy buys." />
              <div>
                <span className="tm-label">How often to check</span>
                <SegmentedControl ariaLabel="How often to check" value={momRebalance} onChange={setMomRebalance}
                  options={[{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]} />
                <p className="tm-hint">Checking less often means fewer trades and lower costs.</p>
              </div>
              <div>
                <span className="tm-label">Positions allowed</span>
                <SegmentedControl ariaLabel="Positions allowed" value={momMode} onChange={setMomMode}
                  options={[{ value: "long_flat", label: "Buy or cash" }, { value: "long_short", label: "Buy or short" }]} />
                <p className="tm-hint">"Short" means betting the price will fall.</p>
              </div>
              <div className="sm:col-span-2">
                <Switch checked={momTrendOn} onChange={setMomTrendOn} label="Only buy when the price is above a long-term average"
                  description="A common filter that keeps the strategy out of long declines." />
                {momTrendOn && (
                  <Field label="Average length" type="number" min={10} max={500} step={1} suffix="days" value={momTrendFilter}
                    onChange={e => setMomTrendFilter(e.target.value)} error={errors.trend} className="mt-3 max-w-[200px]" />
                )}
              </div>
            </div>
          )}

          {strategy === "mean_reversion" && (
            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
              <SliderField label="Average length" value={mrLookback} onChange={setMrLookback} min={5} max={252} format={v => `${v} days`}
                info="The 'normal' price is the average over this many days." />
              <SliderField label="Hold for at most" value={mrMaxHold} onChange={setMrMaxHold} min={5} max={100} format={v => `${v} days`}
                info="Sell after this many days even if the price hasn't recovered." />
              <SliderField label="Buy when the price is" value={mrEntryZ} onChange={setMrEntryZ} min={-3.5} max={-0.5} step={0.1}
                format={v => `${v.toFixed(1)} std. dev.`} minLabel="−3.5 (rare, deep drops)" maxLabel="−0.5"
                info="How far below normal the price must fall, measured in standard deviations (z-score). −2 is a drop that happens roughly 2–3% of the time." />
              <SliderField label="Sell when it recovers to" value={mrExitZ} onChange={setMrExitZ} min={-1.5} max={1.5} step={0.1}
                format={v => `${v.toFixed(1)} std. dev.`} info="0 means sell once the price is back at its average." />
              <Field label="Skip trades when volatility is above" type="number" min={5} max={200} step={1} suffix="% / yr" placeholder="No limit"
                value={mrVolCap} onChange={e => setMrVolCap(e.target.value)} error={errors.mrCap}
                hint="Optional. Avoids buying dips during market panics." />
            </div>
          )}

          {strategy === "ma_crossover" && (
            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
              <SliderField label="Short-term average" value={maFast} onChange={setMaFast} min={3} max={100} format={v => `${v} days`} />
              <SliderField label="Long-term average" value={maSlow} onChange={setMaSlow} min={10} max={300} format={v => `${v} days`} />
              <Field label="Skip trades when volatility is above" type="number" min={5} max={200} step={1} suffix="% / yr" placeholder="No limit"
                value={maVolFilter} onChange={e => setMaVolFilter(e.target.value)} error={errors.maCap} hint="Optional." />
            </div>
          )}

          {strategy === "buy_and_hold" && (
            <p className="text-sm text-ink-2">
              Buy and hold has no settings. It stays fully invested from the first day to the last and is the yardstick for every other
              strategy: if a strategy can't beat it after costs, it isn't adding value.
            </p>
          )}

          {(errors.ma || errors.mr) && (
            <Alert tone="error" className="mt-5">
              {errors.ma || errors.mr}
            </Alert>
          )}

          {strategy !== "buy_and_hold" && (
            <fieldset className="mt-6 border-t border-line pt-5">
              <legend className="sr-only">Trade only in these market conditions</legend>
              <p className="text-sm font-medium text-ink">Trade only in these market conditions</p>
              <p className="text-xs text-ink-3">Leave all unticked to trade in every condition.</p>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {REGIME_ORDER.map(r => (
                  <Checkbox
                    key={r}
                    checked={allowedRegimes.includes(r)}
                    onChange={() => toggleRegime(r)}
                    label={
                      <span className="inline-flex items-center gap-2">
                        <RegimeSwatch label={r} />
                        {regimeName(r)}
                      </span>
                    }
                    description={regimeMeta(r).description}
                  />
                ))}
              </div>
            </fieldset>
          )}
        </Panel>

        {/* 3. Costs and run */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Panel title="Costs and account">
            <div className="space-y-5">
              <SliderField label="Broker commission" value={commissionBps} onChange={setCommissionBps} min={0} max={30}
                format={v => `${v} bps`} info="Charged each time you trade. 1 basis point (bps) is 0.01%, so 5 bps on a $10,000 trade is $5." />
              <SliderField label="Slippage" value={slippageBps} onChange={setSlippageBps} min={0} max={30}
                format={v => `${v} bps`} info="The gap between the price you expect and the price you actually get. Larger for small or fast-moving assets." />
              <p className="-mt-2 text-xs text-ink-3">
                Total cost per trade: <span className="num font-medium text-ink-2">{totalCostBps} bps ({(totalCostBps / 100).toFixed(2)}%)</span>
              </p>
              <Field label="Starting amount" type="number" min={1} step={1000} prefix="$" value={initialCapital}
                onChange={e => setInitialCapital(e.target.value)} error={errors.capital} hint={capital > 0 ? formatPrice(capital) : undefined} />
              <Field label="Risk-free rate" type="number" step={0.1} suffix="% / yr" value={rfPercent}
                onChange={e => setRfPercent(e.target.value)} error={errors.rf}
                info="What cash would have earned, for example a Treasury bill rate. Used to calculate the Sharpe and Sortino ratios." />
            </div>
          </Panel>

          {run.error && (
            <Alert tone="error" title="The backtest didn't run">
              {(run.error as Error).message}
            </Alert>
          )}

          <Button variant="primary" size="lg" className="w-full" icon={<Play />} loading={run.isPending} disabled={hasErrors} onClick={() => run.mutate()}>
            {run.isPending ? "Running backtest…" : "Run backtest"}
          </Button>
          <p className="text-xs text-ink-3">
            Signals use each day's closing price and trades happen at the next close, so the test never uses information it couldn't have
            had at the time.
          </p>
        </div>
      </div>
    </div>
  )
}
