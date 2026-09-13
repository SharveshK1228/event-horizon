import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useVenueStore, selectObservation, isDemo } from '../../store/useVenueStore';
import { useForecast } from '../../store/derived';
import VenuePlaza from './VenuePlaza';
import CameraMasts from './CameraMasts';
import ExitGates from './ExitGates';
import CrowdParticles from './CrowdParticles';
import CrowdFlow from './CrowdFlow';
import SceneEffects from './SceneEffects';
import SignalOverlay from './SignalOverlay';
import ViewControls from '../dashboard/ViewControls';
import { NEO, MONO, HARD } from '../../theme';

const LEGEND = [
  { color: NEO.green, label: 'SPARSE' },
  { color: NEO.amber, label: 'BUILDING' },
  { color: NEO.orange, label: 'DENSE' },
  { color: NEO.red, label: 'CONCENTRATION' },
  { color: '#9AA3AE', label: 'NO PROJECTION' },
];

/**
 * Wraps the world so a suspected camera-movement finding is visible as an
 * unstable view rather than only as text.
 */
function UnstableView({ children }) {
  const groupRef = useRef(null);
  const unstable = useVenueStore((state) =>
    state.mode === 'demo'
      ? state.scenario === 'camera'
      : state.status?.observation?.motion_state === 'CAMERA MOVEMENT SUSPECTED',
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const time = clock.getElapsedTime();
    const amount = unstable ? 1 : 0;
    groupRef.current.position.x = Math.sin(time * 7.3) * 0.22 * amount;
    groupRef.current.position.y = Math.sin(time * 5.1) * 0.14 * amount;
    groupRef.current.rotation.z = Math.sin(time * 3.7) * 0.004 * amount;
  });

  return <group ref={groupRef}>{children}</group>;
}

/**
 * The 3D venue digital twin: plaza, analysed zone grid, cameras, egress line,
 * crowd markers and movement corridors, with floating operator overlays.
 */
export default function VenueScene() {
  const forecast = useForecast();
  const observation = useVenueStore(selectObservation);
  const demo = useVenueStore(isDemo);
  const horizon = useVenueStore((state) => state.horizon);

  const simulatedGrid = forecast.origin !== 'observed';
  const sourceLabel = demo
    ? 'SIMULATED SCENARIO'
    : observation?.source_id
      ? `SOURCE ${observation.source_id}`
      : 'NO SOURCE';

  return (
    <div style={stageStyle}>
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, pointerEvents: 'none' }}>
        <ViewControls />
      </div>

      <div style={{ position: 'absolute', top: 16, left: 250, zIndex: 10, display: 'flex', gap: '8px' }}>
        <div style={compassStyle} title="North is toward the top of the analysed region">
          N
        </div>
      </div>

      <Canvas shadows camera={{ position: [-48, 42, 55], fov: 42 }} gl={{ antialias: true, alpha: false }}>
        <SceneEffects />
        <UnstableView>
          <VenuePlaza />
          <CameraMasts />
          <ExitGates />
          <CrowdParticles />
          <CrowdFlow />
        </UnstableView>
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          maxPolarAngle={Math.PI / 2 - 0.05}
          minDistance={22}
          maxDistance={150}
          target={[0, 0, -2]}
        />
      </Canvas>

      {/* Legend */}
      <div style={legendStyle}>
        <div style={{ marginBottom: 5 }}>ZONE DENSITY @ +{horizon}s</div>
        {LEGEND.map((entry) => (
          <div key={entry.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <span style={{ width: 9, height: 9, background: entry.color, border: `1px solid ${NEO.ink}` }} />
            {entry.label}
          </div>
        ))}
      </div>

      {/* Provenance banner — the grid must never be mistaken for model output */}
      <div style={{ ...bannerStyle, borderColor: simulatedGrid ? NEO.amber : NEO.green }}>
        <strong style={{ color: simulatedGrid ? '#92400E' : '#14532D' }}>
          {simulatedGrid ? '⚠ ZONE GRID SIMULATED' : '● ZONE GRID FROM BACKEND'}
        </strong>
        <span>{forecast.status}</span>
        <span style={{ color: NEO.grey }}>{sourceLabel}</span>
      </div>

      <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 10, width: 300 }}>
        <SignalOverlay />
      </div>

      <div style={tipStyle}>DRAG TO ROTATE • SCROLL TO ZOOM • RIGHT-CLICK DRAG TO PAN • CLICK A ZONE</div>
    </div>
  );
}

const stageStyle = {
  position: 'relative',
  width: '100%',
  height: '100%',
  minHeight: '520px',
  background: NEO.ground,
  overflow: 'hidden',
};

const compassStyle = {
  width: 42,
  height: 42,
  borderRadius: '50%',
  border: HARD.border,
  background: NEO.surface,
  color: NEO.ink,
  fontFamily: MONO,
  fontSize: 14,
  fontWeight: 900,
  boxShadow: `3px 3px 0 ${NEO.ink}`,
  display: 'grid',
  placeItems: 'center',
};

const legendStyle = {
  position: 'absolute',
  top: 16,
  right: 16,
  zIndex: 10,
  background: NEO.surface,
  border: HARD.border,
  padding: '8px 10px',
  fontFamily: MONO,
  fontSize: 9,
  fontWeight: 'bold',
  color: NEO.ink,
  boxShadow: `3px 3px 0 ${NEO.ink}`,
};

const bannerStyle = {
  position: 'absolute',
  top: 152,
  right: 16,
  zIndex: 10,
  maxWidth: 240,
  background: NEO.surface,
  border: `2px solid ${NEO.amber}`,
  padding: '8px 10px',
  fontFamily: MONO,
  fontSize: 9,
  lineHeight: 1.5,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  boxShadow: `3px 3px 0 ${NEO.ink}`,
};

const tipStyle = {
  position: 'absolute',
  bottom: 16,
  right: 16,
  pointerEvents: 'none',
  background: NEO.surface,
  border: HARD.border,
  padding: '6px 12px',
  fontFamily: MONO,
  fontSize: 9,
  fontWeight: 'bold',
  color: NEO.ink,
  borderRadius: 4,
  letterSpacing: '0.05em',
  boxShadow: HARD.shadowSm,
};
