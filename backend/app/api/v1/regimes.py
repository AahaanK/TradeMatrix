from fastapi import APIRouter

from app.regimes.features import extract_regime_features
from app.regimes.kmeans_classifier import classify_regimes_kmeans
from app.regimes.rules_classifier import classify_regimes_rules
from app.regimes.transitions import compute_regime_transitions
from app.schemas.regimes import RegimeAnalysisRequest, RegimeAnalysisResponse
from app.services.market_data import compute_dataset_fingerprint, market_data_service

router = APIRouter(prefix="/regimes", tags=["Regimes"])


@router.post("/analyze", response_model=RegimeAnalysisResponse)
def analyze_regimes(req: RegimeAnalysisRequest):
    if req.ticker.upper() == "SPY" and req.start_date is None and req.end_date is None:
        df, _ = market_data_service.load_bundled_data(ticker="SPY", adjusted=req.adjusted)
    else:
        df, _ = market_data_service.fetch_yfinance_data(
            ticker=req.ticker, interval=req.interval, start=req.start_date, end=req.end_date, adjusted=req.adjusted
        )

    # Filter date range if specified
    if req.start_date or req.end_date:
        dates_str = df["date"].dt.strftime("%Y-%m-%d")
        mask = (dates_str >= (req.start_date or "1900-01-01")) & (dates_str <= (req.end_date or "2100-01-01"))
        df = df[mask].reset_index(drop=True)

    fingerprint = compute_dataset_fingerprint(df, "market", req.ticker, req.interval, req.adjusted)
    features = extract_regime_features(df)

    kmeans_meta = None
    if req.method == "kmeans":
        labels, kmeans_meta = classify_regimes_kmeans(features)
    else:
        labels = classify_regimes_rules(
            features,
            vol_percentile=req.vol_percentile,
            min_history=req.min_history,
            persistence_filter=req.persistence_filter,
            require_sma=req.require_sma,
            require_momentum=req.require_momentum,
        )

    dates = df["date"].dt.strftime("%Y-%m-%d")
    trans_intel = compute_regime_transitions(labels, dates)

    timeline = [
        {
            "date": dates.iloc[i],
            "close": float(df["close"].iloc[i]),
            "regime": str(labels.iloc[i]),
            "short_momentum": float(features["short_momentum"].iloc[i]) if not features["short_momentum"].isna().iloc[i] else None,
            "medium_momentum": float(features["medium_momentum"].iloc[i]) if not features["medium_momentum"].isna().iloc[i] else None,
            "rolling_volatility": float(features["rolling_volatility"].iloc[i]) if not features["rolling_volatility"].isna().iloc[i] else None,
            "trend_strength": float(features["trend_strength"].iloc[i]) if not features["trend_strength"].isna().iloc[i] else None,
            "drawdown": float(features["drawdown"].iloc[i]) if not features["drawdown"].isna().iloc[i] else None,
        }
        for i in range(len(df))
    ]

    last_idx = len(df) - 1
    latest_regime = {
        "as_of_date": dates.iloc[last_idx],
        "label": str(labels.iloc[last_idx]),
        "close": float(df["close"].iloc[last_idx]),
        "rolling_volatility": float(features["rolling_volatility"].iloc[last_idx]) if not features["rolling_volatility"].isna().iloc[last_idx] else None,
        "medium_momentum": float(features["medium_momentum"].iloc[last_idx]) if not features["medium_momentum"].isna().iloc[last_idx] else None,
        "price_to_sma": float(features["price_to_sma"].iloc[last_idx]) if not features["price_to_sma"].isna().iloc[last_idx] else None,
    }

    return RegimeAnalysisResponse(
        ticker=req.ticker.upper(),
        interval=req.interval,
        dataset_fingerprint=fingerprint,
        total_bars=len(df),
        method=req.method,
        labels=labels.tolist(),
        timeline=timeline,
        distribution=trans_intel["regime_distribution"],
        transition_intelligence=trans_intel,
        latest_regime=latest_regime,
        kmeans_metadata=kmeans_meta,
    )
