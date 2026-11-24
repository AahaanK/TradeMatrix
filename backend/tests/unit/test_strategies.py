import pytest
from pydantic import ValidationError

from app.strategies.ma_crossover import MACrossoverParams
from app.strategies.mean_reversion import MeanReversionParams
from app.strategies.registry import get_strategy
from tests.fixtures.synthetic_data import create_synthetic_uptrend_dataframe


def test_strategy_parameter_validation():
    # 1. MA Crossover: fast >= slow must raise ValidationError
    with pytest.raises(ValidationError):
        MACrossoverParams(fast=50, slow=20)

    # 2. Mean Reversion: entry_z >= exit_z must raise ValidationError
    with pytest.raises(ValidationError):
        MeanReversionParams(entry_z=-0.5, exit_z=-2.0)


def test_all_strategies_target_position():
    df = create_synthetic_uptrend_dataframe(n_bars=100)
    strategies = ["momentum", "mean_reversion", "ma_crossover", "buy_and_hold"]

    for name in strategies:
        strat = get_strategy(name)
        pos = strat.target_position(df, regimes=None)
        assert len(pos) == len(df)
        # Positions must be strictly bounded in [-1.0, 1.0]
        assert (pos >= -1.0).all()
        assert (pos <= 1.0).all()

    # Buy and hold must be exactly 1.0 on all bars
    bh = get_strategy("buy_and_hold")
    bh_pos = bh.target_position(df)
    assert (bh_pos == 1.0).all()
