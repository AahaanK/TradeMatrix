from typing import Any

from app.strategies.base import Strategy
from app.strategies.buy_and_hold import BuyAndHoldStrategy
from app.strategies.ma_crossover import MACrossoverStrategy
from app.strategies.mean_reversion import MeanReversionStrategy
from app.strategies.momentum import MomentumStrategy

STRATEGY_REGISTRY: dict[str, type[Any]] = {
    "momentum": MomentumStrategy,
    "mean_reversion": MeanReversionStrategy,
    "ma_crossover": MACrossoverStrategy,
    "buy_and_hold": BuyAndHoldStrategy,
}


def get_strategy(name: str, params: dict | None = None) -> Strategy:
    norm_name = name.strip().lower()
    if norm_name not in STRATEGY_REGISTRY:
        valid_names = ", ".join(STRATEGY_REGISTRY.keys())
        raise ValueError(f"Unknown strategy '{name}'. Available strategies: {valid_names}")
    strategy_cls = STRATEGY_REGISTRY[norm_name]
    return strategy_cls(params=params)
