from typing import Literal

from pydantic import BaseModel, Field


class QualityIssue(BaseModel):
    severity: Literal["info", "warning", "error"]
    check: str
    message: str
    count: int = 0
    details: list[str] = Field(default_factory=list)


class DataQualityReport(BaseModel):
    is_valid: bool
    total_bars: int
    start_date: str
    end_date: str
    frequency: str
    duplicate_dates_removed: int = 0
    missing_value_bars: int = 0
    nonpositive_price_bars: int = 0
    ohlc_violation_bars: int = 0
    zero_or_negative_volume_bars: int = 0
    gaps_detected: int = 0
    issues: list[QualityIssue] = Field(default_factory=list)


class OHLCVBar(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    adj_close: float | None = None


class MarketDataResponse(BaseModel):
    ticker: str
    source: str
    interval: str
    adjusted: bool
    dataset_fingerprint: str
    total_bars: int
    data_quality: DataQualityReport
    bars: list[OHLCVBar]
