/**
 * The fly and the swatter.
 *
 * A fly stands on a pub table, drinking spilled beer. Someone has a swatter.
 * Nobody controls either of them: the hand is a small script with a temper,
 * and the fly is its connectome — the only thing that makes it leave is its
 * giant fibre, DNp01, crossing threshold in the simulation (swatBrain.js).
 * This module only works out what its eyes see (how big the swatter head is
 * in its visual field, and how fast that grows), moves it when its brain says
 * go, keeps its blood alcohol, and keeps score.
 *
 * The escape follows what is measured in real flies (Card & Dickinson 2008;
 * von Reyn et al. 2014): a looming object drives LPLC2 and LC4, which
 * converge on the giant fibre. A slow loom leaves time to prepare — it raises
 * itself and leans away — and then takes off in the "long mode", stable and
 * aimed away from the threat. A fast loom fires the giant fibre before the
 * posture is ready: the "short mode", quicker, but tumbling and badly aimed.
 *
 * The beer is ethanol, and ethanol acts on the wiring (pharmacology.js, the
 * same model as the bar): GABA synapses land harder, acetylcholine and
 * glutamate ones softer. Nobody tells a drunk fly to react later; its giant
 * fibre just gets there later.
 *
 * Plain JS: tools/sim-swat.mjs runs the same game headless.
 */
import {
  PUDDLES, BOTTLE, SWATTER, swatterHead, wristFor, WRIST_BACK, distToBottle, EYE_HEIGHT, EYE_FORWARD, clampToArena, inPuddle,
} from '../scene/swatLayout.js';

export const PHASES = { GROUND: 'ground', AIR: 'air', STUNNED: 'stunned', OUT: 'out' };
export const HAND = { WAIT: 'wait', STALK: 'stalk', HOVER: 'hover', SWING: 'swing', IMPACT: 'impact', LIFT: 'lift' };

/** Giant fibre output, above rest, that commits to takeoff. */
export const TAKEOFF = 1;
/** Below takeoff, the level at which it starts to prepare: rises, leans away. */
export const PREPARE = 0.3;
/** Preparation it needs for a long-mode takeoff, seconds. */
const LONG_MODE_PREP = 0.12;
const STUN_S = 4.2;
const HISTORY = 16;

// ---------------------------------------------------------------- ethanol
/**
 * The bar's model, on a faster clock: body ethanol in mM (whole-body, as fly
 * work reports it), first-order absorption from the crop, zero-order
 * elimination. An afternoon at this table passes in minutes, so the rates are
 * compressed; the thresholds are the bar's.
 */
export const MM_PER_PERMILLE = 21.7;
const SIP_MM_PER_S = 0.75;           // eventual body ethanol per second of drinking
const ABSORB_S = 7;
const ELIMINATE_MM_PER_S = 0.05;
export const SEDATION_MM = 34;      // loss of righting: it passes out
const WAKE_MM = 20;

function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const band = (lo, hi, x) => smooth(clamp((x - lo) / (hi - lo), 0, 1));
const angleTo = (from, to) => Math.atan2(to[0] - from[0], to[2] - from[2]);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (v, target, rate, dt) => v + (target - v) * Math.min(1, dt * rate);

function nearestPuddle(x, z) {
  let best = PUDDLES[0], bd = Infinity;
  for (const p of PUDDLES) {
    // distance to its edge, not its centre: a big spill is closer than it looks
    const d = Math.max(0, -inPuddle(p, x, z));
    if (d < bd) { bd = d; best = p; }
  }
  return { puddle: best, dist: bd };
}

/**
 * The fly, as Fly.jsx and the scene read it: posture, fear, collapse, and
 * what its foreleg and proboscis are doing. Mutated in place.
 */
class FlyBody {
  constructor(x, z, heading) {
    this.pos = [x, 0, z];
    this.heading = heading;
    this.phase = PHASES.GROUND;
    /** What it is doing on the table, for the scene and the panel. */
    this.action = 'idle';
    this.grip = 0;
    this.fear = 0;
    this.arousal = 0.1;
    this.collapse = 0;
    this.sway = 0;
    this.headRoll = 0;
    this.body = { pitch: 0, yaw: 0, roll: 0, rise: 0 };
    /** Whole-body attitude in flight, applied by the scene around the scan. */
    this.flight = { pitch: 0, roll: 0, speed: 0 };
    /** 0..1: wings up and beating (a blur in the scene). */
    this.wings = 0;
    this.walking = 0;
    this.stride = 0;
    /** 0..1 of the way from the mouthparts to the beer. */
    this.proboscis = 0;
    /** The foreleg: 'rest', 'groom' (rubbing its eye) or 'tap' (dabbing the beer). */
    this.leg = 'rest';
    this.legPhase = 0;
    /** A landing's squash, and a drunk landing's stumble, decaying. */
    this.land = 0;
    this.stumble = 0;
    this.wander = 0;
  }
}

