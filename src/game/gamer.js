/**
 * The fly at its gaming setup, as one deterministic state machine.
 *
 * It plays four games in turn — League of Legends, Minecraft, Fortnite and
 * CS2 — with its right foreleg on the mouse. Nothing here touches React or
 * three.js: the scene reads the continuous values (where the crosshair is,
 * how fast the view turns, the foreleg, the slam), the painters read the
 * match, and tools/sim-game.mjs runs the same class headless against the same
 * brain.
 *
 * What it plays with is what it SEES and HEARS. The brain (neural/gamerBrain.js)
 * gets the view turning as wide-field motion on the T4/T5 motion detectors,
 * an enemy on screen as a small moving target on LC10a/LC11, anything that
 * rushes at it — a gank, a creeper, a player over the wall, a peek — as a loom
 * on LPLC2/LC4, and the headset as sound on Johnston's organ. It hands back
 * how well the target is being tracked (`track`), which way its optomotor
 * reflex pulls (`pan`) and the giant fibre (`escape`): past threshold the fly
 * flinches — a panic flick and a wasted shot.
 *
 * Tilt is the model's: a persistent, scalable state like the defensive one,
 * fed by deaths, defeats and flame through PPL1 and octopamine. Fly
 * aggression needs octopamine (Hoyer et al. 2008; Zhou et al. 2008); here it
 * comes out on the desk. Past one mark it slams the desk, past another it
 * rage-quits — and its mushroom body, which learns each game as its own
 * context, decides what it queues for next.
 */
import { makeRng } from './market.js';
import { GAMES, GAME_ORDER, START_RANK, CS2_ROUNDS_TO_WIN, FORTNITE_PLAYERS, rankDelta } from './games.js';
import { Gestures } from './gamerGestures.js';

export const PHASES = {
  /** Looking for a match. */
  QUEUE: 'queue',
  PLAYING: 'playing',
  /** The victory or defeat screen. */
  RESULT: 'result',
  /** Alt-F4, out of the game, slamming the desk. */
  RAGE_QUIT: 'rage-quit',
  /** On the desktop, opening another game. */
  SWITCHING: 'switching',
};

/** Its name in every lobby. */
export const TAG = 'Dros0phila';

/** Half the in-game field of view, in the units the view turns in. */
export const HALF_FOV = 0.62;

/** Seconds. */
const T = {
  queue: 3.4,
  accept: 0.9,
  result: 4.6,
  rageQuit: 4.8,
  switching: 3.2,
  respawn: 2.8,
  roundEnd: 1.6,
};
/** Where on the classic slam the foreleg hits the desk, 0..1 of its length. */
export const SLAM_HIT = 0.42;

/** Tilt at which a death may end on the desk. */
const SLAM_TILT = 0.55;
/** Tilt at which a lost match ends in a rage-quit. */
const RAGE_QUIT_TILT = 0.7;
/** Tilt at which it leaves in the middle of a match. */
const LEAVE_TILT = 0.92;
/** Giant fibre activity above rest at which it flinches. */
const ESCAPE_THRESHOLD = 0.75;

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const clamp01 = (x) => clamp(x, 0, 1);

/** Short things teammates say into the headset, per game. */
const CALLOUTS = {
  lol: ['drag in 30', 'ward river', 'he has no flash', 'group mid', 'back'],
  minecraft: ['found iron', 'its getting dark', 'bring torches', 'where r u', 'skeleton on the hill'],
  fortnite: ['storm is closing', 'one shot him', 'loot the house', 'third party', 'bus leaving'],
  cs2: ['1 B', 'two long', 'eco', 'he is one', 'rotate', 'smoke mid'],
  rdr2: ['behind the wagon', 'lasso him', 'the horse is right there', 'pinkertons incoming', 'go to camp'],
  gow: ['behind you', 'the boy is shooting', 'throw it and recall', 'draugr from the left', 'heal stone'],
  gowr: ['berserker spawning', 'switch to the blades', 'shield up', 'freya help', 'on your right'],
};

