import { NEO, MONO, HARD, PROVENANCE } from '../../theme';

/**
 * Neo-brutalist section block: dark caption bar over a white body.
 * @param {{title:string, tag?:string, tone?:'observed'|'simulated'|'missing', children:React.ReactNode, dense?:boolean}} props
 */
export function Panel({ title, tag, tone, children, dense = false }) {
  return (
    <section style={panelStyle}>
      <header style={panelHeadStyle}>
        <span>▸ {title}</span>
        {tag && (
          <span
            style={{
              fontSize: '8px',
              fontWeight: 900,
              letterSpacing: '0.08em',
              padding: '2px 6px',
              color: tone ? PROVENANCE[tone].color : NEO.grey,
              background: tone ? PROVENANCE[tone].background : NEO.surface,
              border: `1px solid ${tone ? PROVENANCE[tone].color : NEO.line}`,
            }}
          >
            {tag}
          </span>
        )}
      </header>
      <div style={{ padding: dense ? '10px 12px' : '14px 16px' }}>{children}</div>
    </section>
  );
}

/**
 * Metric tile with a value, unit and a proportional bar.
 * @param {{label:string, value:string|number|null, unit?:string, color?:string, max?:number, note?:string}} props
 */
export function StatCard({ label, value, unit = '', color = NEO.orange, max = 100, note }) {
  const missing = value == null || value === '';
  const numeric = typeof value === 'number' ? value : Number.parseFloat(value);
  const filled = Number.isFinite(numeric) ? Math.min(100, Math.max(0, (numeric / max) * 100)) : 0;

  return (
    <div style={statCardStyle}>
      <div style={statLabelStyle}>{label}</div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: missing ? '13px' : '24px',
          fontWeight: 900,
          color: missing ? NEO.grey : NEO.ink,
          lineHeight: 1.15,
          wordBreak: 'break-word',
        }}
      >
        {missing ? 'Unavailable' : value}
        {!missing && unit && <span style={{ fontSize: '12px', color: NEO.grey, marginLeft: 4 }}>{unit}</span>}
      </div>
      <div style={barTrackStyle}>
        <div
          style={{
            height: '100%',
            width: `${filled}%`,
            background: missing ? NEO.grey : color,
            transition: 'width 0.45s ease',
          }}
        />
      </div>
      {note && <div style={{ fontFamily: MONO, fontSize: '7px', color: NEO.grey, marginTop: 5 }}>{note}</div>}
    </div>
  );
}

/** Small provenance chip: OBSERVED / SIMULATED / UNAVAILABLE. */
export function ProvenanceTag({ tone, children }) {
  const entry = PROVENANCE[tone] || PROVENANCE.missing;
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: '8px',
        fontWeight: 900,
        letterSpacing: '0.08em',
        padding: '2px 6px',
        color: entry.color,
        background: entry.background,
        border: `1px solid ${entry.color}`,
        whiteSpace: 'nowrap',
      }}
    >
      {children || entry.label}
    </span>
  );
}

/** Amber caution block used for limitations and interpretation warnings. */
export function Callout({ children }) {
  return (
    <div
      style={{
        background: '#FEF3C7',
        border: `1px solid ${NEO.amber}`,
        padding: '8px 10px',
        fontFamily: MONO,
        fontSize: '9px',
        lineHeight: 1.6,
        color: '#92400E',
      }}
    >
      {children}
    </div>
  );
}

/** Primary action button in the neo-brutalist style. */
export function ActionButton({ children, tone = NEO.orange, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      style={{
        width: '100%',
        background: rest.disabled ? NEO.grey : tone,
        color: NEO.surface,
        border: HARD.border,
        padding: '12px 0',
        fontFamily: MONO,
        fontSize: '12px',
        fontWeight: 900,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        cursor: rest.disabled ? 'not-allowed' : 'pointer',
        borderRadius: '4px',
        ...rest.style,
      }}
    >
      {children}
    </button>
  );
}

const panelStyle = {
  background: NEO.surface,
  border: HARD.border,
  boxShadow: HARD.shadow,
  borderRadius: '4px',
  marginBottom: '14px',
};

const panelHeadStyle = {
  background: NEO.bg,
  borderBottom: HARD.border,
  padding: '8px 14px',
  fontFamily: MONO,
  fontSize: '10px',
  fontWeight: 'bold',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: NEO.ink,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
};

const statCardStyle = {
  background: NEO.surface,
  border: HARD.border,
  padding: '12px 14px',
  minWidth: 0,
};

const statLabelStyle = {
  fontFamily: MONO,
  fontSize: '8px',
  fontWeight: 'bold',
  letterSpacing: '0.12em',
  color: NEO.grey,
  textTransform: 'uppercase',
  marginBottom: '6px',
};

const barTrackStyle = {
  height: '5px',
  background: NEO.bg,
  border: `1px solid ${NEO.ink}`,
  marginTop: '8px',
};
