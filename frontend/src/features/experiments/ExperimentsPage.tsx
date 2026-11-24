import React, { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Check, Copy, FileSpreadsheet, FileText, Pencil, Search, ShieldCheck, ShieldAlert, Trash2, X } from "lucide-react"
import { api } from "../../services/api/client"
import { Experiment } from "../../types"
import { Badge } from "../../components/ui/Badge"
import { ErrorState, LoadingState, EmptyState } from "../../components/ui/EmptyState"
import { Alert, PageHeader, Panel, Stat } from "../../components/ui/Panel"
import { Button, ButtonLink, IconButton } from "../../components/ui/Button"
import { Select } from "../../components/ui/Select"
import { ConfirmDialog } from "../../components/ui/Dialog"
import { EquityChart, buyAndHoldFromCurve } from "../../components/charts/EquityChart"
import { rechartsAxis, rechartsTooltip, shortDateTick, useChartTheme } from "../../components/charts/chartTheme"
import {
  describeParams,
  formatDateLong,
  formatInt,
  formatPercent,
  formatPrice,
  formatRatio,
  strategyName,
} from "../../utils/format"
import { cn } from "../../utils/cn"

type SortKey = "newest" | "oldest" | "sharpe" | "cagr" | "drawdown"
const MAX_COMPARE = 4

