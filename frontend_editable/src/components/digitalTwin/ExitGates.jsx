import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useZones } from '../../store/derived';
import { useVenueStore } from '../../store/useVenueStore';
import { EXIT_GATES } from '../../data/venueModel';
import { NEO, MONO, densityStep } from '../../theme';

const GATE_Z = 27;

/**
 * One egress gate. The ring pulses faster as the feeding zone's projected
 * occupancy rises; it reflects the zone reading only and does not model
 * throughput, gate width or actual queueing.
 */
function Gate({ gate, ratio, index }) {
  const ringRef = useRef(null);
  const known = ratio != null;
  const { color } = densityStep(ratio);
  const pulseSpeed = known ? 1.4 + Math.min(ratio, 2) * 1.6 : 0;

  useFrame(({ clock }) => {
    if (!ringRef.current || !known) return;
    const time = clock.getElapsedTime() * pulseSpeed + index * 0.4;
    ringRef.current.scale.setScalar(1 + Math.sin(time) * 0.2);
    ringRef.current.material.opacity = 0.4 + Math.sin(time) * 0.3;
  });

  return (
    <group position={[gate.x, 0, 0]}>
      {/* Gate pad */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.56, 0]} receiveShadow>
        <planeGeometry args={[4.6, 5]} />
        <meshStandardMaterial color={known ? '#3f4448' : '#5a5f63'} roughness={0.95} />
      </mesh>

      {/* Turnstile posts */}
      {[-1.7, 1.7].map((x) => (
        <mesh key={x} castShadow position={[x, 0.05, 0]}>
          <boxGeometry args={[0.34, 1.2, 0.34]} />
          <meshStandardMaterial color={NEO.ink} metalness={0.7} roughness={0.3} />
        </mesh>
      ))}

      {/* Status bar spanning the gate */}
      <mesh position={[0, 0.62, 0]}>
        <boxGeometry args={[3.4, 0.18, 0.18]} />
        <meshStandardMaterial
          color={known ? color : NEO.grey}
          emissive={known ? color : '#000000'}
          emissiveIntensity={known ? 0.9 : 0}
        />
      </mesh>

      {known && (
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
          <ringGeometry args={[1.5, 2.0, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/** The south egress line: canopy, support columns and six gates. */
export default function ExitGates() {
  const zones = useZones();
  const visible = useVenueStore((state) => state.overlays.gates);
  const byId = new Map(zones.map((zone) => [zone.id, zone]));

  const open = zones.filter((zone) => zone.id.startsWith('R3') && zone.ratio != null).length;
  const known = open > 0;

  if (!visible) return null;

  return (
    <group position={[0, 0, GATE_Z]}>
      {/* Canopy */}
      <mesh position={[0, 4.4, 0]} castShadow>
        <boxGeometry args={[30, 0.22, 5]} />
        <meshStandardMaterial color="#3A4046" metalness={0.6} roughness={0.4} />
      </mesh>
      {[-14, -7, 0, 7, 14].map((x) => (
        <mesh key={x} position={[x, 2.2, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.16, 4.6, 8]} />
          <meshStandardMaterial color={NEO.ink} metalness={0.95} roughness={0.1} />
        </mesh>
      ))}

      {EXIT_GATES.map((gate, index) => (
        <Gate key={gate.id} gate={gate} index={index} ratio={byId.get(gate.zone)?.ratio ?? null} />
      ))}

      <Html position={[0, 6.1, 0]} center pointerEvents="none" distanceFactor={46}>
        <div style={labelStyle}>
          EGRESS LINE — {known ? `${EXIT_GATES.length} GATES MONITORED` : 'NO ZONE PROJECTION'}
        </div>
      </Html>
    </group>
  );
}

const labelStyle = {
  background: NEO.surface,
  border: `2px solid ${NEO.ink}`,
  padding: '4px 10px',
  fontFamily: MONO,
  fontSize: '10px',
  fontWeight: 'bold',
  color: NEO.ink,
  whiteSpace: 'nowrap',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  boxShadow: `2px 2px 0px 0px ${NEO.ink}`,
};
