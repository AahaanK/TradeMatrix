import pytest
from fastapi.testclient import TestClient

from app.database.base import Base
from app.database.session import engine
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    yield
    # Cleanup


def test_health_check():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["service"] == "TradeMatrix"


def test_market_data_endpoint():
    res = client.get("/api/v1/market/data?ticker=SPY")
    assert res.status_code == 200
    data = res.json()
    assert data["ticker"] == "SPY"
    assert data["total_bars"] > 1000
    assert data["data_quality"]["is_valid"] is True
    assert len(data["dataset_fingerprint"]) == 64


def test_regimes_analyze_endpoint():
    payload = {
        "ticker": "SPY",
        "method": "rules",
        "vol_percentile": 0.60,
        "min_history": 252,
    }
    res = client.post("/api/v1/regimes/analyze", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["total_bars"] > 1000
    assert "transition_intelligence" in data
    assert "latest_regime" in data


def test_backtest_run_endpoint():
    payload = {
        "ticker": "SPY",
        "strategy": "momentum",
        "params": {"lookback": 63, "threshold": 0.0},
        "commission_bps": 5.0,
        "slippage_bps": 5.0,
        "initial_capital": 100000.0,
    }
    res = client.post("/api/v1/backtests/run", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "metrics" in data
    assert "equity_curve" in data
    assert data["metrics"]["total_return"] is not None


def test_backtest_compare_endpoint():
    payload = {
        "ticker": "SPY",
        "commission_bps": 5.0,
        "slippage_bps": 5.0,
    }
    res = client.post("/api/v1/backtests/compare", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "regime_matrix" in data
    assert "insights" in data
    assert len(data["insights"]) > 0


def test_risk_analyze_endpoint():
    payload = {
        "ticker": "SPY",
        "strategy": "momentum",
        "params": {"lookback": 63},
        "confidence_level": 0.95,
    }
    res = client.post("/api/v1/risk/analyze", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "var" in data
    assert "cvar" in data
    assert "stress_presets" in data
    assert "cost_sensitivity" in data


def test_research_out_of_sample_endpoint():
    payload = {
        "ticker": "SPY",
        "strategy": "momentum",
        "train_end_date": "2020-12-31",
        "test_start_date": "2021-01-04",
        "param_grid": [{"lookback": 21}, {"lookback": 63}],
    }
    res = client.post("/api/v1/research/out-of-sample", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "degradation" in data
    assert "chosen_params" in data


def test_experiment_crud_and_reopen_reproducibility():
    # 1. Run a backtest
    bt_res = client.post("/api/v1/backtests/run", json={
        "ticker": "SPY",
        "strategy": "momentum",
        "params": {"lookback": 63},
    }).json()

    # 2. Save experiment
    exp_payload = {
        "name": "Integration Momentum Test",
        "ticker": "SPY",
        "source": bt_res.get("source", "bundled"),
        "dataset_fingerprint": bt_res["dataset_fingerprint"],
        "strategy": "momentum",
        "params": {"lookback": 63},
        "metrics": bt_res["metrics"],
        "equity_curve": bt_res["equity_curve"][:10],
        "trades": bt_res["trades"][:5],
    }
    create_res = client.post("/api/v1/experiments", json=exp_payload)
    assert create_res.status_code == 200
    exp_id = create_res.json()["id"]

    # 3. Reopen experiment
    get_res = client.get(f"/api/v1/experiments/{exp_id}")
    assert get_res.status_code == 200
    opened = get_res.json()
    assert opened["metrics"]["total_return"] == bt_res["metrics"]["total_return"]
    # Check reproducibility fingerprint matches
    assert opened["reproducibility"]["fingerprint_matches"] is True

    # 4. Duplicate
    dup_res = client.post(f"/api/v1/experiments/{exp_id}/duplicate")
    assert dup_res.status_code == 200
    dup_id = dup_res.json()["id"]
    assert dup_id != exp_id

    # 5. Export CSV and PDF
    csv_res = client.get(f"/api/v1/experiments/{exp_id}/export?format=csv")
    assert csv_res.status_code == 200
    assert "TradeMatrix" in csv_res.text

    pdf_res = client.get(f"/api/v1/experiments/{exp_id}/export?format=pdf")
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert len(pdf_res.content) > 1000

    # 6. Delete
    del_res = client.delete(f"/api/v1/experiments/{exp_id}")
    assert del_res.status_code == 200


def test_market_data_weekly_resampled():
    daily = client.get("/api/v1/market/data?ticker=SPY&interval=1d").json()
    weekly = client.get("/api/v1/market/data?ticker=SPY&interval=1wk").json()
    monthly = client.get("/api/v1/market/data?ticker=SPY&interval=1mo").json()
    assert weekly["total_bars"] < daily["total_bars"]
    assert monthly["total_bars"] < weekly["total_bars"]
    assert monthly["total_bars"] == 120  # 2014-2023 inclusive
    assert weekly["bars"][-1]["date"] <= daily["bars"][-1]["date"]
