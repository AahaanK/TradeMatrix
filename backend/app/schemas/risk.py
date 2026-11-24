from typing import Any

from pydantic import BaseModel, Field


class RiskAnalyzeRequest(BaseModel):
    ticker: str = "SPY"
    interval: str = "1d"
    adjusted: bool = True
    start_date: str | None = None
    end_date: str | None = None
    strategy: str = "momentum"
    params: dict[str, Any] = Field(default_factory=dict)
    confidence_level: float = Field(default=0.95, ge=0.8, le=0.999)
    commission_bps: float = 5.0
    slippage_bps: float = 5.0