export class Gamer {
  constructor({ onEvent = () => {}, seed = 20260925, rng, now = () => Date.now() } = {}) {
    this.onEvent = onEvent;
    this.rng = rng ?? makeRng(seed ^ 0x6a09e667);
    this.now = now;
    this.seed = seed;

    this.phase = PHASES.QUEUE;
    this.t = 0;
    this.clock = 0;
    this.game = GAME_ORDER[Math.floor(this.rng() * GAME_ORDER.length)];

    // --- the career, per game ------------------------------------------------
    this.career = Object.fromEntries(GAME_ORDER.map((g) => [g, {
      played: 0, wins: 0, losses: 0, rageQuits: 0, kills: 0, deaths: 0, slams: 0,
      rank: START_RANK[g], lastDelta: 0, lastPlayed: -999,
    }]));
    this.slams = 0;
    this.rageQuits = 0;
    this.matches = 0;
    this.switches = 0;

    // --- state ---------------------------------------------------------------
    this.dopamine = 0;
    this.octopamine = 0;
    this.startle = 0;
    this.fear = 0;
    this.npf = 0.55;
    this.memory = 0;
    this.learned = 0;
    this.neural = null;
    this.heartRate = 268;
    this.tilt = 0.08;
    this.collapse = 0;
    this.rewardPulse = 0;
    this.punishPulse = 0;
    /** What its mushroom body says each game is worth, −1..1 (from the brain). */
    this.gameValues = Object.fromEntries(GAME_ORDER.map((g) => [g, 0]));

    // --- what comes back from the brain -------------------------------------
    this.pan = 0;               // optomotor readout, signed
    this.track = 0.45;          // LC10a/LC11 downstream, 0..1
    this.escape = 0;            // giant fibre above rest

    // --- what goes in: the screen and the headset ----------------------------
    this.view = { yaw: 0, yawVel: 0, pitch: 0, pitchVel: 0 };
    this.loom = 0;
    this.targetMotion = 0;
    this.sound = 0;
    this.flash = 0;

    // --- the foreleg -----------------------------------------------------------
    this.grip = 0;              // on the mouse
    this.pressDepth = 0;        // a click
    /** Where the mouse is on the pad, and how far it is lifted and tipped (gamerGestures.js moves it). */
    this.hand = { dx: 0, dz: 0, lift: 0, tilt: 0, yaw: 0 };
    this.slamPhase = null;      // 0..1 through a slam, null when not slamming
    this.slamImpact = 0;        // 1 at the hit, fading: the desk and the camera jump
    this.slamCooldown = 0;
    /** The slam under way: which kind, how long, where it hits (gamerGestures.js picks). */
    this.rage = null;
    this.slamHits = 0;
    this.tingle = 0;

    // --- the screen ------------------------------------------------------------
    this.match = null;
    this.enemy = null;
    this.dead = null;
    this.banner = null;
    this.feed = [];
    this.chat = [];
    this.voice = { who: null, level: 0, until: 0 };
    this.result = null;
    this.lastResult = null;
    this.history = [];
    this.nextGame = null;
    this.firing = 0;
    this.builtAt = -9;
    this.mineAt = -9;
    this.wobble = 0;
    this.shotAt = -9;
    this.flinchCooldown = 0;
    this.flinches = 0;
    this.deathStreak = 0;
    this.killStreak = 0;
    this.inARow = 0;
    this.lastEvent = null;

    // --- the body: gestures, posture, breathing, gaze --------------------------------
    // its own random stream, so the matches play out the same with or without it
    this.gestures = new Gestures(this, seed);
    /** Read by Fly.jsx: how it sits, and how it breathes. */
    this.body = this.gestures.body;
    this.breath = this.gestures.breath;
    this.say('system', `${TAG} joined the voice channel`);
    this.startQueue();
  }

  emit(type, detail) {
    this.lastEvent = { type, at: this.now() };
    this.gestures?.on(type, detail);
    this.onEvent(type, detail);
  }

  /** The head tilted by a gesture, radians (Fly.jsx). */
  get headRoll() { return this.gestures.headRoll; }

  get def() { return GAMES[this.game]; }
  pick(list) { return list[Math.floor(this.rng() * list.length) % list.length]; }
  range([a, b]) { return a + (b - a) * this.rng(); }

  // ================================================================ chat

  /** `kind`: 'team' (a teammate), 'me' (the fly), 'system'. */
  say(kind, text, who = null) {
    this.chat.push({ kind, text, who: who ?? (kind === 'me' ? TAG : null), at: this.now(), clock: this.clock, game: this.game });
    if (this.chat.length > 40) this.chat.shift();
    if (kind !== 'system') this.emit('chat', { kind, text });
  }

  /** A teammate talks into the headset: that is sound on the antennae. */
  speak(who, text, level) {
    this.voice = { who, level, until: this.clock + 0.9 + text.length * 0.05 };
    this.say('team', text, who);
  }

  // =============================================================== phases

  startQueue() {
    this.phase = PHASES.QUEUE;
    this.t = 0;
    this.accepted = false;
    this.enemy = null;
    this.dead = null;
    this.banner = null;
    this.emit('queue', { game: this.game });
  }

  startMatch() {
    const d = this.def;
    const allies = d.ally.slice(0, this.game === 'fortnite' || this.game === 'minecraft' ? 3 : 4);
    this.match = {
      game: this.game,
      t: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      teamScore: 0,
      enemyScore: 0,
      // LoL
      cs: 0,
      gold: 500,
      // Minecraft
      diamonds: 0,
      carried: 0,
      night: 0,
      // Fortnite
      players: FORTNITE_PLAYERS,
      storm: 0,
      walls: 0,
      placement: null,
      // CS2
      round: 1,
      rounds: { us: 0, them: 0 },
      roundT: 0,
      roundKills: 0,
      roundOver: null,
      money: 800,
      hp: 100,
      slams: 0,
      team: [{ name: TAG, k: 0, d: 0, a: 0, me: true }, ...allies.map((name) => ({ name, k: 0, d: 0, a: 0 }))],
      enemies: d.enemy.slice(0, allies.length + 1).map((name) => ({ name, k: 0, d: 0, a: 0 })),
      calmFor: this.range(d.calm),
      bgNext: 2 + this.rng() * 3,
      won: null,
    };
    this.phase = PHASES.PLAYING;
    this.t = 0;
    this.enemy = null;
    this.dead = null;
    this.banner = null;
    this.feed = [];
    this.deathStreak = 0;
    this.killStreak = 0;
    this.view.yaw = 0;
    this.view.yawVel = 0;
    const c = this.career[this.game];
    c.played += 1;
    c.lastPlayed = this.clock;
    this.matches += 1;
    this.emit('start', { game: this.game });
  }

