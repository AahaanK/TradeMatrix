import React, { useEffect, useMemo, useRef, useState } from "react"
import type { Time } from "lightweight-charts"
import { useChartTheme } from "./chartTheme"
import { createBaseChart, hexToRgba, observeWidth } from "./lwc"
import { EquityPoint } from "../../types"
import { formatDateLong } from "../../utils/format"

interface DrawdownChartProps {
  data: EquityPoint[]
  height?: number
}

/** "Underwater" chart: how far below its previous high the account was on each day. */
export const DrawdownChart: React.FC<DrawdownChartProps> = ({ data, height = 180 }) => {
  const t = useChartTheme()
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<string | null>(null)

  const worst = useMemo(() => {
    let w = { date: "", value: 0 }
    data.forEach(d => {
      if (d.drawdown < w.value) w = { date: d.date, value: d.drawdown }
    })
    return w
  }, [data])
  const byDate = useMemo(() => new Map(data.map(d => [d.date, d.drawdown])), [data])

  useEffect(() => {
    const el = ref.current
    if (!el || data.length === 0) return
    const chart = createBaseChart(el, t, height, {
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.05, bottom: 0.02 } },
    })
    const s = chart.addAreaSeries({
      lineColor: t.neg,
      topColor: hexToRgba(t.neg, 0.06),
      bottomColor: hexToRgba(t.neg, t.isDark ? 0.35 : 0.25),
      lineWidth: 1,
      invertFilledArea: true,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: "custom", formatter: (v: number) => `${v.toFixed(0)}%` },
    })
    s.setData(data.map(d => ({ time: d.date as Time, value: d.drawdown * 100 })))
    chart.timeScale().fitContent()
    chart.subscribeCrosshairMove(p => setHover(p.time ? (p.time as string) : null))
    const stop = observeWidth(el, chart)
    return () => {
      stop()
      chart.remove()
    }
  }, [data, height, t])

  const current = hover ? byDate.get(hover) : data[data.length - 1]?.drawdown

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
        <span>
          {hover ? formatDateLong(hover) : "Latest"}:{" "}
          <span className="num font-medium text-ink">{current !== undefined ? `${(current * 100).toFixed(2)}%`.replace("-", "−") : "—"}</span>
        </span>
        <span>
          Worst: <span className="num font-medium text-neg">{(worst.value * 100).toFixed(2).replace("-", "−")}%</span>
          {worst.date && <span className="text-ink-3"> on {formatDateLong(worst.date)}</span>}
        </span>
      </div>
      <div ref={ref} role="img" aria-label="Drawdown chart" style={{ height }} />
    </div>
  )
}
