"""
Rules-Based Market Regime Classifier.
Uses causal indicators and expanding-window historical percentiles.
No lookahead is permitted.
"""

import numpy as np
import pandas as pd

REGIME_LABELS = [
    "Bull/Low Vol",
    "Bull/High Vol",
    "Bear/Low Vol",
    "Bear/High Vol",
    "Undefined",
]


def classify_regimes_rules(
    features_df: pd.DataFrame,
    vol_percentile: float = 0.60,
    min_history: int = 252,
    require_sma: bool = True,
    require_momentum: bool = True,
    persistence_filter: int = 1,
) -> pd.Series:
    """
    Classifies market regimes causally bar-by-bar using expanding-window history.

    Parameters:
    - features_df: DataFrame containing 'close', 'sma_trend', 'medium_momentum', 'rolling_volatility'
    - vol_percentile: expanding quantile cutoff (e.g. 0.60 = 60th percentile)
    - min_history: minimum observations before emitting non-Undefined labels (default 252 bars)
    - require_sma: whether close > sma_trend is required for Bull
    - require_momentum: whether medium_momentum > 0 is required for Bull
    - persistence_filter: new regime must persist for m periods before transitioning
    """
    n = len(features_df)

    close = features_df["close"].to_numpy()
    sma = features_df["sma_trend"].to_numpy()
    med_mom = features_df["medium_momentum"].to_numpy()
    vol = features_df["rolling_volatility"].to_numpy()

    # Expanding window history buffer for volatility to avoid future leakage
    valid_vol_history = []

    raw_labels = ["Undefined"] * n

    for t in range(n):
        curr_vol = vol[t]
        if not np.isnan(curr_vol):
            valid_vol_history.append(curr_vol)

        if t < min_history or len(valid_vol_history) < min_history:
            raw_labels[t] = "Undefined"
            continue

        # Expanding percentile cutoff calculated strictly up to time t
        cutoff = float(np.percentile(valid_vol_history, vol_percentile * 100))
        is_high_vol = curr_vol > cutoff

        # Trend condition
        curr_close = close[t]
        curr_sma = sma[t]
        curr_mom = med_mom[t]

        is_bull = True
        if require_sma:
            if np.isnan(curr_sma) or curr_close <= curr_sma:
                is_bull = False
        if require_momentum:
            if np.isnan(curr_mom) or curr_mom <= 0:
                is_bull = False

        if is_bull:
            label = "Bull/High Vol" if is_high_vol else "Bull/Low Vol"
        else:
            label = "Bear/High Vol" if is_high_vol else "Bear/Low Vol"

        raw_labels[t] = label

    # Apply optional causal persistence filter
    if persistence_filter <= 1:
        return pd.Series(raw_labels, index=features_df.index, name="regime")

    smoothed_labels = ["Undefined"] * n
    current_regime = "Undefined"
    candidate_regime = "Undefined"
    candidate_count = 0

    for t in range(n):
        incoming = raw_labels[t]
        if incoming == "Undefined":
            smoothed_labels[t] = "Undefined"
            current_regime = "Undefined"
            candidate_regime = "Undefined"
            candidate_count = 0
            continue

        if current_regime == "Undefined":
            current_regime = incoming
            smoothed_labels[t] = current_regime
            continue

        if incoming == current_regime:
            candidate_regime = incoming
            candidate_count = 0
            smoothed_labels[t] = current_regime
        else:
            if incoming == candidate_regime:
                candidate_count += 1
            else:
                candidate_regime = incoming
                candidate_count = 1

            if candidate_count >= persistence_filter:
                current_regime = candidate_regime
                candidate_count = 0

            smoothed_labels[t] = current_regime

    return pd.Series(smoothed_labels, index=features_df.index, name="regime")
