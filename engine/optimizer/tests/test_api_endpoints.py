"""HTTP contract tests for /optimize, /ladder, /runway, and /signal."""

from __future__ import annotations

from fastapi.testclient import TestClient

from engine.app.main import app

client = TestClient(app)

_BODY = {
    "state": {
        "timestamp": "2026-06-01T12:00:00",
        "solar_available_kw": 40.0,
        "wind_available_kw": 10.0,
        "battery_soc_kwh": 50.0,
        "battery_capacity_kwh": 100.0,
        "battery_max_charge_kw": 25.0,
        "battery_max_discharge_kw": 25.0,
        "diesel_max_kw": 30.0,
        "diesel_fuel_liters": 150.0,
        "diesel_cost_per_kwh": 0.45,
    },
    "demand": {
        "tier1_kw": 8.0,
        "tier2_kw": 6.0,
        "tier3_kw": 12.0,
        "tier4_kw": 10.0,
    },
    "forecast": {
        "solar_next_hour": 35.0,
        "wind_next_hour": 8.0,
        "demand_growth_factor": 1.0,
    },
    "constraints": {
        "battery_min_soc": 0.2,
        "battery_max_soc": 0.9,
        "co2_cost": 0.08,
        "degradation_cost": 0.04,
    },
}


def test_optimize_endpoint() -> None:
    response = client.post("/optimize", json=_BODY)
    assert response.status_code == 200
    payload = response.json()
    assert "solar_used" in payload
    assert "reason_codes" in payload
    assert payload["reliability_score"] >= 0.0
    assert isinstance(payload["reason_codes"], list)


def test_ladder_endpoint() -> None:
    body = {**_BODY, "stage": 2}
    response = client.post("/ladder", json=body)
    assert response.status_code == 200
    payload = response.json()
    assert "LADDER_STAGE_2" in payload["reason_codes"]
    assert payload["diesel_output"] >= 0.0


def test_runway_endpoint() -> None:
    response = client.get("/runway", params={"diesel_fuel_liters": 200.0})
    assert response.status_code == 200
    payload = response.json()
    assert "remaining_liters" in payload
    assert "daily_diesel_consumption" in payload
    assert "projected_days_remaining" in payload
    assert payload["projected_days_remaining"] >= 0.0


def test_signal_endpoint() -> None:
    response = client.get("/signal")
    assert response.status_code == 200
    payload = response.json()
    assert payload["color"] in {"GREEN", "YELLOW", "RED"}
    assert isinstance(payload["message"], str)


def test_compare_endpoint() -> None:
    response = client.post("/compare", json=_BODY)
    assert response.status_code == 200
    payload = response.json()
    assert "ai_optimal" in payload
    assert "diesel_first" in payload
    assert "renewable_first" in payload
    assert "cost_usd" in payload["ai_optimal"]
    assert "co2_kg" in payload["ai_optimal"]
    assert "reliability_pct" in payload["ai_optimal"]


def test_docs_available() -> None:
    response = client.get("/docs")
    assert response.status_code == 200
    openapi = client.get("/openapi.json")
    assert openapi.status_code == 200
    paths = openapi.json()["paths"]
    assert "/optimize" in paths
    assert "/ladder" in paths
    assert "/compare" in paths
    assert "/runway" in paths
    assert "/signal" in paths

