import React, { useEffect, useMemo, useRef, useState } from "react"
import { LineStyle, PriceScaleMode, type IChartApi, type Time } from "lightweight-charts"
import { useChartTheme } from "./chartTheme"
import { applyRange, createBaseChart, hexToRgba, observeWidth, type RangeKey } from "./lwc"
import { LegendItem, RangeButtons } from "./RangeButtons"
import { Switch } from "../ui/Controls"
import { EquityPoint } from "../../types"
import { formatDateLong, formatPrice } from "../../utils/format"
import { cn } from "../../utils/cn"

interface EquityChartProps {
  data: EquityPoint[]
  /** Optional comparison line; values must already be in dollars */
  benchmarkData?: Array<{ date: string; value: number }>
  benchmarkLabel?: string
  height?: number
  title?: React.ReactNode
  controls?: boolean
  className?: string
}

const NO_BENCH: Array<{ date: string; value: number }> = []

/**
 * Account value over time, after costs, with optional before-costs line and benchmark.
 */
export const EquityChart: React.FC<EquityChartProps> = ({
  data,
  benchmarkData = NO_BENCH,
  benchmarkLabel = "Buy and hold",
  height = 360,
  controls = true,
  className,
}) => {
  const t = useChartTheme()
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const [logScale, setLogScale] = useState(false)
  const [showGross, setShowGross] = useState(false)
  const [showBench, setShowBench] = useState(true)
  const [range, setRange] = useState<RangeKey>("ALL")
  const [hoverDate, setHoverDate] = useState<string | null>(null)

  const dates = useMemo(() => data.map(d => d.date), [data])
  const benchByDate = useMemo(() => new Map(benchmarkData.map(b => [b.date, b.value])), [benchmarkData])
  const pointByDate = useMemo(() => new Map(data.map(d => [d.date, d])), [data])

  useEffect(() => {
    const el = ref.current
    if (!el || data.length === 0) return
    const chart = createBaseChart(el, t, height, {
      rightPriceScale: {
        borderVisible: false,
        mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
        scaleMargins: { top: 0.08, bottom: 0.06 },
      },
      localization: {
        locale: "en-US",
        priceFormatter: (v: number) => `$${Math.round(v).toLocaleString("en-US")}`,
      },
    })
    chartRef.current = chart

    if (showBench && benchmarkData.length > 0) {
      const bm = chart.addLineSeries({
        color: hexToRgba(t.benchmark, t.isDark ? 0.75 : 0.6),
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      bm.setData(benchmarkData.map(d => ({ time: d.date as Time, value: d.value })))
    }

    if (showGross) {
      const gross = chart.addLineSeries({
        color: t.secondary,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      gross.setData(data.map(d => ({ time: d.date as Time, value: d.gross_equity })))
    }

    const net = chart.addAreaSeries({
      lineColor: t.primary,
      topColor: hexToRgba(t.primary, t.isDark ? 0.22 : 0.12),
      bottomColor: hexToRgba(t.primary, 0),
      lineWidth: 2,
      priceLineVisible: false,
    })
    net.setData(data.map(d => ({ time: d.date as Time, value: d.net_equity })))

    chart.subscribeCrosshairMove(p => setHoverDate(p.time ? (p.time as string) : null))
    applyRange(chart, dates, range)
    const stop = observeWidth(el, chart)
    return () => {
      stop()
      chart.remove()
      chartRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, benchmarkData, height, t, logScale, showGross, showBench])

  useEffect(() => {
    if (chartRef.current) applyRange(chartRef.current, dates, range)
  }, [range, dates])

  const date = hoverDate ?? dates[dates.length - 1]
  const point = date ? pointByDate.get(date) : undefined
  const bench = date ? benchByDate.get(date) : undefined

  return (
    <div className={cn("w-full", className)}>
      {controls && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <RangeButtons value={range} onChange={setRange} />
          <div className="flex flex-wrap items-center gap-4">
            {benchmarkData.length > 0 && (
              <Switch checked={showBench} onChange={setShowBench} label={benchmarkLabel} labelClassName="text-xs" />
            )}
            <Switch checked={showGross} onChange={setShowGross} label="Before costs" labelClassName="text-xs" />
            <Switch
              checked={logScale}
              onChange={setLogScale}
              label="Log scale"
              labelClassName="text-xs"
            />
          </div>
        </div>
      )}

      <div className="mb-2 flex min-h-[20px] flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-xs font-medium text-ink">{formatDateLong(date)}</span>
        <LegendItem color={t.primary} label="Strategy, after costs" value={point ? formatPrice(point.net_equity) : "—"} />
        {showGross && <LegendItem color={t.secondary} dashed label="Before costs" value={point ? formatPrice(point.gross_equity) : "—"} />}
        {showBench && benchmarkData.length > 0 && (
          <LegendItem color={hexToRgba(t.benchmark, 0.7)} label={benchmarkLabel} value={bench !== undefined ? formatPrice(bench) : "—"} />
        )}
      </div>

      <div ref={ref} role="img" aria-label="Account value over time" className="w-full" style={{ height }} />
    </div>
  )
}

/** Build a buy-and-hold line in dollars from an equity curve's close prices. */
export function buyAndHoldFromCurve(curve: EquityPoint[]): Array<{ date: string; value: number }> {
  if (curve.length === 0) return []
  const start = curve[0].net_equity
  const p0 = curve[0].close
  return curve.map(c => ({ date: c.date, value: (start * c.close) / p0 }))
}
