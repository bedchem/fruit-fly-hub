/**
 * What the gamer's body does around the game: its gestures.
 *
 * The game (gamer.js) decides what happens on the screen; this decides what
 * the fly does with its one working foreleg, its head and its posture while
 * it happens. Between fights it drums the desk, fidgets with the mouse,
 * grooms an eye, straightens its headset, stretches after a long match and
 * sips its energy drink through its proboscis. It reacts: a facepalm after a stupid
 * death, a fist pump on a multi-kill, a double-take when something looms.
 * And when tilt boils over, it picks one of several ways to take it out on
 * the desk. Gestures never fight the game: shooting and rage come first, and
 * a gesture caught out by a fight lets go and blends back to the mouse.
 *
 * A gesture is a take: keyframed tracks with eased segments — the foreleg,
 * the can, the body, the head — authored with anticipation, follow-through
 * and a settle. The foreleg's keys are not points but weighted sums of named
 * ANCHORS (the mouse, the can, the headset cup, the desk…) plus an offset,
 * and the scene (src/scene/gameGestures.js) resolves those to world points
 * every frame. So a foreleg on its way from the mouse to the can is exactly
 * "40% mouse, 60% can, 3 cm up", wherever those have moved — and when a
 * take is interrupted, where the foreleg is now is known exactly, and the
 * way back starts from there.
 *
 * Nothing here touches React or three.js, and nothing here changes the
 * match: it only reads the gamer. Its randomness is its own stream, seeded
 * from the gamer's seed, so `?seed=` replays the same night down to every
 * sip, and tools/sim-game.mjs sees the same games as without it.
 */
import { makeRng } from './market.js';

// ------------------------------------------------------------------ anchors

/** Everywhere the foreleg can be sent. The scene resolves each to a world point every frame. */
export const ANCHOR = {
  /** The tarsus on the mouse, wherever the mouse is. */
  mouse: 0,
  /** On the side of the energy drink, wherever the can is. */
  can: 1,
  /** The right cup of the headset, turned with the head. */
  cup: 2,
  /** The right compound eye. */
  eye: 3,
  /** The face, over the eyes. */
  face: 4,
  /** A spot on the desk between the mouse and the keyboard. */
  desk: 5,
  /** The keyboard's near right corner, wherever the keyboard is. */
  kb: 6,
  /** High over the desk: the top of a slam. */
  slamTop: 7,
  /** Flat on the desk: the bottom of a slam. */
  slamDesk: 8,
  /** In front of the chest, pulled in. These four move with the body. */
  chest: 9,
  /** A fist raised. */
  pump: 10,
  /** Flung up: "what was THAT". */
  up: 11,
  /** Stretched up and forward. */
  stretch: 12,
};
export const N_ANCHORS = 13;
/** A pose: one weight per anchor, then a world offset x, y, z. */
export const POSE_SIZE = N_ANCHORS + 3;
const OFF = N_ANCHORS;

/** A pose on one anchor, `off` metres from it. */
export function pose(anchor, off = null) {
  const p = new Float64Array(POSE_SIZE);
  p[ANCHOR[anchor]] = 1;
  if (off) { p[OFF] = off[0]; p[OFF + 1] = off[1]; p[OFF + 2] = off[2]; }
  return p;
}

// -------------------------------------------------------------------- easing

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const clamp01 = (x) => clamp(x, 0, 1);

/**
 * How a segment arrives at its key. `in` accelerates into it and stops dead
 * (a tap, a slam); `out` leaves fast and settles (a lift, a flinch);
 * `inOut` is a reach; `back` overshoots a little and settles.
 */
export const EASE = {
  linear: (u) => u,
  in: (u) => u * u * u,
  out: (u) => 1 - (1 - u) * (1 - u) * (1 - u),
  inOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  sine: (u) => 0.5 - 0.5 * Math.cos(Math.PI * u),
  back: (u) => { const v = u - 1; return 1 + v * v * (2.2 * v + 1.2); },
};

/** The value of a scalar track at time t. */
export function sampleScalar(keys, t) {
  if (!keys || keys.length === 0) return 0;
  if (t <= keys[0].t) return keys[0].v;
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (t < b.t) {
      const a = keys[i - 1];
      const span = b.t - a.t;
      const e = (EASE[b.ease] ?? EASE.inOut)(span > 1e-6 ? (t - a.t) / span : 1);
      return a.v + (b.v - a.v) * e;
    }
  }
  return keys[keys.length - 1].v;
}

/** The foreleg's pose at time t, written into `out`: anchor weights and an offset, arcs included. */
export function sampleHand(keys, t, out) {
  if (t <= keys[0].t) { out.set(keys[0].pose); return out; }
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (t < b.t) {
      const a = keys[i - 1];
      const span = b.t - a.t;
      const u = span > 1e-6 ? (t - a.t) / span : 1;
      const e = (EASE[b.ease] ?? EASE.inOut)(u);
      for (let j = 0; j < POSE_SIZE; j++) out[j] = a.pose[j] + (b.pose[j] - a.pose[j]) * e;
      // the path bows up (or out) between the keys instead of cutting straight across
      if (b.arc) {
        const bow = Math.sin(Math.PI * clamp01(e));
        out[OFF] += b.arc[0] * bow; out[OFF + 1] += b.arc[1] * bow; out[OFF + 2] += b.arc[2] * bow;
      }
      return out;
    }
  }
  out.set(keys[keys.length - 1].pose);
  return out;
}

// ----------------------------------------------------------------- channels

/**
 * Everything a take can move besides the foreleg, all 0 at rest:
 *   canLift    the can, 0 on the desk .. 1 at the mouthparts
 *   canTilt    tipped towards the mouth, radians
 *   canShake   shaken by the head, 0..1
 *   crush      the can crumpling, 0..1
 *   proboscis  out into the can, 0..1
 *   pitch, yaw, roll, rise   the body in the chair (radians, metres); +pitch leans in
 *   headRoll   the head tilted, radians
 *   shake      the head shaken, 0..1 (at the take's `shakeHz`)
 *   nod        the head dipped, radians
 *   mouseUp, mouseTilt   the mouse lifted off the pad (metres, radians)
 *   kbPush     the keyboard, 0 where it was .. 1 where the shove sends it
 *   kbFix      the keyboard, 0 where it is .. 1 back home
 *   wiggle     the mouse jiggled in little circles, 0..1
 *   tremble    the stretched foreleg shaking, 0..1
 */
export const CHANNELS = [
  'canLift', 'canTilt', 'canShake', 'crush', 'proboscis', 'pitch', 'yaw', 'roll', 'rise',
  'headRoll', 'shake', 'nod', 'mouseUp', 'mouseTilt', 'kbPush', 'kbFix', 'wiggle', 'tremble',
];

// -------------------------------------------------------------------- a take

/**
 * Builds a take. Every track starts from where the body is right now — the
 * foreleg from its current pose, each channel from its current value — so
 * one take can follow another, or cut in, without a jump.
 */
class Take {
  constructor(kind, from, now) {
    this.kind = kind;
    this.hand = [{ t: 0, pose: from.slice(), ease: 'linear', arc: null }];
    this.ch = {};
    this.now = now;
    this.look = [];
    this.cues = [];
    this.shakeHz = 2.4;
    this.hits = [];
  }

  /** The foreleg arrives at `anchor` + `off` at time t. */
  to(t, anchor, off = null, ease = 'inOut', arc = null) {
    this.hand.push({ t, pose: pose(anchor, off), ease, arc });
    return this;
  }

  /** The foreleg arrives at a mix of two anchors (k of the way from a to b). */
  mix(t, a, b, k, off = null, ease = 'inOut', arc = null) {
    const p = pose(a, off);
    p[ANCHOR[a]] = 1 - k;
    p[ANCHOR[b]] += k;
    this.hand.push({ t, pose: p, ease, arc });
    return this;
  }

  /** A channel reaches `v` at time t. */
  set(name, t, v, ease = 'inOut') {
    if (!this.ch[name]) this.ch[name] = [{ t: 0, v: this.now[name] ?? 0 }];
    this.ch[name].push({ t, v, ease });
    return this;
  }

  /** From time t the eyes go to `at` (a gaze target the scene knows). */
  lookAt(t, at) { this.look.push({ t, at }); return this; }

