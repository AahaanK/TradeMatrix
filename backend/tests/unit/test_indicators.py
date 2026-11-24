import numpy as np
import pandas as pd
import pytest

from app.analytics.indicators import (
    annual_to_period_rf,
    compute_bollinger_bands,
    compute_drawdown_series,
    compute_ema,
    compute_log_returns,
    compute_momentum,
    compute_rolling_std,
    compute_rolling_zscore,
    compute_rsi,
    compute_simple_returns,
    compute_sma,
)


def test_simple_and_log_returns():
    series = pd.Series([100.0, 110.0, 99.0])
    simple_ret = compute_simple_returns(series)
    log_ret = compute_log_returns(series)

    assert np.isnan(simple_ret.iloc[0])
    assert pytest.approx(simple_ret.iloc[1], rel=1e-5) == 0.10
    assert pytest.approx(simple_ret.iloc[2], rel=1e-5) == -0.10
    assert pytest.approx(log_ret.iloc[1], rel=1e-5) == np.log(1.10)
    assert pytest.approx(log_ret.iloc[2], rel=1e-5) == np.log(99.0 / 110.0)


def test_sma_and_rolling_std():
    prices = pd.Series([10.0, 20.0, 30.0, 40.0])
    sma3 = compute_sma(prices, window=3)

    assert np.isnan(sma3.iloc[0])
    assert np.isnan(sma3.iloc[1])
    assert pytest.approx(sma3.iloc[2], rel=1e-5) == 20.0
    assert pytest.approx(sma3.iloc[3], rel=1e-5) == 30.0

    std3 = compute_rolling_std(prices, window=3, ddof=1)
    assert pytest.approx(std3.iloc[2], rel=1e-5) == 10.0

    with pytest.raises(ValueError):
        compute_sma(prices, 0)
    with pytest.raises(ValueError):
        compute_rolling_std(prices, 1)


def test_ema():
    prices = pd.Series([10.0, 12.0, 14.0, 16.0, 18.0])
    ema = compute_ema(prices, span=3)
    assert np.isnan(ema.iloc[0])
    assert np.isnan(ema.iloc[1])
    assert not np.isnan(ema.iloc[2])

    with pytest.raises(ValueError):
        compute_ema(prices, -1)


def test_rsi():
    # 20 bars of ascending prices -> RSI should be high (>70)
    prices = pd.Series([100.0 + i * 2.0 for i in range(25)])
    rsi = compute_rsi(prices, period=14)
    assert np.isnan(rsi.iloc[10])
    assert rsi.iloc[-1] > 70.0

    with pytest.raises(ValueError):
        compute_rsi(prices, 0)


def test_bollinger_bands_and_zscore():
    prices = pd.Series([100.0 + np.sin(i) * 5.0 for i in range(30)])
    mid, upper, lower = compute_bollinger_bands(prices, window=20, num_std=2.0)
    assert (upper.dropna() >= mid.dropna()).all()
    assert (lower.dropna() <= mid.dropna()).all()

    z = compute_rolling_zscore(prices, window=20)
    assert len(z) == 30


def test_momentum():
    prices = pd.Series([100.0, 102.0, 105.0, 110.0])
    mom2 = compute_momentum(prices, lookback=2)
    assert np.isnan(mom2.iloc[0])
    assert np.isnan(mom2.iloc[1])
    assert pytest.approx(mom2.iloc[2], rel=1e-5) == 0.05
    assert pytest.approx(mom2.iloc[3], rel=1e-5) == (110.0 / 102.0 - 1.0)

    with pytest.raises(ValueError):
        compute_momentum(prices, 0)


def test_drawdown_series():
    equity = pd.Series([100.0, 120.0, 90.0, 110.0, 130.0])
    running_peak, drawdown = compute_drawdown_series(equity)

    expected_peaks = [100.0, 120.0, 120.0, 120.0, 130.0]
    for i in range(5):
        assert equity.iloc[i] <= running_peak.iloc[i]
        assert pytest.approx(running_peak.iloc[i], rel=1e-5) == expected_peaks[i]

    assert pytest.approx(drawdown.iloc[2], rel=1e-5) == -0.25
    assert pytest.approx(drawdown.iloc[4], rel=1e-5) == 0.0


def test_annual_to_period_rf():
    daily_rf = annual_to_period_rf(0.05, 252)
    reconstituted = (1.0 + daily_rf) ** 252 - 1.0
    assert pytest.approx(reconstituted, rel=1e-5) == 0.05

    with pytest.raises(ValueError):
        annual_to_period_rf(-1.5)
