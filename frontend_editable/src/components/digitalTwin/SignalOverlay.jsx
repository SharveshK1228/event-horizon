import { useVenueStore } from '../../store/useVenueStore';
import { NEO, MONO, HARD } from '../../theme';

const SOURCE_ACCENT = {
  Detector: NEO.orange,
  Tracker: NEO.violet,
  Flow: NEO.amber,
  Visibility: NEO.red,
  Forecast: NEO.green,
  Observation: NEO.orange,
  Operator: NEO.ink,
};

const VISIBLE_ENTRIES = 5;

/**
 * Rolling evidence feed pinned to the twin, mirroring the agent-network log in
 * the source project. Each entry carries its own provenance tag.
 */
export default function SignalOverlay() {
  const signals = useVenueStore((state) => state.signals);
  const shown = signals.slice(0, VISIBLE_ENTRIES);

  return (
    <div style={shellStyle}>
      <div style={headStyle}>
        <span>▸ SIGNAL FEED</span>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: NEO.green }} />
      </div>

      <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
        {shown.length === 0 ? (
          <div style={emptyStyle}>AWAITING EVIDENCE…</div>
        ) : (
          shown.map((signal, index) => {
            const newest = index === 0;
            return (
              <div
                key={`${signal.timestamp}-${index}`}
                style={{
                  background: newest ? NEO.ink : NEO.surface,
                  color: newest ? NEO.surface : NEO.ink,
                  borderBottom: index === shown.length - 1 ? 'none' : `1px solid ${NEO.ink}`,
                  padding: '10px 12px',
                }}
              >
                <div style={rowStyle}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 'bold',
                      letterSpacing: '0.08em',
                      color: newest ? NEO.amber : SOURCE_ACCENT[signal.source] || NEO.grey,
                    }}
                  >
                    {signal.source.toUpperCase()}
                  </span>
                  <span style={{ fontSize: '9px', color: newest ? '#9ca3af' : NEO.grey }}>
                    {signal.origin === 'observed' ? 'BACKEND' : 'SIMULATED'} · {signal.timestamp}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: '11px',
                    margin: 0,
                    lineHeight: 1.4,
                    color: newest ? NEO.bg : NEO.ink,
                  }}
                >
                  {signal.message}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const shellStyle = {
  pointerEvents: 'auto',
  width: '300px',
  background: NEO.surface,
  border: HARD.border,
  boxShadow: HARD.shadow,
  fontFamily: MONO,
};

const headStyle = {
  background: NEO.ink,
  color: NEO.surface,
  padding: '8px 12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: '11px',
  fontWeight: 'bold',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
};

const rowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '8px',
  marginBottom: '4px',
};

const emptyStyle = {
  padding: '20px 12px',
  textAlign: 'center',
  fontSize: '11px',
  color: NEO.grey,
};
