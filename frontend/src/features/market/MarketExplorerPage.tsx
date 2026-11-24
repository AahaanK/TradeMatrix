import React, { useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowDownUp, CheckCircle2, Download, FileUp } from "lucide-react"
import { api } from "../../services/api/client"
import { useDataset } from "../../hooks/useDataset"
import { PriceChart } from "../../components/charts/PriceChart"
import { Badge } from "../../components/ui/Badge"
import { ErrorState, LoadingState } from "../../components/ui/EmptyState"
import { Alert, PageHeader, Panel, Stat } from "../../components/ui/Panel"
import { Button } from "../../components/ui/Button"
import { SegmentedControl, Tabs } from "../../components/ui/Controls"
import { Select } from "../../components/ui/Select"
import { UseBuiltInDataButton } from "../../components/layout/AppShell"
import { DataQualityReport } from "../../types"
import { downloadCsv } from "../../utils/csv"
import { formatDateLong, formatInt, formatNumber, formatVolume } from "../../utils/format"
import { cn } from "../../utils/cn"

type Tab = "chart" | "table" | "quality"

const INTERVAL_LABEL: Record<string, string> = { "1d": "daily", "1wk": "weekly", "1mo": "monthly" }

const CHECK_NAMES: Record<string, string> = {
  required_columns: "Required columns",
  date_parsing: "Readable dates",
  null_dates: "Blank dates",
  duplicate_dates: "Repeated dates",
  missing_prices: "Missing prices",
  nonpositive_prices: "Zero or negative prices",
  ohlc_consistency: "High/low consistency",
  zero_or_negative_volume: "Zero-volume days",
  frequency_gaps: "Gaps in the calendar",
  minimum_history: "Enough history",
}

