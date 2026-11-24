"""
Buy and Hold Benchmark Strategy.
Always fully invested (target position = 1.0) across all bars.
"""

import pandas as pd
from pydantic import BaseModel


class BuyAndHoldParams(BaseModel):
    pass


class BuyAndHoldStrategy:
    name: str = "buy_and_hold"
    params_model: type[BaseModel] = BuyAndHoldParams

    def __init__(self, params: BuyAndHoldParams | dict | None = None):
        self.params = BuyAndHoldParams()

    def target_position(self, data: pd.DataFrame, regimes: pd.Series | None = None) -> pd.Series:
        return pd.Series(1.0, index=data.index, name="position")
