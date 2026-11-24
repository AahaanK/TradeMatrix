from typing import Any

from pydantic import BaseModel, Field


class BacktestRunRequest(BaseModel):
    ticker: str = "SPY"
    interval: str = "1d"
    adjusted: bool = True
    start_date: str | None = None
    end_date: str | None = None
    strategy: str = "momentum"
    params: dict[str, Any] = Field(default_factory=dict)
    regime_method: str = "rules"
    regime_params: dict[str, Any] = Field(default_factory=dict)
    commission_bps: float = Field(default=5.0, ge=0.0, le=100.0)
    slippage_bps: float = Field(default=5.0, ge=0.0, le=100.0)
    initial_capital: float = Field(default=100000.0, gt=0.0)
    annual_rf: float = Field(default=0.0, ge=-0.1, le=0.5)


class BacktestReplayRequest(BaseModel):
    ticker: str = "SPY"
    interval: str = "1d"
    adjusted: bool = True
    target_date: str
    strategy: str = "momentum"
    params: dict[str, Any] = Field(default_factory=dict)
    commission_bps: float = 5.0
    slippage_bps: float = 5.0
    initial_capital: float = 100000.0


class BacktestCompareRequest(BaseModel):
    ticker: str = "SPY"
    interval: str = "1d"
    adjusted: bool = True
    start_date: str | None = None
    end_date: str | None = None
    regime_method: str = "rules"
    regime_params: dict[str, Any] = Field(default_factory=dict)
    commission_bps: float = 5.0
    slippage_bps: float = 5.0
    annual_rf: float = 0.0