  /** Something that happens once at time t: a sip, a tap on the desk, a crunch. */
  cue(t, type, detail = null) { this.cues.push({ t, type, detail }); return this; }

  /** A blow the game feels (rage only): at time t, with this strength. */
  hit(t, strength) { this.hits.push({ at: t, strength }); return this; }

  done({ interruptible = true, rage = false } = {}) {
    const byT = (a, b) => a.t - b.t;
    this.hand.sort(byT);
    for (const k of Object.keys(this.ch)) this.ch[k].sort(byT);
    this.look.sort(byT);
    this.cues.sort(byT);
    const last = (keys) => (keys.length ? keys[keys.length - 1].t : 0);
    const dur = Math.max(last(this.hand), ...Object.values(this.ch).map(last), last(this.look), last(this.cues));
    return {
      kind: this.kind, t: 0, dur, interruptible, rage,
      hand: this.hand, ch: this.ch, look: this.look, cues: this.cues, cue: 0,
      shakeHz: this.shakeHz, hits: this.hits,
    };
  }
}

// ---------------------------------------------------------------- the takes
//
// Times in seconds, offsets in metres in the world: +X is back towards the
// fly, −X towards the monitor, +Y up, −Z the fly's right. Each take lifts off
// the mouse first (the anticipation), leads with the eyes, lets the body
// follow a beat later, and comes back onto the mouse from a centimetre above
// it (the settle).

const LIFT = [0.005, 0.012, 0];
const HOVER = [0, 0.012, 0];

/** Back onto the mouse from wherever the foreleg is, landing softly. */
function home(k, t, arc = [0, 0.035, 0], travel = 0.48) {
  k.to(t + travel, 'mouse', HOVER, 'inOut', arc);
  k.to(t + travel + 0.1, 'mouse', null, 'out');
  return t + travel + 0.1;
}

