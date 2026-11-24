/* ------------------------------------------------------------------ */
/* Number formatting                                                  */
/* ------------------------------------------------------------------ */

const isMissing = (v: unknown): v is null | undefined => v === null || v === undefined || Number.isNaN(v as number)

/** 0.1234 -> "+12.34%". Uses a true minus sign for negatives. */
export function formatPercent(val: number | null | undefined, includeSign = true, decimals = 2): string {
  if (isMissing(val)) return "—"
  const pct = val * 100
  const sign = includeSign && pct > 0 ? "+" : ""
  return `${sign}${pct.toFixed(decimals)}%`.replace("-", "−")
}

/** A loss magnitude (stored as a positive number) shown as a negative percent. */
export function formatLoss(val: number | null | undefined, decimals = 2): string {
  if (isMissing(val)) return "—"
  return formatPercent(-Math.abs(val), false, decimals)
}

export function formatRatio(val: number | null | undefined, decimals = 2): string {
  if (isMissing(val)) return "—"
  return val.toFixed(decimals).replace("-", "−")
}

export function formatNumber(val: number | null | undefined, decimals = 2): string {
  if (isMissing(val)) return "—"
  return val
    .toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    .replace("-", "−")
}

export function formatInt(val: number | null | undefined): string {
  if (isMissing(val)) return "—"
  return Math.round(val).toLocaleString("en-US")
}

