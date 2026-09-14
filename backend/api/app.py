"""Event Horizon hackathon integration API.

Default mode uses explicit demo scenarios. It does not claim live analysis.
"""

from __future__ import annotations

import json
import os
import threading
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from pydantic import BaseModel, Field

import llm_providers
from incident_engine import make_incident
from video_sources import MAX_UPLOAD_BYTES, VideoLibrary


BASE = Path(__file__).resolve().parent
REPO_ROOT = BASE.parents[1]
# The repository-root .env is where keys usually live; the API-local one wins
# where both define the same name. Neither is committed.
load_dotenv(REPO_ROOT / ".env")
load_dotenv(BASE / ".env", override=True)
SOPS = json.loads((BASE / "sops.json").read_text(encoding="utf-8"))

# Clips the console can play. The bundled folder ships with the repository
# checkout; uploads land beside the API and are gitignored.
videos = VideoLibrary(
    bundled_dir=Path(os.getenv("EH_SAMPLE_VIDEOS", REPO_ROOT / "sample crowd videos")),
    upload_dir=Path(os.getenv("EH_UPLOAD_DIR", BASE / "uploads")),
)

SCENARIOS: dict[str, dict[str, Any]] = {
    "clear": {
        "detected_heads": 1210,
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
        "detected_heads": 1942,
        "tracking_state": "TRACK MOTION AVAILABLE",
        "tracking_reliability": 0.76,
        "visibility_status": "reference-like",
        "dominant_direction": "rapid reversal — image space",
        "motion_state": "UNUSUAL COLLECTIVE MOVEMENT",
        "processing_fps": 9.8,
    },
    # The two scenarios below are the fixed headline state of a timed egress
    # simulation. The console plays the timeline itself and recognises them by
    # source_id; the API reports only the evidence state, as it does for the
    # rest. Neither is a replay of a real incident.
    "surge": {
        "detected_heads": 2210,
        "tracking_state": "TRACK MOTION AVAILABLE",
        "tracking_reliability": 0.71,
        "visibility_status": "reference-like",
        "dominant_direction": "south — image space",
        "motion_state": "OBSERVED MOTION",
        "processing_fps": 17.2,
    },
    "crush": {
        "detected_heads": 2680,
        "tracking_state": "TRACK MOTION AVAILABLE",
        "tracking_reliability": 0.58,
        "visibility_status": "reference-like",
        "dominant_direction": "south with counterflow — image space",
        "motion_state": "UNUSUAL COLLECTIVE MOVEMENT",
        "processing_fps": 11.6,
    },
}

app = FastAPI(title="Event Horizon Integration API", version="0.1.0")
state_lock = threading.Lock()
runtime = {"scenario": os.getenv("EH_SCENARIO", "tracking"), "acknowledged": set()}
if runtime["scenario"] not in SCENARIOS:
    runtime["scenario"] = "tracking"


class ScenarioRequest(BaseModel):
    scenario: Literal[
        "clear", "tracking", "visibility", "camera", "collective", "surge", "crush"
    ]


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
            "Crowd density figures shown by the console belong to its simulated "
            "venue geometry. This API reports no persons-per-square-metre value.",
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


@app.get("/api/sources")
def list_sources() -> dict[str, Any]:
    """Clips available for playback. Listing a clip starts no analysis."""
    return {
        "sources": videos.list(),
        "max_upload_bytes": MAX_UPLOAD_BYTES,
        "analysis": "none",
        "note": (
            "Playback only. No detector or tracker runs over these frames in this process, "
            "and crowd counts shown beside a clip remain simulated."
        ),
    }


@app.post("/api/sources")
async def upload_source(request: Request) -> dict[str, Any]:
    """Accept a clip as a raw request body, named by the `X-Filename` header.

    Raw bytes rather than multipart keeps the API dependency-free; the browser
    sends the File object directly as the body.
    """
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Video exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.")

    payload = await request.body()
    try:
        source = videos.save(request.headers.get("X-Filename", ""), payload)
    except ValueError as cause:
        raise HTTPException(400, str(cause)) from cause
    return {"source": source, "analysis": "none", "received_at": now()}


@app.get("/api/sources/{source_id}/video")
def read_source(source_id: str) -> FileResponse:
    resolved = videos.resolve(source_id)
    if resolved is None:
        raise HTTPException(404, "Unknown video source")
    path, source = resolved
    # FileResponse honours Range requests, so the browser can seek in a clip
    # without downloading all of it first. The disposition stays `inline` so a
    # <video> element plays the clip instead of the browser downloading it.
    return FileResponse(
        path,
        media_type=source.media_type,
        headers={"Content-Disposition": "inline"},
    )


@app.delete("/api/sources/{source_id}")
def delete_source(source_id: str) -> dict[str, Any]:
    if not videos.delete(source_id):
        raise HTTPException(404, "No uploaded video with that id")
    return {"source_id": source_id, "deleted": True, "deleted_at": now()}


@app.get("/api/assistant/config")
def assistant_config() -> dict[str, Any]:
    """Which assistant backend is configured. Never returns a key."""
    return llm_providers.describe()


@app.post("/api/assistant")
def assistant(request: AssistantRequest) -> dict[str, Any]:
    current = incidents()
    incident = next((x for x in current if x["incident_id"] == request.incident_id), None)
    if request.incident_id and incident is None:
        raise HTTPException(404, "Current incident not found")
    sop = SOPS[incident["sop_id"]] if incident else None
    generated = (
        llm_providers.generate(request.question, incident, sop) if incident and sop else None
    )
    llm_text, origin = generated if generated else (None, "scripted_fallback")
    return {
        "response_origin": origin,
        "text": llm_text or scripted_answer(request, incident),
        "incident_id": incident["incident_id"] if incident else None,
        "observation_timestamp": incident["latest_update"] if incident else None,
        "sop_id": sop["sop_id"] if sop else None,
        "sop_version": sop["version"] if sop else None,
        "generated_at": now(),
    }
