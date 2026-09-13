# Event Horizon editable frontend

Operator console with a 3D venue digital twin. The visual language (neo-brutalist
panels, hard borders and drop shadows, monospace labels, flat-shaded isometric scene)
and the twin architecture are ported from the FlowState prototype in `Bit_N_Build`,
re-domained from residential energy to crowd safety.

Left pane: the 3D twin. Right pane: the operator console.

## Windows setup

```powershell
cd frontend_editable
npm install
Copy-Item .env.example .env
npm run dev
```

Open <http://127.0.0.1:3000>. Node 20+ required (built and tested on Node 24).
`npm run build` produces `dist`; serve it behind a reverse proxy that routes `/api`
to the Python API. `vite preview` does not supply the Python API.

## What the twin shows

The scene is the 3x3 analysed region from `crowd_forecast.py`, laid out as a venue
plaza. Zone naming matches the Python baseline exactly: `R{row}C{col}`, rows top to
bottom and columns left to right.

| Scene element | Backs onto |
| --- | --- |
| Zone tile + density column | one forecast cell; column height is projected tracks / threshold |
| Column colour | sparse → building → dense → concentration, or grey when no projection exists |
| Pulse ring under a zone | `concentration_flag` is set for that cell at the selected horizon |
| Crowd markers | `current_eligible` per zone, capped at 26 markers; illustrative positions only |
| Flow corridors | the reported dominant direction; a reversal renders as a red counter-flow |
| Violet corridor alone | optical flow available but person motion is not |
| Camera masts + cones | venue camera geometry; the console's selected camera is highlighted |
| Egress gates | ring pulse rate follows the feeding R3 zone's projected occupancy |
| Fog, light, camera shake | visibility degraded, tracking unavailable, camera movement suspected |

Clicking a zone opens its telemetry: current eligible tracks, projection at the
selected horizon, change, slow fraction, share of region occupancy and the projection
curve against the threshold.

## Provenance

The backend currently reports `forecast_available: false`, so **the zone grid is
simulated** and is labelled that way in the twin banner, the footer and every panel
tag. When `GET /api/cameras/{id}/status` starts returning `observation.forecast` in
the shape `CrowdForecast.update()` already produces — `{status, reason, coverage,
cells[], advice}` — the twin switches to it automatically and the banner flips to
`ZONE GRID FROM BACKEND`. No UI change is needed.

Observed, simulated and missing evidence are styled distinctly throughout
(`PROVENANCE` in `src/theme.js`). Backend mode never falls back to demo data: a failed
read shows DISCONNECTED, and an observation older than ten seconds shows STALE.

## Modes

- **demo** — scripted scenarios from `src/demo.js`, nothing polled.
- **backend** — polls `/api/healthz`, `/api/cameras`, `/api/incidents` and the selected
  camera's status every two seconds. The evidence-state buttons drive
  `POST /api/demo/scenario`, so the backend decides what the next poll reports.

## Layout

```text
src/
  theme.js                    design tokens; never hardcode these hex values
  api.js                      backend requests
  demo.js                     explicitly simulated scenarios, sample SOP, signal scripts
  styles.css                  shell layout and base styling
  data/venueModel.js          venue geometry and the simulated forecast grid
  store/useVenueStore.js      state, polling, actions, pure derivations
  store/derived.js            memoised hooks over those derivations
  components/digitalTwin/     VenueScene, VenuePlaza, ZoneTile, CrowdParticles,
                              CrowdFlow, CameraMasts, ExitGates, SceneEffects,
                              SignalOverlay
  components/dashboard/       ForecastPanel, ScenarioControls, ZoneTelemetry,
                              CameraPanel, ResponsePanel, AssistantPanel,
                              ViewControls, primitives
```

Derivations that build new arrays or objects live in `useVenueStore.js` as `compute*`
functions and are consumed through the hooks in `derived.js`. Passing them straight to
`useVenueStore()` would break zustand v5's snapshot caching and loop the renderer.

## Backend contract

Unchanged from the previous build, plus two additions:

- `POST /api/demo/scenario` with `{"scenario": "clear|tracking|visibility|camera|collective"}`
  is now called when the evidence state changes in backend mode.
- `observation.forecast` is read when present (optional; see Provenance).

Timestamps must describe observation delivery, not fabricate fresh capture time.
Structured runtime schema validation, authentication, browser-stream rendering, video
overlay synchronisation and incident lifecycle persistence remain integration work.
No API keys in this frontend.

## Limits

Local video selection previews video only; it starts no analysis, and the video
overlay toggles stay disabled until synchronised overlay data exists. SOP checkboxes
are local session notes. Demo acknowledgement is not persisted. Equal image cells
cover unequal physical areas; no people-per-square-metre claim is made. Nothing in
this console establishes crowd safety, and no public announcement or physical
operation is triggered from it.
