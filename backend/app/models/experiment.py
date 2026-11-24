import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class ExperimentModel(Base):
    __tablename__ = "experiments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False
    )

    # Dataset metadata
    ticker: Mapped[str] = mapped_column(String(32), nullable=False)
    source: Mapped[str] = mapped_column(String(32), default="bundled")
    interval: Mapped[str] = mapped_column(String(16), default="1d")
    adjusted: Mapped[bool] = mapped_column(Boolean, default=True)
    start_date: Mapped[str] = mapped_column(String(32), nullable=True)
    end_date: Mapped[str] = mapped_column(String(32), nullable=True)
    dataset_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)

    # Strategy & Config
    strategy: Mapped[str] = mapped_column(String(64), nullable=False)
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    regime_method: Mapped[str] = mapped_column(String(32), default="rules")
    regime_params: Mapped[dict] = mapped_column(JSON, default=dict)
    costs: Mapped[dict] = mapped_column(JSON, default=dict)
    initial_capital: Mapped[float] = mapped_column(Float, default=100000.0)

    # Results
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    regime_metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    equity_curve: Mapped[list] = mapped_column(JSON, default=list)
    trades: Mapped[list] = mapped_column(JSON, default=list)

    # Reproducibility & versions
    app_version: Mapped[str] = mapped_column(String(32), default="2.0.0")
    library_versions: Mapped[dict] = mapped_column(JSON, default=dict)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
