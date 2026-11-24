import React, { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Play } from "lucide-react"
import { useDataset } from "../../hooks/useDataset"
import { api } from "../../services/api/client"
import { MetricCard } from "../../components/ui/MetricCard"
import { Badge } from "../../components/ui/Badge"
import { ErrorState, LoadingState } from "../../components/ui/EmptyState"
import { Alert, PageHeader, Panel } from "../../components/ui/Panel"
import { Button } from "../../components/ui/Button"
import { Select } from "../../components/ui/Select"
import { SegmentedControl, Tabs } from "../../components/ui/Controls"
import { rechartsAxis, rechartsTooltip, shortDateTick, useChartTheme } from "../../components/charts/chartTheme"
import { UseBuiltInDataButton } from "../../components/layout/AppShell"
import {
  describeBars,
  describeParams,
  formatDateLong,
  formatPercent,
  formatPrice,
  formatRatio,
  strategyName,
} from "../../utils/format"
import { cn } from "../../utils/cn"

// Candidate settings tried on the training years. Names match the backend models.
const CANDIDATES: Record<string, Record<string, unknown>[]> = {
  momentum: [
    { lookback: 10, threshold: 0.0 },
    { lookback: 21, threshold: 0.0 },
    { lookback: 42, threshold: 0.0 },
    { lookback: 63, threshold: 0.0 },
    { lookback: 126, threshold: 0.0 },
    { lookback: 21, threshold: 0.02 },
    { lookback: 63, threshold: 0.02 },
  ],
  mean_reversion: [
    { lookback: 10, entry_z: -1.5, exit_z: 0.0 },
    { lookback: 15, entry_z: -1.5, exit_z: 0.0 },
    { lookback: 20, entry_z: -1.5, exit_z: -0.5 },
    { lookback: 20, entry_z: -2.0, exit_z: -0.5 },
    { lookback: 30, entry_z: -2.0, exit_z: -0.5 },
  ],
  ma_crossover: [
    { fast: 10, slow: 50 },
    { fast: 20, slow: 50 },
    { fast: 20, slow: 100 },
    { fast: 50, slow: 200 },
    { fast: 20, slow: 200 },
  ],
}

const SPLITS = [
  { value: "2018", label: "Learn 2014–2018, test 2019–2023", train: "2018-12-31", test: "2019-01-01" },
  { value: "2020", label: "Learn 2014–2020, test 2021–2023", train: "2020-12-31", test: "2021-01-01" },
  { value: "2021", label: "Learn 2014–2021, test 2022–2023", train: "2021-12-31", test: "2022-01-01" },
  { value: "custom", label: "Custom dates", train: "", test: "" },
]

const METRIC_ROWS: { key: string; label: string; ratio?: boolean; higherIsBetter: boolean; note?: string }[] = [
  { key: "sharpe_ratio", label: "Sharpe ratio", ratio: true, higherIsBetter: true },
  { key: "cagr", label: "Yearly growth", higherIsBetter: true },
  { key: "max_drawdown", label: "Largest drop", higherIsBetter: true },
  { key: "total_return", label: "Total return", higherIsBetter: true, note: "Not directly comparable: the two periods have different lengths." },
]

