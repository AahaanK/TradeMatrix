from app.regimes.features import extract_regime_features
from app.regimes.kmeans_classifier import classify_regimes_kmeans
from app.regimes.rules_classifier import classify_regimes_rules
from tests.fixtures.synthetic_data import (
    create_synthetic_crash_dataframe,
    create_synthetic_uptrend_dataframe,
)


def test_regime_rules_warmup_period():
    # 300 bars: first 252 bars MUST be Undefined
    df = create_synthetic_uptrend_dataframe(n_bars=300)
    features = extract_regime_features(df)
    labels = classify_regimes_rules(features, min_history=252)

    # Bars 0 to 251 must be Undefined
    assert (labels.iloc[:252] == "Undefined").all()
    # Once expanding indicators and min_history warm up (by bar 280), labels must be active
    assert (labels.iloc[280:] != "Undefined").all()


def test_regime_rules_uptrend_classification():
    df = create_synthetic_uptrend_dataframe(n_bars=320)
    features = extract_regime_features(df)
    labels = classify_regimes_rules(features, min_history=252)

    post_warmup = labels.iloc[280:]
    assert all(lbl.startswith("Bull") for lbl in post_warmup)
    bull_low_count = (post_warmup == "Bull/Low Vol").sum()
    assert bull_low_count >= len(post_warmup) * 0.70


def test_regime_rules_crash_classification():
    df = create_synthetic_crash_dataframe(n_bars=300)
    features = extract_regime_features(df)
    labels = classify_regimes_rules(features, min_history=252)

    end_labels = labels.iloc[275:]
    bear_high_count = (end_labels == "Bear/High Vol").sum()
    assert bear_high_count > len(end_labels) * 0.7


def test_regime_rules_persistence_filter():
    df = create_synthetic_crash_dataframe(n_bars=300)
    features = extract_regime_features(df)
    # persistence_filter=3 means a new regime requires 3 consecutive bars to take hold
    labels_raw = classify_regimes_rules(features, min_history=252, persistence_filter=1)
    labels_smoothed = classify_regimes_rules(features, min_history=252, persistence_filter=3)

    assert len(labels_smoothed) == len(labels_raw)
    assert (labels_smoothed.iloc[:252] == "Undefined").all()


def test_kmeans_regimes_training_window():
    df = create_synthetic_uptrend_dataframe(n_bars=400)
    features = extract_regime_features(df)
    labels, metadata = classify_regimes_kmeans(features, train_end_idx=280)

    assert len(labels) == 400
    assert metadata["training_bars"] <= 280
    assert metadata["silhouette_score"] is not None
    assert len(metadata["centroids"]) == 4


def test_kmeans_regimes_insufficient_data():
    df = create_synthetic_uptrend_dataframe(n_bars=50)
    features = extract_regime_features(df)
    labels, metadata = classify_regimes_kmeans(features)
    assert (labels == "Undefined").all()
    assert metadata["ambiguous"] is True
