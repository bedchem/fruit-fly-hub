/**
 * A two-bone rig for the fly's right foreleg.
 *
 * The CT scan is a single unrigged surface, so there are no bones to drive.
 * Instead the foreleg is selected by a capsule around its measured centreline
 * and driven by two rotations — one about the coxa, one about the femur/tibia
 * joint — solved so the tarsus lands exactly on a target point. That target is
 * the lever knob, which is how the fly ends up gripping the handle through the
 * whole pull rather than just near it.
 *
 * Every constant below is in the fly's own model space, the frame written by
 * tools/build-fly.mjs: +Y up, +Z forward (out through the head), feet on Y = 0.
 * They were measured off the mesh, not guessed — see tools/measure-fly.mjs.
 *
 * Plain arrays, no three.js: the build tools run this in Node too.
 */

// The fly's RIGHT foreleg. Facing +Z with +Y up, its right side is -X
// (forward × up), and that is the side the lever sits on when the fly is on
// the stool — the same hand a seated player would reach across with.
// Measured by tools/measure-fly.mjs; do not hand-edit without re-running it.
export const SHOULDER = [-0.1023, 0.5701, 0.2440]; // coxa, where the leg meets the thorax
export const KNEE = [-0.2681, 0.4606, 0.5902];     // femur / tibia joint
export const HAND = [-0.1192, 0.0111, 0.7779];     // tarsus tip, the "hand"

/** Capsule around the SHOULDER-KNEE-HAND polyline: full weight in, zero out. */
export const CAPSULE_IN = 0.085;
export const CAPSULE_OUT = 0.125;

/**
 * The head turns too, on the waist between thorax and head found by
 * tools/measure-head.mjs. Sitting upright leaves the fly staring at the
 * ceiling otherwise; this lets it keep its eyes on the reels.
 */
