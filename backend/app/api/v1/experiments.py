import csv
import io
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ResourceNotFoundError
from app.database.session import get_db
from app.models.experiment import ExperimentModel
from app.reports.pdf_report import generate_experiment_pdf
from app.schemas.experiment import (
    ExperimentCreate,
    ExperimentResponse,
    ExperimentUpdate,
)
from app.services.market_data import compute_dataset_fingerprint, market_data_service

router = APIRouter(prefix="/experiments", tags=["Experiments"])


@router.get("", response_model=list[ExperimentResponse])
def list_experiments(db: Session = Depends(get_db)):
    stmt = select(ExperimentModel).order_by(ExperimentModel.created_at.desc())
    items = db.execute(stmt).scalars().all()
    return [
        ExperimentResponse(
            id=item.id,
            name=item.name,
            created_at=item.created_at.isoformat(),
            updated_at=item.updated_at.isoformat(),
            ticker=item.ticker,
            source=item.source,
            interval=item.interval,
            adjusted=item.adjusted,
            start_date=item.start_date,
            end_date=item.end_date,
            dataset_fingerprint=item.dataset_fingerprint,
            strategy=item.strategy,
            params=item.params,
            regime_method=item.regime_method,
            regime_params=item.regime_params,
            costs=item.costs,
            initial_capital=item.initial_capital,
            metrics=item.metrics,
            regime_metrics=item.regime_metrics,
            equity_curve=item.equity_curve,
            trades=item.trades,
            app_version=item.app_version,
            notes=item.notes,
        )
        for item in items
    ]