  // ============================================================== update

  update(dt) {
    dt = Math.min(dt, 1 / 20);
    this.t += dt;
    this.clock += dt;

    switch (this.phase) {
      case PHASES.QUEUE: this.updateQueue(dt); break;
      case PHASES.PLAYING: this.updatePlaying(dt); break;
      case PHASES.RESULT: this.updateResult(dt); break;
      case PHASES.RAGE_QUIT: this.updateRageQuit(dt); break;
      case PHASES.SWITCHING: this.updateSwitching(dt); break;
      default: break;
    }
    this.updateHand(dt);
    this.updateSlam(dt);
    this.updateSenses(dt);
    this.updateSignals(dt);
    this.gestures.update(dt);
    return this;
  }

  updateQueue(dt) {
    this.grip += (1 - this.grip) * Math.min(1, dt * 3);
    this.drift(dt, 0.25);
    // CS2 wants the match accepted: one click on the big green button
    if (this.game === 'cs2' && !this.accepted && this.t > T.queue) {
      this.accepted = true;
      this.click(1);
      this.emit('accept');
    }
    const wait = T.queue + (this.game === 'cs2' ? T.accept : 0);
    if (this.t >= wait) this.startMatch();
  }

  updatePlaying(dt) {
    const m = this.match;
    const d = this.def;
    m.t += dt;
    this.updateWorld(dt);
    if (this.phase !== PHASES.PLAYING) return;

    if (this.dead) {
      this.dead.t += dt;
      this.drift(dt, 0.05);
      if (this.game === 'cs2') return;                 // dead until the round ends
      if (this.dead.t >= T.respawn) { this.dead = null; m.hp = 100; this.emit('respawn'); }
      return;
    }

    if (this.enemy) this.updateEncounter(dt);
    else {
      m.hp = Math.min(100, m.hp + dt * 18);
      this.drift(dt, 1);
      this.farm(dt);
      m.calmFor -= dt;
      if (m.calmFor <= 0 && !m.roundOver && !this.matchShouldEnd()) this.spawn();
    }
    if (this.matchShouldEnd() && !this.enemy) this.endMatch();
  }

  /** Between fights: last-hitting minions, mining, looting. Small rewards, often. */
  farm(dt) {
    const m = this.match;
    if (this.game === 'lol' && this.rng() < dt / 1.3) {
      m.cs += 1; m.gold += 21;
      this.click(0.5);
      if (m.cs % 10 === 0) this.rewardPulse = Math.max(this.rewardPulse, 0.2);
    }
    if (this.game === 'minecraft' && this.rng() < dt * 0.9) {
      this.click(0.6);
      this.emit('mine');
      if (this.rng() < 0.14) {
        m.carried += 1; m.diamonds += 1;
        this.rewardPulse = Math.max(this.rewardPulse, 0.55);
        this.emit('diamond');
        if (this.rng() < 0.4) this.speak(this.pick(m.team.slice(1)).name, this.pick(this.def.praise), 0.4);
      }
    }
    if (this.game === 'fortnite' && this.rng() < dt * 0.25) { m.walls += 1; this.builtAt = this.clock; this.emit('build'); }
    if (this.game === 'minecraft') this.mineAt = this.clock;
  }

  /** The view wanders while nothing is happening: exploring, farming, holding an angle. */
  drift(dt, amount) {
    const v = this.view;
    const target = Math.sin(this.clock * 0.37 + this.seed) * 0.9 * amount + Math.sin(this.clock * 1.13) * 0.3 * amount;
    v.yawVel += ((target - v.yawVel) * 2.2 - v.yawVel * 0.4) * dt;
    v.yaw += v.yawVel * dt;
    v.pitch += (Math.sin(this.clock * 0.61) * 0.05 * amount - v.pitch) * Math.min(1, dt * 2);
    this.targetMotion += (0 - this.targetMotion) * Math.min(1, dt * 3);
  }

  // --------------------------------------------------------- the match world

  /** Everything that happens in a match that is not the fly's own fight. */
  updateWorld(dt) {
    const m = this.match;
    const g = this.game;
    if (g === 'minecraft') m.night = clamp01(m.t / this.def.seconds);
    if (g === 'fortnite') {
      m.storm = clamp01(m.t / this.def.seconds);
      // players fall away as the storm closes; the last few are fought by the fly
      const want = Math.max(2, Math.round(FORTNITE_PLAYERS * Math.pow(1 - m.storm, 1.6)));
      if (!this.dead && m.players > want) {
        m.players -= 1;
        if (this.rng() < 0.3) this.pushFeed(this.pick(this.def.enemy), `player${100 + Math.floor(this.rng() * 900)}`, false, false);
      }
    }
    if (g === 'cs2' && m.roundOver) {
      m.roundOver.t += dt;
      if (m.roundOver.t >= T.roundEnd) this.nextRound();
      return;
    }
    if (g === 'cs2') m.roundT += dt;

    // background fights: teammates and enemies trading kills
    m.bgNext -= dt;
    if (m.bgNext <= 0 && (g === 'lol' || g === 'cs2')) {
      m.bgNext = (g === 'lol' ? 3.2 : 5) + this.rng() * 4;
      const us = this.rng() < 0.5;
      const a = us ? this.pick(m.team.slice(1)) : this.pick(m.enemies);
      const b = us ? this.pick(m.enemies) : this.pick(m.team.slice(1));
      a.k += 1; b.d += 1;
      if (us) m.teamScore += 1; else m.enemyScore += 1;
      this.pushFeed(a.name, b.name, this.rng() < 0.3, us);
    }
    // a teammate says something now and then
    if (this.rng() < dt * 0.09 && this.clock > this.voice.until + 2) {
      this.speak(this.pick(m.team.slice(1)).name, this.pick(CALLOUTS[g]), 0.35);
    }
  }