const TAKES = {
  /**
   * The energy drink: off the mouse, round to the can, up to the mouthparts, the
   * proboscis down into it — a few pulls — and back down. An empty can gets
   * tipped right up, probed, shaken by the head, crushed and put down.
   */
  sip(k, { sips = 2, gulp = false, empty = false, rng }) {
    k.lookAt(0, 'can');
    k.to(0.16, 'mouse', LIFT, 'out');
    k.to(0.7, 'can', [0.014, 0.012, 0.006], 'inOut', [0, 0.05, 0]);
    k.to(0.82, 'can', null, 'out');
    k.set('pitch', 0.28, 0.05, 'inOut').set('pitch', 0.95, 0.045).set('pitch', 1.6, -0.012, 'inOut');
    // up it comes; the foreleg stays on it
    k.set('canLift', 0.86, 0, 'linear').set('canLift', 1.62, 1, 'inOut');
    k.to(1.62, 'can', null, 'linear');
    k.set('canTilt', 1.2, 0.08).set('canTilt', 1.62, 0.12);
    k.set('headRoll', 1.1, 0).set('headRoll', 1.6, 0.05);
    k.set('proboscis', 1.38, 0, 'linear').set('proboscis', 1.7, 1, 'out');
    let t = 1.72;
    if (empty) {
      // nothing comes up: it probes, tips the can right up, probes again
      k.set('proboscis', 1.95, 0.55, 'sine').set('proboscis', 2.18, 1.08, 'sine').set('proboscis', 2.4, 0.6, 'sine').set('proboscis', 2.6, 1.05, 'sine');
      k.set('canTilt', 2.45, 0.7, 'inOut');
      k.set('nod', 2.3, -0.06).set('nod', 2.7, 0);
      k.set('proboscis', 2.85, 0, 'in');
      // away from the mouth, and a shake by the head: anything left in there?
      k.set('canLift', 2.75, 1, 'linear').set('canLift', 3.05, 0.8, 'inOut');
      k.set('canTilt', 3.05, 0.15);
      k.set('canShake', 3.08, 0, 'linear').set('canShake', 3.16, 1, 'out').set('canShake', 3.72, 1, 'linear').set('canShake', 3.82, 0, 'out');
      k.set('headRoll', 3.1, 0.14).set('headRoll', 3.8, 0.02);
      k.to(3.82, 'can', null, 'linear');
      // crushed, in one squeeze
      k.to(3.94, 'can', [-0.01, 0, 0.004], 'in');
      k.set('crush', 3.86, 0, 'linear').set('crush', 4.06, 1, 'out');
      k.cue(3.92, 'crush');
      k.to(4.14, 'can', null, 'out');
      k.set('canLift', 4.2, 0.8, 'linear').set('canLift', 4.95, 0, 'inOut');
      k.set('canTilt', 4.6, 0);
      k.set('pitch', 4.3, 0.035).set('pitch', 5.1, 0.03);
      k.cue(4.95, 'canDown', { crushed: true });
      k.lookAt(4.3, 'screen');
      k.to(4.95, 'can', null, 'linear');
      k.to(5.05, 'can', [0.008, 0.012, -0.004], 'out');
      k.set('pitch', 5.7, 0);
      k.set('headRoll', 5.0, 0);
      home(k, 5.05);
      return;
    }
    // the pulls: the proboscis works, the head dips with each, the can tips a little more
    const each = gulp ? 0.42 : 0.6 + rng() * 0.12;
    for (let i = 0; i < sips; i++) {
      const s = t + i * each;
      k.cue(s + each * 0.3, 'sip', { n: i + 1 });
      k.set('proboscis', s + each * 0.35, 0.9, 'sine').set('proboscis', s + each * 0.8, 1, 'sine');
      k.set('nod', s + each * 0.35, 0.035, 'sine').set('nod', s + each * 0.85, 0, 'sine');
      k.set('canTilt', s + each, 0.12 + (i + 1) * 0.07, 'sine');
    }
    t += sips * each;
    k.set('proboscis', t + 0.05, 1, 'linear').set('proboscis', t + 0.3, 0, 'in');
    k.set('canLift', t + 0.12, 1, 'linear').set('canLift', t + 0.92, 0, 'inOut');
    k.set('canTilt', t + 0.6, 0);
    k.set('headRoll', t + 0.5, 0);
    k.set('pitch', t + 0.2, -0.01).set('pitch', t + 0.95, 0.04).set('pitch', t + 1.7, 0);
    k.lookAt(t + 0.55, 'screen');
    k.to(t + 0.92, 'can', null, 'linear');
    k.cue(t + 0.92, 'canDown');
    k.to(t + 1.02, 'can', [0.008, 0.012, -0.004], 'out');
    home(k, t + 1.02);
  },

  /** The crushed can, lifted and shaken once more. Still empty. A sigh. */
  checkCan(k) {
    k.lookAt(0, 'can');
    k.to(0.16, 'mouse', LIFT, 'out');
    k.to(0.7, 'can', [0.014, 0.012, 0.006], 'inOut', [0, 0.05, 0]);
    k.to(0.8, 'can', null, 'out');
    k.set('pitch', 0.3, 0.045).set('pitch', 1.5, 0.02);
    k.set('canLift', 0.84, 0, 'linear').set('canLift', 1.3, 0.32, 'inOut');
    k.set('canShake', 1.3, 0, 'linear').set('canShake', 1.38, 0.8, 'out').set('canShake', 1.8, 0.8, 'linear').set('canShake', 1.9, 0, 'out');
    k.set('headRoll', 1.3, 0.1).set('headRoll', 2.2, 0);
    k.to(1.9, 'can', null, 'linear');
    k.set('canLift', 1.95, 0.32, 'linear').set('canLift', 2.45, 0, 'inOut');
    k.cue(2.45, 'canDown', { crushed: true });
    k.cue(2.3, 'sigh');
    k.to(2.45, 'can', null, 'linear');
    k.to(2.55, 'can', [0.008, 0.012, -0.004], 'out');
    k.lookAt(2.2, 'screen');
    k.set('pitch', 2.9, 0);
    home(k, 2.55);
  },

  /** Up to the right cup: it pushes it back into place and lets go. */
  headset(k) {
    k.to(0.14, 'mouse', LIFT, 'out');
    k.to(0.62, 'cup', [0.03, -0.012, -0.035], 'inOut', [0.02, 0.05, -0.02]);
    k.to(0.72, 'cup', null, 'out');
    k.to(0.98, 'cup', [0.012, 0.014, 0.004], 'inOut');
    k.to(1.12, 'cup', [0.006, 0.006, 0.002], 'inOut');
    k.to(1.32, 'cup', [0.004, 0.004, -0.035], 'out');
    k.set('headRoll', 0.55, 0).set('headRoll', 0.92, -0.085).set('headRoll', 1.35, 0, 'inOut');
    k.set('pitch', 0.3, 0.012).set('pitch', 1.3, 0);
    home(k, 1.32, [0.01, 0.03, -0.01]);
  },

  /** The right foreleg wiped down over the right eye, the way every fly cleans its eyes. */
  groom(k, { strokes = 3, rng }) {
    k.to(0.14, 'mouse', LIFT, 'out');
    k.to(0.6, 'eye', [0.012, 0.045, -0.02], 'inOut', [0.01, 0.05, -0.02]);
    let t = 0.6;
    for (let i = 0; i < strokes; i++) {
      const d = 0.24 + rng() * 0.05;
      k.to(t + d * 0.5, 'eye', [-0.008, -0.028 - rng() * 0.008, 0.002], 'inOut');
      k.to(t + d, 'eye', [0.012, 0.045, -0.02], 'inOut');
      k.set('nod', t + d * 0.5, 0.03, 'sine').set('nod', t + d, 0, 'sine');
      t += d;
    }
    k.set('headRoll', 0.45, 0).set('headRoll', 0.75, -0.12).set('headRoll', t, -0.1).set('headRoll', t + 0.3, 0);
    k.set('pitch', 0.4, 0.02).set('pitch', t + 0.4, 0);
    home(k, t, [0.01, 0.03, -0.01]);
  },

  /** A stupid death: the foreleg to the face, the head drops and shakes in it, the foreleg drags down. */
  facepalm(k) {
    k.to(0.1, 'mouse', [0.006, 0.02, 0], 'out');
    k.lookAt(0.28, 'down');
    k.to(0.46, 'face', [0.004, 0.02, -0.012], 'in', [0.02, 0.05, -0.03]);
    k.cue(0.46, 'pat');
    k.to(0.58, 'face', null, 'out');
    k.set('pitch', 0.3, 0).set('pitch', 0.62, 0.075).set('pitch', 1.9, 0.06).set('pitch', 2.55, 0);
    k.set('shake', 0.62, 0, 'linear').set('shake', 0.8, 1, 'sine').set('shake', 1.78, 1, 'linear').set('shake', 2.0, 0, 'sine');
    k.to(1.9, 'face', null, 'linear');
    k.to(2.2, 'face', [0.006, -0.04, 0], 'inOut');
    k.cue(1.95, 'sigh');
    k.lookAt(2.0, 'screen');
    k.shakeHz = 2.2;
    home(k, 2.2, [0.01, 0.02, -0.01], 0.42);
  },

  /** No foreleg, just the head: shaken slowly, and a sit back. */
  headShake(k) {
    k.lookAt(0, 'down');
    k.set('shake', 0.1, 0, 'linear').set('shake', 0.28, 0.75, 'sine').set('shake', 1.1, 0.75, 'linear').set('shake', 1.35, 0, 'sine');
    k.set('pitch', 0.1, 0).set('pitch', 0.5, -0.04).set('pitch', 1.7, 0);
    k.cue(0.2, 'sigh');
    k.lookAt(1.3, 'screen');
    k.shakeHz = 2.6;
  },

  /** The foreleg pulled in, up, and yanked down: YES. Sometimes twice. */
  fistPump(k, { twice = true }) {
    k.to(0.1, 'mouse', [0.006, 0.015, 0], 'out');
    k.to(0.36, 'chest', null, 'inOut', [0, 0.03, 0]);
    k.to(0.58, 'pump', null, 'out');
    k.to(0.74, 'chest', [0, 0.06, 0], 'in');
    let t = 0.74;
    if (twice) {
      k.to(0.86, 'pump', [0, -0.08, 0], 'out');
      k.to(0.98, 'chest', [0, 0.05, 0], 'in');
      t = 0.98;
    }
    k.to(t + 0.22, 'chest', [0, 0.04, 0], 'inOut');
    k.set('pitch', 0.1, 0).set('pitch', 0.5, -0.045).set('pitch', 0.74, 0.05, 'in').set('pitch', t, 0.035).set('pitch', t + 0.7, 0);
    k.set('nod', 0.55, -0.05).set('nod', 0.74, 0.05, 'in').set('nod', t + 0.4, 0);
    k.lookAt(0.4, 'up').lookAt(t, 'screen');
    home(k, t + 0.22, [0, 0.03, 0], 0.42);
  },

  /** Two quick taps on the desk. */
  deskTap(k) {
    k.to(0.1, 'mouse', LIFT, 'out');
    k.to(0.34, 'desk', [0, 0.07, 0], 'inOut', [0, 0.02, 0]);
    k.to(0.44, 'desk', null, 'in');
    k.cue(0.44, 'tap', { strength: 0.45 });
    k.to(0.56, 'desk', [0, 0.045, 0], 'out');
    k.to(0.66, 'desk', [0.004, 0, 0.012], 'in');
    k.cue(0.66, 'tap', { strength: 0.55 });
    k.to(0.8, 'desk', [0, 0.014, 0.008], 'out');
    k.set('pitch', 0.3, 0.02).set('pitch', 0.44, 0.035, 'in').set('pitch', 0.56, 0.02).set('pitch', 0.66, 0.04, 'in').set('pitch', 1.2, 0);
    home(k, 0.8, [0, 0.03, 0], 0.4);
  },

  /** Drumming the desk to the queue music: a rhythm on a tempo of its own. */
  drum(k, { bpm = 120, pattern = 0 }) {
    const PATTERNS = [
      [0, 0.5, 0.75, 1, 2, 2.5, 2.75, 3],
      [0, 0.25, 0.5, 1, 1.25, 1.5, 2, 2.25, 2.5, 3],
      [0, 1, 1.5, 2, 3, 3.25, 3.5],
    ];
    const beats = PATTERNS[pattern % PATTERNS.length];
    const beat = 60 / bpm;
    const FINGERS = [-0.016, 0.002, 0.018];
    k.to(0.1, 'mouse', LIFT, 'out');
    const t0 = 0.46;
    k.to(t0 - 0.06, 'desk', [0, 0.03, 0], 'inOut', [0, 0.02, 0]);
    let prev = t0 - 0.06;
    beats.forEach((b, i) => {
      const at = t0 + b * beat;
      const accent = b % 1 === 0;
      const z = FINGERS[(i * 2 + (accent ? 0 : 1)) % 3];
      const up = Math.min(0.09, (at - prev) * 0.6);
      if (at - prev > 0.14) k.to(prev + (at - prev) * 0.45, 'desk', [0, 0.012 + up * (accent ? 0.5 : 0.3), z * 0.5], 'out');
      k.to(at, 'desk', [0, 0, z], 'in');
      k.cue(at, 'tap', { strength: accent ? 0.22 : 0.14, quiet: true });
      k.set('nod', at - 0.04, 0, 'sine').set('nod', at + 0.06, accent ? 0.035 : 0.015, 'out').set('nod', at + 0.2, 0, 'sine');
      prev = at;
    });
    k.to(prev + 0.12, 'desk', [0, 0.02, 0], 'out');
    home(k, prev + 0.12, [0, 0.03, 0], 0.4);
  },

  /** The mouse jiggled in small circles, a few clicks. The foreleg never leaves it. */
  fidget(k, { rng }) {
    const d = 1.2 + rng() * 0.8;
    k.set('wiggle', 0.2, 1, 'inOut').set('wiggle', d, 1, 'linear').set('wiggle', d + 0.3, 0, 'inOut');
    for (let i = 0; i < 3; i++) k.cue(d + 0.35 + i * 0.1, 'click');
    k.cue(d + 0.7, 'end');
  },

  /** After a long match: the foreleg up and out, the body back, a shake, a sigh. */
  stretch(k) {
    k.to(0.18, 'mouse', [0.006, 0.02, 0], 'out');
    k.lookAt(0.55, 'up');
    k.to(0.95, 'stretch', null, 'inOut', [0.02, 0.05, 0]);
    k.to(2.0, 'stretch', [-0.012, 0.018, 0], 'sine');
    k.set('tremble', 1.0, 0, 'linear').set('tremble', 1.3, 1).set('tremble', 1.95, 1, 'linear').set('tremble', 2.1, 0);
    k.to(2.55, 'chest', [0, 0.08, 0], 'inOut');
    k.set('pitch', 0.3, 0).set('pitch', 1.15, -0.1).set('pitch', 2.1, -0.11, 'linear').set('pitch', 2.9, 0);
    k.set('rise', 0.3, 0).set('rise', 1.15, 0.012).set('rise', 2.6, 0);
    k.set('yaw', 0.9, 0.025).set('yaw', 2.5, 0);
    k.set('headRoll', 0.9, 0.07).set('headRoll', 2.3, 0);
    k.cue(0.45, 'inhale');
    k.cue(2.3, 'sigh');
    k.lookAt(2.3, 'screen');
    home(k, 2.55, [0, 0.03, 0], 0.55);
  },

  /** The keyboard, shoved earlier, pulled back where it belongs. */
  fixKeyboard(k) {
    k.lookAt(0.05, 'kb');
    k.to(0.12, 'mouse', LIFT, 'out');
    k.to(0.62, 'kb', [0.012, 0.03, -0.012], 'inOut', [0, 0.03, 0]);
    k.to(0.72, 'kb', null, 'out');
    k.set('kbFix', 0.76, 0, 'linear').set('kbFix', 1.34, 1, 'inOut');
    k.to(1.34, 'kb', null, 'linear');
    k.to(1.44, 'kb', [0.006, 0.014, -0.006], 'out');
    k.set('pitch', 0.35, 0.045).set('pitch', 1.5, 0);
    k.lookAt(1.35, 'screen');
    home(k, 1.44);
  },

  // ------------------------------------------------------------ rage
  // Each is a "slam" as far as the game is concerned: slamPhase runs over
  // its length, and its hits are the moments the desk takes a blow.

  /** The slam: up, and flat down on the desk. The one the game started with. */
  slam(k) {
    k.lookAt(0, 'desk');
    k.to(0.08, 'mouse', [0.004, 0.01, 0], 'out');
    k.to(0.27, 'slamTop', null, 'out');
    k.to(0.4, 'slamDesk', null, 'in');
    k.hit(0.4, 1);
    k.to(0.47, 'slamDesk', [0, 0.016, 0], 'out');
    k.to(0.54, 'slamDesk', null, 'in');
    k.to(0.7, 'slamDesk', null, 'linear');
    k.set('pitch', 0.05, 0).set('pitch', 0.27, -0.035).set('pitch', 0.4, 0.085, 'in').set('pitch', 0.6, 0.06).set('pitch', 1.05, 0.005);
    k.set('rise', 0.27, 0.006).set('rise', 0.4, -0.008, 'in').set('rise', 0.9, 0);
    k.set('nod', 0.36, 0).set('nod', 0.44, 0.08, 'out').set('nod', 0.95, 0);
    k.lookAt(0.75, 'screen');
    home(k, 0.7, [0, 0.03, 0], 0.26);
  },

  /** Two slams, the second harder. */
  double(k) {
    k.lookAt(0, 'desk');
    k.to(0.08, 'mouse', [0.004, 0.01, 0], 'out');
    k.to(0.27, 'slamTop', null, 'out');
    k.to(0.4, 'slamDesk', null, 'in');
    k.hit(0.4, 0.8);
    k.to(0.57, 'slamDesk', [0.02, 0.24, -0.02], 'out');
    k.to(0.72, 'slamDesk', [0, 0, 0.01], 'in');
    k.hit(0.72, 1);
    k.to(0.8, 'slamDesk', [0, 0.016, 0.01], 'out');
    k.to(0.88, 'slamDesk', [0, 0, 0.01], 'in');
    k.to(1.05, 'slamDesk', [0, 0, 0.01], 'linear');
    k.set('pitch', 0.05, 0).set('pitch', 0.27, -0.03).set('pitch', 0.4, 0.07, 'in').set('pitch', 0.57, 0.02).set('pitch', 0.72, 0.095, 'in').set('pitch', 1.0, 0.06).set('pitch', 1.45, 0.005);
    k.set('nod', 0.36, 0).set('nod', 0.44, 0.06, 'out').set('nod', 0.6, 0.01).set('nod', 0.76, 0.09, 'out').set('nod', 1.3, 0);
    k.lookAt(1.1, 'screen');
    home(k, 1.05, [0, 0.03, 0], 0.3);
  },

  /** The mouse itself: lifted and banged down on the pad, twice. */
  mouseSlam(k, { rng }) {
    k.lookAt(0, 'mouse');
    k.set('mouseUp', 0.06, 0, 'linear').set('mouseUp', 0.34, 0.1, 'out').set('mouseUp', 0.5, 0, 'in');
    k.hit(0.5, 0.7);
    k.set('mouseUp', 0.6, 0.04, 'out').set('mouseUp', 0.72, 0, 'in');
    k.hit(0.72, 0.45);
    k.set('mouseTilt', 0.06, 0).set('mouseTilt', 0.34, 0.38, 'out').set('mouseTilt', 0.5, 0, 'in').set('mouseTilt', 0.6, 0.15).set('mouseTilt', 0.72, 0, 'in');
    for (let i = 0; i < 5; i++) k.cue(0.82 + i * (0.07 + rng() * 0.04), 'click');
    k.set('pitch', 0.06, 0).set('pitch', 0.34, -0.03).set('pitch', 0.5, 0.065, 'in').set('pitch', 0.72, 0.05).set('pitch', 1.3, 0);
    k.set('nod', 0.46, 0).set('nod', 0.54, 0.06, 'out').set('nod', 1.0, 0);
    k.to(1.3, 'mouse', null, 'linear');
    k.lookAt(1.0, 'screen');
  },

  /** The keyboard shoved away across the desk. It stays there until it is put back. */
  shove(k) {
    k.lookAt(0, 'kb');
    k.to(0.08, 'mouse', [0.004, 0.012, 0], 'out');
    k.to(0.36, 'kb', [0.014, 0.022, -0.012], 'inOut', [0, 0.03, 0]);
    k.to(0.44, 'kb', null, 'in');
    k.set('kbPush', 0.44, 0, 'linear').set('kbPush', 1.0, 1, 'out');
    k.hit(0.47, 0.45);
    k.cue(0.47, 'clatter');
    k.to(0.6, 'kb', null, 'linear');
    k.to(0.7, 'kb', [0.01, 0.018, -0.03], 'out');
    k.set('pitch', 0.2, 0.02).set('pitch', 0.52, 0.09, 'in').set('pitch', 1.3, 0);
    k.set('yaw', 0.3, 0).set('yaw', 0.55, 0.035).set('yaw', 1.3, 0);
    k.lookAt(0.9, 'screen');
    home(k, 0.7, [0, 0.03, 0], 0.5);
  },

  /** The foreleg flung up — "what was THAT" — held, and dropped on the desk. */
  handsUp(k) {
    k.to(0.08, 'mouse', [0.006, 0.014, 0], 'out');
    k.lookAt(0.2, 'up');
    k.to(0.46, 'up', null, 'out');
    k.to(0.66, 'up', [0.008, 0.02, -0.01], 'out');
    k.to(0.92, 'up', [0, 0.012, 0], 'sine');
    k.to(1.12, 'desk', null, 'in', [0, 0.04, 0]);
    k.hit(1.12, 0.55);
    k.to(1.2, 'desk', [0, 0.012, 0], 'out');
    k.to(1.27, 'desk', null, 'in');
    k.set('pitch', 0.08, 0).set('pitch', 0.46, -0.095, 'out').set('pitch', 0.92, -0.085).set('pitch', 1.12, 0.05, 'in').set('pitch', 1.6, 0);
    k.set('shake', 0.5, 0, 'linear').set('shake', 0.6, 0.45).set('shake', 0.9, 0.45, 'linear').set('shake', 1.0, 0);
    k.lookAt(0.98, 'desk').lookAt(1.35, 'screen');
    k.shakeHz = 3.2;
    home(k, 1.27, [0, 0.03, 0], 0.33);
  },

  /** Both hands on the headset — well, the one — and a scream into the mic, head shaking. */
  headsetGrip(k) {
    k.to(0.06, 'mouse', [0.006, 0.014, 0], 'out');
    k.to(0.3, 'cup', [0.01, 0, -0.01], 'out', [0.02, 0.04, -0.02]);
    k.to(0.38, 'cup', [0.012, 0, 0.008], 'in');
    k.set('shake', 0.34, 0, 'linear').set('shake', 0.44, 1, 'out').set('shake', 1.05, 1, 'linear').set('shake', 1.2, 0);
    k.set('pitch', 0.3, 0.07).set('pitch', 1.2, 0.02).set('pitch', 1.6, 0);
    k.to(1.18, 'cup', [0.012, 0, 0.008], 'linear');
    k.to(1.28, 'cup', [0.004, 0.004, -0.04], 'out');
    k.lookAt(0.2, 'down').lookAt(1.2, 'screen');
    k.shakeHz = 5.2;
    home(k, 1.28, [0.01, 0.03, -0.01], 0.32);
  },
};

