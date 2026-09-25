/**
 * The coder fly's night, as one deterministic state machine.
 *
 * It works on POKYH, its team's real WebUntis frontend, from ten at night
 * until the sun comes up: types the real code (pokyhCode.js) a piece at a
 * time with its right foreleg, saves, reads the terminal, commits, pushes and
 * waits on CI — and drinks coffee. Nobody controls it. Every choice falls out
 * of its state at the moment it commits to the next thing, and that state is
 * partly its simulated brain (neural/codeBrain.js: dopamine, the sleep drive
 * of the dorsal fan-shaped body, the giant fibre, what its mushroom body has
 * learned) and partly the caffeine in its body.
 *
 * Nothing here touches React or three.js. The scene reads the continuous
 * values (where the foreleg goes, how far the proboscis is out, how far it
 * has slumped), the panels read the discrete ones, and tools/sim-code.mjs
 * runs the very same class headless against the same brain. Seeded: the same
 * `seed` replays the same night.
 *
 * THE BODY. Sleep pressure builds the whole time it is awake and drains while
 * it sleeps; the small hours add a circadian dip. Caffeine is modelled like
 * the bar's drugs: a level in mg that is absorbed from the crop and
 * eliminated with a half-life, tolerance that builds, jitters at high levels
 * and a crash as a big dose wears off. What it does is written in
 * codeBrain.js.
 */
import POKYH from './pokyhCode.js';
import {
  tapKeyFor, keyPoint, padPoint, MUG_GRIP, PALM_REST, TYPING_HUNCH, mugPose,
} from '../scene/codeLayout.js';

export const PHASES = {
  IDLE: 'idle',
  /** Foreleg on the keys. */
  TYPING: 'typing',
  /** Foreleg on the trackpad: jumping to a file or to an error. */
  POINTING: 'pointing',
  /** A command is running in the terminal; it watches. */
  RUNNING: 'running',
  /** Mug up to the mouth, proboscis in the coffee. */
  SIPPING: 'sipping',
  /** Its head drops. The giant fibre may or may not catch it. */
  NODDING: 'nodding',
  /** Asleep on the keyboard. */
  ASLEEP: 'asleep',
  /** Sunrise, and the day it sleeps through. */
  MORNING: 'morning',
};

// ------------------------------------------------------------------- time
/** Game minutes per real second. */
const RATE = { awake: 1.5, asleep: 14, day: 115 };
const NIGHT_START = 22 * 60 + 30;
const DAWN = 24 * 60 + 5 * 60;          // the sky starts to lighten
const SUNRISE = 24 * 60 + 6 * 60 + 40;
const MORNING = 24 * 60 + 7 * 60 + 15;  // the night is over, awake or not
const NEXT_NIGHT = 24 * 60 + NIGHT_START;

// -------------------------------------------------------------- caffeine
/**
 * Caffeine, in mg in the body, on a human scale so the numbers read like a
 * coffee menu: a mug is 95 mg. Absorption from the crop is first order;
 * elimination has a half-life — shorter than a person's, flies clear it
 * faster, and it keeps the night's rise and fall visible. The thresholds are
 * for legibility, not measured.
 */
export const MUG_MG = 95;
const SIPS_PER_MUG = 12;
const ABSORB_MIN = 9;
const HALF_LIFE_MIN = 95;
export const JITTER_MG = 130;
export const TOO_MUCH_MG = 240;
/** Caffeine at which the wake effect is half its most. */
const EC50_MG = 90;

// ------------------------------------------------------------- the rest
const HEART_REST = 268;
const HEART_MAX = 410;
const HEART_ASLEEP = 205;
/** Sleep pressure gained per hour awake, and lost per hour asleep (time constant). */
const PRESSURE_PER_HOUR = 0.085;
const RECOVER_MIN = 170;
/** The dFB readout past which it starts to nod off, and past which a nod becomes sleep. */
export const NOD_AT = 0.68;
const DEEP_AT = 0.86;
/** Giant fibre activity that snaps it awake as its head drops towards the keys. */
const JERK_AT = 0.35;

const T = {
  reach: 0.32, release: 0.35,
  lean: 0.7, lift: 0.6, sip: 0.62, lower: 0.6, gulpSip: 0.34,
  refill: 1.9,
  nod: 1.5, jerk: 0.28,
  morning: 11,
  save: 1.1, compile: 1.6, build: 4.2, commit: 1.4, push: 2.2, pull: 2.4,
};

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp3 = (a, b, k, out = [0, 0, 0]) => { out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k; out[2] = a[2] + (b[2] - a[2]) * k; return out; };

