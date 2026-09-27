/**
 * Where the gamer's gestures go: the geometry behind src/game/gamerGestures.js.
 *
 * That module says "the foreleg is 60% on the can, 40% on the mouse, 3 cm
 * up"; this one knows where the can and the mouse are this frame, where the
 * can is on its way up to the mouthparts, where the keyboard has been
 * shoved to, and where a point on the leaning body ends up. Pure arrays, no
 * three.js: GameScene.jsx calls it every frame and tools/check-game-reach.mjs
 * sweeps every gesture through it to prove the foreleg reaches all of it.
 *
 * World frame as in gameLayout.js: Y up, the fly faces −X, its right is −Z.
 */
import { FLY } from './layout.js';
import { NECK, SHOULDER, REACH, quatRotate } from './flyRig.js';
import {
  CAN, CAN_DRINK, CAN_GRIP_TURN, KEYBOARD, DESK_TAP, SLAM_TOP, SLAM_DESK, BODY_POINTS, mousePoint,
} from './gameLayout.js';
import { ANCHOR, N_ANCHORS, POSE_SIZE } from '../game/gamerGestures.js';

const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ------------------------------------------------------------ the posed body

/**
 * The fly's model space to the world, with the body leaning as `body` says
 * (pitch, yaw, roll in radians; rise in metres) — the same 'YXZ' order the
 * Fly group turns in, so this is where Fly.jsx puts the point.
 */
export function posedToWorld([x, y, z], body = null, out = [0, 0, 0]) {
  const pitch = FLY.pitch + (body?.pitch ?? 0);
  const yaw = FLY.rotationY + (body?.yaw ?? 0);
  const roll = body?.roll ?? 0;
  // roll about Z, then pitch about X, then yaw about Y
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const x1 = x * cr - y * sr, y1 = x * sr + y * cr;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const s = FLY.scale;
  out[0] = FLY.position[0] + (x1 * cy + z2 * sy) * s;
  out[1] = FLY.position[1] + (body?.rise ?? 0) + y2 * s;
  out[2] = FLY.position[2] + (-x1 * sy + z2 * cy) * s;
  return out;
}

/** The world to the leaning fly's model space: the inverse of posedToWorld. */
export function worldToPosed([x, y, z], body = null, out = [0, 0, 0]) {
  const pitch = FLY.pitch + (body?.pitch ?? 0);
  const yaw = FLY.rotationY + (body?.yaw ?? 0);
  const roll = body?.roll ?? 0;
  const s = FLY.scale;
  const dx = (x - FLY.position[0]) / s, dy = (y - FLY.position[1] - (body?.rise ?? 0)) / s, dz = (z - FLY.position[2]) / s;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const x1 = dx * cy - dz * sy, z2 = dx * sy + dz * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y1 = dy * cp + z2 * sp, z1 = -dy * sp + z2 * cp;
  const cr = Math.cos(roll), sr = Math.sin(roll);
  out[0] = x1 * cr + y1 * sr;
  out[1] = -x1 * sr + y1 * cr;
  out[2] = z1;
  return out;
}

/** How far the foreleg stretches to a world point with the body leaning so, 0..1 of its reach. */
export function posedReach(world, body = null) {
  const p = worldToPosed(world, body);
  return Math.hypot(p[0] - SHOULDER[0], p[1] - SHOULDER[1], p[2] - SHOULDER[2]) / REACH;
}

/** A point on the head (model space) with the head turned by quaternion `q`, in the world. */
export function headToWorld(p, q, body = null, out = [0, 0, 0]) {
  const o = quatRotate(q, [p[0] - NECK[0], p[1] - NECK[1], p[2] - NECK[2]]);
  return posedToWorld([NECK[0] + o[0], NECK[1] + o[1], NECK[2] + o[2]], body, out);
}

// ------------------------------------------------------------------ the can

const rotY = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
const rotZ = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; };

/** How much of its height a crushed can keeps. */
export const CRUSHED_HEIGHT = 0.58;

/**
 * Where the can is: `lift` 0 on the desk .. 1 at the mouthparts, `tilt`
 * tipping its top towards the mouth, `shake` rattling it by the head, and
 * `crush` how far it is crumpled. Fills `out` with its base, its turn (yaw)
 * and tip (tilt) — rotation order 'YZX', tilt about −Z — the opening in its
 * lid, where the foreleg holds it, and the top of it for the eyes.
 */
