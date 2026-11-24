import React, { useMemo, useRef, useState } from "react"
import history from "./spyHistory.json"
import { REGIME_ORDER, formatDateLong, formatPrice, regimeColor, regimeName } from "../../utils/format"
import { useDataset } from "../../hooks/useDataset"

type Segment = { s: string; e: string; r: string }

const W = 1200
const H = 260
const PAD = { top: 16, right: 12, bottom: 28, left: 12 }

const toTime = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))

/**
 * Ten years of SPY, drawn from the real bundled dataset: weekly closes as a line,
 * with the background coloured by the market condition TradeMatrix assigned each day.
 */
export const HistoryRibbon: React.FC = () => {
  const { theme } = useDataset()
  const dark = theme === "dark"
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const weekly = history.weekly as [string, number][]
  const segments = history.segments as Segment[]

  const geo = useMemo(() => {
    const t0 = toTime(weekly[0][0])
    const t1 = toTime(weekly[weekly.length - 1][0])
    const closes = weekly.map(w => w[1])
    const lo = Math.min(...closes) * 0.94
    const hi = Math.max(...closes) * 1.03
    const x = (d: string) => PAD.left + ((toTime(d) - t0) / (t1 - t0)) * (W - PAD.left - PAD.right)
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom)
    const path = weekly.map((w, i) => `${i ? "L" : "M"}${x(w[0]).toFixed(1)},${y(w[1]).toFixed(1)}`).join("")
    const years: { label: string; x: number }[] = []
    for (let yr = +weekly[0][0].slice(0, 4); yr <= +weekly[weekly.length - 1][0].slice(0, 4); yr++) {
      years.push({ label: String(yr), x: x(`${yr}-01-01` < weekly[0][0] ? weekly[0][0] : `${yr}-01-01`) })
    }
    return { x, y, path, years }
  }, [weekly])

  const regimeAt = (d: string) => segments.find(s => s.s <= d && d <= s.e)?.r ?? "Undefined"

  const onMove = (e: React.PointerEvent) => {
    const svg = ref.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    let bestDist = Infinity
    weekly.forEach((w, i) => {
      const dx = Math.abs(geo.x(w[0]) - px)
      if (dx < bestDist) {
        bestDist = dx
        best = i
      }
    })
    setHover(best)
  }

  const h = hover !== null ? weekly[hover] : null
  const dist = history.distribution as Record<string, { percentage: number }>

  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full touch-none select-none"
          role="img"
          aria-label="SPY weekly closing price from 2014 to 2023, shaded by market condition"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {segments.map((s, i) => {
            if (s.r === "Undefined") return null
            const x1 = geo.x(s.s)
            const x2 = Math.max(geo.x(s.e), x1 + 1)
            return (
              <rect key={i} x={x1} y={PAD.top} width={x2 - x1} height={H - PAD.top - PAD.bottom} fill={regimeColor(s.r, dark)} fillOpacity={dark ? 0.32 : 0.22} />
            )
          })}
          {geo.years.map(yr => (
            <g key={yr.label}>
              <line x1={yr.x} x2={yr.x} y1={PAD.top} y2={H - PAD.bottom} stroke={dark ? "#2E4E68" : "#BCC5CC"} strokeWidth={0.6} />
              <text x={yr.x + 4} y={H - 10} fontSize={12} fill={dark ? "#8497A6" : "#687784"} fontFamily="IBM Plex Sans">
                {yr.label}
              </text>
            </g>
          ))}
          <path d={geo.path} fill="none" stroke={dark ? "#E7ECEF" : "#063154"} strokeWidth={1.75} strokeLinejoin="round" />
          {h && (
            <g>
              <line x1={geo.x(h[0])} x2={geo.x(h[0])} y1={PAD.top} y2={H - PAD.bottom} stroke={dark ? "#E7ECEF" : "#063154"} strokeOpacity={0.5} strokeDasharray="3 3" />
              <circle cx={geo.x(h[0])} cy={geo.y(h[1])} r={4} fill={dark ? "#E7ECEF" : "#063154"} stroke={dark ? "#051829" : "#F7F6F2"} strokeWidth={2} />
            </g>
          )}
        </svg>
        {h && (
          <div
            className="pointer-events-none absolute top-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-pop"
            style={{
              left: `${(geo.x(h[0]) / W) * 100}%`,
              transform: `translateX(${geo.x(h[0]) > W * 0.7 ? "calc(-100% - 10px)" : "10px"})`,
            }}
          >
            <div className="font-medium text-ink">Week to {formatDateLong(h[0])}</div>
            <div className="text-ink-2">
              Close <span className="num text-ink">{formatPrice(h[1])}</span>, {regimeName(regimeAt(h[0])).toLowerCase()}
            </div>
          </div>
        )}
      </div>
      <figcaption className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-2">
        {REGIME_ORDER.map(r => (
          <span key={r} className="inline-flex items-center gap-2">
            <span className="inline-block size-3 rounded-[2px]" style={{ backgroundColor: regimeColor(r, dark), opacity: 0.75 }} aria-hidden="true" />
            {regimeName(r)} <span className="num text-ink-3">{Math.round((dist[r]?.percentage ?? 0) * 100)}% of days</span>
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
