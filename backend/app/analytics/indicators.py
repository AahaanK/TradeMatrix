"""
Quantitative Analytics Indicators Library.
All indicators are pure functions computing strictly causal, past-only rolling metrics.
No lookahead is permitted.
"""

import numpy as np
import pandas as pd


def compute_simple_returns(prices: pd.Series) -> pd.Series:
    """
    Computes simple 1-period percentage returns: R_t = P_t / P_{t-1} - 1.
    Uses strictly past-only close prices (P_t and P_{t-1}).
    """
    return prices.pct_change(fill_method=None)


def compute_log_returns(prices: pd.Series) -> pd.Series:
    """
    Computes continuous log returns: r_t = ln(P_t / P_{t-1}).
    Uses strictly past-only close prices.
    """
    return np.log(prices / prices.shift(1))


def compute_sma(prices: pd.Series, window: int) -> pd.Series:
    """
    Computes Simple Moving Average over past `window` observations:
    SMA_t = (1 / window) * sum_{i=0}^{window-1} P_{t-i}.
    """
    if window <= 0:
        raise ValueError(f"Window must be positive, got {window}")
    return prices.rolling(window=window, min_periods=window).mean()


def compute_ema(prices: pd.Series, span: int) -> pd.Series:
    """
    Computes Exponential Moving Average using past prices up to t:
    EMA_t = alpha * P_t + (1 - alpha) * EMA_{t-1}, where alpha = 2 / (span + 1).
    min_periods=span ensures no early warm-up leakage.
    """
    if span <= 0:
        raise ValueError(f"Span must be positive, got {span}")
    return prices.ewm(span=span, min_periods=span, adjust=False).mean()


def compute_rolling_std(prices: pd.Series, window: int, ddof: int = 1) -> pd.Series:
    """
    Computes rolling sample standard deviation over past `window` observations.
    """
    if window < 2:
        raise ValueError(f"Window must be >= 2 for standard deviation, got {window}")
    return prices.rolling(window=window, min_periods=window).std(ddof=ddof)


def compute_annualized_rolling_volatility(
    returns: pd.Series,
    window: int = 21,
    annualization_factor: int = 252,
    ddof: int = 1
) -> pd.Series:
    """
    Computes annualized rolling volatility: sigma_ann = rolling_std(returns, window) * sqrt(N).
    Uses returns up to period t only.
    """
    roll_std = returns.rolling(window=window, min_periods=window).std(ddof=ddof)
    return roll_std * np.sqrt(annualization_factor)


def compute_momentum(prices: pd.Series, lookback: int) -> pd.Series:
    """
    Computes rolling price momentum: Mom_t = P_t / P_{t-k} - 1.
    Uses prices at t and t-lookback.
    """
    if lookback <= 0:
        raise ValueError(f"Lookback must be positive, got {lookback}")
    return prices.pct_change(lookback, fill_method=None)


def compute_rsi(prices: pd.Series, period: int = 14) -> pd.Series:
    """
    Computes Relative Strength Index using Wilder's exponential smoothing:
    RS = EMA_gain / EMA_loss
    RSI = 100 - (100 / (1 + RS))
    Only uses price changes up to period t.
    """
    if period <= 0:
        raise ValueError(f"Period must be positive, got {period}")
    delta = prices.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)

    # Wilder smoothing corresponds to alpha = 1 / period
    avg_gain = gain.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()

    rs = avg_gain / avg_loss
    # Handle zero loss: when avg_loss is 0, RSI is 100; when avg_gain is 0, RSI is 0
    rsi = 100.0 - (100.0 / (1.0 + rs))
    rsi = rsi.where(avg_loss != 0, 100.0)
    rsi = rsi.where(avg_gain != 0, 0.0)
    return rsi


def compute_bollinger_bands(
    prices: pd.Series,
    window: int = 20,
    num_std: float = 2.0
) -> tuple[pd.Series, pd.Series, pd.Series]:
    """
    Computes Bollinger Bands over past `window` observations:
    Middle = SMA(window)
    Upper = Middle + num_std * rolling_std
    Lower = Middle - num_std * rolling_std
    """
    middle = compute_sma(prices, window)
    std = compute_rolling_std(prices, window)
    upper = middle + (num_std * std)
    lower = middle - (num_std * std)
    return middle, upper, lower


def compute_rolling_zscore(prices: pd.Series, window: int) -> pd.Series:
    """
    Computes rolling z-score: z_t = (P_t - SMA_t) / sigma_t.
    """
    sma = compute_sma(prices, window)
    std = compute_rolling_std(prices, window)
    # When std == 0, return 0
    z = (prices - sma) / std
    return z.replace([np.inf, -np.inf], np.nan).fillna(0.0)


def compute_drawdown_series(equity: pd.Series) -> tuple[pd.Series, pd.Series]:
    """
    Computes running peak and drawdown series:
    Running Peak_t = max_{i<=t} E_i
    Drawdown_t = E_t / Running Peak_t - 1.
    """
    running_peak = equity.cummax()
    drawdown = (equity / running_peak) - 1.0
    return running_peak, drawdown


def annual_to_period_rf(annual_rf: float, annualization_factor: int = 252) -> float:
    """
    Converts annual risk-free rate r to per-period rate:
    r_period = (1 + r)^(1 / N) - 1.
    """
    if annual_rf < -1.0:
        raise ValueError("Risk-free rate cannot be less than -100%")
    return (1.0 + annual_rf) ** (1.0 / annualization_factor) - 1.0
