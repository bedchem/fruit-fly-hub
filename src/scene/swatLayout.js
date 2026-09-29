/**
 * The pub table. Plain arrays, no three.js: the game (src/game/swatter.js)
 * reads the swatter's geometry to work out what the fly's eyes see, and the
 * scene draws the same numbers.
 *
 * World frame: the table top is Y = 0, the middle of the free patch of table
 * the fly lives on is the origin. Nothing is to scale — at the fly's real
 * size the swatter would be forty flies wide and the page would be one flat
 * red square. The swatter is shrunk to something a camera can look past.
 */

/** Where the fly may be: a patch of table, in world units. */
export const ARENA = { xMin: -6.5, xMax: 6.5, zMin: -4.2, zMax: 4.2 };

/** The fly, standing: the scan's own frame already has its feet on Y = 0. */
export const FLY_SCALE = 0.62;
export const FLY_POSE = { position: [0, 0, 0], rotationY: 0, pitch: 0, scale: FLY_SCALE };
/** Its eyes, above its feet and ahead of its centre, in world units. */
export const EYE_HEIGHT = 0.55;
export const EYE_FORWARD = 0.32;

/**
 * Spilled beer: the reason it keeps coming back. Each puddle is a blob, not a
 * disc — `seed` shapes its outline, `r` is its mean radius. The first is fed
 * by the bottle lying at the back.
 */
export const PUDDLES = [
  { x: -3.3, z: -1.2, r: 0.95, seed: 3 },
  { x: 2.7, z: -1.9, r: 0.62, seed: 11 },
  { x: 4.5, z: 2.2, r: 0.45, seed: 23 },
  { x: -1.2, z: 2.6, r: 0.38, seed: 41 },
];

/** A puddle's edge at `angle`: a few low harmonics make it a spill, not a coin. */
export function puddleEdge(p, angle) {
  const s = p.seed;
  return p.r * (1 + 0.2 * Math.sin(3 * angle + s) + 0.11 * Math.sin(5 * angle + s * 1.7) + 0.06 * Math.sin(8 * angle + s * 0.3));
}

/** Is (x, z) in a puddle, and how far inside its edge (negative outside). */
export function inPuddle(p, x, z) {
  const dx = x - p.x, dz = z - p.z;
  return puddleEdge(p, Math.atan2(dz, dx)) - Math.hypot(dx, dz);
}

/** Its mouthparts, in the scan's own frame: where the proboscis grows from (measured for the bar). */
export const MOUTH_LOCAL = [0.02, 0.585, 0.66];
/** In front of its right eye, where the foreleg rubs when it grooms. */
export const EYE_RUB_LOCAL = [-0.13, 0.84, 0.74];

/**
 * The backdrop, huge at this scale and well outside where the fly goes: a
 * bottle on its side with beer running out of the neck towards the first
 * puddle, a pint on a beer mat, a second mat nearer the fly. The bottle's
 * neck ends a little short of the first puddle, lying along `yaw` from the
 * back left.
 */
export const BOTTLE = (() => {
  const p = PUDDLES[0];
  const yaw = 0.55, radius = 2.2, length = 15, gap = p.r + 2.2;
  const dir = [Math.sin(yaw), Math.cos(yaw)];
  return { x: p.x - dir[0] * (length + gap), z: p.z - dir[1] * (length + gap), yaw, radius, length };
})();
export const PINT = { x: 21, z: -20, radius: 4.4, height: 15 };
export const MAT = { x: 2.3, z: 0.7, radius: 1.7 };

/**
 * The swatter: a wire handle hinged at the wrist, running out to the collar,
 * and the perforated head beyond it. `a0` is the handle's angle at the moment
 * of contact (below horizontal). The head is bent up at the collar by −a0, the
 * way the wire neck of a real swatter is, so that it lands flat — and it is
 * bent AT the collar, so head and handle always meet.
 */
export const SWATTER = {
  handle: 6.3,       // wrist to collar
  headLength: 5.4,   // collar to tip
  headWidth: 4.4,    // across it
  headThickness: 0.08,
  a0: -0.3,
  raised: 0.55,      // angle while it hangs up there, waiting
};
const HALF = SWATTER.headLength / 2;
/** How far behind the aim point the wrist sits, and how high, at contact. */
export const WRIST_BACK = HALF + SWATTER.handle * Math.cos(SWATTER.a0);
export const WRIST_UP = -SWATTER.handle * Math.sin(SWATTER.a0);

/**
 * Where the swatter head is and which way it faces, for a hand at `wrist`
 * swinging towards the horizontal unit vector `u` with the handle at `angle`.
 * `normal` is the head's face normal, pointing down onto the table at contact.
 */
export function swatterHead(wrist, u, angle) {
  // the collar, at the end of the handle
  const cr = SWATTER.handle * Math.cos(angle), cy = SWATTER.handle * Math.sin(angle);
  // the head leaves the collar bent by −a0: its own angle is angle − a0
  const tilt = angle - SWATTER.a0;
  const hr = cr + HALF * Math.cos(tilt), hy = cy + HALF * Math.sin(tilt);
  const center = [wrist[0] + u[0] * hr, wrist[1] + hy, wrist[2] + u[1] * hr];
  const normal = [u[0] * Math.sin(tilt), -Math.cos(tilt), u[1] * Math.sin(tilt)];
  return { center, normal, tilt };
}

/** The wrist that brings the head down flat on `aim`, approached along `u`. */
export const wristFor = (aim, u) => [aim[0] - u[0] * WRIST_BACK, WRIST_UP, aim[2] - u[1] * WRIST_BACK];

/** Horizontal distance from (x, z) to the bottle's axis — the hand keeps clear of it. */
export function distToBottle(x, z) {
  const { x: bx, z: bz, yaw, length } = BOTTLE;
  const dx = Math.sin(yaw), dz = Math.cos(yaw);
  const t = Math.max(0, Math.min(length, (x - bx) * dx + (z - bz) * dz));
  return Math.hypot(x - (bx + dx * t), z - (bz + dz * t));
}

/**
 * The shot: low over the table from the front, the way you would lean in to
 * watch a fly. The target follows the fly; the camera keeps its offset.
 * While the swatter is up it cranes down to take in the air above the fly.
 */
export const SWAT_CAMERA = {
  offset: [0, 4.6, 11.5],
  fov: 42,
  follow: 0.55,
  /** While the hand is up: lower, further back, looking across the table. */
  threatOffset: [0, 3.6, 15],
  threatLift: 2.1,
};

export const clampToArena = (x, z, margin = 0) => [
  Math.min(ARENA.xMax - margin, Math.max(ARENA.xMin + margin, x)),
  Math.min(ARENA.zMax - margin, Math.max(ARENA.zMin + margin, z)),
];
