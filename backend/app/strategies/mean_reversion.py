"""
Mean Reversion Strategy.
Stateful causal execution loop based on rolling price z-score.
"""

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field, model_validator

from app.analytics.indicators import (
    compute_annualized_rolling_volatility,
    compute_rolling_zscore,
    compute_simple_returns,
)


class MeanReversionParams(BaseModel):
    lookback: int = Field(default=20, ge=5, le=252, description="Rolling z-score window")
    entry_z: float = Field(default=-2.0, le=0.0, ge=-5.0, description="Z-score entry threshold")
    exit_z: float = Field(default=-0.5, ge=-2.0, le=2.0, description="Z-score exit threshold")
    max_holding_period: int = Field(default=21, ge=1, le=252, description="Maximum holding period in bars")
    volatility_cap: float | None = Field(default=None, ge=0.05, le=2.0, description="Annualized volatility cap")
    allowed_regimes: list[str] | None = Field(default=None, description="Permitted regimes")

    @model_validator(mode="after")
    def validate_thresholds(self) -> "MeanReversionParams":
        if self.entry_z >= self.exit_z:
            raise ValueError(f"entry_z ({self.entry_z}) must be strictly less than exit_z ({self.exit_z})")
        return self


class MeanReversionStrategy:
    name: str = "mean_reversion"
    params_model: type[BaseModel] = MeanReversionParams

    def __init__(self, params: MeanReversionParams | dict | None = None):
        if params is None:
            self.params = MeanReversionParams()
        elif isinstance(params, dict):
            self.params = MeanReversionParams(**params)
        else:
            self.params = params

    def target_position(self, data: pd.DataFrame, regimes: pd.Series | None = None) -> pd.Series:
        close = data["close"]
        n = len(data)
        z_scores = compute_rolling_zscore(close, self.params.lookback).to_numpy()

        # Volatility cap filter
        if self.params.volatility_cap is not None:
            returns = compute_simple_returns(close)
            vol = compute_annualized_rolling_volatility(returns, window=21).to_numpy()
        else:
            vol = np.zeros(n)

        positions = np.zeros(n, dtype=float)
        current_pos = 0.0
        bars_held = 0

        for t in range(n):
            z = z_scores[t]
            curr_regime = regimes.iloc[t] if regimes is not None else None

            # Check regime filter
            regime_allowed = True
            if self.params.allowed_regimes is not None and curr_regime is not None:
                if curr_regime not in self.params.allowed_regimes:
                    regime_allowed = False

            # Check volatility cap
            vol_allowed = True
            if self.params.volatility_cap is not None and not np.isnan(vol[t]):
                if vol[t] > self.params.volatility_cap:
                    vol_allowed = False

            if current_pos > 0.0:
                bars_held += 1
                # Exit conditions:
                # 1. z-score reaches exit threshold
                # 2. Maximum holding period reached
                # 3. Regime or volatility filter failed
                if (
                    (not np.isnan(z) and z >= self.params.exit_z)
                    or (bars_held >= self.params.max_holding_period)
                    or not regime_allowed
                    or not vol_allowed
                ):
                    current_pos = 0.0
                    bars_held = 0
            else:
                # Entry condition:
                # z-score <= entry_z and filters pass
                if not np.isnan(z) and z <= self.params.entry_z and regime_allowed and vol_allowed:
                    current_pos = 1.0
                    bars_held = 0

            positions[t] = current_pos

        return pd.Series(positions, index=data.index, name="position")
