import { create } from 'zustand';
import { api } from '../api';
import { scenarios, sampleSop, signalScripts } from '../demo';
import { simulatedForecast, zoneRows, directionVector } from '../data/venueModel';

const POLL_INTERVAL_MS = 2000;
const STALE_AFTER_MS = 10000;
const SIGNAL_LIMIT = 12;
const DEFAULT_THRESHOLD = 10; // matches CrowdForecast(threshold=10)

let pollTimer = null;
let pollController = null;
let signalTimers = [];

const clock = () => new Date().toLocaleTimeString([], { hour12: false });

function clearSignalTimers() {
  signalTimers.forEach(clearTimeout);
  signalTimers = [];
}

function abortPolling() {
  if (pollController) pollController.abort();
  if (pollTimer) clearTimeout(pollTimer);
  pollController = null;
  pollTimer = null;
}

export const useVenueStore = create((set, get) => ({
  // ---- session -----------------------------------------------------------
  mode: 'demo',
  scenario: 'clear',

  // ---- backend payloads --------------------------------------------------
  snapshot: null,
  status: null,
  sop: null,
  error: '',
  updatedAt: null,

  // ---- selection ---------------------------------------------------------
  cameraId: '',
  incidentId: '',
  selectedZone: null,

  // ---- twin view controls ------------------------------------------------
  horizon: 2,
  threshold: DEFAULT_THRESHOLD,
  overlays: { density: true, trajectories: true, flow: true, gates: true, cameras: true },

  // ---- operator state ----------------------------------------------------
  checks: {},
  acknowledged: false,
  signals: [],
  assistantBusy: false,
  answer: null,

  setMode: (mode) => {
    if (get().mode === mode) return;
    abortPolling();
    clearSignalTimers();
    set({
      mode,
      snapshot: null,
      status: null,
      sop: null,
      error: '',
      updatedAt: null,
      cameraId: '',
      incidentId: '',
      selectedZone: null,
      checks: {},
      acknowledged: false,
      answer: null,
      signals: [],
    });
    if (mode === 'backend') get().startPolling();
    else get().replayDemoSignals();
  },

  setScenario: (scenario) => {
    set({
      scenario,
      selectedZone: null,
      checks: {},
      acknowledged: false,
      answer: null,
      signals: [],
    });
    if (get().mode === 'demo') {
      get().replayDemoSignals();
      return;
    }
    // Backend mode drives the server's own scenario switch; the next poll
    // reports whatever the backend actually returns.
    api.setScenario(scenario).catch((cause) => set({ error: cause.message }));
  },

  setCameraId: (cameraId) => {
    if (get().cameraId === cameraId) return;
    set({ cameraId, status: null, selectedZone: null });
    if (get().mode === 'backend') get().startPolling();
  },

  setIncidentId: (incidentId) =>
    set({ incidentId, checks: {}, acknowledged: false, answer: null }),

  setSelectedZone: (zoneId) =>
    set((state) => ({ selectedZone: state.selectedZone === zoneId ? null : zoneId })),

  setHorizon: (horizon) => set({ horizon }),
  setThreshold: (threshold) => set({ threshold }),
  toggleOverlay: (key) =>
    set((state) => ({ overlays: { ...state.overlays, [key]: !state.overlays[key] } })),
  toggleCheck: (key) =>
    set((state) => ({ checks: { ...state.checks, [key]: !state.checks[key] } })),

  pushSignal: (source, message, origin) =>
    set((state) => ({
      signals: [{ source, message, origin, timestamp: clock() }, ...state.signals].slice(0, SIGNAL_LIMIT),
    })),

  /** Replays the scripted demo feed so the overlay reads like a live log. */
  replayDemoSignals: () => {
    clearSignalTimers();
    if (get().mode !== 'demo') return;
    const script = signalScripts[get().scenario] || [];
    script.forEach((entry, index) => {
      signalTimers.push(
        setTimeout(() => get().pushSignal(entry.source, entry.message, 'simulated'), index * 750),
      );
    });
  },

  // ---- backend polling ---------------------------------------------------
  startPolling: () => {
    abortPolling();
    if (get().mode !== 'backend') return;

    const controller = new AbortController();
    pollController = controller;

    const poll = async () => {
      try {
        const snapshot = await api.snapshot(controller.signal);
        const cameraId = get().cameraId || snapshot.cameras[0]?.camera_id || '';
        const status = cameraId ? await api.status(cameraId, controller.signal) : null;
        if (controller.signal.aborted) return;
        get().ingest(snapshot, status);
      } catch (cause) {
        if (controller.signal.aborted) return;
        // Never silently substitute demo data for a failed backend read.
        set({ error: cause.message, snapshot: null, status: null, updatedAt: null });
      } finally {
        if (!controller.signal.aborted) pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();
  },

  stopPolling: () => {
    abortPolling();
    clearSignalTimers();
  },

  /** Applies a successful backend read and logs any observation state change. */
  ingest: (snapshot, status) => {
    const previous = get().status?.observation;
    const current = status?.observation;
    const changed =
      current &&
      (previous?.tracking_state !== current.tracking_state ||
        previous?.visibility_status !== current.visibility_status ||
        previous?.motion_state !== current.motion_state);

    set({ snapshot, status, updatedAt: new Date(), error: '' });

    if (changed) {
      get().pushSignal('Observation', `${current.tracking_state} · ${current.motion_state}`, 'observed');
    }
  },

  loadSop: async (sopId) => {
    if (!sopId) {
      set({ sop: null });
      return;
    }
    try {
      set({ sop: await api.sop(sopId) });
    } catch {
      set({ sop: null });
    }
  },

  acknowledge: async () => {
    const state = get();
    if (state.mode === 'demo') {
      set({ acknowledged: true });
      get().pushSignal('Operator', 'Incident acknowledged locally. Demo only; nothing was persisted.', 'simulated');
      return;
    }
    const incident = currentIncident(state);
    if (!incident) return;
    try {
      await api.acknowledge(incident.incident_id);
      set({ acknowledged: true });
      get().pushSignal('Operator', `Acknowledged ${incident.incident_id}.`, 'observed');
    } catch (cause) {
      set({ error: cause.message });
    }
  },

  ask: async (question) => {
    const state = get();
    const incident = currentIncident(state);
    const procedure = selectProcedure(state);
    set({ assistantBusy: true, answer: null });
    try {
      if (state.mode === 'demo') {
        set({
          answer: {
            response_origin: 'scripted_demo',
            text:
              `${incident?.title || 'No active incident'} — this is a simulated example. ` +
              `${procedure ? procedure.reactive.join(' ') : 'No incident procedure selected.'} ` +
              'Live observations and an LLM are not connected.',
            incident_id: incident?.incident_id,
            sop_version: procedure?.version,
          },
        });
        return;
      }
      const answer = await api.ask({
        question,
        incident_id: incident?.incident_id || null,
        observation_timestamp: state.status?.observation?.received_at || null,
        sop_version: procedure?.version || null,
      });
      set({ answer });
    } catch (cause) {
      set({ answer: { response_origin: 'unavailable', text: cause.message } });
    } finally {
      set({ assistantBusy: false });
    }
  },
}));

// ---------------------------------------------------------------------------
// Identity-stable selectors — safe to pass straight to useVenueStore().
// Anything that builds a new array or object lives in the compute* functions
// below and is memoised by the hooks in ./derived.js instead.
// ---------------------------------------------------------------------------

export const isDemo = (state) => state.mode === 'demo';

/** @returns {object|null} the current camera observation, or null in demo mode. */
export const selectObservation = (state) => (isDemo(state) ? null : state.status?.observation || null);

/** Backend observations older than ten seconds are treated as unusable. */
export function selectStale(state) {
  if (isDemo(state)) return false;
  const receivedAt = state.status?.observation?.received_at;
  const parsed = Date.parse(receivedAt);
  return !receivedAt || !Number.isFinite(parsed) || Date.now() - parsed > STALE_AFTER_MS;
}

export const selectProcedure = (state) =>
  isDemo(state) ? (currentIncident(state) ? sampleSop : null) : state.sop;

/** Unit flow vector in image space, or null when no direction is established. */
export function selectFlowVector(state) {
  if (isDemo(state)) return directionVector(scenarios[state.scenario]?.direction);
  return directionVector(selectObservation(state)?.dominant_direction);
}

// ---------------------------------------------------------------------------
// Pure derivations. Call these through the hooks in ./derived.js from React.
// ---------------------------------------------------------------------------

/**
 * Incidents for the current mode. Demo incidents are synthesised from the
 * selected scenario and are never presented as backend findings.
 * @param {{mode:string, scenario:string, snapshot:object|null, acknowledged:boolean}} slice
 */
export function computeIncidents(slice) {
  if (slice.mode !== 'demo') return slice.snapshot?.incidents || [];
  const scene = scenarios[slice.scenario];
  if (!scene?.issue) return [];
  return [
    {
      incident_id: `DEMO-${slice.scenario}`,
      title: scene.issue,
      severity: 'caution',
      status: slice.acknowledged ? 'acknowledged' : 'active',
      sop_id: sampleSop.sop_id,
      evidence: ['Simulated scenario; no model assessment.'],
    },
  ];
}

/** Store-internal incident lookup for actions (not for render). */
function currentIncident(state) {
  const incidents = computeIncidents(state);
  return incidents.find((item) => item.incident_id === state.incidentId) || incidents[0] || null;
}

/**
 * The forecast payload driving the 3D zone grid. Prefers a real backend
 * forecast; otherwise returns the simulated grid tagged as such.
 * @param {{mode:string, scenario:string, status:object|null, threshold:number}} slice
 */
export function computeForecast(slice) {
  const observation = slice.mode === 'demo' ? null : slice.status?.observation || null;
  if (observation?.forecast?.cells) {
    return { ...observation.forecast, origin: 'observed' };
  }
  const scenario = slice.mode === 'demo' ? slice.scenario : backendScenarioKey(observation);
  return simulatedForecast(scenario, slice.threshold);
}

/** Maps a live observation onto the closest demo scenario for the simulated grid. */
function backendScenarioKey(observation) {
  if (!observation) return 'tracking';
  if (observation.visibility_status === 'degraded') return 'visibility';
  if (observation.motion_state === 'CAMERA MOVEMENT SUSPECTED') return 'camera';
  if (observation.tracking_state === 'TRACKING UNAVAILABLE') return 'tracking';
  if (observation.tracking_state === 'INSUFFICIENT TRACK SUPPORT') return 'camera';
  if (observation.motion_state === 'UNUSUAL COLLECTIVE MOVEMENT') return 'collective';
  return 'clear';
}

export const computeZones = zoneRows;

/**
 * The six headline metrics, each paired with its provenance.
 * @param {{mode:string, scenario:string, status:object|null}} slice
 * @param {{status:string, origin:string}} forecast
 */
export function computeMetrics(slice, forecast) {
  const demo = slice.mode === 'demo';
  const scene = scenarios[slice.scenario];
  const observation = demo ? null : slice.status?.observation || null;
  const source = demo ? 'simulated' : observation ? 'observed' : 'missing';

  const rows = demo
    ? [
        ['Detected heads', scene.count],
        ['Tracking support', scene.tracking],
        ['Visibility', scene.visibility],
        ['Image motion', scene.direction],
        ['Processing FPS', scene.fps],
      ]
    : [
        ['Detected heads', observation?.detected_heads],
        ['Tracking support', observation?.tracking_state],
        ['Visibility', observation?.visibility_status],
        ['Image motion', observation?.dominant_direction],
        ['Processing FPS', observation?.processing_fps],
      ];

  return [
    ...rows.map(([label, value]) => ({ label, value, source })),
    { label: 'Forecast', value: forecast.status, source: forecast.origin },
  ];
}
