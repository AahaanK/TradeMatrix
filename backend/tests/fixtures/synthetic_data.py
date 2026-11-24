import numpy as np
import pandas as pd


def create_hand_computable_series() -> pd.Series:
    """
    Returns a small hand-verifiable price series of 10 periods.
    Prices: [100.0, 105.0, 102.0, 108.0, 110.0, 104.0, 106.0, 112.0, 115.0, 120.0]
    """
    prices = [100.0, 105.0, 102.0, 108.0, 110.0, 104.0, 106.0, 112.0, 115.0, 120.0]
    dates = pd.date_range("2023-01-01", periods=10, freq="D")
    return pd.Series(prices, index=dates, name="close")


def create_synthetic_uptrend_dataframe(n_bars: int = 300) -> pd.DataFrame:
    """
    Creates a clean synthetic up-trending low-volatility price series.
    """
    np.random.seed(42)
    dates = pd.date_range("2020-01-01", periods=n_bars, freq="B")
    # Steady 5 bps daily drift with low 0.2% vol
    daily_returns = 0.0008 + np.random.normal(0, 0.002, size=n_bars)
    prices = 100.0 * np.cumprod(1.0 + daily_returns)

    df = pd.DataFrame({
        "date": dates,
        "open": prices * 0.999,
        "high": prices * 1.002,
        "low": prices * 0.998,
        "close": prices,
        "volume": 1000000.0,
        "adj_close": prices,
    })
    return df


def create_synthetic_crash_dataframe(n_bars: int = 300) -> pd.DataFrame:
    """
    Creates a synthetic series with a sharp high-volatility downtrend crash.
    """
    np.random.seed(42)
    dates = pd.date_range("2020-01-01", periods=n_bars, freq="B")
    # First 250 bars neutral, then sharp severe drop with large volatility
    returns = np.random.normal(0.0001, 0.005, size=n_bars)
    returns[250:] = -0.03 + np.random.normal(0, 0.03, size=n_bars - 250)
    prices = 100.0 * np.cumprod(1.0 + returns)

    df = pd.DataFrame({
        "date": dates,
        "open": prices * 1.005,
        "high": prices * 1.02,
        "low": prices * 0.97,
        "close": prices,
        "volume": 5000000.0,
        "adj_close": prices,
    })
    return df
