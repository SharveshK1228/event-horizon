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

Allowed scenarios: `clear`, `tracking`, `visibility`, `camera`, `collective`, `surge`, `crush`. Refresh/poll the dashboard after switching.

## Assistant

Without an API key, `/api/assistant` produces an evidence-grounded scripted fallback.

To use a real model, put a key in the repository-root `.env` (or this folder's `.env`, which wins on conflicts) and set `LLM_PROVIDER` to `groq`, `gemini` or `openai`. Omit `LLM_PROVIDER` and the first provider with a key is used. `GET /api/assistant/config` reports which backend is active and which keys are present; it never returns a key.

The system prompt is the same evidence boundary the scripted answer respects: the model receives only the incident and the selected SOP, is told not to invent counts, densities, probabilities, timings, routes or procedure steps, and is told never to state that a crowd is safe. Any failure -- missing key, transport error, non-200, empty completion -- falls back to the deterministic answer and never blocks the SOP. No automatic security call, public announcement, gate change or physical action is implemented.

Note for `urllib` callers: Groq sits behind Cloudflare and rejects the default `Python-urllib/3.x` user agent with HTTP 403 (error 1010). `llm_providers.py` sends a real one.

## Demo video library

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/sources` | list bundled and uploaded clips |
| `POST` | `/api/sources` | store a clip sent as the raw request body, named by `X-Filename` |
| `GET` | `/api/sources/{id}/video` | stream a clip, with `Range` support so the browser can seek |
| `DELETE` | `/api/sources/{id}` | remove an uploaded clip; bundled clips are not deletable |

Bundled clips come from `<repo>/sample crowd videos`; uploads land in `backend/api/uploads` and are gitignored. Uploads are raw-body rather than multipart so the API carries no extra dependency. Names are reduced to a plain basename, extensions are restricted to browser-playable video, ids are matched against a fresh directory scan rather than parsed, and the limit is 200 MB.

**This endpoint stores and serves video. It does not analyse it.** No detector or tracker runs over an uploaded file in this process, and registering a clip never turns a simulated reading into an observed one. The console runs its own per-tile visibility and frame-difference checks in the browser and labels those separately.

## Current boundaries

- Demo scenarios only; recorded/live analytics adapter is the next integration.
- Incident acknowledgement is memory-only and resets when the API restarts.
- Uploaded clips are stored and served, never analysed; there is no head detector in this service.
- Sample SOPs are demonstration content, not venue-approved operating procedures.
- The collective-motion rule is a simulated verification alert, not a validated surge predictor.
- No authentication, audit database, streaming overlay, rate limiting or production deployment hardening.
