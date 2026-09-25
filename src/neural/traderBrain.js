/**
 * The fly's brain, coupled to a trading screen.
 *
 * The idea is to let the fly's own visual system read the chart, rather than
 * handing it a number. Three measured circuits make that possible:
 *
 * MOTION. The chart is on a monitor filling much of the fly's view; the
 *   newest candle climbing or falling is vertical motion. In the optic lobe,
 *   T4 and T5 cells are the elementary motion detectors, in four subtypes by
 *   preferred direction: T4c/T5c respond to upward motion, T4d/T5d to
 *   downward (Maisak et al. 2013, Nature). The chart drives those, and only
 *   those.
 *
 *   What comes back is read from further downstream — from the cell types
 *   the wiring itself makes direction-selective. They are not listed here:
 *   at start-up the brain probes its own connectome, driving the upward
 *   detectors and then the downward ones, and keeps the types that answer
 *   most differently. On MaleCNS that finds lobula-plate cells such as
 *   LPi34 and Tlp14 for upward motion, and VS and LPi43 for downward — the
 *   vertical system, which prefers downward motion in a real fly too. The
 *   "trend" the fly trades on is the balance of those two groups.
 *
 * LOOMING. A crash is a red bar growing fast on screen — an approaching
 *   object. LPLC2 and LC4 are the looming detectors, and they converge on
 *   the giant fibre, DNp01, the command neuron for escape (von Reyn et al.
 *   2014; Ache et al. 2019). The crash drives LPLC2 and LC4; if DNp01 then
 *   crosses threshold in the simulation, the fly escapes — it sells.
 *
 * VALUE. Realised profit drives the reward cluster PAM, realised loss the
 *   punishment cluster PPL1, and the mushroom body learns from both on the
 *   measured wiring, exactly as in the casino.
 */
import { ConnectomeSim } from './simulation.js';
import { MushroomBodyMemory } from './memory.js';
import { PHASES } from '../game/trader.js';

const UP = ['T4c', 'T5c'];
const DOWN = ['T4d', 'T5d'];
const LOOM = ['LPLC2', 'LC4'];
const ESCAPE = ['DNp01'];
/** How many downstream types to read each direction from. */
const READERS = 6;

const indices = (meta, names) => names.map((n) => meta.names.indexOf(n)).filter((i) => i >= 0);

/**
 * Finds the cell types that the connectome itself makes selective for up
 * versus down, by driving each set of detectors on a fresh network and
 * comparing where the activity lands. `a` and `b` name the two detector sets
 * to compare; the defaults are the vertical ones the trading desk reads.
 */
export function findMotionReaders(graph, meta, count = READERS, a = UP, b = DOWN) {
  const settle = () => {
    const sim = new ConnectomeSim(graph);
    for (let i = 0; i < 12; i++) sim.step(0.25);
    return sim;
  };
  const response = (drive) => {
    const sim = settle();
    const rest = sim.rate.slice();
    sim.clearInput();
    sim.drive(drive, 0.6);
    for (let i = 0; i < 8; i++) sim.step(0.25);
    return Float32Array.from(sim.rate, (r, i) => r - rest[i]);
  };
  const up = indices(meta, a);
  const down = indices(meta, b);
  const ru = response(up);
  const rd = response(down);
  const skip = new Set([...up, ...down]);
  const ranked = [...ru.keys()].filter((i) => !skip.has(i)).sort((a, b) => (ru[b] - rd[b]) - (ru[a] - rd[a]));
  return {
    up: ranked.slice(0, count),
    down: ranked.slice(-count).reverse(),
    selectivity: (i) => ru[i] - rd[i],
  };
}

export class TraderBrain {
  constructor(graph, meta) {
    this.P = meta.populations;
    this.names = meta.names;
    this.detectUp = indices(meta, UP);
    this.detectDown = indices(meta, DOWN);
    this.loomers = indices(meta, LOOM);
    this.escapers = indices(meta, ESCAPE);

    const readers = findMotionReaders(graph, meta);
    this.readUp = readers.up;
    this.readDown = readers.down;
    /** For the panel: which cells read the chart, and how selective they are. */
    this.readers = {
      up: readers.up.map((i) => ({ name: meta.names[i], sel: readers.selectivity(i) })),
      down: readers.down.map((i) => ({ name: meta.names[i], sel: readers.selectivity(i) })),
    };
    // scale so a strong, sustained move reads about ±1
    this.span = Math.max(1e-3,
      readers.up.reduce((a, i) => a + readers.selectivity(i), 0) / readers.up.length);

    this.sim = new ConnectomeSim(graph);
    for (let i = 0; i < 12; i++) this.sim.step(0.25);
    this.rest = this.sim.rate.slice();
    this.restReward = this.sim.mean(this.P.reward);
    this.restPunish = this.sim.mean(this.P.punish);
    this.restUp = this.sim.mean(this.readUp);
    this.restDown = this.sim.mean(this.readDown);
    this.restEscape = this.sim.mean(this.escapers);
    this.memory = new MushroomBodyMemory(this.sim, graph, this.P, meta.names, this.rest);
    this.trend = 0;
    this.escape = 0;
  }

  get rate() { return this.sim.rate; }

  attach(trader) { trader.setNeuralRest(this.restReward, this.restPunish); }

  step(tr, dt) {
    const { sim, P } = this;
    sim.clearInput();
    const awake = 1 - tr.collapse * 0.8;

    // --- the screen, on the retina ---------------------------------------
    sim.drive(P.visual, 0.06 * awake);
    sim.drive(this.detectUp, tr.upMotion * 0.6 * awake);
    sim.drive(this.detectDown, tr.downMotion * 0.6 * awake);
    sim.drive(this.loomers, tr.loom * 0.9);

    // --- the standing state --------------------------------------------------
    sim.drive(P.centralComplex, (0.04 + tr.deliberation * 0.08) * awake);
    sim.drive(P.mushroomBody, (0.004 + tr.deliberation * 0.016) * awake);
    sim.drive(P.descending, (0.03 + tr.arousal * 0.08) * awake);
    sim.drive(P.punish, tr.fear * 0.12 * awake);

    // --- the foreleg on the buttons ----------------------------------------
    sim.drive(P.mechanosensory, tr.grip * 0.4 + tr.pressDepth * 0.2);

    // --- money -------------------------------------------------------------
    sim.drive(P.reward, tr.rewardPulse * 0.7);
    sim.drive(P.punish, tr.punishPulse * 0.6);
    // watching an open position: a small, tonic pull either way
    const u = tr.unrealizedPct;
    if (u > 0) sim.drive(P.reward, Math.min(0.12, u * 3));
    else sim.drive(P.punish, Math.min(0.15, -u * 3));
    if (tr.phase === PHASES.MARGIN_CALL) sim.drive(P.punish, 0.7 * (1 - tr.collapse * 0.5));

    sim.step(dt);
    this.memory.update(dt);

    // --- what the wiring makes of the chart --------------------------------
    const up = sim.mean(this.readUp) - this.restUp;
    const down = sim.mean(this.readDown) - this.restDown;
    const raw = (up - down) / this.span;
    this.trend += (Math.max(-1.2, Math.min(1.2, raw)) - this.trend) * Math.min(1, dt * 3);
    this.escape = Math.max(0, sim.mean(this.escapers) - this.restEscape) / 0.4;

    tr.setNeuralReadout(sim.mean(P.reward), sim.mean(P.punish));
    tr.setVision(this.trend, this.escape);
    tr.setMemory(this.memory.value, this.memory.learned);
  }
}
