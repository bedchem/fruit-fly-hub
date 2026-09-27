/**
 * Can the fly's right foreleg do everything the gamer asks of it?
 *
 *   node tools/check-game-reach.mjs
 *
 * First the fixed points: the mouse at the corners of its travel, and the
 * slam. Then every gesture (src/game/gamerGestures.js), played through on a
 * real Gamer and sampled every frame: the foreleg's target is resolved the
 * way GameScene.jsx does it — the can where the take holds it, the headset,
 * eye and face where the head is turned, the body leaning as the take leans
 * it — and measured against the leg's reach with the body posed that way.
 * The IK clamps anything past 1, which shows as a tarsus hovering short.
 */
import { reachFraction } from '../src/scene/layout.js';
import { solveHeadLook } from '../src/scene/flyRig.js';
import { mousePoint, SLAM_TOP, SLAM_DESK, HEAD_POINTS, SCREEN_GAZE } from '../src/scene/gameLayout.js';
import {
  canPose, keyboardPose, resolveAnchors, handTarget, mouseAnchor, posedReach, worldToPosed, headToWorld,
} from '../src/scene/gameGestures.js';
import { N_ANCHORS } from '../src/game/gamerGestures.js';
import { Gamer, PHASES } from '../src/game/gamer.js';

const LIMIT = 0.97;
let ok = true;

const fixed = [];
for (const dx of [-0.02, 0.02]) for (const dz of [-0.06, 0, 0.06]) for (const click of [0, 1]) fixed.push([`mouse dx ${dx} dz ${dz} click ${click}`, mousePoint(dx, dz, click)]);
fixed.push(['slam wind-up', SLAM_TOP], ['slam on the desk', SLAM_DESK]);
for (const [name, p] of fixed) {
  const r = reachFraction(p);
  if (r >= LIMIT) ok = false;
  if (r >= 0.9 || name.startsWith('slam')) console.log(`${name.padEnd(34)} ${(r * 100).toFixed(0)}% of reach`);
}

// --- every gesture, frame by frame ------------------------------------------------
const KINDS = ['sip', 'checkCan', 'headset', 'groom', 'facepalm', 'headShake', 'fistPump', 'deskTap', 'drum', 'fidget', 'stretch',
  'fixKeyboard', 'slam', 'double', 'mouseSlam', 'shove', 'handsUp', 'headsetGrip'];
const RAGE = new Set(['slam', 'double', 'mouseSlam', 'shove', 'handsUp', 'headsetGrip']);
const worst = [];
for (const kind of KINDS) {
  for (const variant of kind === 'sip' ? [{}, { empty: true }] : [{}]) {
    const g = new Gamer({ seed: 7, now: () => 0 });
    g.game = 'lol'; g.startMatch(); g.match.calmFor = 1e9;
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    const G = g.gestures;
    if (kind === 'fixKeyboard') { G.kb.x = 0.03; G.kb.z = -0.05; G.kb.yaw = 0.12; }
    if (RAGE.has(kind)) { g.slamCooldown = 0; g.startSlam(kind); } else G.play(kind, { ...G.idleOpts(kind), ...variant });
    const src = { mouse: [0, 0, 0], can: null, cup: [0, 0, 0], eye: [0, 0, 0], face: [0, 0, 0], kb: null, body: null };
    const can = canPose({}), kb = keyboardPose(null), anchors = new Float64Array(N_ANCHORS * 3), target = [0, 0, 0];
    let max = 0, at = 0;
    for (let f = 0; f < 60 * 8 && (G.act || f < 5); f++) {
      g.update(1 / 60);
      mouseAnchor(g.hand, Math.max(g.pressDepth, G.press), src.mouse);
      canPose({ lift: G.ch.canLift, tilt: G.ch.canTilt, shake: G.ch.canShake, crush: Math.max(G.can.crushed, G.ch.crush), t: G.clock }, can);
      keyboardPose(G.kb, kb);
      src.can = can.grip; src.kb = kb.corner; src.body = g.body;
      // the head looking at the screen, as it mostly does
      const q = solveHeadLook(worldToPosed(SCREEN_GAZE, g.body));
      headToWorld(HEAD_POINTS.cup, q, g.body, src.cup);
      headToWorld(HEAD_POINTS.eye, q, g.body, src.eye);
      headToWorld(HEAD_POINTS.face, q, g.body, src.face);
      resolveAnchors(src, anchors);
      handTarget(G.hand, anchors, target);
      const r = posedReach(target, g.body) * g.grip + 0 * (1 - g.grip);
      if (r > max) { max = r; at = f / 60; }
      if (g.phase !== PHASES.PLAYING) break;
    }
    const name = `${kind}${variant.empty ? ' (empty can)' : ''}`;
    worst.push([name, max, at]);
    if (max >= LIMIT) ok = false;
  }
}
for (const [name, max, at] of worst) console.log(`gesture ${name.padEnd(24)} worst ${(max * 100).toFixed(0)}% of reach${max >= LIMIT ? `  OUT OF REACH at ${at.toFixed(2)} s` : ''}`);
console.log(ok ? 'mouse, desk and every gesture reachable' : 'OUT OF REACH — adjust gameLayout.js / the takes in gamerGestures.js');
process.exitCode = ok ? 0 : 1;