@router.post("", response_model=ExperimentResponse)
def create_experiment(data: ExperimentCreate, db: Session = Depends(get_db)):
    exp_id = str(uuid.uuid4())
    now = datetime.now(UTC)
    item = ExperimentModel(
        id=exp_id,
        name=data.name,
        created_at=now,
        updated_at=now,
        ticker=data.ticker,
        source=data.source,
        interval=data.interval,
        adjusted=data.adjusted,
        start_date=data.start_date,
        end_date=data.end_date,
        dataset_fingerprint=data.dataset_fingerprint,
        strategy=data.strategy,
        params=data.params,
        regime_method=data.regime_method,
        regime_params=data.regime_params,
        costs=data.costs,
        initial_capital=data.initial_capital,
        metrics=data.metrics,
        regime_metrics=data.regime_metrics,
        equity_curve=data.equity_curve,
        trades=data.trades,
        app_version="2.0.0",
        notes=data.notes,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return ExperimentResponse(
        id=item.id,
        name=item.name,
        created_at=item.created_at.isoformat(),
        updated_at=item.updated_at.isoformat(),
        ticker=item.ticker,
        source=item.source,
        interval=item.interval,
        adjusted=item.adjusted,
        start_date=item.start_date,
        end_date=item.end_date,
        dataset_fingerprint=item.dataset_fingerprint,
        strategy=item.strategy,
        params=item.params,
        regime_method=item.regime_method,
        regime_params=item.regime_params,
        costs=item.costs,
        initial_capital=item.initial_capital,
        metrics=item.metrics,
        regime_metrics=item.regime_metrics,
        equity_curve=item.equity_curve,
        trades=item.trades,
        app_version=item.app_version,
        notes=item.notes,
    )


@router.get("/{experiment_id}")
def get_experiment(experiment_id: str, db: Session = Depends(get_db)):
    item = db.get(ExperimentModel, experiment_id)
    if not item:
        raise ResourceNotFoundError(f"Experiment with ID '{experiment_id}' not found.")

    # Reproducibility check: Recompute dataset fingerprint
    fingerprint_matches = True
    try:
        if item.ticker.upper() == "SPY":
            df, _ = market_data_service.load_bundled_data(ticker="SPY", adjusted=item.adjusted)
        else:
            df, _ = market_data_service.fetch_yfinance_data(
                ticker=item.ticker, interval=item.interval, adjusted=item.adjusted
            )
        current_fp = compute_dataset_fingerprint(df, item.source, item.ticker, item.interval, item.adjusted)
        fingerprint_matches = (current_fp == item.dataset_fingerprint)
    except Exception:
        fingerprint_matches = False

    resp = ExperimentResponse(
        id=item.id,
        name=item.name,
        created_at=item.created_at.isoformat(),
        updated_at=item.updated_at.isoformat(),
        ticker=item.ticker,
        source=item.source,
        interval=item.interval,
        adjusted=item.adjusted,
        start_date=item.start_date,
        end_date=item.end_date,
        dataset_fingerprint=item.dataset_fingerprint,
        strategy=item.strategy,
        params=item.params,
        regime_method=item.regime_method,
        regime_params=item.regime_params,
        costs=item.costs,
        initial_capital=item.initial_capital,
        metrics=item.metrics,
        regime_metrics=item.regime_metrics,
        equity_curve=item.equity_curve,
        trades=item.trades,
        app_version=item.app_version,
        notes=item.notes,
    ).model_dump()

    resp["reproducibility"] = {
        "fingerprint_matches": fingerprint_matches,
        "warning": None if fingerprint_matches else "Dataset changed since this result was produced.",
    }
    return resp


@router.patch("/{experiment_id}", response_model=ExperimentResponse)
def update_experiment(experiment_id: str, data: ExperimentUpdate, db: Session = Depends(get_db)):
    item = db.get(ExperimentModel, experiment_id)
    if not item:
        raise ResourceNotFoundError(f"Experiment with ID '{experiment_id}' not found.")

    if data.name is not None:
        item.name = data.name
    if data.notes is not None:
        item.notes = data.notes

    item.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(item)

    return ExperimentResponse(
        id=item.id,
        name=item.name,
        created_at=item.created_at.isoformat(),
        updated_at=item.updated_at.isoformat(),
        ticker=item.ticker,
        source=item.source,
        interval=item.interval,
        adjusted=item.adjusted,
        start_date=item.start_date,
        end_date=item.end_date,
        dataset_fingerprint=item.dataset_fingerprint,
        strategy=item.strategy,
        params=item.params,
        regime_method=item.regime_method,
        regime_params=item.regime_params,
        costs=item.costs,
        initial_capital=item.initial_capital,
        metrics=item.metrics,
        regime_metrics=item.regime_metrics,
        equity_curve=item.equity_curve,
        trades=item.trades,
        app_version=item.app_version,
        notes=item.notes,
    )


@router.delete("/{experiment_id}")
def delete_experiment(experiment_id: str, db: Session = Depends(get_db)):
    item = db.get(ExperimentModel, experiment_id)
    if not item:
        raise ResourceNotFoundError(f"Experiment with ID '{experiment_id}' not found.")

    db.delete(item)
    db.commit()
    return {"status": "success", "deleted_id": experiment_id}


@router.post("/{experiment_id}/duplicate", response_model=ExperimentResponse)
def duplicate_experiment(experiment_id: str, db: Session = Depends(get_db)):
    item = db.get(ExperimentModel, experiment_id)
    if not item:
        raise ResourceNotFoundError(f"Experiment with ID '{experiment_id}' not found.")

    new_id = str(uuid.uuid4())
    now = datetime.now(UTC)
    new_item = ExperimentModel(
        id=new_id,
        name=f"{item.name} (Copy)",
        created_at=now,
        updated_at=now,
        ticker=item.ticker,
        source=item.source,
        interval=item.interval,
        adjusted=item.adjusted,
        start_date=item.start_date,
        end_date=item.end_date,
        dataset_fingerprint=item.dataset_fingerprint,
        strategy=item.strategy,
        params=item.params,
        regime_method=item.regime_method,
        regime_params=item.regime_params,
        costs=item.costs,
        initial_capital=item.initial_capital,
        metrics=item.metrics,
        regime_metrics=item.regime_metrics,
        equity_curve=item.equity_curve,
        trades=item.trades,
        app_version=item.app_version,
        notes=item.notes,
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)

    return ExperimentResponse(
        id=new_item.id,
        name=new_item.name,
        created_at=new_item.created_at.isoformat(),
        updated_at=new_item.updated_at.isoformat(),
        ticker=new_item.ticker,
        source=new_item.source,
        interval=new_item.interval,
        adjusted=new_item.adjusted,
        start_date=new_item.start_date,
        end_date=new_item.end_date,
        dataset_fingerprint=new_item.dataset_fingerprint,
        strategy=new_item.strategy,
        params=new_item.params,
        regime_method=new_item.regime_method,
        regime_params=new_item.regime_params,
        costs=new_item.costs,
        initial_capital=new_item.initial_capital,
        metrics=new_item.metrics,
        regime_metrics=new_item.regime_metrics,
        equity_curve=new_item.equity_curve,
        trades=new_item.trades,
        app_version=new_item.app_version,
        notes=new_item.notes,
    )


@router.get("/{experiment_id}/export")
def export_experiment(
    experiment_id: str,
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    db: Session = Depends(get_db)
):
    item = db.get(ExperimentModel, experiment_id)
    if not item:
        raise ResourceNotFoundError(f"Experiment with ID '{experiment_id}' not found.")

    exp_dict = {
        "id": item.id,
        "name": item.name,
        "created_at": item.created_at.isoformat(),
        "ticker": item.ticker,
        "strategy": item.strategy,
        "interval": item.interval,
        "regime_method": item.regime_method,
        "start_date": item.start_date,
        "end_date": item.end_date,
        "dataset_fingerprint": item.dataset_fingerprint,
        "metrics": item.metrics,
        "regime_metrics": item.regime_metrics,
        "trades": item.trades,
        "equity_curve": item.equity_curve,
    }

    if format == "pdf":
        pdf_bytes = generate_experiment_pdf(exp_dict)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=TradeMatrix_{item.ticker}_{item.strategy}.pdf"},
        )
    else:
        # Generate CSV export containing summary metrics and equity curve
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["--- TradeMatrix Quantitative Research Export ---"])
        writer.writerow(["Experiment ID", item.id])
        writer.writerow(["Name", item.name])
        writer.writerow(["Ticker", item.ticker])
        writer.writerow(["Strategy", item.strategy])
        writer.writerow(["Interval", item.interval])
        writer.writerow(["Fingerprint", item.dataset_fingerprint])
        writer.writerow([])
        writer.writerow(["--- Metrics ---"])
        for k, v in item.metrics.items():
            if k != "notes":
                writer.writerow([k, v])
        writer.writerow([])
        writer.writerow(["--- Equity Curve ---"])
        writer.writerow(["date", "close", "position", "net_return", "net_equity", "drawdown", "regime"])
        for bar in item.equity_curve:
            writer.writerow([
                bar.get("date"),
                bar.get("close"),
                bar.get("position"),
                bar.get("net_return"),
                bar.get("net_equity"),
                bar.get("drawdown"),
                bar.get("regime"),
            ])
        csv_data = output.getvalue()
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=TradeMatrix_{item.ticker}_{item.strategy}.csv"},
        )
