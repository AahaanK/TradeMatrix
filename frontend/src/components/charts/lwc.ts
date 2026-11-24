import {
  ColorType,
  CrosshairMode,
  createChart,
  type DeepPartial,
  type ChartOptions,
  type IChartApi,
  LineStyle,
} from "lightweight-charts"
import type { ChartTheme } from "./chartTheme"

/** Creates a Lightweight Chart with TradeMatrix styling. */
export function createBaseChart(
  container: HTMLElement,
  t: ChartTheme,
  height: number,
  extra: DeepPartial<ChartOptions> = {}
): IChartApi {
  return createChart(container, {
    width: container.clientWidth,
    height,
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: t.text,
      fontFamily: t.fontFamily,
      fontSize: 11,
    },
    grid: {
      vertLines: { visible: false },
      horzLines: { color: t.grid },
    },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.06 } },
    leftPriceScale: { visible: false },
    timeScale: { borderColor: t.axis, rightOffset: 2, minBarSpacing: 0.05, fixLeftEdge: true, fixRightEdge: true },
    crosshair: {
      mode: CrosshairMode.Magnet,
      vertLine: { color: t.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: t.benchmark },
      horzLine: { color: t.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: t.benchmark },
    },
    handleScale: { axisPressedMouseMove: { time: true, price: false } },
    localization: { locale: "en-US" },
    ...extra,
  })
}

/** Resize a chart with its container (works for sidebars/panels, not just window). */
export function observeWidth(container: HTMLElement, chart: IChartApi): () => void {
  const ro = new ResizeObserver(entries => {
    const w = Math.floor(entries[0].contentRect.width)
    if (w > 0) chart.applyOptions({ width: w })
  })
  ro.observe(container)
  return () => ro.disconnect()
}

export type RangeKey = "1Y" | "3Y" | "5Y" | "ALL"

/** Zoom the time axis to the last N years of the given (sorted) dates. */
export function applyRange(chart: IChartApi, dates: string[], range: RangeKey) {
  if (dates.length === 0) return
  if (range === "ALL") {
    chart.timeScale().fitContent()
    return
  }
  const years = range === "1Y" ? 1 : range === "3Y" ? 3 : 5
  const last = dates[dates.length - 1]
  const from = `${Number(last.slice(0, 4)) - years}${last.slice(4, 10)}`
  const start = dates.find(d => d >= from) ?? dates[0]
  chart.timeScale().setVisibleRange({ from: start as never, to: last as never })
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "")
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export function simpleMovingAverage(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}
