/**
 * Damian says six seven.
 *
 * A classroom. The teacher writes on the board; Damian sits at his desk.
 * Whenever a six and a seven turn up together — page 67, 58 + 9, "6, 7, 8,
 * what comes next?" — that is a cue, and a cue drives reward dopamine (PAM)
 * in his simulated brain in proportion to how funny the meme still is. When
 * the dopamine outruns his restraint he does it: "SIX SEVEN", both palms
 * weighing up and down. Nobody presses a button; sixSevenBrain.js decides.
 *
 * What follows is the whole psychology of a classroom meme, and none of it is
 * scripted per case:
 *
 *   the class laughs      -> a reward burst. The mushroom body learns the
 *                            classroom is a good place to do it.
 *   ... but less each time: a joke wears out. Freshness drops with every use
 *                            and comes back slowly, so the tenth 67 in a row
 *                            lands in silence — and silence stings a little.
 *   the teacher is looking -> restraint: PPL1 (punishment dopamine) holds the
 *                            urge down, more with every strike on the board.
 *   the teacher's back is  -> no restraint. But an unseen 67 makes the teacher
 *   turned                   suspicious, and a suspicious teacher whips round.
 *   caught                 -> a strike. Three strikes is detention: lines.
 *   bored                  -> with nothing on the board for too long, he
 *                            mutters one unprompted.
 *
 * Plain JS: tools/sim-67.mjs runs the same lesson headless.
 */
import { PALM_HIGH, PALM_LOW, NOTEBOOK, TEACHER_AT_BOARD, TEACHER_AT_CLASS } from '../scene/sixSevenLayout.js';

export const NAME = 'Damian';
export const PHASES = { LISTEN: 'listen', SIXSEVEN: 'sixseven', DETENTION: 'detention' };
export const TEACH = { WRITE: 'write', ASK: 'ask', ANSWER: 'answer', LOOK: 'look', SCOLD: 'scold', DETENTION: 'detention' };

/** Urge minus restraint that makes him do it. */
export const GO = 1;
export const MAX_STRIKES = 3;
const GESTURE_S = 1.9;
const MUTTER_S = 1.1;
/** Beats of the gesture per second: one "six", one "seven". */
export const BEAT_HZ = 2.6;
const DETENTION_S = 13;
export const DETENTION_LINES = 8;
const HISTORY = 16;

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
const ease = (v, target, rate, dt) => v + (target - v) * Math.min(1, dt * rate);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------- the lesson

/**
 * One thing on the board. `cue` is how much of a "six seven" it is (0 none,
 * 1 the number itself), `on` says when it lands: as it is written, when the
 * teacher turns and says it to the class, or only when the answer goes up. `at` is how far through the writing the six and
 * the seven appear.
 */
function makeItem(rng) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const roll = rng();
  if (roll < 0.14) {
    const a = 20 + Math.floor(rng() * 40);
    return { text: `${a} + ${67 - a} = ?`, answer: '67', cue: 1, on: 'answer', subject: 'maths' };
  }
  // said to the class, not written with its back turned: he is being watched when it lands
  if (roll < 0.23) return { text: 'Open your books at page 67.', answer: '', cue: 1, on: 'ask', subject: 'reading' };
  if (roll < 0.31) return { text: '6 × 7 = ?', answer: '42', cue: 0.7, on: 'write', at: 0.5, subject: 'maths' };
  if (roll < 0.38) return { text: '6, 7, 8 … what comes next?', answer: '9', cue: 0.95, on: rng() < 0.5 ? 'ask' : 'write', at: 0.3, subject: 'maths' };
  if (roll < 0.44) {
    const b = 10 + Math.floor(rng() * 40);
    return { text: `67 − ${b} = ?`, answer: String(67 - b), cue: 1, on: 'write', at: 0.2, subject: 'maths' };
  }
  if (roll < 0.49) return { text: pick(['In 1967 …', 'Route 67 runs north.', 'Room 67, after the break.']), answer: '', cue: 0.85, on: 'write', at: 0.6, subject: 'history' };
  if (roll < 0.54) return { text: pick(['7 × 6 = ?', '76 − 9 = ?', '13 = 6 + ?']), answer: pick(['42', '67', '7']), cue: 0.55, on: 'write', at: 0.4, subject: 'maths' };
  // nothing to see here
  const a = 2 + Math.floor(rng() * 8), b = 2 + Math.floor(rng() * 4);
  return pick([
    { text: `${a * 10 + b} + ${b * 3} = ?`, answer: String(a * 10 + b + b * 3), cue: 0, subject: 'maths' },
    { text: `${a} × ${b} = ?`, answer: String(a * b), cue: 0, subject: 'maths' },
    { text: 'Spell: Drosophila', answer: '', cue: 0, subject: 'spelling' },
    { text: 'Photosynthesis needs light.', answer: '', cue: 0, subject: 'biology' },
    { text: 'The mushroom body learns.', answer: '', cue: 0, subject: 'biology' },
    { text: `${a * b} ÷ ${a} = ?`, answer: String(b), cue: 0, subject: 'maths' },
  ]);
}