  matchShouldEnd() {
    const m = this.match;
    if (this.game === 'cs2') return m.rounds.us >= CS2_ROUNDS_TO_WIN || m.rounds.them >= CS2_ROUNDS_TO_WIN;
    if (this.game === 'fortnite') return m.players <= 1 || m.placement !== null;
    return m.t >= this.def.seconds;
  }

  // --------------------------------------------------------------- a fight

  spawn() {
    const d = this.def;
    const m = this.match;
    const loom = this.rng() < d.loom || (this.game === 'fortnite' && m.players <= 3);
    const side = this.rng() < 0.5 ? -1 : 1;
    const bearing = this.view.yaw + (loom ? (this.rng() - 0.5) * 0.3 : side * (0.25 + this.rng() * 0.55));
    const pool = this.game === 'minecraft' ? (loom ? ['Creeper'] : ['Zombie', 'Skeleton', 'Spider']) : m.enemies.map((e) => e.name);
    const name = this.pick(pool);
    this.enemy = {
      name,
      kind: loom ? d.loomKind : (this.game === 'minecraft' ? name.toLowerCase() : d.enemyKind),
      loom,
      bearing,
      elev: (this.rng() - 0.4) * 0.12,
      vb: (this.rng() - 0.5) * (loom ? 0.2 : 0.9),
      size: loom ? 0.05 : 0.1 + this.rng() * 0.05,
      grow: loom ? 0 : 1,
      growT: 0.7 + this.rng() * 0.4,
      hp: 1,
      need: this.range(d.hp) * (loom ? 0.8 : 1),
      ttk: this.range(d.ttk) * (loom ? 0.75 : 1),
      t: 0,
      onTarget: 0,
      err: 0,
      hitFlash: 0,
      fuse: 0,
    };
    // Fortnite: build a wall the moment someone shows up
    if (this.game === 'fortnite' && this.rng() < 0.6) { m.walls += 1 + Math.floor(this.rng() * 3); this.builtAt = this.clock; this.emit('build'); }
    // CS2: sometimes a flashbang comes first
    if (this.game === 'cs2' && this.rng() < 0.2) { this.flash = 1; this.emit('flash'); }
    this.emit(loom ? 'loom' : 'enemy', { kind: this.enemy.kind });
  }

  updateEncounter(dt) {
    const e = this.enemy;
    const m = this.match;
    const v = this.view;
    e.t += dt;
    e.hitFlash = Math.max(0, e.hitFlash - dt * 6);

    // --- the target on screen ------------------------------------------------
    if (e.loom) {
      // it comes at the fly: small, then filling the screen
      const k = clamp01(e.t / e.growT);
      e.grow = k;
      e.size = 0.05 + 0.5 * k * k;
      if (k >= 1) e.fuse += dt;
    }
    if (this.rng() < dt * 1.4) e.vb = (this.rng() - 0.5) * (e.loom ? 0.25 : 1.1);
    e.bearing += e.vb * dt;

    // --- aim: turning onto it -------------------------------------------------
    // Tracking comes from the LC10a/LC11 readout, and the optomotor reflex
    // (the perceived turn) adds to the turn it is already making. Arousal helps
    // up to a point; tilt and a flashbang make it worse.
    const arousal = this.arousal;
    const perf = 1 - 1.6 * (arousal - 0.45) * (arousal - 0.45);
    const blind = 1 - this.flash * 0.85;
    const gain = (18 + 24 * this.track) * (0.6 + 0.4 * perf) * (1 - 0.4 * this.tilt) * blind;
    const err = e.bearing - v.yaw;
    const damp = 2 * Math.sqrt(gain);
    v.yawVel += (gain * err - damp * v.yawVel + this.pan * 0.8) * dt;
    v.yaw += v.yawVel * dt;
    v.pitch += (e.elev - v.pitch) * Math.min(1, dt * 4);
    // shaky hands: a tremor on top of the aim, bigger the more tilted it is
    const sway = 0.005 + this.tilt * 0.024 + this.tingle * 0.01;
    this.wobble += ((this.rng() - 0.5) * 2 * sway - this.wobble) * Math.min(1, dt * 9);
    e.err = e.bearing - v.yaw + this.wobble;

    // --- shooting --------------------------------------------------------------
    const window = e.size * HALF_FOV * 0.5;
    const close = Math.abs(e.err) < window * 3;
    const on = Math.abs(e.err) < window && e.grow > 0.25 && this.flash < 0.6;
    const every = { minecraft: 0.42, lol: 0.55, rdr2: 0.38, gow: 0.5, gowr: 0.42 }[this.game] ?? 0.11;
    this.firing = close ? 1 : 0;
    if (close && this.clock - this.shotAt > every) {
      this.shotAt = this.clock;
      this.click(0.8);
      this.emit('shot', { hit: on });
      if (on) e.hitFlash = 1;
    }
    if (on) {
      e.onTarget += dt;
      e.hp = Math.max(0, 1 - e.onTarget / e.need);
    }

    // --- the giant fibre: a flinch ---------------------------------------------
    if (this.escape > ESCAPE_THRESHOLD && this.flinchCooldown === 0) {
      this.flinchCooldown = 1.6;
      this.flinches += 1;
      this.startle = 1;
      v.yawVel += (this.rng() < 0.5 ? -1 : 1) * (2.5 + this.rng() * 2);
      this.click(1);
      this.emit('flinch');
    }

    // --- how it ends -------------------------------------------------------------
    m.hp = Math.max(0, 100 * (1 - e.t / e.ttk));
    if (e.hp <= 0) this.kill();
    else if (e.t >= e.ttk || (e.kind === 'creeper' && e.fuse > 0.9)) this.die(e.kind === 'creeper' ? 'explode' : 'shot');
  }

