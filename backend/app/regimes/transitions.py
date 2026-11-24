"""
Empirical Regime Transition Intelligence & Analytics.
Computes first-order Markov transition probabilities, observed durations, and recent changes.
Excludes Undefined warm-up periods.
"""

from typing import Any

import numpy as np
import pandas as pd

REGIMES_ORDER = [
    "Bull/Low Vol",
    "Bull/High Vol",
    "Bear/Low Vol",
    "Bear/High Vol",
]


def compute_regime_transitions(
    regime_series: pd.Series,
    dates: pd.Series,
    annualization_factor: int = 252
) -> dict[str, Any]:
    """
    Computes empirical transition matrix, episode statistics, and recent regime switches.
    """
    # Filter out Undefined
    valid_mask = regime_series.isin(REGIMES_ORDER)
    clean_regimes = regime_series[valid_mask].reset_index(drop=True)
    clean_dates = dates[valid_mask].reset_index(drop=True)

    n_valid = len(clean_regimes)
    if n_valid < 2:
        return {
            "transition_matrix": {},
            "counts_matrix": {},
            "persistence": {},
            "expected_duration": {},
            "observed_mean_duration": {},
            "transition_frequency_per_year": 0.0,
            "last_changes": [],
            "regime_distribution": {},
        }

    # 1. Transition counts and probabilities
    counts = {r1: {r2: 0 for r2 in REGIMES_ORDER} for r1 in REGIMES_ORDER}
    for t in range(n_valid - 1):
        curr_r = clean_regimes.iloc[t]
        next_r = clean_regimes.iloc[t + 1]
        if curr_r in counts and next_r in counts[curr_r]:
            counts[curr_r][next_r] += 1

    probs = {r1: {r2: 0.0 for r2 in REGIMES_ORDER} for r1 in REGIMES_ORDER}
    persistence: dict[str, float] = {}
    expected_duration: dict[str, float | None] = {}

    for r1 in REGIMES_ORDER:
        row_sum = sum(counts[r1].values())
        if row_sum > 0:
            for r2 in REGIMES_ORDER:
                probs[r1][r2] = round(counts[r1][r2] / row_sum, 4)
            p_ii = probs[r1][r1]
            persistence[r1] = p_ii
            # Expected duration E[T] = 1 / (1 - p_ii)
            if p_ii < 1.0:
                expected_duration[r1] = round(1.0 / (1.0 - p_ii), 2)
            else:
                expected_duration[r1] = None
        else:
            persistence[r1] = 0.0
            expected_duration[r1] = None

    # 2. Observed contiguous episodes and durations
    episodes: list[dict[str, Any]] = []
    curr_episode_regime = clean_regimes.iloc[0]
    curr_episode_start = clean_dates.iloc[0]
    curr_episode_len = 1

    for t in range(1, n_valid):
        r = clean_regimes.iloc[t]
        if r == curr_episode_regime:
            curr_episode_len += 1
        else:
            episodes.append({
                "regime": curr_episode_regime,
                "start_date": str(curr_episode_start)[:10],
                "end_date": str(clean_dates.iloc[t - 1])[:10],
                "duration_bars": curr_episode_len,
            })
            curr_episode_regime = r
            curr_episode_start = clean_dates.iloc[t]
            curr_episode_len = 1

    # Append final episode
    episodes.append({
        "regime": curr_episode_regime,
        "start_date": str(curr_episode_start)[:10],
        "end_date": str(clean_dates.iloc[-1])[:10],
        "duration_bars": curr_episode_len,
    })

    # Observed mean durations
    observed_mean_duration: dict[str, float | None] = {}
    for r in REGIMES_ORDER:
        r_episodes = [e["duration_bars"] for e in episodes if e["regime"] == r]
        if r_episodes:
            observed_mean_duration[r] = round(float(np.mean(r_episodes)), 2)
        else:
            observed_mean_duration[r] = None

    # Total transitions and transitions per year
    total_transitions = len(episodes) - 1
    total_years = max(n_valid / annualization_factor, 0.1)
    trans_freq_per_year = round(total_transitions / total_years, 2)

    # Last 10 regime changes
    last_changes = []
    for i in range(max(1, len(episodes) - 10), len(episodes)):
        prev_ep = episodes[i - 1]
        curr_ep = episodes[i]
        last_changes.append({
            "date": curr_ep["start_date"],
            "from_regime": prev_ep["regime"],
            "to_regime": curr_ep["regime"],
            "previous_duration_bars": prev_ep["duration_bars"],
        })
    last_changes.reverse()

    # Overall regime distribution
    counts_series = clean_regimes.value_counts()
    regime_dist = {}
    for r in REGIMES_ORDER:
        cnt = int(counts_series.get(r, 0))
        regime_dist[r] = {
            "count": cnt,
            "percentage": round(cnt / n_valid, 4) if n_valid > 0 else 0.0,
        }

    return {
        "transition_matrix": probs,
        "counts_matrix": counts,
        "persistence": persistence,
        "expected_duration": expected_duration,
        "observed_mean_duration": observed_mean_duration,
        "transition_frequency_per_year": trans_freq_per_year,
        "total_transitions": total_transitions,
        "last_changes": last_changes,
        "regime_distribution": regime_dist,
        "disclaimer": "Historical empirical frequencies, not predictive forecasts. Undefined periods excluded.",
    }