export const NECK = [-0.0450, 0.8600, 0.4700];
/** Rest gaze direction: the scan looks straight down its own +Z. */
const GAZE_REST = [0, 0, 1];
/** How far the head may turn before it stops looking like a head. */
export const HEAD_MAX_TURN = 0.95;

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a) => { const l = length(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export const BONE1 = length(sub(KNEE, SHOULDER));
export const BONE2 = length(sub(HAND, KNEE));
export const REACH = BONE1 + BONE2;

const REST_U = normalize(sub(KNEE, SHOULDER));
const REST_V = normalize(sub(HAND, KNEE));
const REST_POLE = normalize(cross(REST_U, REST_V));

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

function distToSegment(p, a, b) {
  const ab = sub(b, a);
  const t = clamp(dot(sub(p, a), ab) / dot(ab, ab), 0, 1);
  return length(sub(p, add(a, scale(ab, t))));
}

/**
 * Skinning weights for one vertex.
 * w1 drives the whole leg about the shoulder, w2 adds the knee bend on top.
 * Both fade to zero before they reach the thorax, so the body never deforms.
 */
export function legWeights(x, y, z) {
  const p = [x, y, z];
  const d = Math.min(distToSegment(p, SHOULDER, KNEE), distToSegment(p, KNEE, HAND));
  const mask = 1 - smoothstep(CAPSULE_IN, CAPSULE_OUT, d);
  if (mask <= 0) return [0, 0];
  const t1 = dot(sub(p, SHOULDER), REST_U) / BONE1; // 0 at shoulder, 1 at knee
  const t2 = dot(sub(p, KNEE), REST_V) / BONE2;     // 0 at knee, 1 at hand
  const w1 = mask * smoothstep(-0.10, 0.22, t1);
  const w2 = w1 * smoothstep(-0.10, 0.12, t2);
  return [w1, w2];
}

/**
 * Head weight for one vertex, from its REST position.
 *
 * Reading the rest pose matters: the foreleg swings up past the head's height
 * while it works the handle, and weights taken from the posed position would
 * start dragging it around with the head.
 */
export function headWeight(x, y, z) {
  // forward of the neck, and above the legs that pass under it
  return smoothstep(0.44, 0.56, z) * smoothstep(0.56, 0.66, y);
}

/**
 * Turns the head to look at a point in the fly's own space, capped so it never
 * wrenches past what a neck would do.
 */
export function solveHeadLook(target, maxTurn = HEAD_MAX_TURN) {
  const dir = normalize(sub(target, NECK));
  const q = quatFromUnitVectors(GAZE_REST, dir);
  const angle = 2 * Math.acos(clamp(q[3], -1, 1));
  if (angle <= maxTurn || angle < 1e-6) return q;
  const s = Math.sin(angle / 2);
  const axis = s > 1e-6 ? [q[0] / s, q[1] / s, q[2] / s] : [0, 1, 0];
  const half = maxTurn / 2;
  const sh = Math.sin(half);
  return [axis[0] * sh, axis[1] * sh, axis[2] * sh, Math.cos(half)];
}

export function quatFromUnitVectors(a, b) {
  let axis = cross(a, b);
  let w = 1 + dot(a, b);
  if (w < 1e-6) {                       // opposite: pick any perpendicular
    const ref = Math.abs(a[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0];
    axis = cross(a, ref);
    w = 0;
  }
  const q = [axis[0], axis[1], axis[2], w];
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/** a · b: b's rotation first, then a's. */
export function quatMultiply(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/** A turn of `angle` radians about a unit `axis`. */
export function quatAxisAngle(axis, angle) {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

export function quatRotate(q, v) {
  const t = scale(cross([q[0], q[1], q[2]], v), 2);
  return add(add(v, scale(t, q[3])), cross([q[0], q[1], q[2]], t));
}

function rotateAxisAngle(v, axis, angle) {
  const a = normalize(axis), c = Math.cos(angle), s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(a, v), s)), scale(a, dot(a, v) * (1 - c)));
}

/**
 * Two-bone IK. `target` is in the fly's model space.
 * Returns the rotation about the shoulder, the rotation about the *posed* knee,
 * and where that knee ended up — which is what the shader needs.
 * The elbow keeps the rest pose's bend plane, so the leg never flips inside out.
 */
export function solveLegIK(target) {
  const toTarget = sub(target, SHOULDER);
  const reached = clamp(length(toTarget), Math.abs(BONE1 - BONE2) + 1e-3, REACH - 1e-3);
  const dir = normalize(toTarget);

  const shoulderAngle = Math.acos(clamp((BONE1 * BONE1 + reached * reached - BONE2 * BONE2) / (2 * BONE1 * reached), -1, 1));

  let axis = sub(REST_POLE, scale(dir, dot(REST_POLE, dir)));
  if (length(axis) < 1e-5) {
    axis = cross(dir, [0, 1, 0]);
    if (length(axis) < 1e-5) axis = cross(dir, [1, 0, 0]);
  }
  axis = normalize(axis);

  const u = normalize(rotateAxisAngle(dir, axis, shoulderAngle));
  const knee = add(SHOULDER, scale(u, BONE1));
  const hand = add(SHOULDER, scale(dir, reached));
  const v = normalize(sub(hand, knee));

  const q1 = quatFromUnitVectors(REST_U, u);
  const q2 = quatFromUnitVectors(quatRotate(q1, REST_V), v);
  return { q1, q2, knee, hand, overextended: length(toTarget) > REACH - 1e-3 };
}

/** Apply the solved pose to a rest-pose point — the CPU twin of the shader. */
export function applyPose(p, w1, w2, pose) {
  if (w1 < 5e-4) return p;
  let out = add(SHOULDER, quatRotate(pose.q1, sub(p, SHOULDER)));
  out = [p[0] + (out[0] - p[0]) * w1, p[1] + (out[1] - p[1]) * w1, p[2] + (out[2] - p[2]) * w1];
  if (w2 >= 5e-4) {
    const bent = add(pose.knee, quatRotate(pose.q2, sub(out, pose.knee)));
    out = [out[0] + (bent[0] - out[0]) * w2, out[1] + (bent[1] - out[1]) * w2, out[2] + (bent[2] - out[2]) * w2];
  }
  return out;
}
