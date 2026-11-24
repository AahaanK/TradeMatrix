import hashlib
import io
import time
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

from app.core.config import settings
from app.core.errors import DataQualityError, UpstreamDataError
from app.schemas.market import (
    DataQualityReport,
    QualityIssue,
)

HEADER_ALIASES: dict[str, str] = {
    "date": "date",
    "timestamp": "date",
    "datetime": "date",
    "time": "date",
    "open": "open",
    "high": "high",
    "low": "low",
    "close": "close",
    "price": "close",
    "adj close": "adj_close",
    "adj_close": "adj_close",
    "adjusted close": "adj_close",
    "adjusted_close": "adj_close",
    "volume": "volume",
    "vol": "volume",
}


def compute_dataset_fingerprint(
    df: pd.DataFrame,
    source: str,
    ticker: str,
    interval: str,
    adjusted: bool
) -> str:
    """Computes deterministic SHA-256 fingerprint over normalized OHLCV data and metadata."""
    cols = ["date", "open", "high", "low", "close", "volume"]
    norm_df = df[cols].copy()
    norm_df["date"] = pd.to_datetime(norm_df["date"]).dt.strftime("%Y-%m-%d")
    for col in ["open", "high", "low", "close", "volume"]:
        norm_df[col] = norm_df[col].astype(float).round(6)

    csv_bytes = norm_df.to_csv(index=False, lineterminator="\n").encode("utf-8")
    meta_bytes = f"{source}:{ticker}:{interval}:{adjusted}".encode()
    hasher = hashlib.sha256()
    hasher.update(meta_bytes)
    hasher.update(b":")
    hasher.update(csv_bytes)
    return hasher.hexdigest()


def validate_market_data(
    df: pd.DataFrame,
    interval: str = "1d",
    min_bars: int = 252,
) -> tuple[pd.DataFrame, DataQualityReport]:
    """
    Validates and normalizes market data DataFrame.
    Applies data quality checks without silent forward filling.
    """
    issues: list[QualityIssue] = []

    # 1. Standardize column names
    col_map = {}
    for c in df.columns:
        norm = str(c).strip().lower()
        if norm in HEADER_ALIASES:
            col_map[c] = HEADER_ALIASES[norm]
    df = df.rename(columns=col_map)

    required_cols = ["date", "open", "high", "low", "close", "volume"]
    missing_required = [c for c in required_cols if c not in df.columns]
    if missing_required:
        issue = QualityIssue(
            severity="error",
            check="required_columns",
            message=f"Missing required columns: {', '.join(missing_required)}",
            count=len(missing_required),
            details=missing_required
        )
        report = DataQualityReport(
            is_valid=False,
            total_bars=0,
            start_date="",
            end_date="",
            frequency=interval,
            issues=[issue]
        )
        return df, report

    # 2. Parse timestamps and sort ascending
    try:
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
    except Exception as e:
        issue = QualityIssue(
            severity="error",
            check="date_parsing",
            message=f"Failed to parse dates: {e!s}",
            count=1
        )
        return df, DataQualityReport(
            is_valid=False, total_bars=0, start_date="", end_date="", frequency=interval, issues=[issue]
        )

    invalid_dates = df["date"].isna().sum()
    if invalid_dates > 0:
        issues.append(QualityIssue(
            severity="error",
            check="null_dates",
            message=f"Found {invalid_dates} rows with invalid dates",
            count=int(invalid_dates)
        ))
        df = df.dropna(subset=["date"])

    # Normalize timezone to naive exchange date
    if df["date"].dt.tz is not None:
        df["date"] = df["date"].dt.tz_convert(None)
    df["date"] = df["date"].dt.floor("D")

    # Ascending sort
    df = df.sort_values("date").reset_index(drop=True)

    # 3. Duplicate date check & removal
    initial_len = len(df)
    df = df.drop_duplicates(subset=["date"], keep="last").reset_index(drop=True)
    duplicate_count = initial_len - len(df)
    if duplicate_count > 0:
        issues.append(QualityIssue(
            severity="warning",
            check="duplicate_dates",
            message=f"Removed {duplicate_count} duplicate date rows (kept last observation).",
            count=duplicate_count
        ))

    # 4. Check for missing values in price columns
    price_cols = ["open", "high", "low", "close"]
    missing_price_mask = df[price_cols].isna().any(axis=1)
    missing_count = int(missing_price_mask.sum())
    if missing_count > 0:
        issues.append(QualityIssue(
            severity="error",
            check="missing_prices",
            message=f"Found {missing_count} rows with missing price values. Data will not be forward filled silently.",
            count=missing_count
        ))

    # 5. Non-positive price check
    for col in price_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    nonpositive_mask = (df[price_cols] <= 0).any(axis=1)
    nonpositive_count = int(nonpositive_mask.sum())
    if nonpositive_count > 0:
        issues.append(QualityIssue(
            severity="error",
            check="nonpositive_prices",
            message=f"Found {nonpositive_count} rows with non-positive (<= 0) prices.",
            count=nonpositive_count
        ))

    # 6. OHLC Consistency: low <= open <= high and low <= close <= high
    df["volume"] = pd.to_numeric(df["volume"], errors="coerce").fillna(0)
    ohlc_violations = (
        (df["low"] > df["open"] + 1e-6) |
        (df["low"] > df["close"] + 1e-6) |
        (df["high"] < df["open"] - 1e-6) |
        (df["high"] < df["close"] - 1e-6)
    )
    ohlc_count = int(ohlc_violations.sum())
    if ohlc_count > 0:
        issues.append(QualityIssue(
            severity="error",
            check="ohlc_consistency",
            message=f"Found {ohlc_count} rows where Low > Open/Close or High < Open/Close.",
            count=ohlc_count
        ))

    # 7. Zero or negative volume
    zero_or_neg_vol = (df["volume"] <= 0).sum()
    if zero_or_neg_vol > 0:
        issues.append(QualityIssue(
            severity="info",
            check="zero_or_negative_volume",
            message=f"Found {int(zero_or_neg_vol)} rows with zero or negative volume.",
            count=int(zero_or_neg_vol)
        ))

    # 8. Frequency and gap detection (trading days typically have gaps on weekends/holidays > 4 days)
    gaps_detected = 0
    if len(df) > 1:
        date_diffs = df["date"].diff().dt.days
        # For daily data, a gap > 5 days (e.g. prolonged holiday or missing week)
        large_gaps = (date_diffs > 5).sum()
        if large_gaps > 0:
            gaps_detected = int(large_gaps)
            issues.append(QualityIssue(
                severity="info",
                check="frequency_gaps",
                message=f"Detected {gaps_detected} trading calendar gaps (> 5 calendar days).",
                count=gaps_detected
            ))

    # 9. Minimum history check
    total_bars = len(df)
    if total_bars < min_bars:
        issues.append(QualityIssue(
            severity="warning" if total_bars >= 60 else "error",
            check="minimum_history",
            message=f"Dataset has {total_bars} bars, fewer than recommended minimum {min_bars} bars for full regime analysis.",
            count=total_bars
        ))

    is_valid = not any(i.severity == "error" for i in issues)
    start_date = df["date"].iloc[0].strftime("%Y-%m-%d") if len(df) > 0 else ""
    end_date = df["date"].iloc[-1].strftime("%Y-%m-%d") if len(df) > 0 else ""

    report = DataQualityReport(
        is_valid=is_valid,
        total_bars=total_bars,
        start_date=start_date,
        end_date=end_date,
        frequency=interval,
        duplicate_dates_removed=duplicate_count,
        missing_value_bars=missing_count,
        nonpositive_price_bars=nonpositive_count,
        ohlc_violation_bars=ohlc_count,
        zero_or_negative_volume_bars=int(zero_or_neg_vol),
        gaps_detected=gaps_detected,
        issues=issues
    )

    return df, report