/** The ways to take it out on the desk, and how much each is in the fly's nature. */
const RAGE = ['slam', 'double', 'mouseSlam', 'shove', 'handsUp', 'headsetGrip'];

// ------------------------------------------------------------------ the body

/**
 * The fly's gestures, posture, breathing and gaze. One per Gamer, updated at
 * the end of its step; everything it writes is read by the scene.
 */
export class Gestures {
  constructor(gamer, seed = 1) {
    this.g = gamer;
    this.rng = makeRng((seed ^ 0x5be0cd19) >>> 0);
    this.clock = 0;

    /** The take being played, or null: the foreleg is on the mouse. */
    this.act = null;
    /** Where the foreleg is, as anchor weights and an offset: what the next take starts from. */
    this.hand = pose('mouse');
    /** Every channel's current value. */
    this.ch = Object.fromEntries(CHANNELS.map((c) => [c, 0]));
    this.pending = null;
    this.nextIdle = 5 + this.rng() * 8;
    this.lastKind = null;

    // --- what builds up --------------------------------------------------------
    /** Wanting a sip: grows while it plays, faster tilted. */
    this.thirst = 0.35 + this.rng() * 0.4;
    /** Sat still too long: a stretch pays it off. */
    this.stiff = 0.2;

    // --- the props --------------------------------------------------------------
    this.can = { fill: 0.7 + this.rng() * 0.3, crushed: 0 };
    /** The keyboard's offset from home, after a shove: metres and radians. */
    this.kb = { x: 0, z: 0, yaw: 0, from: null, to: null };

    // --- the mouse ---------------------------------------------------------------
    this.mouse = {
      x: 0, z: 0, vx: 0, vz: 0, tx: 0, tz: 0, lift: 0, tilt: 0,
      lifting: null, nextFix: 0, lastYaw: 0, lastPitch: 0,
    };
    /** Clicks of its own, on top of the game's: a burst on a kill. */
    this.press = 0;
    this.spam = null;
    /** A small knock on the desk (a tap, the can put down), 0..1. */
    this.thud = 0;

    // --- the body -----------------------------------------------------------------
    this.body = { pitch: 0, yaw: 0, roll: 0, rise: 0 };
    this.breath = { phase: this.rng() * 6, depth: 1 };
    this.hunch = 0;
    this.sigh = 0;
    this.inhale = 0;
    this.shift = { yaw: 0, roll: 0, tyaw: 0, troll: 0, next: 4 };
    /** The startle: a damped recoil kicked by the giant fibre, a loom, a blast. */
    this.jolt = { x: 0, v: 0 };

    // --- the head ------------------------------------------------------------------
    /** Where the eyes are going: a named target, and for the screen a point on it. */
    this.gaze = { at: 'screen', u: 0, v: -0.1 };
    this.fix = { u: 0, v: -0.1, next: 0 };
    this.glance = null;
    this.hudNext = 4 + this.rng() * 4;
    this.take2 = null;
    this.headYaw = 0;
    this.headPitch = 0;
    this.headRoll = 0;
    this.bpm = 112 + Math.floor(this.rng() * 30);
    this.groove = 0;
  }

