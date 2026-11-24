import React, { useEffect, useMemo, useRef, useState } from "react"
import type { IChartApi, SeriesMarker, Time } from "lightweight-charts"
import { useChartTheme } from "./chartTheme"
import { applyRange, createBaseChart, hexToRgba, observeWidth, simpleMovingAverage, type RangeKey } from "./lwc"
import { LegendItem, RangeButtons } from "./RangeButtons"
import { SegmentedControl, Switch } from "../ui/Controls"
import { REGIME_ORDER, formatDateLong, formatPrice, formatVolume, regimeColor, regimeName } from "../../utils/format"
import { cn } from "../../utils/cn"

export interface PriceBar {
  date: string
  close: number
  open?: number
  high?: number
  low?: number
  volume?: number
  regime?: string
}

export interface ChartTrade {
  entry_date: string
  entry_price: number
  exit_date: string
  exit_price: number
  direction: string
  is_open: boolean
}

interface PriceChartProps {
  data: PriceBar[]
  trades?: ChartTrade[]
  height?: number
  /** Shade the background by market condition (needs `regime` on each bar) */
  showRegimeBands?: boolean
  /** Show the built-in toolbar (period, chart type, overlays) */
  controls?: boolean
  defaultType?: "area" | "candles" | "line"
  defaultRange?: RangeKey
  className?: string
  ariaLabel?: string
}

const NO_TRADES: ChartTrade[] = []