  kill() {
    const e = this.enemy;
    const m = this.match;
    // only the shooters have heads to aim for
    const hs = (this.game === 'cs2' || this.game === 'fortnite' || this.game === 'rdr2')
      && Math.abs(e.err) < e.size * HALF_FOV * 0.25 && this.rng() < 0.3 + 0.4 * this.track;
    m.kills += 1;
    m.team[0].k += 1;
    const foe = m.enemies.find((x) => x.name === e.name);
    if (foe) foe.d += 1;
    m.teamScore += 1;
    if (this.game === 'lol') m.gold += 300;
    if (this.game === 'cs2') { m.roundKills += 1; m.money += 300; }
    this.killStreak += 1;
    this.deathStreak = 0;
    this.career[this.game].kills += 1;
    this.rewardPulse = Math.max(this.rewardPulse, 0.75 + (hs ? 0.35 : 0) + Math.min(0.3, this.killStreak * 0.08));
    this.tilt = clamp01(this.tilt - 0.09);
    this.npf = clamp01(this.npf + 0.03);
    this.pushFeed(TAG, e.name, hs, true);
    this.lastResult = { kind: 'kill', at: this.now(), game: this.game, name: e.name, hs, streak: this.killStreak };
    this.emit(hs ? 'headshot' : 'kill', { name: e.name, streak: this.killStreak });
    if (this.rng() < 0.28) this.speak(this.pick(m.team.slice(1)).name, this.pick(this.def.praise), 0.45);
    if (this.dopamine > 0.45 && this.rng() < 0.3) this.say('me', this.pick(this.def.cockyTalk));
    this.enemy = null;
    this.firing = 0;
    m.calmFor = this.range(this.def.calm);
    if (this.game === 'cs2') this.afterDuel(false);
  }

  die(cause) {
    const e = this.enemy;
    const m = this.match;
    m.deaths += 1;
    m.team[0].d += 1;
    const foe = m.enemies.find((x) => x.name === e.name);
    if (foe) foe.k += 1;
    m.enemyScore += 1;
    m.hp = 0;
    if (this.game === 'minecraft') { m.carried = 0; }
    this.deathStreak += 1;
    this.killStreak = 0;
    this.career[this.game].deaths += 1;
    // a death is punishment, and a loom death worse
    this.punishPulse = Math.max(this.punishPulse, 0.9 + (e.loom ? 0.3 : 0) + Math.min(0.4, this.deathStreak * 0.1));
    this.startle = Math.max(this.startle, e.loom ? 1 : 0.5);
    this.npf = clamp01(this.npf - 0.045);
    this.tilt = clamp01(this.tilt + (0.07 + 0.03 * Math.min(4, this.deathStreak)) * (1.15 - this.npf * 0.5));
    if (cause === 'explode') this.flash = Math.max(this.flash, 0.8);
    this.pushFeed(e.name, TAG, this.rng() < 0.3, false);
    this.dead = { t: 0, by: e.name, cause, kind: e.kind };
    this.lastResult = { kind: 'death', at: this.now(), game: this.game, name: e.name, cause, streak: this.deathStreak };
    this.emit(cause === 'explode' ? 'explode' : 'death', { name: e.name, streak: this.deathStreak });
    this.enemy = null;
    this.firing = 0;
    m.calmFor = this.range(this.def.calm);

    // --- what the team says -----------------------------------------------------
    if (this.rng() < 0.3 + this.deathStreak * 0.12) {
      this.speak(this.pick(m.team.slice(1)).name, this.pick(this.def.flame), 0.9);
      this.punishPulse = Math.max(this.punishPulse, 1.1);
      this.tilt = clamp01(this.tilt + 0.04);
      this.emit('flame');
    }
    // --- and what the fly does about it -----------------------------------------
    if (this.tilt > 0.32 && this.rng() < this.tilt) this.say('me', this.pick(this.def.rage));
    if (this.tilt > SLAM_TILT && this.slamCooldown === 0 && this.rng() < (this.tilt - 0.45) * 1.3) this.startSlam();
    if (this.game === 'fortnite') { m.placement = m.players; return; }
    if (this.game === 'cs2') { this.afterDuel(true); return; }
    // tilted far enough, it does not wait for the match to end
    if (this.tilt > LEAVE_TILT && this.rng() < 0.5) this.rageQuit(true);
  }

