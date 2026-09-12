"""Runway-based GREEN / YELLOW / RED operational signals."""

from __future__ import annotations

from engine.optimizer.models import SignalResponse

GREEN_MIN_DAYS = 7.0
YELLOW_MIN_DAYS = 3.0


def evaluate_signal(projected_days_remaining: float) -> SignalResponse:
    """Map projected diesel runway onto a discrete operating color."""
    if projected_days_remaining > GREEN_MIN_DAYS:
        return SignalResponse(color="GREEN", message="RUNWAY_GT_7")
    if projected_days_remaining >= YELLOW_MIN_DAYS:
        return SignalResponse(color="YELLOW", message="RUNWAY_3_TO_7")
    return SignalResponse(color="RED", message="RUNWAY_LT_3")
