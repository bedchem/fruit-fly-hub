/**
 * The coder fly's room. The fly sits exactly where it sits in every other
 * experiment (layout.js): same seat height, same pose, facing -X with its
 * right foreleg on the -Z side. The desk is the trading desk's (the bar
 * counter's numbers), in wood; a MacBook sits right at its front edge under
 * the foreleg, an external monitor stands behind it, the mug is on the right.
 *
 * The MacBook is modelled in its own frame: origin at the middle of the
 * bottom of the base, +X its front edge (towards the fly), +Z the left end of
 * the keyboard as the fly sees it. Every key has a centre in that frame; the
 * ones the foreleg types on are the ones tools/check-code-reach.mjs finds
 * within reach.
 *
 * World frame, one unit a metre: Y up, the floor on Y = 0.
 */
import { COUNTER, MOUTH_LOCAL } from './barLayout.js';
import { FLY, STOOL, flyToWorld, reachFraction } from './layout.js';

export const DESK = { ...COUNTER, zMin: -1.32, zMax: 0.98 };

/** The room around the desk: a corner, the window in the wall behind the desk. */
export const ROOM = {
  back: 0.1,          // X of the wall behind the desk
  left: 1.62,         // Z of the wall on the fly's left
  height: 3.1,
  window: { z0: -1.28, z1: -0.46, y0: 1.52, y1: 2.62 },
};

/** Where the chair's seat is: the seat top is the stool's, so the fly sits exactly as it always does. */
export const CHAIR = {
  seatTop: STOOL.seatCenter[1],
  center: [1.61, STOOL.seatCenter[1], -0.01],
  depth: 0.62,
  width: 0.64,
  /**
   * The backrest. The fly's folded wings rest back over the seat to X ≈ 1.84
   * at seat height (measured off the scan), so the back starts behind that
   * and leans away from it.
   */
  back: { x: 1.93, y0: 0.86, y1: 1.46, lean: 0.16, thickness: 0.09 },
};

// ------------------------------------------------------------- the MacBook

/** MacBook Pro 14-inch, in metres: 312.6 × 221.2 × 15.5 mm. */
export const MBP = {
  width: 0.3126,
  depth: 0.2212,
  base: 0.0098,       // the base slab
  lid: 0.0057,        // the lid, closed on top it makes the 15.5 mm
  radius: 0.0085,
  screen: { width: 0.3025, height: 0.1965, bezelSide: 0.0051, bezelTop: 0.0072, chin: 0.0118 },
  notch: { width: 0.032, height: 0.0068 },
  /** Opened a little past upright: radians back from vertical. */
  lidTilt: 0.26,
};

/**
 * Where it sits: front edge on the desk's front edge, in front of the right
 * foreleg, turned a little towards the fly's right so the camera over that
 * shoulder can read the screen. Placement found with the reach check.
 */
export const MACBOOK = {
  position: [DESK.front - MBP.depth / 2 + 0.01, DESK.top, -0.18],
  yaw: 0.08,
};

/**
 * A coder hunches over the keyboard, and so does this one: while it types
 * the body tips forward (Fly.jsx reads `lean`), which is what brings the
 * home row within reach of a foreleg measured for a slot machine's handle.
 */
export const TYPING_HUNCH = 2.2;
export const TYPING_POSE = { ...FLY, pitch: FLY.pitch + 0.07 * TYPING_HUNCH };

/** Keyboard pitch: one key unit, and the rows from the hinge towards the fly. */
const U = 0.0184;
const CAP = 0.0158;
const KEYBOARD_W = 15 * U;
const ROW_V = [0.0205, 0.0385, 0.0571, 0.0757, 0.0943, 0.1129];
const ROWS = [
  // [label, width in units]
  [['esc', 1], ['F1', 1], ['F2', 1], ['F3', 1], ['F4', 1], ['F5', 1], ['F6', 1], ['F7', 1], ['F8', 1], ['F9', 1], ['F10', 1], ['F11', 1], ['F12', 1], ['id', 2]],
  [['`', 1], ['1', 1], ['2', 1], ['3', 1], ['4', 1], ['5', 1], ['6', 1], ['7', 1], ['8', 1], ['9', 1], ['0', 1], ['-', 1], ['=', 1], ['delete', 2]],
  [['tab', 1.5], ['q', 1], ['w', 1], ['e', 1], ['r', 1], ['t', 1], ['y', 1], ['u', 1], ['i', 1], ['o', 1], ['p', 1], ['[', 1], [']', 1], ['\\', 1.5]],
  [['caps', 1.75], ['a', 1], ['s', 1], ['d', 1], ['f', 1], ['g', 1], ['h', 1], ['j', 1], ['k', 1], ['l', 1], [';', 1], ["'", 1], ['return', 2.25]],
  [['shift', 2.25], ['z', 1], ['x', 1], ['c', 1], ['v', 1], ['b', 1], ['n', 1], ['m', 1], [',', 1], ['.', 1], ['/', 1], ['rshift', 2.75]],
  [['fn', 1], ['ctrl', 1], ['opt', 1], ['cmd', 1.25], ['space', 5.5], ['rcmd', 1.25], ['ropt', 1], ['left', 1], ['updown', 1], ['right', 1]],
];

