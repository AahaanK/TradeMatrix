from typing import Literal

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field

from app.analytics.indicators import compute_momentum, compute_sma


class MomentumParams(BaseModel):
    lookback: int = Field(default=63, ge=5, le=252, description="Momentum lookback in bars")
    threshold: float = Field(default=0.0, ge=-0.5, le=0.5, description="Return threshold to enter")
    rebalance: Literal["daily", "weekly", "monthly"] = Field(default="daily", description="Rebalance frequency")
    trend_filter_sma: int | None = Field(default=200, ge=10, le=500, description="Optional trend filter SMA")
    allowed_regimes: list[str] | None = Field(default=None, description="Regimes in which positions are permitted")
    mode: Literal["long_flat", "long_short"] = Field(default="long_flat", description="Trading mode")


class MomentumStrategy:
    name: str = "momentum"
    params_model: type[BaseModel] = MomentumParams

    def __init__(self, params: MomentumParams | dict | None = None):
        if params is None:
            self.params = MomentumParams()
        elif isinstance(params, dict):
            self.params = MomentumParams(**params)
        else:
            self.params = params

    def target_position(self, data: pd.DataFrame, regimes: pd.Series | None = None) -> pd.Series:
        close = data["close"]
        mom = compute_momentum(close, self.params.lookback)

        # Base signal
        if self.params.mode == "long_short":
            raw_pos = np.where(mom > self.params.threshold, 1.0, np.where(mom < -self.params.threshold, -1.0, 0.0))
        else:
            raw_pos = np.where(mom > self.params.threshold, 1.0, 0.0)

        raw_pos = pd.Series(raw_pos, index=data.index, dtype=float)

        # Trend filter SMA if specified
        if self.params.trend_filter_sma is not None and self.params.trend_filter_sma > 0:
            sma = compute_sma(close, self.params.trend_filter_sma)
            sma_filter = close > sma
            raw_pos = raw_pos.where(sma_filter, 0.0)

        # Allowed regimes filter
        if self.params.allowed_regimes is not None and regimes is not None:
            regime_filter = regimes.isin(self.params.allowed_regimes)
            raw_pos = raw_pos.where(regime_filter, 0.0)

        # Rebalancing frequency schedule
        if self.params.rebalance == "daily":
            return raw_pos.fillna(0.0)

        # For weekly or monthly, only allow position changes on rebalance dates
        dates = pd.to_datetime(data["date"])
        if self.params.rebalance == "weekly":
            # Rebalance on the last trading day of each week (or when week changes)
            rebalance_dates = dates.dt.isocalendar().week != dates.dt.isocalendar().week.shift(-1)
        elif self.params.rebalance == "monthly":
            # Rebalance when month changes
            rebalance_dates = dates.dt.month != dates.dt.month.shift(-1)
        else:
            rebalance_dates = pd.Series(True, index=data.index)

        # Forward fill position between rebalance dates
        scheduled_pos = raw_pos.where(rebalance_dates, np.nan)
        # Ensure initial valid bar sets position
        scheduled_pos.iloc[0] = raw_pos.iloc[0]
        final_pos = scheduled_pos.ffill().fillna(0.0)
        return final_pos
