"""
test_simulation.py

Unit and physics validation tests for Member D's simulation modules:
- generators/ (solar, wind, demand, battery, diesel)
- forecasting/ (solar, wind, demand, early warning)
- events/ (scenario_injector)
- weather/ (weather_client fallback)
"""

import sys
import os
from datetime import datetime, timedelta

# Setup module paths
_cur = os.path.dirname(os.path.abspath(__file__))
_sim_dir = os.path.dirname(_cur)
_engine_dir = os.path.dirname(_sim_dir)
_root_dir = os.path.dirname(_engine_dir)
for p in [_root_dir, _engine_dir, _sim_dir]:
    if p not in sys.path:
        sys.path.insert(0, p)

from generators import solar_profile, wind_profile, demand_profile, battery_dynamics, diesel_fuel_state
from forecasting import forecast_solar, forecast_wind, forecast_demand
from events import scenario_injector
from weather import weather_client
try:
    from shared.schemas.simulation_models import LoadTier
except ImportError:
    from shared_schemas import LoadTier


def test_solar_zero_at_night():
    midnight = datetime(2026, 6, 21, 0, 0)
    assert solar_profile.get_irradiance(midnight, jitter=False) == 0.0
    assert solar_profile.get_panel_output_kw(midnight, array_capacity_kw=100.0, jitter=False) == 0.0


def test_solar_positive_at_noon():
    noon = datetime(2026, 6, 21, 12, 0)
    ghi = solar_profile.get_irradiance(noon, jitter=False)
    out = solar_profile.get_panel_output_kw(noon, array_capacity_kw=100.0, jitter=False)
    assert ghi > 500.0
    assert out > 50.0


def test_solar_output_capped_at_capacity():
    noon = datetime(2026, 6, 21, 12, 0)
    out = solar_profile.get_panel_output_kw(noon, array_capacity_kw=50.0, jitter=False)
    assert 0.0 <= out <= 50.0


def test_solar_cloud_attenuation():
    noon = datetime(2026, 6, 21, 12, 0)
    clear_out = solar_profile.get_panel_output_kw(noon, cloud_cover_pct=0.0, jitter=False)
    cloudy_out = solar_profile.get_panel_output_kw(noon, cloud_cover_pct=80.0, jitter=False)
    assert cloudy_out < clear_out


def test_wind_power_curve_bounds():
    assert wind_profile.get_turbine_output_kw(0.0, rated_capacity_kw=30.0) == 0.0     # Below cut-in
    assert wind_profile.get_turbine_output_kw(2.5, rated_capacity_kw=30.0) == 0.0     # Below cut-in
    assert wind_profile.get_turbine_output_kw(30.0, rated_capacity_kw=30.0) == 0.0    # Above cut-out furl
    assert wind_profile.get_turbine_output_kw(12.0, rated_capacity_kw=30.0) == 30.0   # At rated
    assert wind_profile.get_turbine_output_kw(15.0, rated_capacity_kw=30.0) == 30.0   # Capped at rated


def test_wind_power_curve_cubic():
    mid_wind = 7.5
    out = wind_profile.get_turbine_output_kw(mid_wind, rated_capacity_kw=30.0)
    expected_frac = ((7.5 - 3.0) / (12.0 - 3.0)) ** 3
    assert abs(out - round(30.0 * expected_frac, 2)) < 0.05


def test_demand_every_point_has_tier():
    now = datetime(2026, 6, 21, 8, 0)
    points = demand_profile.get_demand_at(now, jitter=False)
    assert len(points) == 9
    assert all(isinstance(p.tier, LoadTier) for p in points)
    assert all(p.load_kw > 0 for p in points)


def test_demand_by_tier_totals_match():
    now = datetime(2026, 6, 21, 19, 0)
    by_tier = demand_profile.get_demand_by_tier(now, jitter=False)
    total_direct = demand_profile.get_total_demand_kw(now, jitter=False)
    assert abs(sum(by_tier.values()) - total_direct) < 0.02


def test_battery_soc_stays_in_bounds():
    battery = battery_dynamics.Battery(capacity_kwh=100.0, initial_soc_pct=50.0,
                                       min_soc_pct=10.0, max_soc_pct=95.0)
    t = datetime(2026, 6, 21, 0, 0)
    # Aggressively overcharge then overdischarge
    for _ in range(10):
        state = battery.step(t, requested_kw=50.0, step_hours=1.0)
        assert 10.0 <= state.soc_pct <= 95.0
        t += timedelta(hours=1)

    for _ in range(15):
        state = battery.step(t, requested_kw=-50.0, step_hours=1.0)
        assert 10.0 <= state.soc_pct <= 95.0
        t += timedelta(hours=1)