/**
 * Every key: its centre in the MacBook's frame (x towards the fly, z to the
 * fly's left), its cap size, and its label. The function row is half height.
 */
export const KEYS = ROWS.flatMap((row, r) => {
  let u = 0;
  return row.map(([label, w]) => {
    const cu = u + (w * U) / 2;
    u += w * U;
    return {
      label,
      row: r,
      x: -MBP.depth / 2 + ROW_V[r],
      z: KEYBOARD_W / 2 - cu,
      w: w * U - (U - CAP),
      d: r === 0 ? CAP * 0.6 : CAP,
    };
  });
});
export const KEY = Object.fromEntries(KEYS.map((k) => [k.label, k]));

/** The trackpad, in the same frame: centre and size. */
export const TRACKPAD = { x: -MBP.depth / 2 + 0.1705, z: 0, w: 0.1325, d: 0.0835 };

/** The top of the base, where key caps and the trackpad sit. */
export const DECK_Y = MBP.base;

/** MacBook frame -> world. */
export function macToWorld([x, y, z], mac = MACBOOK) {
  const c = Math.cos(mac.yaw), s = Math.sin(mac.yaw);
  return [
    mac.position[0] + x * c + z * s,
    mac.position[1] + y,
    mac.position[2] - x * s + z * c,
  ];
}

/** Where the tarsus lands on a key, and how far down a keystroke takes it. */
export function keyPoint(label, depth = 0) {
  const k = KEY[label] ?? KEY.space;
  return macToWorld([k.x, DECK_Y + 0.0022 - depth * 0.0016, k.z]);
}

/** A point on the trackpad, u and v in -1..1 across it. */
export function padPoint(u = 0, v = 0, depth = 0) {
  return macToWorld([TRACKPAD.x + (v * TRACKPAD.d) / 2 * 0.8, DECK_Y + 0.0012 - depth * 0.0008, TRACKPAD.z + (u * TRACKPAD.w) / 2 * 0.8]);
}

/** Where the tarsus rests between bursts: the palm rest right of the trackpad. */
export const PALM_REST = macToWorld([-MBP.depth / 2 + 0.172, MBP.base + 0.003, -0.105]);

/** Worst reach allowed for anything the foreleg is sent to. */
export const MAX_REACH = 0.95;

/**
 * The keys the foreleg actually types on: every key within reach. The others
 * are there, the fly just cannot get to them — so a character on one of
 * those is typed on the nearest key it can reach, which nobody watching a
 * fly type at night is going to catch.
 */
export const TAP_KEYS = KEYS.filter((k) => k.row > 0 && reachFraction(keyPoint(k.label), TYPING_POSE) < MAX_REACH).map((k) => k.label);

const CHAR_KEY = (() => {
  const shifted = { '~': '`', '!': '1', '@': '2', '#': '3', $: '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', _: '-', '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/' };
  return (ch) => {
    if (ch === ' ') return 'space';
    if (ch === '\n') return 'return';
    const c = shifted[ch] ?? ch.toLowerCase();
    return KEY[c] ? c : 'space';
  };
})();

/** The key a character is typed on: its own if the foreleg reaches it, else the nearest one it does. */
export function tapKeyFor(ch) {
  return reachableKey(CHAR_KEY(ch));
}

/**
 * A key by its label, or — for delete, return, tab and the rest the foreleg
 * cannot get to — the nearest one it can.
 */
