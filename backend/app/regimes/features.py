"""
Market Regime Feature Extraction Library.
All features are computed causally using strictly past-only windows up to time t.
"""

import numpy as np
import pandas as pd

from app.analytics.indicators import (
    compute_annualized_rolling_volatility,
    compute_drawdown_series,
    compute_momentum,
    compute_rolling_zscore,
    compute_simple_returns,
    compute_sma,
)


def compute_trend_strength(log_prices: pd.Series, window: int = 63) -> pd.Series:
    """
    Computes slope of log-price linear regression divided by its standard error (t-stat).
    Calculated in a strictly rolling past-only window.
    """
    result = pd.Series(index=log_prices.index, dtype=float)
    x = np.arange(window, dtype=float)
    x_mean = x.mean()
    x_dev = x - x_mean
    sum_x_dev_sq = np.sum(x_dev ** 2)

    values = log_prices.to_numpy()
    n = len(values)

    for i in range(window - 1, n):
        y_slice = values[i - window + 1 : i + 1]
        if np.isnan(y_slice).any():
            continue
        y_mean = np.mean(y_slice)
        y_dev = y_slice - y_mean
        cov_xy = np.sum(x_dev * y_dev)
        slope = cov_xy / sum_x_dev_sq
        intercept = y_mean - slope * x_mean

        residuals = y_slice - (intercept + slope * x)
        residual_var = np.sum(residuals ** 2) / (window - 2) if window > 2 else 0.0

        if residual_var > 1e-12:
            se_slope = np.sqrt(residual_var / sum_x_dev_sq)
            t_stat = slope / se_slope if se_slope > 1e-12 else 0.0
        else:
            t_stat = 0.0
        result.iloc[i] = t_stat

    return result


def extract_regime_features(
    df: pd.DataFrame,
    short_mom_window: int = 21,
    med_mom_window: int = 63,
    vol_window: int = 21,
    sma_trend_window: int = 200,
    trend_strength_window: int = 63,
    annualization_factor: int = 252,
) -> pd.DataFrame:
    """
    Extracts all causal regime classification features:
    - short_momentum (e.g. 21d)
    - medium_momentum (e.g. 63d)
    - rolling_volatility (e.g. 21d annualized)
    - price_to_sma (close / SMA(200) - 1)
    - trend_strength (regression slope t-stat over 63d)
    - current_drawdown (from running peak)
    - volume_zscore (21d rolling z-score)
    """
    close = df["close"]
    returns = compute_simple_returns(close)

    short_mom = compute_momentum(close, short_mom_window)
    med_mom = compute_momentum(close, med_mom_window)
    roll_vol = compute_annualized_rolling_volatility(
        returns, window=vol_window, annualization_factor=annualization_factor
    )
    sma_trend = compute_sma(close, sma_trend_window)
    price_to_sma = (close / sma_trend) - 1.0

    log_close = np.log(close)
    trend_tstat = compute_trend_strength(log_close, window=trend_strength_window)

    _, drawdown = compute_drawdown_series(close)

    volume = df["volume"] if "volume" in df.columns else pd.Series(0.0, index=df.index)
    vol_z = compute_rolling_zscore(volume, window=vol_window)

    features = pd.DataFrame(
        {
            "date": df["date"],
            "close": close,
            "short_momentum": short_mom,
            "medium_momentum": med_mom,
            "rolling_volatility": roll_vol,
            "sma_trend": sma_trend,
            "price_to_sma": price_to_sma,
            "trend_strength": trend_tstat,
            "drawdown": drawdown,
            "volume_zscore": vol_z,
        },
        index=df.index,
    )

    return features
