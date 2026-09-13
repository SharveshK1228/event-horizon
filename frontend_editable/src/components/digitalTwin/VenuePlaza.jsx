import { useMemo } from 'react';
import { useZones } from '../../store/derived';
import { useVenueStore } from '../../store/useVenueStore';
import { STRUCTURES, TREE_POSITIONS, ZONE_SPAN, ZONE_GAP } from '../../data/venueModel';
import ZoneTile from './ZoneTile';
import { NEO } from '../../theme';

const PITCH = ZONE_SPAN + ZONE_GAP;
const LANE = PITCH / 2; // walkway centreline between zone rows and columns
const PLAZA_EDGE = PITCH * 1.5 + 1.2;

/**
 * The venue floor: ground plane, walkways, foliage, perimeter structures and
 * the 3x3 analysed grid rendered as clickable zone tiles.
 */
export default function VenuePlaza() {
  const zones = useZones();

  const dashes = useMemo(() => {
    const marks = [];
    for (let step = -PLAZA_EDGE + 2; step <= PLAZA_EDGE - 2; step += 3.2) {
      marks.push(step);
    }
    return marks;
  }, []);

  return (
    <group>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.605, 0]} receiveShadow>
        <planeGeometry args={[140, 140]} />
        <meshStandardMaterial color={NEO.ground} roughness={1.0} metalness={0.0} flatShading />
      </mesh>

      {/* Cross walkways between zone tiles */}
      {[-LANE, LANE].map((lane) => (
        <group key={`lane-${lane}`}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[lane, -0.6, 0]} receiveShadow>
            <planeGeometry args={[ZONE_GAP, PLAZA_EDGE * 2]} />
            <meshStandardMaterial color={NEO.walkway} roughness={0.9} flatShading />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, lane]} receiveShadow>
            <planeGeometry args={[PLAZA_EDGE * 2, ZONE_GAP]} />
            <meshStandardMaterial color={NEO.walkway} roughness={0.9} flatShading />
          </mesh>
        </group>
      ))}

      {/* Perimeter approach roads */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, -PLAZA_EDGE - 4]} receiveShadow>
        <planeGeometry args={[96, 3]} />
        <meshStandardMaterial color={NEO.walkway} roughness={0.9} flatShading />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, PLAZA_EDGE + 4]} receiveShadow>
        <planeGeometry args={[96, 3]} />
        <meshStandardMaterial color={NEO.walkway} roughness={0.9} flatShading />
      </mesh>

      {/* Gold centre dashes */}
      {[-LANE, LANE].map((lane) =>
        dashes.map((step) => (
          <group key={`dash-${lane}-${step}`}>
            <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[lane, -0.595, step]}>
              <planeGeometry args={[1.3, 0.09]} />
              <meshBasicMaterial color={NEO.dash} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[step, -0.595, lane]}>
              <planeGeometry args={[1.3, 0.09]} />
              <meshBasicMaterial color={NEO.dash} />
            </mesh>
          </group>
        )),
      )}

      {/* Analysed zone grid */}
      {zones.map((zone) => (
        <ZoneTile key={zone.id} zone={zone} />
      ))}

      {/* Perimeter structures — stands, stalls and service blocks.
          Each block is lifted so its base sits on the ground plane. */}
      {STRUCTURES.map((block) => {
        const height = 2.4 * block.scale;
        return (
          <group key={block.id} position={[block.x, height / 2 - 0.6, block.z]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[2.6, height, 2.6]} />
              <meshStandardMaterial color={NEO.surface} roughness={0.9} metalness={0} flatShading />
            </mesh>
            <mesh position={[0, height / 2 + 0.15, 0]} castShadow>
              <boxGeometry args={[2.9, 0.3, 2.9]} />
              <meshStandardMaterial
                color={block.z >= 0 ? NEO.roofSouth : NEO.roofNorth}
                roughness={0.9}
                flatShading
              />
            </mesh>
          </group>
        );
      })}

      {/* Foliage lining the walkways */}
      {TREE_POSITIONS.map((position, index) => (
        <group key={`tree-${index}`} position={position}>
          <mesh position={[0, -0.1, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.06, 0.9, 8]} />
            <meshStandardMaterial color={NEO.ink} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.55, 0]} castShadow>
            <sphereGeometry args={[0.4, 12, 12]} />
            <meshStandardMaterial color={NEO.foliage} roughness={1.0} flatShading />
          </mesh>
        </group>
      ))}

      <gridHelper args={[140, 70, '#E0E0E0', NEO.ground]} position={[0, -0.598, 0]} />
    </group>
  );
}
