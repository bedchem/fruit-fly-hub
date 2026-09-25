/**
 * The fly's brain, coupled to a gaming setup.
 *
 * As at the trading desk, the fly's own sensory systems read the game,
 * rather than being handed numbers:
 *
 * TURNING. The in-game view swinging left or right is wide-field horizontal
 *   motion across the monitor, the stimulus of the optomotor response. It
 *   drives the horizontal motion detectors of the optic lobe — T4a/T5a one
 *   way, T4b/T5b the other (Maisak et al. 2013) — and the brain reads the
 *   answer from the cell types its own wiring makes selective for one
 *   direction over the other, found at start-up by the same probe the trading
 *   desk uses for up and down. That is `pan`: which way its reflex pulls.
 *
 * TARGETS. An enemy on screen is a small moving object. LC10a and LC11 are
 *   the lobula columnar cells for small objects: LC10a is what a courting male
 *   tracks a female with (Ribeiro et al. 2018), LC11 answers to small moving
 *   targets (Keleş & Frye 2017). They are driven, and what comes back
 *   downstream of them — probed at start-up, like the motion readers — is
 *   `track`: how well it is locked on.
 *
 * LOOMING. A gank, a creeper, a player jumping the wall, a peek: something
 *   growing fast on screen. LPLC2 and LC4 converge on the giant fibre, DNp01,
 *   the command neuron for escape. Past threshold, the fly flinches.
 *
 * HEARING. The headset is sound on the antennae: Johnston's organ, JO-A and
 *   JO-B, the neurons tuned to near-field sound — gunfire, and teammates.
 *
 * CONTEXT. Each game drives its own sparse set of Kenyon cells, the way an
 *   odour would, so the mushroom body learns what each game does to it
 *   separately — partly: the sets overlap through the network, and some of
 *   what one game teaches spreads to the others. Kills and wins drive PAM,
 *   deaths, defeats and flame drive PPL1.
 */
import { ConnectomeSim } from './simulation.js';
import { MushroomBodyMemory } from './memory.js';
import { findMotionReaders } from './traderBrain.js';
import { GAME_ORDER } from '../game/games.js';
import { PHASES } from '../game/gamer.js';

const RIGHT = ['T4a', 'T5a'];
const LEFT = ['T4b', 'T5b'];
const TARGET = ['LC10a', 'LC11'];
const LOOM = ['LPLC2', 'LC4'];
const ESCAPE = ['DNp01'];
const READERS = 6;
/** How hard a game drives its own Kenyon cells. */
const KC_DRIVE = 0.08;
/** Learning gain on a Kenyon cell's rate above its floor (see memory.js). */
const SPARSE = 1.6;

const indices = (meta, names) => names.map((n) => meta.names.indexOf(n)).filter((i) => i >= 0);

/**
 * The cell types most driven by the target detectors, against a quiet
 * network: probed, not listed.
 */
function findTargetReaders(graph, meta, count = READERS, exclude = []) {
  const settle = () => {
    const sim = new ConnectomeSim(graph);
    for (let i = 0; i < 12; i++) sim.step(0.25);
    return sim;
  };
  const drive = indices(meta, TARGET);
  const quiet = settle();
  const rest = quiet.rate.slice();
  for (let i = 0; i < 8; i++) quiet.step(0.25);
  const sim = settle();
  sim.clearInput();
  sim.drive(drive, 0.6);
  for (let i = 0; i < 8; i++) sim.step(0.25);
  const gain = Float32Array.from(sim.rate, (r, i) => r - quiet.rate[i]);
  const skip = new Set([...drive, ...exclude]);
  const ranked = [...gain.keys()].filter((i) => !skip.has(i)).sort((a, b) => gain[b] - gain[a]);
  return { readers: ranked.slice(0, count), gain: (i) => gain[i], rest };
}

