"""Event Horizon hackathon integration API.

Default mode uses explicit demo scenarios. It does not claim live analysis.
"""

from __future__ import annotations

import json
import os
import threading
import urllib.error
import urllib.request
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from dotenv import load_dotenv
from pydantic import BaseModel, Field

from incident_engine import make_incident


BASE = Path(__file__).resolve().parent
load_dotenv(BASE / ".env")
SOPS = json.loads((BASE / "sops.json").read_text(encoding="utf-8"))

SCENARIOS: dict[str, dict[str, Any]] = {
    "clear": {
        "detected_heads": 214,
        "tracking_state": "TRACK MOTION AVAILABLE",
        "tracking_reliability": 0.82,
        "visibility_status": "reference-like",
        "dominant_direction": "east — image space",
        "motion_state": "OBSERVED MOTION",
        "processing_fps": 19.9,
    },
    "tracking": {
        "detected_heads": None,
        "tracking_state": "TRACKING UNAVAILABLE",
        "tracking_reliability": None,
        "visibility_status": "unverified",
        "dominant_direction": None,
        "motion_state": "FLOW AVAILABLE; PERSON MOTION UNAVAILABLE",
        "processing_fps": 19.9,
    },
    "visibility": {
        "detected_heads": None,
        "tracking_state": "TRACKING UNAVAILABLE",
        "tracking_reliability": None,
        "visibility_status": "degraded",
        "dominant_direction": None,
        "motion_state": "UNRELIABLE",
        "processing_fps": 12.4,
    },
    "camera": {
        "detected_heads": None,
        "tracking_state": "INSUFFICIENT TRACK SUPPORT",
        "tracking_reliability": 0.08,
        "visibility_status": "unverified",
        "dominant_direction": None,
        "motion_state": "CAMERA MOVEMENT SUSPECTED",
        "processing_fps": 13.2,
    },
    "collective": {
        "detected_heads": 238,
        "tracking_state": "TRACK MOTION AVAILABLE",
        "tracking_reliability": 0.76,
        "visibility_status": "reference-like",
        "dominant_direction": "rapid reversal — image space",
        "motion_state": "UNUSUAL COLLECTIVE MOVEMENT",
        "processing_fps": 9.8,
    },
}

app = FastAPI(title="Event Horizon Integration API", version="0.1.0")
state_lock = threading.Lock()
runtime = {"scenario": os.getenv("EH_SCENARIO", "tracking"), "acknowledged": set()}
if runtime["scenario"] not in SCENARIOS:
    runtime["scenario"] = "tracking"


class ScenarioRequest(BaseModel):
    scenario: Literal["clear", "tracking", "visibility", "camera", "collective"]


class AcknowledgeRequest(BaseModel):
    local_only: bool = False
    operator_note: str | None = Field(default=None, max_length=500)


class AssistantRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    incident_id: str | None = None
    observation_timestamp: str | None = None
    sop_version: str | None = None


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def observation() -> dict[str, Any]:
    with state_lock:
        scenario = runtime["scenario"]
    value = deepcopy(SCENARIOS[scenario])
    value.update(
        camera_id="camera-1",
        source_id=f"demo-{scenario}",
        frame_index=None,
        video_time_s=None,
        captured_at=None,
        received_at=now(),
        zone="full_view",
        data_origin="demo",
        forecast_available=False,
        limitations=[
            "Demo evidence; no live video analysis is connected.",
            "Detected heads are not verified site occupancy.",
            "No validated surge probability is available.",
        ],
    )
    return value


def incidents() -> list[dict[str, Any]]:
    item = make_incident(observation(), "camera-1")
    if item is None:
        return []
    with state_lock:
        if item["incident_id"] in runtime["acknowledged"]:
            item["status"] = "acknowledged"
    return [item]


@app.get("/api/healthz")
def healthz() -> dict[str, Any]:
    return {"status": "ok", "mode": "demo", "timestamp": now()}


@app.get("/api/cameras")
def cameras() -> list[dict[str, Any]]:
    return [
        {
            "camera_id": "camera-1",
            "name": "Camera 01",
            "zone": "Main concourse",
            "connection_state": "demo",
            "data_origin": "demo",
        }
    ]


