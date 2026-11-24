import numpy as np
import pandas as pd
import pytest

from app.backtest.engine import run_backtest_pipeline
from app.backtest.replay import get_replay_state_at_date
from app.regimes.features import extract_regime_features
from app.regimes.rules_classifier import classify_regimes_rules
from app.strategies.registry import get_strategy
from tests.fixtures.synthetic_data import create_synthetic_uptrend_dataframe


def test_perturbation_invariance():
    """
    Changing prices after time t MUST NOT change signals, positions,
    or regime labels at or before time t.
    """
    df1 = create_synthetic_uptrend_dataframe(n_bars=300)
    df2 = df1.copy()

    # Cutoff at t = 260
    t_cutoff = 260

    # Perturb all prices after t_cutoff radically in df2
    df2.loc[t_cutoff + 1 :, "close"] *= 5.0
    df2.loc[t_cutoff + 1 :, "high"] *= 5.0
    df2.loc[t_cutoff + 1 :, "low"] *= 5.0
    df2.loc[t_cutoff + 1 :, "open"] *= 5.0

    # 1. Regimes
    f1 = extract_regime_features(df1)
    f2 = extract_regime_features(df2)
    r1 = classify_regimes_rules(f1)
    r2 = classify_regimes_rules(f2)

    # Regime labels at or before t_cutoff must be exactly identical
    assert (r1.iloc[: t_cutoff + 1] == r2.iloc[: t_cutoff + 1]).all()

    # 2. Strategy target positions
    strat = get_strategy("momentum", params={"lookback": 63, "threshold": 0.0})
    pos1 = strat.target_position(df1, regimes=r1)
    pos2 = strat.target_position(df2, regimes=r2)

    # Positions at or before t_cutoff must be identical
    np.testing.assert_allclose(pos1.iloc[: t_cutoff + 1], pos2.iloc[: t_cutoff + 1])


def test_execution_shift():
    """
    Verifies that return earned at t is position[t-1] * asset_return[t].
    """
    dates = pd.date_range("2023-01-01", periods=4, freq="D")
    df = pd.DataFrame({
        "date": dates,
        "open": [100.0, 100.0, 100.0, 100.0],
        "high": [100.0, 100.0, 100.0, 100.0],
        "low": [100.0, 100.0, 100.0, 100.0],
        "close": [100.0, 110.0, 88.0, 88.0],
        "volume": [1000] * 4,
    })

    # Strategy signals 1.0 at bar 0, 0.0 at bar 1, 1.0 at bar 2
    class MockStrat:
        name = "mock"
        params_model = None
        def target_position(self, data, regimes=None):
            return pd.Series([1.0, 0.0, 1.0, 0.0], index=data.index)

    bt = run_backtest_pipeline(
        df=df,
        strategy=MockStrat(),
        commission_bps=0.0,
        slippage_bps=0.0,
        liquidate_at_end=False,
    )

    # Bar 0: asset ret 0, pos at -1 was 0 -> gross ret 0
    # Bar 1: asset ret +10% (100 -> 110). Position held was pos[0]=1.0 -> earned +10%
    # Bar 2: asset ret -20% (110 -> 88). Position held was pos[1]=0.0 -> earned 0% (avoided loss)
    curve = bt["equity_curve"]
    assert pytest.approx(curve[1]["gross_return"], rel=1e-5) == 0.10
    assert pytest.approx(curve[2]["gross_return"], rel=1e-5) == 0.00


def test_replay_invariance():
    """
    Confirms replay state at date t is identical whether input data ends at t or extends later.
    """
    full_df = create_synthetic_uptrend_dataframe(n_bars=300)
    target_date = str(full_df["date"].iloc[270])[:10]

    strat = get_strategy("momentum", params={"lookback": 40})
    replay_full = get_replay_state_at_date(full_df, strat, target_date=target_date)

    # Now create truncated dataset ending exactly on target_date
    truncated_df = full_df.iloc[:271].copy().reset_index(drop=True)
    replay_truncated = get_replay_state_at_date(truncated_df, strat, target_date=target_date)

    assert replay_full["as_of_date"] == replay_truncated["as_of_date"]
    assert pytest.approx(replay_full["equity"], rel=1e-5) == replay_truncated["equity"]
    assert pytest.approx(replay_full["drawdown"], rel=1e-5) == replay_truncated["drawdown"]
    assert replay_full["regime_known"] == replay_truncated["regime_known"]
    assert replay_full["total_trades_to_date"] == replay_truncated["total_trades_to_date"]
