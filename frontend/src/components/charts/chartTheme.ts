import { useMemo } from "react"
import { useDataset } from "../../hooks/useDataset"

export interface ChartTheme {
  isDark: boolean
  bg: string
  text: string
  textStrong: string
  grid: string
  axis: string
  crosshair: string
  primary: string
  secondary: string
  benchmark: string
  pos: string
  neg: string
  fontFamily: string
  tooltipBg: string
  tooltipBorder: string
}

/** Hex colours for charts, kept in step with the CSS tokens in index.css. */
export function getChartTheme(isDark: boolean): ChartTheme {
  return isDark
    ? {
        isDark,
        bg: "#092136",
        text: "#8497A6",
        textStrong: "#E7ECEF",
        grid: "rgba(46, 78, 104, 0.45)",
        axis: "#2E4E68",
        crosshair: "#5E7A90",
        primary: "#2F9D94",
        secondary: "#7FB8BF",
        benchmark: "#A8B8C4",
        pos: "#56C0B5",
        neg: "#E08480",
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
        tooltipBg: "#0D2B43",
        tooltipBorder: "#2E4E68",
      }
    : {
        isDark,
        bg: "#FFFFFF",
        text: "#687784",
        textStrong: "#0A233A",
        grid: "rgba(188, 197, 204, 0.38)",
        axis: "#BCC5CC",
        crosshair: "#97A4AE",
        primary: "#025F67",
        secondary: "#2F9D94",
        benchmark: "#063154",
        pos: "#16756C",
        neg: "#A84C4C",
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
        tooltipBg: "#FFFFFF",
        tooltipBorder: "#DEE2E5",
      }
}

export function useChartTheme(): ChartTheme {
  const { theme } = useDataset()
  return useMemo(() => getChartTheme(theme === "dark"), [theme])
}

/** Shared Recharts props so every chart looks the same. */
export function rechartsAxis(t: ChartTheme) {
  return {
    tick: { fill: t.text, fontSize: 11, fontFamily: t.fontFamily },
    axisLine: { stroke: t.axis },
    tickLine: false as const,
  }
}

export function rechartsTooltip(t: ChartTheme) {
  return {
    contentStyle: {
      backgroundColor: t.tooltipBg,
      border: `1px solid ${t.tooltipBorder}`,
      borderRadius: 6,
      fontSize: 12,
      fontFamily: t.fontFamily,
      color: t.textStrong,
      boxShadow: "0 6px 18px -6px rgba(6,49,84,0.25)",
      padding: "8px 10px",
    },
    labelStyle: { color: t.text, marginBottom: 4, fontSize: 11 },
    itemStyle: { padding: 0, color: t.textStrong },
    cursor: { stroke: t.crosshair, strokeDasharray: "3 3" },
  }
}

/** "2019-03-14" -> "Mar 2019" for axis ticks */
export function shortDateTick(v: string): string {
  if (!v || v.length < 7) return v
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${months[Number(v.slice(5, 7)) - 1]} ${v.slice(0, 4)}`
}
