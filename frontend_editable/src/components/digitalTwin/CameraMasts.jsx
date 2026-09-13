import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useVenueStore, selectObservation, isDemo } from '../../store/useVenueStore';
import { CAMERA_MASTS } from '../../data/venueModel';
import { NEO, MONO } from '../../theme';

const MAST_HEIGHT = 6.4;

/**
 * One camera mast with an indicative field-of-view cone. The cone shows which
 * zones a mast is pointed at; it is venue geometry, not a calibrated frustum.
 */
function CameraMast({ mast, active, state, onSelect }) {
  const lensRef = useRef(null);
  const [hovered, setHovered] = useState(false);

  const statusColor =
    state === 'degraded' ? NEO.red : state === 'unverified' ? NEO.amber : NEO.green;

  useFrame(({ clock }) => {
    if (!lensRef.current) return;
    const time = clock.getElapsedTime();
    // Unstable views sweep, matching a camera-movement finding.
    lensRef.current.rotation.y = state === 'unverified' ? Math.sin(time * 1.4) * 0.18 : 0;
  });

  const enter = (event) => {
    event.stopPropagation();
    setHovered(true);
    document.body.style.cursor = 'pointer';
  };

  const leave = (event) => {
    event.stopPropagation();
    setHovered(false);
    document.body.style.cursor = 'auto';
  };

  return (
    <group position={[mast.x, 0, mast.z]} rotation={[0, mast.rotation, 0]}>
      {/* Base pad */}
      <mesh receiveShadow position={[0, -0.55, 0]}>
        <boxGeometry args={[2, 0.12, 2]} />
        <meshStandardMaterial color={NEO.metal} roughness={0.9} />
      </mesh>

      {/* Pole */}
      <mesh castShadow position={[0, MAST_HEIGHT / 2 - 0.5, 0]}>
        <cylinderGeometry args={[0.1, 0.16, MAST_HEIGHT, 10]} />
        <meshStandardMaterial color={NEO.ink} metalness={0.9} roughness={0.25} />
      </mesh>

      {/* Camera head */}
      <group
        ref={lensRef}
        position={[0, MAST_HEIGHT - 0.6, 0]}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(mast.id);
        }}
        onPointerOver={enter}
        onPointerOut={leave}
      >
        <mesh castShadow>
          <boxGeometry args={[0.7, 0.5, 1.2]} />
          <meshStandardMaterial
            color={active ? NEO.surface : NEO.ink}
            metalness={0.6}
            roughness={0.3}
            emissive={active ? statusColor : '#000000'}
            emissiveIntensity={active ? 0.3 : hovered ? 0.15 : 0}
          />
        </mesh>
        <mesh position={[0, 0, 0.66]}>
          <cylinderGeometry args={[0.17, 0.17, 0.12, 16]} />
          <meshStandardMaterial color="#111827" metalness={0.9} roughness={0.1} />
        </mesh>
        <mesh position={[0, 0.32, 0]}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshBasicMaterial color={statusColor} />
        </mesh>

        {/* Indicative field of view */}
        <mesh position={[0, -2.6, 4.6]} rotation={[Math.PI / 2.35, 0, 0]}>
          <coneGeometry args={[4.6, 11, 4, 1, true]} />
          <meshBasicMaterial
            color={statusColor}
            transparent
            opacity={active ? 0.12 : 0.05}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </group>

      {(active || hovered) && (
        <Html position={[0, MAST_HEIGHT + 0.9, 0]} center distanceFactor={42} pointerEvents="none">
          <div style={labelStyle}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
            {mast.label}
            <span style={{ color: NEO.grey }}>{active ? 'SELECTED' : 'AVAILABLE'}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

/** All venue camera masts, with the console's selected camera highlighted. */
export default function CameraMasts() {
  const visible = useVenueStore((state) => state.overlays.cameras);
  const cameraId = useVenueStore((state) => state.cameraId);
  const setCameraId = useVenueStore((state) => state.setCameraId);
  const observation = useVenueStore(selectObservation);
  const demo = useVenueStore(isDemo);
  const scenario = useVenueStore((state) => state.scenario);

  const visibilityState = demo
    ? { visibility: 'degraded', camera: 'unverified', tracking: 'unverified' }[scenario] || 'reference-like'
    : observation?.visibility_status || 'unverified';

  // With no explicit selection the first mast stands in for "first available",
  // mirroring how the console resolves an empty camera selection.
  const activeId = cameraId || CAMERA_MASTS[0].id;

  if (!visible) return null;

  return (
    <group>
      {CAMERA_MASTS.map((mast) => (
        <CameraMast
          key={mast.id}
          mast={mast}
          active={mast.id === activeId}
          state={mast.id === activeId ? visibilityState : 'reference-like'}
          onSelect={setCameraId}
        />
      ))}
    </group>
  );
}

const labelStyle = {
  background: NEO.surface,
  border: `2px solid ${NEO.ink}`,
  padding: '4px 9px',
  fontFamily: MONO,
  fontSize: '9px',
  fontWeight: 900,
  color: NEO.ink,
  whiteSpace: 'nowrap',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  boxShadow: `2px 2px 0px 0px ${NEO.ink}`,
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};
