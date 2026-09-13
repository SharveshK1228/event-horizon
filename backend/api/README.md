# Event Horizon integration API

This hackathon API connects the editable React dashboard to deterministic incident rules, sample SOPs, acknowledgement and an evidence-bounded assistant. The default data origin is `demo`; it does not claim live analysis. SOP selection works without an LLM.

## Windows setup

Copy this folder's files to `D:\event_horizon\backend\api`. From the project virtual environment:

```powershell
python -m pip install -r .\backend\api\requirements-api.txt
python -m uvicorn app:app --app-dir .\backend\api --host 127.0.0.1 --port 8000
```

In a second terminal:

```powershell
cd D:\event_horizon\frontend_editable
Copy-Item .env.example .env -ErrorAction SilentlyContinue
npm run dev
```

Open `http://localhost:3000`, select **Backend**, and select Camera 01. The Vite proxy sends `/api` to `http://127.0.0.1:8000`.

Change a backend demonstration scenario from PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/demo/scenario -ContentType application/json -Body '{"scenario":"camera"}'
```

Allowed scenarios: `clear`, `tracking`, `visibility`, `camera`, `collective`. Refresh/poll the dashboard after switching.

## Assistant

Without an API key, `/api/assistant` produces an evidence-grounded scripted fallback. To optionally test a real LLM, create `backend\api\.env` locally and set `OPENAI_API_KEY`; do not commit `.env`. Environment variables must be loaded into the backend process. An LLM call failure falls back to the deterministic answer and never blocks the SOP. No automatic security call, public announcement, gate change or physical action is implemented.

## Current boundaries

- Demo scenarios only; recorded/live analytics adapter is the next integration.
- Incident acknowledgement is memory-only and resets when the API restarts.
- Sample SOPs are demonstration content, not venue-approved operating procedures.
- The collective-motion rule is a simulated verification alert, not a validated surge predictor.
- No authentication, audit database, streaming overlay, rate limiting or production deployment hardening.
