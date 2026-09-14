// Neo-brutalist design tokens shared by the 2D console and the 3D digital twin.
// Single source of truth: never hardcode these hex values in components.

export const NEO = {
  ink: '#212121',
  inkDeep: '#121722',
  bg: '#E8EAEB',
  surface: '#FFFFFF',
  grey: '#6B7280',
  line: '#D1D5DB',
  orange: '#FF6600',
  amber: '#FFC107',
  green: '#28A745',
  red: '#DC2626',
  violet: '#8B5CF6',
  ground: '#EAEAEA',
  walkway: '#555555',
  dash: '#CC9944',
  foliage: '#1E5631',
  roofSouth: '#FF6611',
  roofNorth: '#DDAA44',
  metal: '#C2C5C7',
  crimson: '#7F1D1D',
};

// Border + hard drop shadow used on every raised panel.
export const HARD = {
  border: `2px solid ${NEO.ink}`,
  shadow: `4px 4px 0px 0px ${NEO.ink}`,
  shadowSm: `2px 2px 0px 0px ${NEO.ink}`,
};

export const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * Provenance is the core discipline of this project: observed, simulated and
 * missing evidence must never be styled the same way.
 * @type {Record<'observed'|'simulated'|'missing', {label:string, color:string, background:string}>}
 */
export const PROVENANCE = {
  observed: { label: 'BACKEND EVIDENCE', color: NEO.green, background: '#ECFDF3' },
  simulated: { label: 'SIMULATED', color: NEO.amber, background: '#FEF3C7' },
  missing: { label: 'UNAVAILABLE', color: NEO.grey, background: NEO.bg },
};

/**
 * Density ramp for zone occupancy. Ordered low → high; `unknown` is a distinct
 * fourth state and is deliberately not part of the ramp.
 */
export const DENSITY_RAMP = [
  { max: 0.35, color: NEO.green, label: 'SPARSE' },
  { max: 0.6, color: NEO.amber, label: 'BUILDING' },
  { max: 0.85, color: NEO.orange, label: 'DENSE' },
  { max: Infinity, color: NEO.red, label: 'CONCENTRATION' },
];

export const UNKNOWN_COLOR = '#9AA3AE';

/**
 * @param {number|null} ratio occupancy relative to the configured threshold
 * @returns {{color: string, label: string}}
 */
export function densityStep(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) {
    return { color: UNKNOWN_COLOR, label: 'UNKNOWN' };
  }
  const step = DENSITY_RAMP.find((entry) => ratio <= entry.max);
  return { color: step.color, label: step.label };
}

/**
 * Crowd density bands in persons per square metre.
 *
 * The boundaries follow the levels used in published crowd-safety practice
 * (Fruin's level-of-service work and the density ranges cited in crowd-crush
 * literature): free movement below ~1, restricted movement by ~2, sharply
 * reduced walking speed by ~3.5, involuntary contact and pressure build-up
 * above ~4, and the densities associated with crowd-collapse incidents above
 * ~5. They are reference bands for interpreting a *simulated* occupancy, not
 * thresholds this system has validated against any venue.
 */
export const DENSITY_BANDS = [
  { max: 1.0, key: 'free', label: 'FREE FLOW', color: NEO.green },
  { max: 2.0, key: 'restricted', label: 'RESTRICTED', color: NEO.amber },
  { max: 3.5, key: 'congested', label: 'CONGESTED', color: NEO.orange },
  { max: 5.0, key: 'crush', label: 'CRUSH RISK', color: NEO.red },
  { max: Infinity, key: 'critical', label: 'CRITICAL DENSITY', color: NEO.crimson },
];

/**
 * @param {number|null} density persons per square metre
 * @returns {{key:string, label:string, color:string}}
 */
export function densityBand(density) {
  if (density == null || !Number.isFinite(density)) {
    return { key: 'unknown', label: 'UNKNOWN', color: UNKNOWN_COLOR };
  }
  return DENSITY_BANDS.find((band) => density <= band.max);
}