export const OutOfSamplePage: React.FC = () => {
  const { ticker, adjusted, defaultCommissionBps, defaultSlippageBps } = useDataset()
  const t = useChartTheme()
  const [tab, setTab] = useState<"split" | "walk">("split")
  const [strategy, setStrategy] = useState("momentum")
  const [goal, setGoal] = useState("sharpe_ratio")
  const [splitKey, setSplitKey] = useState("2020")
  const [customTrain, setCustomTrain] = useState("2019-12-31")
  const [customTest, setCustomTest] = useState("2020-01-01")
  const [folds, setFolds] = useState(4)

  const split = SPLITS.find(s => s.value === splitKey)!
  const trainEnd = splitKey === "custom" ? customTrain : split.train
  const testStart = splitKey === "custom" ? customTest : split.test
  const dateError =
    !trainEnd || !testStart
      ? "Choose both dates."
      : testStart <= trainEnd
        ? "The test must start after the learning period ends."
        : trainEnd < "2015-01-01"
          ? "Leave at least one year to learn from."
          : testStart > "2023-06-30"
            ? "Leave at least six months to test on."
            : null

  const [submittedSplit, setSubmittedSplit] = useState({ trainEnd: "2020-12-31", testStart: "2021-01-01" })
  const effectiveSplit = splitKey === "custom" ? submittedSplit : { trainEnd: split.train, testStart: split.test }
  const costs = { commission_bps: defaultCommissionBps, slippage_bps: defaultSlippageBps }

  const oos = useQuery({
    queryKey: ["oos", ticker, adjusted, strategy, goal, effectiveSplit, costs],
    queryFn: () =>
      api.runOutOfSample({
        ticker,
        adjusted,
        strategy,
        train_end_date: effectiveSplit.trainEnd,
        test_start_date: effectiveSplit.testStart,
        param_grid: CANDIDATES[strategy],
        target_metric: goal,
        ...costs,
      }),
    enabled: tab === "split",
  })

  const wf = useQuery({
    queryKey: ["walkForward", ticker, adjusted, strategy, folds, goal, costs],
    queryFn: () =>
      api.runWalkForward({ ticker, adjusted, strategy, n_folds: folds, param_grid: CANDIDATES[strategy], target_metric: goal, ...costs }),
    enabled: tab === "walk",
  })

  // Strategy vs. buy and hold over the test window, both starting from the same amount
  const testChart = useMemo(() => {
    const c = oos.data?.test_equity_curve ?? []
    if (c.length === 0) return []
    const s0 = c[0].net_equity
    const p0 = c[0].close
    return c.map(p => ({ date: p.date, strategy: p.net_equity, hold: (s0 * p.close) / p0 }))
  }, [oos.data])

  const goalLabel = goal === "cagr" ? "yearly growth" : "Sharpe ratio"

  return (
    <div>
      <PageHeader
        title="Out-of-Sample Test"
        description="Choose the best settings using older years only, then test them on later years the strategy has never seen. If results collapse on the new data, the original result was probably fitted to the past."
      />

      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line bg-surface px-4 py-3">
        <Select
          label="Strategy"
          value={strategy}
          onChange={setStrategy}
          options={Object.keys(CANDIDATES).map(id => ({ value: id, label: strategyName(id), meta: `${CANDIDATES[id].length} candidates` }))}
          className="w-64"
        />
        <Select
          label="Pick settings with the best"
          value={goal}
          onChange={setGoal}
          options={[
            { value: "sharpe_ratio", label: "Sharpe ratio", description: "Return for the risk taken" },
            { value: "cagr", label: "Yearly growth", description: "Highest return, ignoring risk" },
          ]}
          className="w-56"
        />
        <p className="max-w-xs text-xs text-ink-3">
          Candidates tried: {CANDIDATES[strategy].map(c => describeParams(c)).join("; ")}.
        </p>
      </div>

      <Tabs
        ariaLabel="Test type"
        value={tab}
        onChange={setTab}
        className="mb-4"
        tabs={[
          { value: "split", label: "Single split" },
          { value: "walk", label: "Rolling test (walk-forward)" },
        ]}
      />

      {tab === "split" && (
        <div className="space-y-4">
          <Panel>
            <div className="flex flex-wrap items-end gap-4">
              <Select label="Split" value={splitKey} onChange={setSplitKey} options={SPLITS.map(s => ({ value: s.value, label: s.label }))} className="w-72" />
              {splitKey === "custom" && (
                <>
                  <div>
                    <label htmlFor="train-end" className="tm-label">Learn up to</label>
                    <input id="train-end" type="date" className="tm-input w-44" min="2014-06-01" max="2023-06-30" value={customTrain} onChange={e => setCustomTrain(e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor="test-start" className="tm-label">Test from</label>
                    <input id="test-start" type="date" className="tm-input w-44" min="2014-06-01" max="2023-06-30" value={customTest} onChange={e => setCustomTest(e.target.value)} />
                  </div>
                  <Button
                    variant="primary"
                    icon={<Play />}
                    disabled={!!dateError}
                    onClick={() => setSubmittedSplit({ trainEnd: customTrain, testStart: customTest })}
                  >
                    Run test
                  </Button>
                </>
              )}
            </div>
            {splitKey === "custom" && dateError && <p className="mt-2 text-sm text-neg">{dateError}</p>}
          </Panel>

          {oos.isLoading && <LoadingState variant="panel" message="Choosing settings on the learning years, then testing them…" />}
          {oos.error && <ErrorState error={oos.error} onRetry={() => oos.refetch()} secondary={<UseBuiltInDataButton />} />}

          {oos.data && (
            <div className={cn("space-y-4 transition-opacity", oos.isFetching && "opacity-60")}>
              {oos.data.overfitting_warning ? (
                <Alert tone="error" title="The results did not hold up on new data">
                  <ul className="list-disc pl-4">
                    {oos.data.warning_reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </Alert>
              ) : (oos.data.degradation[goal]?.percent_diff ?? 0) < -0.25 ? (
                <Alert tone="warning" title="Weaker on new data, but no overfitting flag">
                  The {goalLabel} fell {formatPercent(Math.abs(oos.data.degradation[goal].percent_diff), false, 0)} on the unseen years. That is
                  inside the tool's tolerance, but expect real-world results to be lower than the learning-years figures.
                </Alert>
              ) : (
                <Alert tone="success" title="The chosen settings held up on new data">
                  Performance on the unseen years stayed close to, or better than, what was found on the learning years.
                </Alert>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <MetricCard id="chosen" label="Settings chosen on the learning years" value={describeParams(oos.data.chosen_params)} subValue={`Best ${goalLabel} over ${describeBars(oos.data.train_window.bars)}`} className="[&>div:nth-child(2)]:text-md" />
                <MetricCard id="rank" label="Rank on the unseen years" value={oos.data.diagnostic_rank_in_oos} subValue="Where those settings placed among all candidates" />
                <MetricCard id="window" label="Test period" value={describeBars(oos.data.test_window.bars)} subValue={`${formatDateLong(oos.data.test_window.start)} to ${formatDateLong(oos.data.test_window.end)}`} className="[&>div:nth-child(2)]:text-md" />
              </div>

              <Panel title="Learning years vs. unseen years" flush>
                <div className="overflow-x-auto">
                  <table className="tm-table">
                    <thead>
                      <tr>
                        <th>Measure</th>
                        <th className="r">Learning years</th>
                        <th className="r">Unseen years</th>
                        <th className="r">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {METRIC_ROWS.map(row => {
                        const item = oos.data!.degradation[row.key]
                        if (!item) return null
                        const better = row.higherIsBetter ? item.out_of_sample >= item.in_sample : item.out_of_sample <= item.in_sample
                        const f = (v: number) => (row.ratio ? formatRatio(v) : formatPercent(v))
                        return (
                          <tr key={row.key} className={cn(row.note && "text-ink-3")}>
                            <td>
                              <div className="font-medium">{row.label}</div>
                              {row.note && <div className="text-xs">{row.note}</div>}
                            </td>
                            <td className="r num">{f(item.in_sample)}</td>
                            <td className="r num font-medium">{f(item.out_of_sample)}</td>
                            <td className="r">
                              {row.note ? (
                                <span className="num">{formatPercent(item.percent_diff, true, 0)}</span>
                              ) : (
                                <Badge variant={better ? "success" : "error"}>
                                  {better ? "Better" : "Worse"} {formatPercent(Math.abs(item.percent_diff), false, 0)}
                                </Badge>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel title="Unseen years: strategy vs. buy and hold" description="Both start from the same amount on the first test day.">
                <div className="h-72">
                  <ResponsiveContainer>
                    <LineChart data={testChart} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={t.grid} />
                      <XAxis dataKey="date" {...rechartsAxis(t)} minTickGap={60} tickFormatter={shortDateTick} />
                      <YAxis {...rechartsAxis(t)} axisLine={false} domain={["auto", "auto"]} tickFormatter={v => `$${Math.round(v / 1000)}k`} width={48} />
                      <Tooltip {...rechartsTooltip(t)} labelFormatter={formatDateLong} formatter={(v: number, n: string) => [formatPrice(v), n]} />
                      <Legend iconType="plainline" formatter={v => <span style={{ color: t.text, fontSize: 12 }}>{v}</span>} />
                      <Line type="monotone" dataKey="strategy" name={`${strategyName(strategy)}, after costs`} stroke={t.primary} strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="hold" name="Buy and hold" stroke={t.benchmark} strokeOpacity={0.6} strokeWidth={1} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>
          )}
        </div>
      )}

      {tab === "walk" && (
        <div className="space-y-4">
          <Panel>
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <span className="tm-label">Number of rounds</span>
                <SegmentedControl ariaLabel="Number of rounds" value={folds} onChange={setFolds} options={[2, 3, 4, 5, 6].map(n => ({ value: n, label: String(n) }))} />
              </div>
              <p className="max-w-xl text-sm text-ink-2">
                In each round the strategy picks its settings using all data up to that point, then is tested on the next block of time. The
                learning window grows each round, much like it would in real life.
              </p>
            </div>
          </Panel>

          {wf.isLoading && <LoadingState variant="panel" message={`Running ${folds} rounds…`} />}
          {wf.error && <ErrorState error={wf.error} onRetry={() => wf.refetch()} secondary={<UseBuiltInDataButton />} />}

          {wf.data && (
            <div className={cn("space-y-4 transition-opacity", wf.isFetching && "opacity-60")}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <MetricCard
                  id="stitched"
                  label="$100,000 across all test blocks"
                  value={formatPrice(wf.data.stitched_final_equity)}
                  trend={wf.data.stitched_final_equity >= 100000 ? "positive" : "negative"}
                  subValue="Test blocks joined end to end"
                />
                <MetricCard
                  id="span"
                  label="Total time tested"
                  value={describeBars(wf.data.stitched_test_bars)}
                  subValue={`${formatDateLong(wf.data.stitched_start_date)} to ${formatDateLong(wf.data.stitched_end_date)}`}
                  className="[&>div:nth-child(2)]:text-md"
                />
                <MetricCard
                  id="held"
                  label="Rounds where the test result stayed positive"
                  value={`${wf.data.folds.filter(f => (f.test_metric ?? 0) > 0).length} of ${wf.data.folds.length}`}
                  subValue={`Measured by ${goalLabel}`}
                />
              </div>

              <Panel title={`${goal === "cagr" ? "Yearly growth" : "Sharpe ratio"} in each round`} description="Learning result vs. test result. A big drop from the first bar to the second is a warning sign.">
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart data={wf.data.folds.map(f => ({ name: `Round ${f.fold}`, learn: f.train_metric, test: f.test_metric }))} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={t.grid} />
                      <XAxis dataKey="name" {...rechartsAxis(t)} />
                      <YAxis {...rechartsAxis(t)} axisLine={false} tickFormatter={v => (goal === "cagr" ? `${Math.round(v * 100)}%` : String(v))} />
                      <ReferenceLine y={0} stroke={t.axis} />
                      <Tooltip {...rechartsTooltip(t)} cursor={{ fill: t.grid }} formatter={(v: number, n: string) => [goal === "cagr" ? formatPercent(v) : formatRatio(v), n]} />
                      <Legend iconType="square" iconSize={10} formatter={v => <span style={{ color: t.text, fontSize: 12 }}>{v}</span>} />
                      <Bar dataKey="learn" name="Learning period" fill={t.isDark ? "#46627A" : "#BCC5CC"} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                      <Bar dataKey="test" name="Test period" fill={t.primary} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel title="Round by round" flush>
                <div className="overflow-x-auto">
                  <table className="tm-table">
                    <thead>
                      <tr>
                        <th>Round</th>
                        <th>Learned on</th>
                        <th>Tested on</th>
                        <th>Settings picked</th>
                        <th className="r">Learning result</th>
                        <th className="r">Test result</th>
                        <th className="r">Test largest drop</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wf.data.folds.map(f => (
                        <tr key={f.fold}>
                          <td className="font-medium">{f.fold}</td>
                          <td className="text-ink-2">{f.train_range.replace(" to ", " – ")}</td>
                          <td>{f.test_range.replace(" to ", " – ")}</td>
                          <td className="text-ink-2">{describeParams(f.selected_params)}</td>
                          <td className="r num">{goal === "cagr" ? formatPercent(f.train_metric) : formatRatio(f.train_metric)}</td>
                          <td className={cn("r num font-medium", (f.test_metric ?? 0) < 0 ? "text-neg" : "text-pos")}>
                            {goal === "cagr" ? formatPercent(f.test_metric) : formatRatio(f.test_metric)}
                          </td>
                          <td className="r num text-neg">{formatPercent(f.test_metrics.max_drawdown)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
