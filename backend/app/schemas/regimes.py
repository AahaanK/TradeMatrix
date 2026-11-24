from typing import Any, Literal

from pydantic import BaseModel, Field


class RegimeAnalysisRequest(BaseModel):
    ticker: str = "SPY"
    interval: str = "1d"
    adjusted: bool = True
    start_date: str | None = None
    end_date: str | None = None
    method: Literal["rules", "kmeans"] = "rules"
    vol_percentile: float = Field(default=0.60, ge=0.1, le=0.95)
    min_history: int = Field(default=252, ge=20, le=1000)
    persistence_filter: int = Field(default=1, ge=1, le=20)
    require_sma: bool = True
    require_momentum: bool = True


class RegimeAnalysisResponse(BaseModel):
    ticker: str
    interval: str
    dataset_fingerprint: str
    total_bars: int
    method: str
    labels: list[str]
    timeline: list[dict[str, Any]]
    distribution: dict[str, Any]
    transition_intelligence: dict[str, Any]
    latest_regime: dict[str, Any]
    kmeans_metadata: dict[str, Any] | None = None
