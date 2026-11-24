export interface QualityIssue {
  severity: "info" | "warning" | "error"
  check: string
  message: string
  count: number
  details?: string[]
}

export interface DataQualityReport {
  is_valid: boolean
  total_bars: number
  start_date: string
  end_date: string
  frequency: string
  duplicate_dates_removed: number
  missing_value_bars: number
  nonpositive_price_bars: number
  ohlc_violation_bars: number
  zero_or_negative_volume_bars: number
  gaps_detected: number
  issues: QualityIssue[]
}

export interface OHLCVBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  adj_close?: number | null
}

export interface MarketDataResponse {
  ticker: string
  source: string
  interval: string
  adjusted: boolean
  dataset_fingerprint: string
  total_bars: number
  data_quality: DataQualityReport
  bars: OHLCVBar[]
}

export type RegimeLabel = "Bull/Low Vol" | "Bull/High Vol" | "Bear/Low Vol" | "Bear/High Vol" | "Undefined"

export interface TransitionIntelligence {
  transition_matrix: Record<string, Record<string, number>>
  counts_matrix: Record<string, Record<string, number>>
  persistence: Record<string, number>
  expected_duration: Record<string, number | null>
  observed_mean_duration: Record<string, number | null>
  transition_frequency_per_year: number
  total_transitions: number
  last_changes: Array<{
    date: string
    from_regime: string
    to_regime: string
    previous_duration_bars: number
  }>
  regime_distribution: Record<string, { count: number; percentage: number }>
  disclaimer: string
}

export interface RegimeTimelinePoint {
  date: string
  close: number
  regime: RegimeLabel
  short_momentum: number | null
  medium_momentum: number | null
  rolling_volatility: number | null
  trend_strength: number | null
  drawdown: number | null
}

export interface RegimeAnalysisResponse {
  ticker: string
  interval: string
  dataset_fingerprint: string
  total_bars: number
  method: string
  labels: RegimeLabel[]
  timeline: RegimeTimelinePoint[]
  distribution: Record<string, { count: number; percentage: number }>
  transition_intelligence: TransitionIntelligence
  latest_regime: {
    as_of_date: string
    label: RegimeLabel
    close: number
    rolling_volatility: number | null
    medium_momentum: number | null
    price_to_sma: number | null
  }
  kmeans_metadata?: {
    silhouette_score: number | null
    centroids: Array<Record<string, number>>
    cluster_mapping: Record<string, string>
    training_bars: number
    total_classified_bars: number
  } | null
}

export interface PerformanceMetrics {
  total_return: number | null
  cagr: number | null
  annualized_volatility: number | null
  sharpe_ratio: number | null
  sortino_ratio: number | null
  max_drawdown: number | null
  calmar_ratio: number | null
  win_rate: number | null
  profit_factor: number | null
  trades_count: number
  avg_trade_return: number | null
  exposure: number | null
  annualized_turnover: number | null
  risk_free_rate_used: number
  annualization_constant_used: number
  notes: string[]
}

export interface Trade {
  id: number
  entry_date: string
  entry_price: number
  exit_date: string
  exit_price: number
  direction: "long" | "short"
  bars_held: number
  gross_return: number
  net_return: number
  entry_regime: string
  is_open: boolean
}

export interface EquityPoint {
  date: string
  close: number
  position: number
  gross_return: number
  net_return: number
  gross_equity: number
  net_equity: number
  drawdown: number
  peak: number
  regime: string
}

export interface BacktestResult {
  ticker: string
  source?: string
  strategy: string
  dataset_fingerprint: string
  metrics: PerformanceMetrics
  gross_metrics: PerformanceMetrics
  benchmark_metrics: PerformanceMetrics
  regime_metrics: Record<string, {
    regime: string
    observations: number
    low_sample_warning: boolean
    cumulative_return: number | null
    annualized_return: number | null
    annualized_volatility: number | null
    sharpe_ratio: number | null
    hit_rate: number | null
    exposure: number | null
    trades_entered: number
    quantiles: {
      p10: number | null
      p25: number | null
      median: number | null
      p75: number | null
      p90: number | null
      mean: number | null
    }
  }>
  cost_assumptions: {
    commission_bps: number
    slippage_bps: number
    total_bps: number
    total_cost_paid: number
  }
  equity_curve: EquityPoint[]
  trades: Trade[]
}

