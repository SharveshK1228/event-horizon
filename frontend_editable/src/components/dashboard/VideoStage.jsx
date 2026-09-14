import { ZONE_IDS, ZONE_LABELS } from '../../data/venueModel';
import { NEO, MONO } from '../../theme';

/** Frame-difference value treated as full-scale for the per-tile bar. */
const MOTION_FULL_SCALE = 24;

/**
 * The video with the analysed 3×3 region drawn over it.
 *
 * The overlay carries only what was actually computed from these frames —
 * per-tile image quality and pixel change. It deliberately draws no boxes and
 * no tracks, because no detector or tracker ran: an overlay that implied
 * detections would be the exact failure this project exists to avoid.
 *
 * Tiles use the venue's own zone naming, so clicking one selects the matching
 * zone in the twin.
 */
export default function VideoStage({ videoRef, src, reading, selectedZone, onSelectZone, onTimeUpdate }) {
  const warming = reading.status === 'WARMING UP';

  return (
    <div style={stageStyle}>
      {src ? (
        <>
          <video
            ref={videoRef}
            src={src}
            controls
            loop
            muted
            playsInline
            crossOrigin="anonymous"
            onTimeUpdate={onTimeUpdate}
            style={{ width: '100%', display: 'block', background: '#000', maxHeight: 330 }}
          />

          {/* Analysed region */}
          <div style={gridStyle} aria-hidden={false}>
            {ZONE_IDS.map((id, index) => {
              const changed = reading.perTile[index];
              const motion = Math.min(1, (reading.motion[index] || 0) / MOTION_FULL_SCALE);
              const selected = selectedZone === id;
              const accent = warming ? NEO.grey : changed ? NEO.red : NEO.green;

              return (
                <div
                  key={id}
                  style={{
                    ...tileStyle,
                    borderColor: selected ? NEO.ink : accent,
                    borderWidth: selected ? 3 : 1,
                    background: changed && !warming ? 'rgba(220, 38, 38, 0.16)' : 'transparent',
                  }}
                >
                  {/* Only the tag is clickable. The rest of the tile must stay
                      transparent to clicks, or the overlay steals play/pause
                      and seeking from the video's own controls. */}
                  <button
                    type="button"
                    onClick={() => onSelectZone(id)}
                    title={`Select ${id} — ${ZONE_LABELS[id]}`}
                    style={{ ...tileTagStyle, background: accent }}
                  >
                    {id}
                  </button>
                  {/* Per-tile frame-difference level */}
                  <span style={motionTrackStyle}>
                    <span
                      style={{
                        display: 'block',
                        height: '100%',
                        width: `${motion * 100}%`,
                        background: NEO.violet,
                      }}
                    />
                  </span>
                </div>
              );
            })}
          </div>

          <span style={cornerStyle}>
            CAM · {warming ? 'BUILDING REFERENCE' : reading.status}
          </span>
          <span style={disclaimerStyle}>NO DETECTOR RUNNING · IMAGE CHECKS ONLY</span>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 44, color: '#648b99', fontWeight: 200, lineHeight: 1 }}>⊕</div>
          <h3 style={{ fontFamily: MONO, fontSize: 12, margin: '12px 0 6px', color: NEO.ink }}>
            No video selected
          </h3>
          <p style={{ fontFamily: MONO, fontSize: 9, color: NEO.grey, margin: 0, lineHeight: 1.6 }}>
            Choose a sample clip or upload one. Playback runs the per-tile image checks;
            it does not start crowd analysis.
          </p>
        </div>
      )}
    </div>
  );
}

const stageStyle = {
  position: 'relative',
  background: 'radial-gradient(ellipse at center, #dfe4e7, #c9ced2)',
  border: `2px solid ${NEO.ink}`,
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
  minHeight: 180,
};

const gridStyle = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gridTemplateRows: 'repeat(3, 1fr)',
  // Leave the native video controls reachable along the bottom edge.
  paddingBottom: 34,
  pointerEvents: 'none',
};

const tileStyle = {
  position: 'relative',
  border: '1px solid',
  borderStyle: 'dashed',
  padding: 0,
  // Never intercept a click meant for the video underneath.
  pointerEvents: 'none',
  transition: 'background 0.2s ease',
};

const tileTagStyle = {
  position: 'absolute',
  top: 2,
  left: 2,
  border: 'none',
  fontFamily: MONO,
  fontSize: 7,
  fontWeight: 900,
  color: NEO.surface,
  padding: '2px 4px',
  letterSpacing: '0.04em',
  cursor: 'pointer',
  pointerEvents: 'auto',
};

const motionTrackStyle = {
  position: 'absolute',
  left: 2,
  right: 2,
  bottom: 2,
  height: 3,
  background: 'rgba(0,0,0,0.25)',
  overflow: 'hidden',
};

const cornerStyle = {
  position: 'absolute',
  top: 8,
  right: 8,
  fontFamily: MONO,
  fontSize: 9,
  fontWeight: 'bold',
  color: NEO.surface,
  background: NEO.ink,
  padding: '4px 7px',
  pointerEvents: 'none',
};

const disclaimerStyle = {
  position: 'absolute',
  bottom: 38,
  right: 8,
  fontFamily: MONO,
  fontSize: 7,
  fontWeight: 900,
  letterSpacing: '0.06em',
  color: NEO.ink,
  background: NEO.amber,
  padding: '3px 6px',
  pointerEvents: 'none',
};
