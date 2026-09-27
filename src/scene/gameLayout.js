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
import { COUNTER, MOUTH_LOCAL } from './barLayout.js';
import { STOOL, flyToWorld, worldToFly } from './layout.js';
import { SHOULDER } from './flyRig.js';

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

/** The mouthparts, with the fly in its seat. */
export const MOUTH = flyToWorld(MOUTH_LOCAL);

/** Which way a can at `p` has to turn (about Y) for its local +X to face the foreleg's shoulder. */
const facing = (p) => { const s = flyToWorld(SHOULDER); return Math.atan2(-(s[2] - p[2]), s[0] - p[0]); };

/**
 * The energy drink: a tall 500 ml can (Monster Ultra White, the model in
 * public/models), standing on the mat on the mouse side, past the mouse —
 * the one place on the desk the right foreleg reaches
 * (tools/check-game-reach.mjs). `yaw` turns its grip side to the foreleg.
 */
export const CAN = { base: [0.795, DESK.top + 0.003, -0.455], radius: 0.033, height: 0.18 };
/**
 * Which way the logo faces on the can model: the middle of the big claw and
 * the name on its label, as an angle about Y in the model's own frame
 * (atan2(z, x)), found from the label's UVs. The scene turns the model in its
 * group so this faces the camera.
 */
export const CAN_LOGO_AZIMUTH = -2.885;
CAN.yaw = facing(CAN.base);
/**
 * The can lifted to drink: in front of the face, a little to its right and
 * below the mouthparts, so the proboscis reaches down into the opening. The
 * foreleg holds it by the side, `CAN_GRIP_TURN` round from the side facing
 * the shoulder towards the camera, so it shows.
 */
export const CAN_DRINK = { base: [MOUTH[0] - 0.05, MOUTH[1] - CAN.height - 0.07, MOUTH[2] - 0.045] };
CAN_DRINK.yaw = facing(CAN_DRINK.base);
export const CAN_GRIP_TURN = 0.55;

/** A spot on the desk in front of the keyboard's right end: what it taps and drums on. */
export const DESK_TAP = [0.815, DESK.top + 0.004, -0.165];

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

/**
 * Points on the head the foreleg goes to, in the fly's own model space; they
 * turn with the head (Fly.jsx reports where they are each frame). The cup is
 * the outside of the headset's right cup, the eye the front of the right
 * compound eye (in front of the cup), the face the middle of the face.
 */
export const HEAD_POINTS = {
  cup: [HEADSET.cupX[0] - HEADSET.cupDepth / 2 - 0.012, HEADSET.cupY, HEADSET.center[2] + 0.01],
  eye: [-0.17, 0.86, 0.69],
  face: [-0.05, 0.82, 0.73],
};

/**
 * Points the foreleg goes to that move with the body — when it leans back,
 * a raised fist goes back with it. Placed in the world for the fly sitting
 * straight, stored in its model space.
 */
export const BODY_POINTS = {
  chest: worldToFly([1.03, 1.64, -0.27]),
  pump: worldToFly([0.99, 1.93, -0.36]),
  up: worldToFly([1.05, 1.99, -0.42]),
  stretch: worldToFly([0.93, 1.97, -0.3]),
};

/** Where the fly's eyes go on each game's HUD when it checks the minimap, in screen fractions. */
export const HUD_GLANCE = {
  lol: [0.8, -0.72], cs2: [-0.84, 0.7], fortnite: [0.86, 0.72], minecraft: [0, -0.86],
  rdr2: [-0.82, -0.72], gow: [-0.78, 0.78], gowr: [-0.78, 0.78],
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
/** Head dropped: the desk just in front of the keyboard. */
export const DOWN_GAZE = [0.7, DESK.top + 0.02, -0.1];
/** Head thrown back: high over the monitor. */
export const UP_GAZE = [0.3, 2.5, -0.12];

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
