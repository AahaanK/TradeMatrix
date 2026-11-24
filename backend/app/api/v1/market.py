from fastapi import APIRouter, File, Query, UploadFile

from app.analytics.indicators import (
    compute_annualized_rolling_volatility,
    compute_bollinger_bands,
    compute_ema,
    compute_rsi,
    compute_simple_returns,
    compute_sma,
)
from app.schemas.market import MarketDataResponse, OHLCVBar
from app.services.market_data import (
    compute_dataset_fingerprint,
    market_data_service,
    resample_ohlcv,
)

router = APIRouter(prefix="/market", tags=["Market Data"])


@router.get("/data", response_model=MarketDataResponse)
def get_market_data(
    ticker: str = Query("SPY", description="Asset ticker symbol"),
    interval: str = Query("1d", description="Data frequency: 1d, 1wk, 1mo"),
    start: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end: str | None = Query(None, description="End date (YYYY-MM-DD)"),
    adjusted: bool = Query(True, description="Whether to use split and dividend adjusted prices"),
):
    source = "bundled" if ticker.upper() == "SPY" and start is None and end is None else "yfinance"

    if ticker.upper() == "SPY" and start is None and end is None:
        df, report = market_data_service.load_bundled_data(ticker="SPY", adjusted=adjusted)
        # The bundled file is daily; build weekly / monthly bars on request.
        df = resample_ohlcv(df, interval)
    else:
        df, report = market_data_service.fetch_yfinance_data(
            ticker=ticker, interval=interval, start=start, end=end, adjusted=adjusted
        )

    # Filter date range if specified
    if start or end:
        dates = df["date"].dt.strftime("%Y-%m-%d")
        mask = (dates >= (start or "1900-01-01")) & (dates <= (end or "2100-01-01"))
        df = df[mask].reset_index(drop=True)

    fingerprint = compute_dataset_fingerprint(df, source, ticker, interval, adjusted)

    bars = [
        OHLCVBar(
            date=row["date"].strftime("%Y-%m-%d"),
            open=float(row["open"]),
            high=float(row["high"]),
            low=float(row["low"]),
            close=float(row["close"]),
            volume=float(row["volume"]),
            adj_close=float(row["adj_close"]) if "adj_close" in row and row["adj_close"] is not None else None,
        )
        for _, row in df.iterrows()
    ]

    return MarketDataResponse(
        ticker=ticker.upper(),
        source=source,
        interval=interval,
        adjusted=adjusted,
        dataset_fingerprint=fingerprint,
        total_bars=len(bars),
        data_quality=report,
        bars=bars,
    )


@router.post("/upload")
async def upload_market_csv(
    file: UploadFile = File(...),
    interval: str = "1d",
    adjusted: bool = True,
):
    contents = await file.read()
    df, report = market_data_service.parse_csv_upload(contents, interval=interval, adjusted=adjusted)
    fingerprint = compute_dataset_fingerprint(df, "upload", file.filename or "upload", interval, adjusted)

    return {
        "filename": file.filename,
        "dataset_id": f"upload_{fingerprint[:12]}",
        "dataset_fingerprint": fingerprint,
        "total_bars": len(df),
        "data_quality": report,
    }


@router.get("/indicators")
def get_market_indicators(
    ticker: str = "SPY",
    interval: str = "1d",
    adjusted: bool = True,
):
    df, _ = market_data_service.load_bundled_data(ticker=ticker, adjusted=adjusted)
    close = df["close"]
    returns = compute_simple_returns(close)

    sma_20 = compute_sma(close, 20)
    sma_50 = compute_sma(close, 50)
    sma_200 = compute_sma(close, 200)
    ema_21 = compute_ema(close, 21)
    rsi_14 = compute_rsi(close, 14)
    bb_mid, bb_upper, bb_lower = compute_bollinger_bands(close, 20, 2.0)
    vol_21 = compute_annualized_rolling_volatility(returns, 21)

    indicators_data = []
    dates = df["date"].dt.strftime("%Y-%m-%d")
    for i in range(len(df)):
        indicators_data.append({
            "date": dates.iloc[i],
            "close": float(close.iloc[i]),
            "sma_20": float(sma_20.iloc[i]) if not sma_20.isna().iloc[i] else None,
            "sma_50": float(sma_50.iloc[i]) if not sma_50.isna().iloc[i] else None,
            "sma_200": float(sma_200.iloc[i]) if not sma_200.isna().iloc[i] else None,
            "ema_21": float(ema_21.iloc[i]) if not ema_21.isna().iloc[i] else None,
            "rsi_14": float(rsi_14.iloc[i]) if not rsi_14.isna().iloc[i] else None,
            "bb_upper": float(bb_upper.iloc[i]) if not bb_upper.isna().iloc[i] else None,
            "bb_lower": float(bb_lower.iloc[i]) if not bb_lower.isna().iloc[i] else None,
            "vol_21": float(vol_21.iloc[i]) if not vol_21.isna().iloc[i] else None,
        })

    return {
        "ticker": ticker.upper(),
        "indicators": indicators_data,
    }
