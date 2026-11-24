import pandas as pd
from fastapi import APIRouter

from app.backtest.engine import run_backtest_pipeline
from app.regimes.features import extract_regime_features
from app.regimes.rules_classifier import classify_regimes_rules
from app.schemas.risk import RiskAnalyzeRequest
from app.services.market_data import market_data_service
from app.services.risk import (
    calculate_drawdown_duration,
    calculate_var_cvar,
    compute_cost_sensitivity_curve,
    compute_rolling_beta_and_correlation,
    evaluate_stress_presets,
)
from app.strategies.registry import get_strategy

router = APIRouter(prefix="/risk", tags=["Risk Analytics"])


@router.post("/analyze")
def analyze_risk(req: RiskAnalyzeRequest):
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
    regimes = classify_regimes_rules(features)

    strategy = get_strategy(req.strategy, params=req.params)
    bt = run_backtest_pipeline(
        df=df,
        strategy=strategy,
        regimes=regimes,
        commission_bps=req.commission_bps,
        slippage_bps=req.slippage_bps,
    )

    net_returns = pd.Series([b["net_return"] for b in bt["equity_curve"]], index=df.index)
    net_equity = pd.Series([b["net_equity"] for b in bt["equity_curve"]], index=df.index)
    dates = pd.to_datetime(df["date"])

    # 1. VaR and CVaR
    var_val, cvar_val = calculate_var_cvar(net_returns, confidence_level=req.confidence_level)
    var_99, cvar_99 = calculate_var_cvar(net_returns, confidence_level=0.99)

    # 2. Drawdown duration & recovery
    dd_info = calculate_drawdown_duration(net_equity, dates)

    # 3. Rolling beta & correlation to benchmark
    benchmark_returns = df["close"].pct_change().fillna(0.0)
    roll_beta, roll_corr = compute_rolling_beta_and_correlation(net_returns, benchmark_returns)

    rolling_risk_series = []
    dates_str = dates.dt.strftime("%Y-%m-%d")
    for i in range(len(df)):
        rolling_risk_series.append({
            "date": dates_str.iloc[i],
            "beta": float(roll_beta.iloc[i]) if not roll_beta.isna().iloc[i] else None,
            "correlation": float(roll_corr.iloc[i]) if not roll_corr.isna().iloc[i] else None,
        })

    # 4. Crisis stress presets
    stress_results = evaluate_stress_presets(
        df=df,
        strategy=strategy,
        regimes=regimes,
        commission_bps=req.commission_bps,
        slippage_bps=req.slippage_bps,
    )

    # 5. Cost sensitivity curve & break-even cost
    sensitivity = compute_cost_sensitivity_curve(
        df=df,
        strategy=strategy,
        regimes=regimes,
    )

    return {
        "ticker": req.ticker.upper(),
        "strategy": req.strategy,
        "confidence_level": req.confidence_level,
        "var": var_val,
        "cvar": cvar_val,
        "var_99": var_99,
        "cvar_99": cvar_99,
        "drawdown_analytics": dd_info,
        "rolling_risk": rolling_risk_series,
        "stress_presets": stress_results,
        "cost_sensitivity": sensitivity,
        "disclaimer": "Historical risk estimates based on past return distributions. No guarantee of future performance.",
    }
