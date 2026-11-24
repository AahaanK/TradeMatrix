import pandas as pd
import pytest

from app.analytics.metrics import calculate_performance_metrics, safe_float


def test_metrics_standard_computation():
    # 252 daily returns of steady 0.1% daily return
    n = 252
    daily_ret = 0.001
    net_returns = pd.Series([daily_ret] * n)
    equity = 100000.0 * (1.0 + net_returns).cumprod()
    positions = pd.Series([1.0] * n)
    turnover = pd.Series([0.0] * n)
    turnover.iloc[0] = 1.0  # initial entry

    trades = [
        {"id": 1, "net_return": 0.10, "is_open": False},
        {"id": 2, "net_return": -0.05, "is_open": False},
    ]

    metrics = calculate_performance_metrics(
        net_returns=net_returns,
        equity_curve=equity,
        positions=positions,
        turnover_series=turnover,
        closed_trades=trades,
        annual_rf=0.0,
        annualization_factor=252,
    )

    assert metrics["total_return"] is not None
    assert metrics["cagr"] is not None
    assert metrics["annualized_volatility"] is not None
    # Win rate: 1 win out of 2 closed trades = 0.50
    assert pytest.approx(metrics["win_rate"], rel=1e-4) == 0.50
    # Profit factor: 0.10 / 0.05 = 2.0
    assert pytest.approx(metrics["profit_factor"], rel=1e-4) == 2.0
    # Exposure: 100%
    assert pytest.approx(metrics["exposure"], rel=1e-4) == 1.0


def test_metrics_zero_variance_edge_case():
    # Exactly identical returns -> sample standard deviation is 0.0
    net_returns = pd.Series([0.01, 0.01, 0.01, 0.01])
    equity = 100000.0 * (1.0 + net_returns).cumprod()

    metrics = calculate_performance_metrics(
        net_returns=net_returns,
        equity_curve=equity,
        positions=pd.Series([1.0] * 4),
        turnover_series=pd.Series([0.0] * 4),
        closed_trades=[],
    )

    # Sharpe must be None (not NaN or Inf) with a note
    assert metrics["sharpe_ratio"] is None
    assert any("Sharpe ratio" in note for note in metrics["notes"])


def test_metrics_no_losing_trades():
    # Only winning trades -> Profit factor is null with note
    trades = [
        {"id": 1, "net_return": 0.08, "is_open": False},
        {"id": 2, "net_return": 0.04, "is_open": False},
    ]
    net_returns = pd.Series([0.01, 0.02, 0.01, 0.02])
    equity = 100000.0 * (1.0 + net_returns).cumprod()

    metrics = calculate_performance_metrics(
        net_returns=net_returns,
        equity_curve=equity,
        positions=pd.Series([1.0] * 4),
        turnover_series=pd.Series([0.0] * 4),
        closed_trades=trades,
    )

    assert metrics["win_rate"] == 1.0
    assert metrics["profit_factor"] is None
    assert any("no losing trades" in note for note in metrics["notes"])


def test_safe_float():
    assert safe_float(12.34) == 12.34
    assert safe_float(float("nan")) is None
    assert safe_float(float("inf")) is None
    assert safe_float(None) is None
