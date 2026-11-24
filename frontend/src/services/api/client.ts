import {
  MarketDataResponse,
  RegimeAnalysisResponse,
  BacktestResult,
  StrategyComparisonResult,
  ReplayState,
  RiskAnalysisResponse,
  RobustnessResponse,
  OutOfSampleResponse,
  WalkForwardResponse,
  Experiment,
  DataQualityReport,
} from "../../types"

export interface UploadResult {
  filename: string
  dataset_id: string
  dataset_fingerprint: string
  total_bars: number
  data_quality: DataQualityReport
}

const BASE_URL = "/api/v1"

/** Turns raw validation output into a sentence a person can act on. */
function friendlyError(raw: string): string {
  const pyd = raw.match(/validation error for \w+\s*\n?\s*(\w+)?[\s\S]*?(Input should be[^[\n]*|Value error, [^[\n]*)/)
  if (pyd) {
    const field = pyd[1] ? `${pyd[1].replace(/_/g, " ")}: ` : ""
    return `${field}${pyd[2].replace("Value error, ", "").trim()}`
  }
  return raw
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  })
  if (!res.ok) {
    let errBody: any
    try {
      errBody = await res.json()
    } catch {
      errBody = { error: { message: `HTTP ${res.status}: ${res.statusText}` } }
    }
    const raw: string = errBody?.error?.message || `Request failed with status ${res.status}`
    throw new Error(friendlyError(raw))
  }
  return res.json()
}

export const api = {
  // Market
  getMarketData: (params: { ticker?: string; interval?: string; start?: string; end?: string; adjusted?: boolean }) => {
    const q = new URLSearchParams()
    if (params.ticker) q.set("ticker", params.ticker)
    if (params.interval) q.set("interval", params.interval)
    if (params.start) q.set("start", params.start)
    if (params.end) q.set("end", params.end)
    if (params.adjusted !== undefined) q.set("adjusted", String(params.adjusted))
    return fetchJson<MarketDataResponse>(`${BASE_URL}/market/data?${q.toString()}`)
  },

  getIndicators: (ticker = "SPY", interval = "1d", adjusted = true) => {
    return fetchJson<{ ticker: string; indicators: any[] }>(
      `${BASE_URL}/market/indicators?ticker=${ticker}&interval=${interval}&adjusted=${adjusted}`
    )
  },

  uploadMarketCsv: async (file: File, interval = "1d", adjusted = true): Promise<UploadResult> => {
    const formData = new FormData()
    formData.append("file", file)
    const res = await fetch(`${BASE_URL}/market/upload?interval=${interval}&adjusted=${adjusted}`, {
      method: "POST",
      body: formData,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error?.message || "Upload failed")
    }
    return res.json() as Promise<UploadResult>
  },

  // Regimes
  analyzeRegimes: (params: {
    ticker: string
    interval?: string
    adjusted?: boolean
    method?: string
    vol_percentile?: number
    min_history?: number
    persistence_filter?: number
    require_sma?: boolean
    require_momentum?: boolean
  }) => {
    return fetchJson<RegimeAnalysisResponse>(`${BASE_URL}/regimes/analyze`, {
      method: "POST",
      body: JSON.stringify(params),
    })
  },

  // Backtests
  runBacktest: (params: {
    ticker: string
    strategy: string
    params?: Record<string, any>
    commission_bps?: number
    slippage_bps?: number
    initial_capital?: number
    annual_rf?: number
    adjusted?: boolean
  }) => {
    return fetchJson<BacktestResult>(`${BASE_URL}/backtests/run`, {
      method: "POST",
      body: JSON.stringify(params),
    })
  },

  compareStrategies: (params: {
    ticker: string
    commission_bps?: number
    slippage_bps?: number
    annual_rf?: number
    adjusted?: boolean
  }) => {
    return fetchJson<StrategyComparisonResult>(`${BASE_URL}/backtests/compare`, {
      method: "POST",
      body: JSON.stringify(params),
    })
  },

  replayBacktest: (params: {
    ticker: string
    target_date: string
    strategy: string
    params?: Record<string, any>
    commission_bps?: number
    slippage_bps?: number
    initial_capital?: number
    adjusted?: boolean
  }) => {
    return fetchJson<ReplayState>(`${BASE_URL}/backtests/replay`, {
      method: "POST",
      body: JSON.stringify(params),
    })
  },

  // Risk
  analyzeRisk: (params: {
    ticker: string
    strategy: string
    params?: Record<string, any>
    confidence_level?: number
    commission_bps?: number
    slippage_bps?: number
    adjusted?: boolean
  }) => {
    return fetchJson<RiskAnalysisResponse>(`${BASE_URL}/risk/analyze`, {
      method: "POST",
      body: JSON.stringify(params),
    })
  },

  // Research
  runSensitivity: (params: {
    ticker: string
    strategy: string
    param1_name: string
    param1_values: any[]
    param2_name: string
    param2_values: any[]
    base_params?: Record<string, any>
    commission_bps?: number
    slippage_bps?: number
    adjusted?: boolean
  }) => {
    return fetchJson<RobustnessResponse>(`${BASE_URL}/research/sensitivity`, {
      method: "POST",
      body: JSON.stringify(params),
    })
  },

  runOutOfSample: (params: {
    ticker: string
    strategy: string
    train_end_date: string
    test_start_date: string
    test_end_date?: string
    param_grid?: any[]
    target_metric?: string
    commission_bps?: number
    slippage_bps?: number
    adjusted?: boolean
  }) => {
    return fetchJson<OutOfSampleResponse>(`${BASE_URL}/research/out-of-sample`, {
      method: "POST",
      body: JSON.stringify(params),
    })
  },

  runWalkForward: (params: {
    ticker: string
    strategy: string
    n_folds?: number
    param_grid?: any[]
    target_metric?: string
    commission_bps?: number
    slippage_bps?: number
    adjusted?: boolean
  }) => {
    return fetchJson<WalkForwardResponse>(`${BASE_URL}/research/walk-forward`, {
      method: "POST",
      body: JSON.stringify(params),
    })
  },

  // Experiments
  listExperiments: () => {
    return fetchJson<Experiment[]>(`${BASE_URL}/experiments`)
  },

  createExperiment: (data: Partial<Experiment>) => {
    return fetchJson<Experiment>(`${BASE_URL}/experiments`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  getExperiment: (id: string) => {
    return fetchJson<Experiment>(`${BASE_URL}/experiments/${id}`)
  },

  updateExperiment: (id: string, data: { name?: string; notes?: string }) => {
    return fetchJson<Experiment>(`${BASE_URL}/experiments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
  },

  deleteExperiment: (id: string) => {
    return fetchJson<{ status: string; deleted_id: string }>(`${BASE_URL}/experiments/${id}`, {
      method: "DELETE",
    })
  },

  duplicateExperiment: (id: string) => {
    return fetchJson<Experiment>(`${BASE_URL}/experiments/${id}/duplicate`, {
      method: "POST",
    })
  },

  exportExperimentUrl: (id: string, format: "csv" | "pdf") => {
    return `${BASE_URL}/experiments/${id}/export?format=${format}`
  },
}
