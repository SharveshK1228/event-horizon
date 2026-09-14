// Time-evolving crowd scenarios for the digital twin.
//
// Everything in this file is an explicitly authored simulation. It is not a
// model output, not a replay of a real incident, and not a prediction. Its
// purpose is to let an operator rehearse what the console looks like while a
// concourse fills, congests and reaches the densities associated with crowd
// crush — and to show how much warning the +1/+2/+3 s projection gives.

import { ZONE_AREA_M2, ZONE_IDS, ZONES, slowFractionFor } from './venueModel';

// Keyframes are ordered by `t`, seconds relative to T0 — the moment the
// scenario's headline condition is reached. `counts` are people standing in
// each zone, in ZONE_IDS order (R1C1 … R3C3). `counterflow` is the simulated
// fraction of the crowd moving against the egress direction, which is the
// collective-movement signature the incident engine already recognises.

/** Normal end-of-event egress that congests at the main exit funnel. */
const SURGE_KEYFRAMES = [
  {
    t: -300,
    label: 'Event running',
    note: 'Stands occupied, concourses light.',
    counts: [210, 120, 205, 90, 120, 95, 60, 70, 62],
    counterflow: 0.02,
  },
  {
    t: -180,
    label: 'Early leavers',
    note: 'Arrivals at the concourses begin to exceed gate throughput.',
    counts: [180, 150, 175, 130, 185, 135, 95, 130, 98],
    counterflow: 0.03,
  },
  {
    t: -120,
    label: 'Stands emptying',
    note: 'North gate approach and central concourse filling together.',
    counts: [120, 190, 118, 175, 260, 180, 140, 230, 145],
    counterflow: 0.04,
  },
  {
    t: -60,
    label: 'Funnel loading',
    note: 'Six gates at capacity; arrivals still rising.',
    counts: [70, 210, 68, 205, 330, 210, 190, 350, 195],
    counterflow: 0.06,
  },
  {
    t: -30,
    label: 'Queue backing up',
    note: 'Walking speed dropping across the exit funnel.',
    counts: [45, 205, 44, 215, 365, 222, 215, 430, 220],
    counterflow: 0.09,
  },
  {
    t: 0,
    label: 'Funnel congested',
    note: 'Exit funnel in the congested band; movement is shuffling.',
    counts: [30, 190, 30, 210, 380, 215, 230, 470, 235],
    counterflow: 0.11,
  },
  {
    t: 60,
    label: 'Gates clearing',
    note: 'Arrival rate falls below throughput; the queue starts to drain.',
    counts: [20, 150, 20, 180, 330, 185, 215, 445, 220],
    counterflow: 0.07,
  },
  {
    t: 180,
    label: 'Recovering',
    note: 'Densities returning toward free movement.',
    counts: [12, 90, 12, 120, 220, 125, 150, 300, 155],
    counterflow: 0.03,
  },
];

/** The same egress with two gates lost, driving the funnel into crush densities. */
const CRUSH_KEYFRAMES = [
  {
    t: -300,
    label: 'Event running',
    note: 'Identical opening conditions to the surge scenario.',
    counts: [210, 120, 205, 90, 120, 95, 60, 70, 62],
    counterflow: 0.02,
  },
  {
    t: -180,
    label: 'Early leavers',
    note: 'Egress begins on schedule.',
    counts: [180, 150, 175, 130, 185, 138, 98, 135, 100],
    counterflow: 0.03,
  },
  {
    t: -120,
    label: 'Stands emptying',
    note: 'Concourses loading normally.',
    counts: [125, 195, 122, 180, 270, 186, 145, 245, 150],
    counterflow: 0.05,
  },
  {
    t: -90,
    label: 'Two gates stop',
    note: 'Simulated loss of two of six gates. Throughput falls; arrivals do not.',
    counts: [95, 215, 92, 205, 320, 212, 175, 330, 180],
    counterflow: 0.08,
  },
  {
    t: -60,
    label: 'Funnel overloading',
    note: 'Exit funnel past the congested band with inflow unchanged.',
    counts: [70, 225, 68, 230, 375, 236, 205, 445, 210],
    counterflow: 0.14,
  },
  {
    t: -30,
    label: 'Crush-risk density',
    note: 'Involuntary contact; individuals no longer choose their own path.',
    counts: [52, 230, 50, 250, 425, 255, 230, 570, 235],
    counterflow: 0.24,
  },
  {
    t: 0,
    label: 'Progressive compression',
    note: 'Counterflow at the front of the queue meets continued inflow behind it.',
    counts: [40, 225, 40, 262, 455, 266, 246, 690, 250],
    counterflow: 0.38,
  },
  {
    t: 30,
    label: 'Critical density',
    note: 'Densities in the band associated with crowd-collapse incidents.',
    counts: [36, 220, 36, 268, 470, 272, 252, 745, 256],
    counterflow: 0.46,
  },
  {
    t: 120,
    label: 'Held',
    note: 'Condition persisting. Nothing in this console resolves it.',
    counts: [34, 215, 34, 265, 465, 268, 250, 730, 254],
    counterflow: 0.42,
  },
];