export const MarketExplorerPage: React.FC = () => {
  const { ticker, interval, setInterval, adjusted } = useDataset()
  const [tab, setTab] = useState<Tab>("chart")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState("50")
  const [newestFirst, setNewestFirst] = useState(true)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [upload, setUpload] = useState<
    | { state: "idle" }
    | { state: "busy"; name: string }
    | { state: "done"; name: string; bars: number; report: DataQualityReport; fingerprint: string }
    | { state: "error"; message: string }
  >({ state: "idle" })
  const fileRef = useRef<HTMLInputElement>(null)

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["marketData", ticker, interval, adjusted],
    queryFn: () => api.getMarketData({ ticker, interval, adjusted }),
    placeholderData: prev => (prev?.ticker === ticker ? prev : undefined),
  })

  const bars = useMemo(() => data?.bars ?? [], [data])
  const withChange = useMemo(
    () => bars.map((b, i) => ({ ...b, change: i > 0 ? b.close / bars[i - 1].close - 1 : null })),
    [bars]
  )
  const filtered = useMemo(() => {
    const rows = withChange.filter(b => (!from || b.date >= from) && (!to || b.date <= to))
    return newestFirst ? [...rows].reverse() : rows
  }, [withChange, from, to, newestFirst])

  const size = Number(pageSize)
  const totalPages = Math.max(1, Math.ceil(filtered.length / size))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice((safePage - 1) * size, safePage * size)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setUpload({ state: "busy", name: file.name })
    try {
      const res = await api.uploadMarketCsv(file, interval, adjusted)
      setUpload({ state: "done", name: res.filename, bars: res.total_bars, report: res.data_quality, fingerprint: res.dataset_fingerprint })
    } catch (err) {
      setUpload({ state: "error", message: err instanceof Error ? err.message : "Upload failed" })
    }
  }

  const exportRows = () =>
    downloadCsv(
      `${ticker}_${interval}_${from || "start"}_${to || "end"}`,
      filtered.map(b => ({ ...b, change: b.change === null ? "" : (b.change * 100).toFixed(4) })),
      [
        { key: "date", label: "Date" },
        { key: "open", label: "Open" },
        { key: "high", label: "High" },
        { key: "low", label: "Low" },
        { key: "close", label: "Close" },
        { key: "change", label: "Change %" },
        { key: "volume", label: "Volume" },
        { key: "adj_close", label: "Adjusted close" },
      ]
    )

  if (isLoading) return <LoadingState message={`Loading ${ticker} prices…`} />
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} secondary={<UseBuiltInDataButton />} />

  const dq = data.data_quality

  return (
    <div>
      <PageHeader
        title="Market Explorer"
        description={
          <>
            {formatInt(data.total_bars)} {INTERVAL_LABEL[interval]} prices for {ticker},{" "}
            {data.source === "bundled" ? "from the built-in dataset" : "downloaded from Yahoo Finance"}. Prices are{" "}
            {adjusted ? "adjusted for dividends and splits" : "shown as originally traded"}.
          </>
        }
        actions={
          <>
            <SegmentedControl
              ariaLabel="Bar size"
              value={interval}
              onChange={v => {
                setInterval(v)
                setPage(1)
              }}
              options={[
                { value: "1d", label: "Daily" },
                { value: "1wk", label: "Weekly" },
                { value: "1mo", label: "Monthly" },
              ]}
            />
            <Button icon={<FileUp />} onClick={() => fileRef.current?.click()} loading={upload.state === "busy"}>
              Check a CSV file
            </Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="sr-only" tabIndex={-1} aria-hidden="true" />
          </>
        }
      />

      {upload.state === "done" && (
        <Alert
          className="mb-4"
          tone={upload.report.is_valid ? "success" : "warning"}
          title={`${upload.name}: ${formatInt(upload.bars)} rows checked, ${upload.report.is_valid ? "no blocking problems" : "problems found"}`}
          action={
            <Button size="sm" variant="ghost" onClick={() => setUpload({ state: "idle" })}>
              Dismiss
            </Button>
          }
        >
          {formatDateLong(upload.report.start_date)} to {formatDateLong(upload.report.end_date)}.{" "}
          {upload.report.issues.length > 0
            ? upload.report.issues.map(i => i.message).join(" ")
            : "Dates, prices and volume all look consistent."}{" "}
          <span className="font-mono text-xs">ID {upload.fingerprint.slice(0, 12)}</span>
        </Alert>
      )}
      {upload.state === "error" && (
        <Alert className="mb-4" tone="error" title="That file couldn't be read" action={<Button size="sm" variant="ghost" onClick={() => setUpload({ state: "idle" })}>Dismiss</Button>}>
          {upload.message} The file needs a header row with date, open, high, low, close and volume columns.
        </Alert>
      )}

      <Tabs
        ariaLabel="Market data views"
        value={tab}
        onChange={setTab}
        className="mb-4"
        tabs={[
          { value: "chart", label: "Chart" },
          { value: "table", label: <>Price table <span className="num text-ink-3">{formatInt(bars.length)}</span></> },
          {
            value: "quality",
            label: (
              <>
                Data checks
                {dq.is_valid ? <CheckCircle2 className="size-3.5 text-pos" aria-label="passed" /> : <Badge variant="warning">Review</Badge>}
              </>
            ),
          },
        ]}
      />

      {tab === "chart" && (
        <Panel className={cn(isFetching && "opacity-70 transition-opacity")}>
          <PriceChart data={bars} height={440} controls ariaLabel={`${ticker} ${INTERVAL_LABEL[interval]} price chart`} />
        </Panel>
      )}

      {tab === "table" && (
        <Panel flush>
          <div className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3">
            <div>
              <label htmlFor="from" className="tm-label">From</label>
              <input id="from" type="date" className="tm-input w-40" value={from} min={dq.start_date} max={to || dq.end_date} onChange={e => { setFrom(e.target.value); setPage(1) }} />
            </div>
            <div>
              <label htmlFor="to" className="tm-label">To</label>
              <input id="to" type="date" className="tm-input w-40" value={to} min={from || dq.start_date} max={dq.end_date} onChange={e => { setTo(e.target.value); setPage(1) }} />
            </div>
            {(from || to) && (
              <Button variant="ghost" onClick={() => { setFrom(""); setTo(""); setPage(1) }}>
                Clear dates
              </Button>
            )}
            <div className="ml-auto flex flex-wrap items-end gap-2">
              <Button icon={<ArrowDownUp />} onClick={() => setNewestFirst(n => !n)}>
                {newestFirst ? "Newest first" : "Oldest first"}
              </Button>
              <Button icon={<Download />} onClick={exportRows} disabled={filtered.length === 0}>
                Download CSV
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="tm-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="r">Open</th>
                  <th className="r">High</th>
                  <th className="r">Low</th>
                  <th className="r">Close</th>
                  <th className="r">Change</th>
                  <th className="r">Volume</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(b => (
                  <tr key={b.date}>
                    <td>{b.date}</td>
                    <td className="r num">{formatNumber(b.open)}</td>
                    <td className="r num">{formatNumber(b.high)}</td>
                    <td className="r num">{formatNumber(b.low)}</td>
                    <td className="r num font-medium">{formatNumber(b.close)}</td>
                    <td className={cn("r num", b.change === null ? "text-ink-3" : b.change >= 0 ? "text-pos" : "text-neg")}>
                      {b.change === null ? "—" : `${b.change >= 0 ? "+" : "−"}${Math.abs(b.change * 100).toFixed(2)}%`}
                    </td>
                    <td className="r num text-ink-2">{formatVolume(b.volume)}</td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-ink-3">No prices in this date range.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-sm text-ink-2">
            <span className="num">
              {filtered.length === 0
                ? "0 rows"
                : `${formatInt((safePage - 1) * size + 1)}–${formatInt(Math.min(safePage * size, filtered.length))} of ${formatInt(filtered.length)}`}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm">Rows</span>
              <Select
                ariaLabel="Rows per page"
                size="sm"
                value={pageSize}
                onChange={v => { setPageSize(v); setPage(1) }}
                options={["25", "50", "100", "250"].map(v => ({ value: v, label: v }))}
                className="w-20"
                align="end"
              />
              <Button size="sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>Previous</Button>
              <span className="num px-1">Page {safePage} of {totalPages}</span>
              <Button size="sm" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Next</Button>
            </div>
          </div>
        </Panel>
      )}

      {tab === "quality" && (
        <div className="space-y-4">
          <Panel
            title={dq.is_valid ? "This data is ready to use" : "This data has problems to review"}
            description="Every dataset is checked before any analysis runs. Problems that would distort results are fixed or flagged here."
          >
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 xl:grid-cols-6">
              <Stat label="Rows checked" value={formatInt(dq.total_bars)} sub={`${formatDateLong(dq.start_date)} to ${formatDateLong(dq.end_date)}`} />
              <Stat label="Repeated dates removed" value={formatInt(dq.duplicate_dates_removed)} />
              <Stat label="Rows with missing values" value={formatInt(dq.missing_value_bars)} />
              <Stat label="High/low errors" value={formatInt(dq.ohlc_violation_bars)} sub="High below low, or close outside the day's range" />
              <Stat label="Zero-volume days" value={formatInt(dq.zero_or_negative_volume_bars)} />
              <Stat label="Gaps over 5 days" value={formatInt(dq.gaps_detected)} sub="Usually holidays" />
            </div>
          </Panel>
          <Panel title="Notes from the checks" flush>
            {dq.issues.length === 0 ? (
              <p className="flex items-center gap-2 px-4 py-4 text-sm text-ink-2">
                <CheckCircle2 className="size-4 text-pos" aria-hidden="true" />
                Every check passed. No changes were needed.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {dq.issues.map((issue, idx) => (
                  <li key={idx} className="flex items-start gap-3 px-4 py-3 text-sm">
                    <Badge variant={issue.severity === "error" ? "error" : issue.severity === "warning" ? "warning" : "neutral"}>
                      {issue.severity === "error" ? "Problem" : issue.severity === "warning" ? "Warning" : "Note"}
                    </Badge>
                    <div>
                      <div className="font-medium text-ink">{CHECK_NAMES[issue.check] ?? issue.check.replace(/_/g, " ")}</div>
                      <div className="text-ink-2">{issue.message}</div>
                      {issue.details && issue.details.length > 0 && (
                        <div className="mt-1 text-xs text-ink-3">{issue.details.slice(0, 6).join(", ")}{issue.details.length > 6 ? "…" : ""}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <p className="text-xs text-ink-3">
            Dataset ID (changes if the data changes):{" "}
            <span className="font-mono">{data.dataset_fingerprint}</span>
          </p>
        </div>
      )}
    </div>
  )
}
