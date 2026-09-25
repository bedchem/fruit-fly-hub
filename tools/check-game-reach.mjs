/**
 * Can the fly's right foreleg work the mouse, and slam the desk?
 *
 *   node tools/check-game-reach.mjs
 *
 * Prints the reach fraction for every point the foreleg is sent to (1 is the
 * leg fully stretched); the IK clamps anything past 1, which shows as a
 * tarsus hovering short of where it should be.
 */
import { reachFraction } from '../src/scene/layout.js';
import { mousePoint, SLAM_TOP, SLAM_DESK } from '../src/scene/gameLayout.js';

const points = [];
for (const dx of [-0.02, 0.02]) {
  for (const dz of [-0.06, 0, 0.06]) {
    for (const click of [0, 1]) points.push([`mouse dx ${dx} dz ${dz} click ${click}`, mousePoint(dx, dz, click)]);
  }
}
points.push(['slam wind-up', SLAM_TOP], ['slam on the desk', SLAM_DESK]);

let ok = true;
for (const [name, p] of points) {
  const r = reachFraction(p);
  if (r >= 0.97) ok = false;
  console.log(`${name.padEnd(34)} ${(r * 100).toFixed(0)}% of reach`);
}
console.log(ok ? 'mouse and desk reachable' : 'OUT OF REACH — move MOUSE / SLAM_* in gameLayout.js');
process.exitCode = ok ? 0 : 1;