@app.get("/api/cameras/{camera_id}/status")
def camera_status(camera_id: str) -> dict[str, Any]:
    if camera_id != "camera-1":
        raise HTTPException(404, "Unknown camera")
    return {
        "camera_id": camera_id,
        "source_id": observation()["source_id"],
        "connection_state": "demo",
        "analysis_state": "simulated",
        "data_origin": "demo",
        "last_update": now(),
        "observation": observation(),
    }


@app.get("/api/incidents")
def list_incidents() -> list[dict[str, Any]]:
    return incidents()


@app.get("/api/sops/{sop_id}")
def get_sop(sop_id: str) -> dict[str, Any]:
    if sop_id not in SOPS:
        raise HTTPException(404, "Unknown SOP")
    return SOPS[sop_id]


@app.post("/api/incidents/{incident_id}/acknowledge")
def acknowledge(incident_id: str, request: AcknowledgeRequest) -> dict[str, Any]:
    current = {item["incident_id"]: item for item in incidents()}
    if incident_id not in current:
        raise HTTPException(404, "Incident is not active")
    with state_lock:
        runtime["acknowledged"].add(incident_id)
    return {
        "incident_id": incident_id,
        "status": "acknowledged",
        "acknowledged_at": now(),
        "operator_note": request.operator_note,
        "local_only": request.local_only,
        "persistence": "memory_only_demo",
    }


@app.post("/api/demo/scenario")
def set_scenario(request: ScenarioRequest) -> dict[str, Any]:
    with state_lock:
        runtime["scenario"] = request.scenario
    return {"scenario": request.scenario, "data_origin": "demo"}


def scripted_answer(request: AssistantRequest, incident: dict[str, Any] | None) -> str:
    if incident is None:
        return (
            "Observed evidence: no active incident is supplied. Interpretation: this does not "
            "establish crowd safety. SOP: no procedure is selected. Next step: verify the current "
            "camera evidence before making an operational decision."
        )
    sop = SOPS[incident["sop_id"]]
    evidence = " ".join(incident["evidence"])
    immediate = " ".join(f"{i + 1}. {step}" for i, step in enumerate(sop["reactive"]))
    proactive = " ".join(sop["proactive"])
    escalation = " ".join(sop["escalation"])
    return (
        f"Observed evidence: {evidence} Interpretation: {incident['title']}; the evidence is "
        f"provisional and requires operator verification. Immediate SOP steps: {immediate} "
        f"Proactive measures: {proactive} Escalation: {escalation}"
    )


def call_optional_llm(request: AssistantRequest, incident: dict[str, Any], sop: dict[str, Any]) -> str | None:
    """Optional server-side OpenAI Responses call; failure returns None for safe fallback."""
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return None
    prompt = {
        "role": "You explain only the supplied Event Horizon evidence and sample SOP. Do not invent routes, counts, probabilities, actions, contacts or approvals. State uncertainty and require authorized human decisions.",
        "question": request.question,
        "incident": incident,
        "sop": sop,
    }
    body = json.dumps(
        {
            "model": os.getenv("OPENAI_MODEL", "gpt-5-mini"),
            "input": json.dumps(prompt),
            "max_output_tokens": 450,
        }
    ).encode("utf-8")
    call = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(call, timeout=8) as response:
            data = json.load(response)
        if isinstance(data.get("output_text"), str):
            return data["output_text"].strip()
        parts = []
        for item in data.get("output", []):
            for content in item.get("content", []):
                if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                    parts.append(content["text"])
        return "\n".join(parts).strip() or None
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError):
        return None


@app.post("/api/assistant")
def assistant(request: AssistantRequest) -> dict[str, Any]:
    current = incidents()
    incident = next((x for x in current if x["incident_id"] == request.incident_id), None)
    if request.incident_id and incident is None:
        raise HTTPException(404, "Current incident not found")
    sop = SOPS[incident["sop_id"]] if incident else None
    llm_text = call_optional_llm(request, incident, sop) if incident and sop else None
    return {
        "response_origin": "llm" if llm_text else "scripted_fallback",
        "text": llm_text or scripted_answer(request, incident),
        "incident_id": incident["incident_id"] if incident else None,
        "observation_timestamp": incident["latest_update"] if incident else None,
        "sop_id": sop["sop_id"] if sop else None,
        "sop_version": sop["version"] if sop else None,
        "generated_at": now(),
    }
