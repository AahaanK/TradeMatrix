import pandas as pd
from fastapi import APIRouter

from app.backtest.attribution import (
    compute_regime_attribution,
    generate_deterministic_insights,
)
from app.backtest.engine import run_backtest_pipeline
from app.backtest.replay import get_replay_state_at_date
from app.regimes.features import extract_regime_features
from app.regimes.rules_classifier import classify_regimes_rules
from app.schemas.backtest import (
    BacktestCompareRequest,
    BacktestReplayRequest,
    BacktestRunRequest,
)
from app.services.market_data import compute_dataset_fingerprint, market_data_service
from app.strategies.registry import get_strategy

router = APIRouter(prefix="/backtests", tags=["Backtests"])


@router.post("/run")
def run_backtest(req: BacktestRunRequest):
    if req.ticker.upper() == "SPY" and req.start_date is None and req.end_date is None:
        df, _ = market_data_service.load_bundled_data(ticker="SPY", adjusted=req.adjusted)
    else:
        df, _ = market_data_service.fetch_yfinance_data(
            ticker=req.ticker, interval=req.interval, start=req.start_date, end=req.end_date, adjusted=req.adjusted
        )

    if req.start_date or req.end_date:
        dates_str = df["date"].dt.strftime("%Y-%m-%d")
        mask = (dates_str >= (req.start_date or "1900-01-01")) & (dates_str <= (req.end_date or "2100-01-01"))
        df = df[mask].reset_index(drop=True)

    source = "bundled" if req.ticker.upper() == "SPY" and req.start_date is None and req.end_date is None else "yfinance"
    fingerprint = compute_dataset_fingerprint(df, source, req.ticker, req.interval, req.adjusted)

    # Classify regimes
    features = extract_regime_features(df)
    regimes = classify_regimes_rules(features, **req.regime_params)

    # Execute strategy
    strategy = get_strategy(req.strategy, params=req.params)
    bt_res = run_backtest_pipeline(
        df=df,
        strategy=strategy,
        regimes=regimes,
        commission_bps=req.commission_bps,
        slippage_bps=req.slippage_bps,
        initial_capital=req.initial_capital,
        annual_rf=req.annual_rf,
    )

    # Regime attribution
    net_ret_series = pd.Series([b["net_return"] for b in bt_res["equity_curve"]], index=df.index)
    pos_series = pd.Series([b["position"] for b in bt_res["equity_curve"]], index=df.index)
    attribution = compute_regime_attribution(
        net_returns=net_ret_series,
        target_pos=pos_series,
        regimes=regimes,
        trades=bt_res["trades"],
        annual_rf=req.annual_rf,
    )

    return {
        "ticker": req.ticker.upper(),
        "source": source,
        "strategy": req.strategy,
        "dataset_fingerprint": fingerprint,
        "metrics": bt_res["metrics"],
        "gross_metrics": bt_res["gross_metrics"],
        "benchmark_metrics": bt_res["benchmark_metrics"],
        "regime_metrics": attribution,
        "cost_assumptions": bt_res["cost_assumptions"],
        "equity_curve": bt_res["equity_curve"],
        "trades": bt_res["trades"],
    }


@router.post("/compare")
def compare_strategies(req: BacktestCompareRequest):
    if req.ticker.upper() == "SPY" and req.start_date is None and req.end_date is None:
        df, _ = market_data_service.load_bundled_data(ticker="SPY", adjusted=req.adjusted)
    else:
        df, _ = market_data_service.fetch_yfinance_data(
            ticker=req.ticker, interval=req.interval, start=req.start_date, end=req.end_date, adjusted=req.adjusted
        )

    if req.start_date or req.end_date:
        dates_str = df["date"].dt.strftime("%Y-%m-%d")
        mask = (dates_str >= (req.start_date or "1900-01-01")) & (dates_str <= (req.end_date or "2100-01-01"))
        df = df[mask].reset_index(drop=True)

    features = extract_regime_features(df)
    regimes = classify_regimes_rules(features, **req.regime_params)

    strategies_to_compare = ["momentum", "mean_reversion", "ma_crossover", "buy_and_hold"]
    results_by_strat = {}
    attribution_by_strat = {}

    for s_name in strategies_to_compare:
        strat = get_strategy(s_name)
        bt = run_backtest_pipeline(
            df=df,
            strategy=strat,
            regimes=regimes,
            commission_bps=req.commission_bps,
            slippage_bps=req.slippage_bps,
            annual_rf=req.annual_rf,
        )
        results_by_strat[s_name] = bt["metrics"]

        net_ret = pd.Series([b["net_return"] for b in bt["equity_curve"]], index=df.index)
        pos = pd.Series([b["position"] for b in bt["equity_curve"]], index=df.index)
        attrib = compute_regime_attribution(
            net_returns=net_ret,
            target_pos=pos,
            regimes=regimes,
            trades=bt["trades"],
            annual_rf=req.annual_rf,
        )
        attribution_by_strat[s_name] = attrib

    # Build comparison matrix
    insights = generate_deterministic_insights(attribution_by_strat)

    return {
        "ticker": req.ticker.upper(),
        "strategies": strategies_to_compare,
        "overall_metrics": results_by_strat,
        "regime_matrix": attribution_by_strat,
        "insights": insights,
        "attribution_convention": "Signal Date t attribution (Return t->t+1 attributed to regime known at t)",
    }


@router.post("/replay")
def replay_backtest_state(req: BacktestReplayRequest):
    if req.ticker.upper() == "SPY":
        df, _ = market_data_service.load_bundled_data(ticker="SPY", adjusted=req.adjusted)
    else:
        df, _ = market_data_service.fetch_yfinance_data(
            ticker=req.ticker, interval=req.interval, adjusted=req.adjusted
        )

    strategy = get_strategy(req.strategy, params=req.params)
    replay_state = get_replay_state_at_date(
        full_df=df,
        strategy=strategy,
        target_date=req.target_date,
        commission_bps=req.commission_bps,
        slippage_bps=req.slippage_bps,
        initial_capital=req.initial_capital,
    )
    return replay_state
