import { useRef, useMemo, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useVenueStore, selectFlowVector } from '../../store/useVenueStore';
import { useZones, useForecast } from '../../store/derived';
import { ZONE_SPAN, speedFactor } from '../../data/venueModel';
import { EGRESS_FIELD, isTimelineScenario } from '../../data/crowdTimeline';
import { densityBand, densityStep } from '../../theme';

/**
 * Instances shown per zone. One instance is one eligible track, so this caps
 * how dense a zone can *look*, never what it reports: counts above the cap
 * saturate the render while the telemetry keeps the real number.
 */
const PER_ZONE_CAP = 800;
const MAX_INSTANCES = 9 * PER_ZONE_CAP;

/** Free walking speed in world units (metres) per second. */
const FREE_SPEED = 1.34;
/** Half-width of the area inside a zone tile that markers may occupy. */
const REACH = (ZONE_SPAN - 1.2) / 2;
/** How fast the rendered population catches up with a changing count. */
const POPULATION_LERP = 2.2;

const dummy = new THREE.Object3D();
const tint = new THREE.Color();

/**
 * Instanced markers standing in for tracked people.
 *
 * Positions are illustrative — the backend supplies per-cell counts, not
 * per-person coordinates, so these show occupancy, direction and pace, never
 * individual identities. What *is* modelled is the relationship every crowd
 * obeys and every operator needs to see: as a zone packs, walking speed falls
 * toward a shuffle, lateral jostle grows, and the mass compresses against the
 * downstream edge instead of spreading out evenly.
 */
export default function CrowdParticles() {
  const meshRef = useRef(null);
  const zones = useZones();
  const forecast = useForecast();
  const flow = useVenueStore(selectFlowVector);
  const scenario = useVenueStore((state) => state.scenario);
  const visible = useVenueStore((state) => state.overlays.trajectories);

  const timeline = isTimelineScenario(scenario);
  const counterflow = timeline ? forecast.counterflow || 0 : 0;

  // One slot per possible instance, seeded deterministically so the scene does
  // not reshuffle on every render. Each slot carries its own pace, phase and
  // build so the crowd reads as people rather than a lattice of identical pins.
  const slots = useMemo(
    () =>
      Array.from({ length: MAX_INSTANCES }, (_, index) => {
        const a = fract(Math.sin(index * 12.9898) * 43758.5453);
        const b = fract(Math.sin(index * 78.233) * 24634.6345);
        const c = fract(Math.sin(index * 39.425) * 17231.1234);
        const d = fract(Math.sin(index * 93.989) * 51237.8765);
        return {
          // Start position split into along-field and across-field offsets, so
          // the crowd can be advanced and compressed along its line of travel.
          along: (a * 2 - 1) * REACH,
          across: (b * 2 - 1) * REACH,
          pace: 0.78 + c * 0.44, // personal walking speed, ±22% of free speed
          phase: d * Math.PI * 2, // jostle phase, so nobody sways in unison
          build: 0.86 + c * 0.3, // marker height variation
          rand: d, // decides who turns first in a counterflow
        };
      }),
    [],
  );

  const progress = useRef(new Float32Array(MAX_INSTANCES));
  const population = useRef(new Float32Array(9));

  useLayoutEffect(() => {
    if (!meshRef.current) return;
    meshRef.current.frustumCulled = false;
    // Start empty so unfilled slots never flash at the world origin.
    meshRef.current.count = 0;
  }, []);

  useFrame(({ clock }, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !visible) return;

    const time = clock.getElapsedTime();
    const step = Math.min(delta, 0.1); // a backgrounded tab must not teleport the crowd
    const [globalX, globalZ] = flow || [0, 0];
    const moving = Boolean(flow);
    let cursor = 0;

    for (let zoneIndex = 0; zoneIndex < zones.length; zoneIndex += 1) {
      const zone = zones[zoneIndex];
      // Only render slots backed by an actual eligible-track count.
      const target = zone?.current == null ? 0 : Math.min(PER_ZONE_CAP, Math.round(zone.current));
      population.current[zoneIndex] +=
        (target - population.current[zoneIndex]) * Math.min(1, step * POPULATION_LERP);
      const count = Math.round(population.current[zoneIndex]);
      if (!zone || count <= 0) continue;

      // Area density exists only for a simulated grid. Under a backend forecast
      // there is no area, so the markers fall back to the threshold ramp the
      // zone columns already use rather than implying a density nobody measured.
      const density = zone.currentDensity ?? 0;
      // Walking speed falls as the crowd packs, which is the single most
      // legible sign of a concourse in trouble.
      const pace = speedFactor(density);
      // Packed crowds sway against each other; free-flowing ones barely do.
      const jostle = 0.05 + (1 - pace) * 0.5;
      // And they compress toward the edge they are trying to leave through
      // instead of staying evenly spread across the zone.
      const compression = Math.min(0.55, Math.max(0, (density - 1.6) / 6));

      const [fieldX, fieldZ] = timeline ? EGRESS_FIELD[zone.id] : [globalX, globalZ];
      // Keep a diagonally-oriented crowd inside its own tile.
      const reach = REACH / (Math.abs(fieldX) + Math.abs(fieldZ) || 1);
      const span = reach * 2;
      const heading = Math.atan2(fieldX, fieldZ);
      const band = zone.currentDensity == null ? densityStep(zone.ratio) : densityBand(density);
      const base = zoneIndex * PER_ZONE_CAP;
      const drifting = moving || timeline;

      for (let n = 0; n < count; n += 1) {
        // Travel is stored against the slot, not the draw order, so people do
        // not jump when the population around them changes.
        const slotIndex = base + n;
        const slot = slots[slotIndex];
        cursor += 1;

        // Counterflow: part of the crowd turns back into the people behind it.
        const reversed = counterflow > 0 && slot.rand < counterflow;
        const direction = reversed ? -1 : 1;

        if (drifting) {
          const moved =
            progress.current[slotIndex] + step * FREE_SPEED * pace * slot.pace * direction;
          progress.current[slotIndex] = Math.abs(moved) > span ? moved % span : moved;
        }
        // Distance along the line of travel, wrapped inside the tile…
        let along = wrap(slot.along + progress.current[slotIndex], reach);
        // …then squeezed toward the downstream edge as density rises.
        along = reach - (reach - along) * (1 - compression);
        const across = slot.across * (1 - compression * 0.3) + Math.sin(time * 2.4 + slot.phase) * jostle;

        // Perpendicular of (fieldX, fieldZ) is (-fieldZ, fieldX).
        dummy.position.set(
          zone.x + fieldX * along - fieldZ * across,
          -0.24,
          zone.z + fieldZ * along + fieldX * across,
        );
        dummy.rotation.set(0, reversed ? heading + Math.PI : heading, 0);
        dummy.scale.set(1, slot.build, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(cursor - 1, dummy.matrix);
        mesh.setColorAt(cursor - 1, tint.set(band.color));
      }
    }

    mesh.count = cursor;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  if (!visible) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_INSTANCES]} castShadow>
      <cylinderGeometry args={[0.22, 0.22, 0.72, 6]} />
      <meshStandardMaterial roughness={0.9} flatShading />
    </instancedMesh>
  );
}

/** Keeps a drifting marker inside its zone by wrapping at the tile edge. */
function wrap(value, half) {
  const span = half * 2;
  return ((((value + half) % span) + span) % span) - half;
}

function fract(value) {
  return value - Math.floor(value);
}
