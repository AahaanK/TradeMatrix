"""
Out-of-Sample Testing & Expanding-Window Walk-Forward Optimization Engine.
Guarantees zero future leakage: optimization strictly on training folds, frozen evaluation on test folds.
"""

from typing import Any

import pandas as pd

from app.backtest.engine import run_backtest_pipeline
from app.core.config import settings
from app.regimes.features import extract_regime_features
from app.regimes.rules_classifier import classify_regimes_rules
from app.strategies.registry import get_strategy


def run_out_of_sample_split(
    df: pd.DataFrame,
    strategy_name: str,
    param_grid: list[dict[str, Any]],
    train_end_date: str,
    test_start_date: str,
    test_end_date: str | None = None,
    target_metric: str = "sharpe_ratio",
    commission_bps: float = 5.0,
    slippage_bps: float = 5.0,
) -> dict[str, Any]:
    """
    Executes rigorous train/test split.
    Parameter grid search runs ONLY on train partition.
    Best parameter combination is frozen and evaluated on test partition.
    """
    dates = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")

    # Validate non-overlapping chronological ordering
    if train_end_date >= test_start_date:
        raise ValueError(
            f"Chronological violation: train_end_date ({train_end_date}) must be before test_start_date ({test_start_date})."
        )

    train_mask = dates <= train_end_date
    test_mask = (dates >= test_start_date)
    if test_end_date:
        test_mask = test_mask & (dates <= test_end_date)

    train_df = df[train_mask].copy().reset_index(drop=True)
    test_df = df[test_mask].copy().reset_index(drop=True)

    if len(train_df) < 60:
        raise ValueError("Training partition has fewer than 60 observations.")
    if len(test_df) < 30:
        raise ValueError("Test partition has fewer than 30 observations.")

    # Regimes computed causally on train
    train_features = extract_regime_features(train_df)
    train_regimes = classify_regimes_rules(train_features)

    # 1. Grid search ON TRAIN ONLY
    best_score = -float("inf")
    best_params = param_grid[0] if param_grid else {}
    train_results = []

    for p in param_grid:
        strat = get_strategy(strategy_name, params=p)
        bt_train = run_backtest_pipeline(
            df=train_df,
            strategy=strat,
            regimes=train_regimes,
            commission_bps=commission_bps,
            slippage_bps=slippage_bps,
            liquidate_at_end=False,
        )
        score = bt_train["metrics"].get(target_metric)
        if score is None:
            score = -999.0
        train_results.append({"params": p, "score": score, "metrics": bt_train["metrics"]})
        if score > best_score:
            best_score = score
            best_params = p

    # 2. Frozen evaluation ON TEST ONLY
    # Full dataframe for warm-up of indicators, but evaluation metrics only on test window
    full_features = extract_regime_features(df)
    full_regimes = classify_regimes_rules(full_features)

    best_strat = get_strategy(strategy_name, params=best_params)
    bt_train_best = run_backtest_pipeline(
        df=train_df,
        strategy=best_strat,
        regimes=train_regimes,
        commission_bps=commission_bps,
        slippage_bps=slippage_bps,
        liquidate_at_end=False,
    )
    bt_test_best = run_backtest_pipeline(
        df=test_df,
        strategy=best_strat,
        regimes=full_regimes[test_mask].reset_index(drop=True),
        commission_bps=commission_bps,
        slippage_bps=slippage_bps,
        liquidate_at_end=False,
    )

    in_sample_m = bt_train_best["metrics"]
    out_of_sample_m = bt_test_best["metrics"]

    # 3. Compute metric degradation
    degradation = {}
    for metric_key in ["sharpe_ratio", "cagr", "total_return", "max_drawdown"]:
        is_val = in_sample_m.get(metric_key)
        oos_val = out_of_sample_m.get(metric_key)
        if is_val is not None and oos_val is not None:
            diff = oos_val - is_val
            pct = (diff / abs(is_val)) if abs(is_val) > 1e-9 else 0.0
            degradation[metric_key] = {
                "in_sample": is_val,
                "out_of_sample": oos_val,
                "absolute_diff": round(diff, 4),
                "percent_diff": round(pct, 4),
            }

    # 4. Overfitting Warning
    overfitting_warning = False
    warning_reasons = []
    is_sharpe = in_sample_m.get("sharpe_ratio") or 0.0
    oos_sharpe = out_of_sample_m.get("sharpe_ratio") or 0.0
    if is_sharpe > 0 and oos_sharpe < 0.5 * is_sharpe:
        overfitting_warning = True
        warning_reasons.append(
            f"Out-of-sample Sharpe ({oos_sharpe:.2f}) degraded by more than 50% relative to in-sample ({is_sharpe:.2f})."
        )

    # 5. Diagnostic: rank of chosen parameters in out-of-sample grid
    oos_scores = []
    for p in param_grid:
        s = get_strategy(strategy_name, params=p)
        bt_t = run_backtest_pipeline(
            df=test_df,
            strategy=s,
            regimes=full_regimes[test_mask].reset_index(drop=True),
            commission_bps=commission_bps,
            slippage_bps=slippage_bps,
            liquidate_at_end=False,
        )
        sc = bt_t["metrics"].get(target_metric) or -999.0
        oos_scores.append(sc)

    oos_scores.sort(reverse=True)
    chosen_oos_score = out_of_sample_m.get(target_metric) or -999.0
    rank_in_oos = (oos_scores.index(chosen_oos_score) + 1) if chosen_oos_score in oos_scores else len(oos_scores)

    return {
        "strategy": strategy_name,
        "chosen_params": best_params,
        "target_metric": target_metric,
        "train_window": {"start": dates[train_mask].iloc[0], "end": train_end_date, "bars": len(train_df)},
        "test_window": {"start": test_start_date, "end": dates[test_mask].iloc[-1], "bars": len(test_df)},
        "in_sample_metrics": in_sample_m,
        "out_of_sample_metrics": out_of_sample_m,
        "degradation": degradation,
        "overfitting_warning": overfitting_warning,
        "warning_reasons": warning_reasons,
        "diagnostic_rank_in_oos": f"{rank_in_oos} of {len(param_grid)}",
        "train_equity_curve": bt_train_best["equity_curve"],
        "test_equity_curve": bt_test_best["equity_curve"],
    }