export const ExperimentsPage: React.FC = () => {
  const queryClient = useQueryClient()
  const t = useChartTheme()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [confirmDelete, setConfirmDelete] = useState<Experiment | null>(null)
  const [query, setQuery] = useState("")
  const [strategyFilter, setStrategyFilter] = useState("all")
  const [sort, setSort] = useState<SortKey>("newest")

  const { data: experiments, isLoading, error, refetch } = useQuery({
    queryKey: ["experiments"],
    queryFn: () => api.listExperiments(),
  })

  const detail = useQuery({
    queryKey: ["experiment", openId],
    queryFn: () => api.getExperiment(openId!),
    enabled: !!openId,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["experiments"] })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteExperiment(id),
    onSuccess: (_d, id) => {
      invalidate()
      setSelectedIds(prev => prev.filter(x => x !== id))
      if (openId === id) setOpenId(null)
      setConfirmDelete(null)
    },
  })
  const duplicateMutation = useMutation({ mutationFn: (id: string) => api.duplicateExperiment(id), onSuccess: invalidate })
  const updateMutation = useMutation({
    mutationFn: ({ id, name, notes }: { id: string; name: string; notes: string }) => api.updateExperiment(id, { name, notes }),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ["experiment"] })
      setEditingId(null)
    },
  })

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = (experiments ?? []).filter(e => {
      if (strategyFilter !== "all" && e.strategy !== strategyFilter) return false
      if (!q) return true
      return [e.name, e.ticker, e.strategy, strategyName(e.strategy), e.notes ?? ""].some(s => s.toLowerCase().includes(q))
    })
    const num = (v: number | null | undefined, fallback: number) => (v === null || v === undefined ? fallback : v)
    return rows.sort((a, b) => {
      switch (sort) {
        case "oldest": return a.created_at.localeCompare(b.created_at)
        case "sharpe": return num(b.metrics.sharpe_ratio, -99) - num(a.metrics.sharpe_ratio, -99)
        case "cagr": return num(b.metrics.cagr, -99) - num(a.metrics.cagr, -99)
        case "drawdown": return num(b.metrics.max_drawdown, -99) - num(a.metrics.max_drawdown, -99)
        default: return b.created_at.localeCompare(a.created_at)
      }
    })
  }, [experiments, query, strategyFilter, sort])

  const selected = (experiments ?? []).filter(e => selectedIds.includes(e.id))

  // Overlay of selected equity curves, each scaled to start at 100
  const overlay = useMemo(() => {
    if (selected.length < 2) return []
    const byDate = new Map<string, Record<string, number | string>>()
    selected.forEach(e => {
      const curve = e.equity_curve ?? []
      const base = curve[0]?.net_equity || 1
      const stepN = Math.max(1, Math.floor(curve.length / 500))
      curve.forEach((p, i) => {
        if (i % stepN !== 0 && i !== curve.length - 1) return
        const row = byDate.get(p.date) ?? { date: p.date }
        row[e.id] = (p.net_equity / base) * 100
        byDate.set(p.date, row)
      })
    })
    return Array.from(byDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)))
  }, [selected])
  const lineColors = [t.primary, t.secondary, t.isDark ? "#8FB3CF" : "#3F6E91", t.isDark ? "#D9B26A" : "#8A6A2A"]

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= MAX_COMPARE ? prev : [...prev, id]))

  const startEdit = (e: Experiment) => {
    setEditingId(e.id)
    setEditName(e.name)
    setEditNotes(e.notes ?? "")
  }

  if (isLoading) return <LoadingState message="Loading your saved results…" />
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />

  const strategiesPresent = Array.from(new Set((experiments ?? []).map(e => e.strategy)))
  const open = detail.data

  return (
    <div>
      <PageHeader
        title="Research History"
        description="Every backtest you save is stored here with its exact settings and a fingerprint of the data it used, so you can compare runs and repeat them later."
        actions={<ButtonLink to="/strategy" variant="primary">New backtest</ButtonLink>}
      />

      {(experiments ?? []).length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          description='Run a backtest in Strategy Testing, then choose "Save to history" on the results page.'
          secondary={<ButtonLink to="/strategy" variant="primary">Go to Strategy Testing</ButtonLink>}
        />
      ) : (
        <>
          {selected.length >= 2 && (
            <Panel
              className="mb-4"
              title={`Comparing ${selected.length} results`}
              actions={<Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Clear selection</Button>}
              flush
            >
              <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="overflow-x-auto border-b border-line xl:border-b-0 xl:border-r">
                  <table className="tm-table">
                    <thead>
                      <tr>
                        <th></th>
                        {selected.map((e, i) => (
                          <th key={e.id} className="r">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="inline-block h-0.5 w-3" style={{ backgroundColor: lineColors[i] }} aria-hidden="true" />
                              <span className="max-w-[140px] truncate" title={e.name}>{e.name}</span>
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "Strategy", f: (e: Experiment) => strategyName(e.strategy) },
                        { label: "Asset", f: (e: Experiment) => e.ticker },
                        { label: "Yearly growth", f: (e: Experiment) => formatPercent(e.metrics.cagr) },
                        { label: "Sharpe ratio", f: (e: Experiment) => formatRatio(e.metrics.sharpe_ratio) },
                        { label: "Largest drop", f: (e: Experiment) => formatPercent(e.metrics.max_drawdown) },
                        { label: "Win rate", f: (e: Experiment) => formatPercent(e.metrics.win_rate, false, 1) },
                        { label: "Trades", f: (e: Experiment) => formatInt(e.metrics.trades_count) },
                        { label: "Settings", f: (e: Experiment) => describeParams(e.params) },
                      ].map(row => (
                        <tr key={row.label}>
                          <td className="text-ink-2">{row.label}</td>
                          {selected.map(e => (
                            <td key={e.id} className={cn("r num", row.label === "Settings" && "whitespace-normal text-xs text-ink-2")}>{row.f(e)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4">
                  <p className="mb-2 text-xs text-ink-3">Growth of 100, after costs</p>
                  <div className="h-64">
                    <ResponsiveContainer>
                      <LineChart data={overlay} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke={t.grid} />
                        <XAxis dataKey="date" {...rechartsAxis(t)} minTickGap={60} tickFormatter={shortDateTick} />
                        <YAxis {...rechartsAxis(t)} axisLine={false} domain={["auto", "auto"]} />
                        <Tooltip {...rechartsTooltip(t)} labelFormatter={formatDateLong} formatter={(v: number, id: string) => [v.toFixed(1), selected.find(e => e.id === id)?.name ?? id]} />
                        <Legend formatter={(id: string) => <span style={{ color: t.text, fontSize: 12 }}>{selected.find(e => e.id === id)?.name}</span>} iconType="plainline" />
                        {selected.map((e, i) => (
                          <Line key={e.id} type="monotone" dataKey={e.id} stroke={lineColors[i]} dot={false} strokeWidth={1.6} connectNulls isAnimationActive={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </Panel>
          )}

          <Panel flush>
            <div className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3">
              <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
                <label htmlFor="exp-search" className="sr-only">Search saved results</label>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
                <input
                  id="exp-search"
                  type="search"
                  className="tm-input pl-9"
                  placeholder="Search by name, asset or note"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              </div>
              <Select
                ariaLabel="Filter by strategy"
                value={strategyFilter}
                onChange={setStrategyFilter}
                options={[{ value: "all", label: "All strategies" }, ...strategiesPresent.map(s => ({ value: s, label: strategyName(s) }))]}
                className="w-48"
              />
              <Select<SortKey>
                ariaLabel="Sort"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "newest", label: "Newest first" },
                  { value: "oldest", label: "Oldest first" },
                  { value: "sharpe", label: "Highest Sharpe ratio" },
                  { value: "cagr", label: "Highest yearly growth" },
                  { value: "drawdown", label: "Smallest drop" },
                ]}
                className="w-52"
              />
              <span className="ml-auto text-sm text-ink-3">
                {selectedIds.length > 0 ? `${selectedIds.length} of ${MAX_COMPARE} selected for comparison` : "Tick up to 4 results to compare them"}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="tm-table">
                <thead>
                  <tr>
                    <th className="w-10"><span className="sr-only">Compare</span></th>
                    <th>Name</th>
                    <th>Strategy</th>
                    <th className="r">Yearly growth</th>
                    <th className="r">Sharpe</th>
                    <th className="r">Largest drop</th>
                    <th className="r">Trades</th>
                    <th>Saved</th>
                    <th className="r">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(exp => {
                    const isSel = selectedIds.includes(exp.id)
                    const isEditing = editingId === exp.id
                    const isOpen = openId === exp.id
                    return (
                      <tr key={exp.id} className={cn(isOpen && "[&>td]:bg-subtle")}>
                        <td>
                          <input
                            type="checkbox"
                            checked={isSel}
                            disabled={!isSel && selectedIds.length >= MAX_COMPARE}
                            onChange={() => toggleSelect(exp.id)}
                            aria-label={`Compare ${exp.name}`}
                            className="size-4 cursor-pointer accent-[rgb(var(--tm-brand))] disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="max-w-[320px] whitespace-normal">
                          {isEditing ? (
                            <form
                              className="space-y-1.5"
                              onSubmit={e => {
                                e.preventDefault()
                                if (editName.trim()) updateMutation.mutate({ id: exp.id, name: editName.trim(), notes: editNotes })
                              }}
                            >
                              <input aria-label="Name" className="tm-input h-8" value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
                              <input aria-label="Notes" className="tm-input h-8" placeholder="Add a note" value={editNotes} onChange={e => setEditNotes(e.target.value)} />
                              <div className="flex gap-1.5">
                                <Button size="sm" variant="primary" type="submit" icon={<Check />} loading={updateMutation.isPending}>Save</Button>
                                <Button size="sm" variant="ghost" icon={<X />} onClick={() => setEditingId(null)}>Cancel</Button>
                              </div>
                            </form>
                          ) : (
                            <button type="button" className="text-left" onClick={() => setOpenId(isOpen ? null : exp.id)} aria-expanded={isOpen}>
                              <span className="font-medium text-ink hover:text-brand">{exp.name}</span>
                              <span className="block text-xs text-ink-3">{exp.ticker}, {exp.adjusted ? "adjusted" : "raw"} prices</span>
                              {exp.notes && <span className="block text-xs italic text-ink-2">{exp.notes}</span>}
                            </button>
                          )}
                        </td>
                        <td>{strategyName(exp.strategy)}</td>
                        <td className={cn("r num", (exp.metrics.cagr ?? 0) >= 0 ? "text-pos" : "text-neg")}>{formatPercent(exp.metrics.cagr)}</td>
                        <td className="r num font-medium">{formatRatio(exp.metrics.sharpe_ratio)}</td>
                        <td className="r num text-neg">{formatPercent(exp.metrics.max_drawdown)}</td>
                        <td className="r num">{formatInt(exp.metrics.trades_count)}</td>
                        <td className="text-ink-2" title={new Date(exp.created_at).toLocaleString()}>{formatDateLong(exp.created_at)}</td>
                        <td className="r">
                          <div className="flex items-center justify-end gap-0.5">
                            <IconButton size="sm" label="Rename or add a note" onClick={() => startEdit(exp)}><Pencil /></IconButton>
                            <a href={api.exportExperimentUrl(exp.id, "pdf")} target="_blank" rel="noreferrer" aria-label="Download PDF report" title="Download PDF report"
                              className="inline-flex size-7 items-center justify-center rounded-md text-ink-2 hover:bg-subtle hover:text-ink [&_svg]:size-3.5">
                              <FileText />
                            </a>
                            <a href={api.exportExperimentUrl(exp.id, "csv")} download aria-label="Download trades as CSV" title="Download trades as CSV"
                              className="inline-flex size-7 items-center justify-center rounded-md text-ink-2 hover:bg-subtle hover:text-ink [&_svg]:size-3.5">
                              <FileSpreadsheet />
                            </a>
                            <IconButton size="sm" label="Duplicate" onClick={() => duplicateMutation.mutate(exp.id)} disabled={duplicateMutation.isPending}><Copy /></IconButton>
                            <IconButton size="sm" label="Delete" className="hover:text-neg" onClick={() => setConfirmDelete(exp)}><Trash2 /></IconButton>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {list.length === 0 && (
                    <tr><td colSpan={9} className="py-8 text-center text-ink-3">No saved results match your search.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          {openId && (
            <Panel
              className="mt-4"
              title={open?.name ?? "Loading…"}
              description={open ? `${strategyName(open.strategy)} on ${open.ticker}. ${describeParams(open.params)}.` : undefined}
              actions={<Button size="sm" variant="ghost" icon={<X />} onClick={() => setOpenId(null)}>Close</Button>}
            >
              {detail.isLoading && <LoadingState variant="panel" message="Loading details…" />}
              {detail.error && <ErrorState error={detail.error} onRetry={() => detail.refetch()} />}
              {open && (
                <div className="space-y-4">
                  {open.reproducibility &&
                    (open.reproducibility.fingerprint_matches ? (
                      <Alert tone="success" title="Same data as today">
                        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5" aria-hidden="true" /> The dataset still matches the one this result was made with, so re-running it will give the same numbers.</span>
                      </Alert>
                    ) : (
                      <Alert tone="warning" title="The data has changed">
                        <span className="inline-flex items-center gap-1.5"><ShieldAlert className="size-3.5" aria-hidden="true" /> {open.reproducibility.warning} Re-running may give different numbers.</span>
                      </Alert>
                    ))}
                  <dl className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                    <Stat label="Starting amount" value={formatPrice(open.initial_capital)} />
                    <Stat label="Total return" value={formatPercent(open.metrics.total_return)} tone={(open.metrics.total_return ?? 0) >= 0 ? "pos" : "neg"} />
                    <Stat label="Yearly growth" value={formatPercent(open.metrics.cagr)} />
                    <Stat label="Sharpe ratio" value={formatRatio(open.metrics.sharpe_ratio)} />
                    <Stat label="Largest drop" value={formatPercent(open.metrics.max_drawdown)} tone="neg" />
                    <Stat label="Costs" value={`${open.costs?.total_bps ?? "—"} bps`} sub="Commission plus slippage" />
                  </dl>
                  {open.equity_curve.length > 0 && (
                    <EquityChart data={open.equity_curve} benchmarkData={buyAndHoldFromCurve(open.equity_curve)} height={280} />
                  )}
                  <p className="text-xs text-ink-3">
                    Saved {new Date(open.created_at).toLocaleString()}. Data fingerprint <span className="font-mono">{open.dataset_fingerprint.slice(0, 16)}</span>. App version {open.app_version}.{" "}
                    {open.equity_curve.length > 0 && <Badge variant="neutral">{formatInt(open.equity_curve.length)} days</Badge>}
                  </p>
                </div>
              )}
            </Panel>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete this result?"
        description={confirmDelete ? `"${confirmDelete.name}" will be removed from your history. This can't be undone.` : undefined}
        confirmLabel="Delete"
        tone="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