export interface StrategyComparisonResult {
  ticker: string
  strategies: string[]
  overall_metrics: Record<string, PerformanceMetrics>
  regime_matrix: Record<string, Record<string, any>>
  insights: Array<{ category: string; statement: string }>
  attribution_convention: string
}

export interface ReplayState {
  as_of_date: string
  close_price: number
  position_held: number
  regime_known: string
  equity: number
  drawdown: number
  running_peak: number
  cumulative_net_return: number
  total_trades_to_date: number
  latest_trade: Trade | null
  historical_equity_slice: EquityPoint[]
  metrics_to_date: PerformanceMetrics
}

export interface RiskAnalysisResponse {
  ticker: string
  strategy: string
  confidence_level: number
  var: number | null
  cvar: number | null
  var_99: number | null
  cvar_99: number | null
  drawdown_analytics: {
    max_drawdown: number | null
    longest_drawdown_duration_bars: number
    recovery_status: string
    is_recovered: boolean
    longest_dd_start: string | null
    longest_dd_trough: string | null
  }
  rolling_risk: Array<{
    date: string
    beta: number | null
    correlation: number | null
  }>
  stress_presets: Array<{
    name: string
    start: string
    end: string
    description: string
    applicable: boolean
    bars?: number
    strategy_total_return?: number | null
    benchmark_total_return?: number | null
    strategy_max_dd?: number | null
    benchmark_max_dd?: number | null
    exposure?: number | null
    note?: string
  }>
  cost_sensitivity: {
    curve: Array<{
      cost_bps: number
      sharpe_ratio: number | null
      cagr: number | null
      total_return: number | null
    }>
    break_even_cost_bps: number | null
    disclaimer: string
  }
  disclaimer: string
}

export interface SensitivityCell {
  param1: any
  param2: any
  sharpe_ratio: number | null
  total_return: number | null
  max_drawdown: number | null
  stability_score: number
  i: number
  j: number
}

export interface RobustnessResponse {
  strategy: string
  param1_name: string
  param1_values: any[]
  param2_name: string
  param2_values: any[]
  cells: SensitivityCell[]
  highest_in_sample_cell: SensitivityCell | null
  total_combinations: number
}

export interface OutOfSampleResponse {
  strategy: string
  chosen_params: Record<string, any>
  target_metric: string
  train_window: { start: string; end: string; bars: number }
  test_window: { start: string; end: string; bars: number }
  in_sample_metrics: PerformanceMetrics
  out_of_sample_metrics: PerformanceMetrics
  degradation: Record<string, {
    in_sample: number
    out_of_sample: number
    absolute_diff: number
    percent_diff: number
  }>
  overfitting_warning: boolean
  warning_reasons: string[]
  diagnostic_rank_in_oos: string
  train_equity_curve: EquityPoint[]
  test_equity_curve: EquityPoint[]
}

export interface WalkForwardResponse {
  strategy: string
  n_folds: number
  target_metric: string
  folds: Array<{
    fold: number
    train_range: string
    test_range: string
    selected_params: Record<string, any>
    train_metric: number | null
    test_metric: number | null
    test_metrics: PerformanceMetrics
  }>
  stitched_test_bars: number
  stitched_start_date: string
  stitched_end_date: string
  stitched_final_equity: number
}

export interface Experiment {
  id: string
  name: string
  created_at: string
  updated_at: string
  ticker: string
  source: string
  interval: string
  adjusted: boolean
  start_date?: string | null
  end_date?: string | null
  dataset_fingerprint: string
  strategy: string
  params: Record<string, any>
  regime_method: string
  regime_params: Record<string, any>
  costs: Record<string, any>
  initial_capital: number
  metrics: PerformanceMetrics
  regime_metrics: Record<string, any>
  equity_curve: EquityPoint[]
  trades: Trade[]
  app_version: string
  notes?: string | null
  reproducibility?: {
    fingerprint_matches: boolean
    warning?: string | null
  }
}