def run_walk_forward_optimization(
    df: pd.DataFrame,
    strategy_name: str,
    param_grid: list[dict[str, Any]],
    n_folds: int = 4,
    target_metric: str = "sharpe_ratio",
    commission_bps: float = 5.0,
    slippage_bps: float = 5.0,
) -> dict[str, Any]:
    """
    Expanding-window walk-forward optimization across n_folds.
    Re-optimizes parameters on each training fold and stitches out-of-sample segments.
    """
    if n_folds > settings.MAX_WALK_FORWARD_FOLDS:
        raise ValueError(f"Folds {n_folds} exceeds MAX_WALK_FORWARD_FOLDS ({settings.MAX_WALK_FORWARD_FOLDS}).")

    total_bars = len(df)
    min_train_bars = 252
    if total_bars < min_train_bars + (n_folds * 40):
        raise ValueError("Insufficient data for requested number of walk-forward folds.")

    dates = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    fold_size = (total_bars - min_train_bars) // n_folds

    folds_summary = []
    stitched_oos_returns = []
    stitched_dates = []

    full_features = extract_regime_features(df)
    full_regimes = classify_regimes_rules(full_features)

    for k in range(n_folds):
        train_end_idx = min_train_bars + (k * fold_size)
        test_start_idx = train_end_idx
        test_end_idx = train_end_idx + fold_size if k < n_folds - 1 else total_bars

        train_sub = df.iloc[:train_end_idx].copy().reset_index(drop=True)
        test_sub = df.iloc[test_start_idx:test_end_idx].copy().reset_index(drop=True)

        train_r = full_regimes.iloc[:train_end_idx].reset_index(drop=True)
        test_r = full_regimes.iloc[test_start_idx:test_end_idx].reset_index(drop=True)

        # Optimize on train_sub
        best_s = -float("inf")
        best_p = param_grid[0]
        for p in param_grid:
            st = get_strategy(strategy_name, params=p)
            bt = run_backtest_pipeline(
                df=train_sub,
                strategy=st,
                regimes=train_r,
                commission_bps=commission_bps,
                slippage_bps=slippage_bps,
                liquidate_at_end=False,
            )
            sc = bt["metrics"].get(target_metric) or -999.0
            if sc > best_s:
                best_s = sc
                best_p = p

        # Evaluate on test_sub
        opt_strat = get_strategy(strategy_name, params=best_p)
        bt_test = run_backtest_pipeline(
            df=test_sub,
            strategy=opt_strat,
            regimes=test_r,
            commission_bps=commission_bps,
            slippage_bps=slippage_bps,
            liquidate_at_end=False,
        )

        folds_summary.append({
            "fold": k + 1,
            "train_range": f"{dates.iloc[0]} to {dates.iloc[train_end_idx - 1]}",
            "test_range": f"{dates.iloc[test_start_idx]} to {dates.iloc[test_end_idx - 1]}",
            "selected_params": best_p,
            "train_metric": best_s,
            "test_metric": bt_test["metrics"].get(target_metric),
            "test_metrics": bt_test["metrics"],
        })

        for bar in bt_test["equity_curve"]:
            stitched_oos_returns.append(bar["net_return"])
            stitched_dates.append(bar["date"])

    # Build stitched out-of-sample equity curve
    stitched_eq = [100000.0]
    for r in stitched_oos_returns:
        stitched_eq.append(stitched_eq[-1] * (1.0 + r))

    return {
        "strategy": strategy_name,
        "n_folds": n_folds,
        "target_metric": target_metric,
        "folds": folds_summary,
        "stitched_test_bars": len(stitched_oos_returns),
        "stitched_start_date": stitched_dates[0] if stitched_dates else "",
        "stitched_end_date": stitched_dates[-1] if stitched_dates else "",
        "stitched_final_equity": round(stitched_eq[-1], 2),
    }