export class SwatGame {
  constructor({ seed = 1, onEvent = () => {} } = {}) {
    this.rng = makeRng(seed);
    this.onEvent = onEvent;
    this.clock = 0;
    /** Slow motion around the blow; the scene and the brain both scale time by it. */
    this.timeScale = 1;

    const start = PUDDLES[0];
    this.fly = new FlyBody(start.x + start.r + 0.5, start.z + 0.3, -1.9);

    // what the brain reports back
    this.escape = 0;
    this.neural = { reward: 0, punish: 0 };
    this.neuralRest = null;
    this.memory = 0;
    this.learned = 0;

    // what goes into the brain
    this.loom = 0;
    this.theta = 0;
    this.thetaDot = 0;
    this.motion = 0;
    this.feeding = 0;
    this.rewardPulse = 0;
    this.punishPulse = 0;
    this.mechPulse = 0;

    // its state
    this.craving = 0.6;
    this.crop = 0;
    this.bac = 0;
    this.ethanolRise = 0;
    this.peakBac = 0;
    this.prepT = 0;
    this.pendingTakeoff = null;
    this.air = null;
    this.stunT = 0;
    this.groomT = 0;
    this.tapT = 0;
    this.lastMode = null;
    this.lastReaction = null;
    this.warned = { tipsy: false, drunk: false };

    // the hand
    this.hand = {
      phase: HAND.WAIT,
      t: 0,
      dur: 4,
      u: [1, 0],
      aim: [0, 0, 0],
      wrist: [0, 30, 0],
      from: [0, 30, 0],
      angle: SWATTER.raised,
      skill: 0.25,
      feint: null,
      swingDur: 0.4,
      head: null,
      headPrev: null,
      headSpeed: 0,
      takeoffAt: null,
      swingAt: null,
      shake: 0,
      impactAt: null,
    };
    this.hand.head = swatterHead(this.hand.wrist, this.hand.u, this.hand.angle);

    this.stats = {
      swings: 0, escapes: 0, hits: 0, near: 0, whiffs: 0, early: 0, feints: 0,
      long: 0, short: 0, streak: 0, bestStreak: 0,
      reactions: [], best: null, sipped: 0, blackouts: 0,
    };
    this.history = [];
    this.lastResult = null;
  }

  // -------------------------------------------------------- brain wiring

  setNeuralReadout(reward, punish) {
    this.neural = { reward, punish };
    if (!this.neuralRest) this.neuralRest = { reward, punish };
  }

  setNeuralRest(reward, punish) { this.neuralRest = { reward, punish }; }
  setMemory(value, learned) { this.memory = value; this.learned = learned; }
  setEscape(e) { this.escape = e; }

  /** How wary the table has made it: learned avoidance, in 0..1. */
  get vigilance() { return clamp(Math.max(0, -this.memory) * 1.1 + this.learned * 0.25, 0, 1); }
  get dopamine() { return this.neuralRest ? Math.max(0, this.neural.reward - this.neuralRest.reward) * 6 : 0; }
  get phase() { return this.fly.phase; }
  /** Blood alcohol, per mille, as the panel shows it. */
  get permille() { return this.bac / MM_PER_PERMILLE; }
  /** 0..1 of the way to passing out: what pharmacology.js acts on. */
  get intox() { return clamp(this.bac / SEDATION_MM, 0, 1); }
  // pharmacology.js reads these too; there is no nicotine at this table
  get nicotine() { return 0; }
  get hangover() { return 0; }
  /** Kept for the panel's old name. */
  get hunger() { return this.craving; }

  // -------------------------------------------------------------- update

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.clock += dt;
    this.updateHand(dt);
    this.see(dt);
    this.updateBody(dt);
    this.updateFly(dt);

