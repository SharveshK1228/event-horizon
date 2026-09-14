import { useEffect, useRef, useState } from 'react';
import { useVenueStore, selectObservation, selectStale, isDemo } from '../../store/useVenueStore';
import { useMetrics } from '../../store/derived';
import useVideoAnalysis from '../../hooks/useVideoAnalysis';
import { CHANGED_TILES } from '../../lib/videoSignals';
import { isTimelineScenario } from '../../data/crowdTimeline';
import { Panel, StatCard, ProvenanceTag } from './primitives';
import SourcePicker from './SourcePicker';
import VideoStage from './VideoStage';
import { NEO, MONO } from '../../theme';

const METRIC_MAX = {
  'Detected heads': 3000,
  'Processing FPS': 30,
};

const QUALITY_TONE = {
  'REFERENCE-LIKE': NEO.green,
  DEGRADED: NEO.red,
  'WARMING UP': NEO.amber,
  UNAVAILABLE: NEO.grey,
  'NO VIDEO': NEO.grey,
};

/**
 * Camera observation: the video, the checks that genuinely run over it, and
 * the six headline metrics.
 *
 * The panel holds two kinds of number at once and must never let them blur.
 * The per-tile image checks are **observed** — they are computed in this
 * browser from these frames, using the same definitions as the Python
 * pipeline. The crowd counts beside them are **simulated**, because no
 * detector or tracker exists in this application. Loading a real crowd video
 * does not change that, and the panel states it wherever the video appears.
 */