/** A fly, as Fly.jsx reads it: posture, fear, the foreleg. Mutated in place. */
class Body {
  constructor() {
    this.grip = 0;
    this.fear = 0;
    this.arousal = 0.1;
    this.collapse = 0;
    this.headRoll = 0;
    this.body = { pitch: 0, yaw: 0, roll: 0, rise: 0 };
  }
}

export class SixSeven {
  constructor({ seed = 1, onEvent = () => {} } = {}) {
    this.rng = makeRng(seed);
    this.onEvent = onEvent;
    this.clock = 0;
    this.day = 1;

    /** Damian. */
    this.fly = new Body();
    this.phase = PHASES.LISTEN;
    this.gripTarget = PALM_LOW;
    /** The gesture in progress: { t, dur, mutter, cue, seen, caught, beat }. */
    this.gesture = null;
    this.cooldown = 0;
    this.goT = 0;

    // what the brain reports back
    this.urge = 0;       // PAM above rest, scaled: 1 is enough to do it unrestrained
    this.dread = 0;      // PPL1 above rest, scaled
    this.neural = { reward: 0, punish: 0 };
    this.neuralRest = null;
    this.memory = 0;
    this.learned = 0;

    // what goes into the brain
    this.cue = 0;
    this.cueStrength = 0;
    this.rewardPulse = 0;
    this.punishPulse = 0;
    this.speaking = 0;

    // the meme, and the classroom
    this.fresh = 1;          // how funny it still is
    this.boredom = 0.2;
    this.strikes = 0;
    this.lines = 0;          // written in detention
    this.detentionT = 0;
    this.laughter = 0;       // the class, right now
    this.cueOpen = null;     // a cue he has not answered yet

    /** The teacher. */
    this.teacher = new Body();
    this.teacher.yaw = TEACHER_AT_BOARD;
    this.teach = {
      phase: TEACH.WRITE, t: 0, dur: 3, item: makeItem(this.rng), written: 0, answered: 0,
      cued: false, suspicion: 0.1, whipAt: null, holdT: 0,
    };
    this.itemCount = 1;

    this.stats = {
      said: 0, laughs: 0, flops: 0, caught: 0, held: 0, unprompted: 0, detentions: 0,
      cues: 0, bestLaugh: 0, streak: 0, bestStreak: 0,
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
  setImpulse(urge, dread) { this.urge = urge; this.dread = dread; }

  get dopamine() { return this.urge; }
  /** Is the teacher looking at the class? 0..1 as it turns. */
  get watching() {
    const d = Math.abs(wrapAngle(this.teacher.yaw - TEACHER_AT_CLASS));
    return clamp(1 - d / 1.1, 0, 1);
  }

  /** How hard a cue hits: the joke's freshness, and what the classroom has taught him. */
  get hype() { return this.fresh * clamp(0.8 + this.memory * 0.5, 0.35, 1.25); }

  /** What holds the urge down: being watched, the strikes on the board, dread. */
  get restraint() {
    const w = this.watching;
    return w * (0.45 + this.dread * 0.8 + this.strikes * 0.22) + Math.max(0, -this.memory) * 0.35;
  }

  // -------------------------------------------------------------- update

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.clock += dt;
    this.updateTeacher(dt);
    this.updateDamian(dt);

    this.rewardPulse = Math.max(0, this.rewardPulse - dt * 1.6);
    this.punishPulse = Math.max(0, this.punishPulse - dt * 1.2);
    this.speaking = Math.max(0, this.speaking - dt * 1.5);
    this.laughter = Math.max(0, this.laughter - dt * 0.7);
    this.cue = Math.max(0, this.cue - dt * this.cue * 0.75);
    if (this.cue < 0.04) this.cue = 0;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.fresh = clamp(this.fresh + dt * (1 - this.fresh) / 95, 0, 1);
  }

  // ------------------------------------------------------------ teacher

  setTeach(phase, dur) {
    const t = this.teach;
    t.phase = phase;
    t.t = 0;
    t.dur = dur;
  }

  nextItem() {
    const t = this.teach;
    // a cue he sat through without doing it
    if (this.cueOpen) { this.stats.held += 1; this.record({ kind: 'held', cue: this.cueOpen.cue }); this.cueOpen = null; }
    // never the same thing twice running
    const last = t.item.text;
    do { t.item = makeItem(this.rng); } while (t.item.text === last);
    t.written = 0;
    t.answered = 0;
    t.cued = false;
    this.itemCount += 1;
    this.setTeach(TEACH.WRITE, 2.4 + t.item.text.length * 0.07 + this.rng() * 0.8);
    this.speaking = 1;
    this.onEvent('item', t.item);
  }

  fireCue() {
    const t = this.teach;
    if (t.cued || !t.item.cue) return;
    t.cued = true;
    this.cue = t.item.cue;
    this.cueStrength = t.item.cue;
    this.cueOpen = { cue: t.item.cue, at: this.clock };
    this.stats.cues += 1;
    this.boredom = Math.max(0, this.boredom - 0.15);
    this.onEvent('cue', { cue: t.item.cue, text: t.item.text });
  }

  updateTeacher(dt) {
    const t = this.teach;
    const T = this.teacher;
    const r = this.rng;
    t.t += dt;
    t.suspicion = Math.max(0.05, t.suspicion - dt * 0.005);
    let face = TEACHER_AT_BOARD;

    // a suspicious teacher whips round in the middle of whatever it was doing
    if (t.whipAt !== null && this.clock >= t.whipAt) { t.whipAt = null; t.holdT = 1.3; this.onEvent('whip', {}); }
    if (t.holdT > 0) t.holdT -= dt;

    switch (t.phase) {
      case TEACH.WRITE: {
        if (t.holdT <= 0) t.written = Math.min(1, t.written + dt / t.dur);
        if (t.item.on === 'write' && t.written >= (t.item.at ?? 0.8)) this.fireCue();
        if (t.written >= 1) this.setTeach(TEACH.ASK, t.item.answer ? 1.8 + r() * 1.6 : 1.4 + r());
        break;
      }
      case TEACH.ASK: {
        face = TEACHER_AT_CLASS;
        this.speaking = Math.max(this.speaking, t.t < 0.6 ? 1 : 0);
        if (t.item.on === 'ask' && t.t > 0.45) this.fireCue();
        if (t.t >= t.dur) {
          if (t.item.answer) this.setTeach(TEACH.ANSWER, 2.3);
          else this.nextItem();
        }
        break;
      }
      case TEACH.ANSWER: {
        if (t.holdT <= 0) t.answered = Math.min(1, t.answered + dt / t.dur);
        if (t.item.on === 'answer' && t.answered >= 0.4) this.fireCue();
        if (t.answered >= 1) this.setTeach(TEACH.LOOK, 1 + r() * 1.2);
        break;
      }
      case TEACH.LOOK: {
        face = TEACHER_AT_CLASS;
        if (t.t >= t.dur) this.nextItem();
        break;
      }
      case TEACH.SCOLD: {
        face = TEACHER_AT_CLASS;
        if (t.t >= t.dur) {
          if (this.strikes >= MAX_STRIKES) this.startDetention();
          else this.nextItem();
        }
        break;
      }
      case TEACH.DETENTION: {
        face = TEACHER_AT_CLASS;
        break;
      }
      default: break;
    }
    if (t.holdT > 0) face = TEACHER_AT_CLASS;

    // it turns fast: teachers do
    const d = wrapAngle(face - T.yaw);
    T.yaw += clamp(d, -dt * 6.5, dt * 6.5);
    const writing = (t.phase === TEACH.WRITE || t.phase === TEACH.ANSWER) && t.holdT <= 0;
    T.arousal = ease(T.arousal, t.phase === TEACH.SCOLD ? 0.9 : 0.15 + t.suspicion * 0.4, 4, dt);
    T.body.rise = ease(T.body.rise, writing ? Math.sin(this.clock * 9) * 0.008 : 0, 10, dt);
    T.body.pitch = ease(T.body.pitch, t.phase === TEACH.SCOLD ? 0.12 : writing ? -0.04 : 0, 6, dt);
    T.headRoll = ease(T.headRoll, t.phase === TEACH.SCOLD ? 0.15 : 0, 6, dt);
  }

  // ------------------------------------------------------------- Damian

  updateDamian(dt) {
    const f = this.fly;
    f.fear = ease(f.fear, clamp(this.dread * 0.7 + this.watching * this.strikes * 0.12, 0, 1), 3, dt);
    f.arousal = ease(f.arousal, clamp(0.1 + this.urge * 0.45 + f.fear * 0.3, 0, 1), 4, dt);

    if (this.phase === PHASES.DETENTION) return this.updateDetention(dt);
    if (this.phase === PHASES.SIXSEVEN) return this.updateGesture(dt);

    // --- listening -----------------------------------------------------------
    f.collapse = ease(f.collapse, this.boredom > 0.7 ? (this.boredom - 0.7) * 0.8 : 0, 1.5, dt);
    f.grip = ease(f.grip, 0, 8, dt);
    // the urge shows before he gives in: he leans in, the head tilts
    const lean = clamp(this.urge, 0, 1.4);
    f.body.pitch = ease(f.body.pitch, lean * 0.05, 6, dt);
    f.body.rise = ease(f.body.rise, lean * 0.012, 6, dt);
    f.body.roll = ease(f.body.roll, 0, 8, dt);
    f.body.yaw = ease(f.body.yaw, 0, 8, dt);
    f.headRoll = ease(f.headRoll, lean > 0.5 ? Math.sin(this.clock * 11) * 0.05 * lean : 0, 8, dt);

    if (!this.cue) this.boredom = clamp(this.boredom + dt * 0.032, 0, 1);
    if (this.cueOpen && this.clock - this.cueOpen.at > 3.2) {
      this.stats.held += 1;
      this.record({ kind: 'held', cue: this.cueOpen.cue });
      this.cueOpen = null;
    }

    // does the dopamine outrun the restraint?
    const drive = this.urge - this.restraint;
    if (drive >= GO && this.cooldown <= 0) this.goT += dt;
    else this.goT = Math.max(0, this.goT - dt * 2);
    if (this.goT > 0.12) return this.say(false);

    // bored, unwatched: one under his breath
    if (this.boredom > 0.85 && this.watching < 0.2 && this.cooldown <= 0 && this.rng() < dt * 0.35) return this.say(true);
    return undefined;
  }

  /** He does it. `mutter`: unprompted, smaller, under his breath. */
  say(mutter) {
    const t = this.teach;
    this.phase = PHASES.SIXSEVEN;
    this.goT = 0;
    const seen = this.watching > 0.5;
    this.gesture = {
      t: 0, dur: mutter ? MUTTER_S : GESTURE_S, mutter, cue: mutter ? 0.3 : this.cueStrength,
      caught: false, beat: -1, seenT: 0, startedSeen: seen,
    };
    this.cueOpen = null;
    this.boredom = 0;
    this.stats.said += 1;
    if (mutter) this.stats.unprompted += 1;
    // behind the teacher's back: it may have heard
    if (!seen) {
      if (this.rng() < t.suspicion * (mutter ? 0.35 : 0.75)) t.whipAt = this.clock + 0.1 + this.rng() * 0.75;
      t.suspicion = Math.min(0.9, t.suspicion + (mutter ? 0.06 : 0.16));
    }
    this.onEvent('say', { mutter, seen });
    return undefined;
  }

  updateGesture(dt) {
    const f = this.fly;
    const g = this.gesture;
    g.t += dt;
    const amp = g.mutter ? 0.45 : 1;
    // Two beats. The rigged foreleg is his right, which is the seven's side of
    // the picture: down on "six" while the body rocks the other way, up on "seven".
    const phase = g.t * BEAT_HZ * Math.PI * 2;
    const beat = Math.floor(g.t * BEAT_HZ * 2);
    if (beat !== g.beat) {
      g.beat = beat;
      this.onEvent(beat % 2 === 0 ? 'six' : 'seven', { mutter: g.mutter, n: beat });
    }
    const up = 0.5 - 0.5 * Math.sin(phase);
    this.gripTarget = [
      PALM_LOW[0] + (PALM_HIGH[0] - PALM_LOW[0]) * up,
      PALM_LOW[1] + (PALM_HIGH[1] - PALM_LOW[1]) * up * amp,
      PALM_LOW[2] + (PALM_HIGH[2] - PALM_LOW[2]) * up,
    ];
    const inOut = Math.min(1, g.t * 6, (g.dur - g.t) * 6);
    f.grip = ease(f.grip, Math.max(0, inOut), 18, dt);
    f.collapse = ease(f.collapse, 0, 6, dt);
    f.body.roll = Math.sin(phase) * 0.11 * amp * inOut;
    f.body.rise = Math.abs(Math.sin(phase)) * 0.025 * amp * inOut;
    f.body.yaw = Math.sin(phase * 0.5) * 0.06 * amp * inOut;
    f.body.pitch = ease(f.body.pitch, -0.05 * amp, 8, dt);
    f.headRoll = Math.sin(phase + 0.6) * 0.16 * amp * inOut;

    // The teacher turns. Far enough in, he has had his laugh and drops his
    // palms before it sees them; caught in the middle of "SIX", he has not.
    if (this.watching > 0.55 && g.t > 0.25) {
      if (!g.startedSeen && g.t >= (g.mutter ? 0.6 : 1.0)) return this.land(true);
      g.seenT += dt;
    }
    if (!g.caught && g.seenT > (g.mutter ? 0.5 : 0.18)) { g.caught = true; return this.caught(); }
    if (g.t >= g.dur) return this.land(false);
    return undefined;
  }

  /** It went unpunished: did anyone laugh? `ducked`: he cut it short as the teacher turned. */
  land(ducked) {
    const g = this.gesture;
    const laughs = clamp(this.fresh * (g.mutter ? 0.45 : 0.55 + 0.45 * g.cue) * (ducked ? 0.85 : 1), 0, 1);
    const s = this.stats;
    this.gesture = null;
    this.phase = PHASES.LISTEN;
    this.cooldown = 2.2;
    this.fresh *= g.mutter ? 0.88 : 0.72;
    if (laughs >= 0.22) {
      this.rewardPulse = laughs;
      this.laughter = laughs;
      s.laughs += 1;
      s.bestLaugh = Math.max(s.bestLaugh, laughs);
      s.streak += 1;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      this.record({ kind: 'laugh', laughs, mutter: g.mutter, ducked });
      this.onEvent('laugh', { laughs, ducked });
    } else {
      // nobody laughs. That stings a little.
      this.punishPulse = Math.max(this.punishPulse, 0.35);
      s.flops += 1;
      this.record({ kind: 'flop', laughs, mutter: g.mutter });
      this.onEvent('flop', { laughs });
    }
    return undefined;
  }

  caught() {
    const t = this.teach;
    const s = this.stats;
    this.gesture = null;
    this.phase = PHASES.LISTEN;
    this.cooldown = 3;
    this.strikes += 1;
    this.punishPulse = 1;
    this.laughter = this.fresh * 0.35;
    this.rewardPulse = Math.max(this.rewardPulse, this.fresh * 0.2);
    this.fresh *= 0.92;
    s.caught += 1;
    s.streak = 0;
    t.suspicion = 0.5;
    t.whipAt = null;
    t.holdT = 0;
    this.setTeach(TEACH.SCOLD, 2.2);
    this.record({ kind: 'caught', strikes: this.strikes });
    this.onEvent('caught', { strikes: this.strikes });
    return undefined;
  }

  startDetention() {
    this.phase = PHASES.DETENTION;
    this.detentionT = 0;
    this.lines = 0;
    this.cue = 0;
    this.cueOpen = null;
    this.stats.detentions += 1;
    this.setTeach(TEACH.DETENTION, DETENTION_S);
    this.record({ kind: 'detention' });
    this.onEvent('detention', {});
  }

  /** Lines: "I will not say six seven in class", eight times, foreleg on the notebook. */
  updateDetention(dt) {
    const f = this.fly;
    this.detentionT += dt;
    const k = this.detentionT / DETENTION_S;
    this.lines = Math.min(DETENTION_LINES, Math.floor(k * (DETENTION_LINES + 0.5)));
    this.punishPulse = Math.max(this.punishPulse, 0.25);
    f.collapse = ease(f.collapse, 0.45, 2, dt);
    f.grip = ease(f.grip, 1, 6, dt);
    const w = this.detentionT * 9;
    this.gripTarget = [NOTEBOOK[0] + Math.sin(w * 0.37) * 0.03, NOTEBOOK[1] + Math.abs(Math.sin(w)) * 0.012, NOTEBOOK[2] + Math.sin(w * 0.13) * 0.09];
    f.body.roll = ease(f.body.roll, 0, 6, dt);
    f.body.rise = ease(f.body.rise, 0, 6, dt);
    f.body.pitch = ease(f.body.pitch, 0.1, 3, dt);
    f.headRoll = ease(f.headRoll, 0, 6, dt);
    if (this.detentionT >= DETENTION_S) {
      this.phase = PHASES.LISTEN;
      this.strikes = 0;
      this.day += 1;
      this.boredom = 0.3;
      this.cooldown = 4;
      this.teach.suspicion = 0.25;
      this.onEvent('released', { day: this.day });
      this.nextItem();
    }
    return undefined;
  }

  record(r) {
    this.lastResult = { ...r, at: this.clock };
    this.history.push(this.lastResult);
    if (this.history.length > HISTORY) this.history.shift();
  }
}
