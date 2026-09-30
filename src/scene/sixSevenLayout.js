/**
 * The classroom. Damian and his stool are where the casino puts the fly
 * (layout.js) — the seated pose was solved against that stool — and his school
 * desk stands where the bar counter did. He faces -X: the blackboard is on the
 * wall in front of him, and the teacher stands beside it.
 *
 * Plain arrays, no three.js: the game reads these too.
 */
import { FLY, STOOL, flyToWorld } from './layout.js';
import { COUNTER } from './barLayout.js';

/** Damian's desk: one pupil wide. */
export const DESK = { ...COUNTER, zMin: -0.95, zMax: 0.55 };

/** The blackboard, on the front wall, facing the class (+X). */
export const WALL_X = -2.9;
export const BOARD = { x: WALL_X + 0.06, y: 2.05, z: -0.1, width: 3.9, height: 1.85 };

/**
 * The teacher: the same scan, standing on the platform by the board. Turned
 * to `TEACHER_AT_BOARD` it writes; turned to `TEACHER_AT_CLASS` it watches.
 */
export const PLATFORM = { x: -2.05, z: 1.15, width: 1.3, depth: 1.9, height: 0.28 };
export const TEACHER = {
  position: [PLATFORM.x - 0.25, FLY.position[1] - STOOL.seatCenter[1] + PLATFORM.height, PLATFORM.z],
  pitch: FLY.pitch,
  scale: FLY.scale * 1.12,
};
/** Yaw facing the board (-X, and a little towards its middle), and facing the class (+X). */
export const TEACHER_AT_BOARD = -Math.PI / 2 - 0.35;
export const TEACHER_AT_CLASS = Math.PI / 2 + 0.25;

/**
 * The gesture: both palms weighing, up and down in turn. The scan has one
 * rigged foreleg, the right; it pumps between these two points (in the fly's
 * own frame, inside the leg's reach) while the body rocks the other way.
 */
export const PALM_HIGH = flyToWorld([-0.3, 0.45, 1.0]);
export const PALM_LOW = flyToWorld([-0.3, 0.45, 0.55]);
/** Where the numerals pop up: over its right and its left shoulder. */
export const POP_RIGHT = flyToWorld([-0.55, 0.5, 1.25]);
export const POP_LEFT = flyToWorld([0.55, 0.5, 1.25]);
/** Where the foreleg rests while it writes lines in detention: on the desk. */
export const NOTEBOOK = [0.68, DESK.top + 0.012, -0.3];

/** What Damian watches: the middle of the board. */
export const BOARD_GAZE = [BOARD.x, BOARD.y - 0.1, BOARD.z];

/**
 * The shot: behind Damian and off his right shoulder, the way you would
 * watch a classmate — the board and the teacher beyond him, his foreleg in
 * view.
 */
export const CLASS_CAMERA = {
  position: [4.45, 2.8, -3.35],
  target: [-0.7, 1.72, 0.45],
  fov: 42,
};

/**
 * The rest of the front row: two classmates on Damian's left (+Z, towards the
 * windows), each the same seated pose moved along the floor, each at a desk
 * like his.
 */
export const CLASSMATE_DZ = [1.62, 3.05];

/**
 * The chalk numerals over his shoulders, named for where the viewer sees
 * them: the camera looks from behind his right shoulder, so his left (+Z) is
 * the left of the picture. The six goes there and the seven on the right, so
 * that it reads "6 7" and not "7 6".
 */
export const SIX_AT = POP_LEFT;
export const SEVEN_AT = POP_RIGHT;

/** The windows, on the class's left: centres along X, and the glass. */
export const WINDOW_WALL_Z = 4.45;
export const WINDOWS = { xs: [-1.55, 0.55, 2.65], y: 2.25, width: 1.7, height: 1.95 };
/** Where the sun is: through those windows, high. The sun patches on the floor are projected along it. */
export const SUN = [1.2, 5.6, 7.6];

/** The teacher's desk, to the right of the board as the class sees it. */
export const TEACHER_DESK = { x: -1.85, z: -2.15, width: 0.75, length: 1.5, top: 1.02 };
