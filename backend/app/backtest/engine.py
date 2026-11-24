"""
Quantitative Backtesting Engine.
Executes strategies with strict causal timing (position.shift(1) * returns),
computes exact transaction costs, extracts trade logs, and computes performance.
"""

from typing import Any

import numpy as np
import pandas as pd

from app.analytics.indicators import compute_drawdown_series, compute_simple_returns
from app.analytics.metrics import calculate_performance_metrics
from app.strategies.base import Strategy


def run_backtest_pipeline(
    df: pd.DataFrame,
    strategy: Strategy,
    regimes: pd.Series | None = None,
    commission_bps: float = 5.0,
    slippage_bps: float = 5.0,
    initial_capital: float = 100000.0,
    liquidate_at_end: bool = True,
    annual_rf: float = 0.0,
    annualization_factor: int = 252,
) -> dict[str, Any]:
    """
    Executes the standard backtesting pipeline:
    1. Compute target positions at close of t: target_pos[t]
    2. Executed positions at t+1: exec_pos[t] = target_pos[t-1]
    3. Turnover: |target_pos[t] - target_pos[t-1]|
    4. Gross return: exec_pos * asset_return
    5. Cost: turnover * (commission_bps + slippage_bps) / 10,000
    6. Net return: gross_return - cost
    7. Equity curve: E_t = E_{t-1} * (1 + net_return_t)
    8. Trade log extraction
    9. Performance & risk metrics
    """
    n = len(df)
    if n < 2:
        raise ValueError("Backtest requires at least 2 bars of data.")

    close = df["close"]
    dates = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    asset_returns = compute_simple_returns(close).fillna(0.0)

    # 1. Target positions at close of t
    target_pos = strategy.target_position(df, regimes=regimes).fillna(0.0)
    target_pos = target_pos.clip(lower=-1.0, upper=1.0)

    # 2. Executed positions (held during period t earned from close t-1 to close t)
    exec_pos = target_pos.shift(1).fillna(0.0)

    # 3. Turnover at t: change from position at t-1 to position at t
    # First trade entry is turnover from 0
    prev_target = target_pos.shift(1).fillna(0.0)
    turnover = (target_pos - prev_target).abs()
    turnover.iloc[0] = abs(target_pos.iloc[0])

    if liquidate_at_end and target_pos.iloc[-1] != 0.0:
        turnover.iloc[-1] += abs(target_pos.iloc[-1])

    # 4. Total transaction cost rate (commission + slippage in bps)
    total_cost_rate = (commission_bps + slippage_bps) / 10000.0

    # 5. Returns
    gross_returns = exec_pos * asset_returns
    net_returns = gross_returns - (turnover * total_cost_rate)

    # 6. Equity Curves
    gross_equity = initial_capital * (1.0 + gross_returns).cumprod()
    net_equity = initial_capital * (1.0 + net_returns).cumprod()

    # Drawdowns
    _, gross_dd = compute_drawdown_series(gross_equity)
    running_peak, net_dd = compute_drawdown_series(net_equity)

    # 7. Extract Trades
    trades = extract_trades(
        dates=dates,
        prices=close,
        positions=target_pos,
        net_returns=net_returns,
        gross_returns=gross_returns,
        regimes=regimes,
    )

    # 8. Closed trades for metrics
    closed_trades = [t for t in trades if not t["is_open"]]

    # 9. Performance Metrics
    metrics = calculate_performance_metrics(
        net_returns=net_returns,
        equity_curve=net_equity,
        positions=exec_pos,
        turnover_series=turnover,
        closed_trades=closed_trades,
        annual_rf=annual_rf,
        annualization_factor=annualization_factor,
    )

    # Gross metrics comparison
    gross_metrics = calculate_performance_metrics(
        net_returns=gross_returns,
        equity_curve=gross_equity,
        positions=exec_pos,
        turnover_series=turnover,
        closed_trades=[t for t in trades if not t["is_open"]],
        annual_rf=annual_rf,
        annualization_factor=annualization_factor,
    )

    # 10. Format time series for charts
    equity_series = []
    for i in range(n):
        equity_series.append({
            "date": dates.iloc[i],
            "close": float(close.iloc[i]),
            "position": float(target_pos.iloc[i]),
            "gross_return": float(gross_returns.iloc[i]),
            "net_return": float(net_returns.iloc[i]),
            "gross_equity": round(float(gross_equity.iloc[i]), 2),
            "net_equity": round(float(net_equity.iloc[i]), 2),
            "drawdown": round(float(net_dd.iloc[i]), 4),
            "peak": round(float(running_peak.iloc[i]), 2),
            "regime": str(regimes.iloc[i]) if regimes is not None else "Undefined",
        })

    # Benchmark: Buy & Hold
    benchmark_net_returns = asset_returns.copy()
    benchmark_net_returns.iloc[0] -= total_cost_rate  # initial entry cost
    benchmark_equity = initial_capital * (1.0 + benchmark_net_returns).cumprod()
    _, benchmark_dd = compute_drawdown_series(benchmark_equity)
    benchmark_metrics = calculate_performance_metrics(
        net_returns=benchmark_net_returns,
        equity_curve=benchmark_equity,
        positions=pd.Series(1.0, index=df.index),
        turnover_series=pd.Series(0.0, index=df.index),
        closed_trades=[],
        annual_rf=annual_rf,
        annualization_factor=annualization_factor,
    )

    return {
        "metrics": metrics,
        "gross_metrics": gross_metrics,
        "benchmark_metrics": benchmark_metrics,
        "trades": trades,
        "equity_curve": equity_series,
        "cost_assumptions": {
            "commission_bps": commission_bps,
            "slippage_bps": slippage_bps,
            "total_bps": commission_bps + slippage_bps,
            "total_cost_paid": float(initial_capital * (gross_equity.iloc[-1] - net_equity.iloc[-1]) / gross_equity.iloc[-1]) if gross_equity.iloc[-1] > 0 else 0.0,
        },
    }


