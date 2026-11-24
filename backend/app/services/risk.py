"""
Risk Analytics & Stress Testing Engine.
Computes empirical VaR/CVaR, drawdown duration/recovery, rolling beta,
historical crisis stress presets, and transaction cost sensitivity curve.
"""

from typing import Any

import numpy as np
import pandas as pd

from app.analytics.metrics import safe_float
from app.backtest.engine import run_backtest_pipeline
from app.strategies.base import Strategy

HISTORICAL_STRESS_PRESETS = [
    {
        "name": "Global Financial Crisis (Lehman)",
        "start": "2008-09-01",
        "end": "2009-03-31",
        "description": "Systemic banking collapse and sharp deleveraging.",
    },
    {
        "name": "COVID-19 Crash",
        "start": "2020-02-19",
        "end": "2020-03-23",
        "description": "Rapid pandemic shock and liquidity contraction.",
    },
    {
        "name": "2022 Rate Hiking & Inflation",
        "start": "2022-01-03",
        "end": "2022-12-30",
        "description": "Synchronous stock-bond selloff driven by rapid Fed rate hikes.",
    },
]


def calculate_var_cvar(
    returns: pd.Series,
    confidence_level: float = 0.95
) -> tuple[float | None, float | None]:
    """
    Computes empirical 1-period Historical Value at Risk (VaR) and Conditional VaR (CVaR).
    Quantile method: empirical lower percentile of return distribution.
    VaR is expressed as positive percentage loss.
    """
    clean = returns.dropna()
    if len(clean) < 10:
        return None, None
    alpha = (1.0 - confidence_level) * 100.0
    cutoff = np.percentile(clean, alpha)
    # VaR as positive loss magnitude
    var = -float(cutoff)
    tail_returns = clean[clean <= cutoff]
    cvar = -float(tail_returns.mean()) if len(tail_returns) > 0 else var
    return safe_float(var), safe_float(cvar)


def calculate_drawdown_duration(
    equity: pd.Series,
    dates: pd.Series
) -> dict[str, Any]:
    """
    Calculates maximum drawdown, longest drawdown duration (in bars), and recovery date.
    """
    running_peak = equity.cummax()
    drawdown = (equity / running_peak) - 1.0

    max_dd = float(drawdown.min()) if len(drawdown) > 0 else 0.0
    max_duration_bars = 0
    curr_duration = 0
    t_start = 0
    max_t_start = 0
    max_t_end = 0

    in_dd = False
    for t in range(len(drawdown)):
        if drawdown.iloc[t] < -1e-6:
            if not in_dd:
                in_dd = True
                curr_duration = 1
                t_start = t
            else:
                curr_duration += 1
            if curr_duration > max_duration_bars:
                max_duration_bars = curr_duration
                max_t_start = t_start
                max_t_end = t
        else:
            in_dd = False
            curr_duration = 0

    # Recovery status of final drawdown
    is_recovered = bool(drawdown.iloc[-1] >= -1e-6)
    recovery_status = "Fully recovered" if is_recovered else f"Under active drawdown ({drawdown.iloc[-1]:.2%})"

    return {
        "max_drawdown": safe_float(max_dd),
        "longest_drawdown_duration_bars": int(max_duration_bars),
        "recovery_status": recovery_status,
        "is_recovered": is_recovered,
        "longest_dd_start": str(dates.iloc[max_t_start])[:10] if max_duration_bars > 0 else None,
        "longest_dd_trough": str(dates.iloc[max_t_end])[:10] if max_duration_bars > 0 else None,
    }


def compute_rolling_beta_and_correlation(
    strategy_returns: pd.Series,
    benchmark_returns: pd.Series,
    window: int = 63,
) -> tuple[pd.Series, pd.Series]:
    """
    Computes 63-bar rolling correlation and rolling beta to benchmark.
    """
    roll_cov = strategy_returns.rolling(window).cov(benchmark_returns)
    roll_bm_var = benchmark_returns.rolling(window).var()
    roll_beta = roll_cov / roll_bm_var
    roll_corr = strategy_returns.rolling(window).corr(benchmark_returns)
    return roll_beta.replace([np.inf, -np.inf], np.nan).fillna(0.0), roll_corr.replace([np.inf, -np.inf], np.nan).fillna(0.0)


