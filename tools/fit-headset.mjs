/**
 * Measures the head the gamer's headset has to fit, and checks the one in
 * gameLayout.js does.
 *
 *   node tools/fit-headset.mjs
 *
 * The head is every vertex the rig turns fully with the neck (headWeight
 * above 0.9, the same mask Fly.jsx uses). Prints its extent in the fly's own
 * model space, then checks the headset against it: the band has to clear the
 * top of the head, each cup has to sit just outside its side, and the
 * microphone has to end in front of the mouthparts rather than inside them.
 */
import { loadMesh } from './lib-raster.mjs';
import { headWeight } from '../src/scene/flyRig.js';
import { HEADSET } from '../src/scene/gameLayout.js';
import { MOUTH_LOCAL } from '../src/scene/barLayout.js';

const url = (p) => new URL(p, import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '');
const { P } = loadMesh(url('../assets/models/fly.glb'));
const lo = [Infinity, Infinity, Infinity];
const hi = [-Infinity, -Infinity, -Infinity];
let n = 0;
for (let i = 0; i < P.length; i += 3) {
  if (headWeight(P[i], P[i + 1], P[i + 2]) <= 0.9) continue;
  n++;
  for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
}
const f = (v) => v.map((x) => x.toFixed(3)).join(', ');
console.log(`head: ${n} vertices, x ${lo[0].toFixed(3)}..${hi[0].toFixed(3)}, y ${lo[1].toFixed(3)}..${hi[1].toFixed(3)}, z ${lo[2].toFixed(3)}..${hi[2].toFixed(3)}`);
console.log(`centre ${f(lo.map((v, k) => (v + hi[k]) / 2))}`);

let ok = true;
const check = (label, pass, detail) => { if (!pass) ok = false; console.log(`${pass ? 'ok  ' : 'FAIL'} ${label.padEnd(30)} ${detail}`); };
const bandTop = HEADSET.center[1] + HEADSET.bandRadius * HEADSET.bandStretch;
check('band clears the top', bandTop - HEADSET.tube > hi[1], `band inner top ${(bandTop - HEADSET.tube).toFixed(3)} vs head ${hi[1].toFixed(3)}`);
check('band spans the head', HEADSET.center[0] - HEADSET.bandRadius <= lo[0] + 0.03 && HEADSET.center[0] + HEADSET.bandRadius >= hi[0] - 0.03,
  `band x ${(HEADSET.center[0] - HEADSET.bandRadius).toFixed(3)}..${(HEADSET.center[0] + HEADSET.bandRadius).toFixed(3)}`);
const [right, left] = HEADSET.cupX;
check('right cup outside the head', right + HEADSET.cupDepth / 2 >= lo[0] - 0.02 && right < lo[0], `cup at x ${right.toFixed(3)}, head side ${lo[0].toFixed(3)}`);
check('left cup outside the head', left - HEADSET.cupDepth / 2 <= hi[0] + 0.02 && left > hi[0], `cup at x ${left.toFixed(3)}, head side ${hi[0].toFixed(3)}`);
check('cups at head height', HEADSET.cupY > lo[1] && HEADSET.cupY < hi[1], `cup y ${HEADSET.cupY.toFixed(3)}`);
const tip = HEADSET.mic[HEADSET.mic.length - 1];
const d = Math.hypot(tip[0] - MOUTH_LOCAL[0], tip[1] - MOUTH_LOCAL[1], tip[2] - MOUTH_LOCAL[2]);
check('mic ends by the mouthparts', d > 0.03 && d < 0.16 && tip[2] > MOUTH_LOCAL[2], `tip ${f(tip)}, ${d.toFixed(3)} from the mouth`);
console.log(ok ? 'the headset fits' : 'ADJUST HEADSET in src/scene/gameLayout.js');
process.exitCode = ok ? 0 : 1;
