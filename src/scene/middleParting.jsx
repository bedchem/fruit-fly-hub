/**
 * Damian's hair: a middle parting, in strands.
 *
 * Every strand is a tapered tube along a curve that starts on the parting —
 * a line front to back over the middle of the head — lifts a little for
 * volume, falls out over the side and ends in a tip that flicks outwards.
 * The front ones are the curtains: longer, swept forward, hanging past the
 * eyes. All of them are merged into one geometry, so the whole head of hair
 * is one draw call.
 *
 * In the fly's own head space (the head spans x −0.22..0.15, y 0.64..1.09,
 * z 0.54..0.65: broad and tall, thin front to back). Fly.jsx turns whatever
 * is in the head slot with the head.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** The middle of the head, and the line of the parting on top of it. */
const CX = -0.039;
const TOP = 1.088;
const BACK = 0.47;
const FRONT = 0.69;

const lerp = (a, b, t) => a + (b - a) * t;
const TUBULAR = 12;
const RADIAL = 6;

/** One strand: a tube along `points`, `r0` thick at the root and `r1` at the tip, in one colour. */
function strand(points, r0, r1, color) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.5);
  // built at radius 1, then every ring pulled in to its own radius: that is the taper
  const g = new THREE.TubeGeometry(curve, TUBULAR, 1, RADIAL, false);
  const pos = g.attributes.position;
  const c = new THREE.Vector3();
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i <= TUBULAR; i++) {
    const k = i / TUBULAR;
    curve.getPointAt(k, c);
    const r = lerp(r0, r1, Math.pow(k, 1.5));
    // darker at the root, where the strands lie on each other
    const shade = 0.7 + 0.3 * k;
    for (let j = 0; j <= RADIAL; j++) {
      const n = i * (RADIAL + 1) + j;
      pos.setXYZ(n, c.x + (pos.getX(n) - c.x) * r, c.y + (pos.getY(n) - c.y) * r, c.z + (pos.getZ(n) - c.z) * r);
      colors[n * 3] = color.r * shade; colors[n * 3 + 1] = color.g * shade; colors[n * 3 + 2] = color.b * shade;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function buildHair() {
  const dark = new THREE.Color('#3a2212');
  const mid = new THREE.Color('#563419');
  const light = new THREE.Color('#7a4d26');
  const parts = [];
  const N = 13;
  for (const s of [-1, 1]) {
    for (let k = 0; k < N; k++) {
      const t = k / (N - 1);                       // 0 at the back of the head, 1 at the forehead
      const wob = Math.sin(k * 2.31 + s) * 0.5;    // so no two strands are alike
      const z0 = lerp(BACK, FRONT, t);
      // back strands sweep back, front ones forward: the curtains
      const sweep = t > 0.55 ? 0.13 * (t - 0.55) / 0.45 : -0.1 * (0.55 - t) / 0.55;
      const tipY = lerp(0.9, 0.7, Math.pow(t, 1.3)) + wob * 0.02;
      const lift = 0.05 + 0.02 * Math.sin(Math.PI * t) + wob * 0.008;
      const flick = 0.035 + wob * 0.02;
      parts.push(strand([
        [CX + s * 0.004, TOP, z0],
        [CX + s * 0.085, TOP + lift, z0 + sweep * 0.2],
        [CX + s * 0.19, TOP - 0.04, z0 + sweep * 0.5],
        [CX + s * 0.245, (TOP + tipY) / 2 - 0.01, z0 + sweep * 0.8],
        [CX + s * (0.25 + flick * 0.4), tipY + 0.03, z0 + sweep],
        [CX + s * (0.25 + flick), tipY - 0.01, z0 + sweep + 0.01],
      ], t > 0.7 ? 0.043 : 0.037, 0.009, [dark, mid, dark, light][k % 4]));
    }
    // the two locks that make it a curtain: from the front of the parting, out over the forehead, down past the eye
    for (const [i, reach] of [[0, 1], [1, 0.8]]) {
      parts.push(strand([
        [CX + s * 0.006, TOP - 0.004, FRONT - 0.01 - i * 0.02],
        [CX + s * (0.06 + i * 0.02), TOP + 0.03, FRONT + 0.055 * reach],
        [CX + s * (0.15 + i * 0.015), TOP - 0.075, FRONT + 0.1 * reach],
        [CX + s * (0.215 + i * 0.01), 0.88, FRONT + 0.095 * reach],
        [CX + s * 0.225, 0.77 + i * 0.04, FRONT + 0.07 * reach],
        [CX + s * 0.26, 0.71 + i * 0.05, FRONT + 0.06 * reach],
      ], 0.046, 0.01, i ? mid : light));
    }
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

export function MiddleParting() {
  const hair = useMemo(buildHair, []);
  useEffect(() => () => hair.dispose(), [hair]);
  return (
    <group>
      {/* the scalp under it, so no gap between strands shows the head */}
      <mesh position={[CX, 0.965, (BACK + FRONT) / 2 + 0.005]} scale={[1.04, 0.62, 0.66]} castShadow>
        <sphereGeometry args={[0.205, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#2c190d" roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={hair} castShadow>
        <meshStandardMaterial vertexColors roughness={0.42} metalness={0.05} />
      </mesh>
    </group>
  );
}
