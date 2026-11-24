"""
Robustness Lab Parameter Grid & Neighbourhood Stability Service.
Evaluates 2D parameter surface up to MAX_GRID_CELLS and calculates 3x3 plateau stability scores.
"""

from typing import Any

import numpy as np
import pandas as pd

from app.backtest.engine import run_backtest_pipeline
from app.core.config import settings
from app.strategies.registry import get_strategy


def run_parameter_grid(
    df: pd.DataFrame,
    strategy_name: str,
    param1_name: str,
    param1_values: list[Any],
    param2_name: str,
    param2_values: list[Any],
    base_params: dict[str, Any] | None = None,
    regimes: pd.Series | None = None,
    commission_bps: float = 5.0,
    slippage_bps: float = 5.0,
) -> dict[str, Any]:
    """
    Reruns backtests over 2D parameter grid and computes neighbourhood stability.
    """
    total_cells = len(param1_values) * len(param2_values)
    if total_cells > settings.MAX_GRID_CELLS:
        raise ValueError(
            f"Grid size {total_cells} exceeds MAX_GRID_CELLS limit ({settings.MAX_GRID_CELLS})."
        )

    base = base_params.copy() if base_params else {}
    n1 = len(param1_values)
    n2 = len(param2_values)

    sharpe_matrix = np.full((n1, n2), np.nan)
    return_matrix = np.full((n1, n2), np.nan)
    drawdown_matrix = np.full((n1, n2), np.nan)

    cells = []

    for i, v1 in enumerate(param1_values):
        for j, v2 in enumerate(param2_values):
            p = base.copy()
            p[param1_name] = v1
            p[param2_name] = v2

            strat = get_strategy(strategy_name, params=p)
            bt = run_backtest_pipeline(
                df=df,
                strategy=strat,
                regimes=regimes,
                commission_bps=commission_bps,
                slippage_bps=slippage_bps,
                liquidate_at_end=False,
            )
            m = bt["metrics"]
            s = m["sharpe_ratio"]
            ret = m["total_return"]
            dd = m["max_drawdown"]

            sharpe_matrix[i, j] = s if s is not None else 0.0
            return_matrix[i, j] = ret if ret is not None else 0.0
            drawdown_matrix[i, j] = dd if dd is not None else 0.0

            cells.append({
                "param1": v1,
                "param2": v2,
                "sharpe_ratio": s,
                "total_return": ret,
                "max_drawdown": dd,
                "i": i,
                "j": j,
            })

    # Compute 3x3 neighbourhood stability scores for each cell
    stability_scores = np.full((n1, n2), np.nan)
    for i in range(n1):
        for j in range(n2):
            i_min = max(0, i - 1)
            i_max = min(n1, i + 2)
            j_min = max(0, j - 1)
            j_max = min(n2, j + 2)
            neighbourhood = sharpe_matrix[i_min:i_max, j_min:j_max]
            valid_vals = neighbourhood[~np.isnan(neighbourhood)]
            if len(valid_vals) > 0:
                mean_s = np.mean(valid_vals)
                std_s = np.std(valid_vals)
                # High mean Sharpe with low variance in neighbourhood indicates a robust plateau
                plateau_score = mean_s / (1.0 + std_s)
                stability_scores[i, j] = round(float(plateau_score), 3)

    # Attach stability to cells
    for cell in cells:
        i = cell["i"]
        j = cell["j"]
        cell["stability_score"] = float(stability_scores[i, j])

    # Find highest in-sample Sharpe cell (never called "best" - labeled as highest in-sample)
    valid_cells = [c for c in cells if c["sharpe_ratio"] is not None]
    top_cell = max(valid_cells, key=lambda c: c["sharpe_ratio"]) if valid_cells else None

    return {
        "strategy": strategy_name,
        "param1_name": param1_name,
        "param1_values": param1_values,
        "param2_name": param2_name,
        "param2_values": param2_values,
        "cells": cells,
        "highest_in_sample_cell": top_cell,
        "total_combinations": total_cells,
    }