  // ============================================================== playing takes

  /** The channels' current values: where a new take starts from. */
  get now() { return this.ch; }

  /**
   * Starts a take now, from wherever the body is. `opts` go to its builder.
   * Returns the take (rage takes hand their length and hits to the game).
   */
  play(kind, opts = {}) {
    const build = TAKES[kind];
    if (!build) return null;
    const rage = RAGE.includes(kind);
    const k = new Take(kind, this.hand, this.ch);
    // a can in the hand goes down first, fast, whatever comes next
    const holding = this.ch.canLift > 0.01;
    if (holding && kind !== 'sip' && kind !== 'checkCan') {
      const d = 0.16 + 0.22 * this.ch.canLift;
      k.set('canLift', d, 0, 'in').set('canTilt', d, 0).set('proboscis', 0.1, 0, 'in').set('canShake', 0.1, 0);
      k.to(d, 'can', null, 'in');
      k.cue(d, 'canDown');
      const shift = d + 0.04;
      const inner = new Take(kind, pose('can'), this.ch);
      build(inner, { rng: this.rng, ...opts });
      for (const key of inner.hand.slice(1)) k.hand.push({ ...key, t: key.t + shift });
      for (const [name, keys] of Object.entries(inner.ch)) for (const key of keys.slice(1)) k.set(name, key.t + shift, key.v, key.ease);
      for (const l of inner.look) k.lookAt(l.t + shift, l.at);
      for (const c of inner.cues) k.cue(c.t + shift, c.type, c.detail);
      for (const h of inner.hits) k.hit(h.at + shift, h.strength);
      k.shakeHz = inner.shakeHz;
    } else {
      build(k, { rng: this.rng, ...opts });
    }
    const act = k.done({ rage, interruptible: !rage });
    // channels the new take does not mention let go of whatever the old one left
    for (const c of CHANNELS) {
      if (!act.ch[c] && Math.abs(this.ch[c]) > 1e-4 && c !== 'kbPush' && c !== 'kbFix') {
        act.ch[c] = [{ t: 0, v: this.ch[c] }, { t: 0.35, v: 0, ease: 'inOut' }];
      }
    }
    if (kind === 'shove') this.planShove();
    this.act = act;
    this.lastKind = kind;
    this.pending = null;
    return act;
  }

  /**
   * A gesture caught out by the game: whatever the foreleg holds goes down,
   * and it goes back to the mouse from exactly where it is.
   */
  interrupt() {
    const k = new Take('return', this.hand, this.ch);
    let t = 0;
    if (this.ch.canLift > 0.01) {
      t = 0.16 + 0.26 * this.ch.canLift;
      k.set('canLift', t, 0, 'inOut').set('canTilt', t * 0.7, 0).set('canShake', 0.1, 0);
      k.to(t, 'can', null, 'inOut');
      k.cue(t, 'canDown');
    }
    k.set('proboscis', 0.12, 0, 'in');
    for (const c of ['pitch', 'yaw', 'roll', 'rise', 'headRoll', 'shake', 'nod', 'mouseUp', 'mouseTilt', 'wiggle', 'tremble', 'crush']) {
      if (Math.abs(this.ch[c]) > 1e-4 && !(c === 'crush' && this.ch.crush > 0.5)) k.set(c, 0.3, 0, 'inOut');
    }
    if (this.ch.crush > 0.5) this.can.crushed = 1;
    const onMouse = this.hand[ANCHOR.mouse] > 0.98;
    if (!onMouse) {
      k.to(t + 0.3, 'mouse', HOVER, 'inOut', [0, 0.02, 0]);
      k.to(t + 0.38, 'mouse', null, 'out');
    }
    k.lookAt(0, this.g.enemy ? 'enemy' : 'screen');
    this.act = k.done({ interruptible: false });
    this.act.returning = true;
  }