export class GamerBrain {
  constructor(graph, meta) {
    this.P = meta.populations;
    this.names = meta.names;
    this.detectRight = indices(meta, RIGHT);
    this.detectLeft = indices(meta, LEFT);
    this.target = indices(meta, TARGET);
    this.loomers = indices(meta, LOOM);
    this.escapers = indices(meta, ESCAPE);
    this.hearing = meta.names.map((n, i) => (/^JO-(A|B)/.test(n) ? i : -1)).filter((i) => i >= 0);

    const turn = findMotionReaders(graph, meta, READERS, RIGHT, LEFT);
    this.readRight = turn.up;
    this.readLeft = turn.down;
    this.span = Math.max(1e-3, turn.up.reduce((a, i) => a + turn.selectivity(i), 0) / turn.up.length);
    // descending neurons are driven directly with arousal below; reading the
    // target from them would read arousal
    const tgt = findTargetReaders(graph, meta, READERS, [...this.P.descending, ...this.P.visual]);
    this.readTarget = tgt.readers;
    this.targetSpan = Math.max(1e-3, tgt.readers.reduce((a, i) => a + tgt.gain(i), 0) / tgt.readers.length);
    /** For the panel: which cells read the turn and the target, and how strongly. */
    this.readers = {
      right: turn.up.map((i) => ({ name: meta.names[i], sel: turn.selectivity(i) })),
      left: turn.down.map((i) => ({ name: meta.names[i], sel: turn.selectivity(i) })),
      target: tgt.readers.map((i) => ({ name: meta.names[i], sel: tgt.gain(i) })),
    };

    // one sparse set of Kenyon cell types per game, three types each; the
    // generic "KC" type is left to the network
    const kcs = this.P.mushroomBody.filter((i) => meta.names[i] !== 'KC');
    this.kcSets = Object.fromEntries(GAME_ORDER.map((g, k) => [g, kcs.filter((_, j) => j % GAME_ORDER.length === k).slice(0, 3)]));

    this.sim = new ConnectomeSim(graph);
    for (let i = 0; i < 12; i++) this.sim.step(0.25);
    this.rest = this.sim.rate.slice();
    // the target readers are also lit by the screen itself: take their
    // baseline with the monitor on and a foreleg on the mouse
    const lit = new ConnectomeSim(graph);
    for (let i = 0; i < 12; i++) lit.step(0.25);
    lit.clearInput();
    lit.drive(this.P.visual, 0.06);
    lit.drive(this.P.centralComplex, 0.04);
    lit.drive(this.P.descending, 0.05);
    lit.drive(this.P.mechanosensory, 0.2);
    for (let i = 0; i < 12; i++) lit.step(0.25);
    this.restReward = this.sim.mean(this.P.reward);
    this.restPunish = this.sim.mean(this.P.punish);
    this.restRight = this.sim.mean(this.readRight);
    this.restLeft = this.sim.mean(this.readLeft);
    this.restTarget = lit.mean(this.readTarget);
    this.restEscape = this.sim.mean(this.escapers);
    // each game has its own Kenyon cells, and only those learn while it is on
    this.memory = new MushroomBodyMemory(this.sim, graph, this.P, meta.names, this.rest, { sparse: SPARSE });
    this.kcRates = this.probeContexts(graph);
    this.pan = 0;
    this.track = 0;
    this.escape = 0;
    this.valueClock = 0;
  }

  /**
   * The Kenyon cell rates each game produces, measured once on a fresh
   * network: what the mushroom body sees as "this game". A game's learned
   * value is read through its own pattern.
   */
  probeContexts(graph) {
    const out = {};
    for (const g of GAME_ORDER) {
      const sim = new ConnectomeSim(graph);
      for (let i = 0; i < 12; i++) sim.step(0.25);
      sim.clearInput();
      sim.drive(this.kcSets[g], KC_DRIVE);
      for (let i = 0; i < 10; i++) sim.step(0.25);
      // Kenyon cells are sparse: in the rate model they idle at a floor, so a
      // game is what its pattern adds above that floor
      out[g] = Float32Array.from(this.P.mushroomBody, (i) => Math.max(0, sim.rate[i] - this.rest[i]));
    }
    return out;
  }

