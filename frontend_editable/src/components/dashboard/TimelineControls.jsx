import { useVenueStore } from '../../store/useVenueStore';
import { useTimeline, useZones } from '../../store/derived';
import { formatClock } from '../../data/crowdTimeline';
import { ZONE_AREA_M2 } from '../../data/venueModel';
import { NEO, MONO, HARD, DENSITY_BANDS, densityBand } from '../../theme';

const RATES = [1, 4, 10];

/**
 * Playback for the two timeline scenarios.
 *
 * The point of the panel is the lead time: the operator can watch the +1/+2/+3 s
 * projection cross the configured threshold, then keep watching until the crowd
 * actually reaches the densities crowd-safety literature associates with a
 * crush, and read off how much warning there was in between. Every number here
 * is authored simulation — it says nothing about any real venue.
 */
export default function TimelineControls() {
  const timeline = useTimeline();
  const zones = useZones();
  const playing = useVenueStore((state) => state.playing);
  const playbackRate = useVenueStore((state) => state.playbackRate);
  const horizon = useVenueStore((state) => state.horizon);
  const setClock = useVenueStore((state) => state.setClock);
  const togglePlay = useVenueStore((state) => state.togglePlay);
  const setPlaybackRate = useVenueStore((state) => state.setPlaybackRate);

  if (!timeline) return null;

  const peak = zones.reduce(
    (best, zone) => (zone.currentDensity > (best?.currentDensity ?? -1) ? zone : best),
    null,
  );
  const density = peak?.currentDensity ?? null;
  const band = densityBand(density);
  const progress = ((timeline.clockT - timeline.start) / (timeline.end - timeline.start)) * 100;

  return (
    <div style={shellStyle}>
      <div style={{ ...headStyle, borderBottom: `2px solid ${band.color}` }}>
        <span style={{ color: band.color }}>◷</span>
        SIMULATED CROWD TIMELINE
        <span style={{ marginLeft: 'auto', color: NEO.amber, fontSize: 8 }}>SIMULATED</span>
      </div>

      <div style={bodyStyle}>
        <div style={{ fontSize: 10, fontWeight: 900, color: NEO.ink, marginBottom: 4 }}>
          {timeline.title}
        </div>
        <div style={{ fontSize: 9, color: NEO.grey, lineHeight: 1.6, marginBottom: 12 }}>
          {timeline.summary}
        </div>

        {/* Transport */}
        <div style={transportStyle}>
          <button type="button" onClick={togglePlay} style={playButtonStyle} aria-pressed={playing}>
            {playing ? '❚❚ PAUSE' : '▶ PLAY'}
          </button>
          <div style={{ display: 'flex', gap: 3 }}>
            {RATES.map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => setPlaybackRate(rate)}
                style={{
                  ...rateButtonStyle,
                  background: playbackRate === rate ? NEO.ink : NEO.surface,
                  color: playbackRate === rate ? NEO.surface : NEO.ink,
                }}
              >
                {rate}×
              </button>
            ))}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 900, color: NEO.ink }}>
            {formatClock(timeline.clockT)}
          </span>
        </div>

        {/* Scrubber with one tick per authored phase */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <div style={trackStyle}>
            <div style={{ width: `${progress}%`, background: band.color, height: '100%' }} />
          </div>
          <div style={ticksStyle}>
            {timeline.keyframes.map((frame, index) => (
              <span
                key={frame.t}
                title={`${formatClock(frame.t)} — ${frame.label}`}
                style={{
                  position: 'absolute',
                  left: `${((frame.t - timeline.start) / (timeline.end - timeline.start)) * 100}%`,
                  width: 2,
                  height: 7,
                  marginLeft: -1,
                  background: index === timeline.phaseIndex ? NEO.ink : NEO.line,
                }}
              />
            ))}
          </div>
          <input
            type="range"
            min={timeline.start}
            max={timeline.end}
            step={1}
            value={Math.round(timeline.clockT)}
            onChange={(event) => setClock(Number(event.target.value))}
            aria-label="Timeline position in seconds relative to T0"
            style={scrubberStyle}
          />
        </div>

        {/* Current phase */}
        <div style={{ ...phaseStyle, borderLeft: `3px solid ${band.color}` }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: NEO.ink }}>
            {formatClock(timeline.phase.t)} · {timeline.phase.label.toUpperCase()}
          </div>
          <div style={{ fontSize: 9, color: NEO.grey, lineHeight: 1.6, marginTop: 3 }}>
            {timeline.phase.note}
          </div>
        </div>

        {/* Peak density and counterflow */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          <Readout
            label={`Peak density · ${peak?.id || '—'}`}
            value={density == null ? '—' : `${density.toFixed(2)} /m²`}
            note={band.label}
            color={band.color}
          />
          <Readout
            label="Counterflow"
            value={`${Math.round(timeline.counterflow * 100)}%`}
            note="SIMULATED SHARE MOVING AGAINST EGRESS"
            color={timeline.counterflow > 0.2 ? NEO.red : NEO.grey}
          />
        </div>

        {/* The preventive claim, stated with its limits */}
        <div style={leadStyle}>
          <LeadTime lead={timeline.lead} horizon={horizon} />
        </div>

        {/* Reference bands */}
        <div style={bandRowStyle}>
          {DENSITY_BANDS.map((entry) => (
            <span
              key={entry.key}
              style={{
                ...bandChipStyle,
                background: entry.key === band.key ? entry.color : NEO.surface,
                color: entry.key === band.key ? NEO.surface : NEO.grey,
                borderColor: entry.color,
              }}
            >
              {entry.label}
            </span>
          ))}
        </div>
        <div style={footnoteStyle}>
          Density is people ÷ the {ZONE_AREA_M2} m² a zone tile stands for in this simulated venue. The
          backend counts tracks in image cells and makes no area claim, so no persons-per-square-metre
          figure appears in backend mode. Band boundaries are published crowd-safety reference levels,
          not thresholds validated here, and nothing on this panel establishes that a crowd is safe.
        </div>
      </div>
    </div>
  );
}

