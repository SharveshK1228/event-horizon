import { useRef, useMemo, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useVenueStore, selectFlowVector } from '../../store/useVenueStore';
import { useZones } from '../../store/derived';
import { ZONE_SPAN } from '../../data/venueModel';
import { densityStep } from '../../theme';

const PER_ZONE_CAP = 26; // instances shown per zone; counts above this saturate
const MAX_INSTANCES = 9 * PER_ZONE_CAP;
const DRIFT_SPEED = 1.6;

const dummy = new THREE.Object3D();
const tint = new THREE.Color();

/**
 * Instanced markers standing in for tracked people. Positions are illustrative:
 * the backend supplies per-cell counts, not per-person coordinates, so these
 * show occupancy and direction only — never individual identities.
 */
export default function CrowdParticles() {
  const meshRef = useRef(null);
  const zones = useZones();
  const flow = useVenueStore(selectFlowVector);
  const visible = useVenueStore((state) => state.overlays.trajectories);

  // One slot per possible instance, seeded deterministically so the scene does
  // not reshuffle on every render.
  const slots = useMemo(() => {
    const half = (ZONE_SPAN - 2) / 2;
    return Array.from({ length: MAX_INSTANCES }, (_, index) => {
      const seed = Math.sin(index * 12.9898) * 43758.5453;
      const seedB = Math.sin(index * 78.233) * 24634.6345;
      return {
        zoneIndex: Math.floor(index / PER_ZONE_CAP),
        slot: index % PER_ZONE_CAP,
        offsetX: ((seed - Math.floor(seed)) * 2 - 1) * half,
        offsetZ: ((seedB - Math.floor(seedB)) * 2 - 1) * half,
        half,
      };
    });
  }, []);

  const progress = useRef(new Float32Array(MAX_INSTANCES));

  useLayoutEffect(() => {
    if (!meshRef.current) return;
    meshRef.current.frustumCulled = false;
    // Start empty so unfilled slots never flash at the world origin.
    meshRef.current.count = 0;
  }, []);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !visible) return;

    const [dx, dz] = flow || [0, 0];
    const moving = Boolean(flow);
    let cursor = 0;

    for (const slot of slots) {
      const zone = zones[slot.zoneIndex];
      // Only render slots backed by an actual eligible-track count.
      const count = zone?.current == null ? 0 : Math.min(PER_ZONE_CAP, Math.round(zone.current));
      if (!zone || slot.slot >= count) continue;

      const index = cursor;
      cursor += 1;

      if (moving) {
        progress.current[index] = (progress.current[index] + delta * DRIFT_SPEED) % (slot.half * 2);
      }
      const travel = moving ? progress.current[index] - slot.half : 0;

      const x = zone.x + wrap(slot.offsetX + dx * travel, slot.half);
      const z = zone.z + wrap(slot.offsetZ + dz * travel, slot.half);

      dummy.position.set(x, -0.24, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, tint.set(densityStep(zone.ratio).color));
    }

    mesh.count = cursor;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  if (!visible) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_INSTANCES]} castShadow>
      <cylinderGeometry args={[0.26, 0.26, 0.72, 6]} />
      <meshStandardMaterial roughness={0.9} flatShading />
    </instancedMesh>
  );
}

/** Keeps a drifting marker inside its zone by wrapping at the tile edge. */
function wrap(value, half) {
  const span = half * 2;
  return ((((value + half) % span) + span) % span) - half;
}
