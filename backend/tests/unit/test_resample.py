import pandas as pd

from app.services.market_data import resample_ohlcv


def _daily_frame() -> pd.DataFrame:
    dates = pd.bdate_range("2024-01-01", "2024-02-29")
    n = len(dates)
    return pd.DataFrame({
        "date": dates,
        "open": [100.0 + i for i in range(n)],
        "high": [101.0 + i for i in range(n)],
        "low": [99.0 + i for i in range(n)],
        "close": [100.5 + i for i in range(n)],
        "volume": [1000.0] * n,
        "adj_close": [100.5 + i for i in range(n)],
    })


def test_daily_interval_is_unchanged():
    df = _daily_frame()
    out = resample_ohlcv(df, "1d")
    assert len(out) == len(df)


def test_weekly_bars_aggregate_correctly():
    df = _daily_frame()
    out = resample_ohlcv(df, "1wk")
    first_week = df[df["date"] <= "2024-01-05"]
    row = out.iloc[0]
    assert row["open"] == first_week["open"].iloc[0]
    assert row["high"] == first_week["high"].max()
    assert row["low"] == first_week["low"].min()
    assert row["close"] == first_week["close"].iloc[-1]
    assert row["volume"] == first_week["volume"].sum()
    # Bars are stamped with the last real trading day, never a future date
    assert pd.Timestamp(row["date"]) == first_week["date"].iloc[-1]
    assert pd.Timestamp(out["date"].max()) <= df["date"].max()


def test_monthly_bars_count():
    out = resample_ohlcv(_daily_frame(), "1mo")
    assert len(out) == 2
    assert pd.Timestamp(out.iloc[1]["date"]) == pd.Timestamp("2024-02-29")