  /** Rage, the game says: pick how, start it, and tell the game how long it lasts and where it hits. */
  rage(force = null) {
    const g = this.g;
    const quitting = g.phase === 'rage-quit';
    const w = {
      slam: quitting ? 1.3 : 1,
      double: (quitting ? 1.1 : 0.45) + g.tilt * 0.4,
      mouseSlam: quitting ? 0.2 : 0.45,
      shove: Math.abs(this.kb.z) + Math.abs(this.kb.x) > 0.01 ? 0 : (quitting ? 0.25 : 0.42),
      handsUp: quitting ? 0.2 : 0.4,
      headsetGrip: quitting ? 0.15 : 0.35,
    };
    const kind = force ?? this.pickWeighted(w);
    const act = this.play(kind);
    return { kind, dur: act.dur, hits: act.hits };
  }

  /** Where a shove sends the keyboard: away and to the left, turned a little. */
  planShove() {
    const kb = this.kb;
    kb.from = { x: kb.x, z: kb.z, yaw: kb.yaw };
    kb.to = { x: kb.x - 0.012 - this.rng() * 0.018, z: kb.z + 0.055 + this.rng() * 0.03, yaw: kb.yaw + 0.07 + this.rng() * 0.08 };
  }

  pickWeighted(weights) {
    const entries = Object.entries(weights).filter(([, v]) => v > 0);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    let r = this.rng() * total;
    for (const [k, v] of entries) { r -= v; if (r <= 0) return k; }
    return entries[entries.length - 1]?.[0] ?? null;
  }

  // ================================================================ each step

  update(dt) {
    const g = this.g;
    this.clock += dt;
    this.press = Math.max(0, this.press - dt * 9);
    this.thud = Math.max(0, this.thud - dt * 4);

    // --- the game comes first ------------------------------------------------------
    const fight = g.phase === 'playing' && !!g.enemy;
    if (this.act && this.act.interruptible && (fight || g.slamPhase !== null)) this.interrupt();

    // --- the take ------------------------------------------------------------------------
    const a = this.act;
    if (a) {
      a.t += dt;
      while (a.cue < a.cues.length && a.cues[a.cue].t <= a.t) this.fire(a.cues[a.cue++]);
      sampleHand(a.hand, a.t, this.hand);
      for (const c of CHANNELS) this.ch[c] = a.ch[c] ? sampleScalar(a.ch[c], a.t) : 0;
      if (a.t >= a.dur) this.finish();
    } else {
      this.hand.fill(0);
      this.hand[ANCHOR.mouse] = 1;
      for (const c of CHANNELS) this.ch[c] = 0;
    }
    this.updateKeyboard();

    // --- what the fly starts by itself ----------------------------------------------------
    this.thirst = Math.min(1.6, this.thirst + dt / 70 * (1 + g.tilt * 1.5 + (g.phase === 'playing' ? 0.3 : 0)));
    if (g.phase === 'playing') this.stiff = Math.min(1.5, this.stiff + dt / 140);
    this.schedule(dt);

    this.updateMouse(dt);
    this.updateSpam(dt);
    this.updatePosture(dt);
    this.updateBreath(dt);
    this.updateGaze(dt);
  }

  finish() {
    const a = this.act;
    if (a.kind === 'fidget' || a.kind === 'headShake') this.nextIdle = Math.max(this.nextIdle, 4);
    this.act = null;
    this.hand.fill(0);
    this.hand[ANCHOR.mouse] = 1;
  }

  /** One-off moments inside a take. Most become an event for the sound. */
  fire(cue) {
    const g = this.g;
    switch (cue.type) {
      case 'sip': {
        const pull = Math.min(this.can.fill, 0.07 + this.rng() * 0.04);
        this.can.fill = Math.max(0, this.can.fill - pull);
        this.thirst = Math.max(0, this.thirst - 0.3);
        g.emit('sip', { n: cue.detail?.n ?? 1, fill: this.can.fill });
        break;
      }
      case 'crush': this.can.crushed = 1; this.can.fill = 0; g.emit('crush'); break;
      case 'canDown': this.thud = Math.max(this.thud, 0.25); g.emit('canDown', cue.detail ?? {}); break;
      case 'tap': this.thud = Math.max(this.thud, cue.detail?.strength ?? 0.3); g.emit('tap', cue.detail ?? {}); break;
      case 'clatter': g.emit('clatter'); break;
      case 'pat': g.emit('pat'); break;
      case 'click': this.press = 1; g.emit('click'); break;
      case 'sigh': this.sigh = 1; break;
      case 'inhale': this.inhale = 1; break;
      default: break;
    }
  }

  /** Whether a take of `dur` seconds can start now without a fight arriving halfway. */
  roomFor(dur) {
    const g = this.g;
    if (g.slamPhase !== null) return false;
    if (g.phase === 'rage-quit') return g.t > 2.2 && g.t + dur < 4.9;
    if (g.phase !== 'playing') return true;
    if (g.enemy || g.match?.roundOver) return !g.enemy && !!g.match?.roundOver;
    if (g.dead) return true;
    // a human does not know when the next one comes; mostly it gets away with it
    return (g.match?.calmFor ?? 0) > dur * 1.05;
  }

  schedule(dt) {
    const g = this.g;
    if (this.act) return;
    // --- a reaction waiting for its moment ----------------------------------------------
    const p = this.pending;
    if (p) {
      if (this.clock > p.until) this.pending = null;
      else if (this.clock >= p.at && this.roomFor(p.dur ?? 1.5)) { this.play(p.kind, p.opts); return; }
      else return;
    }
    // --- or something to do with the foreleg while nothing happens ---------------------
    this.nextIdle -= dt;
    if (this.nextIdle > 0) return;
    const w = this.idleWeights();
    if (!w) return;
    const kind = this.pickWeighted(w);
    if (!kind) return;
    const opts = this.idleOpts(kind);
    const est = { sip: opts.empty ? 5.4 : 3.45 + (opts.sips ?? 2) * 0.66, checkCan: 3.2, headset: 2.0, groom: 1.2 + (opts.strokes ?? 3) * 0.28, drum: 3.2, fidget: 2.3, stretch: 3.2, fixKeyboard: 2.0 }[kind] ?? 2;
    if (!this.roomFor(est)) { this.nextIdle = 0.4 + this.rng() * 0.8; return; }
    this.play(kind, opts);
    const lobby = g.phase === 'queue' || g.phase === 'switching';
    this.nextIdle = (4 + this.rng() * 9) * (lobby ? 0.7 : 1);
  }

  /** What it might do now, and how much it wants to. Null when now is not a moment for it. */
  idleWeights() {
    const g = this.g;
    const shoved = Math.abs(this.kb.z) + Math.abs(this.kb.x) > 0.01 ? 1 : 0;
    const drink = this.can.crushed ? 0 : 0.35 + this.thirst;
    const stretch = Math.max(0, this.stiff - 0.35) * 3;
    const calm = 1 - clamp01(g.arousal * 1.2);
    if (g.phase === 'queue' || g.phase === 'switching') {
      return { drum: 2.2, fidget: 1.5, sip: 3.6 * drink, headset: 0.5, groom: 0.7 * (0.4 + calm), stretch, fixKeyboard: 8 * shoved, checkCan: this.can.crushed ? 0.25 + this.thirst * 0.2 : 0 };
    }
    if (g.phase === 'result' && g.t > 1.1) {
      return { sip: 2.8 * drink, stretch: stretch * 1.2, headset: 0.4, groom: 0.5 * (0.4 + calm), drum: 0.6, fixKeyboard: 8 * shoved };
    }
    if (g.phase === 'rage-quit' && g.t > 2.2) return { groom: 0.3, headset: 0.5 };
    if (g.phase === 'playing' && !g.enemy && !g.match?.roundOver && !g.dead) {
      // a quiet stretch of a match: a quick swig, now and then
      return { sip: 1.9 * drink, headset: 0.3, groom: 0.3 * (0.3 + calm), fixKeyboard: 3 * shoved, drum: 0.2 };
    }
    return null;
  }

  idleOpts(kind) {
    const g = this.g;
    if (kind === 'sip') {
      const empty = this.can.fill <= 0.001;
      // mid-match it is one quick swig; between matches it takes its time
      const quick = g.phase === 'playing';
      return { sips: quick ? 1 : 1 + Math.floor(this.rng() * (1.6 + g.tilt * 1.6)), gulp: g.tilt > 0.5 && this.rng() < 0.6, empty };
    }
    if (kind === 'groom') return { strokes: g.phase === 'playing' ? 2 + Math.floor(this.rng() * 2) : 3 + Math.floor(this.rng() * 3) };
    if (kind === 'drum') return { bpm: this.bpm, pattern: Math.floor(this.rng() * 3) };
    return {};
  }

