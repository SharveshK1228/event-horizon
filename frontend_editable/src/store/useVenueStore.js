import { create } from 'zustand';
import { api } from '../api';
import { scenarios, sampleSop, signalScripts, phaseSignals } from '../demo';
import {
  SCENARIO_THRESHOLDS,
  simulatedForecast,
  zoneRows,
  directionVector,
} from '../data/venueModel';
import {
  TIMELINES,
  formatClock,
  isTimelineScenario,
  sampleTimeline,
  timelineBounds,
  timelineForecast,
} from '../data/crowdTimeline';

const POLL_INTERVAL_MS = 2000;
const STALE_AFTER_MS = 10000;
const SIGNAL_LIMIT = 12;
const CLOCK_TICK_MS = 200;
const DEFAULT_THRESHOLD = SCENARIO_THRESHOLDS.clear.threshold;

let pollTimer = null;
let pollController = null;
let signalTimers = [];
let clockTimer = null;

/**
 * Default concentration threshold and slider bounds for a scenario. Scenarios
 * differ by an order of magnitude in occupancy, so one fixed range would make
 * most of them unreadable.
 * @param {string} scenario
 * @returns {{threshold:number, range:[number, number]}}
 */
export function thresholdConfig(scenario) {
  if (isTimelineScenario(scenario)) {
    const timeline = TIMELINES[scenario];
    return { threshold: timeline.threshold, range: timeline.thresholdRange };
  }
  return SCENARIO_THRESHOLDS[scenario] || SCENARIO_THRESHOLDS.clear;
}