export default function CameraPanel() {
  const demo = useVenueStore(isDemo);
  const metrics = useMetrics();
  const observation = useVenueStore(selectObservation);
  const stale = useVenueStore(selectStale);
  const cameras = useVenueStore((state) => state.snapshot?.cameras);
  const cameraId = useVenueStore((state) => state.cameraId);
  const setCameraId = useVenueStore((state) => state.setCameraId);
  const status = useVenueStore((state) => state.status);
  const scenario = useVenueStore((state) => state.scenario);
  const selectedZone = useVenueStore((state) => state.selectedZone);
  const setSelectedZone = useVenueStore((state) => state.setSelectedZone);
  const syncVideo = useVenueStore((state) => state.syncVideo);
  const toggleSyncVideo = useVenueStore((state) => state.toggleSyncVideo);
  const syncFromVideo = useVenueStore((state) => state.syncFromVideo);

  const videoRef = useRef(null);
  const [source, setSource] = useState(null);
  const reading = useVideoAnalysis(videoRef, source?.id || null);

  // Revoke object URLs for local files so the blob is not retained.
  useEffect(() => {
    const url = source?.origin === 'local' ? source.url : null;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [source]);

  const tone = demo ? 'simulated' : stale ? 'missing' : 'observed';
  const qualityColor = QUALITY_TONE[reading.status] || NEO.grey;

  return (
    <Panel
      title="Camera observation"
      tag={demo ? 'SIMULATED ANALYSIS' : stale ? 'STALE / UNVERIFIED' : 'BACKEND EVIDENCE'}
      tone={tone}
    >
      {/* Camera selector */}
      <div style={selectorRowStyle}>
        <label style={{ fontFamily: MONO, fontSize: 9, color: NEO.grey, letterSpacing: '0.1em' }}>
          CAMERA
          <select
            value={demo ? 'demo' : cameraId}
            onChange={(event) => setCameraId(event.target.value)}
            disabled={demo}
            style={selectStyle}
          >
            {demo ? (
              <option value="demo">Camera 01 / Main concourse</option>
            ) : (
              <>
                <option value="">Select / first available</option>
                {(cameras || []).map((camera) => (
                  <option key={camera.camera_id} value={camera.camera_id}>
                    {camera.name} — {camera.zone}
                  </option>
                ))}
              </>
            )}
          </select>
        </label>
        <ProvenanceTag tone={tone}>
          {demo ? 'SIMULATED INPUT' : status?.source_id || 'NO SOURCE'}
        </ProvenanceTag>
      </div>

      <SourcePicker selected={source} onSelect={setSource} />

      <VideoStage
        videoRef={videoRef}
        src={source?.url || ''}
        reading={reading}
        selectedZone={selectedZone}
        onSelectZone={setSelectedZone}
        onTimeUpdate={(event) =>
          syncFromVideo(event.currentTarget.currentTime, event.currentTarget.duration)
        }
      />

      {/* What the browser actually measured on these frames */}
      {source && (
        <div style={observedBoxStyle}>
          <div style={observedHeadStyle}>
            <span>▸ IMAGE CHECKS ON THIS CLIP</span>
            <ProvenanceTag tone="observed">OBSERVED IN BROWSER</ProvenanceTag>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <StatCard
              label="Visibility reference"
              value={reading.status === 'WARMING UP' ? `${Math.round(reading.progress * 100)}%` : reading.status}
              color={qualityColor}
              max={100}
              note={reading.status === 'WARMING UP' ? 'BUILDING FROM FIRST 3 s' : 'RELATIVE TO REFERENCE'}
            />
            <StatCard
              label="Changed tiles"
              value={reading.status === 'WARMING UP' ? null : `${reading.changed}/9`}
              color={reading.changed >= CHANGED_TILES ? NEO.red : NEO.green}
              max={9}
              note={`DEGRADED AT ${CHANGED_TILES}`}
            />
            <StatCard
              label="Frame difference"
              value={reading.motion.length ? mean(reading.motion).toFixed(1) : null}
              color={NEO.violet}
              max={24}
              note="PIXEL CHANGE, NOT PERSON MOTION"
            />
          </div>

          <p style={observedNoteStyle}>
            Contrast, sharpness and clipped-pixel fraction per tile, compared against a median
            reference built from the first three seconds — the same definitions{' '}
            <code style={codeStyle}>crowd_signals.QualityReference</code> uses. Frame difference is
            absolute pixel change between samples: camera shake and lighting register here too, so
            it is never reported as person motion.{' '}
            <strong style={{ color: NEO.ink }}>
              No detector or tracker runs on this clip, so no count below comes from it.
            </strong>
          </p>
        </div>
      )}

      {/* Timeline handover */}
      {source && (
        <label style={syncRowStyle}>
          <input type="checkbox" checked={syncVideo} onChange={toggleSyncVideo} />
          <span>
            Drive the simulated crowd timeline from this clip's playhead
            {!isTimelineScenario(scenario) && (
              <em style={{ color: NEO.grey }}> — select a crowd timeline scenario to use this</em>
            )}
          </span>
        </label>
      )}

      {/* Headline metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
        {metrics.map((metric) => (
          <StatCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            color={metric.source === 'observed' ? NEO.green : metric.source === 'simulated' ? NEO.amber : NEO.grey}
            max={METRIC_MAX[metric.label] || 100}
            note={metric.source === 'observed' ? 'BACKEND FIELD' : metric.source === 'simulated' ? 'SIMULATED' : 'UNVERIFIED'}
          />
        ))}
      </div>

      <div style={timestampStyle}>
        Observation time: {observation?.received_at || (demo ? 'Simulated — no capture time' : 'Unavailable')}
        {reading.sampledAt != null && ` · clip position ${reading.sampledAt.toFixed(1)} s`}
      </div>
    </Panel>
  );
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / (values.length || 1);
}


const selectorRowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  flexWrap: 'wrap',
  marginBottom: 12,
};

const selectStyle = {
  marginLeft: 8,
  fontFamily: MONO,
  fontSize: 10,
  padding: '5px 6px',
  border: `2px solid ${NEO.ink}`,
  background: NEO.surface,
  color: NEO.ink,
};

const observedBoxStyle = {
  marginTop: 12,
  padding: 10,
  border: `2px solid ${NEO.green}`,
  borderRadius: 3,
  background: '#F6FFF9',
};

const observedHeadStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  marginBottom: 8,
  fontFamily: MONO,
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: '0.1em',
  color: NEO.grey,
};

const observedNoteStyle = {
  fontFamily: MONO,
  fontSize: 8,
  lineHeight: 1.8,
  color: NEO.grey,
  margin: '9px 0 0',
};

const codeStyle = {
  background: NEO.bg,
  padding: '1px 3px',
  borderRadius: 2,
  fontSize: 8,
};

const syncRowStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 7,
  marginTop: 10,
  fontFamily: MONO,
  fontSize: 9,
  lineHeight: 1.6,
  color: NEO.ink,
  cursor: 'pointer',
};

const timestampStyle = {
  fontFamily: MONO,
  fontSize: 9,
  color: NEO.grey,
  marginTop: 10,
  overflowWrap: 'anywhere',
};
