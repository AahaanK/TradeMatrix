from fastapi import APIRouter

from app.regimes.features import extract_regime_features
from app.regimes.rules_classifier import classify_regimes_rules
from app.schemas.research import (
    OutOfSampleRequest,
    SensitivityRequest,
    WalkForwardRequest,
)
from app.services.market_data import market_data_service
from app.services.out_of_sample import (
    run_out_of_sample_split,
    run_walk_forward_optimization,
)
from app.services.robustness import run_parameter_grid

router = APIRouter(prefix="/research", tags=["Research Labs"])


@router.post("/sensitivity")
def evaluate_parameter_sensitivity(req: SensitivityRequest):
    if req.ticker.upper() == "SPY":
        df, _ = market_data_service.load_bundled_data(ticker="SPY", adjusted=req.adjusted)
    else:
        df, _ = market_data_service.fetch_yfinance_data(
            ticker=req.ticker, interval=req.interval, adjusted=req.adjusted
        )

    features = extract_regime_features(df)
    regimes = classify_regimes_rules(features)

    res = run_parameter_grid(
        df=df,
        strategy_name=req.strategy,
        param1_name=req.param1_name,
        param1_values=req.param1_values,
        param2_name=req.param2_name,
        param2_values=req.param2_values,
        base_params=req.base_params,
        regimes=regimes,
        commission_bps=req.commission_bps,
        slippage_bps=req.slippage_bps,
    )
    return res


@router.post("/out-of-sample")
def evaluate_out_of_sample(req: OutOfSampleRequest):
    if req.ticker.upper() == "SPY":
        df, _ = market_data_service.load_bundled_data(ticker="SPY", adjusted=req.adjusted)
    else:
        df, _ = market_data_service.fetch_yfinance_data(
            ticker=req.ticker, interval=req.interval, adjusted=req.adjusted
        )

    # Default grid if not provided
    grid = req.param_grid
    if not grid:
        if req.strategy == "momentum":
            grid = [{"lookback": lb, "threshold": th} for lb in [21, 63, 126] for th in [0.0, 0.02]]
        elif req.strategy == "mean_reversion":
            grid = [{"lookback": lb, "entry_z": ez, "exit_z": -0.5} for lb in [10, 20, 30] for ez in [-2.0, -1.5]]
        else:
            grid = [{"fast": f, "slow": s} for f in [10, 20] for s in [50, 100]]

    res = run_out_of_sample_split(
        df=df,
        strategy_name=req.strategy,
        param_grid=grid,
        train_end_date=req.train_end_date,
        test_start_date=req.test_start_date,
        test_end_date=req.test_end_date,
        target_metric=req.target_metric,
        commission_bps=req.commission_bps,
        slippage_bps=req.slippage_bps,
    )
    return res


@router.post("/walk-forward")
def evaluate_walk_forward(req: WalkForwardRequest):
    if req.ticker.upper() == "SPY":
        df, _ = market_data_service.load_bundled_data(ticker="SPY", adjusted=req.adjusted)
    else:
        df, _ = market_data_service.fetch_yfinance_data(
            ticker=req.ticker, interval=req.interval, adjusted=req.adjusted
        )

    grid = req.param_grid
    if not grid:
        if req.strategy == "momentum":
            grid = [{"lookback": lb, "threshold": 0.0} for lb in [21, 63, 126]]
        elif req.strategy == "mean_reversion":
            grid = [{"lookback": lb, "entry_z": -2.0, "exit_z": -0.5} for lb in [10, 20, 30]]
        else:
            grid = [{"fast": 20, "slow": s} for s in [50, 100]]

    res = run_walk_forward_optimization(
        df=df,
        strategy_name=req.strategy,
        param_grid=grid,
        n_folds=req.n_folds,
        target_metric=req.target_metric,
        commission_bps=req.commission_bps,
        slippage_bps=req.slippage_bps,
    )
    return res
