# Event Horizon editable frontend

Recreated React source inspired by the uploaded compiled dashboard: navy control-room layout, teal accents, camera panel, evidence, incidents, SOP checklist and assistant. This is a reconstruction, not recovered original source or a pixel-identical copy.

## Windows setup
Keep your existing frontend as a backup. Extract this folder as D:\event_horizon\frontend_editable. In that folder run:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```
Open http://localhost:3000. Node 20+ recommended. For a production build run `npm run build`. Serve `dist` with your backend or a reverse proxy routing /api to Python. Vite preview does not supply the Python API.

## Modify
- src/App.jsx: layout, interaction and polling
- src/styles.css: all visual styling and responsive layout
- src/demo.js: explicitly simulated scenarios and sample SOP
- src/api.js: backend requests
- .env: BACKEND_URL (server-side Vite proxy configuration; restart after changing)

No Python service, LLM or forecasting model is included. Default mode is clearly marked demo. Backend mode polls every 2 seconds and never silently substitutes demo data. Local video selection only previews video; analytic overlays are disabled until synchronized data is implemented. SOP checkboxes are local session notes. Demo acknowledgement is local. There are no public announcements or physical operations.

## Proposed JSON contract (align Python to this or modify api.js)
GET /api/healthz: {"status":"ok"}
GET /api/cameras: [{"camera_id":"camera-1","name":"Camera 1"}]
GET /api/cameras/{id}/status: {"source_id":"recording-1","observation":{"received_at":"2026-09-12T18:00:00Z","detected_heads":null,"tracking_state":"TRACKING UNAVAILABLE","visibility_status":"unverified","dominant_direction":null,"processing_fps":null}}
GET /api/incidents: [{"incident_id":"inc-1","title":"Tracking unavailable","severity":"caution","status":"active","sop_id":"SOP-VERIFY-01","evidence":["No tracked detections for the specified interval"]}]
GET /api/sops/{id}: schema in src/demo.js (sop_id, version, title, approval_status, reactive/proactive/escalation/recovery arrays).
POST /api/incidents/{id}/acknowledge: body {"local_only":false}; expect JSON response after persistence.
POST /api/assistant: {question, incident_id, observation_timestamp, sop_version}; response {"response_origin":"llm", "text":"Evidence-grounded explanation", "incident_id":"inc-1", "sop_version":"0.1"}.

Timestamp must describe observation delivery, not fabricate fresh video capture. Keep recorded vs live provenance explicit when integrating. Backend observation older than ten seconds is flagged stale; threshold is provisional. Structured runtime schema validation, authentication, browser-stream rendering, actual overlay synchronization and operational incident lifecycle remain integration work. No API keys in frontend.