  // =================================================================== reactions

  /** Every event the game emits comes through here first. */
  on(type, d) {
    const g = this.g;
    const r = this.rng;
    switch (type) {
      case 'death':
      case 'explode': {
        const e = g.enemy;
        const stupid = !!e?.loom || type === 'explode' || g.flash > 0.3 || (d?.streak ?? 0) >= 3;
        this.kick(type === 'explode' ? 1 : 0.4);
        const x = r();
        const kind = stupid ? (x < 0.32 ? 'facepalm' : x < 0.55 ? 'headShake' : null) : (x < 0.08 ? 'facepalm' : x < 0.22 ? 'headShake' : null);
        if (kind) this.queue(kind, 0.35 + r() * 0.3, 1.6, kind === 'facepalm' ? 2.3 : 1.4);
        break;
      }
      case 'kill':
      case 'headshot': {
        if (r() < 0.4 + (type === 'headshot' ? 0.3 : 0)) this.spam = { left: 3 + Math.floor(r() * 4), next: this.clock + 0.06 };
        const streak = d?.streak ?? 1;
        if (streak >= 3 || (type === 'headshot' && r() < 0.2)) {
          const x = r();
          const kind = x < 0.5 ? 'fistPump' : x < 0.85 ? 'deskTap' : null;
          if (kind) this.queue(kind, 0.22 + r() * 0.2, 0.9, 1.5, { twice: streak >= 4 || r() < 0.4 });
        }
        break;
      }
      case 'victory': {
        const x = r();
        const kind = x < 0.45 ? 'fistPump' : x < 0.72 ? 'deskTap' : x < 0.86 && this.stiff > 0.3 ? 'stretch' : null;
        if (kind) this.queue(kind, 0.45 + r() * 0.4, 2.5, 1.8, { twice: r() < 0.6 });
        break;
      }
      case 'defeat': {
        if (g.tilt > 0.55) break;          // it may slam instead; that comes first
        const x = r();
        const kind = x < 0.4 ? 'headShake' : x < 0.65 ? 'facepalm' : null;
        if (kind) this.queue(kind, 1.0 + r() * 0.4, 2.5, 2.3);
        this.sigh = Math.max(this.sigh, 0.6);
        break;
      }
      case 'rageQuit':
        if (r() < 0.5) this.queue(r() < 0.5 ? 'facepalm' : 'headShake', 2.5 + r() * 0.3, 1.5, 2.3);
        break;
      case 'loom':
        this.kick(0.45);
        if (r() < 0.55) this.take2 = { t: 0 };
        break;
      case 'flinch': this.kick(1); break;
      case 'flash': this.kick(0.6); this.glance = { at: 'down', start: this.clock + 0.05, end: this.clock + 0.4 }; break;
      case 'slam': this.kick(0.25 * (d?.strength ?? 1)); break;
      case 'chat':
        if (d?.kind === 'team') {
          const busy = g.phase === 'playing' && !!g.enemy;
          if (r() < (busy ? 0.15 : 0.85)) {
            const start = this.clock + 0.15 + r() * 0.2;
            this.glance = { at: 'chat', start, end: start + (busy ? 0.35 : 0.7 + r() * 0.6) };
          }
        }
        break;
      case 'flame': {
        const start = this.clock + 0.2;
        this.glance = { at: 'chat', start, end: start + 1.2 + r() * 0.4 };
        break;
      }
      case 'queue':
      case 'launch':
        this.bpm = 100 + Math.floor(r() * 44);
        // the empty one crushed on the desk: a fresh can for the next match
        if (this.can.crushed || this.can.fill < 0.05) {
          this.can.crushed = 0;
          this.can.fill = 1;
          g.emit('canOpen');
        }
        break;
      default: break;
    }
  }

  /** A reaction to start `delay` from now, if there is room for it within `wait` more. */
  queue(kind, delay, wait, dur, opts = {}) {
    if (this.pending && this.pending.at > this.clock && this.pending.kind === kind) return;
    this.pending = { kind, at: this.clock + delay, until: this.clock + delay + wait, dur, opts };
  }

  /** The startle: the body recoils and wobbles back. */
  kick(strength) { this.jolt.v -= 2.6 * strength; }

  updateSpam() {
    const s = this.spam;
    if (!s || this.clock < s.next) return;
    this.press = 1;
    this.g.emit('click');
    s.left -= 1;
    s.next = this.clock + 0.07 + this.rng() * 0.05;
    if (s.left <= 0) this.spam = null;
  }

  // ================================================================== the mouse

  /**
   * The mouse moves the view, so it goes where the view has turned: turning
   * right slides it right. The foreleg throws it a little past where it is
   * going and corrects (a flick), makes tiny corrections while it tracks, and
   * when the mouse has wandered to the edge of where it can reach, lifts it
   * and puts it back down nearer the middle. Let go of, it stays where it is.
   */
  updateMouse(dt) {
    const g = this.g;
    const v = g.view;
    const m = this.mouse;
    const held = this.hand[ANCHOR.mouse] > 0.9;
    let dYaw = v.yaw - m.lastYaw;
    let dPitch = v.pitch - m.lastPitch;
    m.lastYaw = v.yaw;
    m.lastPitch = v.pitch;
    if (Math.abs(dYaw) > 0.4) dYaw = 0;          // a new match reset the view, nobody turned
    if (Math.abs(dPitch) > 0.4) dPitch = 0;

    if (held && !m.lifting) {
      m.tz -= dYaw * 0.022;
      m.tx -= dPitch * 0.03;
      m.tx += (0 - m.tx) * Math.min(1, dt * 0.6);
      // tracking: little corrective nudges
      if (g.enemy && this.clock > m.nextFix) {
        m.tz += (this.rng() - 0.5) * 0.004;
        m.nextFix = this.clock + 0.1 + this.rng() * 0.2;
      }
      m.tz = clamp(m.tz, -0.056, 0.056);
      m.tx = clamp(m.tx, -0.016, 0.016);
      // the hand is a spring on the mouse: fast, a little under-damped
      const w = 30, zeta = 0.52;
      m.vz += (w * w * (m.tz - m.z) - 2 * zeta * w * m.vz) * dt;
      m.vx += (w * w * (m.tx - m.x) - 2 * zeta * w * m.vx) * dt;
      m.z += m.vz * dt;
      m.x += m.vx * dt;
      // near the edge and not mid-flick: pick it up and put it back nearer the middle
      if (Math.abs(m.z) > 0.042 && Math.abs(v.yawVel) < 1.1 && (!this.act || this.act.kind === 'fidget')) {
        const to = -Math.sign(m.z) * (0.004 + this.rng() * 0.014);
        m.lifting = { from: m.z, fromX: m.x, to, toX: m.x * 0.5, t: 0, dur: 0.2 + this.rng() * 0.08 };
      }
    } else if (!held) {
      m.vz = 0; m.vx = 0; m.tz = m.z; m.tx = m.x;
    }
    if (m.lifting) {
      const L = m.lifting;
      L.t += dt;
      const u = clamp01(L.t / L.dur);
      const e = EASE.inOut(u);
      m.z = L.from + (L.to - L.from) * e;
      m.x = L.fromX + (L.toX - L.fromX) * e;
      m.lift = Math.sin(Math.PI * u) * 0.014;
      m.tilt = Math.sin(Math.PI * Math.min(1, u * 1.3)) * 0.1;
      if (u >= 1) { m.lifting = null; m.lift = 0; m.tilt = 0; m.tz = m.z; m.tx = m.x; m.vz = 0; m.vx = 0; }
    }

    // the foreleg is never quite still on it
    const alive = held ? 1 : 0;
    const t = this.clock;
    const jitter = (0.5 + g.arousal) * alive;
    const wig = this.ch.wiggle;
    const hand = g.hand;
    hand.dz = clamp(m.z + (Math.sin(t * 1.7) * 0.0006 + Math.sin(t * 4.3) * 0.0003) * jitter + wig * 0.008 * Math.sin(t * 13.5), -0.06, 0.06);
    hand.dx = clamp(m.x + Math.sin(t * 2.3 + 1) * 0.0004 * jitter + wig * 0.006 * Math.cos(t * 13.5), -0.02, 0.02);
    hand.lift = m.lift + this.ch.mouseUp;
    hand.tilt = m.tilt + this.ch.mouseTilt;
    hand.yaw = m.z * 1.4 + clamp(m.vz, -1, 1) * 0.05;
  }