def evaluate_stress_presets(
    df: pd.DataFrame,
    strategy: Strategy,
    regimes: pd.Series | None,
    commission_bps: float = 5.0,
    slippage_bps: float = 5.0,
) -> list[dict[str, Any]]:
    """
    Evaluates strategy performance during historical stress presets if covered by dataset.
    """
    dates = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    data_start = dates.iloc[0]
    data_end = dates.iloc[-1]

    results = []
    for preset in HISTORICAL_STRESS_PRESETS:
        p_start = preset["start"]
        p_end = preset["end"]

        # Check coverage
        if data_start <= p_start and data_end >= p_end:
            mask = (dates >= p_start) & (dates <= p_end)
            sub_df = df[mask].copy().reset_index(drop=True)
            sub_regimes = regimes[mask].reset_index(drop=True) if regimes is not None else None

            if len(sub_df) >= 10:
                bt = run_backtest_pipeline(
                    df=sub_df,
                    strategy=strategy,
                    regimes=sub_regimes,
                    commission_bps=commission_bps,
                    slippage_bps=slippage_bps,
                    liquidate_at_end=False,
                )
                m = bt["metrics"]
                bm = bt["benchmark_metrics"]
                results.append({
                    "name": preset["name"],
                    "start": p_start,
                    "end": p_end,
                    "description": preset["description"],
                    "applicable": True,
                    "bars": len(sub_df),
                    "strategy_total_return": m["total_return"],
                    "benchmark_total_return": bm["total_return"],
                    "strategy_max_dd": m["max_drawdown"],
                    "benchmark_max_dd": bm["max_drawdown"],
                    "exposure": m["exposure"],
                })
        else:
            results.append({
                "name": preset["name"],
                "start": p_start,
                "end": p_end,
                "description": preset["description"],
                "applicable": False,
                "note": f"Dataset range ({data_start} to {data_end}) does not cover this crisis period.",
            })

    return results


def compute_cost_sensitivity_curve(
    df: pd.DataFrame,
    strategy: Strategy,
    regimes: pd.Series | None = None,
    cost_grid_bps: list[float] | None = None,
) -> dict[str, Any]:
    """
    Reruns backtest across a cost grid (0 to 50 bps) and computes Sharpe, CAGR, and break-even cost.
    """
    if cost_grid_bps is None:
        cost_grid_bps = [0.0, 2.5, 5.0, 7.5, 10.0, 15.0, 20.0, 30.0, 40.0, 50.0]

    curve = []
    break_even_cost_bps: float | None = None
    prev_sharpe = None
    prev_cost = None

    for bps in cost_grid_bps:
        # Split half to commission, half to slippage
        comm = bps / 2.0
        slip = bps / 2.0
        bt = run_backtest_pipeline(
            df=df,
            strategy=strategy,
            regimes=regimes,
            commission_bps=comm,
            slippage_bps=slip,
            liquidate_at_end=True,
        )
        m = bt["metrics"]
        s = m["sharpe_ratio"]
        cagr = m["cagr"]
        total_ret = m["total_return"]

        curve.append({
            "cost_bps": bps,
            "sharpe_ratio": s,
            "cagr": cagr,
            "total_return": total_ret,
        })

        if s is not None and prev_sharpe is not None and prev_cost is not None:
            if prev_sharpe > 0 >= s:
                # Linear interpolation for zero-crossing
                denom = (prev_sharpe - s)
                if abs(denom) > 1e-9:
                    break_even_cost_bps = round(float(prev_cost + prev_sharpe * (bps - prev_cost) / denom), 1)

        prev_sharpe = s
        prev_cost = bps

    if break_even_cost_bps is None and curve and curve[-1]["sharpe_ratio"] is not None and curve[-1]["sharpe_ratio"] > 0:
        break_even_cost_bps = None  # Did not fall to 0 within 50 bps

    return {
        "curve": curve,
        "break_even_cost_bps": break_even_cost_bps,
        "disclaimer": "Historical estimates under constant liquidity assumptions. No guarantee of future performance.",
    }
