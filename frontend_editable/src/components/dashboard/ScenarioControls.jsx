import { useVenueStore } from '../../store/useVenueStore';
import { NEO, MONO, HARD } from '../../theme';

/**
 * The five evidence states the backend can report. In demo mode these switch
 * the simulated scenario; in backend mode they drive POST /api/demo/scenario
 * and the next poll reports whatever the backend actually returns.
 */
const EVIDENCE_STATES = [
  { id: 'clear', label: 'CLEAR', icon: '◉', accent: NEO.green },
  { id: 'tracking', label: 'NO TRACK', icon: '⊘', accent: NEO.grey },
  { id: 'visibility', label: 'DEGRADED', icon: '▩', accent: NEO.red },
  { id: 'camera', label: 'CAM MOVE', icon: '⇅', accent: NEO.amber },
  { id: 'collective', label: 'COLLECTIVE', icon: '⇄', accent: NEO.orange },
];

/**
 * Scenarios that play out over several minutes instead of holding one state.
 * Selecting one starts the playback clock in the timeline panel.
 */
const CROWD_TIMELINES = [
  { id: 'surge', label: 'EGRESS SURGE', icon: '▼', accent: NEO.orange },
  { id: 'crush', label: 'CRUSH CONDITIONS', icon: '⊗', accent: NEO.crimson },
];

export default function ScenarioControls() {
  const scenario = useVenueStore((state) => state.scenario);
  const setScenario = useVenueStore((state) => state.setScenario);
  const mode = useVenueStore((state) => state.mode);

  const renderButton = (entry, columns) => {
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
          gridColumn: `span ${columns}`,
        }}
      >
        <span style={{ fontSize: '16px', lineHeight: 1 }}>{entry.icon}</span>
        <span>{entry.label}</span>
      </button>
    );
  };

  return (
    <div style={shellStyle}>
      <p style={captionStyle}>
        ▸ EVIDENCE STATE {mode === 'backend' ? '(DRIVES BACKEND)' : '(SIMULATED)'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '6px' }}>
        {EVIDENCE_STATES.map((entry) => renderButton(entry, 2))}
      </div>

      <p style={{ ...captionStyle, margin: '14px 0 12px' }}>▸ CROWD TIMELINE (SIMULATED)</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '6px' }}>
        {CROWD_TIMELINES.map((entry) => renderButton(entry, 5))}
      </div>

      <p style={noteStyle}>
        Timelines run a scripted egress: the concourse fills, the exit funnel congests, and in the
        second one two gates are lost so the funnel reaches crush densities. Both are authored
        simulations for rehearsal, not recordings and not predictions.
      </p>
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

const noteStyle = {
  fontFamily: MONO,
  fontSize: '8px',
  lineHeight: 1.7,
  color: NEO.grey,
  margin: '12px 0 0',
};