  // ================================================================= posture

  /**
   * How it sits: leaning in when a fight gets close or its health low,
   * sitting back when nothing is happening or it has just won; shifting its
   * weight now and then; recoiling when startled. The take's own body
   * channels ride on top.
   */
  updatePosture(dt) {
    const g = this.g;
    const m = g.match;
    let want;
    if (g.phase === 'playing') {
      if (g.enemy) want = 0.45 + 0.35 * (1 - (m?.hp ?? 100) / 100) + 0.25 * g.loom + 0.15 * g.fear;
      else if (g.dead) want = -0.25;
      else want = 0.18 + 0.2 * g.tilt;
    } else if (g.phase === 'result') want = g.result?.won ? -0.6 : 0.05 + 0.3 * g.tilt;
    else if (g.phase === 'rage-quit') want = 0.1;
    else want = -0.35 * (1 - g.arousal) + 0.1 * g.tilt;
    want = clamp(want, -1, 1);
    const tau = want > this.hunch ? 0.45 : 1.3;
    this.hunch += (want - this.hunch) * (1 - Math.exp(-dt / tau));

    // weight shifts: a new way of sitting every so often
    const s = this.shift;
    s.next -= dt;
    if (s.next <= 0) {
      s.tyaw = (this.rng() - 0.5) * 0.04;
      s.troll = (this.rng() - 0.5) * 0.03;
      s.next = 5 + this.rng() * 14;
    }
    s.yaw += (s.tyaw - s.yaw) * (1 - Math.exp(-dt / 0.9));
    s.roll += (s.troll - s.roll) * (1 - Math.exp(-dt / 0.9));

    // the startle: a spring kicked back, under-damped, so it recoils and comes back
    const j = this.jolt;
    const w = 13, zeta = 0.42;
    j.v += (-w * w * j.x - 2 * zeta * w * j.v) * dt;
    j.x += j.v * dt;

    const lean = this.hunch > 0 ? this.hunch * 0.075 : this.hunch * 0.055;
    const b = this.body;
    b.pitch = lean + this.ch.pitch + j.x * 0.35;
    b.yaw = s.yaw + this.ch.yaw + (this.gaze.at === 'chat' ? 0.03 : 0);
    b.roll = s.roll + this.ch.roll;
    b.rise = -Math.max(0, this.hunch) * 0.005 + this.ch.rise - j.x * 0.03;
  }

  /** Slow and shallow when calm, faster tilted or scared, deep after exertion; a sigh is one long breath out. */
  updateBreath(dt) {
    const g = this.g;
    this.sigh = Math.max(0, this.sigh - dt / 3.2);
    this.inhale = Math.max(0, this.inhale - dt / 2.4);
    const exert = g.slamPhase !== null ? 1 : Math.min(1, g.slamImpact + this.ch.tremble * 0.6);
    const rate = (1.1 + 0.9 * g.arousal + 0.8 * g.tilt + exert * 0.8) * (1 - 0.55 * this.sigh) * (1 - 0.3 * this.inhale);
    this.breath.phase += rate * dt;
    const depth = 0.85 + 0.5 * g.arousal + exert * 0.5 + 1.3 * this.sigh + 0.9 * this.inhale;
    this.breath.depth += (depth - this.breath.depth) * Math.min(1, dt * 2);
  }

  // ==================================================================== gaze

  /**
   * Where the eyes go, by name — the scene knows where each is. A fly looks
   * the way it flies: it fixates and jumps (saccades), so on a calm screen the
   * point it looks at jumps every half second or so rather than drifting.
   */
  updateGaze(dt) {
    const g = this.g;
    const a = this.act;
    const f = this.fix;

    // fixations on the screen, closer together the more wound up it is
    if (this.clock >= f.next) {
      const spread = g.phase === 'playing' ? 0.28 : 0.18;
      f.u = clamp((this.rng() + this.rng() - 1) * spread * 1.6, -0.62, 0.62);
      f.v = clamp(-0.1 + (this.rng() + this.rng() - 1) * spread * 0.7, -0.5, 0.35);
      f.next = this.clock + (0.5 + this.rng() * 1.2) * (1 - 0.45 * g.arousal);
    }
    // a look at the minimap or the HUD corner now and then while it plays
    if (g.phase === 'playing' && !g.dead) {
      this.hudNext -= dt;
      if (this.hudNext <= 0) {
        const quick = !!g.enemy;
        if (!quick || this.rng() < 0.3) this.glance = { at: 'hud', start: this.clock, end: this.clock + (quick ? 0.22 : 0.35 + this.rng() * 0.3) };
        this.hudNext = 3 + this.rng() * 5;
      }
    }

    let at = 'screen';
    const look = a?.look;
    let scripted = null;
    if (look && look.length) for (const l of look) { if (l.t <= a.t) scripted = l.at; }
    if (scripted && !(scripted === 'screen' && g.enemy && g.phase === 'playing')) at = scripted;
    else if (g.phase === 'playing' && g.enemy) at = 'enemy';
    else if (g.phase === 'rage-quit') at = 'chat';
    if (this.glance && this.clock >= this.glance.start && this.clock < this.glance.end && (!scripted || scripted === 'screen')) at = this.glance.at;
    if (this.glance && this.clock >= this.glance.end) this.glance = null;

    // a double-take: it sees the thing coming, looks away as if it had not, and snaps back
    if (this.take2) {
      const t2 = this.take2;
      t2.t += dt;
      if (t2.t > 0.2 && t2.t < 0.36) at = 'down';
      if (t2.t >= 0.36 && !t2.jolted) { t2.jolted = true; this.kick(0.7); }
      if (t2.t > 0.9) this.take2 = null;
    }
    this.gaze.at = at;
    this.gaze.u = f.u;
    this.gaze.v = f.v;

    // the head's own moves on top: shaken, dipped, tilted, and a nod to the queue music
    const shake = this.ch.shake;
    this.headYaw = shake * 0.1 * Math.sin(2 * Math.PI * (a?.shakeHz ?? 2.4) * (a?.t ?? 0));
    const lobby = (g.phase === 'queue' || g.phase === 'switching' || (g.phase === 'result' && g.result?.won)) && !a;
    this.groove += ((lobby ? 1 - 0.6 * g.tilt : 0) - this.groove) * Math.min(1, dt * 1.5);
    const w = (this.clock * this.bpm / 60) % 1;
    const bob = w < 0.25 ? Math.sin((w / 0.25) * Math.PI / 2) : Math.cos(((w - 0.25) / 0.75) * Math.PI / 2);
    this.headPitch = this.ch.nod + this.groove * 0.035 * bob;
    this.headRoll = this.ch.headRoll + (this.take2 && this.take2.t > 0.36 ? Math.sin((this.take2.t - 0.36) * 9) * 0.06 * (1 - (this.take2.t - 0.36) / 0.54) : 0);
  }

  // ============================================================== the keyboard

  /** A shove sends it sliding; a fix brings it home. Between the two it stays put. */
  updateKeyboard() {
    const kb = this.kb;
    const a = this.act;
    if (a?.kind === 'shove' && kb.from && kb.to) {
      const k = this.ch.kbPush;
      kb.x = kb.from.x + (kb.to.x - kb.from.x) * k;
      kb.z = kb.from.z + (kb.to.z - kb.from.z) * k;
      kb.yaw = kb.from.yaw + (kb.to.yaw - kb.from.yaw) * k;
    } else if (a?.kind === 'fixKeyboard') {
      if (!kb.from || kb.fixing !== a) { kb.from = { x: kb.x, z: kb.z, yaw: kb.yaw }; kb.fixing = a; }
      const k = 1 - this.ch.kbFix;
      kb.x = kb.from.x * k;
      kb.z = kb.from.z * k;
      kb.yaw = kb.from.yaw * k;
    } else {
      kb.from = null; kb.fixing = null;
    }
  }
}
