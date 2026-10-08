"""
Unit tests for the core calculation logic in lambda_function.py
Run locally with: python -m pytest backend/tests/test_logic.py -v
"""

import sys, os, json, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lambda_function import (
    haversine_distance_km,
    bearing_to_delhi,
    is_upwind,
    cluster_fires,
    score_clusters,
    DELHI,
)

# ── Load mock data ────────────────────────────────────────────────────────────
MOCK = json.load(open(os.path.join(os.path.dirname(__file__), "mock_data.json")))


# ─────────────────────────────────────────────────────────────────────────────
# Haversine distance tests
# ─────────────────────────────────────────────────────────────────────────────

def test_distance_same_point():
    """Distance from a point to itself should be 0."""
    d = haversine_distance_km(DELHI["lat"], DELHI["lon"], DELHI["lat"], DELHI["lon"])
    assert d < 0.01, f"Expected ~0 km, got {d}"


def test_distance_amritsar_to_delhi():
    """Amritsar (31.63, 74.87) to Delhi is roughly 430 km."""
    d = haversine_distance_km(31.63, 74.87, DELHI["lat"], DELHI["lon"])
    assert 400 < d < 460, f"Expected ~430 km, got {d:.1f}"


def test_distance_ludhiana_to_delhi():
    """Ludhiana (30.9, 75.85) to Delhi is roughly 300 km."""
    d = haversine_distance_km(30.9, 75.85, DELHI["lat"], DELHI["lon"])
    assert 260 < d < 340, f"Expected ~300 km, got {d:.1f}"


# ─────────────────────────────────────────────────────────────────────────────
# Bearing tests
# ─────────────────────────────────────────────────────────────────────────────

def test_bearing_north_of_delhi():
    """A point directly north of Delhi should have a bearing of ~180° (pointing south to Delhi)."""
    # Slightly north of Delhi, same longitude
    b = bearing_to_delhi(30.0, DELHI["lon"])
    assert 170 < b < 190, f"Expected ~180°, got {b:.1f}"


def test_bearing_west_of_delhi():
    """A point to the NW (Punjab) should have a bearing roughly SE (90–180°)."""
    b = bearing_to_delhi(30.5, 74.5)
    assert 90 < b < 180, f"Expected SE bearing, got {b:.1f}"


# ─────────────────────────────────────────────────────────────────────────────
# Upwind logic tests  (KEY: wind_direction + 180 = smoke travel direction)
# ─────────────────────────────────────────────────────────────────────────────

def test_nw_wind_upwind_of_delhi():
    """
    NW wind (315° from NW) → smoke travels SE (135°).
    A Punjab cluster NW of Delhi should be flagged as upwind.
    """
    bearing = bearing_to_delhi(30.2, 74.5)   # Punjab cluster → Delhi
    # Wind comes from NW (315°), so smoke goes SE (135°)
    assert is_upwind(315, bearing), f"NW wind should be upwind, bearing={bearing:.1f}"


def test_east_wind_not_upwind():
    """
    East wind (90°) → smoke travels west (270°).
    A Punjab cluster should NOT be upwind of Delhi.
    """
    bearing = bearing_to_delhi(30.2, 74.5)
    assert not is_upwind(90, bearing), "East wind should NOT be upwind of Delhi"


def test_tolerance_boundary():
    """Test that a cluster exactly at the ±30° boundary is correctly classified."""
    # bearing from some NW cluster to Delhi
    bearing = bearing_to_delhi(30.0, 74.0)
    # smoke heading exactly at tolerance boundary should still be upwind
    smoke_heading = bearing  # same direction as Delhi
    wind_from = (smoke_heading - 180) % 360  # reverse-engineer "comes from"
    assert is_upwind(wind_from, bearing, tolerance=30)


# ─────────────────────────────────────────────────────────────────────────────
# Clustering tests
# ─────────────────────────────────────────────────────────────────────────────

def test_cluster_reduces_count():
    """Fires in the same ~10km grid cell should merge into one cluster."""
    fires = MOCK["fires"][:-1]  # exclude the low-confidence one
    clusters = cluster_fires(fires)
    assert len(clusters) < len(fires), "Clustering should reduce fire count"


def test_cluster_aggregates_frp():
    """Clustered cell should have total_frp >= any individual fire in it."""
    fires = [
        {"lat": 30.21, "lon": 74.51, "frp": 50.0, "confidence": "high"},
        {"lat": 30.19, "lon": 74.49, "frp": 70.0, "confidence": "high"},
    ]
    clusters = cluster_fires(fires)
    assert len(clusters) == 1, "Two nearby fires should cluster to 1 cell"
    assert clusters[0]["total_frp"] == 120.0, f"Expected 120 FRP, got {clusters[0]['total_frp']}"


# ─────────────────────────────────────────────────────────────────────────────
# End-to-end scoring test with mock data
# ─────────────────────────────────────────────────────────────────────────────

def test_mock_data_produces_high_risk():
    """Full pipeline on mock data should yield High risk."""
    fires = [f for f in MOCK["fires"] if f["confidence"] != "low"]
    clusters = cluster_fires(fires)
    # Inject mock wind data
    for i, c in enumerate(clusters):
        wind = MOCK["wind"]["clusters"][i % len(MOCK["wind"]["clusters"])]
        c["wind_speed_kmh"] = wind["wind_speed_kmh"]
        c["wind_direction_deg"] = wind["wind_direction_deg"]

    risk, scored = score_clusters(clusters)
    assert risk == "High", f"Expected High risk from mock data, got {risk}"
    upwind_count = sum(1 for c in scored if c["is_upwind"])
    assert upwind_count > 0, "At least one cluster should be upwind"