def test_battery_scenario_capacity_trip():
    battery = battery_dynamics.Battery(capacity_kwh=100.0, initial_soc_pct=50.0)
    battery.set_capacity_multiplier(0.0)  # Total bank trip
    st = battery.step(datetime.now(), requested_kw=10.0, step_hours=0.25)
    assert st.capacity_kwh == 0.0
    assert st.soc_pct == 0.0


def test_diesel_fuel_never_negative():
    gen = diesel_fuel_state.DieselGenerator(tank_capacity_l=50.0, rated_capacity_kw=50.0, initial_fuel_l=50.0)
    t = datetime(2026, 6, 21, 0, 0)
    for _ in range(25):
        state = gen.step(t, dispatch_kw=50.0, step_hours=1.0)
        assert state.fuel_remaining_l >= 0.0
        t += timedelta(hours=1)
    assert state.fuel_remaining_l == 0.0
    assert state.generator_on is False


def test_diesel_idling_penalty():
    gen = diesel_fuel_state.DieselGenerator(tank_capacity_l=1000.0, rated_capacity_kw=100.0)
    rate_sweet_spot = gen.get_consumption_rate(80.0)
    rate_idling = gen.get_consumption_rate(20.0)
    assert rate_idling > rate_sweet_spot


def test_diesel_refuel_caps_at_tank_capacity():
    gen = diesel_fuel_state.DieselGenerator(tank_capacity_l=500.0, rated_capacity_kw=50.0, initial_fuel_l=100.0)
    gen.refuel(datetime(2026, 6, 21, 12, 0), liters=800.0)
    assert gen.fuel_remaining_l == 500.0
    assert len(gen.refuel_history) == 1


def test_forecast_solar_confidence_decays():
    fc = forecast_solar.forecast(datetime(2026, 6, 21, 0, 0), horizon_hours=24, step_minutes=60)
    assert fc.confidence[0] > fc.confidence[-1]
    assert len(fc.points) == len(fc.confidence)


def test_forecast_wind_confidence_decays_faster_than_solar():
    start = datetime(2026, 6, 21, 0, 0)
    solar_fc = forecast_solar.forecast(start, horizon_hours=72, step_minutes=60)
    wind_fc = forecast_wind.forecast(start, horizon_hours=72, step_minutes=60)
    solar_drop = solar_fc.confidence[0] - solar_fc.confidence[-1]
    wind_drop = wind_fc.confidence[0] - wind_fc.confidence[-1]
    assert wind_drop > solar_drop


def test_forecast_demand_has_all_tiers():
    fc = forecast_demand.forecast(datetime(2026, 6, 21, 0, 0), horizon_hours=24, step_minutes=60)
    for pt in fc["points"]:
        assert set(pt["by_tier"].keys()) == {1, 2, 3, 4}


def test_flag_early_warning():
    fc = forecast_demand.forecast(datetime(2026, 6, 21, 0, 0), horizon_hours=24, step_minutes=60)
    points_count = len(fc["points"])
    # Scenario A: Adequate supply everywhere
    adequate_supply = [100.0] * points_count
    assert forecast_demand.flag_early_warning(adequate_supply, fc, lookahead_hours=(6.0, 12.0)) is False

    # Scenario B: Supply deficit at hour 8 (within 6-12h window)
    deficient_supply = [100.0] * points_count
    deficient_supply[8] = 0.0
    assert forecast_demand.flag_early_warning(deficient_supply, fc, lookahead_hours=(6.0, 12.0)) is True


def test_scenario_injector_all_scenarios():
    for name in scenario_injector.VALID_SCENARIOS:
        ev = scenario_injector.trigger(name)
        assert ev.name == name
        assert ev.duration_hours > 0


def test_scenario_injector_unknown_error():
    try:
        scenario_injector.trigger("alien_invasion")
        assert False, "Expected ValueError"
    except ValueError:
        pass


def test_weather_client_fallback():
    # Force synthetic mode
    w = weather_client.get_current_weather(use_live=False)
    assert w.source == "synthetic"
    assert w.ghi_w_m2 >= 0.0
    assert w.wind_speed_m_s >= 0.0
