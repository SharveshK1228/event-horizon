import { useMemo } from 'react';
import {
  useVenueStore,
  computeForecast,
  computeZones,
  computeIncidents,
  computeMetrics,
} from './useVenueStore';

// Zustand v5 caches the value a selector returns and compares it by identity.
// A selector that builds a fresh array or object on every call therefore never
// settles, so every derivation below selects only stable slices of state and
// memoises the computation in the component instead.

/** @returns {ReturnType<typeof computeForecast>} */
export function useForecast() {
  const mode = useVenueStore((state) => state.mode);
  const scenario = useVenueStore((state) => state.scenario);
  const status = useVenueStore((state) => state.status);
  const threshold = useVenueStore((state) => state.threshold);
  return useMemo(
    () => computeForecast({ mode, scenario, status, threshold }),
    [mode, scenario, status, threshold],
  );
}

/** @returns {ReturnType<typeof computeZones>} */
export function useZones() {
  const forecast = useForecast();
  const horizon = useVenueStore((state) => state.horizon);
  const threshold = useVenueStore((state) => state.threshold);
  return useMemo(() => computeZones(forecast, horizon, threshold), [forecast, horizon, threshold]);
}

/** The zone currently selected in the twin, or null. */
export function useSelectedZone() {
  const zones = useZones();
  const selectedZone = useVenueStore((state) => state.selectedZone);
  return useMemo(
    () => (selectedZone ? zones.find((zone) => zone.id === selectedZone) || null : null),
    [zones, selectedZone],
  );
}

/** The six headline metrics, each paired with its provenance. */
export function useMetrics() {
  const mode = useVenueStore((state) => state.mode);
  const scenario = useVenueStore((state) => state.scenario);
  const status = useVenueStore((state) => state.status);
  const forecast = useForecast();
  return useMemo(
    () => computeMetrics({ mode, scenario, status }, forecast),
    [mode, scenario, status, forecast],
  );
}

/** Incidents for the current mode; demo incidents are synthesised locally. */
export function useIncidents() {
  const mode = useVenueStore((state) => state.mode);
  const scenario = useVenueStore((state) => state.scenario);
  const snapshot = useVenueStore((state) => state.snapshot);
  const acknowledged = useVenueStore((state) => state.acknowledged);
  return useMemo(
    () => computeIncidents({ mode, scenario, snapshot, acknowledged }),
    [mode, scenario, snapshot, acknowledged],
  );
}

/** The incident under review: the explicit selection, else the first listed. */
export function useIncident() {
  const incidents = useIncidents();
  const incidentId = useVenueStore((state) => state.incidentId);
  return useMemo(
    () => incidents.find((item) => item.incident_id === incidentId) || incidents[0] || null,
    [incidents, incidentId],
  );
}
