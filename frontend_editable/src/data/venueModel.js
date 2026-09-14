// Static venue geometry for the digital twin, plus the explicitly simulated
// zone grid used when the backend supplies no forecast.
//
// Zone naming follows crowd_forecast.py exactly: R{row}C{col}, rows top to
// bottom and columns left to right within the analysed region.

export const GRID_SIZE = 3;
export const ZONE_SPAN = 12; // world units per zone edge
export const ZONE_GAP = 2.4; // walkway width between zones
const PITCH = ZONE_SPAN + ZONE_GAP;

/**
 * One world unit is one metre in the twin, so a zone tile stands in for this
 * much floor area. Every persons-per-square-metre figure in the console is
 * derived from it, and is therefore a property of the *simulated* venue — the
 * backend reports track counts in image cells and makes no area claim at all.
 */
export const ZONE_AREA_M2 = ZONE_SPAN * ZONE_SPAN;

/** Reference density (persons/m²) at which walking speed collapses to a shuffle. */
export const JAM_DENSITY = 5.4;

/** @param {number|null} count people in one zone @returns {number|null} persons/m² */
export function densityOf(count) {
  return count == null || !Number.isFinite(count) ? null : count / ZONE_AREA_M2;
}

/**
 * Fraction of free walking speed still available at a given density. A crowd
 * slows as it packs; past JAM_DENSITY nobody chooses their own pace.
 * @param {number} density persons/m²
 * @returns {number} 0..1
 */
export function speedFactor(density) {
  return Math.min(1, Math.max(0.04, 1 - density / JAM_DENSITY));
}

/** Fraction of tracks below the slow-motion threshold, rising with density. */
export function slowFractionFor(density) {
  return Math.round(Math.min(0.97, Math.max(0.05, (density - 0.6) / 3.4)) * 100) / 100;
}

/** @typedef {{id:string, row:number, col:number, x:number, z:number}} ZoneCell */

/** @type {ZoneCell[]} */
export const ZONES = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
  const row = Math.floor(index / GRID_SIZE);
  const col = index % GRID_SIZE;
  return {
    id: `R${row + 1}C${col + 1}`,
    row: row + 1,
    col: col + 1,
    x: (col - 1) * PITCH,
    z: (row - 1) * PITCH,
  };
});

export const ZONE_IDS = ZONES.map((zone) => zone.id);

/** Human-readable venue names so operators are not reading matrix indices alone. */
export const ZONE_LABELS = {
  R1C1: 'North-west stand',
  R1C2: 'North gate approach',
  R1C3: 'North-east stand',
  R2C1: 'West concourse',
  R2C2: 'Central concourse',
  R2C3: 'East concourse',
  R3C1: 'South-west ramp',
  R3C2: 'Main exit funnel',
  R3C3: 'South-east ramp',
};

/** Camera masts. `covers` lists the zones inside each mast's field of view. */
export const CAMERA_MASTS = [
  { id: 'camera-1', label: 'CAM 01', x: -PITCH, z: PITCH + 11, rotation: 0, covers: ['R3C1', 'R3C2', 'R2C1'] },
  { id: 'camera-2', label: 'CAM 02', x: PITCH, z: PITCH + 11, rotation: 0, covers: ['R3C3', 'R3C2', 'R2C3'] },
  { id: 'camera-3', label: 'CAM 03', x: -PITCH - 11, z: -PITCH, rotation: Math.PI / 2, covers: ['R1C1', 'R2C1'] },
  { id: 'camera-4', label: 'CAM 04', x: PITCH + 11, z: -PITCH, rotation: -Math.PI / 2, covers: ['R1C3', 'R2C3'] },
];

/** Egress gates along the south edge; `zone` is the zone that feeds each gate. */
export const EXIT_GATES = Array.from({ length: 6 }, (_, index) => ({
  id: `GATE-${String(index + 1).padStart(2, '0')}`,
  x: (index - 2.5) * 6.4,
  zone: index < 2 ? 'R3C1' : index < 4 ? 'R3C2' : 'R3C3',
}));

