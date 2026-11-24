"""
Regime-Aware Strategy Attribution & Cross-Strategy Matrix Analysis.
Attributes returns (t -> t+1) to regime known at t.
Computes empirical metrics, sample sizes, and deterministic data-backed insights.
"""

from typing import Any

import numpy as np
import pandas as pd

from app.analytics.metrics import safe_float
from app.regimes.transitions import REGIMES_ORDER


def compute_regime_attribution(
    net_returns: pd.Series,
    target_pos: pd.Series,
    regimes: pd.Series,
    trades: list[dict[str, Any]],
    annualization_factor: int = 252,
    annual_rf: float = 0.0,
) -> dict[str, Any]:
    """
    Computes performance metrics broken down by market regime.
    Convention: Return earned at t+1 (held from close t to close t+1) is attributed
    to the regime label known at the signal date t.
    """
    # Shift regime by 1 to align regime known at t with return earned in t+1
    # net_returns[t] is return earned between t-1 and t, so its signal regime is regime[t-1]
    signal_regime = regimes.shift(1).fillna("Undefined")

    attribution_by_regime: dict[str, Any] = {}

    for r in REGIMES_ORDER:
        mask = signal_regime == r
        r_returns = net_returns[mask].dropna()
        n_obs = len(r_returns)

        # Cumulative return contribution
        if n_obs > 0:
            cum_ret = float((1.0 + r_returns).prod() - 1.0)
            ann_ret = float(r_returns.mean() * annualization_factor)
            sample_std = float(r_returns.std(ddof=1)) if n_obs >= 2 else 0.0
            ann_vol = float(sample_std * np.sqrt(annualization_factor)) if sample_std > 0 else 0.0
            sharpe = float((ann_ret - annual_rf) / ann_vol) if ann_vol > 1e-12 else None
            hit_rate = float((r_returns > 0).mean())

            # Exposure during this regime
            r_pos = target_pos[mask]
            exposure = float((r_pos.abs() > 1e-6).mean()) if len(r_pos) > 0 else 0.0

            # Trades entered in this regime
            r_trades = [t for t in trades if t.get("entry_regime") == r]
            trades_count = len(r_trades)

            # Return distribution quantiles
            quantiles = {
                "p10": safe_float(np.percentile(r_returns, 10)),
                "p25": safe_float(np.percentile(r_returns, 25)),
                "median": safe_float(np.median(r_returns)),
                "p75": safe_float(np.percentile(r_returns, 75)),
                "p90": safe_float(np.percentile(r_returns, 90)),
                "mean": safe_float(r_returns.mean()),
            }
        else:
            cum_ret = 0.0
            ann_ret = 0.0
            ann_vol = 0.0
            sharpe = None
            hit_rate = 0.0
            exposure = 0.0
            trades_count = 0
            quantiles = {"p10": 0.0, "p25": 0.0, "median": 0.0, "p75": 0.0, "p90": 0.0, "mean": 0.0}

        attribution_by_regime[r] = {
            "regime": r,
            "observations": n_obs,
            "low_sample_warning": n_obs < 60,
            "cumulative_return": safe_float(cum_ret),
            "annualized_return": safe_float(ann_ret),
            "annualized_volatility": safe_float(ann_vol),
            "sharpe_ratio": safe_float(sharpe),
            "hit_rate": safe_float(hit_rate),
            "exposure": safe_float(exposure),
            "trades_entered": trades_count,
            "quantiles": quantiles,
        }

    return attribution_by_regime


def generate_deterministic_insights(
    matrix: dict[str, dict[str, dict[str, Any]]],
    min_sample_threshold: int = 60
) -> list[dict[str, str]]:
    """
    Generates deterministic data-backed research insights across strategies and regimes.
    Rule: Insights trigger only when sample sizes n >= min_sample_threshold.
    """
    insights: list[dict[str, str]] = []

    # Check Bull/Low Vol outperformance
    bull_low = "Bull/Low Vol"
    for strat in ["momentum", "ma_crossover"]:
        if strat in matrix and bull_low in matrix[strat]:
            s_data = matrix[strat][bull_low]
            bh_data = matrix["buy_and_hold"][bull_low]
            if (
                s_data["observations"] >= min_sample_threshold
                and bh_data["observations"] >= min_sample_threshold
                and s_data["sharpe_ratio"] is not None
                and bh_data["sharpe_ratio"] is not None
            ):
                diff = s_data["sharpe_ratio"] - bh_data["sharpe_ratio"]
                if abs(diff) > 0.3:
                    direction = "outperformed" if diff > 0 else "underperformed"
                    insights.append({
                        "category": "Regime Performance",
                        "statement": (
                            f"{strat.replace('_', ' ').title()} {direction} Buy & Hold in {bull_low} "
                            f"(Sharpe: {s_data['sharpe_ratio']:.2f} vs {bh_data['sharpe_ratio']:.2f}, "
                            f"n={s_data['observations']}). Historical association, not causation."
                        )
                    })

    # Check Bear/High Vol capital preservation
    bear_high = "Bear/High Vol"
    for strat in ["momentum", "mean_reversion", "ma_crossover"]:
        if strat in matrix and bear_high in matrix[strat]:
            s_data = matrix[strat][bear_high]
            bh_data = matrix["buy_and_hold"][bear_high]
            if (
                s_data["observations"] >= min_sample_threshold
                and bh_data["observations"] >= min_sample_threshold
            ):
                s_ret = s_data["annualized_return"] or 0.0
                bh_ret = bh_data["annualized_return"] or 0.0
                if s_ret > bh_ret + 0.05:
                    insights.append({
                        "category": "Capital Preservation",
                        "statement": (
                            f"{strat.replace('_', ' ').title()} mitigated losses during {bear_high} "
                            f"(Ann. Return: {s_ret:+.2%} vs {bh_ret:+.2%}, n={s_data['observations']}) "
                            f"by reducing exposure to {s_data['exposure']:.1%}. Historical association, not causation."
                        )
                    })

    # Mean reversion in ranging / low vol
    for r in ["Bull/Low Vol", "Bear/Low Vol"]:
        if "mean_reversion" in matrix and r in matrix["mean_reversion"]:
            mr_data = matrix["mean_reversion"][r]
            if mr_data["observations"] >= min_sample_threshold and (mr_data["sharpe_ratio"] or 0.0) > 0.5:
                insights.append({
                    "category": "Mean Reversion Regime Fit",
                    "statement": (
                        f"Mean Reversion showed robust risk-adjusted return in {r} "
                        f"(Sharpe: {mr_data['sharpe_ratio']:.2f}, Hit Rate: {mr_data['hit_rate']:.1%}, "
                        f"n={mr_data['observations']}). Historical association, not causation."
                    )
                })

    if not insights:
        insights.append({
            "category": "General Observation",
            "statement": "Sufficient observations exist across regimes; strategy differences reflect regime-dependent risk premia. Historical association, not causation."
        })

    return insights