def adjust_prices(df: pd.DataFrame) -> pd.DataFrame:
    """
    Adjusts open, high, low according to adj_close / close factor.
    Returns DataFrame with adjusted prices.
    """
    df = df.copy()
    if "adj_close" in df.columns and "close" in df.columns:
        factor = df["adj_close"] / df["close"]
        # Handle zero or inf factors safely
        factor = factor.replace([np.inf, -np.inf], 1.0).fillna(1.0)
        df["open"] = (df["open"] * factor).round(4)
        df["high"] = (df["high"] * factor).round(4)
        df["low"] = (df["low"] * factor).round(4)
        df["close"] = df["adj_close"].round(4)
    return df


RESAMPLE_RULES: dict[str, str] = {"1wk": "W-FRI", "1mo": "ME"}


def resample_ohlcv(df: pd.DataFrame, interval: str) -> pd.DataFrame:
    """
    Aggregates daily OHLCV bars into weekly (week ending Friday) or monthly bars.
    Each output bar is dated on the last trading day actually present in that period,
    so no bar ever carries a date later than the data it summarises.
    Daily (or unknown) intervals are returned unchanged.
    """
    rule = RESAMPLE_RULES.get(interval)
    if rule is None or df.empty:
        return df

    work = df.copy()
    work["date"] = pd.to_datetime(work["date"])
    work = work.sort_values("date")
    work["_bar_date"] = work["date"]
    work = work.set_index("date")

    agg: dict[str, str] = {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
    if "adj_close" in work.columns:
        agg["adj_close"] = "last"

    out = work.resample(rule).agg({**agg, "_bar_date": "max"})
    out = out.dropna(subset=["close", "_bar_date"]).reset_index(drop=True)
    out = out.rename(columns={"_bar_date": "date"})
    return out[["date", *agg.keys()]]


class MarketDataService:
    def __init__(self):
        settings.CACHE_DIR.mkdir(parents=True, exist_ok=True)
        settings.BUNDLED_DIR.mkdir(parents=True, exist_ok=True)

    def _get_cache_path(self, ticker: str, interval: str, adjusted: bool) -> Path:
        filename = f"{ticker.upper()}_{interval}_{'adj' if adjusted else 'unadj'}.parquet"
        return settings.CACHE_DIR / filename

    def _read_cache(self, ticker: str, interval: str, adjusted: bool) -> pd.DataFrame | None:
        path = self._get_cache_path(ticker, interval, adjusted)
        if not path.exists():
            return None
        mtime = path.stat().st_mtime
        if (time.time() - mtime) > (settings.CACHE_TTL_HOURS * 3600):
            return None
        try:
            return pd.read_parquet(path)
        except Exception:
            return None

    def _write_cache(self, df: pd.DataFrame, ticker: str, interval: str, adjusted: bool) -> None:
        try:
            path = self._get_cache_path(ticker, interval, adjusted)
            df.to_parquet(path, index=False)
        except Exception:
            pass

    def load_bundled_data(self, ticker: str = "SPY", adjusted: bool = True) -> tuple[pd.DataFrame, DataQualityReport]:
        csv_path = settings.BUNDLED_DIR / f"{ticker.upper()}_daily.csv"
        if not csv_path.exists():
            # Fallback to SPY_daily.csv if specific ticker not found
            csv_path = settings.BUNDLED_DIR / "SPY_daily.csv"
            if not csv_path.exists():
                raise UpstreamDataError(f"Bundled dataset file {csv_path.name} not found.")

        df = pd.read_csv(csv_path)
        df, report = validate_market_data(df, interval="1d")
        if adjusted and "adj_close" in df.columns:
            df = adjust_prices(df)
        return df, report

    def fetch_yfinance_data(
        self,
        ticker: str,
        interval: str = "1d",
        start: str | None = None,
        end: str | None = None,
        adjusted: bool = True
    ) -> tuple[pd.DataFrame, DataQualityReport]:
        # 1. Check disk cache
        cached = self._read_cache(ticker, interval, adjusted)
        if cached is not None and len(cached) > 0:
            df, report = validate_market_data(cached, interval=interval)
            return df, report

        # 2. Fetch with exponential backoff (3 retries)
        last_error = None
        for attempt in range(3):
            try:
                # auto_adjust=False so we have both close and adj_close available
                data = yf.download(
                    ticker,
                    start=start or "2014-01-01",
                    end=end,
                    interval=interval,
                    progress=False,
                    auto_adjust=False
                )
                if data is not None and not data.empty:
                    if isinstance(data.columns, pd.MultiIndex):
                        data.columns = [col[0] for col in data.columns]
                    data = data.reset_index()
                    data.columns = [str(c).lower().replace(" ", "_") for c in data.columns]

                    df, report = validate_market_data(data, interval=interval)
                    if adjusted and "adj_close" in df.columns:
                        df = adjust_prices(df)

                    if report.is_valid:
                        self._write_cache(df, ticker, interval, adjusted)
                    return df, report
                else:
                    last_error = f"No data returned by yfinance for ticker '{ticker}'."
            except Exception as e:
                last_error = str(e)
                time.sleep(2 ** attempt)

        # 3. Fallback to bundled data if offline or network error and ticker is SPY
        if ticker.upper() in ["SPY", "^GSPC"]:
            try:
                return self.load_bundled_data(ticker="SPY", adjusted=adjusted)
            except Exception:
                pass

        raise UpstreamDataError(
            f"Failed to fetch market data for '{ticker}' after 3 retries: {last_error}"
        )

    def parse_csv_upload(
        self,
        file_bytes: bytes,
        interval: str = "1d",
        adjusted: bool = True
    ) -> tuple[pd.DataFrame, DataQualityReport]:
        if len(file_bytes) > settings.MAX_UPLOAD_MB * 1024 * 1024:
            raise DataQualityError(
                f"File size exceeds maximum allowed upload of {settings.MAX_UPLOAD_MB}MB."
            )
        try:
            df = pd.read_csv(io.BytesIO(file_bytes))
        except Exception as e:
            raise DataQualityError(f"Failed to parse CSV file: {e!s}")

        df, report = validate_market_data(df, interval=interval)
        if not report.is_valid:
            error_msgs = [i.message for i in report.issues if i.severity == "error"]
            raise DataQualityError("Uploaded CSV failed quality validation.", details=error_msgs)

        if adjusted and "adj_close" in df.columns:
            df = adjust_prices(df)
        return df, report


market_data_service = MarketDataService()
