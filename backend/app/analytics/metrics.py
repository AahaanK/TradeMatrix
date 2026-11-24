"""
Quantitative Performance and Risk Metrics Library.
Calculates net-of-cost performance with strict edge-case handling.
Returns valid JSON numbers or null with reason strings. Never returns NaN or Infinity.
"""

import math
from typing import Any

import numpy as np
import pandas as pd

from app.analytics.indicators import annual_to_period_rf, compute_drawdown_series


def safe_float(val: Any) -> float | None:
    """Converts a value to float if finite, else returns None."""
    if val is None:
        return None
    try:
        f = float(val)
        return f if math.isfinite(f) else None
    except (ValueError, TypeError):
        return None


def calculate_performance_metrics(
    net_returns: pd.Series,
    equity_curve: pd.Series,
    positions: pd.Series,
    turnover_series: pd.Series,
    closed_trades: list[dict],
    annual_rf: float = 0.0,
    annualization_factor: int = 252,
) -> dict[str, Any]:
    """
    Computes standard quantitative strategy metrics with deterministic edge-case handling.
    """
    notes: list[str] = []
    clean_returns = net_returns.dropna()
    n_obs = len(clean_returns)

    # 1. Total Return
    if len(equity_curve) >= 2 and equity_curve.iloc[0] > 0:
        total_return = (equity_curve.iloc[-1] / equity_curve.iloc[0]) - 1.0
    else:
        total_return = 0.0

    # 2. CAGR
    cagr: float | None = None
    if n_obs > 0 and len(equity_curve) >= 2 and equity_curve.iloc[0] > 0:
        growth_factor = equity_curve.iloc[-1] / equity_curve.iloc[0]
        if growth_factor > 0:
            cagr = (growth_factor ** (annualization_factor / max(n_obs, 1))) - 1.0
            if n_obs < annualization_factor:
                notes.append("CAGR flagged: history is less than 1 year (n < N).")
        else:
            cagr = -1.0

    # 3. Annualized Volatility
    ann_vol: float | None = None
    if n_obs >= 2:
        sample_std = clean_returns.std(ddof=1)
        if math.isfinite(sample_std):
            ann_vol = float(sample_std * np.sqrt(annualization_factor))
    else:
        notes.append("Annualized volatility: fewer than 2 return observations.")

    # 4. Sharpe Ratio
    sharpe: float | None = None
    period_rf = annual_to_period_rf(annual_rf, annualization_factor)
    excess_returns = clean_returns - period_rf
    if ann_vol is not None and ann_vol > 1e-12:
        mean_excess = excess_returns.mean()
        sharpe = float((mean_excess / clean_returns.std(ddof=1)) * np.sqrt(annualization_factor))
    else:
        notes.append("Sharpe ratio: zero or undefined return standard deviation.")

    # 5. Sortino Ratio
    sortino: float | None = None
    downside_diff = np.minimum(excess_returns, 0.0)
    downside_sq = np.square(downside_diff)
    if len(downside_sq) >= 2:
        downside_dev = np.sqrt(downside_sq.sum() / (len(downside_sq) - 1))
        if downside_dev > 1e-12:
            sortino = float((excess_returns.mean() / downside_dev) * np.sqrt(annualization_factor))
        else:
            notes.append("Sortino ratio: no downside deviations below risk-free rate.")
    else:
        notes.append("Sortino ratio: insufficient observations.")

    # 6. Max Drawdown & Running Peak
    _, drawdown = compute_drawdown_series(equity_curve)
    max_drawdown = float(drawdown.min()) if len(drawdown) > 0 else 0.0
    if not math.isfinite(max_drawdown):
        max_drawdown = 0.0

    # 7. Calmar Ratio
    calmar: float | None = None
    if cagr is not None and abs(max_drawdown) > 1e-6:
        calmar = float(cagr / abs(max_drawdown))
    else:
        notes.append("Calmar ratio: max drawdown is zero or CAGR is undefined.")

    # 8. Trade Statistics
    n_trades = len(closed_trades)
    if n_trades > 0:
        winning_trades = [t for t in closed_trades if t.get("net_return", 0.0) > 0.0]
        losing_trades = [t for t in closed_trades if t.get("net_return", 0.0) < 0.0]
        win_rate = float(len(winning_trades) / n_trades)

        sum_wins = sum(t.get("net_return", 0.0) for t in winning_trades)
        sum_losses = abs(sum(t.get("net_return", 0.0) for t in losing_trades))

        if sum_losses > 1e-12:
            profit_factor: float | None = float(sum_wins / sum_losses)
        elif sum_wins > 0:
            profit_factor = None
            notes.append("Profit factor: no losing trades recorded (infinite profit factor).")
        else:
            profit_factor = None

        avg_trade_return: float | None = float(sum(t.get("net_return", 0.0) for t in closed_trades) / n_trades)
    else:
        win_rate = None
        profit_factor = None
        avg_trade_return = None
        notes.append("Trade metrics: zero closed trades.")

    # 9. Exposure (% of bars with position != 0)
    if len(positions) > 0:
        active_bars = (positions.abs() > 1e-6).sum()
        exposure = float(active_bars / len(positions))
    else:
        exposure = 0.0

    # 10. Annualized Turnover
    if len(turnover_series) > 0 and n_obs > 0:
        total_turnover = float(turnover_series.sum())
        annualized_turnover = float(total_turnover * (annualization_factor / n_obs))
    else:
        annualized_turnover = 0.0

    return {
        "total_return": safe_float(total_return),
        "cagr": safe_float(cagr),
        "annualized_volatility": safe_float(ann_vol),
        "sharpe_ratio": safe_float(sharpe),
        "sortino_ratio": safe_float(sortino),
        "max_drawdown": safe_float(max_drawdown),
        "calmar_ratio": safe_float(calmar),
        "win_rate": safe_float(win_rate),
        "profit_factor": safe_float(profit_factor),
        "trades_count": n_trades,
        "avg_trade_return": safe_float(avg_trade_return),
        "exposure": safe_float(exposure),
        "annualized_turnover": safe_float(annualized_turnover),
        "risk_free_rate_used": annual_rf,
        "annualization_constant_used": annualization_factor,
        "notes": notes,
    }