/**
 * The whole point of the panel: how far ahead of the condition the projection
 * crossed the operator's threshold, and what that number does not mean.
 */
function LeadTime({ lead, horizon }) {
  const onset = `${lead.onsetDensity.toFixed(1)} persons/m² — ${lead.onsetLabel}`;

  if (lead.onsetAt == null) {
    return (
      <>
        This timeline never reaches {onset}, so there is no onset to measure warning against.
        {lead.warnAt != null && (
          <> The +{horizon}s projection still crosses the threshold at {formatClock(lead.warnAt)}.</>
        )}
      </>
    );
  }

  if (lead.warnAt == null) {
    return (
      <>
        The +{horizon}s projection never crosses the configured threshold, while the simulated crowd
        reaches {onset} at {formatClock(lead.onsetAt)}. Lower the threshold to get a warning at all.
      </>
    );
  }

  if (lead.leadSeconds <= 0) {
    return (
      <>
        <strong style={{ color: NEO.red }}>No usable warning.</strong> The threshold is set so high
        that the +{horizon}s projection does not cross it until {formatClock(lead.warnAt)}, after the
        crowd reaches {onset} at {formatClock(lead.onsetAt)}. Lower it.
      </>
    );
  }

  return (
    <>
      <strong style={{ color: NEO.ink }}>{lead.leadSeconds}s of warning.</strong> The +{horizon}s
      projection first crosses the configured threshold at {formatClock(lead.warnAt)}; this simulated
      crowd first reaches {onset} at {formatClock(lead.onsetAt)}. Whether that warning is usable
      depends on gate staffing and inbound control, not on this console — and both numbers come from
      an authored timeline, so neither is evidence about any real venue.
    </>
  );
}

function Readout({ label, value, note, color }) {
  return (
    <div style={readoutStyle}>
      <div style={{ fontSize: 8, color: NEO.grey, letterSpacing: '0.08em', fontWeight: 900 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 17, fontWeight: 900, color, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 7, color: NEO.grey, marginTop: 2 }}>{note}</div>
    </div>
  );
}

const shellStyle = {
  border: HARD.border,
  background: NEO.surface,
  borderRadius: 4,
  boxShadow: HARD.shadow,
  marginBottom: 14,
  overflow: 'hidden',
  fontFamily: MONO,
};

const headStyle = {
  background: NEO.inkDeep,
  color: NEO.surface,
  padding: '10px 14px',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.12em',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const bodyStyle = { padding: 14 };

const transportStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 12,
  flexWrap: 'wrap',
};

const playButtonStyle = {
  border: HARD.border,
  background: NEO.orange,
  color: NEO.surface,
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.08em',
  padding: '6px 12px',
  cursor: 'pointer',
  borderRadius: 2,
  boxShadow: HARD.shadowSm,
};

const rateButtonStyle = {
  border: HARD.border,
  fontFamily: MONO,
  fontSize: 9,
  fontWeight: 900,
  padding: '6px 8px',
  cursor: 'pointer',
  borderRadius: 2,
};

const trackStyle = {
  height: 8,
  border: HARD.border,
  background: NEO.bg,
  overflow: 'hidden',
};

const ticksStyle = { position: 'relative', height: 7, marginTop: 2 };

const scrubberStyle = {
  width: '100%',
  marginTop: 4,
  accentColor: NEO.ink,
  cursor: 'pointer',
};

const phaseStyle = {
  background: NEO.bg,
  padding: '8px 10px',
  borderRadius: 2,
};

const readoutStyle = {
  border: `1px solid ${NEO.line}`,
  borderRadius: 4,
  padding: 8,
  background: NEO.surface,
  minWidth: 0,
};

const leadStyle = {
  marginTop: 10,
  padding: '9px 11px',
  border: `2px dashed ${NEO.line}`,
  borderRadius: 3,
  fontSize: 9,
  lineHeight: 1.7,
  color: NEO.grey,
};

const bandRowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  marginTop: 10,
};

const bandChipStyle = {
  border: '1px solid',
  borderRadius: 2,
  padding: '3px 6px',
  fontSize: 7,
  fontWeight: 900,
  letterSpacing: '0.06em',
};

const footnoteStyle = {
  marginTop: 8,
  fontSize: 8,
  lineHeight: 1.7,
  color: NEO.grey,
};