/**
 * @typedef {object} Timeline
 * @property {string} id
 * @property {string} title
 * @property {string} summary
 * @property {number} threshold default concentration threshold, in projected tracks
 * @property {[number, number]} thresholdRange slider bounds for that threshold
 * @property {number} onsetDensity persons/m² this scenario's headline condition begins at
 * @property {string} onsetLabel what that density is called
 * @property {object[]} keyframes
 */

/** @type {Record<string, Timeline>} */
export const TIMELINES = {
  surge: {
    id: 'surge',
    title: 'Egress surge — concourse congests',
    summary:
      'End-of-event egress in which arrivals at the main exit funnel exceed gate throughput. ' +
      'The funnel reaches the congested band and then drains.',
    // Set well below the congested band so the projection has somewhere to
    // warn from: a threshold placed at the dangerous density warns on arrival.
    threshold: 240,
    thresholdRange: [60, 900],
    onsetDensity: 2.0,
    onsetLabel: 'congested movement',
    keyframes: SURGE_KEYFRAMES,
  },
  crush: {
    id: 'crush',
    title: 'Crush conditions — gates lost during egress',
    summary:
      'The same egress with two of six gates lost. Inflow continues, the funnel passes the ' +
      'crush-risk band, and counterflow appears at the front of the queue.',
    threshold: 300,
    thresholdRange: [60, 900],
    onsetDensity: 3.5,
    onsetLabel: 'involuntary movement at crush-risk density',
    keyframes: CRUSH_KEYFRAMES,
  },
};

export const TIMELINE_IDS = Object.keys(TIMELINES);

/** @param {string} scenario @returns {boolean} */
export function isTimelineScenario(scenario) {
  return Object.prototype.hasOwnProperty.call(TIMELINES, scenario);
}

/** @param {string} scenario @returns {{start:number, end:number}} */
export function timelineBounds(scenario) {
  const frames = TIMELINES[scenario].keyframes;
  return { start: frames[0].t, end: frames[frames.length - 1].t };
}

/**
 * Linear sample of a timeline at time `t`.
 *
 * `rates` is the per-second change of each zone across the surrounding
 * keyframes. It is what the constant-velocity projection extrapolates, so a
 * projection built from it behaves the way the Python baseline does on real
 * tracks: it carries the current trend forward and nothing else.
 *
 * @param {string} scenario
 * @param {number} t seconds relative to T0
 * @returns {{counts:number[], rates:number[], counterflow:number, phase:object, phaseIndex:number}}
 */
export function sampleTimeline(scenario, t) {
  const frames = TIMELINES[scenario].keyframes;
  const clamped = clamp(t, frames[0].t, frames[frames.length - 1].t);

  let index = 0;
  while (index < frames.length - 2 && frames[index + 1].t <= clamped) index += 1;

  const from = frames[index];
  const to = frames[index + 1];
  const span = to.t - from.t;
  const ratio = span > 0 ? (clamped - from.t) / span : 0;

  return {
    counts: from.counts.map((value, i) => Math.round(value + (to.counts[i] - value) * ratio)),
    rates: from.counts.map((value, i) => (span > 0 ? (to.counts[i] - value) / span : 0)),
    counterflow: from.counterflow + (to.counterflow - from.counterflow) * ratio,
    phase: from,
    phaseIndex: index,
  };
}

/**
 * Build a forecast payload for a timeline scenario, shaped exactly like
 * `CrowdForecast.update()` so the console renders it through the same path a
 * real backend forecast takes.
 *
 * @param {string} scenario
 * @param {number} t seconds relative to T0
 * @param {number} threshold concentration threshold in projected tracks
 * @returns {object} forecast payload tagged `origin: 'simulated'`
 */
