import { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useVenueStore } from '../../store/useVenueStore';
import { ZONE_SPAN } from '../../data/venueModel';
import { NEO, MONO, densityStep, UNKNOWN_COLOR } from '../../theme';

const MIN_HEIGHT = 0.45;
const MAX_HEIGHT = 9;

/**
 * One cell of the 3x3 concentration grid. The column height encodes projected
 * occupancy relative to the configured threshold; a zone with no projection
 * renders as a flat unknown slab rather than a zero-height reading.
 *
 * @param {{zone: {id:string,label:string,x:number,z:number,projected:number|null,current:number|null,ratio:number|null,flagged:boolean}}} props
 */
export default function ZoneTile({ zone }) {
  const groupRef = useRef(null);
  const columnRef = useRef(null);
  const glowRef = useRef(null);
  const [hovered, setHovered] = useState(false);

  const selectedZone = useVenueStore((state) => state.selectedZone);
  const setSelectedZone = useVenueStore((state) => state.setSelectedZone);
  const showDensity = useVenueStore((state) => state.overlays.density);

  const isSelected = selectedZone === zone.id;
  const known = zone.ratio != null;
  const { color, label } = densityStep(zone.ratio);

  const targetHeight = useMemo(() => {
    if (!known || !showDensity) return MIN_HEIGHT;
    return THREE.MathUtils.clamp(MIN_HEIGHT + zone.ratio * 3.4, MIN_HEIGHT, MAX_HEIGHT);
  }, [known, showDensity, zone.ratio]);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();

    if (groupRef.current) {
      const targetScale = isSelected ? 1.04 : hovered ? 1.02 : 1.0;
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, 1, targetScale), 0.15);
    }

    if (columnRef.current) {
      // Grow the column toward its target so threshold changes read as motion.
      const wobble = zone.flagged ? Math.sin(time * 3 + zone.x) * 0.12 : 0;
      const next = THREE.MathUtils.lerp(columnRef.current.scale.y, targetHeight + wobble, 0.08);
      columnRef.current.scale.y = next;
      columnRef.current.position.y = next / 2 - 0.55;
    }

    if (glowRef.current && zone.flagged) {
      const pulse = 1.0 + Math.sin(time * 4) * 0.08;
      glowRef.current.scale.set(pulse, pulse, pulse);
      glowRef.current.material.opacity = 0.22 + Math.sin(time * 4) * 0.1;
    }
  });

  const select = (event) => {
    event.stopPropagation();
    setSelectedZone(zone.id);
  };

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

  const inset = ZONE_SPAN - 0.6;

  return (
    <group ref={groupRef} position={[zone.x, 0, zone.z]}>
      {/* Floor tile — the click target for the whole zone */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.57, 0]}
        receiveShadow
        onClick={select}
        onPointerOver={enter}
        onPointerOut={leave}
      >
        <planeGeometry args={[inset, inset]} />
        <meshStandardMaterial
          color={known ? '#FFFFFF' : '#DEE1E4'}
          roughness={1.0}
          metalness={0}
          flatShading
          emissive={color}
          emissiveIntensity={isSelected ? 0.22 : hovered ? 0.1 : 0.04}
        />
      </mesh>

      {/* Tile border */}
      <lineSegments position={[0, -0.565, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(inset, inset)]} />
        <lineBasicMaterial color={isSelected ? NEO.ink : known ? color : UNKNOWN_COLOR} />
      </lineSegments>

      {/* Density column */}
      <mesh
        ref={columnRef}
        position={[0, 0, 0]}
        castShadow
        onClick={select}
        onPointerOver={enter}
        onPointerOut={leave}
      >
        <boxGeometry args={[inset * 0.34, 1, inset * 0.34]} />
        <meshStandardMaterial
          color={known ? color : UNKNOWN_COLOR}
          transparent
          opacity={known ? 0.66 : 0.28}
          roughness={0.85}
          flatShading
          emissive={known ? color : '#000000'}
          emissiveIntensity={isSelected ? 0.35 : 0.12}
        />
      </mesh>

      {/* Concentration pulse ring */}
      {zone.flagged && (
        <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.54, 0]}>
          <ringGeometry args={[inset * 0.4, inset * 0.48, 48]} />
          <meshBasicMaterial color={NEO.red} transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Selection base ring */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.545, 0]}>
          <ringGeometry args={[inset * 0.5, inset * 0.54, 48]} />
          <meshBasicMaterial color={NEO.ink} side={THREE.DoubleSide} />
        </mesh>
      )}

      {(isSelected || hovered) && (
        <Html position={[0, targetHeight + 1.2, 0]} center distanceFactor={42} pointerEvents="none">
          <div style={badgeStyle}>
            <span style={{ ...dotStyle, background: known ? color : UNKNOWN_COLOR }} />
            {zone.id} · {known ? `${zone.projected} @ HORIZON` : 'NO PROJECTION'}
            <span style={{ color: NEO.grey }}>{known ? label : 'UNVERIFIED'}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

const badgeStyle = {
  background: NEO.surface,
  color: NEO.ink,
  border: `2px solid ${NEO.ink}`,
  padding: '4px 8px',
  fontFamily: MONO,
  fontSize: '9px',
  fontWeight: 900,
  whiteSpace: 'nowrap',
  borderRadius: '2px',
  boxShadow: `2px 2px 0px 0px ${NEO.ink}`,
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const dotStyle = {
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  display: 'inline-block',
};