  pushFeed(killer, victim, hs, us) {
    this.feed.push({ killer, victim, hs, us, at: this.clock });
    if (this.feed.length > 6) this.feed.shift();
  }

  // ------------------------------------------------------------ CS2 rounds

  afterDuel(died) {
    const m = this.match;
    let over = null;
    if (died) over = this.rng() < 0.28 + 0.12 * m.roundKills ? 'us' : 'them';
    else if (m.roundKills >= 2 || this.rng() < 0.42) over = this.rng() < 0.82 ? 'us' : 'them';
    if (!over) return;
    m.rounds[over] += 1;
    m.roundOver = { t: 0, winner: over };
    this.banner = { text: over === 'us' ? 'COUNTER-TERRORISTS WIN' : 'TERRORISTS WIN', good: over === 'us', at: this.clock };
    if (over === 'us') this.rewardPulse = Math.max(this.rewardPulse, 0.45);
    else { this.punishPulse = Math.max(this.punishPulse, 0.4); this.tilt = clamp01(this.tilt + 0.03); }
    this.emit('round', { winner: over });
  }

  nextRound() {
    const m = this.match;
    m.roundOver = null;
    m.round += 1;
    m.roundT = 0;
    m.roundKills = 0;
    m.hp = 100;
    m.money = Math.min(16000, m.money + 1900);
    this.dead = null;
    this.banner = null;
    m.calmFor = this.range(this.def.calm);
  }

  // ------------------------------------------------------------ the result

  endMatch() {
    const m = this.match;
    const g = this.game;
    let won;
    if (g === 'cs2') won = m.rounds.us >= CS2_ROUNDS_TO_WIN;
    else if (g === 'fortnite') {
      if (m.placement === null) m.placement = 1;
      won = m.placement === 1;
    } else if (g === 'minecraft') won = m.carried > 0;
    else won = this.rng() < clamp(0.5 + (m.kills - m.deaths) * 0.07 + (m.teamScore - m.enemyScore) * 0.025, 0.12, 0.88);
    m.won = won;
    const c = this.career[g];
    if (won) c.wins += 1; else c.losses += 1;
    const delta = rankDelta(g, m, this.rng);
    c.rank = Math.max(0, c.rank + delta);
    c.lastDelta = delta;

    if (won) {
      this.rewardPulse = Math.max(this.rewardPulse, 1.3);
      this.tilt = clamp01(this.tilt - 0.24);
      this.npf = clamp01(this.npf + 0.12);
    } else {
      this.punishPulse = Math.max(this.punishPulse, 1.25);
      this.tilt = clamp01(this.tilt + 0.14 + (g === 'fortnite' && m.placement === 2 ? 0.12 : 0));
      this.npf = clamp01(this.npf - 0.09);
    }
    this.result = { won, game: g, kills: m.kills, deaths: m.deaths, placement: m.placement, rounds: { ...m.rounds }, delta, carried: m.carried };
    this.history.push({ kind: won ? 'w' : 'l', game: g, at: this.now() });
    if (this.history.length > 12) this.history.shift();
    this.lastResult = { kind: won ? 'victory' : 'defeat', at: this.now(), ...this.result };
    this.phase = PHASES.RESULT;
    this.t = 0;
    this.enemy = null;
    this.dead = null;
    this.banner = null;
    this.emit(won ? 'victory' : 'defeat', this.result);
    if (won) this.say('me', this.pick(this.dopamine > 0.5 ? this.def.cockyTalk : this.def.calmTalk));
    else if (this.tilt > 0.4) this.say('me', this.pick(this.def.rage));
    else this.say('me', this.pick(this.def.calmTalk));
  }

  updateResult(dt) {
    this.drift(dt, 0.1);
    const r = this.result;
    // a loss that lands on a tilted fly lands on the desk
    if (!r.won && !this.slamPhase && this.t > 0.7 && this.t < 0.75 && this.tilt > SLAM_TILT && this.slamCooldown === 0) this.startSlam();
    if (this.t < T.result) return;
    if (!r.won && (this.tilt > RAGE_QUIT_TILT || this.match.slams >= 3)) { this.rageQuit(false); return; }
    this.chooseNext(false);
  }

  // ------------------------------------------------------------ rage-quit