export function canPose({ lift = 0, tilt = 0, shake = 0, crush = 0, t = 0 }, out = null) {
  const o = out ?? { base: [0, 0, 0], yaw: 0, tilt: 0, opening: [0, 0, 0], grip: [0, 0, 0], top: [0, 0, 0], height: CAN.height };
  const k = clamp01(lift);
  // it rises first, then comes in: never scraped over the mouse
  const inK = smooth(k);
  const up = Math.sin(k * Math.PI) * 0.05;
  for (let i = 0; i < 3; i++) o.base[i] = CAN.base[i] + (CAN_DRINK.base[i] - CAN.base[i]) * (i === 1 ? k : inK);
  o.base[1] += up;
  const rattle = shake * Math.sin(t * Math.PI * 2 * 7.5);
  o.base[2] += rattle * 0.012;
  o.base[1] += shake * Math.abs(Math.sin(t * Math.PI * 2 * 7.5 + 0.8)) * 0.006;
  o.yaw = CAN.yaw + (CAN_DRINK.yaw - CAN.yaw) * inK;
  o.tilt = tilt + rattle * 0.22;
  o.height = CAN.height * (1 - (1 - CRUSHED_HEIGHT) * clamp01(crush));
  const local = (p) => rotY(rotZ(p, -o.tilt), o.yaw);
  const put = (dst, p) => { const w = local(p); dst[0] = o.base[0] + w[0]; dst[1] = o.base[1] + w[1]; dst[2] = o.base[2] + w[2]; };
  // the opening is on the lid, towards the drinker (local +X)
  put(o.opening, [CAN.radius * 0.42, o.height - 0.006, 0]);
  put(o.top, [0, o.height, 0]);
  // the tarsus on its side, a little way round from the shoulder towards the camera
  const r = CAN.radius * (1 + 0.12 * crush) + 0.009;
  put(o.grip, [r * Math.cos(CAN_GRIP_TURN), o.height * 0.55, r * Math.sin(CAN_GRIP_TURN)]);
  return o;
}

// ------------------------------------------------------------- the keyboard

/**
 * The keyboard after a shove: its centre and turn, and the point on its
 * right end the foreleg pushes (and later pulls it back by).
 */
export function keyboardPose(kb, out = null) {
  const o = out ?? { center: [0, 0, 0], yaw: 0, corner: [0, 0, 0] };
  const [sx, sy, sz] = KEYBOARD.size;
  o.center[0] = KEYBOARD.center[0] + (kb?.x ?? 0);
  o.center[1] = KEYBOARD.center[1];
  o.center[2] = KEYBOARD.center[2] + (kb?.z ?? 0);
  o.yaw = kb?.yaw ?? 0;
  // the near edge of its right end — where a shove (and the pull back) takes it
  const c = rotY([sx / 2 - 0.004, sy * 0.75, -sz / 2 + 0.014], o.yaw);
  o.corner[0] = o.center[0] + c[0]; o.corner[1] = o.center[1] + c[1]; o.corner[2] = o.center[2] + c[2];
  return o;
}

// ---------------------------------------------------------------- anchors

/**
 * Every anchor's world point, into `out` (3 per anchor, in ANCHOR order).
 * `src` gives the ones that move: `mouse` (the tarsus on it), `can` (the
 * grip on it), `cup`, `eye`, `face` (on the turned head), `kb` (the
 * keyboard's corner) and `body` (the lean, for the points that go with it).
 */
export function resolveAnchors(src, out = new Float64Array(N_ANCHORS * 3)) {
  const set = (name, p) => { const i = ANCHOR[name] * 3; out[i] = p[0]; out[i + 1] = p[1]; out[i + 2] = p[2]; };
  set('mouse', src.mouse);
  set('can', src.can);
  set('cup', src.cup);
  set('eye', src.eye);
  set('face', src.face);
  set('desk', DESK_TAP);
  set('kb', src.kb);
  set('slamTop', SLAM_TOP);
  set('slamDesk', SLAM_DESK);
  const tmp = [0, 0, 0];
  for (const name of ['chest', 'pump', 'up', 'stretch']) set(name, posedToWorld(BODY_POINTS[name], src.body, tmp));
  return out;
}

/** The foreleg's world target: the pose's weighted anchors plus its offset. */
export function handTarget(pose, anchors, out = [0, 0, 0]) {
  let x = pose[N_ANCHORS], y = pose[N_ANCHORS + 1], z = pose[N_ANCHORS + 2];
  let wsum = 0;
  for (let i = 0; i < N_ANCHORS; i++) {
    const w = pose[i];
    if (w === 0) continue;
    wsum += w;
    x += anchors[i * 3] * w; y += anchors[i * 3 + 1] * w; z += anchors[i * 3 + 2] * w;
  }
  // weights always sum to one; if rounding says otherwise, the mouse takes the rest
  if (Math.abs(1 - wsum) > 1e-6) {
    const r = 1 - wsum;
    x += anchors[0] * r; y += anchors[1] * r; z += anchors[2] * r;
  }
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}

/** The tarsus on the mouse, lifted and pressed as the gamer's hand says. */
export function mouseAnchor(hand, press, out = [0, 0, 0]) {
  const p = mousePoint(hand.dx, hand.dz, press);
  out[0] = p[0]; out[1] = p[1] + (hand.lift ?? 0); out[2] = p[2];
  return out;
}

export { POSE_SIZE };