export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** "02:47" from game minutes. */
export function clockOf(minute) {
  const m = Math.floor(minute) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ----------------------------------------------------------------- tasks
/**
 * What it works on: real parts of POKYH, each typed from its real file. The
 * order is shuffled per seed; lines are how much it writes before the task
 * is done, in chunks that each end in a save.
 */
const fileIndex = (p) => Math.max(0, POKYH.files.findIndex((f) => f.path.endsWith(p)));
const TASKS = [
  { file: 'WeekGrid.tsx', branch: 'fix/week-grid-ipad', msg: 'fix(timetable): stop the week grid overflowing on iPad', view: 'timetable' },
  { file: 'parts.tsx', branch: 'feat/room-change-chip', msg: 'feat(timetable): show a changed room as a chip', view: 'timetable' },
  { file: 'mensa/page.tsx', branch: 'feat/mensa-vegan-first', msg: 'feat(mensa): list vegan dishes first', view: 'mensa' },
  { file: 'BottomNav.tsx', branch: 'fix/nav-active-tab', msg: 'fix(nav): highlight the active tab on nested routes', view: 'timetable' },
  { file: 'timetable-logic.ts', branch: 'refactor/merge-slots', msg: 'refactor(timetable): merge cancelled and replacement slots in one pass', view: 'timetable' },
  { file: 'Spinner.tsx', branch: 'fix/spinner-flash', msg: 'fix(ui): no spinner flash when the week is cached', view: 'timetable' },
  { file: 'EmptyView.tsx', branch: 'feat/empty-week', msg: 'feat(timetable): an empty state for a week without lessons', view: 'timetable' },
];

/** Type errors it can make, by what went wrong. */
const TYPE_ERRORS = [
  (tok) => `Cannot find name '${tok}'.`,
  (tok) => `Property '${tok}' does not exist on type 'MergedSlot'.`,
  (tok) => `'${tok}' is declared but its value is never read.`,
];
/** Bugs that are not typos: found by the build, or only by CI. */
const BUILD_ERRORS = [
  "Type error: Type 'string | undefined' is not assignable to type 'string'.",
  "Type error: Object is possibly 'undefined'.",
  "Error: Hydration failed: server rendered 'Mo' but the client rendered 'Lu'.",
  "Type error: Argument of type 'TimetableEntry[]' is not assignable to parameter of type 'MergedSlot[]'.",
];
const CI_ONLY = [
  "e2e: expected 6 day columns, received 5 (TZ=UTC on the runner)",
  "lint: 'useMemo' is defined but never used (it was, on my machine)",
  "build: Module not found: Can't resolve './Weekgrid' (case-sensitive filesystem)",
];

/** Keys next to each other, for typos. */
const NEIGHBOURS = {
  a: 'sqz', s: 'adwx', d: 'sfec', f: 'dgrv', g: 'fhtb', h: 'gjyn', j: 'hkum', k: 'jlim', l: 'ko;',
  e: 'wrd', r: 'etf', t: 'ryg', y: 'tuh', u: 'yij', i: 'uok', o: 'ipl', n: 'bmh', m: 'n,j', c: 'xvd', v: 'cbf',
};

export class Coder {
  constructor({ onEvent = () => {}, seed = 20260925, rng, now = () => Date.now() } = {}) {
    this.onEvent = onEvent;
    this.seed = seed;
    this.rng = rng ?? makeRng(seed ^ 0x2c1b3c6d);
    this.now = now;

    this.phase = PHASES.IDLE;
    this.t = 0;
    this.minute = NIGHT_START;
    this.nightStart = NIGHT_START;
    this.night = 1;

    // --- body --------------------------------------------------------------
    this.pressure = 0.3;        // homeostatic sleep pressure, 0..~1.2
    this.crop = 0;              // mg still to be absorbed
    this.caffeine = 0;          // mg in the body
    this.peakCaffeine = 0;      // recent peak, for the crash
    this.tolerance = 0;
    this.caffeineRise = 0;      // mg per game minute, while it climbs
    this.sugar = this.rng() < 0.5; // tonight's coffee: black, or with sugar

    // --- signals (from the brain once it runs) -----------------------------
    this.dopamine = 0;
    this.octopamine = 0;
    this.startle = 0;
    this.fear = 0;
    this.npf = 0.5;
    this.memory = 0;
    this.learned = 0;
    this.neural = null;
    this.dfb = 0;               // the dorsal fan-shaped body's sleep drive, from the brain
    this.dfbTypes = null;       // per FB6 type, for the panel
    this.escape = 0;            // the giant fibre, from the brain
    this.escapeRest = 0;
    this.heartRate = HEART_REST;
    this.flow = 0;
    this.lossStreak = 0;
    this.stressExtra = 0;

    // --- motion ------------------------------------------------------------
    this.grip = 0;
    this.handTarget = keyPoint('j');
    this.from = this.handTarget.slice();
    this.pressDepth = 0;
    this.keyDown = null;        // label of the key under the tarsus, for the scene
    this.lean = 0;
    this.extend = 0;
    this.proboscis = 0;
    this.mugLift = 0;
    this.mugTilt = 0;
    this.fill = 1;
    this.refilling = 0;
    this.collapse = 0;
    this.tingle = 0;
    this.loom = 0;
    this.scroll = 0;            // the editor scrolling up a line: vertical motion on the retina
    this.keyPulse = 0;          // a tap landing
    this.sipPulse = 0;
    this.gaze = 'laptop';
    this.glanceUntil = 0;
    this.pose = { base: [0, 0, 0], yaw: 0, handle: [0, 0, 0] };

    // --- the work ------------------------------------------------------------
    this.taskOrder = TASKS.map((t, i) => [this.rng(), i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
    this.taskIndex = -1;
    this.task = null;
    this.editor = {
      file: 0, lines: POKYH.files[0].lines, upTo: 0, line: 0, text: '', typo: null,
      problems: [], overrides: {}, completion: null, junk: '', tabs: [0], flash: 0,
    };
    this.terminal = [];
    this.ci = null;
    this.app = { view: 'timetable', overlay: null, reloaded: 0 };
    this.plan = null;           // what the foreleg is doing: { kind, ... }
    this.pending = [];          // commands queued after typing

    // --- counts --------------------------------------------------------------
    this.commits = 0;
    this.pushes = 0;
    this.deploys = 0;
    this.errors = 0;
    this.ciFails = 0;
    this.lines = 0;
    this.chars = 0;
    this.sips = 0;
    this.mugs = 0;
    this.caffeineMg = 0;
    this.nods = 0;
    this.jerks = 0;
    this.sleeps = 0;
    this.sleptMin = 0;
    this.tests = { passed: 36, total: 36 };
    this.nightStats = this.freshStats();
    /** The night so far, a sample every few game minutes: caffeine against the sleep drive, for the panel. */
    this.series = [];
    this.seriesAt = 0;

    this.lastResult = null;
    this.history = [];
    this.idleFor = 0;
    this.nextDecisionAfter = 1.2;
    this.coffeeNudge = 0;       // a jerk awake makes it want coffee, now
    this.sated = 0;             // just had some: the urge rests a while
    this.lastEvent = null;
    this.why = 'opening the editor';

    this.say('$ npm run dev', 'cmd');
    this.say('▲ Next.js 16 · Local: http://localhost:3000', 'dim');
    this.say('✓ Ready in 1.3s', 'ok');
    this.nextTask();
  }

  emit(type, detail) { this.lastEvent = { type, at: this.now() }; this.onEvent(type, detail); }

  freshStats() { return { commits: 0, deploys: 0, errors: 0, mg: 0, lines: 0, slept: 0, sips: 0, asleepAt: null }; }

  // ================================================================ derived

  get clockMin() { return this.minute % (24 * 60); }
  get clock() { return clockOf(this.minute); }
  /** 0 at ten at night, 1 at the end of the night. */
  get nightK() { return clamp01((this.minute - this.nightStart) / (MORNING - NIGHT_START)); }
  /** 0 dark .. 1 sun up: the sky's clock. During the day's time-lapse it runs on through dusk. */
  get daylight() {
    const m = this.minute - this.nightStart + NIGHT_START;
    if (m < DAWN) return 0;
    if (m < SUNRISE + 60) return smooth(DAWN, SUNRISE + 60, m);
    // the day, then dusk, as the next night comes
    return 1 - smooth(NEXT_NIGHT - 150, NEXT_NIGHT - 10, m);
  }
  /** The small hours: a circadian dip in alertness, deepest around four. */
  get circadian() {
    const h = (this.clockMin < 12 * 60 ? this.clockMin + 24 * 60 : this.clockMin) / 60 - 28;
    return Math.exp(-((h / 2.3) ** 2));
  }
  /** What the caffeine does, 0..1: half at EC50, pushed out by tolerance. */
  get wake() { return this.caffeine / (this.caffeine + EC50_MG * (1 + this.tolerance * 0.9)); }
  get jitter() { return smooth(JITTER_MG, TOO_MUCH_MG, this.caffeine * (1 - this.tolerance * 0.3)); }
  /** Coming down from a big dose: the level well below where it just was. */
  get crash() {
    const p = this.peakCaffeine;
    if (p < 60) return 0;
    return clamp01((p - this.caffeine) / (p * 0.35)) * smooth(60, 160, p);
  }
  /**
   * The drive into the sleep-promoting dorsal fan-shaped body: the pressure
   * of the hours awake, which caffeine blocks (the adenosine it answers to is
   * how that pressure is felt), the small hours, which it does not, and the
   * crash as a big dose wears off. Flow holds it off a little.
   */
  get sleepDrive() {
    const homeostatic = this.pressure * 0.9 * (1 - 0.75 * this.wake);
    return Math.max(0, homeostatic + this.circadian * 0.36 + this.crash * 0.3 - this.flow * 0.06);
  }
  /** How sleepy it is, from the brain's dFB if it runs, from the drive if not. */
  get sleepiness() { return clamp01(this.neural ? this.dfb : this.sleepDrive); }
  /** How sharp: caffeine and arousal against the sleep drive. */
  get focus() {
    return clamp01(0.55 + this.wake * 0.3 + this.dopamine * 0.2 + this.flow * 0.25 - this.sleepiness * 0.65 - this.jitter * 0.25);
  }
  get asleep() { return this.phase === PHASES.ASLEEP || this.phase === PHASES.MORNING; }
  get busy() { return this.phase !== PHASES.IDLE; }
  get problems() { return this.editor.problems.length; }
  get arousal() {
    return clamp01(this.dopamine * 0.5 + this.octopamine * 0.6 + this.jitter * 0.4 + this.wake * 0.2 + this.flow * 0.2)
      * (1 - this.collapse);
  }
  /** 0..1 while idle: how close it is to committing. */
  get deliberation() {
    if (this.phase !== PHASES.IDLE) return 0;
    return clamp01(this.idleFor / Math.max(0.1, this.nextDecisionAfter));
  }
  /** Taps a second on the keys. */
  get tapRate() {
    return (4 + 6 * this.focus + this.jitter * 2) * (1 - this.sleepiness * 0.3);
  }

  /**
   * What it wants, now. Evaluated all the time so the HUD can show the pull.
   *
   *   tired    the sleep drive (the dFB, read from the brain) — coffee
   *   crash    coming down off a big dose
   *   memory   what the mushroom body has learned about this desk at night:
   *            caffeine arriving and green builds through PAM, bitter sips
   *            and red builds through PPL1
   *   bitter   the taste: caffeine is bitter, and flies avoid it. It fades
   *            as the taste becomes familiar
   *   jitter   too much already
   *   work     the pull of the task: flow, and a red build it wants fixed
   */
  get appetite() {
    const tired = smooth(0.4, 0.88, this.sleepiness);
    const crash = this.crash;
    const memory = Math.max(-0.3, Math.min(0.35, this.memory * 0.45));
    const bitter = 0.22 * (1 - this.familiar);
    const jitter = this.jitter;
    const full = clamp01(this.crop / (MUG_MG * 0.6) + this.sated);
    const empty = this.fill < 0.02 ? 0.1 : 0;
    const nudge = this.coffeeNudge;
    const low = (1 - this.npf) * 0.2;
    // the first cup of the night is a ritual, tired or not
    const ritual = 0.42 * clamp01(1 - this.nightStats.sips / 4) * smooth(0.02, 0.08, this.nightK);
    const coffee = clamp01(0.04 + ritual + tired * 0.75 + crash * 0.45 + memory + low + nudge - bitter - jitter * 0.95 - full * 0.45 - empty);
    const work = clamp01(0.45 + this.flow * 0.35 + (this.problems ? 0.2 : 0) + (this.ci?.failed ? 0.25 : 0) - tired * 0.3);
    return { tired, crash, memory, bitter, jitter, full, coffee, work, low, ritual };
  }
  get familiar() { return clamp01(this.sips / 40); }

  // ================================================================ output

  say(text, tone = 'out') {
    this.terminal.push({ text, tone, at: this.minute });
    if (this.terminal.length > 40) this.terminal.shift();
  }

  record(r) {
    this.lastResult = { ...r, at: this.now(), clock: this.clock };
    if (r.dot) {
      this.history.push({ at: this.lastResult.at, kind: r.dot });
      if (this.history.length > 16) this.history.shift();
    }
  }

  // ================================================================= tasks

  nextTask() {
    this.taskIndex += 1;
    const def = TASKS[this.taskOrder[this.taskIndex % TASKS.length]];
    const file = fileIndex(def.file);
    const lines = POKYH.files[file].lines;
    const round = Math.floor(this.taskIndex / TASKS.length);
    // somewhere in the file with room to write, a different stretch each time round
    const span = Math.min(lines.length - 2, 10 + Math.floor(this.rng() * 14));
    const start = Math.max(1, Math.min(lines.length - span - 1, Math.floor((0.15 + 0.5 * ((this.rng() + round * 0.37) % 1)) * (lines.length - span))));
    this.task = {
      ...def, file, start, end: start + span, chunk: 4 + Math.floor(this.rng() * 4), fixups: 0, stage: 'write',
    };
    this.openFile(file, start);
    this.app.view = def.view;
    this.emit('task', { task: this.task });
  }

  /** Opens a file in the editor with its first `start` lines already there. */
  openFile(file, start) {
    const lines = POKYH.files[file].lines;
    const ed = this.editor;
    ed.file = file;
    ed.lines = lines;
    ed.upTo = start;
    ed.line = start;
    ed.text = (lines[start] ?? '').match(/^ */)[0];
    ed.typo = null;
    ed.problems = [];
    ed.overrides = {};
    ed.completion = null;
    ed.chunkStart = start;
    ed.conflict = 0;
    if (!ed.tabs.includes(file)) { ed.tabs.push(file); if (ed.tabs.length > 4) ed.tabs.shift(); }
    // a new file: open it from the explorer with the trackpad
    this.plan = { kind: 'open' };
  }

  /**
   * CI went red on something it already pushed. It puts what it was doing
   * aside, goes back to that file, writes the fix and pushes again.
   */
  startHotfix(ci) {
    if (!this.task.hotfix) {
      const ed = this.editor;
      this.shelved = {
        task: this.task,
        editor: { file: ed.file, lines: ed.lines, upTo: ed.upTo, line: ed.line, text: ed.text, problems: ed.problems, overrides: ed.overrides, chunkStart: ed.chunkStart },
      };
    }
    const lines = POKYH.files[ci.file].lines;
    const start = Math.max(1, Math.min(lines.length - 8, Math.floor(this.rng() * (lines.length - 8))));
    const why = ci.reason.split(':')[0];
    this.task = {
      ...ci.task, file: ci.file, start, end: start + 3 + Math.floor(this.rng() * 4), chunk: 8, fixups: 2,
      stage: 'write', hotfix: true, msg: `fix(ci): ${why} passes on a clean machine too`,
    };
    this.openFile(ci.file, start);
    this.app.view = ci.task.view;
    this.emit('task', { task: this.task });
  }

  finishTask() {
    if (this.task.hotfix && this.shelved) {
      const { task, editor } = this.shelved;
      this.shelved = null;
      this.task = task;
      Object.assign(this.editor, editor);
      this.app.view = task.view;
      this.plan = { kind: 'open' };
      this.emit('task', { task });
      return;
    }
    this.nextTask();
  }

  // ================================================================ update

  update(dt) {
    dt = Math.min(dt, 1 / 20);
    this.t += dt;
    const rate = this.phase === PHASES.MORNING ? (this.t > 3 ? RATE.day : 0)
      : this.phase === PHASES.ASLEEP ? RATE.asleep : RATE.awake;
    const dtMin = dt * rate;
    this.minute += dtMin;

    switch (this.phase) {
      case PHASES.TYPING: this.updateTyping(dt); break;
      case PHASES.POINTING: this.updatePointing(dt); break;
      case PHASES.RUNNING: this.updateRunning(dt); break;
      case PHASES.SIPPING: this.updateSipping(dt); break;
      case PHASES.NODDING: this.updateNodding(dt); break;
      case PHASES.ASLEEP: this.updateAsleep(dt, dtMin); break;
      case PHASES.MORNING: this.updateMorning(dt); break;
      default: this.relax(dt);
    }

    this.updateCI(dt);
    this.updateBody(dtMin, dt);
    this.updateSignals(dt);
    this.updateAutonomy(dt);

    if (this.refilling > 0) {
      this.refilling = Math.max(0, this.refilling - dt / T.refill);
      this.fill = Math.min(1, this.fill + dt / T.refill);
    }
    this.keyPulse = Math.max(0, this.keyPulse - dt * 8);
    this.scroll = Math.max(0, this.scroll - dt * 3);
    this.sipPulse = Math.max(0, this.sipPulse - dt * 3);
    this.editor.flash = Math.max(0, this.editor.flash - dt * 2);
    this.app.reloaded = Math.max(0, this.app.reloaded - dt * 1.5);
    this.coffeeNudge = Math.max(0, this.coffeeNudge - dt / 40);
    this.tingle += (this.jitter * 0.75 - this.tingle) * Math.min(1, dt * 2);

    // morning comes whatever it is doing
    if (this.phase !== PHASES.MORNING && this.minute - this.nightStart + NIGHT_START >= MORNING
      && this.phase !== PHASES.SIPPING && this.phase !== PHASES.NODDING) this.startMorning();
    return this;
  }

  relax(dt) {
    const k = Math.min(1, dt * 5);
    // between bursts the tarsus rests on the palm rest, like anyone's hand
    const rest = this.collapse < 0.3 && this.phase === PHASES.IDLE;
    this.grip += ((rest ? 1 : 0) - this.grip) * Math.min(1, dt * 3);
    if (rest) lerp3(this.handTarget, PALM_REST, Math.min(1, dt * 6), this.handTarget);
    this.pressDepth += (0 - this.pressDepth) * k;
    this.lean += (0.9 - this.lean) * Math.min(1, dt * 2);
    this.extend += (0 - this.extend) * k;
    this.proboscis *= Math.exp(-dt * 5);
    this.mugLift *= Math.exp(-dt * 5);
    this.mugTilt *= Math.exp(-dt * 5);
    this.collapse = Math.max(0, this.collapse - dt / 1.2);
    this.keyDown = null;
  }

  // ============================================================== decisions

  /** Commits to the next thing. */
  decide() {
    const a = this.appetite;
    const noise = () => (this.rng() - 0.5) * 0.14;
    // a command waiting to run comes first
    if (this.pending.length) { this.startRunning(); return 'run'; }
    const coffee = a.coffee + noise();
    const work = a.work + noise();
    if (coffee > 0.42 && coffee > work * 0.8) {
      this.why = a.crash > 0.4 ? 'coming down — needs another coffee'
        : a.tired > 0.6 ? 'the sleep drive is winning — coffee'
          : this.coffeeNudge > 0.3 ? 'nearly fell asleep — coffee, now'
            : a.memory > 0.15 ? 'bitter. drinks it anyway: it has learned this keeps it up'
              : 'a sip, while it thinks';
      this.startSipping(coffee);
      return 'coffee';
    }
    if (this.plan?.kind === 'open' || this.plan?.kind === 'fix') { this.startPointing(this.plan.kind); return 'point'; }
    if (this.task.stage !== 'write' && this.task.stage !== 'resolve') {
      // a command that was cut short (by a nod, by the morning) is run again
      if (!this.command) { this.pending.push({ cmd: this.task.stage }); this.startRunning(); return 'run'; }
      this.why = 'waiting on the terminal';
      this.gaze = 'terminal';
      return 'wait';
    }
    this.why = this.flow > 0.55 ? 'in the flow — it will not stop now'
      : a.jitter > 0.4 ? 'jittery — typing too fast'
        : a.tired > 0.55 ? 'tired — every line takes longer'
          : this.ci?.failed ? 'CI is red — fixing it'
            : 'writing the next few lines';
    this.startTyping();
    return 'type';
  }

  updateAutonomy(dt) {
    // sleep can take it at any moment it is not holding the mug
    if (this.shouldNod(dt)) { this.startNod(); return; }
    if (this.phase !== PHASES.IDLE) { this.idleFor = 0; return; }
    this.idleFor += dt;
    if (this.idleFor < this.nextDecisionAfter) return;
    this.idleFor = 0;
    const kind = this.decide();
    const slow = this.sleepiness * 1.6 + this.fear * 0.8;
    this.nextDecisionAfter = (kind === 'type' ? 0.35 : 0.8) + slow + this.rng() * 0.9 - this.flow * 0.3;
  }

  shouldNod(dt) {
    const s = this.sleepiness;
    const can = this.phase === PHASES.IDLE || this.phase === PHASES.TYPING || this.phase === PHASES.RUNNING;
    if (s < NOD_AT || !can || this.t < 1.5) return false;
    // a hazard: the further past the mark, the likelier each second is the one
    return this.rng() < (s - NOD_AT + 0.03) * 0.9 * dt;
  }

  // ================================================================ typing

  startTyping() {
    this.phase = PHASES.TYPING;
    this.t = 0;
    this.tapT = 0;
    this.grip = Math.max(this.grip, 0.001);
    this.from = this.handTarget.slice();
    this.nextTap();
    this.emit('reach');
  }

  /** The next piece of the line: what one tap of the foreleg puts on screen. */
  piece() {
    const ed = this.editor;
    const target = ed.lines[ed.line] ?? '';
    const col = ed.text.length;
    if (ed.completion) return { text: ed.completion, key: 'tab', complete: true };
    const rest = target.slice(col);
    if (!rest) return { text: '\n', key: 'return' };
    const id = rest.match(/^[A-Za-z_$][\w$]*/);
    if (id) {
      const w = id[0];
      // longer names: two letters, then the editor's suggestion, accepted with tab
      if (w.length >= 6) return { text: w.slice(0, 2), key: tapKeyFor(w[0]), suggest: w.slice(2) };
      return { text: w.slice(0, Math.min(w.length, 4)), key: tapKeyFor(w[0]) };
    }
    const ws = rest.match(/^ +/);
    if (ws) return { text: ws[0], key: 'space' };
    const n = /^['"`(){}[\]<>]{2}/.test(rest) ? 2 : 1;
    return { text: rest.slice(0, n), key: tapKeyFor(rest[0]) };
  }

  nextTap() {
    const ed = this.editor;
    // a typo it has noticed: back to where it went wrong
    if (ed.typo && ed.typo.noticed) {
      this.tap = { key: 'delete', erase: true };
    } else {
      const p = this.piece();
      let text = p.text;
      let typo = null;
      const pTypo = 0.012 + this.sleepiness * 0.07 + this.jitter * 0.09 - this.flow * 0.01;
      if (!p.complete && text !== '\n' && /[a-z]/i.test(text[0]) && !ed.typo && this.rng() < pTypo) {
        const n = NEIGHBOURS[text[0].toLowerCase()];
        if (n) {
          const wrong = n[Math.floor(this.rng() * n.length)];
          text = wrong + text.slice(1);
          typo = { col: ed.text.length, len: text.length, noticed: false };
        }
      }
      this.tap = { ...p, text, typo };
    }
    this.tapKey = this.tap.key;
    this.from = this.handTarget.slice();
    this.tapT = 0;
    this.tapLen = 1 / Math.max(1.5, this.tapRate);
  }

  land() {
    const ed = this.editor;
    const tap = this.tap;
    this.keyPulse = 1;
    this.chars += 1;
    if (tap.erase) {
      ed.text = ed.text.slice(0, ed.typo.col);
      ed.typo = null;
      this.emit('key', { key: 'delete' });
      return;
    }
    this.emit('key', { key: tap.key });
    if (tap.text === '\n') { this.newline(); return; }
    ed.text += tap.text;
    ed.completion = tap.suggest && !tap.typo ? tap.suggest : null;
    if (tap.complete) this.emit('complete');
    if (tap.typo) { ed.typo = tap.typo; this.emit('typo'); }
    else if (ed.typo && !ed.typo.noticed && this.rng() < 0.2 + this.focus * 0.45) ed.typo.noticed = true;
    // skip the auto-indent: the editor does that
  }

  newline() {
    const ed = this.editor;
    const target = ed.lines[ed.line] ?? '';
    if (ed.typo) {
      // it never saw it: a red squiggle, and a problem for the compiler
      const tok = (ed.text.slice(ed.typo.col).match(/^[\w$]+/) ?? [ed.text.slice(ed.typo.col, ed.typo.col + ed.typo.len)])[0];
      ed.problems.push({ line: ed.line, col: ed.typo.col, len: Math.max(1, tok.length), msg: TYPE_ERRORS[ed.problems.length % TYPE_ERRORS.length](tok) });
      ed.overrides[ed.line] = ed.text;
      ed.typo = null;
    } else if (ed.text !== target) {
      ed.overrides[ed.line] = ed.text;
    }
    ed.line += 1;
    ed.upTo = ed.line;
    ed.text = '';
    ed.completion = null;
    this.lines += 1;
    this.nightStats.lines += 1;
    this.scroll = 1;
    // the next line's indentation arrives with the newline
    const next = ed.lines[ed.line] ?? '';
    ed.text = next.match(/^ */)[0];
    if (!next.trim() && ed.line < this.task.end) { ed.line += 1; ed.upTo = ed.line; ed.text = (ed.lines[ed.line] ?? '').match(/^ */)[0]; }
  }

  updateTyping(dt) {
    const ed = this.editor;
    this.lean += (TYPING_HUNCH + this.fear * 0.8 - this.lean) * Math.min(1, dt * 4);
    this.grip = Math.min(1, this.grip + dt / T.reach);
    this.tapT += dt;
    const k = clamp01(this.tapT / this.tapLen);
    // over to the key in the first part of the beat, down on it, up again
    const move = easeInOut(clamp01(k / 0.55));
    const to = keyPoint(this.tapKey, 0);
    lerp3(this.from, to, move, this.handTarget);
    this.handTarget[1] += Math.sin(move * Math.PI) * 0.012;
    const press = k < 0.55 ? 0 : Math.sin(((k - 0.55) / 0.45) * Math.PI);
    this.pressDepth = press;
    this.handTarget[1] -= press * 0.0016;
    this.keyDown = press > 0.3 ? this.tapKey : null;
    if (!this.landed && k >= 0.78) { this.landed = true; this.land(); }
    if (k < 1) return;
    this.landed = false;

    // the chunk is written: save, and see what the dev server says
    if (ed.line >= Math.min(this.task.end, ed.chunkStart + this.task.chunk) && !ed.typo) {
      this.finishChunk();
      return;
    }
    // a thought, a glance at the monitor: it does not type in one breath
    if (this.rng() < 0.012 + this.sleepiness * 0.02) { this.stopTyping(); return; }
    this.nextTap();
  }

  stopTyping() {
    this.phase = PHASES.IDLE;
    this.t = 0;
    this.keyDown = null;
    this.pressDepth = 0;
    this.nextDecisionAfter = 0.4 + this.rng() * 0.6;
  }

  finishChunk() {
    const ed = this.editor;
    ed.chunkStart = ed.line;
    this.stopTyping();
    this.pending.push({ cmd: 'save' });
    this.nextDecisionAfter = 0.15;
  }

  // ============================================================ the trackpad

  startPointing(kind) {
    this.phase = PHASES.POINTING;
    this.t = 0;
    this.pointKind = kind;
    this.from = this.handTarget.slice();
    this.clicks = kind === 'open' ? 2 : 1;
    this.emit('reach');
  }

  updatePointing(dt) {
    this.lean += (TYPING_HUNCH * 0.8 - this.lean) * Math.min(1, dt * 3);
    this.grip = Math.min(1, this.grip + dt / T.reach);
    const t = this.t;
    const reach = 0.4, swipe = 0.7, click = 0.28;
    const at = padPoint(0.2, 0.1, 0);
    if (t < reach) {
      lerp3(this.from, at, easeInOut(t / reach), this.handTarget);
      this.handTarget[1] += Math.sin((t / reach) * Math.PI) * 0.015;
      this.pressDepth = 0;
      return;
    }
    const u = t - reach;
    if (u < swipe) {
      // a two-finger scroll, as far as one tarsus can do it
      const k = u / swipe;
      const p = padPoint(0.2 - 0.5 * Math.sin(k * Math.PI), 0.1 + 0.6 * k - 0.3, 0.3);
      this.handTarget[0] = p[0]; this.handTarget[1] = p[1]; this.handTarget[2] = p[2];
      this.pressDepth = 0.3;
      this.scroll = Math.max(this.scroll, 0.6);
      return;
    }
    const c = u - swipe;
    const n = Math.floor(c / click);
    if (n < this.clicks) {
      const k = (c % click) / click;
      const p = padPoint(-0.2, 0.3, Math.sin(k * Math.PI));
      this.handTarget[0] = p[0]; this.handTarget[1] = p[1]; this.handTarget[2] = p[2];
      this.pressDepth = Math.sin(k * Math.PI);
      if (k > 0.5 && this.lastClick !== n) { this.lastClick = n; this.emit('click'); }
      return;
    }
    this.lastClick = -1;
    const kind = this.pointKind;
    this.plan = null;
    if (kind === 'fix') this.fixProblem();
    this.phase = PHASES.IDLE;
    this.t = 0;
    this.nextDecisionAfter = 0.2;
  }

  /** On the problem it jumped to: the right word, retyped. Two taps. */
  fixProblem() {
    const ed = this.editor;
    const p = ed.problems.shift();
    if (p) delete ed.overrides[p.line];
    ed.flash = 0.6;
    this.chars += 2;
    this.emit('key', { key: 'delete' });
    this.pending.push({ cmd: 'save' });
  }

  // ============================================================== commands

  startRunning() {
    const c = this.pending.shift();
    this.phase = PHASES.RUNNING;
    this.t = 0;
    this.command = c;
    this.keyDown = null;
    const ed = this.editor;
    const file = POKYH.files[ed.file].path;
    switch (c.cmd) {
      case 'save':
        this.runLen = T.save + this.rng() * 0.6;
        this.gaze = 'app';
        this.emit('save');
        break;
      case 'build':
        this.say('$ npm run build', 'cmd');
        this.say('▲ Next.js 16 · Creating an optimized production build …', 'dim');
        this.runLen = T.build + this.rng() * 1.5;
        this.gaze = 'terminal';
        this.emit('command', { cmd: 'build' });
        break;
      case 'commit':
        this.say(`$ git commit -am "${this.task.msg}"`, 'cmd');
        this.runLen = T.commit;
        this.gaze = 'terminal';
        this.emit('command', { cmd: 'commit' });
        break;
      case 'push':
        this.say(`$ git push origin ${this.task.branch}`, 'cmd');
        this.runLen = T.push + this.rng();
        this.gaze = 'terminal';
        this.emit('command', { cmd: 'push' });
        break;
      case 'pull':
        this.say('$ git pull --rebase origin main', 'cmd');
        this.runLen = T.pull;
        this.gaze = 'terminal';
        break;
      default:
        this.runLen = 1;
    }
    void file;
  }

  updateRunning(dt) {
    this.grip += (1 - this.grip) * Math.min(1, dt * 4);
    lerp3(this.handTarget, PALM_REST, Math.min(1, dt * 6), this.handTarget);
    this.pressDepth = 0;
    this.lean += (1.1 - this.lean) * Math.min(1, dt * 2);
    this.keyDown = null;
    if (this.t < this.runLen) return;
    this.phase = PHASES.IDLE;
    this.t = 0;
    this.nextDecisionAfter = 0.5 + this.rng() * 0.5;
    const c = this.command;
    this.command = null;
    this[`after_${c.cmd}`]?.();
  }

  /** Hot reload: the dev server compiles what it saved. */
  after_save() {
    const ed = this.editor;
    const route = this.task.view === 'mensa' ? '/[lang]/mensa' : '/[lang]/timetable';
    if (ed.problems.length) {
      const p = ed.problems[0];
      this.say(`⨯ ${POKYH.files[ed.file].path}:${p.line + 1}:${p.col + 1}`, 'err');
      this.say(`  Type error: ${p.msg}`, 'err');
      this.app.overlay = { title: 'Build Error', msg: p.msg, file: `${POKYH.files[ed.file].path}:${p.line + 1}` };
      this.fail('typeError', 0.55, { msg: p.msg });
      this.plan = { kind: 'fix' };
      return;
    }
    this.app.overlay = null;
    this.app.reloaded = 1;
    this.say(`✓ Compiled ${route} in ${(180 + this.rng() * 520).toFixed(0)}ms`, 'ok');
    this.succeed('compiled', 0.28);
    this.flow = Math.min(1, this.flow + 0.12);
    if (ed.line < this.task.end) return;
    // the task is written: build it for real, then commit
    if (this.task.stage === 'write') {
      this.task.stage = 'build';
      this.pending.push({ cmd: this.task.hotfix ? 'commit' : 'build' });
    } else if (this.task.stage === 'resolve') {
      // the conflict is resolved: finish the rebase and push again
      this.say('$ git add -A && git rebase --continue', 'cmd');
      this.say(`Successfully rebased and updated refs/heads/${this.task.branch}.`, 'ok');
      this.task.stage = 'push';
      this.emit('resolved');
      this.pending.push({ cmd: 'push' });
    }
  }

  after_build() {
    // bugs that are not typos: the build finds them, more of them late at night
    const pBug = 0.1 + this.sleepiness * 0.35 + this.jitter * 0.25 - this.focus * 0.1;
    if (this.rng() < pBug && this.task.fixups < 2) {
      const msg = BUILD_ERRORS[Math.floor(this.rng() * BUILD_ERRORS.length)];
      this.say(`Failed to compile.`, 'err');
      this.say(msg, 'err');
      this.app.overlay = { title: 'Build Error', msg, file: POKYH.files[this.editor.file].path };
      this.fail('buildFail', 0.8, { msg });
      // back into the code: a few lines more before it builds again
      this.task.end = Math.min(this.editor.lines.length - 1, this.editor.line + 3 + Math.floor(this.rng() * 4));
      this.task.fixups += 1;
      this.task.stage = 'write';
      if (this.editor.line >= this.task.end) { this.task.stage = 'build'; this.pending.push({ cmd: 'build' }); }
      return;
    }
    const pages = 14 + Math.floor(this.rng() * 6);
    const total = 38 + this.taskIndex * 3;
    this.tests = { passed: total, total };
    this.say(`✓ Compiled successfully · ✓ Generating static pages (${pages}/${pages})`, 'ok');
    this.say(`✓ ${total} tests passed`, 'ok');
    this.app.overlay = null;
    this.succeed('buildOk', 0.5);
    this.task.stage = 'commit';
    this.pending.push({ cmd: 'commit' });
  }

  after_commit() {
    const hash = Math.floor(this.rng() * 0xfffffff).toString(16).padStart(7, '0');
    const ins = 4 + Math.floor(this.rng() * 30);
    this.say(`[${this.task.branch} ${hash}] ${this.task.msg}`, 'out');
    this.say(` 1 file changed, ${ins} insertions(+), ${Math.floor(this.rng() * 9)} deletions(-)`, 'dim');
    this.commits += 1;
    this.nightStats.commits += 1;
    this.task.hash = hash;
    this.succeed('commit', 0.4, { hash });
    this.task.stage = 'push';
    this.pending.push({ cmd: 'push' });
  }

  after_push() {
    // somebody else pushed to main in the meantime
    if (!this.task.rebased && this.rng() < 0.22) {
      this.say(' ! [rejected]  main -> main (fetch first)', 'err');
      this.task.rebased = true;
      this.pending.push({ cmd: 'pull' });
      this.fail('rejected', 0.35);
      return;
    }
    this.say(`To github.com:${POKYH.repo}.git`, 'dim');
    this.say(`   ${this.task.hash ?? 'a1b2c3d'}  ${this.task.branch} -> ${this.task.branch}`, 'dim');
    this.pushes += 1;
    this.emit('push');
    this.startCI();
    this.finishTask();
  }

  after_pull() {
    const file = POKYH.files[this.editor.file].path;
    this.say(`CONFLICT (content): Merge conflict in ${file}`, 'err');
    this.fail('conflict', 0.7, { file });
    // resolve it: a few lines by hand, then push again
    this.task.stage = 'resolve';
    this.task.end = Math.min(this.editor.lines.length - 1, this.editor.line + 2 + Math.floor(this.rng() * 3));
    this.editor.chunkStart = this.editor.line;
    this.editor.conflict = 1;
    if (this.editor.line >= this.task.end) this.pending.push({ cmd: 'save' });
  }

  // ==================================================================== CI

  startCI() {
    const steps = ['lint', 'typecheck', 'build', 'e2e', 'deploy'];
    // bugs only a clean machine finds
    const pFail = 0.08 + this.sleepiness * 0.25 + this.jitter * 0.2;
    const failAt = this.rng() < pFail ? 1 + Math.floor(this.rng() * 3) : -1;
    this.ci = {
      branch: this.task.branch, msg: this.task.msg, hash: this.task.hash, task: this.task, file: this.editor.file,
      steps: steps.map((name) => ({ name, state: 'queued', t: 0, len: 1.6 + this.rng() * 2.4 })),
      at: 0, failAt, failed: false, done: false,
      reason: failAt >= 0 ? CI_ONLY[Math.floor(this.rng() * CI_ONLY.length)] : null,
    };
    this.ci.steps[0].state = 'running';
    this.emit('ciStart');
  }

  updateCI(dt) {
    const ci = this.ci;
    if (!ci || ci.done) return;
    const i = ci.steps.findIndex((s) => s.state === 'running');
    if (i < 0) return;
    const s = ci.steps[i];
    s.t += dt;
    if (s.t < s.len) return;
    if (i === ci.failAt) {
      s.state = 'failed';
      ci.failed = true;
      ci.done = true;
      for (const r of ci.steps.slice(i + 1)) r.state = 'skipped';
      this.ciFails += 1;
      this.fail('ciFail', 1.0, { step: s.name, reason: ci.reason });
      // it passed on its machine. Back to that code
      this.startHotfix(ci);
      return;
    }
    s.state = 'passed';
    this.emit('ciStep', { step: s.name });
    if (i + 1 < ci.steps.length) { ci.steps[i + 1].state = 'running'; return; }
    ci.done = true;
    this.deploys += 1;
    this.nightStats.deploys += 1;
    this.say('✓ Deployed to pokyh.com', 'ok');
    this.succeed('deploy', 1.5, { branch: ci.branch });
  }

  // ============================================================== outcomes

  succeed(kind, strength, detail = {}) {
    this.rewardPulse = Math.max(this.rewardPulse ?? 0, strength);
    this.npf = clamp01(this.npf + 0.03 * strength);
    this.lossStreak = 0;
    const dot = kind === 'deploy' ? 'deploy' : kind === 'commit' ? 'commit' : kind === 'buildOk' ? 'ok' : null;
    this.record({ kind, dot, ...detail });
    this.emit(kind, detail);
  }

  fail(kind, strength, detail = {}) {
    this.punishPulse = Math.max(this.punishPulse ?? 0, strength);
    this.startle = Math.max(this.startle, strength * 0.4);
    this.npf = clamp01(this.npf - 0.035 * strength);
    this.flow = Math.max(0, this.flow - 0.35 * strength);
    this.lossStreak += 1;
    this.errors += 1;
    this.nightStats.errors += 1;
    this.record({ kind, dot: kind === 'ciFail' ? 'ci' : 'err', ...detail });
    this.emit(kind, detail);
  }

  // ================================================================ coffee

  startSipping(urge) {
    this.phase = PHASES.SIPPING;
    this.t = 0;
    this.from = this.handTarget.slice();
    const gulp = this.coffeeNudge > 0.3 || this.crash > 0.5;
    const sips = Math.max(1, Math.min(6, Math.round(1 + urge * 4 + (gulp ? 2 : 0))));
    this.sipPlan = { sips, gulp, taken: 0 };
    this.gaze = 'mug';
    this.coffeeNudge = 0;
    this.record({ kind: 'coffee', dot: 'coffee', sips, why: this.why });
    this.emit('lean');
  }

  updateSipping(dt) {
    const { sips, gulp } = this.sipPlan;
    const reach = T.lean, lift = T.lift, lower = T.lower;
    const each = gulp ? T.gulpSip : T.sip;
    const drink = Math.max(each, sips * each);
    const t = this.t;
    const drinkAt = reach + lift, lowerAt = drinkAt + drink;
    if (t < reach) {
      const k = easeInOut(t / reach);
      this.grip = Math.max(this.grip, k);
      lerp3(this.from, MUG_GRIP, k, this.handTarget);
      this.handTarget[1] += Math.sin(k * Math.PI) * 0.02;
      this.lean += (0.6 - this.lean) * Math.min(1, dt * 4);
      this.mugLift = 0;
      return;
    }
    if (t < drinkAt) {
      const k = easeInOut((t - reach) / lift);
      this.grip = 1;
      this.mugLift = k;
      const h = mugPose(k, this.pose).handle;
      this.handTarget[0] = h[0]; this.handTarget[1] = h[1]; this.handTarget[2] = h[2];
      this.lean += (1 - this.lean) * Math.min(1, dt * 4);
      this.extend = smooth(0.5, 1, k);
      return;
    }
    if (t < lowerAt) {
      const k = clamp01((t - drinkAt) / drink);
      this.grip = 1;
      this.mugLift = 1;
      this.handTarget = mugPose(1, this.pose).handle.slice();
      this.mugTilt = smooth(0, 0.3, k) * (0.25 + 0.75 * (1 - this.fill));
      this.extend = 1;
      const done = Math.min(sips, Math.floor(k * sips + 0.001) + (k > 0.15 ? 1 : 0));
      while (this.sipPlan.taken < Math.min(done, sips)) this.takeSip();
      return;
    }
    if (t < lowerAt + lower) {
      const k = easeInOut((t - lowerAt) / lower);
      this.mugLift = 1 - k;
      this.mugTilt *= 1 - k;
      const h = mugPose(1 - k, this.pose).handle;
      this.handTarget[0] = h[0]; this.handTarget[1] = h[1]; this.handTarget[2] = h[2];
      this.extend = 1 - smooth(0, 0.4, k);
      this.grip = 1 - smooth(0.7, 1, k);
      return;
    }
    while (this.sipPlan.taken < sips) this.takeSip();
    this.mugLift = 0;
    this.extend = 0;
    this.grip = 0;
    this.phase = PHASES.IDLE;
    this.t = 0;
    this.gaze = 'laptop';
    this.nextDecisionAfter = 0.6;
    this.sated = Math.min(0.8, 0.2 + sips * 0.1);
    this.emit('mugDown');
    if (this.fill < 0.02) {
      this.refilling = 1;
      this.mugs += 1;
      this.emit('refill');
    }
  }

  takeSip() {
    if (this.fill <= 0.001) { this.sipPlan.taken += 1; return; }
    const part = Math.min(this.fill, 1 / SIPS_PER_MUG);
    this.fill = Math.max(0, this.fill - 1 / SIPS_PER_MUG);
    const mg = MUG_MG * part;
    this.crop += mg;
    this.caffeineMg += mg;
    this.nightStats.mg += mg;
    this.sipPlan.taken += 1;
    this.sips += 1;
    this.nightStats.sips += 1;
    this.sipPulse = 1;
    this.emit('sip', { n: this.sipPlan.taken, sugar: this.sugar });
  }

  // ================================================================= sleep

  startNod() {
    // a command it was waiting on still finishes; it just has to see it again
    if (this.phase === PHASES.RUNNING && this.command) this.pending.unshift(this.command);
    this.command = null;
    this.phase = PHASES.NODDING;
    this.t = 0;
    this.nodEscape = 0;
    // how hard this particular nod hits: some drops are gentle, some sudden
    this.nodLuck = 0.5 + this.rng() * 0.9;
    this.nods += 1;
    this.keyDown = null;
    this.emit('nod');
  }

  /**
   * The head goes down towards the keyboard. To the eyes that is the
   * keyboard coming at them — a loom — and the loom goes to LPLC2 and LC4 and
   * on to the giant fibre. Awake enough, the giant fibre fires and it jerks
   * back up. Deep enough in the sleep drive, the senses are gated and it
   * does not: it is asleep.
   */
  updateNodding(dt) {
    const before = this.collapse;
    this.collapse = Math.min(0.62, this.collapse + dt / T.nod);
    this.lean += (TYPING_HUNCH + 1.4 - this.lean) * Math.min(1, dt * 2);
    this.grip += (0 - this.grip) * Math.min(1, dt * 3);
    this.gaze = 'keys';
    const speed = (this.collapse - before) / Math.max(dt, 1e-4);
    // sleeping flies are harder to rouse: the deeper the dFB drive, the less of it gets through
    const depth = smooth(NOD_AT + 0.02, DEEP_AT + 0.02, this.sleepiness);
    this.loom = clamp01(speed * 1.6) * Math.pow(1 - depth, 1.5) * this.nodLuck;
    const escape = this.neural ? this.escape : this.loom * 1.2;
    this.nodEscape = Math.max(this.nodEscape, escape);
    if (escape - this.escapeRest > JERK_AT && this.collapse > 0.2) { this.jerk(); return; }
    if (this.collapse >= 0.62) this.fallAsleep();
  }

  jerk() {
    this.phase = PHASES.IDLE;
    this.t = 0;
    this.jerks += 1;
    this.collapse = 0;
    this.loom = 0;
    this.startle = 1;
    this.coffeeNudge = 0.55;
    this.gaze = 'laptop';
    this.nextDecisionAfter = 0.5;
    this.record({ kind: 'jerk', dot: 'nod' });
    this.emit('jerk');
  }

  fallAsleep() {
    this.phase = PHASES.ASLEEP;
    this.t = 0;
    this.loom = 0;
    this.sleeps += 1;
    this.fellAt = this.minute;
    this.nightStats.asleepAt = this.nightStats.asleepAt ?? this.clock;
    this.editor.junk = '';
    this.record({ kind: 'asleep', dot: 'sleep' });
    this.emit('asleep');
  }

  /** Face down, foreleg on the J key. It repeats. */
  updateAsleep(dt, dtMin) {
    this.collapse = Math.min(1, this.collapse + dt / 1.2);
    this.lean += (TYPING_HUNCH + 2.2 - this.lean) * Math.min(1, dt * 1.5);
    this.gaze = 'keys';
    this.grip = Math.min(0.85, this.grip + dt / 1.5);
    const j = keyPoint('j', 1);
    lerp3(this.handTarget, j, Math.min(1, dt * 3), this.handTarget);
    this.pressDepth = 1;
    this.keyDown = 'j';
    const ed = this.editor;
    if (this.t > 0.8 && ed.junk.length < 900) {
      this.repeatT = (this.repeatT ?? 0) + dt;
      while (this.repeatT > 1 / 14) { this.repeatT -= 1 / 14; ed.junk += 'j'; }
    }
    this.sleptMin += dtMin;
    this.nightStats.slept += dtMin;
    // it sleeps until the light comes, or until the pressure is gone
    const late = this.minute - this.nightStart + NIGHT_START;
    if ((late >= SUNRISE + 10 && this.pressure < 0.75) || this.pressure < 0.08) this.wakeUp('light');
  }

  wakeUp(why) {
    this.phase = PHASES.IDLE;
    this.t = 0;
    this.keyDown = null;
    this.pressDepth = 0;
    this.startle = 0.6;
    this.coffeeNudge = 0.5;
    this.nextDecisionAfter = 1.2;
    const junk = this.editor.junk.length;
    this.editor.junk = '';
    this.gaze = 'laptop';
    this.record({ kind: 'wake', why, junk });
    this.emit('wake', { junk });
  }

  // =============================================================== morning

  startMorning() {
    const wasAsleep = this.phase === PHASES.ASLEEP;
    this.phase = PHASES.MORNING;
    this.t = 0;
    this.keyDown = null;
    this.pending = [];
    this.editor.junk = '';
    this.morning = { ...this.nightStats, night: this.night, wasAsleep, clock: this.clock, peak: Math.round(this.peakNight ?? this.caffeine) };
    this.record({ kind: 'morning', ...this.morning });
    this.emit('morning', this.morning);
  }

  /** Sunrise, then the day goes by while it sleeps in the chair, then night again. */
  updateMorning(dt) {
    this.grip += (0 - this.grip) * Math.min(1, dt * 3);
    this.extend = 0;
    this.mugLift *= Math.exp(-dt * 5);
    this.gaze = this.t < 3 ? 'window' : 'keys';
    if (this.t > 3.5) {
      this.collapse = Math.min(1, this.collapse + dt / 1.5);
      this.lean += (1.5 - this.lean) * Math.min(1, dt);
    }
    const late = this.minute - this.nightStart + NIGHT_START;
    if (late < NEXT_NIGHT) return;
    // a new night: the day's sleep paid off what it could
    const slept = this.nightStats.slept + (NEXT_NIGHT - MORNING) * 0.6;
    this.night += 1;
    this.nightStart += 24 * 60;
    this.minute = this.nightStart;
    this.pressure = 0.26 + Math.max(0, 0.3 - slept / 1400);
    this.caffeine *= 0.02;
    this.crop = 0;
    this.peakCaffeine = this.caffeine;
    this.peakNight = 0;
    this.tolerance *= 0.8;
    this.fill = 1;
    this.sugar = this.rng() < 0.5;
    this.flow = 0;
    this.nightStats = this.freshStats();
    this.series = [];
    this.seriesAt = 0;
    this.phase = PHASES.IDLE;
    this.t = 0;
    this.collapse = 0.4;
    this.startle = 0.4;
    this.nextDecisionAfter = 1.5;
    this.ci = null;
    this.app.overlay = null;
    this.terminal = [];
    this.say('$ npm run dev', 'cmd');
    this.say('✓ Ready in 1.1s', 'ok');
    this.record({ kind: 'night', night: this.night });
    this.emit('night', { night: this.night });
  }

  // ================================================================== body

  updateBody(dtMin, dt) {
    // caffeine: crop -> body -> out
    const absorbed = this.crop * (1 - Math.exp(-dtMin / ABSORB_MIN));
    this.crop -= absorbed;
    const before = this.caffeine;
    this.caffeine = this.caffeine * Math.pow(0.5, dtMin / HALF_LIFE_MIN) + absorbed;
    this.caffeineRise = dtMin > 0 ? Math.max(0, (this.caffeine - before) / dtMin) : 0;
    // the peak to come down from: follows a rise at once, forgets slowly
    this.peakCaffeine = Math.max(this.caffeine, this.peakCaffeine * Math.pow(0.5, dtMin / 150));
    this.peakNight = Math.max(this.peakNight ?? 0, this.caffeine);
    this.tolerance = clamp01(this.tolerance + (this.caffeine / 300) * dtMin / 900);
    const m = this.minute - this.nightStart;
    if (this.phase !== PHASES.MORNING && m >= this.seriesAt) {
      this.seriesAt = m + 4;
      this.series.push({ m, caffeine: this.caffeine, sleep: this.sleepiness, pressure: this.pressure, asleep: this.asleep });
    }

    // sleep pressure: builds awake, drains asleep
    if (this.asleep) this.pressure *= Math.exp(-dtMin / RECOVER_MIN);
    else this.pressure += (PRESSURE_PER_HOUR / 60) * dtMin * (1 + this.jitter * 0.2);

    this.sated *= Math.exp(-dtMin / 35);

    // NPF drifts home
    this.npf += (0.5 - this.npf) * (1 - Math.exp(-dt / 120));

    // flow: steady progress builds it, errors break it (in fail()), sleepiness wears it
    const typing = this.phase === PHASES.TYPING ? 1 : 0;
    this.flow = clamp01(this.flow + dt * (typing * 0.03 * this.focus - 0.004 - this.sleepiness * 0.01 - this.jitter * 0.012));
    if (this.flow > 0.6 && !this.inFlow) { this.inFlow = true; this.emit('flow'); }
    if (this.flow < 0.4 && this.inFlow) { this.inFlow = false; this.emit('flowLost'); }
    if (this.jitter > 0.5 && !this.jittery) { this.jittery = true; this.emit('jitters'); }
    if (this.jitter < 0.3) this.jittery = false;
    if (this.crash > 0.4 && !this.crashing) { this.crashing = true; this.emit('crash'); }
    if (this.crash < 0.2) this.crashing = false;
  }

  /**
   * The readouts. With the brain running, dopamine and octopamine come from
   * the simulated PAM and PPL1 clusters, and the sleep drive from the dFB.
   */
  updateSignals(dt) {
    this.rewardPulse = Math.max(0, (this.rewardPulse ?? 0) - dt * 1.8);
    this.punishPulse = Math.max(0, (this.punishPulse ?? 0) - dt * 1.8);
    this.startle = Math.max(0, this.startle - dt / 1.4);
    // the giant fibre's own level while nothing looms: a jerk is a burst above it
    if (this.phase !== PHASES.NODDING) this.escapeRest += ((this.neural ? this.escape : 0) - this.escapeRest) * Math.min(1, dt / 3);

    if (this.neural) {
      const span = 0.22;
      this.dopamine = clamp01((this.neural.reward - this.neuralRest) / span);
      this.octopamine = clamp01((this.neural.punish - this.neuralRestPunish) / span * 0.8 + this.startle + this.jitter * 0.2);
    } else {
      this.dopamine += (this.rewardPulse * 0.8 + this.caffeineRise * 0.1 + this.flow * 0.2 - this.dopamine) * Math.min(1, dt * 3);
      this.octopamine += (this.punishPulse * 0.6 + this.startle + this.jitter * 0.4 - this.octopamine) * Math.min(1, dt * 3);
      this.dfb += (this.sleepDrive - this.dfb) * Math.min(1, dt * 1.5);
      this.dopamine = clamp01(this.dopamine);
      this.octopamine = clamp01(this.octopamine);
    }

    // the defensive state: red builds piling up, jitters, a night going wrong
    const target = clamp01(this.lossStreak / 5 * 0.5 + this.jitter * 0.45 + (this.ci?.failed ? 0.2 : 0) + this.crash * 0.2);
    this.fear += (target - this.fear) * (1 - Math.exp(-dt / (target > this.fear ? 1.5 : 5)));
    this.stressExtra = this.jitter * 0.12 + (this.ci?.failed ? 0.08 : 0);

    // heart: caffeine is a cardiac stimulant in flies too; sleep slows it
    const want = HEART_REST + (HEART_MAX - HEART_REST)
      * clamp01(this.octopamine * 0.45 + this.jitter * 0.45 + this.wake * 0.18 + this.fear * 0.25 + this.dopamine * 0.2);
    const heart = this.asleep ? HEART_ASLEEP + (want - HEART_REST) * 0.2 : want;
    this.heartRate += (heart - this.heartRate) * (1 - Math.exp(-dt / 0.6));
  }

  // ============================================================ from brain

  setNeuralReadout(reward, punish) {
    this.neural = { reward, punish };
    if (this.neuralRest === undefined) this.setNeuralRest(reward, punish);
  }

  setNeuralRest(reward, punish) {
    this.neuralRest = reward;
    this.neuralRestPunish = punish;
  }

  setSleep(dfb, escape, types) {
    this.dfb = dfb;
    this.escape = escape;
    this.dfbTypes = types;
  }

  setMemory(value, learned) {
    this.memory = value;
    this.learned = learned;
  }
}