export function reachableKey(label) {
  const want = KEY[label] ?? KEY.space;
  if (TAP_KEYS.includes(want.label)) return want.label;
  let best = TAP_KEYS[0], bd = Infinity;
  for (const label of TAP_KEYS) {
    const k = KEY[label];
    // mostly the same column, a row or two nearer the fly
    const d = Math.abs(k.z - want.z) * 1.6 + Math.abs(k.x - want.x) * 0.5;
    if (d < bd) { bd = d; best = label; }
  }
  return best;
}

// ------------------------------------------------------ the external monitor

/**
 * A 27-inch 16:9 screen on a stand behind the MacBook, raised so the lid
 * does not cut into it, turned towards the fly's right like the laptop.
 * Left: POKYH running in a browser. Right: the terminal and CI.
 */
export const MONITOR = {
  center: [0.36, 1.78, -0.06],
  width: 0.597,
  height: 0.336,
  bezel: 0.009,
  yaw: 0.24,
  tilt: -0.05,
};

// --------------------------------------------------------------- the coffee

/** The mug, on the desk to the right of the MacBook, handle towards the foreleg. */
export const MUG = {
  base: [0.8, DESK.top, -0.405],
  height: 0.094,
  radius: 0.04,
  /** Which way the handle points, radians about Y from +X: towards the fly and its right. */
  handleYaw: 0.62,
};

const handleOffset = (yaw) => [Math.cos(yaw) * (MUG.radius + 0.018), MUG.height * 0.55, -Math.sin(yaw) * (MUG.radius + 0.018)];

/** Where the tarsus closes on the handle, the mug standing on the desk. */
export const MUG_GRIP = (() => {
  const o = handleOffset(MUG.handleYaw);
  return [MUG.base[0] + o[0], MUG.base[1] + o[1], MUG.base[2] + o[2]];
})();

/** The mouthparts, with the fly in its seat (the bar's are measured for a higher seat). */
export const MOUTH = flyToWorld(MOUTH_LOCAL, FLY);
export { MOUTH_LOCAL };

/**
 * The mug lifted to drink: in front of the face and a little below it, the
 * handle turned out to the fly's right, where the foreleg holds it. The
 * proboscis reaches down from the mouthparts into the coffee.
 */
export const DRINK = {
  base: [MOUTH[0] - 0.078, MOUTH[1] - 0.2, MOUTH[2] - 0.012],
  handleYaw: 1.35,
};
export const DRINK_GRIP = (() => {
  const o = handleOffset(DRINK.handleYaw);
  return [DRINK.base[0] + o[0], DRINK.base[1] + o[1], DRINK.base[2] + o[2]];
})();

/**
 * Where the mug is on the way up, 0 on the desk .. 1 at the mouth: its base,
 * which way the handle points, and the handle itself — what the tarsus holds.
 * It rises first and then comes in, so it never scrapes over the MacBook.
 */
export function mugPose(k, out = { base: [0, 0, 0], yaw: 0, handle: [0, 0, 0] }) {
  const up = Math.sin(Math.min(1, k) * Math.PI) * 0.05;
  const inK = k * k * (3 - 2 * k);
  for (let i = 0; i < 3; i++) out.base[i] = MUG.base[i] + (DRINK.base[i] - MUG.base[i]) * (i === 1 ? k : inK);
  out.base[1] += up;
  out.yaw = MUG.handleYaw + (DRINK.handleYaw - MUG.handleYaw) * inK;
  const o = handleOffset(out.yaw);
  for (let i = 0; i < 3; i++) out.handle[i] = out.base[i] + o[i];
  return out;
}

/** The French press, further along the desk. */
export const PRESS = { base: [0.6, DESK.top, -0.62], height: 0.2, radius: 0.052 };

// -------------------------------------------------------------- the camera

/**
 * The shot: behind the fly and over its right shoulder, so the MacBook's
 * screen and the external monitor read past its head, the mug and the
 * window to the right, the fly's foreleg on the keys in the middle. Checked
 * by projection (tools/test-code-camera.mjs) so all of it lands in the free
 * middle of the stage, between the title and the HUD.
 */
export const CODE_CAMERA = {
  position: [2.45, 2.25, -2.05],
  target: [0.55, 1.6, -0.35],
  fov: 36,
};

/** A portrait canvas needs a wider lens to keep the desk in. */
export function codeCameraFov(width, height) {
  const aspect = Math.max(1, width) / Math.max(1, height);
  return CODE_CAMERA.fov + Math.max(0, Math.min(22, (1.25 - aspect) * 26));
}
