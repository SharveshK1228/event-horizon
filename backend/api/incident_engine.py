"""Deterministic incident selection for Event Horizon observations."""

from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any


@dataclass(frozen=True)
class IncidentRule:
    incident_type: str
    title: str
    severity: str
    sop_id: str


RULES = {
    "tracking_unavailable": IncidentRule(
        "tracking_unavailable", "Tracking unavailable", "high", "SOP-VERIFY-01"
    ),
    "visibility_degraded": IncidentRule(
        "visibility_degraded", "Visibility degraded", "high", "SOP-VISIBILITY-01"
    ),
    "camera_motion": IncidentRule(
        "camera_motion", "Camera movement suspected", "medium", "SOP-CAMERA-01"
    ),
    "insufficient_tracking": IncidentRule(
        "insufficient_tracking", "Insufficient tracking support", "medium", "SOP-VERIFY-01"
    ),
    "collective_motion": IncidentRule(
        "collective_motion",
        "Unusual collective movement — verification required",
        "medium",
        "SOP-CROWD-01",
    ),
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def choose_rule(observation: dict[str, Any]) -> tuple[IncidentRule | None, list[str]]:
    """Choose one highest-priority incident and return bounded evidence."""
    tracking = observation.get("tracking_state")
    visibility = observation.get("visibility_status")
    motion = observation.get("motion_state")

    if visibility == "degraded":
        return RULES["visibility_degraded"], [
            "The current image-quality signal is degraded.",
            "Crowd count and motion conclusions must be treated as unreliable.",
        ]
    if motion == "CAMERA MOVEMENT SUSPECTED":
        return RULES["camera_motion"], [
            "The scene-motion pattern may be caused by camera movement.",
            "Motion-based crowd inference is suspended until the view stabilizes.",
        ]
    if tracking == "TRACKING UNAVAILABLE":
        return RULES["tracking_unavailable"], [
            "No usable tracking evidence is available for the current interval.",
            "Missing detections do not establish an empty or safe scene.",
        ]
    if tracking == "INSUFFICIENT TRACK SUPPORT":
        return RULES["insufficient_tracking"], [
            "Too few continuous tracks support a person-level motion comparison.",
            "Optical flow may continue, but it is scene motion rather than verified person motion.",
        ]
    if motion == "UNUSUAL COLLECTIVE MOVEMENT":
        return RULES["collective_motion"], [
            "A provisional motion rule detected a sustained collective direction change.",
            "This is a verification alert, not a validated surge probability.",
        ]
    return None, []


def make_incident(observation: dict[str, Any], camera_id: str) -> dict[str, Any] | None:
    rule, evidence = choose_rule(observation)
    if rule is None:
        return None
    origin = observation.get("video_time_s")
    token = str(origin).replace(".", "-") if origin is not None else "current"
    return {
        "incident_id": f"EH-{camera_id}-{rule.incident_type}-{token}",
        "incident_type": rule.incident_type,
        "title": rule.title,
        "severity": rule.severity,
        "status": "active",
        "camera_id": camera_id,
        "zone": observation.get("zone", "full_view"),
        "first_detected_at": observation.get("received_at") or utc_now(),
        "latest_update": observation.get("received_at") or utc_now(),
        "video_time_s": origin,
        "sop_id": rule.sop_id,
        "evidence": evidence,
        "limitations": observation.get("limitations", []),
        "data_origin": observation.get("data_origin", "demo"),
        "rule": asdict(rule),
    }
