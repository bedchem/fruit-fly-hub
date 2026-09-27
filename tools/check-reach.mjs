/**
 * Sanity-checks the seated fly's reach across candidate scales and yaws.
 * The foreleg should be working at roughly 60-80% of its span at rest: below
 * that it looks folded up, above it the IK runs out of arm mid-pull.
 */
import { SHOULDER, REACH } from '../src/scene/flyRig.js';
import parts from '../src/scene/parts.js';
const SEAT = [1.5435, 0.8027, -0.0089];
const OFFSET = [0.02, 0, 0.03];
const PULLED = -0.95;

const knobAt = (a) => {
  const [kx, ky, kz] = parts.lever.knobLocal;
  const [px, py, pz] = parts.lever.pivot;
  const c = Math.cos(a), s = Math.sin(a);
  return [px + kx * c - ky * s, py + kx * s + ky * c, pz + kz];
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

console.log('unit reach', REACH.toFixed(4), ' shoulder', SHOULDER.map(n => +n.toFixed(3)).join(', '));
console.log('knob rest  ', knobAt(0).map(n => +n.toFixed(3)).join(', '));
console.log('knob pulled', knobAt(PULLED).map(n => +n.toFixed(3)).join(', '));
console.log('');

// frontmost face of the cabinet the fly is playing (button ledge included)
const CABINET_FRONT_X = 1.03;
const HEAD_TIP = [0, 0.85, 0.791];   // frontmost point of the scan

console.log('scale  dx     yaw     rest  pulled  headX  clear');
for (const scale of [0.75, 0.8, 0.85, 0.9, 0.95]) {
  for (const dx of [0.02, 0.12, 0.22, 0.32]) {
    for (const yawOff of [-0.22]) {
      const a = -Math.PI / 2 + yawOff;
      const c = Math.cos(a), s = Math.sin(a);
      const pos = [SEAT[0] + dx, SEAT[1] + 0.0175 * scale, SEAT[2] + OFFSET[2]];
      const toWorld = (p) => {
        const q = p.map((v) => v * scale);
        return [pos[0] + q[0] * c + q[2] * s, pos[1] + q[1], pos[2] - q[0] * s + q[2] * c];
      };
      const shoulder = toWorld(SHOULDER);
      const head = toWorld(HEAD_TIP);
      const R = REACH * scale;
      const rest = dist(shoulder, knobAt(0)) / R;
      const pulled = dist(shoulder, knobAt(PULLED)) / R;
      const clear = head[0] - CABINET_FRONT_X;
      const ok = rest > 0.6 && rest < 0.88 && clear > 0.04;
      console.log(
        `${scale.toFixed(2)}   ${dx.toFixed(2)}  ${yawOff.toFixed(2)}   ` +
        `${(100 * rest).toFixed(0).padStart(3)}%  ${(100 * pulled).toFixed(0).padStart(4)}%  ` +
        `${head[0].toFixed(2)}  ${clear >= 0 ? '+' : ''}${clear.toFixed(2)}${ok ? '   <-- good' : ''}`);
    }
  }
}