export function timelineForecast(scenario, t, threshold) {
  const { counts, rates, counterflow, phase } = sampleTimeline(scenario, t);
  const peakDensity = Math.max(...counts) / ZONE_AREA_M2;

  // Tracking degrades as the crowd packs: heads occlude one another, so fewer
  // detections survive as continuous tracks. Real trackers fail in the same
  // direction, which is why a crush is the worst moment to trust a count.
  const coverage = clamp(0.86 - 0.055 * peakDensity, 0.45, 0.86);

  const cells = [];
  for (const horizon of [1, 2, 3]) {
    for (let i = 0; i < counts.length; i += 1) {
      const projected = Math.max(0, Math.round(counts[i] + rates[i] * horizon));
      const density = projected / ZONE_AREA_M2;
      cells.push({
        cell: ZONE_IDS[i],
        horizon_s: horizon,
        current_eligible: counts[i],
        projected_tracks: projected,
        change: projected - counts[i],
        slow_fraction: slowFractionFor(density),
        density_per_m2: round2(density),
        concentration_flag: projected >= threshold,
      });
    }
  }

  const flagged = cells.filter((cell) => cell.concentration_flag);
  const peak = flagged.length
    ? flagged.reduce((best, cell) =>
        cell.projected_tracks > best.projected_tracks ||
        (cell.projected_tracks === best.projected_tracks && cell.horizon_s < best.horizon_s)
          ? cell
          : best,
      )
    : null;

  return {
    status: flagged.length ? 'REVIEW CONCENTRATION' : 'PROJECTION AVAILABLE',
    reason: 'Constant-velocity projection of a simulated egress timeline.',
    coverage: round2(coverage),
    counterflow: round2(counterflow),
    cells,
    advice: peak
      ? `Inspect ${peak.cell}: ${peak.projected_tracks} eligible tracks projected at +${peak.horizon_s} s, ` +
        `about ${round2(peak.projected_tracks / ZONE_AREA_M2)} persons/m² over the simulated ${ZONE_AREA_M2} m² ` +
        'zone. Check gate throughput and hold inbound before the funnel loads further. This is a simulated ' +
        'timeline, not a prediction, and it does not establish that any route is safe.'
      : `Phase: ${phase.label}. No configured concentration threshold exceeded in this projection. ` +
        'This is not an all-clear.',
    origin: 'simulated',
  };
}

/**
 * How much warning the projection gives on this timeline: the first time the
 * +horizon projection crosses the threshold, against the first time the crowd
 * actually reaches the onset density.
 *
 * @param {string} scenario
 * @param {number} threshold projected tracks
 * @param {number} horizon 1, 2 or 3 seconds
 * @returns {{warnAt:number|null, onsetAt:number|null, leadSeconds:number|null,
 *   onsetDensity:number, onsetLabel:string}}
 */
export function timelineLeadTime(scenario, threshold, horizon) {
  const { onsetDensity, onsetLabel } = TIMELINES[scenario];
  const { start, end } = timelineBounds(scenario);
  let warnAt = null;
  let onsetAt = null;

  for (let t = start; t <= end; t += 1) {
    const { counts, rates } = sampleTimeline(scenario, t);
    if (warnAt === null && counts.some((count, i) => count + rates[i] * horizon >= threshold)) {
      warnAt = t;
    }
    if (onsetAt === null && Math.max(...counts) / ZONE_AREA_M2 >= onsetDensity) onsetAt = t;
    if (warnAt !== null && onsetAt !== null) break;
  }

  return {
    warnAt,
    onsetAt,
    leadSeconds: warnAt !== null && onsetAt !== null ? onsetAt - warnAt : null,
    onsetDensity,
    onsetLabel,
  };
}

/**
 * Unit direction each zone's crowd walks during an egress, in twin world
 * space: toward the main exit funnel, then south through the gate line.
 * @type {Record<string, [number, number]>}
 */
export const EGRESS_FIELD = (() => {
  const funnel = ZONES.find((zone) => zone.id === 'R3C2');
  const field = {};
  for (const zone of ZONES) {
    if (zone.id === 'R3C2') {
      field[zone.id] = [0, 1]; // straight out through the gate line
      continue;
    }
    const dx = funnel.x - zone.x;
    const dz = funnel.z - zone.z;
    const length = Math.hypot(dx, dz) || 1;
    field[zone.id] = [dx / length, dz / length];
  }
  return field;
})();

/** Formats a timeline clock as an operator-readable offset, e.g. `T-01:30`. */
export function formatClock(t) {
  const sign = t < 0 ? '-' : '+';
  const total = Math.abs(Math.round(t));
  const minutes = String(Math.floor(total / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `T${sign}${minutes}:${seconds}`;
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
