from typing import Any

from pydantic import BaseModel, Field


class SensitivityRequest(BaseModel):
    ticker: str = "SPY"
    interval: str = "1d"
    adjusted: bool = True
    strategy: str = "momentum"
    param1_name: str = "lookback"
    param1_values: list[Any] = Field(default_factory=lambda: [21, 42, 63, 126, 200])
    param2_name: str = "threshold"
    param2_values: list[Any] = Field(default_factory=lambda: [0.0, 0.01, 0.02, 0.05])
    base_params: dict[str, Any] = Field(default_factory=dict)
    commission_bps: float = 5.0
    slippage_bps: float = 5.0


class OutOfSampleRequest(BaseModel):
    ticker: str = "SPY"
    interval: str = "1d"
    adjusted: bool = True
    strategy: str = "momentum"
    param_grid: list[dict[str, Any]] = Field(default_factory=list)
    train_end_date: str
    test_start_date: str
    test_end_date: str | None = None
    target_metric: str = "sharpe_ratio"
    commission_bps: float = 5.0
    slippage_bps: float = 5.0


class WalkForwardRequest(BaseModel):
    ticker: str = "SPY"
    interval: str = "1d"
    adjusted: bool = True
    strategy: str = "momentum"
    param_grid: list[dict[str, Any]] = Field(default_factory=list)
    n_folds: int = Field(default=4, ge=2, le=10)
    target_metric: str = "sharpe_ratio"
    commission_bps: float = 5.0
    slippage_bps: float = 5.0