  rageQuit(midMatch) {
    const c = this.career[this.game];
    c.rageQuits += 1;
    this.rageQuits += 1;
    if (midMatch) {
      c.losses += 1;
      this.history.push({ kind: 'q', game: this.game, at: this.now() });
      if (this.history.length > 12) this.history.shift();
    } else {
      // the loss is already in the log; mark it as the one it walked out of
      const last = this.history[this.history.length - 1];
      if (last) last.kind = 'q';
    }
    this.phase = PHASES.RAGE_QUIT;
    this.t = 0;
    this.enemy = null;
    this.firing = 0;
    this.punishPulse = Math.max(this.punishPulse, 0.8);
    this.startle = 1;
    this.lastResult = { kind: 'ragequit', at: this.now(), game: this.game, midMatch };
    this.say('me', this.pick(['UNINSTALLING', 'IM DONE', 'THIS GAME IS RIGGED', 'NEVER AGAIN', 'BYE']));
    this.say('system', `${TAG} has left the voice channel`);
    this.emit('rageQuit', { game: this.game, midMatch });
    if (this.slamCooldown < 0.3) { this.slamCooldown = 0; this.startSlam(); }
  }

  updateRageQuit(dt) {
    this.drift(dt, 0.02);
    this.collapse = Math.min(0.35, this.collapse + dt * 0.25);
    // a second, harder one, if the first was not enough
    if (this.t > 1.6 && this.t < 1.65 && this.tilt > 0.8 && !this.slamPhase) { this.slamCooldown = 0; this.startSlam(); }
    if (this.t >= T.rageQuit) this.chooseNext(true);
  }

  // ------------------------------------------------------- what to play next

  /**
   * Whether to queue again or open something else, and what. The pulls, all
   * read off its state:
   *   memory   what the mushroom body has learned each game is worth
   *   novelty  how long since it last played a game
   *   chase    low NPF: "one more", on whatever it is already playing
   *   tilt     it walks away from the game that tilted it
   *   habit    the same game match after match habituates: it pulls less
   */
  get appetite() {
    const values = this.gameValues;
    const chase = (1 - this.npf) * 0.5;
    const scores = {};
    for (const g of GAME_ORDER) {
      const novelty = clamp01((this.clock - this.career[g].lastPlayed) / 240);
      let s = values[g] * 1.4 + novelty * 0.55;
      // the queue button is right there; a win, or low NPF, makes it "one more" —
      // but the same game again and again wears thin fast
      if (g === this.game) s += 0.12 + chase * 0.7 + (this.result?.won ? 0.15 : 0) - this.tilt * 0.5 - this.inARow * 0.35;
      scores[g] = s;
    }
    const others = GAME_ORDER.filter((g) => g !== this.game).sort((a, b) => scores[b] - scores[a]);
    return { scores, chase, best: others[0], stay: scores[this.game] >= scores[others[0]] - 0.15 };
  }

  chooseNext(quit) {
    const a = this.appetite;
    const noise = () => (this.rng() - 0.5) * 0.25;
    let next = this.game;
    if (quit) next = a.best;
    else {
      const ranked = GAME_ORDER.map((g) => ({ g, s: a.scores[g] + noise() })).sort((x, y) => y.s - x.s);
      next = ranked[0].g;
    }
    this.collapse = 0;
    if (next === this.game) { this.inARow += 1; this.startQueue(); return; }
    this.inARow = 0;
    this.nextGame = next;
    this.phase = PHASES.SWITCHING;
    this.t = 0;
    this.switches += 1;
    this.emit('switch', { from: this.game, to: next });
  }

  updateSwitching(dt) {
    this.drift(dt, 0.02);
    if (this.t >= T.switching) {
      this.game = this.nextGame;
      this.nextGame = null;
      this.say('system', `${TAG} joined the voice channel`);
      this.emit('launch', { game: this.game });
      this.startQueue();
    }
  }

  // ============================================================ the foreleg

  click(depth) { this.pressDepth = Math.max(this.pressDepth, depth); }

  /**
   * The click fades and the grip settles on the mouse. Where the mouse goes —
   * after the turn it is making, lifted back to the middle of the pad — and
   * everything else the foreleg does is gamerGestures.js.
   */
  updateHand(dt) {
    this.pressDepth = Math.max(0, this.pressDepth - dt * 9);
    if (this.phase !== PHASES.QUEUE) this.grip += (1 - this.grip) * Math.min(1, dt * 4);
  }

  /**
   * Rage. How it comes out — one slam, two, the mouse banged on the pad, the
   * keyboard shoved, the foreleg thrown up, the headset gripped — is the
   * gestures' pick; the game only needs how long it lasts and when the desk
   * takes each blow.
   */
  startSlam(kind = null) {
    if (this.slamPhase !== null) return;
    this.rage = this.gestures.rage(kind);
    this.slamPhase = 0;
    this.slamHits = 0;
    this.slamCooldown = 10;
    this.slams += 1;
    if (this.match) this.match.slams += 1;
    this.career[this.game].slams += 1;
    this.emit('windup', { kind: this.rage.kind });
  }

  updateSlam(dt) {
    this.slamCooldown = Math.max(0, this.slamCooldown - dt);
    this.flinchCooldown = Math.max(0, this.flinchCooldown - dt);
    this.slamImpact = Math.max(0, this.slamImpact - dt * 2.2);
    if (this.slamPhase === null) return;
    const { dur, hits, kind } = this.rage;
    this.slamPhase += dt / dur;
    while (this.slamHits < hits.length && this.slamPhase * dur >= hits[this.slamHits].at) {
      const strength = hits[this.slamHits++].strength;
      this.slamImpact = Math.max(this.slamImpact, strength);
      this.startle = Math.max(this.startle, 0.6 * strength);
      this.emit('slam', { tilt: this.tilt, strength, kind });
    }
    if (this.slamPhase >= 1) { this.slamPhase = null; this.rage = null; }
  }

