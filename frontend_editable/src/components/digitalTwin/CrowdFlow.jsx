import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useVenueStore, selectObservation, isDemo } from '../../store/useVenueStore';
import { useForecast } from '../../store/derived';
import { NEO } from '../../theme';

/**
 * A single animated dashed tube. Dashes scroll along the curve to show
 * direction of travel; the tube is hidden entirely when the flow is inactive
 * so that "no established direction" reads as nothing, not as a still tube.
 */
function FlowTube({ curve, color, thickness, speed, active }) {
  const materialRef = useRef(null);

  const dashTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 16;
    const context = canvas.getContext('2d');
    context.fillStyle = '#000000';
    context.fillRect(0, 0, 512, 16);
    context.fillStyle = '#ffffff';
    for (let x = 0; x < 512; x += 48) {
      context.fillRect(x, 3, 30, 10); // hard edges, no feathering
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(10, 1);
    return texture;
  }, []);

  useFrame((_, delta) => {
    if (!materialRef.current || !active) return;
    dashTexture.offset.x -= speed * delta * 60;
  });

  const safeThickness = thickness > 0 ? thickness : 0.01;

  return (
    <group visible={active && thickness > 0}>
      <mesh>
        <tubeGeometry args={[curve, 90, safeThickness * 2.8, 8, false]} />
        <meshBasicMaterial color={color} transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>
      <mesh>
        <tubeGeometry args={[curve, 90, safeThickness, 8, false]} />
        <meshBasicMaterial ref={materialRef} color={color} map={dashTexture} transparent />
      </mesh>
    </group>
  );
}

/**
 * Crowd movement corridors across the venue. Nothing is drawn unless the
 * evidence establishes a direction: scene-motion-only states render a single
 * violet corridor labelled as optical flow rather than person movement.
 */
export default function CrowdFlow() {
  const forecast = useForecast();
  const observation = useVenueStore(selectObservation);
  const demo = useVenueStore(isDemo);
  const scenario = useVenueStore((state) => state.scenario);
  const visible = useVenueStore((state) => state.overlays.flow);

  const curves = useMemo(
    () => ({
      inbound: new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 1.4, -32),
        new THREE.Vector3(0, 4.5, -20),
        new THREE.Vector3(0, 3.4, -14.4),
        new THREE.Vector3(0, 2.6, 0),
      ]),
      egress: new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 2.6, 0),
        new THREE.Vector3(0, 3.6, 14.4),
        new THREE.Vector3(0, 2.2, 22),
        new THREE.Vector3(0, 1.2, 28),
      ]),
      lateral: new THREE.CatmullRomCurve3([
        new THREE.Vector3(-14.4, 2.4, 0),
        new THREE.Vector3(-7, 4.4, 1.2),
        new THREE.Vector3(7, 4.4, -1.2),
        new THREE.Vector3(14.4, 2.4, 0),
      ]),
      reversal: new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 2.2, 20),
        new THREE.Vector3(0, 5.2, 12),
        new THREE.Vector3(0, 5.6, 0),
        new THREE.Vector3(0, 4.0, -12),
      ]),
      sceneMotion: new THREE.CatmullRomCurve3([
        new THREE.Vector3(-22, 6.5, -6),
        new THREE.Vector3(0, 7.5, -2),
        new THREE.Vector3(22, 6.5, 2),
      ]),
    }),
    [],
  );

  const motionState = demo
    ? { clear: 'OBSERVED MOTION', collective: 'UNUSUAL COLLECTIVE MOVEMENT' }[scenario] ||
      (scenario === 'tracking' ? 'FLOW AVAILABLE; PERSON MOTION UNAVAILABLE' : 'UNRELIABLE')
    : observation?.motion_state;

  const projected = forecast.status !== 'UNAVAILABLE';
  const reversing = motionState === 'UNUSUAL COLLECTIVE MOVEMENT';
  const sceneMotionOnly = motionState === 'FLOW AVAILABLE; PERSON MOTION UNAVAILABLE';

  const config = {
    inbound: { active: projected && !reversing, thickness: 0.14, speed: 0.024, color: NEO.orange },
    egress: {
      active: projected,
      thickness: reversing ? 0.08 : 0.16,
      speed: reversing ? 0.01 : 0.028,
      color: reversing ? NEO.amber : NEO.green,
    },
    lateral: { active: projected, thickness: 0.09, speed: 0.02, color: NEO.violet },
    reversal: { active: projected && reversing, thickness: 0.2, speed: 0.042, color: NEO.red },
    sceneMotion: { active: sceneMotionOnly, thickness: 0.07, speed: 0.03, color: NEO.violet },
  };

  if (!visible) return null;

  return (
    <group>
      <FlowTube curve={curves.inbound} {...config.inbound} />
      <FlowTube curve={curves.egress} {...config.egress} />
      <FlowTube curve={curves.lateral} {...config.lateral} />
      <FlowTube curve={curves.reversal} {...config.reversal} />
      <FlowTube curve={curves.sceneMotion} {...config.sceneMotion} />
    </group>
  );
}
