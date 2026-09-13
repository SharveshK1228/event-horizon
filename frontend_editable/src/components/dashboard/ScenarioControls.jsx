import { useVenueStore } from '../../store/useVenueStore';
import { NEO, MONO, HARD } from '../../theme';

/**
 * The five evidence states the backend can report. In demo mode these switch
 * the simulated scenario; in backend mode they drive POST /api/demo/scenario
 * and the next poll reports whatever the backend actually returns.
 */
const SCENARIOS = [
  { id: 'clear', label: 'CLEAR', icon: '◉', accent: NEO.green },
  { id: 'tracking', label: 'NO TRACK', icon: '⊘', accent: NEO.grey },
  { id: 'visibility', label: 'DEGRADED', icon: '▩', accent: NEO.red },
  { id: 'camera', label: 'CAM MOVE', icon: '⇅', accent: NEO.amber },
  { id: 'collective', label: 'COLLECTIVE', icon: '⇄', accent: NEO.orange },
];

export default function ScenarioControls() {
  const scenario = useVenueStore((state) => state.scenario);
  const setScenario = useVenueStore((state) => state.setScenario);
  const mode = useVenueStore((state) => state.mode);

  return (
    <div style={shellStyle}>
      <p style={captionStyle}>
        ▸ EVIDENCE STATE {mode === 'backend' ? '(DRIVES BACKEND)' : '(SIMULATED)'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
        {SCENARIOS.map((entry) => {
          const active = scenario === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setScenario(entry.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                padding: '9px 2px',
                border: `2px solid ${active ? entry.accent : NEO.ink}`,
                background: active ? entry.accent : NEO.surface,
                color: active ? NEO.surface : NEO.ink,
                fontFamily: MONO,
                fontSize: '8px',
                fontWeight: 'bold',
                letterSpacing: '0.04em',
                cursor: 'pointer',
                textTransform: 'uppercase',
                transition: 'all 0.15s ease',
                borderRadius: '2px',
              }}
            >
              <span style={{ fontSize: '16px', lineHeight: 1 }}>{entry.icon}</span>
              <span>{entry.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const shellStyle = {
  background: NEO.surface,
  border: HARD.border,
  boxShadow: HARD.shadow,
  borderRadius: '4px',
  padding: '14px',
  marginBottom: '14px',
};

const captionStyle = {
  fontFamily: MONO,
  fontSize: '10px',
  fontWeight: 'bold',
  letterSpacing: '0.12em',
  color: NEO.grey,
  textTransform: 'uppercase',
  margin: '0 0 12px 0',
};