def extract_trades(
    dates: pd.Series,
    prices: pd.Series,
    positions: pd.Series,
    net_returns: pd.Series,
    gross_returns: pd.Series,
    regimes: pd.Series | None = None,
) -> list[dict[str, Any]]:
    """
    Extracts individual continuous non-zero position trades.
    """
    trades: list[dict[str, Any]] = []
    n = len(positions)
    in_trade = False
    entry_idx = 0
    trade_dir = 0.0

    for t in range(n):
        pos = positions.iloc[t]
        if not in_trade:
            if abs(pos) > 1e-6:
                in_trade = True
                entry_idx = t
                trade_dir = pos
        else:
            # Check for position change or exit
            if abs(pos) < 1e-6 or np.sign(pos) != np.sign(trade_dir):
                # Close trade at bar t
                exit_idx = t
                trade_slice_net = net_returns.iloc[entry_idx + 1 : exit_idx + 1]
                trade_slice_gross = gross_returns.iloc[entry_idx + 1 : exit_idx + 1]

                net_ret = float((1.0 + trade_slice_net).prod() - 1.0) if len(trade_slice_net) > 0 else 0.0
                gross_ret = float((1.0 + trade_slice_gross).prod() - 1.0) if len(trade_slice_gross) > 0 else 0.0

                trades.append({
                    "id": len(trades) + 1,
                    "entry_date": dates.iloc[entry_idx],
                    "entry_price": float(prices.iloc[entry_idx]),
                    "exit_date": dates.iloc[exit_idx],
                    "exit_price": float(prices.iloc[exit_idx]),
                    "direction": "long" if trade_dir > 0 else "short",
                    "bars_held": exit_idx - entry_idx,
                    "gross_return": round(gross_ret, 4),
                    "net_return": round(net_ret, 4),
                    "entry_regime": str(regimes.iloc[entry_idx]) if regimes is not None else "Undefined",
                    "is_open": False,
                })

                # If position reversed rather than just exited
                if abs(pos) > 1e-6:
                    entry_idx = t
                    trade_dir = pos
                    in_trade = True
                else:
                    in_trade = False

    # Check for remaining open trade at end
    if in_trade:
        trade_slice_net = net_returns.iloc[entry_idx + 1 :]
        trade_slice_gross = gross_returns.iloc[entry_idx + 1 :]
        net_ret = float((1.0 + trade_slice_net).prod() - 1.0) if len(trade_slice_net) > 0 else 0.0
        gross_ret = float((1.0 + trade_slice_gross).prod() - 1.0) if len(trade_slice_gross) > 0 else 0.0

        trades.append({
            "id": len(trades) + 1,
            "entry_date": dates.iloc[entry_idx],
            "entry_price": float(prices.iloc[entry_idx]),
            "exit_date": dates.iloc[-1],
            "exit_price": float(prices.iloc[-1]),
            "direction": "long" if trade_dir > 0 else "short",
            "bars_held": n - 1 - entry_idx,
            "gross_return": round(gross_ret, 4),
            "net_return": round(net_ret, 4),
            "entry_regime": str(regimes.iloc[entry_idx]) if regimes is not None else "Undefined",
            "is_open": True,
        })

    return trades
