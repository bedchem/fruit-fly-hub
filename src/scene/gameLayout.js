/**
 * The gaming setup. The fly and its seat are where the casino puts them
 * (layout.js); the desk stands where the trading desk did, and everything on
 * it is placed around the fly's right foreleg and its gaze: a curved monitor
 * straight ahead, a vertical one swung in on its left, the mouse under the
 * tarsus (tools/check-game-reach.mjs), the keyboard beside it, and the PC at
 * the far right end with its glass side to the camera.
 *
 * World frame as everywhere: Y up, floor on Y = 0, one unit a metre. The fly
 * faces −X; its right is −Z.
 */
import { COUNTER } from './barLayout.js';
import { STOOL } from './layout.js';

export const DESK = { ...COUNTER, zMin: -1.4, zMax: 1.1 };

/**
 * The main monitor: a 16:9 panel bent round a vertical axis, facing the fly
 * (+X). `radius` is the curve; the edges come towards the fly.
 */
export const SCREEN = {
  center: [0.4, 1.74, -0.1],
  width: 0.9,
  height: 0.506,
  radius: 1.5,
  tilt: -0.05,
};

/** Where the curved panel's edge on the fly's left (+Z) ends up. */
const EDGE_ANGLE = SCREEN.width / 2 / SCREEN.radius;
const LEFT_EDGE = [
  SCREEN.center[0] + SCREEN.radius * (1 - Math.cos(EDGE_ANGLE)),
  SCREEN.center[2] + SCREEN.radius * Math.sin(EDGE_ANGLE),
];

/**
 * The vertical monitor, 9:16, hinged on the main one's left edge and swung in
 * towards the fly, the way a second screen stands beside a first.
 */
const SIDE_SWING = 0.52;
const SIDE_W = 0.3;
const SIDE_GAP = 0.035;
export const SIDE = {
  width: SIDE_W,
  height: SIDE_W * 16 / 9,
  yaw: SIDE_SWING,
  tilt: -0.04,
  center: [
    LEFT_EDGE[0] + Math.sin(SIDE_SWING) * (SIDE_W / 2 + SIDE_GAP),
    1.745,
    LEFT_EDGE[1] + SIDE_GAP * 0.5 + Math.cos(SIDE_SWING) * (SIDE_W / 2 + SIDE_GAP),
  ],
};

/** The desk mat, under the keyboard and the mouse. */
export const MAT = { center: [0.64, DESK.top + 0.002, -0.12], size: [0.4, 0.94] };

/** A tenkeyless keyboard, long side along Z, in front of the fly. */
export const KEYBOARD = { center: [0.665, DESK.top + 0.004, 0.07], size: [0.15, 0.022, 0.42] };

/** The mouse, and where it rests under the right foreleg. */
export const MOUSE = { home: [0.815, DESK.top + 0.003, -0.285], size: [0.12, 0.038, 0.066] };

/** The tarsus on the mouse: its back, towards the buttons, where a hand would be. */
export const mousePoint = (dx = 0, dz = 0, click = 0) => [
  MOUSE.home[0] + dx - 0.01,
  MOUSE.home[1] + MOUSE.size[1] + 0.004 - click * 0.007,
  MOUSE.home[2] + dz,
];

/**
 * The slam: up off the mouse, high over the desk, and down flat on it beside
 * the keyboard. 0..SLAM_HIT is the wind-up, SLAM_HIT the hit.
 */
export const SLAM_TOP = [0.9, DESK.top + 0.52, -0.26];
export const SLAM_DESK = [0.78, DESK.top + 0.012, -0.15];

/** The energy drink. */
export const CAN = { base: [0.59, DESK.top, 0.36], radius: 0.033, height: 0.122 };

/** The PC: a tower on the desk at the far right, front to the fly, glass side to the camera. */
export const PC = { center: [0.47, DESK.top, -0.86], size: [0.46, 0.52, 0.235] };

/** The chair, built round the seat the fly is fitted to. */
export const CHAIR = {
  seat: STOOL.seatCenter,
  // the fly reaches back to x 1.84 at the height of the seat: the backrest stands behind that
  backX: 1.9,
  width: 0.5,
};

/** The wall behind the monitors. */
export const WALL_X = -0.08;

/**
 * The headset, in the fly's own model space (it is worn in Fly's head slot
 * and turns with the head). The head, measured off the scan by
 * tools/fit-headset.mjs, spans x −0.224..0.146, y 0.64..1.09, z 0.54..0.65:
 * broad and tall, and thin front to back. The band goes over the top behind
 * the eyes, a cup sits on each side, and the microphone curls round to the
 * mouthparts.
 */
export const HEADSET = {
  center: [-0.039, 0.86, 0.565],
  bandRadius: 0.228,
  bandStretch: 1.12,
  tube: 0.02,
  cupX: [-0.268, 0.19],
  cupY: 0.84,
  cupRadius: 0.088,
  cupDepth: 0.06,
  mic: [[-0.27, 0.78, 0.6], [-0.25, 0.66, 0.68], [-0.16, 0.6, 0.73], [-0.07, 0.6, 0.745]],
};

/** A point on the main screen, from screen fractions (x right, y up, −1..1 each). */
export function onScreen(u, v) {
  const a = u * EDGE_ANGLE;
  return [
    SCREEN.center[0] + SCREEN.radius * (1 - Math.cos(a)),
    SCREEN.center[1] + v * SCREEN.height / 2,
    // the fly's right (−Z) is the screen's right
    SCREEN.center[2] - SCREEN.radius * Math.sin(a),
  ];
}

/** What the fly watches: the crosshair, a touch low. */
export const SCREEN_GAZE = onScreen(0, -0.08);
export const SIDE_GAZE = [SIDE.center[0], SIDE.center[1] + 0.05, SIDE.center[2]];
export const DESK_GAZE = [SLAM_DESK[0] - 0.05, SLAM_DESK[1], SLAM_DESK[2] + 0.05];

/**
 * The shot: over the fly's right shoulder, close enough that the game on the
 * monitor reads — the head and headset in the foreground on the left, the
 * vertical monitor just past them, the curved screen in the middle and the PC
 * glowing on the right, all clear of the title and the HUD. Checked by
 * projection in tools/test-game-camera.mjs.
 */
export const GAME_CAMERA = {
  position: [2.4, 2.25, -1.85],
  target: [0.5, 1.6, -0.15],
  fov: 37,
};
