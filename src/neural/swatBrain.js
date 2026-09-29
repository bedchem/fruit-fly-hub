/**
 * The fly's brain at the kitchen table.
 *
 * One rate model over the measured MaleCNS wiring. What the table does to it
 * goes in through the pathways a fly would really use:
 *
 *   the swatter head growing   -> the looming detectors LPLC2 and LC4, which
 *   in its visual field           converge on the giant fibre DNp01
 *   the swatter moving,        -> the elementary motion detectors T4 and T5
 *   its own flight
 *   beer under its feet        -> the gustatory neurons, and a reward burst
 *                                 (PAM) with each good sip
 *   ethanol arriving           -> PAM, as at the bar: ethanol is rewarding to
 *                                 a fly (Kaun et al. 2011)
 *   ethanol in the body        -> GABA synapses stronger, acetylcholine and
 *                                 glutamate weaker (pharmacology.js). The
 *                                 looming pathway is mostly cholinergic, so a
 *                                 drunk fly's giant fibre gets there later.
 *   a near miss, a hit         -> PPL1, the punishment dopamine
 *   landing, being hit         -> the mechanosensory neurons
 *
 * DNp01's rate above rest is handed back to the game as the escape signal;
 * nothing else decides when it takes off. The mushroom body learns from the
 * dopamine as everywhere else in Fly Lab: near misses, through PPL1, make the
 * table something to avoid, and the game reads that as vigilance — its
 * looming pathway answers sooner the more it has learned to fear the table.
 */
import { ConnectomeSim } from './simulation.js';
import { MushroomBodyMemory } from './memory.js';
import { applyDrugs, transmitterGroups } from './pharmacology.js';

const indices = (meta, test) => meta.names.map((n, i) => [n, i]).filter(([n, i]) => test(n, i)).map(([, i]) => i);

/**
 * How hard the bar's ethanol model is applied here. At full strength a fly at
 * 0.6 per mille never reaches takeoff at all; real drunk flies escape late, not
 * never. At this gain a fly about to pass out needs roughly half as long again
 * to fire its giant fibre (tools/sim-swat.mjs).
 */
const ETHANOL_GAIN = 0.4;

/** DNp01 above rest, as a fraction of this, is the escape signal (1 = takeoff). */
const ESCAPE_SCALE = 0.4;

export class SwatBrain {
  constructor(graph, meta) {
    const P = meta.populations;
    this.P = P;
    this.S = {
      loom: indices(meta, (n) => n === 'LPLC2' || n === 'LC4'),
      motion: indices(meta, (n) => /^T[45][abcd]$/.test(n)),
      escape: indices(meta, (n) => n === 'DNp01'),
    };
    this.groups = transmitterGroups(meta);
    this.drugs = { ach: 1, gaba: 1, glu: 1 };
    this.sim = new ConnectomeSim(graph);
    for (let i = 0; i < 12; i++) this.sim.step(0.25);
    this.rest = this.sim.rate.slice();
    // the readouts are measured against a fly standing on the table, not a
    // network with no input at all: two seconds of the resting drive first
    for (let i = 0; i < 8; i++) { this.idle(); this.sim.step(0.25); }
    this.restReward = this.sim.mean(P.reward);
    this.restPunish = this.sim.mean(P.punish);
    this.restEscape = this.sim.mean(this.S.escape);
    this.memory = new MushroomBodyMemory(this.sim, graph, P, meta.names, this.rest);
  }

  get rate() { return this.sim.rate; }

  /** What a calm fly standing on the table gets: light, and itself. */
  idle() {
    const { sim, P } = this;
    sim.clearInput();
    sim.drive(P.visual, 0.06);
    sim.drive(P.centralComplex, 0.04);
    sim.drive(P.mushroomBody, 0.012);
    sim.drive(P.descending, 0.038);
    sim.drive(P.mechanosensory, 0.05);
  }

  attach(game) {
    game.setNeuralRest(this.restReward, this.restPunish);
  }

  step(game, dt) {
    const { sim, P, S } = this;
    const f = game.fly;
    // slow motion slows the brain with everything else
    dt *= game.timeScale ?? 1;
    sim.clearInput();
    this.drugs = applyDrugs(sim, this.groups, { intox: game.intox * ETHANOL_GAIN, nicotine: 0, hangover: 0 });
    const awake = 1 - f.collapse * 0.85;

    // daylight on the table, and what moves in it
    sim.drive(P.visual, 0.06 * awake);
    sim.drive(S.motion, game.motion * 0.35 * awake);
    sim.drive(S.loom, game.loom * 1.1 * awake);
    sim.drive(P.punish, game.loom * 0.3 * awake);

    // the standing state
    sim.drive(P.centralComplex, (0.04 + f.walking * 0.05) * awake);
    sim.drive(P.mushroomBody, 0.012 * awake);
    sim.drive(P.descending, (0.03 + f.arousal * 0.08 + f.walking * 0.04) * awake);

    // beer: taste on the proboscis, and ethanol arriving in the body
    sim.drive(P.gustatory, game.feeding * 0.4);
    sim.drive(P.reward, (game.feeding * 0.04 + game.rewardPulse * 0.45 + Math.min(1, game.ethanolRise * 1.5) * 0.3) * awake);

    // what happened to it
    sim.drive(P.punish, game.punishPulse * 0.6);
    sim.drive(P.mechanosensory, 0.05 + game.mechPulse * 0.5 + f.walking * 0.1);

    sim.step(dt);
    this.memory.update(dt);
    game.setNeuralReadout(sim.mean(P.reward), sim.mean(P.punish));
    game.setEscape(Math.max(0, sim.mean(S.escape) - this.restEscape) / ESCAPE_SCALE);
    game.setMemory(this.memory.value, this.memory.learned);
  }
}
