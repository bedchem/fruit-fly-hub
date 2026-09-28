/**
 * Pieces several rooms share: the studio reflections and the stool. Kept out
 * of BarScene.jsx on purpose — importing that file preloads the whole bar
 * interior (1.2 MB), which only the bar needs.
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as THREE from 'three';
import { STOOL } from './layout.js';

/** Soft studio reflections for metals and glass. */
export function StudioProbe() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.3;
    return () => { env.texture.dispose(); pmrem.dispose(); scene.environment = null; };
  }, [gl, scene]);
  return null;
}

const BRASS = { color: '#c9954b', roughness: 0.3, metalness: 0.9 };

/** A plain bar stool under the fly, where the casino's stool stood; `offset` moves it for a second fly. */
export function Stool({ offset = [0, 0, 0] }) {
  const x = STOOL.origin[0] + offset[0];
  const z = STOOL.origin[2] + offset[2];
  const seatY = STOOL.seatCenter[1];
  const r = STOOL.seatRadius;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, seatY - 0.035, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r * 0.96, 0.07, 40]} />
        <meshStandardMaterial color="#7a1f1c" roughness={0.5} />
      </mesh>
      <mesh position={[0, seatY - 0.09, 0]} castShadow>
        <cylinderGeometry args={[r * 0.55, r * 0.35, 0.05, 32]} />
        <meshStandardMaterial {...BRASS} />
      </mesh>
      <mesh position={[0, (seatY - 0.1) / 2, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, seatY - 0.1, 16]} />
        <meshStandardMaterial {...BRASS} />
      </mesh>
      <mesh position={[0, 0.3, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[r * 0.8, 0.012, 10, 40]} />
        <meshStandardMaterial {...BRASS} />
      </mesh>
      <mesh position={[0, 0.012, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[r * 1.05, r * 1.15, 0.024, 40]} />
        <meshStandardMaterial {...BRASS} />
      </mesh>
    </group>
  );
}