export function formatPrice(val: number | null | undefined): string {
  if (isMissing(val)) return "—"
  const s = Math.abs(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return val < 0 ? `−$${s}` : `$${s}`
}

export const formatCurrency = formatPrice

/** $1,234,567 -> "$1.23M" */
export function formatCompactCurrency(val: number | null | undefined): string {
  if (isMissing(val)) return "—"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(val)
}

export function formatVolume(val: number | null | undefined): string {
  if (isMissing(val)) return "—"
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(val)
}

export function formatDate(val: string | null | undefined): string {
  if (!val) return "—"
  return val.slice(0, 10)
}

/** "2023-12-29" -> "29 Dec 2023" (timezone-safe) */
export function formatDateLong(val: string | null | undefined): string {
  if (!val) return "—"
  const [y, m, d] = val.slice(0, 10).split("-").map(Number)
  if (!y || !m || !d) return val
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${d} ${months[m - 1]} ${y}`
}

/** Trading days -> rough human duration ("about 2.8 years") */
export function describeBars(bars: number | null | undefined, perYear = 252): string {
  if (isMissing(bars)) return "—"
  if (bars < 21) return `${bars} trading ${bars === 1 ? "day" : "days"}`
  if (bars < perYear) {
    const m = Math.round(bars / 21)
    return `${m} ${m === 1 ? "month" : "months"}`
  }
  return `${(bars / perYear).toFixed(1)} years`
}

/** {lookback: 63, threshold: 0} -> "Lookback 63, Threshold 0" */
export function describeParams(params: Record<string, unknown> | null | undefined): string {
  if (!params) return "—"
  const entries = Object.entries(params).filter(([, v]) => v !== null && v !== undefined)
  if (entries.length === 0) return "Default settings"
  return entries.map(([k, v]) => `${PARAM_LABELS[k] ?? k.replace(/_/g, " ")} ${describeValue(k, v)}`).join(", ")
}

const VALUE_LABELS: Record<string, string> = {
  long_flat: "buy or cash",
  long_short: "buy or short",
  daily: "daily",
  weekly: "weekly",
  monthly: "monthly",
}

function describeValue(key: string, v: unknown): string {
  if (Array.isArray(v)) return v.map(x => regimeName(String(x)).toLowerCase()).join(" / ")
  if (typeof v === "string") return VALUE_LABELS[v] ?? v
  if (typeof v === "number") {
    if (key === "threshold" || key === "volatility_cap" || key === "volatility_filter")
      return `${+(v * 100).toFixed(2)}%`.replace("-", "−")
    if (["lookback", "trend_filter_sma", "max_holding_period", "fast", "slow"].includes(key)) return `${v} days`
    return String(v).replace("-", "−")
  }
  return String(v)
}

export const PARAM_LABELS: Record<string, string> = {
  lookback: "Lookback",
  threshold: "Threshold",
  rebalance: "checked",
  trend_filter_sma: "Trend filter",
  mode: "Mode",
  entry_z: "Entry z",
  exit_z: "Exit z",
  max_holding_period: "Max hold",
  volatility_cap: "Vol cap",
  fast: "Fast MA",
  slow: "Slow MA",
  volatility_filter: "Vol filter",
  allowed_regimes: "Conditions",
}

/* ------------------------------------------------------------------ */
/* Market conditions ("regimes")                                      */
/* ------------------------------------------------------------------ */

export type RegimeLabel = "Bull/Low Vol" | "Bull/High Vol" | "Bear/Low Vol" | "Bear/High Vol" | "Undefined"

export const REGIME_ORDER: Exclude<RegimeLabel, "Undefined">[] = [
  "Bull/Low Vol",
  "Bull/High Vol",
  "Bear/Low Vol",
  "Bear/High Vol",
]

/**
 * Friendly names and colours for each market condition.
 * `label` is the value the API uses and must be sent back unchanged.
 */
export const REGIME_META: Record<
  RegimeLabel,
  { name: string; short: string; description: string; color: string; darkColor: string }
> = {
  "Bull/Low Vol": {
    name: "Calm uptrend",
    short: "Calm up",
    description:
      "Price is above its 200-day average and higher than 3 months ago, and daily swings are smaller than usual.",
    color: "#2F9D94",
    darkColor: "#2F9D94",
  },
  "Bull/High Vol": {
    name: "Volatile uptrend",
    short: "Volatile up",
    description: "Price is still in an uptrend, but daily swings are larger than usual.",
    color: "#025F67",
    darkColor: "#5FA8B0",
  },
  "Bear/Low Vol": {
    name: "Calm downtrend",
    short: "Calm down",
    description:
      "The uptrend test fails (price below its 200-day average or lower than 3 months ago), with normal or small swings.",
    color: "#97A4AE",
    darkColor: "#8B9AA6",
  },
  "Bear/High Vol": {
    name: "Volatile downtrend",
    short: "Volatile down",
    description: "The uptrend test fails and daily swings are larger than usual. Historically the riskiest state.",
    color: "#B65A5A",
    darkColor: "#D57D79",
  },
  Undefined: {
    name: "Not enough history",
    short: "Warm-up",
    description: "The first year of data is used to learn what 'normal' volatility looks like, so no label is given.",
    color: "#C9CFD4",
    darkColor: "#3A5367",
  },
}

export function regimeMeta(label: string | null | undefined) {
  return REGIME_META[(label as RegimeLabel) ?? "Undefined"] ?? REGIME_META.Undefined
}

export function regimeName(label: string | null | undefined): string {
  return regimeMeta(label).name
}

export function regimeColor(label: string | null | undefined, dark = false): string {
  const m = regimeMeta(label)
  return dark ? m.darkColor : m.color
}

/** @deprecated kept for older imports; prefer REGIME_META */
export const REGIME_COLORS = Object.fromEntries(
  Object.entries(REGIME_META).map(([k, v]) => [k, { solid: v.color, border: v.color, text: v.color, bg: `${v.color}26` }])
) as Record<RegimeLabel, { solid: string; border: string; text: string; bg: string }>

/* ------------------------------------------------------------------ */
/* Strategies                                                         */
/* ------------------------------------------------------------------ */

export type StrategyId = "momentum" | "mean_reversion" | "ma_crossover" | "buy_and_hold"

export const STRATEGY_META: Record<StrategyId, { name: string; summary: string }> = {
  momentum: {
    name: "Momentum",
    summary: "Buy when the price has risen over a recent period; step aside when it hasn't.",
  },
  mean_reversion: {
    name: "Mean reversion",
    summary: "Buy after an unusually sharp drop and sell once the price recovers toward normal.",
  },
  ma_crossover: {
    name: "Moving-average crossover",
    summary: "Hold while the short-term average price is above the long-term average.",
  },
  buy_and_hold: {
    name: "Buy and hold",
    summary: "Buy on day one and never sell. Used as the baseline every strategy is compared against.",
  },
}

export function strategyName(id: string | null | undefined): string {
  return STRATEGY_META[id as StrategyId]?.name ?? (id ? id.replace(/_/g, " ") : "—")
}

export const STRATEGY_OPTIONS = (Object.keys(STRATEGY_META) as StrategyId[]).map(id => ({
  value: id,
  label: STRATEGY_META[id].name,
  description: STRATEGY_META[id].summary,
}))

/* ------------------------------------------------------------------ */
/* Metric definitions (shown in tooltips)                             */
/* ------------------------------------------------------------------ */

export const METRIC_TOOLTIPS: Record<string, { label: string; formula: string; description: string }> = {
  total_return: {
    label: "Total return",
    formula: "Final value ÷ starting value − 1",
    description: "How much the account grew over the whole test, after trading costs.",
  },
  cagr: {
    label: "Yearly growth (CAGR)",
    formula: "(Final ÷ start)^(252 ÷ days) − 1",
    description: "The steady yearly return that would give the same end result. Useful for comparing tests of different lengths.",
  },
  annualized_volatility: {
    label: "Volatility",
    formula: "Std. dev. of daily returns × √252",
    description: "How much returns swing up and down in a typical year. Higher means a bumpier ride.",
  },
  sharpe_ratio: {
    label: "Sharpe ratio",
    formula: "Average excess return ÷ std. dev. × √252",
    description:
      "Excess return over risk-free rate for each unit of ups and downs. Above 1 is generally good; below 0 means you would have done better holding cash.",
  },
  sortino_ratio: {
    label: "Sortino ratio",
    formula: "Average excess return ÷ downside deviation × √252",
    description: "Like the Sharpe ratio, but only counts the bad (downward) swings as risk.",
  },
  max_drawdown: {
    label: "Largest drop",
    formula: "Lowest (value ÷ previous peak − 1)",
    description: "The worst fall from a high point to a low point before the account recovered. Shows the pain you'd have had to sit through.",
  },
  calmar_ratio: {
    label: "Calmar ratio",
    formula: "Yearly growth ÷ |largest drop|",
    description: "Return earned for each unit of worst-case drop. Higher is better.",
  },
  win_rate: {
    label: "Win rate",
    formula: "Profitable trades ÷ all closed trades",
    description: "Share of completed trades that made money after costs. A low win rate can still be profitable if winners are large.",
  },
  profit_factor: {
    label: "Profit factor",
    formula: "Total gains ÷ |total losses|",
    description: "Money made on winning trades divided by money lost on losing ones. Above 1 means the strategy made money overall.",
  },
  exposure: {
    label: "Time invested",
    formula: "Days holding a position ÷ all days",
    description: "How often the strategy had money in the market rather than sitting in cash.",
  },
  annualized_turnover: {
    label: "Yearly turnover",
    formula: "Sum of position changes × (252 ÷ days)",
    description: "How many times per year the position is fully changed. More turnover means more trading costs.",
  },
  var: {
    label: "Value at Risk (VaR)",
    formula: "Loss at the chosen percentile of daily returns",
    description: "On a bad day, losses were this large or smaller most of the time. At 95%, only 1 day in 20 was worse.",
  },
  cvar: {
    label: "Expected shortfall (CVaR)",
    formula: "Average of returns worse than VaR",
    description: "The average loss on the really bad days beyond the VaR line. Tells you how bad 'bad' gets.",
  },
  break_even_cost: {
    label: "Break-even cost",
    formula: "Cost per trade where Sharpe ratio reaches 0",
    description: "How high trading costs can go before the strategy stops beating cash. Higher means more room for error.",
  },
  annualized_return: {
    label: "Yearly return",
    formula: "Average daily return × 252",
    description: "Average return per year while the market was in this condition.",
  },
  hit_rate: {
    label: "Hit rate",
    formula: "Days with a gain ÷ all days in this condition",
    description: "Share of days in this market condition when the strategy made money. Days spent in cash count as no gain.",
  },
}
