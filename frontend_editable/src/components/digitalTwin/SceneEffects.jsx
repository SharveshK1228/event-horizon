import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useVenueStore } from '../../store/useVenueStore';
import { useForecast } from '../../store/derived';
import { NEO } from '../../theme';

/**
 * Lighting, fog and the operations hub mesh. Each evidence state gets a
 * distinct scene mood so a degraded view is legible before reading any text.
 */
export default function SceneEffects() {
  const { scene } = useThree();
  const forecast = useForecast();
  // Demo mode names the mood directly; backend mode maps the reported
  // visibility and motion fields onto the same five moods.
  const moodKey = useVenueStore((state) => {
    if (state.mode === 'demo') return state.scenario;
    const observation = state.status?.observation;
    if (!observation) return 'tracking';
    if (observation.visibility_status === 'degraded') return 'visibility';
    if (observation.motion_state === 'CAMERA MOVEMENT SUSPECTED') return 'camera';
    if (observation.tracking_state !== 'TRACK MOTION AVAILABLE') return 'tracking';
    if (observation.motion_state === 'UNUSUAL COLLECTIVE MOVEMENT') return 'collective';
    return 'clear';
  });

  const ambientRef = useRef(null);
  const sunRef = useRef(null);
  const alertLightRef = useRef(null);

  useEffect(() => {
    scene.background = new THREE.Color(NEO.ground);
    scene.fog = new THREE.FogExp2(NEO.ground, 0.002);
  }, [scene]);

  const MOODS = useMemo(
    () => ({
      clear: {
        background: new THREE.Color(NEO.ground),
        fogColor: new THREE.Color(NEO.ground),
        fogDensity: 0.003,
        ambientIntensity: 1.0,
        sunColor: new THREE.Color('#ffffff'),
        sunIntensity: 0.8,
      },
      tracking: {
        background: new THREE.Color('#D8DBDC'),
        fogColor: new THREE.Color('#D8DBDC'),
        fogDensity: 0.009,
        ambientIntensity: 0.7,
        sunColor: new THREE.Color('#cbd5e1'),
        sunIntensity: 0.35,
      },
      visibility: {
        background: new THREE.Color('#C9CDD0'),
        fogColor: new THREE.Color('#C9CDD0'),
        fogDensity: 0.015,
        ambientIntensity: 0.5,
        sunColor: new THREE.Color('#b8bec4'),
        sunIntensity: 0.25,
      },
      camera: {
        background: new THREE.Color('#E4DCCE'),
        fogColor: new THREE.Color('#E4DCCE'),
        fogDensity: 0.009,
        ambientIntensity: 0.85,
        sunColor: new THREE.Color('#FFE082'),
        sunIntensity: 0.6,
      },
      collective: {
        background: new THREE.Color('#EAD5C3'),
        fogColor: new THREE.Color('#EAD5C3'),
        fogDensity: 0.006,
        ambientIntensity: 1.1,
        sunColor: new THREE.Color('#FF8833'),
        sunIntensity: 1.1,
      },
      // Timeline scenarios: an end-of-event egress reads as late light, and the
      // crush timeline darkens further so the twin does not look calm while the
      // exit funnel is in the band the console is warning about.
      surge: {
        background: new THREE.Color('#E9DCC9'),
        fogColor: new THREE.Color('#E9DCC9'),
        fogDensity: 0.005,
        ambientIntensity: 1.0,
        sunColor: new THREE.Color('#FFB25E'),
        sunIntensity: 0.95,
      },
      crush: {
        background: new THREE.Color('#DCC4BC'),
        fogColor: new THREE.Color('#DCC4BC'),
        fogDensity: 0.008,
        ambientIntensity: 0.9,
        sunColor: new THREE.Color('#E2653C'),
        sunIntensity: 1.0,
      },
    }),
    [],
  );

  const mood = MOODS[moodKey] || MOODS.clear;
  const reviewing = forecast.status === 'REVIEW CONCENTRATION';
  const hubColor = forecast.status === 'UNAVAILABLE' ? NEO.grey : reviewing ? NEO.red : NEO.green;

  useFrame((state) => {
    const time = state.clock.getElapsedTime();

    if (ambientRef.current) {
      ambientRef.current.intensity = THREE.MathUtils.lerp(
        ambientRef.current.intensity,
        mood.ambientIntensity,
        0.03,
      );
    }

    if (sunRef.current) {
      sunRef.current.intensity = THREE.MathUtils.lerp(sunRef.current.intensity, mood.sunIntensity, 0.03);
      sunRef.current.color.lerp(mood.sunColor, 0.03);
    }

    if (scene.background instanceof THREE.Color) {
      scene.background.lerp(mood.background, 0.03);
    }

    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.lerp(mood.fogColor, 0.03);
      scene.fog.density = THREE.MathUtils.lerp(scene.fog.density, mood.fogDensity, 0.03);
    }

    if (alertLightRef.current) {
      alertLightRef.current.intensity = reviewing ? (Math.sin(time * 6) * 0.4 + 0.6) * 3.0 : 0;
    }
  });

  return (
    <group>
      <ambientLight ref={ambientRef} color="#ffffff" intensity={1.0} />
      <directionalLight
        ref={sunRef}
        castShadow
        position={[24, 38, 24]}
        color="#ffffff"
        intensity={0.8}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={140}
        shadow-camera-left={-46}
        shadow-camera-right={46}
        shadow-camera-top={46}
        shadow-camera-bottom={-46}
      />

      {/* Operations hub — the physical counterpart of this console */}
      <group position={[0, 0, -34]}>
        <mesh receiveShadow position={[0, -0.6, 0]}>
          <boxGeometry args={[9, 0.1, 6]} />
          <meshStandardMaterial color={NEO.metal} roughness={0.9} />
        </mesh>
        <mesh castShadow position={[0, 0.4, 0]}>
          <boxGeometry args={[3.2, 1.8, 2.2]} />
          <meshStandardMaterial color={NEO.ink} metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.5, 1.11]}>
          <planeGeometry args={[2.4, 1.0]} />
          <meshBasicMaterial color="#111827" />
        </mesh>
        <mesh position={[0, 1.5, 0]}>
          <sphereGeometry args={[0.16, 16, 16]} />
          <meshBasicMaterial color={hubColor} />
        </mesh>
        {/* Mast carrying the venue-wide reference antenna */}
        <mesh castShadow position={[2.4, 2.2, -1.4]}>
          <cylinderGeometry args={[0.07, 0.12, 5.2]} />
          <meshStandardMaterial color={NEO.ink} metalness={0.95} roughness={0.2} />
        </mesh>
        <mesh castShadow position={[2.4, 4.6, -1.4]}>
          <boxGeometry args={[2.6, 0.08, 0.08]} />
          <meshStandardMaterial color={NEO.ink} metalness={0.95} roughness={0.2} />
        </mesh>
      </group>

      <pointLight ref={alertLightRef} color={NEO.red} intensity={0} distance={40} position={[0, 6, 6]} />
    </group>
  );
}
