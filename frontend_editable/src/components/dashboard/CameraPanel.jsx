import { useState, useEffect } from 'react';
import { useVenueStore, selectObservation, selectStale, isDemo } from '../../store/useVenueStore';
import { useMetrics } from '../../store/derived';
import { Panel, StatCard, ProvenanceTag } from './primitives';
import { NEO, MONO } from '../../theme';

const OVERLAY_NAMES = ['Detections', 'Trajectories', 'Optical flow', 'Zones', 'Forecasts'];

const METRIC_MAX = {
  'Detected heads': 400,
  'Processing FPS': 30,
};

/**
 * Camera observation: local video preview plus the six headline metrics.
 * Local preview never starts analysis, and the overlay toggles stay disabled
 * until synchronised overlay data exists.
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

  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState('');

  useEffect(() => {
    if (!file) {
      setFileUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const tone = demo ? 'simulated' : stale ? 'missing' : 'observed';

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

      {/* Video stage */}
      <div style={stageStyle}>
        {fileUrl ? (
          <video src={fileUrl} controls style={{ width: '100%', maxHeight: 300, background: '#000' }} />
        ) : (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 44, color: '#648b99', fontWeight: 200, lineHeight: 1 }}>⊕</div>
            <h3 style={{ fontFamily: MONO, fontSize: 12, margin: '12px 0 6px', color: NEO.ink }}>
              {demo ? 'Camera preview' : 'Awaiting connected video'}
            </h3>
            <p style={{ fontFamily: MONO, fontSize: 9, color: NEO.grey, margin: 0 }}>
              Choose a video to preview locally.
            </p>
          </div>
        )}
        <span style={cornerStyle}>CAM · {fileUrl ? 'LOCAL PREVIEW' : 'NO STREAM'}</span>
      </div>

      <div style={controlsRowStyle}>
        <label style={fileButtonStyle}>
          Choose video
          <input
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
        </label>
        {file && (
          <button type="button" onClick={() => setFile(null)} style={clearStyle}>
            Clear
          </button>
        )}
        <span style={{ fontFamily: MONO, fontSize: 9, color: NEO.grey, overflowWrap: 'anywhere' }}>
          {file ? file.name : 'Local preview does not start analysis'}
        </span>
      </div>

      {/* Overlay toggles — still unconnected to synchronized data */}
      <div style={overlayRowStyle}>
        {OVERLAY_NAMES.map((name) => (
          <label
            key={name}
            title="Requires synchronized backend overlay data"
            style={{ display: 'flex', alignItems: 'center', gap: 4, color: NEO.grey }}
          >
            <input type="checkbox" disabled />
            {name}
          </label>
        ))}
        <small style={{ color: NEO.grey }}>Video overlays not connected</small>
      </div>

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
      </div>
    </Panel>
  );
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

const stageStyle = {
  position: 'relative',
  aspectRatio: '16 / 9',
  background: 'radial-gradient(ellipse at center, #dfe4e7, #c9ced2)',
  border: `2px solid ${NEO.ink}`,
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
};

const cornerStyle = {
  position: 'absolute',
  top: 10,
  left: 10,
  fontFamily: MONO,
  fontSize: 9,
  fontWeight: 'bold',
  color: NEO.surface,
  background: NEO.ink,
  padding: '4px 7px',
};

const controlsRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  marginTop: 10,
};

const fileButtonStyle = {
  border: `2px solid ${NEO.ink}`,
  background: NEO.surface,
  color: NEO.ink,
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 'bold',
  padding: '6px 10px',
  cursor: 'pointer',
  boxShadow: `2px 2px 0px 0px ${NEO.ink}`,
};

const clearStyle = { ...fileButtonStyle, boxShadow: 'none' };

const overlayRowStyle = {
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
  borderTop: `1px solid ${NEO.line}`,
  paddingTop: 10,
  marginTop: 10,
  fontFamily: MONO,
  fontSize: 9,
};

const timestampStyle = {
  fontFamily: MONO,
  fontSize: 9,
  color: NEO.grey,
  marginTop: 10,
  overflowWrap: 'anywhere',
};
