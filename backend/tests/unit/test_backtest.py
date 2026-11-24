import pandas as pd
import pytest

from app.backtest.engine import run_backtest_pipeline
from app.strategies.registry import get_strategy


def test_round_trip_transaction_cost():
    # 5 bars of flat price (100.0) -> asset return is exactly 0.0
    dates = pd.date_range("2023-01-01", periods=5, freq="D")
    df = pd.DataFrame({
        "date": dates,
        "open": [100.0] * 5,
        "high": [100.0] * 5,
        "low": [100.0] * 5,
        "close": [100.0] * 5,
        "volume": [1000] * 5,
    })

    # Dummy strategy that holds position 1.0 on bars 0, 1, 2 and 0 on bars 3, 4
    class SingleTradeStrategy:
        name = "test"
        params_model = None
        def target_position(self, data, regimes=None):
            return pd.Series([1.0, 1.0, 1.0, 0.0, 0.0], index=data.index)

    # 10 bps total cost: 5 bps commission + 5 bps slippage
    bt = run_backtest_pipeline(
        df=df,
        strategy=SingleTradeStrategy(),
        commission_bps=5.0,
        slippage_bps=5.0,
        initial_capital=100000.0,
        liquidate_at_end=False,
    )

    # Entry turnover = 1.0 at bar 0 -> cost 10 bps = 0.001
    # Exit turnover = 1.0 at bar 3 -> cost 10 bps = 0.001
    # Total cost for round trip = exactly 20 bps = 0.002 = 0.20%
    net_eq = bt["equity_curve"][-1]["net_equity"]
    gross_eq = bt["equity_curve"][-1]["gross_equity"]

    # Gross equity should remain 100,000 since price is flat
    assert pytest.approx(gross_eq, rel=1e-5) == 100000.0
    # Net equity should be 100,000 * (1 - 0.001) * (1 - 0.001) ~ 99800.1
    expected_net = 100000.0 * (1.0 - 0.001) * (1.0 - 0.001)
    assert pytest.approx(net_eq, rel=1e-5) == expected_net


def test_buy_and_hold_equals_asset_return_minus_entry_cost():
    dates = pd.date_range("2023-01-01", periods=4, freq="D")
    df = pd.DataFrame({
        "date": dates,
        "open": [100.0, 102.0, 104.0, 110.0],
        "high": [100.0, 102.0, 104.0, 110.0],
        "low": [100.0, 102.0, 104.0, 110.0],
        "close": [100.0, 102.0, 104.0, 110.0],
        "volume": [1000] * 4,
    })

    bh = get_strategy("buy_and_hold")
    bt = run_backtest_pipeline(
        df=df,
        strategy=bh,
        commission_bps=10.0,
        slippage_bps=10.0,
        initial_capital=100000.0,
        liquidate_at_end=False,  # exclude exit turnover
    )

    # Asset return: 110 / 100 - 1 = +10.0%
    gross_eq = bt["equity_curve"][-1]["gross_equity"]
    assert pytest.approx(gross_eq, rel=1e-5) == 110000.0

    # Net equity includes initial 20 bps entry cost: 100,000 * (1 - 0.002) * 1.10 = 109,780
    net_eq = bt["equity_curve"][-1]["net_equity"]
    expected_net = 100000.0 * (1.0 - 0.002) * (110.0 / 100.0)
    assert pytest.approx(net_eq, rel=1e-4) == expected_net
