import pandas as pd
import pytest

from app.core.errors import DataQualityError
from app.services.market_data import market_data_service, validate_market_data


def test_validation_duplicate_dates():
    df = pd.DataFrame({
        "date": ["2023-01-01", "2023-01-01", "2023-01-02"],
        "open": [100.0, 101.0, 102.0],
        "high": [105.0, 105.0, 105.0],
        "low": [99.0, 99.0, 99.0],
        "close": [102.0, 102.0, 103.0],
        "volume": [100, 200, 300],
    })
    clean_df, report = validate_market_data(df)
    assert len(clean_df) == 2
    assert report.duplicate_dates_removed == 1


def test_validation_nonpositive_prices():
    df = pd.DataFrame({
        "date": ["2023-01-01", "2023-01-02"],
        "open": [100.0, -50.0],
        "high": [105.0, 50.0],
        "low": [99.0, -60.0],
        "close": [102.0, -55.0],
        "volume": [100, 200],
    })
    _, report = validate_market_data(df)
    assert not report.is_valid
    assert report.nonpositive_price_bars > 0
    assert any(i.check == "nonpositive_prices" for i in report.issues)


def test_validation_ohlc_violations():
    # Low > Open or High < Close
    df = pd.DataFrame({
        "date": ["2023-01-01"],
        "open": [100.0],
        "high": [90.0],  # High < Open
        "low": [105.0],  # Low > Open
        "close": [102.0],
        "volume": [100],
    })
    _, report = validate_market_data(df)
    assert not report.is_valid
    assert report.ohlc_violation_bars > 0


def test_validation_missing_required_columns():
    df = pd.DataFrame({
        "date": ["2023-01-01"],
        "price": [100.0],
    })
    _, report = validate_market_data(df)
    assert not report.is_valid
    assert any(i.check == "required_columns" for i in report.issues)


def test_validation_oversized_upload():
    # Attempting to upload 15MB file when max is 10MB
    large_bytes = b"a" * (11 * 1024 * 1024)
    with pytest.raises(DataQualityError):
        market_data_service.parse_csv_upload(large_bytes)
