import { useVenueStore, isDemo } from '../../store/useVenueStore';
import { useForecast } from '../../store/derived';
import { NEO, MONO, HARD } from '../../theme';

const HORIZONS = [1, 2, 3];

const OVERLAYS = [
  { key: 'density', label: 'DENSITY', color: NEO.orange },
  { key: 'trajectories', label: 'TRACKS', color: NEO.violet },
  { key: 'flow', label: 'FLOW', color: NEO.amber },
  { key: 'gates', label: 'EGRESS', color: NEO.green },
  { key: 'cameras', label: 'CAMERAS', color: NEO.red },
];

const THRESHOLD_MIN = 4;
const THRESHOLD_MAX = 30;

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
  const forecast = useForecast();

  const available = forecast.status !== 'UNAVAILABLE';

  return (
    <div style={shellStyle}>
      <div style={titleStyle}>
        <span style={{ color: NEO.orange }}>◎</span>
        TWIN CONTROLS
      </div>

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
          min={THRESHOLD_MIN}
          max={THRESHOLD_MAX}
          value={threshold}
          onChange={(event) => setThreshold(Number(event.target.value))}
          aria-label="Concentration threshold in projected tracks"
          style={{
            width: '100%',
            height: '6px',
            appearance: 'none',
            background: `linear-gradient(to right, ${NEO.orange} 0%, ${NEO.orange} ${
              ((threshold - THRESHOLD_MIN) / (THRESHOLD_MAX - THRESHOLD_MIN)) * 100
            }%, ${NEO.bg} ${((threshold - THRESHOLD_MIN) / (THRESHOLD_MAX - THRESHOLD_MIN)) * 100}%, ${NEO.bg} 100%)`,
            border: `1px solid ${NEO.ink}`,
            outline: 'none',
            cursor: 'pointer',
            borderRadius: '10px',
          }}
        />
        <div style={{ fontSize: '8px', color: NEO.grey, marginTop: '4px', lineHeight: 1.4 }}>
          Illustrative count threshold, not a risk probability.
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
  );
}

const shellStyle = {
  background: NEO.surface,
  border: HARD.border,
  boxShadow: HARD.shadow,
  padding: '12px',
  width: '218px',
  borderRadius: '10px',
  fontFamily: MONO,
  pointerEvents: 'auto',
  color: NEO.ink,
};

const titleStyle = {
  fontSize: '10px',
  fontWeight: 'bold',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom: '12px',
  borderBottom: `2px solid ${NEO.ink}`,
  paddingBottom: '6px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

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
