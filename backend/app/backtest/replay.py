"""
Research Replay State Service.
Computes strictly past-only backtest state at date t.
Enforces invariance: replay state at date t is identical whether data ends at t or extends later.
"""

from typing import Any

import pandas as pd

from app.backtest.engine import run_backtest_pipeline
from app.regimes.features import extract_regime_features
from app.regimes.rules_classifier import classify_regimes_rules
from app.strategies.base import Strategy


def get_replay_state_at_date(
    full_df: pd.DataFrame,
    strategy: Strategy,
    target_date: str,
    regime_method: str = "rules",
    commission_bps: float = 5.0,
    slippage_bps: float = 5.0,
    initial_capital: float = 100000.0,
) -> dict[str, Any]:
    """
    Truncates data strictly to date <= target_date, computes regimes and backtest,
    and returns exact point-in-time state at target_date.
    """
    # 1. Truncate data up to target_date
    df_dates = pd.to_datetime(full_df["date"]).dt.strftime("%Y-%m-%d")
    mask = df_dates <= str(target_date)[:10]
    sub_df = full_df[mask].copy().reset_index(drop=True)

    if len(sub_df) < 2:
        raise ValueError(f"Insufficient historical data prior to {target_date} (bars < 2).")

    # 2. Causally classify regimes on truncated data
    features = extract_regime_features(sub_df)
    regimes = classify_regimes_rules(features)

    # 3. Run backtest pipeline on truncated data
    bt_res = run_backtest_pipeline(
        df=sub_df,
        strategy=strategy,
        regimes=regimes,
        commission_bps=commission_bps,
        slippage_bps=slippage_bps,
        initial_capital=initial_capital,
        liquidate_at_end=False,  # Keep open position as-of date t
    )

    last_equity_bar = bt_res["equity_curve"][-1]
    last_trade = bt_res["trades"][-1] if bt_res["trades"] else None

    return {
        "as_of_date": last_equity_bar["date"],
        "close_price": last_equity_bar["close"],
        "position_held": last_equity_bar["position"],
        "regime_known": last_equity_bar["regime"],
        "equity": last_equity_bar["net_equity"],
        "drawdown": last_equity_bar["drawdown"],
        "running_peak": last_equity_bar["peak"],
        "cumulative_net_return": (last_equity_bar["net_equity"] / initial_capital) - 1.0,
        "total_trades_to_date": len(bt_res["trades"]),
        "latest_trade": last_trade,
        "historical_equity_slice": bt_res["equity_curve"],
        "metrics_to_date": bt_res["metrics"],
    }
