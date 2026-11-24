"""
K-Means Clustering Market Regime Classifier.
Fitted strictly on specified training window with fixed random seed.
Centroid ranking maps statistical clusters to 4 economic regime labels.
"""

from typing import Any

import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler


def classify_regimes_kmeans(
    features_df: pd.DataFrame,
    train_end_idx: int | None = None,
    random_state: int = 42,
    feature_cols: list[str] | None = None,
) -> tuple[pd.Series, dict[str, Any]]:
    """
    Fits K-Means (k=4) on training data up to `train_end_idx` and transforms full series.
    """
    if feature_cols is None:
        feature_cols = ["medium_momentum", "rolling_volatility", "price_to_sma"]

    clean_mask = features_df[feature_cols].notna().all(axis=1)
    if clean_mask.sum() < 60:
        # Not enough clean data
        return pd.Series("Undefined", index=features_df.index, name="regime"), {
            "ambiguous": True,
            "error": "Insufficient valid feature observations for K-Means fitting.",
            "training_bars": 0,
            "silhouette_score": None,
            "centroids": [],
        }

    clean_indices = features_df[clean_mask].index
    if train_end_idx is None:
        # Default to first 50% or minimum 60 for training
        train_len = max(60, len(clean_indices) // 2)
        train_indices = clean_indices[:train_len]
    else:
        train_indices = [idx for idx in clean_indices if idx <= train_end_idx]
        if len(train_indices) < 40:
            train_indices = clean_indices[:min(len(clean_indices), 60)]

    train_data = features_df.loc[train_indices, feature_cols].to_numpy()

    scaler = StandardScaler()
    scaled_train = scaler.fit_transform(train_data)

    kmeans = KMeans(n_clusters=4, random_state=random_state, n_init=10)
    train_clusters = kmeans.fit_predict(scaled_train)

    try:
        sil_score = float(silhouette_score(scaled_train, train_clusters))
    except Exception:
        sil_score = 0.0

    # Cluster unscaled centroids
    centroids = scaler.inverse_transform(kmeans.cluster_centers_)
    centroid_df = pd.DataFrame(centroids, columns=feature_cols)
    centroid_df["cluster_id"] = range(4)
    centroid_df["size"] = pd.Series(train_clusters).value_counts().sort_index().values

    # Determine mapping:
    # 2 highest momentum clusters are Bull candidates, 2 lowest are Bear
    # Within each pair, higher volatility is High Vol, lower is Low Vol
    sorted_by_mom = centroid_df.sort_values("medium_momentum", ascending=False).reset_index()

    bull_pair = sorted_by_mom.iloc[:2]
    bear_pair = sorted_by_mom.iloc[2:]

    cluster_to_regime: dict[int, str] = {}
    ambiguous = False

    # Bull pair
    if bull_pair.iloc[0]["rolling_volatility"] >= bull_pair.iloc[1]["rolling_volatility"]:
        cluster_to_regime[int(bull_pair.iloc[0]["cluster_id"])] = "Bull/High Vol"
        cluster_to_regime[int(bull_pair.iloc[1]["cluster_id"])] = "Bull/Low Vol"
    else:
        cluster_to_regime[int(bull_pair.iloc[1]["cluster_id"])] = "Bull/High Vol"
        cluster_to_regime[int(bull_pair.iloc[0]["cluster_id"])] = "Bull/Low Vol"

    # Bear pair
    if bear_pair.iloc[0]["rolling_volatility"] >= bear_pair.iloc[1]["rolling_volatility"]:
        cluster_to_regime[int(bear_pair.iloc[0]["cluster_id"])] = "Bear/High Vol"
        cluster_to_regime[int(bear_pair.iloc[1]["cluster_id"])] = "Bear/Low Vol"
    else:
        cluster_to_regime[int(bear_pair.iloc[1]["cluster_id"])] = "Bear/High Vol"
        cluster_to_regime[int(bear_pair.iloc[0]["cluster_id"])] = "Bear/Low Vol"

    # Predict full dataset using frozen scaler and kmeans model
    full_labels = pd.Series("Undefined", index=features_df.index, name="regime")

    valid_full = features_df.loc[clean_indices, feature_cols].to_numpy()
    scaled_full = scaler.transform(valid_full)
    predicted_clusters = kmeans.predict(scaled_full)

    assigned_labels = [cluster_to_regime.get(c, "Undefined") for c in predicted_clusters]
    full_labels.loc[clean_indices] = assigned_labels

    metadata = {
        "silhouette_score": sil_score,
        "centroids": centroid_df.to_dict(orient="records"),
        "cluster_mapping": cluster_to_regime,
        "ambiguous": ambiguous,
        "training_bars": len(train_indices),
        "total_classified_bars": len(clean_indices),
    }

    return full_labels, metadata
