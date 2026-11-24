from typing import Any

from pydantic import BaseModel, Field


class ExperimentCreate(BaseModel):
    name: str = "Quantitative Experiment"
    ticker: str = "SPY"
    source: str = "bundled"
    interval: str = "1d"
    adjusted: bool = True
    start_date: str | None = None
    end_date: str | None = None
    dataset_fingerprint: str
    strategy: str = "momentum"
    params: dict[str, Any] = Field(default_factory=dict)
    regime_method: str = "rules"
    regime_params: dict[str, Any] = Field(default_factory=dict)
    costs: dict[str, Any] = Field(default_factory=dict)
    initial_capital: float = 100000.0
    metrics: dict[str, Any] = Field(default_factory=dict)
    regime_metrics: dict[str, Any] = Field(default_factory=dict)
    equity_curve: list[dict[str, Any]] = Field(default_factory=list)
    trades: list[dict[str, Any]] = Field(default_factory=list)
    notes: str | None = None


class ExperimentUpdate(BaseModel):
    name: str | None = None
    notes: str | None = None


class ExperimentResponse(BaseModel):
    id: str
    name: str
    created_at: str
    updated_at: str
    ticker: str
    source: str
    interval: str
    adjusted: bool
    start_date: str | None
    end_date: str | None
    dataset_fingerprint: str
    strategy: str
    params: dict[str, Any]
    regime_method: str
    regime_params: dict[str, Any]
    costs: dict[str, Any]
    initial_capital: float
    metrics: dict[str, Any]
    regime_metrics: dict[str, Any]
    equity_curve: list[dict[str, Any]]
    trades: list[dict[str, Any]]
    app_version: str
    notes: str | None
