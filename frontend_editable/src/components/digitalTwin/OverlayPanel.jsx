import { useState } from 'react';
import { NEO, MONO, HARD } from '../../theme';

/**
 * A floating panel over the twin that can be minimised to its title bar.
 *
 * The twin pane carries several of these at once — controls, legend, signal
 * feed — and on a laptop they leave little of the venue visible. Collapsing is
 * a view preference only: it hides a panel's body and changes nothing about
 * the evidence underneath, so a panel reporting degraded or missing evidence
 * keeps saying so in its title bar while minimised.
 *
 * @param {object} props
 * @param {string} props.title shown in the bar, and the accessible name
 * @param {'dark'|'light'} [props.tone] bar styling
 * @param {React.ReactNode} [props.badge] status shown in the bar in both states
 * @param {boolean} [props.defaultOpen]
 * @param {number|string} [props.width]
 * @param {object} [props.style] merged into the shell
 */
export default function OverlayPanel({
  title,
  tone = 'light',
  badge,
  defaultOpen = true,
  width,
  style,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const dark = tone === 'dark';

  return (
    <div style={{ ...shellStyle, width, ...style }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={open ? `Minimise ${title}` : `Expand ${title}`}
        style={{
          ...barStyle,
          background: dark ? NEO.ink : NEO.surface,
          color: dark ? NEO.surface : NEO.ink,
          borderBottom: open ? `2px solid ${dark ? NEO.ink : NEO.ink}` : 'none',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ ...caretStyle, transform: open ? 'rotate(90deg)' : 'none' }}>▸</span>
          <span style={titleStyle}>{title}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {badge}
          <span style={{ ...glyphStyle, color: dark ? NEO.bg : NEO.grey }}>{open ? '–' : '+'}</span>
        </span>
      </button>

      {open && <div style={bodyStyle}>{children}</div>}
    </div>
  );
}

const shellStyle = {
  pointerEvents: 'auto',
  background: NEO.surface,
  border: HARD.border,
  boxShadow: HARD.shadow,
  fontFamily: MONO,
  color: NEO.ink,
  borderRadius: 4,
  overflow: 'hidden',
};

const barStyle = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '8px 10px',
  border: 'none',
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  textAlign: 'left',
};

const caretStyle = {
  display: 'inline-block',
  fontSize: 9,
  lineHeight: 1,
  transition: 'transform 0.15s ease',
};

const titleStyle = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const glyphStyle = {
  fontSize: 13,
  fontWeight: 900,
  lineHeight: 1,
  width: 10,
  textAlign: 'center',
};

const bodyStyle = { padding: 0 };