function stopClockTimer() {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = null;
}

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

  // ---- timeline playback -------------------------------------------------
  // Only meaningful while a timeline scenario is selected; `clockT` is seconds
  // relative to that timeline's T0.
  clockT: 0,
  playing: false,
  playbackRate: 4,
  phaseIndex: -1,
  /** When set, the video's own playhead drives the timeline instead of the clock. */
  syncVideo: false,

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
    stopClockTimer();
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
    if (isTimelineScenario(get().scenario)) get().startClock();
  },

  setScenario: (scenario) => {
    stopClockTimer();
    const timeline = isTimelineScenario(scenario);
    const { threshold } = thresholdConfig(scenario);

    set({
      scenario,
      threshold,
      selectedZone: null,
      checks: {},
      acknowledged: false,
      answer: null,
      signals: [],
      clockT: timeline ? timelineBounds(scenario).start : 0,
      phaseIndex: -1,
      playing: timeline,
    });

    // The threshold is an operator setting, so a change made on the operator's
    // behalf is logged rather than applied silently.
    get().pushSignal(
      'Operator',
      `Concentration threshold set to ${threshold} projected tracks for the ${scenario.toUpperCase()} simulation.`,
      'simulated',
    );

    if (get().mode === 'demo') {
      get().replayDemoSignals();
      if (timeline) get().startClock();
      return;
    }
    // Backend mode drives the server's own scenario switch; the next poll
    // reports whatever the backend actually returns.
    api.setScenario(scenario).catch((cause) => set({ error: cause.message }));
    if (timeline) get().startClock();
  },

  // ---- timeline playback -------------------------------------------------

  /**
   * Move the timeline clock, emitting one signal-feed line each time playback
   * crosses into a new phase.
   * @param {number} clockT seconds relative to the timeline's T0
   */
  setClock: (clockT) => {
    const state = get();
    if (!isTimelineScenario(state.scenario)) {
      set({ clockT });
      return;
    }
    const { start, end } = timelineBounds(state.scenario);
    const bounded = Math.min(end, Math.max(start, clockT));
    const { phaseIndex, phase } = sampleTimeline(state.scenario, bounded);
    set({ clockT: bounded });

    if (phaseIndex === state.phaseIndex) return;
    set({ phaseIndex });
    const line = phaseSignals[state.scenario]?.[phaseIndex];
    if (line) {
      get().pushSignal(line.source, `${formatClock(phase.t)} · ${line.message}`, 'simulated');
    }
  },

  startClock: () => {
    stopClockTimer();
    if (!isTimelineScenario(get().scenario)) return;
    clockTimer = setInterval(() => {
      const { clockT, playbackRate, scenario, playing } = get();
      if (!playing || !isTimelineScenario(scenario)) return;
      const { start, end } = timelineBounds(scenario);
      const next = clockT + (CLOCK_TICK_MS / 1000) * playbackRate;
      // Loop the rehearsal rather than freezing on the last frame.
      if (next >= end) {
        set({ phaseIndex: -1 });
        get().setClock(start);
        return;
      }
      get().setClock(next);
    }, CLOCK_TICK_MS);
  },

  stopClock: () => {
    stopClockTimer();
    set({ playing: false });
  },

  togglePlay: () => {
    const playing = !get().playing;
    set({ playing });
    if (playing) get().startClock();
    else stopClockTimer();
  },

  setPlaybackRate: (playbackRate) => set({ playbackRate }),

  /**
   * Hand the timeline over to the video playhead, or take it back. The two are
   * mutually exclusive: a running clock and a scrubbing video would fight.
   */
  toggleSyncVideo: () => {
    const syncVideo = !get().syncVideo;
    set({ syncVideo });
    if (syncVideo) {
      stopClockTimer();
      set({ playing: false });
      get().pushSignal(
        'Operator',
        'Timeline handed to the video playhead. Counts remain simulated; the clip is not being analysed for people.',
        'simulated',
      );
    }
  },

  /**
   * Map a position in the clip onto the timeline. The clip's length stands in
   * for the whole rehearsal, so a short video still plays the full scenario.
   * @param {number} currentTime seconds into the clip
   * @param {number} duration clip length in seconds
   */
  syncFromVideo: (currentTime, duration) => {
    const state = get();
    if (!state.syncVideo || !isTimelineScenario(state.scenario)) return;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const { start, end } = timelineBounds(state.scenario);
    const ratio = Math.min(1, Math.max(0, currentTime / duration));
    get().setClock(start + ratio * (end - start));
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
    stopClockTimer();
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
 * @param {{mode:string, scenario:string, status:object|null, threshold:number, clockT:number}} slice
 */
export function computeForecast(slice) {
  const observation = slice.mode === 'demo' ? null : slice.status?.observation || null;
  if (observation?.forecast?.cells) {
    return { ...observation.forecast, origin: 'observed' };
  }
  const scenario = slice.mode === 'demo' ? slice.scenario : backendScenarioKey(observation);
  if (isTimelineScenario(scenario)) {
    return timelineForecast(scenario, slice.clockT, slice.threshold);
  }
  return simulatedForecast(scenario, slice.threshold);
}

/** Maps a live observation onto the closest demo scenario for the simulated grid. */
function backendScenarioKey(observation) {
  if (!observation) return 'tracking';
  // The backend names its demo source `demo-<scenario>`, so a timeline the
  // server is running stays a timeline here rather than collapsing to a state.
  const source = String(observation.source_id || '').replace(/^demo-/, '');
  if (isTimelineScenario(source)) return source;
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
        ['Detected heads', scene.timeline ? timelineHeads(forecast) : scene.count],
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

/**
 * Detections implied by a timeline frame: eligible tracks across the analysed
 * region, divided back out by the track coverage the frame reports. Detections
 * are always the larger number — a track is a detection that survived.
 * @param {{cells?: object[], coverage?: number}} forecast
 * @returns {number|null}
 */
function timelineHeads(forecast) {
  const cells = (forecast.cells || []).filter((cell) => cell.horizon_s === 1);
  if (!cells.length || !forecast.coverage) return null;
  const tracks = cells.reduce((total, cell) => total + cell.current_eligible, 0);
  return Math.round(tracks / forecast.coverage);
}