  // ============================================================== the senses

  /**
   * What reaches the retina and the antennae this frame. The view turning is
   * wide-field motion; an enemy is a small moving target; one that grows
   * fast is a loom; gunfire, explosions and a teammate shouting come in
   * through the headset.
   */
  updateSenses(dt) {
    const e = this.enemy;
    let loom = 0;
    if (e?.loom && e.grow < 1) loom = clamp01(e.grow * 1.4 + 0.2);
    else if (e?.kind === 'creeper') loom = 0.6 + 0.4 * clamp01(e.fuse / 0.9);
    this.loom += (loom - this.loom) * Math.min(1, dt * (loom > this.loom ? 10 : 3));
    const target = e && e.grow > 0.15 ? clamp01(0.45 + Math.abs(e.vb) * 0.4 + (0.2 - Math.min(0.2, e.size)) * 2) : 0;
    this.targetMotion += (target - this.targetMotion) * Math.min(1, dt * 6);
    this.flash = Math.max(0, this.flash - dt * 0.8);

    const voice = this.clock < this.voice.until ? this.voice.level : 0;
    const shots = this.clock - this.shotAt < 0.15 ? 0.5 : 0;
    const boom = this.dead?.cause === 'explode' && this.dead.t < 0.6 ? 1 : 0;
    const want = Math.max(voice, shots, boom, this.slamImpact * 0.6, this.phase === PHASES.PLAYING ? 0.12 : 0.05);
    this.sound += (want - this.sound) * Math.min(1, dt * 12);
  }

  get panRight() { return clamp01(this.view.yawVel / 2.2); }
  get panLeft() { return clamp01(-this.view.yawVel / 2.2); }

  updateSignals(dt) {
    this.rewardPulse = Math.max(0, this.rewardPulse - dt * 2.2);
    this.punishPulse = Math.max(0, this.punishPulse - dt * 2.2);
    this.startle = Math.max(0, this.startle - dt / 1.4);

    if (this.neural) {
      const span = 0.22;
      this.dopamine = clamp01((this.neural.reward - this.neuralRest) / span);
      this.octopamine = clamp01((this.neural.punish - this.neuralRestPunish) / span * 0.8 + this.startle);
    } else {
      // while the connectome loads: the eye's own numbers
      this.pan = clamp(this.view.yawVel / 2.2, -1, 1) * 0.6;
      this.track = 0.3 + this.targetMotion * 0.4;
      this.escape = this.loom * 0.9;
      this.dopamine += (this.rewardPulse * 0.8 - this.dopamine) * Math.min(1, dt * 3);
      this.octopamine += (this.punishPulse * 0.6 + this.startle + this.loom * 0.5 - this.octopamine) * Math.min(1, dt * 3);
    }

    // tilt: it builds from what hurts, bleeds off slowly, and a win takes a chunk off
    this.tilt = clamp01(this.tilt + (this.octopamine * 0.004 - this.tilt / 40 - this.dopamine * 0.006) * dt);
    this.tingle = this.slamPhase !== null ? 0.8 : Math.max(0, this.tilt - 0.55) * 1.2;

    const dead = this.dead ? 0.3 : 0;
    const target = clamp01(this.tilt * 0.3 + this.loom * 0.6 + clamp01(this.deathStreak / 4) * 0.25 + dead);
    this.fear += (target - this.fear) * (1 - Math.exp(-dt / (target > this.fear ? 1 : 3.5)));
    this.npf += (0.55 - this.npf) * (1 - Math.exp(-dt / 120));

    const want = 268 + 132 * clamp01(this.octopamine * 0.6 + this.fear * 0.4 + this.dopamine * 0.3
      + this.slamImpact * 0.3 + this.firing * 0.15 + this.tilt * 0.2);
    this.heartRate += (want - this.heartRate) * (1 - Math.exp(-dt / 0.5));
  }

  get deliberation() {
    if (this.phase === PHASES.QUEUE) return clamp01(this.t / T.queue);
    if (this.phase === PHASES.SWITCHING) return clamp01(this.t / T.switching);
    if (this.phase === PHASES.RESULT) return clamp01(this.t / T.result);
    return 0;
  }

  get arousal() {
    return clamp01(this.dopamine * 0.6 + this.octopamine * 0.7 + this.fear * 0.3 + this.tilt * 0.25) * (1 - this.collapse);
  }

  /** 0..1 through the rage-quit screen, the switch, the queue: for the painters. */
  get phaseProgress() {
    const len = { [PHASES.QUEUE]: T.queue + (this.game === 'cs2' ? T.accept : 0), [PHASES.RESULT]: T.result, [PHASES.RAGE_QUIT]: T.rageQuit, [PHASES.SWITCHING]: T.switching };
    return len[this.phase] ? clamp01(this.t / len[this.phase]) : 0;
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

  setVision(pan, track, escape) {
    this.pan = pan;
    this.track = track;
    this.escape = escape;
  }

  setMemory(value, learned) {
    this.memory = value;
    this.learned = learned;
  }

  setGameValues(values) { this.gameValues = values; }
}