    this.rewardPulse = Math.max(0, this.rewardPulse - dt * 2.5);
    this.punishPulse = Math.max(0, this.punishPulse - dt * 1.2);
    this.mechPulse = Math.max(0, this.mechPulse - dt * 3);
    this.hand.shake = Math.max(0, this.hand.shake - dt * 3);
  }

  /**
   * Slow motion: the last part of a swing, and the moment after it lands.
   * Called by the scene with real (unscaled) time; the headless sim never
   * calls it, so its results do not depend on it.
   */
  updateTimeScale(realDt) {
    const h = this.hand;
    let target = 1;
    if (h.phase === HAND.SWING && h.t / h.dur > 0.45) target = 0.22;
    else if (h.phase === HAND.IMPACT && h.t < 0.18) target = 0.3;
    const rate = target < this.timeScale ? 18 : 3;
    this.timeScale += (target - this.timeScale) * Math.min(1, realDt * rate);
  }

  /** Where its eyes are, in the world. */
  eye() {
    const f = this.fly;
    return [
      f.pos[0] + Math.sin(f.heading) * EYE_FORWARD,
      f.pos[1] + EYE_HEIGHT,
      f.pos[2] + Math.cos(f.heading) * EYE_FORWARD,
    ];
  }

  /**
   * What the looming detectors get: the angle the swatter head subtends and
   * how fast it grows. A head seen face-on looks its full size; seen edge-on,
   * a sliver.
   */
  see(dt) {
    const h = this.hand.head;
    const e = this.eye();
    const d = [h.center[0] - e[0], h.center[1] - e[1], h.center[2] - e[2]];
    const dist = Math.max(0.15, Math.hypot(d[0], d[1], d[2]));
    const cos = Math.abs((d[0] * h.normal[0] + d[1] * h.normal[1] + d[2] * h.normal[2]) / dist);
    const radius = Math.sqrt(SWATTER.headLength * SWATTER.headWidth) / 2 * (0.3 + 0.7 * cos);
    const theta = 2 * Math.atan(radius / dist);
    // the first frame has nothing to compare with
    const raw = this.theta ? (theta - this.theta) / Math.max(dt, 1e-3) : 0;
    this.thetaDot += (raw - this.thetaDot) * Math.min(1, dt * 25);
    this.theta = theta;

    // expansion is what LPLC2 is tuned to; sheer size adds a little
    const grow = Math.max(0, this.thetaDot) / 4.5 + Math.max(0, theta - 0.35) * 0.22;
    // a wary fly's looming pathway answers sooner
    this.loom = clamp(grow * (1 + this.vigilance * 0.8), 0, 2.4);
    const hs = this.hand.headSpeed;
    const flying = this.fly.phase === PHASES.AIR ? this.fly.flight.speed / 14 : 0;
    this.motion = clamp((theta > 0.08 ? hs / 30 : 0) + flying, 0, 1);
  }

  /** Ethanol: crop -> body -> out, and what the level does to how it moves. */
  updateBody(dt) {
    if (this.feeding) this.crop += SIP_MM_PER_S * dt;
    const absorbed = this.crop * (1 - Math.exp(-dt / ABSORB_S));
    this.crop -= absorbed;
    const before = this.bac;
    this.bac = Math.max(0, this.bac + absorbed - ELIMINATE_MM_PER_S * dt);
    this.ethanolRise = Math.max(0, (this.bac - before) / Math.max(dt, 1e-3));
    this.peakBac = Math.max(this.peakBac, this.bac);
    // ataxia: the sway, as at the bar
    this.fly.sway = band(8, 28, this.bac);

    if (!this.warned.tipsy && this.permille >= 0.5) { this.warned.tipsy = true; this.onEvent('tipsy', {}); }
    if (!this.warned.drunk && this.permille >= 1.1) { this.warned.drunk = true; this.onEvent('drunk', {}); }
    if (this.permille < 0.3) this.warned = { tipsy: false, drunk: false };
  }

  // ---------------------------------------------------------------- fly

  updateFly(dt) {
    const f = this.fly;
    const rest = this.neuralRest;
    const punish = rest ? Math.max(0, this.neural.punish - rest.punish) * 5 : 0;
    const fearTarget = clamp(punish * 0.6 + this.loom * 0.35 + this.vigilance * 0.15, 0, 1);
    f.fear = ease(f.fear, fearTarget, 3, dt);
    f.arousal = ease(f.arousal, clamp(0.1 + f.fear * 0.7 + this.escape * 0.3, 0, 1), 4, dt);
    this.craving = clamp(this.craving + dt * 0.011 * (1 - this.intox * 0.7), 0, 1);
    f.land = Math.max(0, f.land - dt * 5);
    f.stumble = Math.max(0, f.stumble - dt * 1.6);
    this.feeding = 0;

    if (f.phase === PHASES.STUNNED) return this.updateStunned(dt);
    if (f.phase === PHASES.OUT) return this.updateOut(dt);
    if (f.phase === PHASES.AIR) return this.updateAir(dt);

    // --- on the table ------------------------------------------------------
    f.collapse = Math.max(0, f.collapse - dt * 0.8);
    f.wings = ease(f.wings, this.pendingTakeoff ? 1 : 0, 20, dt);

    if (this.bac >= SEDATION_MM) return this.passOut();

    if (this.pendingTakeoff) {
      // the takeoff itself: it pushes off with its middle legs, nose up
      const pt = this.pendingTakeoff;
      pt.t -= dt;
      f.proboscis = ease(f.proboscis, 0, 40, dt);
      f.body.rise = ease(f.body.rise, 0.13, 50, dt);
      f.body.pitch = ease(f.body.pitch, -0.3, 50, dt);
      if (pt.t <= 0) this.launch(pt.mode);
      return undefined;
    }

    if (this.escape >= TAKEOFF && f.collapse < 0.3) {
      const mode = this.prepT >= LONG_MODE_PREP ? 'long' : 'short';
      // the motor program still takes a moment; the short mode skips most of it
      this.pendingTakeoff = { mode, t: mode === 'long' ? 0.02 : 0.008 };
      f.leg = 'rest';
      return undefined;
    }

    // preparing: it stands up and leans away from what is coming
    const threat = this.hand.head.center;
    if (this.escape >= PREPARE) this.prepT += dt;
    else this.prepT = Math.max(0, this.prepT - dt * 0.5);
    const prep = clamp(this.prepT / LONG_MODE_PREP, 0, 1) * (this.escape >= PREPARE ? 1 : 0.5);
    const away = wrapAngle(angleTo(threat, f.pos) - f.heading);

    const handNear = this.hand.phase === HAND.STALK || this.hand.phase === HAND.HOVER || this.hand.phase === HAND.SWING;
    // a frightened fly freezes rather than walks
    const frozen = prep > 0.1 || (handNear && f.fear > 0.35);
    const sway = f.sway;

    const { puddle, dist } = nearestPuddle(f.pos[0], f.pos[2]);
    const inside = inPuddle(puddle, f.pos[0], f.pos[2]) > 0.05;
    // it wants beer while it craves it, and stops when it has had enough —
    // counting what is still in its crop — unless it really craves it
    const load = (this.bac + this.crop) / SEDATION_MM;
    const wants = this.craving > 0.08 && (load < 0.62 || this.craving > 0.97);
    let walk = 0;
    let action = 'idle';
    if (frozen) {
      action = prep > 0.1 ? 'prep' : 'freeze';
    } else if (inside && wants) {
      // drinking: the proboscis down in the beer, pumping
      action = 'drink';
      this.feeding = 1;
      this.craving = Math.max(0, this.craving - dt * 0.03);
      this.stats.sipped += dt;
      if (this.rng() < dt * 1.2) this.rewardPulse = Math.min(1, this.rewardPulse + 0.5);
      // now and then a foreleg dabs the beer: flies taste with their feet too
      if (this.tapT <= 0 && this.rng() < dt * 0.25) this.tapT = 0.9;
    } else if (wants && this.craving > 0.3) {
      action = 'walk';
      const target = [puddle.x, 0, puddle.z];
      const want = angleTo(f.pos, target) + (this.rng() - 0.5) * sway * 1.4;
      f.heading += clamp(wrapAngle(want - f.heading), -dt * 2.4, dt * 2.4);
      walk = 0.75 * (1 - f.fear * 0.6) * (1 - sway * 0.45);
      void dist;
    } else if (f.wander > 0) {
      action = 'walk';
      walk = 0.5 * (1 - sway * 0.4);
    } else if (this.groomT > 0) {
      action = 'groom';
    } else if (this.rng() < dt * 0.12) {
      // a few steps somewhere, or a wash
      if (this.rng() < 0.5) { f.heading += (this.rng() - 0.5) * 1.6; f.wander = 0.8 + this.rng() * 1.2; }
      else this.groomT = 1.8 + this.rng() * 2.2;
    }
    if (frozen) { f.wander = 0; this.groomT = 0; this.tapT = 0; }
    if (f.wander > 0) f.wander -= dt;
    if (action !== 'groom') this.groomT = Math.max(0, this.groomT - dt * 4);
    else this.groomT -= dt;
    if (action !== 'drink') this.tapT = 0;
    this.tapT = Math.max(0, this.tapT - dt);
    f.action = action;

    // --- the foreleg and the proboscis ---------------------------------------
    f.leg = action === 'groom' ? 'groom' : this.tapT > 0 ? 'tap' : 'rest';
    f.legPhase += dt * (f.leg === 'groom' ? 9 : 4);
    const legOn = f.leg === 'groom' ? 1 : f.leg === 'tap' ? Math.sin(Math.PI * clamp(1 - this.tapT / 0.9, 0, 1)) : 0;
    f.grip = ease(f.grip, legOn, 10, dt);
    const pump = action === 'drink' ? 0.82 + 0.18 * Math.sin(this.clock * 8.5) : 0;
    f.proboscis = ease(f.proboscis, pump, action === 'drink' ? 6 : 12, dt);

    // --- walking -------------------------------------------------------------
    f.walking = ease(f.walking, walk, 8, dt);
    if (f.walking > 0.01) {
      // drunk, the heading wanders
      f.heading += (this.rng() - 0.5) * sway * dt * 9;
      f.pos[0] += Math.sin(f.heading) * f.walking * dt;
      f.pos[2] += Math.cos(f.heading) * f.walking * dt;
      const [x, z] = clampToArena(f.pos[0], f.pos[2], 0.6);
      if (x !== f.pos[0] || z !== f.pos[2]) f.heading += Math.PI * 0.6;
      f.pos[0] = x; f.pos[2] = z;
      f.stride += dt * f.walking * 16;
    }

    // --- posture -------------------------------------------------------------
    // a tripod gait lifts the body twice a stride and rocks it side to side
    const gait = f.walking * (Math.abs(Math.sin(f.stride)) * 0.018);
    const rock = f.walking * Math.sin(f.stride) * 0.045;
    const drunkRoll = sway * (Math.sin(this.clock * 1.3) * 0.07 + Math.sin(this.clock * 2.9) * 0.03);
    const riseT = prep * 0.07 + gait - f.land * 0.06 + (action === 'drink' ? -0.015 : 0);
    const pitchT = -prep * 0.12 + f.land * 0.12 + (action === 'drink' ? 0.08 : 0) + (action === 'groom' ? -0.05 : 0);
    const rollT = Math.sin(away) * prep * 0.06 + rock + drunkRoll + f.stumble * 0.55 * Math.sign(Math.sin(f.legPhase * 0.3 + 1));
    f.body.rise = ease(f.body.rise, riseT, 14, dt);
    f.body.pitch = ease(f.body.pitch, pitchT, 12, dt);
    f.body.roll = ease(f.body.roll, rollT, 10, dt);
    f.body.yaw = f.walking * Math.sin(f.stride * 0.5) * 0.05;
    // grooming: the head tilts into the rubbing leg
    f.headRoll = action === 'groom' ? -0.18 + Math.sin(f.legPhase) * 0.08 : ease(f.headRoll, 0, 6, dt);
    return undefined;
  }

  passOut() {
    const f = this.fly;
    f.phase = PHASES.OUT;
    f.action = 'out';
    f.leg = 'rest';
    f.grip = 0;
    f.proboscis = 0;
    this.stats.blackouts += 1;
    this.onEvent('out', {});
  }

  /** Passed out: it lies there until enough ethanol is gone. */
  updateOut(dt) {
    const f = this.fly;
    f.collapse = Math.min(1, f.collapse + dt * 1.5);
    f.body.roll = ease(f.body.roll, 0.75, 3, dt);
    f.body.rise = ease(f.body.rise, -0.02, 3, dt);
    f.proboscis = ease(f.proboscis, 0, 6, dt);
    if (this.bac <= WAKE_MM) {
      f.phase = PHASES.GROUND;
      this.craving = Math.min(this.craving, 0.25);
      this.onEvent('wake', {});
    }
  }

  /** Where to land: away from the swatter, and — if it craves it — near the beer. */
  pickLanding(mode) {
    const f = this.fly;
    const threat = this.hand.head.center;
    const awayAngle = angleTo(threat, f.pos);
    const spread = (mode === 'long' ? 0.7 : 1.7) + f.sway * 0.8;
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < 9; i++) {
      const a = awayAngle + (this.rng() - 0.5) * 2 * spread;
      const r = 3 + this.rng() * 3.5;
      const [x, z] = clampToArena(f.pos[0] + Math.sin(a) * r, f.pos[2] + Math.cos(a) * r, 0.7);
      const { dist } = nearestPuddle(x, z);
      const fromThreat = Math.hypot(x - threat[0], z - threat[2]);
      const score = -dist * this.craving * 0.8 + fromThreat * (0.4 + f.fear) + (mode === 'short' ? this.rng() * 3 : 0);
      if (score > bestScore) { bestScore = score; best = [x, 0, z, a]; }
    }
    return best;
  }

  launch(mode) {
    const f = this.fly;
    this.pendingTakeoff = null;
    const [x, , z, a] = this.pickLanding(mode);
    const dist = Math.hypot(x - f.pos[0], z - f.pos[2]);
    const drunk = f.sway;
    this.air = {
      from: f.pos.slice(),
      to: [x, 0, z],
      t: 0,
      dur: 0.45 + dist / 10 + (mode === 'short' ? 0.15 : 0) + drunk * 0.25,
      height: 1.4 + dist * 0.18,
      mode,
      heading0: f.heading,
      heading1: a,
      spin: mode === 'short' ? (this.rng() - 0.5) * 5 : 0,
      wobble: drunk,
    };
    f.phase = PHASES.AIR;
    f.action = 'fly';
    f.leg = 'rest';
    f.grip = 0;
    f.proboscis = 0;
    f.walking = 0;
    this.prepT = 0;
    this.lastMode = mode;
    this.stats[mode] += 1;

    const h = this.hand;
    const swinging = h.phase === HAND.SWING;
    h.takeoffAt = this.clock;
    this.lastReaction = swinging ? (this.clock - h.swingAt) * 1000 : null;
    if (h.phase === HAND.STALK || h.phase === HAND.HOVER) {
      // gone before the swing: the hand was enough
      this.stats.early += 1;
      this.history.push({ kind: 'early', at: this.clock, mode });
      if (this.history.length > HISTORY) this.history.shift();
    }
    if (swinging) {
      this.stats.reactions.push(this.lastReaction);
      if (this.stats.reactions.length > 50) this.stats.reactions.shift();
      if (this.stats.best === null || this.lastReaction < this.stats.best) this.stats.best = this.lastReaction;
    }
    this.onEvent('takeoff', { mode, reaction: this.lastReaction, during: h.phase });
  }

  updateAir(dt) {
    const f = this.fly;
    const A = this.air;
    A.t += dt;
    const k = clamp(A.t / A.dur, 0, 1);
    // off like a spring, then gliding in
    const p = 1 - (1 - k) * (1 - k);
    const prev = f.pos.slice();
    f.pos[0] = lerp(A.from[0], A.to[0], p) + Math.sin(A.t * 9) * A.wobble * 0.25 * Math.sin(Math.PI * k);
    f.pos[2] = lerp(A.from[2], A.to[2], p) + Math.cos(A.t * 7) * A.wobble * 0.25 * Math.sin(Math.PI * k);
    f.pos[1] = Math.sin(Math.PI * Math.min(1, p * 1.05)) * A.height;
    const speed = Math.hypot(f.pos[0] - prev[0], f.pos[1] - prev[1], f.pos[2] - prev[2]) / Math.max(dt, 1e-3);
    f.flight.speed = speed;
    f.wings = ease(f.wings, k < 0.92 ? 1 : 0, 25, dt);
    f.heading = A.heading0 + wrapAngle(A.heading1 - A.heading0) * smooth(Math.min(1, k * 1.6)) + A.spin * Math.sin(Math.PI * k);
    // nose up off the table, level in the air, nose up again to flare before the legs touch
    f.flight.pitch = -0.55 * Math.sin(Math.PI * Math.min(1, k * 2.2)) - 0.3 * band(0.72, 0.95, k) * (1 - band(0.95, 1, k));
    f.flight.roll = (A.spin ? Math.sin(A.t * 18) * 0.35 * (1 - k) : Math.sin(A.t * 7) * 0.05) + Math.sin(A.t * 11) * A.wobble * 0.3;
    f.body.rise = ease(f.body.rise, 0, 10, dt);
    f.body.pitch = ease(f.body.pitch, 0, 10, dt);
    f.body.roll = ease(f.body.roll, 0, 10, dt);
    if (k >= 1) {
      f.pos[1] = 0;
      f.phase = PHASES.GROUND;
      f.flight.pitch = 0; f.flight.roll = 0; f.flight.speed = 0;
      this.air = null;
      this.mechPulse = 1;
      f.land = 1;
      // drunk, it lands badly
      if (A.wobble > 0.3 && this.rng() < A.wobble) { f.stumble = 1; this.onEvent('stumble', {}); }
      this.onEvent('land', {});
    }
  }

  updateStunned(dt) {
    const f = this.fly;
    this.stunT -= dt;
    f.collapse = Math.min(1, f.collapse + dt * 4);
    f.body.roll = ease(f.body.roll, 0.55, 6, dt);
    f.body.rise = ease(f.body.rise, 0, 6, dt);
    f.wings = 0;
    if (this.stunT <= 0) {
      f.phase = this.bac >= SEDATION_MM ? PHASES.OUT : PHASES.GROUND;
      this.onEvent('recovered', {});
    }
  }

  // --------------------------------------------------------------- hand

  pickApproach() {
    // the hand comes from anywhere but the camera's side — and never through the bottle
    const f = this.fly.pos;
    let w = [1, 0];
    for (let i = 0; i < 12; i++) {
      const phi = -Math.PI - 0.35 + this.rng() * (Math.PI + 0.7);
      w = [Math.cos(phi), Math.sin(phi)];
      // the handle runs from the aim back to the wrist: keep all of it clear
      let clear = true;
      for (let k = 0.3; k <= 1.3; k += 0.25) {
        if (distToBottle(f[0] + w[0] * WRIST_BACK * k, f[2] + w[1] * WRIST_BACK * k) < BOTTLE.radius + 1.2) { clear = false; break; }
      }
      if (clear) break;
    }
    return [-w[0], -w[1]];
  }

  /** Where the hand is aiming: the fly, plus where it expects the fly to jump. */
  aimNow(lead = 0) {
    const f = this.fly;
    const u = this.hand.u;
    return [f.pos[0] + u[0] * lead, 0, f.pos[2] + u[1] * lead];
  }

  setHand(phase, dur) {
    const h = this.hand;
    h.phase = phase;
    h.t = 0;
    h.dur = dur;
    h.from = h.wrist.slice();
    h.fromAngle = h.angle;
  }

  updateHand(dt) {
    const h = this.hand;
    const f = this.fly;
    const r = this.rng;
    h.t += dt;
    const k = clamp(h.t / h.dur, 0, 1);

    switch (h.phase) {
      case HAND.WAIT: {
        // parked out of sight, up and behind
        h.wrist = [h.aim[0] - h.u[0] * 26, 22, h.aim[2] - h.u[1] * 26];
        h.angle = SWATTER.raised;
        if (k >= 1 && (f.phase === PHASES.GROUND || f.phase === PHASES.OUT)) {
          h.u = this.pickApproach();
          h.aim = this.aimNow();
          h.wrist = [h.aim[0] - h.u[0] * 26, 22, h.aim[2] - h.u[1] * 26];
          this.setHand(HAND.STALK, 1.3 + r() * 0.9);
          this.onEvent('stalk', {});
        }
        break;
      }
      case HAND.STALK: {
        // closing in slowly, following the fly
        if (f.phase === PHASES.GROUND) {
          const a = this.aimNow();
          h.aim[0] += (a[0] - h.aim[0]) * Math.min(1, dt * 2);
          h.aim[2] += (a[2] - h.aim[2]) * Math.min(1, dt * 2);
        }
        const to = wristFor(h.aim, h.u);
        const e = smooth(k);
        h.wrist = [lerp(h.from[0], to[0], e), lerp(h.from[1], to[1], e), lerp(h.from[2], to[2], e)];
        h.angle = SWATTER.raised;
        if (k >= 1) {
          this.setHand(HAND.HOVER, 0.25 + r() * 1.4 * (1 - h.skill * 0.5));
          h.feint = r() < 0.22 ? { at: h.dur * (0.2 + r() * 0.5), done: false } : null;
        }
        break;
      }
      case HAND.HOVER: {
        if (f.phase === PHASES.AIR) break;
        if (f.phase === PHASES.GROUND && Math.hypot(f.pos[0] - h.aim[0], f.pos[2] - h.aim[2]) > 1.2) {
          // it moved: follow it before striking
          h.aim = this.aimNow();
          this.setHand(HAND.STALK, 0.6 + r() * 0.5);
          break;
        }
        const a = this.aimNow();
        h.aim[0] += (a[0] - h.aim[0]) * Math.min(1, dt * 3);
        h.aim[2] += (a[2] - h.aim[2]) * Math.min(1, dt * 3);
        h.wrist = wristFor(h.aim, h.u);
        // a feint: a twitch of the wrist, not a swing
        let dip = 0;
        if (h.feint && h.t > h.feint.at && h.t < h.feint.at + 0.35) {
          dip = Math.sin(((h.t - h.feint.at) / 0.35) * Math.PI) * 0.22;
          if (!h.feint.done) { h.feint.done = true; this.stats.feints += 1; this.onEvent('feint', {}); }
        }
        h.angle = SWATTER.raised - dip + Math.sin(this.clock * 2.3) * 0.015;
        if (k >= 1 && (f.phase === PHASES.GROUND || f.phase === PHASES.OUT)) {
          // strike: aim a little ahead, where it has learned flies go
          h.aim = this.aimNow(h.skill * 1.5);
          h.wrist = wristFor(h.aim, h.u);
          h.swingAt = this.clock;
          h.takeoffAt = null;
          h.swingDur = 0.52 - h.skill * 0.3 + r() * 0.16;
          this.stats.swings += 1;
          this.setHand(HAND.SWING, h.swingDur);
          this.onEvent('swing', {});
        }
        break;
      }
      case HAND.SWING: {
        // it accelerates all the way down
        const e = Math.pow(k, 1.8);
        h.angle = lerp(SWATTER.raised, SWATTER.a0, e);
        if (k >= 1) { h.angle = SWATTER.a0; this.impact(); this.setHand(HAND.IMPACT, 0.5); }
        break;
      }
      case HAND.IMPACT: {
        h.angle = SWATTER.a0;
        if (k >= 1) this.setHand(HAND.LIFT, 0.9);
        break;
      }
      case HAND.LIFT: {
        const e = smooth(k);
        h.angle = lerp(SWATTER.a0, SWATTER.raised, e);
        const back = [h.aim[0] - h.u[0] * 26, 22, h.aim[2] - h.u[1] * 26];
        const ee = smooth(Math.max(0, k * 1.4 - 0.4));
        h.wrist = [lerp(h.from[0], back[0], ee), lerp(h.from[1], back[1], ee), lerp(h.from[2], back[2], ee)];
        if (k >= 1) {
          // a hit settles them for a while; a miss makes them impatient
          const calm = this.lastResult?.kind === 'hit' ? 9 : 3;
          this.setHand(HAND.WAIT, calm + r() * 4 * (1.2 - h.skill * 0.6));
        }
        break;
      }
      default: break;
    }

    const head = swatterHead(h.wrist, h.u, h.angle);
    if (h.head) {
      const c = h.head.center;
      h.headSpeed = Math.hypot(head.center[0] - c[0], head.center[1] - c[1], head.center[2] - c[2]) / Math.max(dt, 1e-3);
    }
    h.headPrev = h.head;
    h.head = head;
  }

  /** The head is on the table: where is the fly? */
  impact() {
    const h = this.hand;
    const f = this.fly;
    h.shake = 1;
    h.impactAt = this.clock;
    const c = h.head.center;
    const dx = f.pos[0] - c[0], dz = f.pos[2] - c[2];
    const along = dx * h.u[0] + dz * h.u[1];
    const across = -dx * h.u[1] + dz * h.u[0];
    const inside = (m) => Math.abs(along) < SWATTER.headLength / 2 + m && Math.abs(across) < SWATTER.headWidth / 2 + m;
    const airborne = f.phase === PHASES.AIR;
    const since = h.takeoffAt !== null ? this.clock - h.takeoffAt : null;

    let kind;
    if (!airborne && f.phase !== PHASES.STUNNED && inside(0.25)) kind = 'hit';
    else if (airborne && f.pos[1] < 0.5 && inside(0.1)) kind = 'hit';
    else if (since !== null && since < 0.07) kind = 'near';
    else kind = airborne ? 'escape' : 'whiff';

    const s = this.stats;
    if (kind === 'hit') {
      s.hits += 1;
      s.streak = 0;
      h.skill = Math.max(0, h.skill - 0.12);
      this.pendingTakeoff = null;
      this.air = null;
      f.phase = PHASES.STUNNED;
      f.action = 'stunned';
      f.proboscis = 0; f.grip = 0; f.wings = 0; f.leg = 'rest';
      f.pos[1] = 0;
      f.flight.pitch = 0; f.flight.roll = 0;
      this.stunT = STUN_S;
      this.punishPulse = 1;
      this.mechPulse = 1;
    } else {
      s.escapes += 1;
      if (kind === 'near') { s.near += 1; this.punishPulse = Math.max(this.punishPulse, 0.8); }
      else if (kind === 'whiff') { s.whiffs += 1; this.punishPulse = Math.max(this.punishPulse, 0.5); }
      else this.punishPulse = Math.max(this.punishPulse, 0.35);
      s.streak += 1;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      h.skill = Math.min(1, h.skill + 0.05);
    }
    this.lastResult = {
      kind, at: this.clock, reaction: h.takeoffAt !== null ? this.lastReaction : null, margin: since !== null ? since * 1000 : null,
      mode: h.takeoffAt !== null ? this.lastMode : null, swing: h.swingDur * 1000,
    };
    this.history.push(this.lastResult);
    if (this.history.length > HISTORY) this.history.shift();
    this.onEvent(kind === 'hit' ? 'hit' : 'miss', this.lastResult);
  }

  get meanReaction() {
    const r = this.stats.reactions;
    return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
  }
}
