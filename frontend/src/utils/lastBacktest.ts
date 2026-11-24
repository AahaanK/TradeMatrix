import type { BacktestResult } from "../types"

const KEY = "tradematrix_last_backtest"

export interface StoredBacktest {
  result: BacktestResult
  params: Record<string, unknown>
  strategy: string
  savedAt: string
  initialCapital?: number
}

/** Keeps the most recent backtest for this browser tab so a refresh doesn't lose it. */
export function saveLastBacktest(entry: StoredBacktest): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(entry))
  } catch {
    /* quota exceeded or storage disabled: results stay in memory only */
  }
}

export function loadLastBacktest(): StoredBacktest | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as StoredBacktest) : null
  } catch {
    return null
  }
}