/** Perimeter structures (stands, stalls, service blocks) that frame the plaza. */
export const STRUCTURES = (() => {
  const blocks = [];
  const edge = PITCH + 9.5;
  let serial = 0;
  for (let i = -3; i <= 3; i += 1) {
    if (Math.abs(i) < 1) continue;
    blocks.push({ id: `S-${serial += 1}`, x: i * 5.6, z: -edge, scale: 1 + (Math.abs(i) % 2) * 0.25 });
    blocks.push({ id: `S-${serial += 1}`, x: -edge, z: i * 5.6, scale: 1 + ((Math.abs(i) + 1) % 2) * 0.25 });
    blocks.push({ id: `S-${serial += 1}`, x: edge, z: i * 5.6, scale: 1 + (Math.abs(i) % 2) * 0.25 });
  }
  return blocks;
})();

/** Trees lining the walkways, mirroring the source project's pin-cushion foliage. */
export const TREE_POSITIONS = (() => {
  const trees = [];
  const half = PITCH / 2;
  for (const lane of [-half, half]) {
    for (let step = -22; step <= 22; step += 5.5) {
      trees.push([lane, 0, step]);
      trees.push([step, 0, lane]);
    }
  }
  return trees;
})();

/**
 * Compass bearing per zone-to-zone movement, used to orient flow tubes.
 * Values are image-space directions, matching how the backend reports them.
 */
export const DIRECTION_VECTORS = {
  north: [0, -1],
  'north-east': [0.7, -0.7],
  east: [1, 0],
  'south-east': [0.7, 0.7],
  south: [0, 1],
  'south-west': [-0.7, 0.7],
  west: [-1, 0],
  'north-west': [-0.7, -0.7],
};

/**
 * Resolve a backend `dominant_direction` string to a unit vector.
 * Returns null when the direction is absent or unparseable — the twin then
 * renders no flow rather than inventing one.
 * @param {string|null|undefined} value
 * @returns {[number, number]|null}
 */
export function directionVector(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.toLowerCase();
  const match = Object.keys(DIRECTION_VECTORS)
    .sort((a, b) => b.length - a.length)
    .find((key) => normalized.includes(key));
  return match ? DIRECTION_VECTORS[match] : null;
}

/**
 * Explicitly simulated zone grids, one per demo scenario.
 *
 * These mirror the gating rules in crowd_forecast.py: a projection is only
 * produced when visibility is reference-like, the motion signals agree, and
 * enough continuous tracks are eligible. Every other scenario yields
 * UNAVAILABLE with the same reason text the Python baseline would emit.
 */
// Populations are sized for a real venue concourse rather than a handful of
// markers: a 144 m² zone holding 90–290 people spans roughly 0.6–2.0
// persons/m², which is the range an occupied plaza actually sits in. `clear`
// stays below its configured threshold at every horizon, while `collective`
// drains the northern zones and concentrates on R3C2, the main exit funnel.
const COUNTS = {
  clear: [86, 120, 92, 104, 155, 110, 95, 132, 98],
  collective: [90, 128, 88, 150, 240, 155, 165, 290, 170],
};

/** Change in eligible tracks per second of projection. */
const DRIFT = {
  clear: [4, -5, 2, 6, -3, -4, 3, 5, -2],
  collective: [-14, -20, -12, 4, 16, 12, 22, 30, 18],
};

/**
 * Default concentration threshold per scenario, in projected tracks, with the
 * slider bounds that make it adjustable. The threshold is an operator setting;
 * these are simply the values that make each simulated scenario legible.
 */
export const SCENARIO_THRESHOLDS = {
  clear: { threshold: 300, range: [40, 600] },
  tracking: { threshold: 300, range: [40, 600] },
  visibility: { threshold: 300, range: [40, 600] },
  camera: { threshold: 300, range: [40, 600] },
  collective: { threshold: 340, range: [40, 600] },
};