export const PriceChart: React.FC<PriceChartProps> = ({
  data,
  trades = NO_TRADES,
  height = 360,
  showRegimeBands = true,
  controls = false,
  defaultType = "area",
  defaultRange = "ALL",
  className,
  ariaLabel = "Price chart",
}) => {
  const t = useChartTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const [range, setRange] = useState<RangeKey>(defaultRange)
  const [type, setType] = useState<"area" | "candles" | "line">(defaultType)
  const [showAverages, setShowAverages] = useState(false)
  const [showVolume, setShowVolume] = useState(false)
  const [bandsOn, setBandsOn] = useState(true)
  const [hover, setHover] = useState<PriceBar | null>(null)

  const hasOhlc = data.length > 0 && data[0].open !== undefined && data[0].high !== undefined
  const hasVolume = data.length > 0 && data[0].volume !== undefined
  const hasRegimes = data.some(d => d.regime)
  const drawBands = showRegimeBands && hasRegimes && bandsOn

  const byDate = useMemo(() => {
    const m = new Map<string, PriceBar>()
    data.forEach(d => m.set(d.date, d))
    return m
  }, [data])
  const dates = useMemo(() => data.map(d => d.date), [data])

  useEffect(() => {
    const el = containerRef.current
    if (!el || data.length === 0) return
    const chart = createBaseChart(el, t, height, {
      localization: { locale: "en-US", priceFormatter: (v: number) => `$${v.toFixed(2)}` },
    })
    chartRef.current = chart

    // 1. Market-condition background bands (drawn first so they sit behind price)
    if (drawBands) {
      const bands = chart.addHistogramSeries({
        priceScaleId: "bands",
        priceLineVisible: false,
        lastValueVisible: false,
        base: 0,
      })
      chart.priceScale("bands").applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false })
      bands.setData(
        data.map(d => ({
          time: d.date as Time,
          value: 1,
          color: d.regime && d.regime !== "Undefined" ? hexToRgba(regimeColor(d.regime, t.isDark), t.isDark ? 0.2 : 0.16) : "rgba(0,0,0,0)",
        }))
      )
    }

    // 2. Volume
    if (showVolume && hasVolume) {
      const vol = chart.addHistogramSeries({
        priceScaleId: "vol",
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        lastValueVisible: false,
      })
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false })
      vol.setData(
        data.map((d, i) => ({
          time: d.date as Time,
          value: d.volume ?? 0,
          color: hexToRgba(i > 0 && d.close < data[i - 1].close ? t.neg : t.secondary, 0.35),
        }))
      )
    }

    // 3. Price
    let main
    if (type === "candles" && hasOhlc) {
      main = chart.addCandlestickSeries({
        upColor: t.pos,
        downColor: t.neg,
        borderUpColor: t.pos,
        borderDownColor: t.neg,
        wickUpColor: t.pos,
        wickDownColor: t.neg,
        priceLineVisible: false,
      })
      main.setData(data.map(d => ({ time: d.date as Time, open: d.open!, high: d.high!, low: d.low!, close: d.close })))
    } else if (type === "line" || drawBands) {
      // A plain line keeps the coloured bands readable
      main = chart.addLineSeries({ color: t.primary, lineWidth: 2, priceLineVisible: false })
      main.setData(data.map(d => ({ time: d.date as Time, value: d.close })))
    } else {
      main = chart.addAreaSeries({
        lineColor: t.primary,
        topColor: hexToRgba(t.primary, t.isDark ? 0.28 : 0.16),
        bottomColor: hexToRgba(t.primary, 0),
        lineWidth: 2,
        priceLineVisible: false,
      })
      main.setData(data.map(d => ({ time: d.date as Time, value: d.close })))
    }

    // 4. Moving averages
    if (showAverages) {
      const closes = data.map(d => d.close)
      ;[
        { period: 50, color: t.secondary },
        { period: 200, color: t.benchmark },
      ].forEach(({ period, color }) => {
        const sma = simpleMovingAverage(closes, period)
        const s = chart.addLineSeries({
          color,
          lineWidth: 1,
          lineStyle: period === 200 ? 2 : 0,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })
        s.setData(
          data
            .map((d, i) => (sma[i] === null ? null : { time: d.date as Time, value: sma[i] as number }))
            .filter(Boolean) as { time: Time; value: number }[]
        )
      })
    }

    // 5. Trade markers
    if (trades.length > 0) {
      const markers: SeriesMarker<Time>[] = []
      trades.forEach(tr => {
        const long = tr.direction === "long"
        markers.push({
          time: tr.entry_date as Time,
          position: long ? "belowBar" : "aboveBar",
          color: t.pos,
          shape: long ? "arrowUp" : "arrowDown",
          text: long ? "Buy" : "Short",
        })
        if (!tr.is_open) {
          markers.push({
            time: tr.exit_date as Time,
            position: long ? "aboveBar" : "belowBar",
            color: t.neg,
            shape: long ? "arrowDown" : "arrowUp",
            text: "Exit",
          })
        }
      })
      markers.sort((a, b) => ((a.time as string) > (b.time as string) ? 1 : -1))
      main.setMarkers(trades.length > 60 ? markers.map(m => ({ ...m, text: "" })) : markers)
    }

    chart.subscribeCrosshairMove(param => {
      if (!param.time) {
        setHover(null)
        return
      }
      setHover(byDate.get(param.time as string) ?? null)
    })

    applyRange(chart, dates, range)
    const stop = observeWidth(el, chart)
    return () => {
      stop()
      chart.remove()
      chartRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, trades, height, t, type, showAverages, showVolume, drawBands])

  useEffect(() => {
    if (chartRef.current) applyRange(chartRef.current, dates, range)
  }, [range, dates])

  const shown = hover ?? data[data.length - 1]
  const prev = shown ? data[data.findIndex(d => d.date === shown.date) - 1] : undefined
  const change = shown && prev ? shown.close / prev.close - 1 : null

  return (
    <div className={cn("w-full", className)}>
      {controls && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <RangeButtons value={range} onChange={setRange} />
            {hasOhlc && (
              <SegmentedControl<"area" | "line" | "candles">
                size="sm"
                ariaLabel="Chart type"
                value={type}
                onChange={setType}
                options={[
                  { value: "area", label: "Area" },
                  { value: "line", label: "Line" },
                  { value: "candles", label: "Candles" },
                ]}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Switch checked={showAverages} onChange={setShowAverages} label="50 and 200-day averages" labelClassName="text-xs" />
            {hasVolume && <Switch checked={showVolume} onChange={setShowVolume} label="Volume" labelClassName="text-xs" />}
            {showRegimeBands && hasRegimes && (
              <Switch checked={bandsOn} onChange={setBandsOn} label="Market conditions" labelClassName="text-xs" />
            )}
          </div>
        </div>
      )}

      {/* Readout for the bar under the cursor (or the latest bar) */}
      {shown && (
        <div className="mb-2 flex min-h-[20px] flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-ink-2" aria-live="off">
          <span className="font-medium text-ink">{formatDateLong(shown.date)}</span>
          {type === "candles" && shown.open !== undefined ? (
            <>
              <span>Open <span className="num text-ink">{formatPrice(shown.open)}</span></span>
              <span>High <span className="num text-ink">{formatPrice(shown.high)}</span></span>
              <span>Low <span className="num text-ink">{formatPrice(shown.low)}</span></span>
              <span>Close <span className="num text-ink">{formatPrice(shown.close)}</span></span>
            </>
          ) : (
            <span>Close <span className="num font-medium text-ink">{formatPrice(shown.close)}</span></span>
          )}
          {change !== null && (
            <span className={cn("num", change >= 0 ? "text-pos" : "text-neg")}>
              {change >= 0 ? "+" : "−"}
              {Math.abs(change * 100).toFixed(2)}%
            </span>
          )}
          {showVolume && shown.volume !== undefined && <span>Volume <span className="num text-ink">{formatVolume(shown.volume)}</span></span>}
          {shown.regime && drawBands && <span>{regimeName(shown.regime)}</span>}
        </div>
      )}

      <div ref={containerRef} role="img" aria-label={ariaLabel} className="w-full" style={{ height }} />

      {(drawBands || showAverages || trades.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {drawBands &&
            REGIME_ORDER.map(r => (
              <span key={r} className="inline-flex items-center gap-1.5 text-xs text-ink-2">
                <span className="inline-block size-2.5 rounded-[2px]" style={{ backgroundColor: hexToRgba(regimeColor(r, t.isDark), 0.55) }} />
                {regimeName(r)}
              </span>
            ))}
          {showAverages && (
            <>
              <LegendItem color={t.secondary} label="50-day average" />
              <LegendItem color={t.benchmark} label="200-day average" dashed />
            </>
          )}
          {trades.length > 0 && (
            <>
              <span className="inline-flex items-center gap-1 text-xs text-ink-2"><span style={{ color: t.pos }}>▲</span> Buy</span>
              <span className="inline-flex items-center gap-1 text-xs text-ink-2"><span style={{ color: t.neg }}>▼</span> Exit</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
