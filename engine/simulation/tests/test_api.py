"""
test_api.py

API integration tests for FastAPI routes exposed by Member D:
- GET /health
- GET /state & GET /simulation/state
- GET /forecast & GET /simulation/forecast
- POST /events & POST /simulation/events
- POST /battery/step
- POST /diesel/step
- POST /diesel/refuel
- POST /reset
"""

import sys
import os
from fastapi.testclient import TestClient

# Setup module paths
_cur = os.path.dirname(os.path.abspath(__file__))
_sim_dir = os.path.dirname(_cur)
_engine_dir = os.path.dirname(_sim_dir)
_root_dir = os.path.dirname(_engine_dir)
for p in [_root_dir, _engine_dir, _sim_dir]:
    if p not in sys.path:
        sys.path.insert(0, p)

from app.main import app

client = TestClient(app)


def test_health_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["service"] == "gridpilot-engine"


def test_get_state_root_and_prefix():
    # Root alias /state
    res = client.get("/state")
    assert res.status_code == 200
    data = res.json()
    assert "timestamp" in data
    assert "solar_output_kw" in data
    assert "wind_output_kw" in data
    assert "demand" in data
    assert "by_tier" in data["demand"]
    assert "battery" in data
    assert "diesel" in data
    assert "weather" in data
    assert data["weather"]["source"] in ["live", "synthetic"]

    # Prefixed alias /simulation/state
    res_pref = client.get("/simulation/state")
    assert res_pref.status_code == 200
    assert res_pref.json()["timestamp"] is not None


def test_get_forecast():
    res = client.get("/forecast?horizon_hours=24&step_minutes=60")
    assert res.status_code == 200
    data = res.json()
    assert data["horizon_hours"] == 24
    assert len(data["solar"]["points"]) == 25
    assert len(data["wind"]["points"]) == 25
    assert len(data["demand"]["points"]) == 25


def test_post_event_lifecycle():
    # Inject cloud cover
    req = {
        "name": "cloud_cover",
        "severity": 85.0,
        "duration_hours": 2.0
    }
    res = client.post("/events", json=req)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "injected"
    assert data["event"]["name"] == "cloud_cover"

    # Verify state reflects active scenario
    res_st = client.get("/state")
    st_data = res_st.json()
    assert st_data["active_scenario"] is not None
    assert st_data["active_scenario"]["name"] == "cloud_cover"

    # Reset
    res_rst = client.post("/reset")
    assert res_rst.status_code == 200
    res_clean = client.get("/state")
    assert res_clean.json()["active_scenario"] is None


def test_post_invalid_event():
    req = {"name": "earthquake_strike"}
    res = client.post("/events", json=req)
    assert res.status_code == 400


def test_battery_step_api():
    res = client.post("/battery/step", json={"requested_kw": 25.0, "step_hours": 0.5})
    assert res.status_code == 200
    data = res.json()
    assert "soc_pct" in data
    assert "charge_rate_kw" in data


def test_diesel_step_and_refuel_api():
    # Step generator at 35 kW
    res = client.post("/diesel/step", json={"dispatch_kw": 35.0, "step_hours": 1.0})
    assert res.status_code == 200
    data = res.json()
    assert data["generator_on"] is True
    assert data["current_load_kw"] == 35.0

    # Refuel
    res_refuel = client.post("/diesel/refuel", json={"liters": 100.0})
    assert res_refuel.status_code == 200
    refuel_data = res_refuel.json()
    assert len(refuel_data["refuel_history"]) > 0
