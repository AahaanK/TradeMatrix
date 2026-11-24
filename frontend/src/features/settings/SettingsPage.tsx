import React, { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react"
import { useDataset } from "../../hooks/useDataset"
import { api } from "../../services/api/client"
import { Alert, PageHeader, Panel, Stat } from "../../components/ui/Panel"
import { Button } from "../../components/ui/Button"
import { Field, SegmentedControl } from "../../components/ui/Controls"
import { formatDateLong, formatInt } from "../../utils/format"

const FREQUENCIES = [
  { key: "1d", label: "Daily", n: 252, note: "Trading days in a typical year" },
  { key: "1wk", label: "Weekly", n: 52, note: "Weeks in a year" },
  { key: "1mo", label: "Monthly", n: 12, note: "Months in a year" },
]

export const SettingsPage: React.FC = () => {
  const {
    annualRf,
    setAnnualRf,
    interval,
    theme,
    setTheme,
    defaultCommissionBps,
    defaultSlippageBps,
    setDefaultCosts,
  } = useDataset()
  const [rf, setRf] = useState(String(+(annualRf * 100).toFixed(2)))
  const [commission, setCommission] = useState(String(defaultCommissionBps))
  const [slippage, setSlippage] = useState(String(defaultSlippageBps))
  const [saved, setSaved] = useState(false)

  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await fetch("/health")
      if (!res.ok) throw new Error("The analysis server did not respond")
      return res.json() as Promise<{ status: string; service: string; version: string; database: string }>
    },
    staleTime: 10_000,
    retry: 0,
  })
  const bundled = useQuery({
    queryKey: ["marketData", "SPY", "1d", true],
    queryFn: () => api.getMarketData({ ticker: "SPY", interval: "1d", adjusted: true }),
  })

  const rfNum = Number(rf)
  const cNum = Number(commission)
  const sNum = Number(slippage)
  const errors = {
    rf: rf === "" || Number.isNaN(rfNum) || rfNum < -10 || rfNum > 50 ? "Use a rate between −10% and 50%." : null,
    c: commission === "" || Number.isNaN(cNum) || cNum < 0 || cNum > 100 ? "Use 0 to 100 bps." : null,
    s: slippage === "" || Number.isNaN(sNum) || sNum < 0 || sNum > 100 ? "Use 0 to 100 bps." : null,
  }
  const hasErrors = Object.values(errors).some(Boolean)
  const dirty =
    rfNum / 100 !== annualRf || cNum !== defaultCommissionBps || sNum !== defaultSlippageBps

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (hasErrors) return
    setAnnualRf(rfNum / 100)
    setDefaultCosts(cNum, sNum)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const resetAll = () => {
    try {
      localStorage.removeItem("tradematrix_prefs")
    } catch {
      /* ignore */
    }
    setAnnualRf(0)
    setDefaultCosts(5, 5)
    setRf("0")
    setCommission("5")
    setSlippage("5")
  }

  const dq = bundled.data?.data_quality

  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" description="Default assumptions used across the app, how the numbers are calculated, and the status of the analysis server." />

      <div className="space-y-4">
        <Panel title="Default assumptions" description="New backtests start from these values. You can still change them for any single run.">
          <form onSubmit={save} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-3">
              <Field
                label="Risk-free rate"
                type="number"
                step={0.1}
                suffix="% / yr"
                value={rf}
                onChange={e => setRf(e.target.value)}
                error={errors.rf}
                info="What you could earn with no risk, such as a short-term government bill. The Sharpe and Sortino ratios measure return above this rate."
              />
              <Field label="Commission" type="number" step={0.5} min={0} suffix="bps" value={commission} onChange={e => setCommission(e.target.value)} error={errors.c} hint="1 bps = 0.01% of the trade" />
              <Field label="Slippage" type="number" step={0.5} min={0} suffix="bps" value={slippage} onChange={e => setSlippage(e.target.value)} error={errors.s} hint="Price lost to the spread and market impact" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" disabled={hasErrors || !dirty}>
                Save defaults
              </Button>
              <Button variant="ghost" onClick={resetAll}>
                Restore original values
              </Button>
              {saved && (
                <span className="inline-flex items-center gap-1.5 text-sm text-pos" role="status">
                  <CheckCircle2 className="size-4" aria-hidden="true" /> Defaults saved
                </span>
              )}
            </div>
            <p className="text-xs text-ink-3">
              With a {rfNum || 0}% yearly rate, the daily rate used is (1 + {(rfNum / 100 || 0).toFixed(4)})^(1/252) − 1 ={" "}
              <span className="num">{(((1 + (rfNum / 100 || 0)) ** (1 / 252) - 1) * 100).toFixed(5)}%</span>.
            </p>
          </form>
        </Panel>

        <Panel title="Appearance">
          <div className="flex flex-wrap items-center gap-4">
            <SegmentedControl
              ariaLabel="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
            <p className="text-sm text-ink-2">Your choice is remembered on this device.</p>
          </div>
        </Panel>

        <Panel
          title="How yearly figures are calculated"
          description="Daily, weekly and monthly returns are scaled to a full year with these factors. Volatility uses the square root."
          flush
        >
          <table className="tm-table">
            <thead>
              <tr>
                <th>Bar size</th>
                <th className="r">Periods per year (N)</th>
                <th className="r">√N</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {FREQUENCIES.map(f => (
                <tr key={f.key}>
                  <td className="font-medium">
                    {f.label}
                    {interval === f.key && <span className="ml-2 text-xs font-normal text-ink-3">(selected in Market Explorer)</span>}
                  </td>
                  <td className="r num">{f.n}</td>
                  <td className="r num">{Math.sqrt(f.n).toFixed(4)}</td>
                  <td className="text-ink-2">{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">
            Strategy tests, risk figures and market conditions always use daily bars, so they use N = 252.
          </p>
        </Panel>

        <Panel
          title="System status"
          actions={
            <Button size="sm" icon={<RefreshCw />} loading={health.isFetching} onClick={() => health.refetch()}>
              Check again
            </Button>
          }
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <div className="text-xs text-ink-3">Analysis server</div>
              {health.data?.status === "healthy" ? (
                <div className="mt-1 flex items-center gap-2 text-sm font-medium text-ink">
                  <CheckCircle2 className="size-4 text-pos" aria-hidden="true" /> Connected
                </div>
              ) : health.isLoading ? (
                <div className="mt-1 text-sm text-ink-2">Checking…</div>
              ) : (
                <div className="mt-1 flex items-center gap-2 text-sm font-medium text-neg">
                  <XCircle className="size-4" aria-hidden="true" /> Not reachable
                </div>
              )}
              {health.data && (
                <div className="mt-0.5 text-xs text-ink-3">
                  {health.data.service} {health.data.version}, database {health.data.database}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-ink-3">Built-in dataset</div>
              {dq ? (
                <>
                  <div className="mt-1 text-sm font-medium text-ink">SPY, {formatInt(dq.total_bars)} trading days</div>
                  <div className="mt-0.5 text-xs text-ink-3">
                    {formatDateLong(dq.start_date)} to {formatDateLong(dq.end_date)}. Works offline.
                  </div>
                </>
              ) : (
                <div className="mt-1 text-sm text-ink-2">{bundled.isLoading ? "Loading…" : "Unavailable"}</div>
              )}
            </div>
          </div>
          {health.isError && (
            <Alert tone="error" className="mt-4" title="Start the backend to use the dashboard">
              From the project folder run <code className="font-mono text-xs">make run-backend</code>, then select "Check again".
            </Alert>
          )}
          {bundled.data && (
            <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
              <Stat label="Checks passed" value={dq?.is_valid ? "All" : "Some issues"} />
              <Stat label="Repeated dates" value={formatInt(dq?.duplicate_dates_removed)} />
              <Stat label="Calendar gaps" value={formatInt(dq?.gaps_detected)} />
              <Stat label="Fingerprint" value={<span className="font-mono text-sm">{bundled.data.dataset_fingerprint.slice(0, 10)}</span>} />
            </dl>
          )}
        </Panel>
      </div>
    </div>
  )
}