  /**
   * What the mushroom body says a game is worth, −1..1: the same reading as
   * MushroomBodyMemory.value, but with every KC→MBON synapse weighted by how
   * active its Kenyon cell is while that game is on screen.
   */
  valueOf(game) {
    const mem = this.memory;
    const kcIndex = new Map(this.P.mushroomBody.map((i, k) => [i, k]));
    const rates = this.kcRates[game];
    const sum = new Float32Array(mem.mbons.length);
    const wsum = new Float32Array(mem.mbons.length);
    for (let e = 0; e < mem.edges.length; e++) {
      const k = kcIndex.get(mem.edgeKC[e]);
      const w = k === undefined ? 0 : rates[k];
      sum[mem.edgeSlot[e]] += mem.s[e] * w;
      wsum[mem.edgeSlot[e]] += w;
    }
    let approachLost = 0, avoidLost = 0;
    mem.mbons.forEach((mb, k) => {
      const strength = wsum[k] ? sum[k] / wsum[k] : 1;
      const dep = (1 - strength) * mb.weight;
      if (mb.valence > 0) approachLost += dep; else avoidLost += dep;
    });
    return Math.max(-1, Math.min(1, (avoidLost - approachLost) * 2.5));
  }

  get rate() { return this.sim.rate; }

  attach(g) { g.setNeuralRest(this.restReward, this.restPunish); }

  step(g, dt) {
    const { sim, P } = this;
    sim.clearInput();
    const awake = 1 - g.collapse * 0.6;
    const playing = g.phase === PHASES.PLAYING;

    // --- the monitor, on the retina -----------------------------------------
    sim.drive(P.visual, (0.06 + g.flash * 0.25) * awake);
    sim.drive(this.detectRight, g.panRight * 0.6 * awake);
    sim.drive(this.detectLeft, g.panLeft * 0.6 * awake);
    sim.drive(this.target, g.targetMotion * 0.55 * awake);
    sim.drive(this.loomers, g.loom * 0.9);

    // --- the headset, on the antennae ------------------------------------------
    sim.drive(this.hearing, g.sound * 0.45);

    // --- which game this is: its own Kenyon cells --------------------------------
    const kc = g.phase === PHASES.SWITCHING ? null : g.game;
    if (kc) sim.drive(this.kcSets[kc], KC_DRIVE * (playing ? 1 : 0.6));

    // --- the standing state ------------------------------------------------------
    sim.drive(P.centralComplex, (0.04 + g.deliberation * 0.08) * awake);
    sim.drive(P.mushroomBody, (0.003 + g.deliberation * 0.01) * awake);
    sim.drive(P.descending, (0.03 + g.arousal * 0.08 + g.slamImpact * 0.2) * awake);
    sim.drive(P.punish, g.fear * 0.1 * awake);

    // --- the foreleg on the mouse, and on the desk --------------------------------
    sim.drive(P.mechanosensory, g.grip * 0.2 + g.pressDepth * 0.15 + g.slamImpact * 0.7);

    // --- what happens to it --------------------------------------------------------
    sim.drive(P.reward, g.rewardPulse * 0.7);
    sim.drive(P.punish, g.punishPulse * 0.6);

    sim.step(dt);
    this.memory.update(dt);

    // --- what the wiring makes of it -------------------------------------------------
    const right = sim.mean(this.readRight) - this.restRight;
    const left = sim.mean(this.readLeft) - this.restLeft;
    const raw = (right - left) / this.span;
    this.pan += (Math.max(-1.2, Math.min(1.2, raw)) - this.pan) * Math.min(1, dt * 4);
    const tgt = (sim.mean(this.readTarget) - this.restTarget) / (this.targetSpan * 0.7);
    this.track += (Math.max(0, Math.min(1, tgt)) - this.track) * Math.min(1, dt * 5);
    this.escape = Math.max(0, sim.mean(this.escapers) - this.restEscape) / 0.4;

    g.setNeuralReadout(sim.mean(P.reward), sim.mean(P.punish));
    g.setVision(this.pan, this.track, this.escape);
    // the per-game values change slowly; read them twice a second. What the
    // memory says right now is what it says about the game on screen.
    this.valueClock -= dt;
    if (this.valueClock <= 0) {
      this.valueClock = 0.5;
      this.values = Object.fromEntries(GAME_ORDER.map((id) => [id, this.valueOf(id)]));
      g.setGameValues(this.values);
    }
    g.setMemory(this.values?.[g.nextGame ?? g.game] ?? 0, this.memory.learned);
  }
}
