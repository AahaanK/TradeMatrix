from typing import Protocol, runtime_checkable

import pandas as pd
from pydantic import BaseModel


@runtime_checkable
class Strategy(Protocol):
    name: str
    params_model: type[BaseModel]

    def target_position(self, data: pd.DataFrame, regimes: pd.Series | None) -> pd.Series:
        """
        Computes desired target position at close of time t, in [-1.0, 1.0].
        Strictly causal: uses data up to and including t only.
        """
        ...
