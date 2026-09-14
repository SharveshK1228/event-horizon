import { useVenueStore, isDemo, thresholdConfig } from '../../store/useVenueStore';
import { useForecast } from '../../store/derived';
import { ZONE_AREA_M2 } from '../../data/venueModel';
import OverlayPanel from '../digitalTwin/OverlayPanel';
import { NEO, MONO, densityBand } from '../../theme';

const HORIZONS = [1, 2, 3];

const OVERLAYS = [
  { key: 'density', label: 'DENSITY', color: NEO.orange },
  { key: 'trajectories', label: 'TRACKS', color: NEO.violet },
  { key: 'flow', label: 'FLOW', color: NEO.amber },
  { key: 'gates', label: 'EGRESS', color: NEO.green },
  { key: 'cameras', label: 'CAMERAS', color: NEO.red },
];

/**
 * Floating controls over the twin: which projection horizon to render, the
 * concentration threshold, and which overlays are drawn. These change the
 * view only — they never alter the underlying evidence.
 */
export default function ViewControls() {
  const demo = useVenueStore(isDemo);
  const horizon = useVenueStore((state) => state.horizon);
  const threshold = useVenueStore((state) => state.threshold);
  const overlays = useVenueStore((state) => state.overlays);
  const setHorizon = useVenueStore((state) => state.setHorizon);
  const setThreshold = useVenueStore((state) => state.setThreshold);
  const toggleOverlay = useVenueStore((state) => state.toggleOverlay);
  const scenario = useVenueStore((state) => state.scenario);
  const forecast = useForecast();

  const available = forecast.status !== 'UNAVAILABLE';
  // Scenarios differ by an order of magnitude in occupancy, so the slider
  // rescales with the one selected rather than pinning a single fixed range.
  const [thresholdMin, thresholdMax] = thresholdConfig(scenario).range;
  const filled = ((threshold - thresholdMin) / (thresholdMax - thresholdMin)) * 100;
  const band = densityBand(threshold / ZONE_AREA_M2);

  return (
    <OverlayPanel
      title="Twin controls"
      width={218}
      // Projection state stays visible in the bar, so minimising the panel
      // never hides whether a projection is running.
      badge={
        <span
          style={{ width: 7, height: 7, borderRadius: '50%', background: available ? NEO.green : NEO.grey }}
          title={available ? 'Projection on' : 'No projection'}
        />
      }
    >
      <div style={bodyStyle}>
      {/* Projection horizon */}
      <div style={{ marginBottom: '12px' }}>
        <div style={captionStyle}>PROJECTION HORIZON</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
          {HORIZONS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setHorizon(value)}
              style={{
                border: `2px solid ${NEO.ink}`,
                background: horizon === value ? NEO.orange : NEO.surface,
                color: horizon === value ? NEO.surface : NEO.ink,
                fontFamily: MONO,
                fontSize: '10px',
                fontWeight: 900,
                padding: '6px 0',
                cursor: 'pointer',
                borderRadius: '2px',
              }}
            >
              +{value}s
            </button>
          ))}
        </div>
      </div>

      {/* Concentration threshold */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ ...captionStyle, display: 'flex', justifyContent: 'space-between' }}>
          <span>CONCENTRATION THRESHOLD</span>
          <span style={{ color: NEO.orange, fontWeight: 900 }}>{threshold}</span>
        </div>
        <input
          type="range"
          min={thresholdMin}
          max={thresholdMax}
          step={thresholdMax > 200 ? 10 : 1}
          value={threshold}
          onChange={(event) => setThreshold(Number(event.target.value))}
          aria-label="Concentration threshold in projected tracks"
          style={{
            width: '100%',
            height: '6px',
            appearance: 'none',
            background: `linear-gradient(to right, ${NEO.orange} 0%, ${NEO.orange} ${filled}%, ${NEO.bg} ${filled}%, ${NEO.bg} 100%)`,
            border: `1px solid ${NEO.ink}`,
            outline: 'none',
            cursor: 'pointer',
            borderRadius: '10px',
          }}
        />
        <div style={{ fontSize: '8px', color: NEO.grey, marginTop: '4px', lineHeight: 1.5 }}>
          {demo ? (
            <>
              ≈{' '}
              <span style={{ color: band.color, fontWeight: 900 }}>
                {(threshold / ZONE_AREA_M2).toFixed(2)} /m²
              </span>{' '}
              over a simulated {ZONE_AREA_M2} m² zone. Illustrative count threshold, not a risk
              probability.
            </>
          ) : (
            'Illustrative count threshold, not a risk probability.'
          )}
        </div>
      </div>

      {/* Overlay toggles */}
      <div style={{ marginBottom: '10px' }}>
        <div style={captionStyle}>OVERLAYS</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {OVERLAYS.map((overlay) => {
            const on = overlays[overlay.key];
            return (
              <button
                key={overlay.key}
                type="button"
                onClick={() => toggleOverlay(overlay.key)}
                style={{
                  border: `2px solid ${on ? overlay.color : NEO.ink}`,
                  background: on ? overlay.color : NEO.surface,
                  color: on ? NEO.surface : NEO.grey,
                  fontFamily: MONO,
                  fontSize: '8px',
                  fontWeight: 900,
                  letterSpacing: '0.06em',
                  padding: '4px 7px',
                  cursor: 'pointer',
                  borderRadius: '2px',
                }}
              >
                {overlay.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={footerStyle}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            flexShrink: 0,
            background: available ? NEO.green : NEO.grey,
          }}
        />
        <span style={{ fontSize: '8px', color: NEO.grey, letterSpacing: '0.08em' }}>
          {demo ? 'DEMO DATA' : 'BACKEND MODE'} · {available ? 'PROJECTION ON' : 'NO PROJECTION'}
        </span>
      </div>
      </div>
    </OverlayPanel>
  );
}

const bodyStyle = { padding: '12px', fontFamily: MONO, color: NEO.ink };

const captionStyle = {
  fontSize: '8px',
  fontWeight: 'bold',
  letterSpacing: '0.1em',
  color: NEO.grey,
  textTransform: 'uppercase',
  marginBottom: '6px',
};

const footerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  borderTop: `1px solid ${NEO.bg}`,
  paddingTop: '8px',
};
