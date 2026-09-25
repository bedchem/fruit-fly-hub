/**
 * Can the fly's right foreleg type, use the trackpad and hold the mug?
 *
 *   node tools/check-code-reach.mjs
 *
 * Prints the reach fraction for the keys it types on (with the typing
 * hunch), the trackpad, the palm rest and the mug's handle on the desk and
 * at the mouth (1 is the leg fully stretched; the IK clamps anything past 1,
 * which shows as a tarsus hovering short of where it should be). Keys out of
 * reach are listed: tapKeyFor() types those characters on the nearest key it
 * does reach.
 */
import { reachFraction, FLY } from '../src/scene/layout.js';
import {
  KEYS, TAP_KEYS, TYPING_POSE, MAX_REACH, keyPoint, padPoint, PALM_REST, MUG_GRIP, DRINK_GRIP,
} from '../src/scene/codeLayout.js';

let ok = true;
const row = (name, p, pose = FLY, limit = MAX_REACH) => {
  const r = reachFraction(p, pose);
  if (r >= limit) ok = false;
  console.log(`${name.padEnd(28)} ${(r * 100).toFixed(0)}% of reach`);
};

const typed = TAP_KEYS.map((k) => reachFraction(keyPoint(k), TYPING_POSE));
console.log(`keys typed on: ${TAP_KEYS.length} of ${KEYS.filter((k) => k.row > 0).length}, worst ${(Math.max(...typed) * 100).toFixed(0)}% of reach (hunched)`);
console.log(`out of reach, typed on a neighbour: ${KEYS.filter((k) => k.row > 0 && !TAP_KEYS.includes(k.label)).map((k) => k.label).join(' ') || 'none'}`);
if (TAP_KEYS.length < 20) ok = false;
for (const [u, v] of [[0, 0], [-1, -1], [1, 1], [-1, 1], [1, -1]]) row(`trackpad ${u},${v}`, padPoint(u, v, 1), TYPING_POSE);
row('palm rest', PALM_REST, TYPING_POSE);
row('mug handle, on the desk', MUG_GRIP, FLY, 0.97);
row('mug handle, at the mouth', DRINK_GRIP, FLY, 0.97);
console.log(ok ? 'keyboard, trackpad and mug reachable' : 'OUT OF REACH — move MACBOOK / MUG in codeLayout.js');
process.exitCode = ok ? 0 : 1;