/**
 * Build a forecast payload shaped exactly like CrowdForecast.update()'s return
 * value, so a real backend forecast can be dropped in without UI changes.
 *
 * @param {string} scenario one of the demo scenario keys
 * @param {number} threshold concentration threshold in projected tracks
 * @returns {{status:string, reason:string, coverage:number, cells:object[], advice:string, origin:string}}
 */
export function simulatedForecast(scenario, threshold) {
  const unavailable = (reason) => ({
    status: 'UNAVAILABLE',
    reason,
    coverage: 0,
    cells: [],
    advice: 'Check the view and track continuity before interpreting crowd movement.',
    origin: 'simulated',
  });

  if (scenario === 'visibility') {
    return unavailable('Visibility changed or the motion signals disagree.');
  }
  if (scenario === 'tracking' || scenario === 'camera') {
    return unavailable('Too few continuous tracks: need at least 3 and 60% of current detections.');
  }

  const base = COUNTS[scenario] || COUNTS.clear;
  const drift = DRIFT[scenario] || DRIFT.clear;
  const cells = [];

  for (const horizon of [1, 2, 3]) {
    for (let index = 0; index < base.length; index += 1) {
      const projected = Math.max(0, base[index] + drift[index] * horizon);
      const density = projected / ZONE_AREA_M2;
      cells.push({
        cell: ZONE_IDS[index],
        horizon_s: horizon,
        current_eligible: base[index],
        projected_tracks: projected,
        change: projected - base[index],
        slow_fraction: slowFractionFor(density),
        density_per_m2: Math.round(density * 100) / 100,
        concentration_flag: projected >= threshold,
      });
    }
  }

  const hotspots = cells.filter((cell) => cell.concentration_flag);
  const peak = hotspots.length
    ? hotspots.reduce((best, cell) =>
        cell.projected_tracks > best.projected_tracks ||
        (cell.projected_tracks === best.projected_tracks && cell.horizon_s < best.horizon_s)
          ? cell
          : best,
      )
    : null;

  return {
    status: hotspots.length ? 'REVIEW CONCENTRATION' : 'PROJECTION AVAILABLE',
    reason: 'Constant-velocity projection of eligible observed tracks only.',
    coverage: scenario === 'collective' ? 0.76 : 0.82,
    cells,
    advice: peak
      ? `Inspect ${peak.cell}: ${peak.projected_tracks} eligible tracks projected at +${peak.horizon_s} s. ` +
        'Review bottlenecks and entry rate. Check venue conditions before considering another route; ' +
        'this model does not establish route safety.'
      : 'No configured concentration threshold exceeded in this projection. This is not an all-clear.',
    origin: 'simulated',
  };
}

/**
 * Collapse a forecast payload into one record per zone at the chosen horizon.
 *
 * @param {{cells?: object[]}|null} forecast
 * @param {number} horizon 1, 2 or 3 seconds
 * @param {number} threshold concentration threshold
 * @returns {Array<{id:string, label:string, x:number, z:number, current:number|null, projected:number|null, change:number|null, slowFraction:number|null, flagged:boolean, ratio:number|null}>}
 */
export function zoneRows(forecast, horizon, threshold) {
  const byId = new Map();
  for (const cell of forecast?.cells || []) {
    if (cell.horizon_s === horizon) byId.set(cell.cell, cell);
  }
  return ZONES.map((zone) => {
    const cell = byId.get(zone.id);
    const projected = cell ? cell.projected_tracks : null;
    return {
      ...zone,
      label: ZONE_LABELS[zone.id] || zone.id,
      current: cell ? cell.current_eligible : null,
      projected,
      change: cell ? cell.change : null,
      slowFraction: cell ? cell.slow_fraction : null,
      // Present only for simulated grids, where the zone's floor area is known.
      // A backend forecast counts tracks in image cells and supplies no area,
      // so both of these stay null rather than inventing one.
      density: cell?.density_per_m2 ?? null,
      currentDensity: cell?.density_per_m2 == null ? null : densityOf(cell.current_eligible),
      flagged: Boolean(cell?.concentration_flag),
      ratio: projected == null || threshold <= 0 ? null : projected / threshold,
    };
  });
}
