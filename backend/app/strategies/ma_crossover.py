"""
Moving Average Crossover Strategy.
Fast SMA crossing above Slow SMA indicates long posture.
"""

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field, model_validator

from app.analytics.indicators import (
    compute_annualized_rolling_volatility,
    compute_simple_returns,
    compute_sma,
)


class MACrossoverParams(BaseModel):
    fast: int = Field(default=20, ge=3, le=100, description="Fast SMA period")
    slow: int = Field(default=50, ge=10, le=300, description="Slow SMA period")
    volatility_filter: float | None = Field(default=None, ge=0.05, le=2.0, description="Maximum volatility")
    allowed_regimes: list[str] | None = Field(default=None, description="Permitted regimes")

    @model_validator(mode="after")
    def validate_fast_slow(self) -> "MACrossoverParams":
        if self.fast >= self.slow:
            raise ValueError(f"fast window ({self.fast}) must be strictly less than slow window ({self.slow})")
        return self


class MACrossoverStrategy:
    name: str = "ma_crossover"
    params_model: type[BaseModel] = MACrossoverParams

    def __init__(self, params: MACrossoverParams | dict | None = None):
        if params is None:
            self.params = MACrossoverParams()
        elif isinstance(params, dict):
            self.params = MACrossoverParams(**params)
        else:
            self.params = params

    def target_position(self, data: pd.DataFrame, regimes: pd.Series | None = None) -> pd.Series:
        close = data["close"]
        fast_sma = compute_sma(close, self.params.fast)
        slow_sma = compute_sma(close, self.params.slow)

        raw_pos = np.where(fast_sma > slow_sma, 1.0, 0.0)
        pos = pd.Series(raw_pos, index=data.index, dtype=float)

        # Volatility filter
        if self.params.volatility_filter is not None:
            returns = compute_simple_returns(close)
            vol = compute_annualized_rolling_volatility(returns, window=21)
            vol_filter = vol <= self.params.volatility_filter
            pos = pos.where(vol_filter, 0.0)

        # Allowed regimes
        if self.params.allowed_regimes is not None and regimes is not None:
            regime_filter = regimes.isin(self.params.allowed_regimes)
            pos = pos.where(regime_filter, 0.0)

        return pos.fillna(0.0)
