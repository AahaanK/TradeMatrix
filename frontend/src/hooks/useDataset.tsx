import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"

interface DatasetContextType {
  ticker: string
  setTicker: (t: string) => void
  /** Bar size for chart views (Market Explorer). Analyses always use daily bars. */
  interval: string
  setInterval: (i: string) => void
  adjusted: boolean
  setAdjusted: (a: boolean) => void
  theme: "light" | "dark"
  toggleTheme: () => void
  setTheme: (t: "light" | "dark") => void
  lastFetched: string
  setLastFetched: (s: string) => void
  /** Annual risk-free rate as a decimal (0.04 = 4%) */
  annualRf: number
  setAnnualRf: (rf: number) => void
  /** Default trading costs used to pre-fill forms, in basis points */
  defaultCommissionBps: number
  defaultSlippageBps: number
  setDefaultCosts: (commission: number, slippage: number) => void
}

const DatasetContext = createContext<DatasetContextType | undefined>(undefined)

const STORAGE_KEY = "tradematrix_prefs"

interface StoredPrefs {
  ticker?: string
  interval?: string
  adjusted?: boolean
  annualRf?: number
  commissionBps?: number
  slippageBps?: number
}

function readPrefs(): StoredPrefs {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as StoredPrefs
  } catch {
    return {}
  }
}

function writePrefs(patch: StoredPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readPrefs(), ...patch }))
  } catch {
    /* storage unavailable (private mode) — preferences just won't persist */
  }
}

const VALID_INTERVALS = ["1d", "1wk", "1mo"]

export const DatasetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const stored = useMemo(readPrefs, [])

  const initialInterval = searchParams.get("interval") || stored.interval || "1d"
  const [ticker, setTickerState] = useState<string>(
    (searchParams.get("ticker") || stored.ticker || "SPY").toUpperCase()
  )
  const [interval, setIntervalState] = useState<string>(
    VALID_INTERVALS.includes(initialInterval) ? initialInterval : "1d"
  )
  const [adjusted, setAdjustedState] = useState<boolean>(
    searchParams.has("adjusted") ? searchParams.get("adjusted") !== "false" : stored.adjusted ?? true
  )
  const [annualRf, setAnnualRfState] = useState<number>(stored.annualRf ?? 0)
  const [defaultCommissionBps, setCommission] = useState<number>(stored.commissionBps ?? 5)
  const [defaultSlippageBps, setSlippage] = useState<number>(stored.slippageBps ?? 5)
  const [lastFetched, setLastFetched] = useState<string>("Bundled SPY sample, 2014–2023")

  const [theme, setThemeState] = useState<"light" | "dark">(() => {
    try {
      const saved = localStorage.getItem("tradematrix_theme")
      if (saved === "dark" || saved === "light") return saved
    } catch {
      /* ignore */
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  })

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    try {
      localStorage.setItem("tradematrix_theme", theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  const toggleTheme = useCallback(() => setThemeState(p => (p === "light" ? "dark" : "light")), [])

  const syncParam = useCallback(
    (key: string, value: string) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          next.set(key, value)
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const setTicker = (t: string) => {
    const v = t.trim().toUpperCase()
    if (!v) return
    setTickerState(v)
    writePrefs({ ticker: v })
    syncParam("ticker", v)
  }

  const setInterval = (i: string) => {
    if (!VALID_INTERVALS.includes(i)) return
    setIntervalState(i)
    writePrefs({ interval: i })
    syncParam("interval", i)
  }

  const setAdjusted = (a: boolean) => {
    setAdjustedState(a)
    writePrefs({ adjusted: a })
    syncParam("adjusted", String(a))
  }

  const setAnnualRf = (rf: number) => {
    setAnnualRfState(rf)
    writePrefs({ annualRf: rf })
  }

  const setDefaultCosts = (commission: number, slippage: number) => {
    setCommission(commission)
    setSlippage(slippage)
    writePrefs({ commissionBps: commission, slippageBps: slippage })
  }

  return (
    <DatasetContext.Provider
      value={{
        ticker,
        setTicker,
        interval,
        setInterval,
        adjusted,
        setAdjusted,
        theme,
        toggleTheme,
        setTheme: setThemeState,
        lastFetched,
        setLastFetched,
        annualRf,
        setAnnualRf,
        defaultCommissionBps,
        defaultSlippageBps,
        setDefaultCosts,
      }}
    >
      {children}
    </DatasetContext.Provider>
  )
}

export function useDataset(): DatasetContextType {
  const context = useContext(DatasetContext)
  if (!context) {
    throw new Error("useDataset must be used within a DatasetProvider")
  }
  return context
}
