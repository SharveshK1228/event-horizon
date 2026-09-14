import { useVenueStore } from '../../store/useVenueStore';
import { useForecast, useZones, useTimeline } from '../../store/derived';
import { NEO, MONO, HARD } from '../../theme';

/**
 * Headline forecast state for the whole analysed region. Mirrors the
 * resilience banner of the source project, carrying crowd-concentration
 * evidence instead of energy metrics.
 */
export default function ForecastPanel() {
  const forecast = useForecast();
  const zones = useZones();
  const timeline = useTimeline();
  const horizon = useVenueStore((state) => state.horizon);

  // On a timeline scenario the headline is the lead time: how far ahead of
  // the onset density the projection crosses the operator's threshold.
  const lead = timeline?.lead ?? null;
  const warning = lead
    ? lead.leadSeconds == null
      ? { value: '—', sub: 'no onset on timeline', color: NEO.grey }
      : lead.leadSeconds > 0
        ? { value: `${lead.leadSeconds}s`, sub: 'before onset', color: lead.leadSeconds >= 30 ? NEO.green : NEO.amber }
        : { value: 'NONE', sub: 'threshold too high', color: NEO.red }
    : null;

  const available = forecast.status !== 'UNAVAILABLE';
  const flagged = zones.filter((zone) => zone.flagged).length;
  const coverage = available ? `${Math.round(forecast.coverage * 100)}%` : '—';
  const accent = !available ? NEO.grey : flagged ? NEO.red : NEO.green;

  const actions = available
    ? flagged
      ? [
          'Inspect the flagged zone and its bottleneck',
          'Check entry rate and inbound corridors',
          'Verify the view before acting on the projection',
        ]
      : [
          'Continuous projection running at the selected horizon',
          'Track continuity and visibility within bounds',
          'No configured threshold exceeded — not an all-clear',
        ]
    : [
        'Projection suspended for this interval',
        'Verify the camera view and track continuity',
        'Missing evidence does not establish an empty or safe scene',
      ];

  return (
    <div style={shellStyle}>
      <div style={{ ...headStyle, borderBottom: `2px solid ${accent}` }}>
        <span style={{ color: accent, fontSize: '12px' }}>✦</span>
        EVENT HORIZON / CONCENTRATION FORECAST
      </div>

      <div style={{ ...metricsRowStyle, gridTemplateColumns: `repeat(${warning ? 4 : 3}, minmax(0, 1fr))` }}>
        <Metric label="FORECAST" value={available ? (flagged ? 'REVIEW' : 'RUNNING') : 'SUSPENDED'} sub={`at +${horizon}s`} accent={accent} />
        <Metric label="FLAGGED ZONES" value={available ? `${flagged}/9` : '—'} sub="above threshold" accent={accent} />
        <Metric label="TRACK COVERAGE" value={coverage} sub="of detections" accent={accent} />
        {warning && <Metric label="WARNING" value={warning.value} sub={warning.sub} accent={warning.color} />}
      </div>

      <div style={actionsStyle}>
        <div style={{ fontWeight: 900, marginBottom: '7px', textTransform: 'uppercase', color: NEO.ink }}>
          Operator actions
        </div>
        {actions.map((action) => (
          <div key={action} style={actionRowStyle}>
            <span style={{ color: accent, fontWeight: 900 }}>›</span>
            {action}
          </div>
        ))}
        <div style={reasonStyle}>{forecast.advice}</div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub, accent }) {
  return (
    <div style={metricStyle}>
      <div style={{ fontSize: '8px', color: NEO.grey, fontWeight: 900, letterSpacing: '0.1em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: '20px', fontWeight: 900, lineHeight: 1, color: accent }}>{value}</div>
      <div style={{ fontSize: '8px', color: NEO.grey, marginTop: 4, textTransform: 'uppercase' }}>{sub}</div>
    </div>
  );
}

const shellStyle = {
  border: HARD.border,
  background: NEO.surface,
  borderRadius: '8px',
  boxShadow: '0 12px 24px rgba(0, 0, 0, 0.12)',
  overflow: 'hidden',
  marginBottom: '14px',
};

const headStyle = {
  background: NEO.inkDeep,
  color: NEO.surface,
  padding: '11px 16px',
  fontFamily: MONO,
  fontSize: '11px',
  fontWeight: 900,
  letterSpacing: '0.1em',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const metricsRowStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '8px',
  padding: '12px',
  background: 'linear-gradient(180deg, #eef1ee 0%, #eef2f4 100%)',
};

const metricStyle = {
  border: `1px solid ${NEO.line}`,
  borderRadius: '6px',
  padding: '9px',
  background: NEO.surface,
  boxShadow: '0 2px 0 rgba(0,0,0,0.1)',
  fontFamily: MONO,
  minWidth: 0,
};

const actionsStyle = {
  borderTop: `1px solid ${NEO.line}`,
  padding: '12px 16px',
  fontFamily: MONO,
  fontSize: '10px',
  background: '#FCFCFB',
};

const actionRowStyle = {
  padding: '5px 0',
  color: '#374151',
  display: 'flex',
  gap: '7px',
  alignItems: 'flex-start',
  lineHeight: 1.5,
};

const reasonStyle = {
  marginTop: '8px',
  paddingTop: '8px',
  borderTop: `1px dashed ${NEO.line}`,
  fontSize: '9px',
  color: NEO.grey,
  lineHeight: 1.6,
};
