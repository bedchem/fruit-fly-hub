/**
 * The fly's brain, coupled to a night of coding.
 *
 * Plain JavaScript, no React: the app steps it every frame through
 * useConnectome, and tools/sim-code.mjs steps the very same code headless.
 * Everything the night does to it goes in as current into real cell types
 * of the MaleCNS graph, or as a change in how strongly one transmitter's
 * synapses land, and everything the machine reads back is read out of them.
 *
 * SLEEP. Flies sleep, and a population in the dorsal layers of the
 * fan-shaped body (the dFB, the neurons of the 23E10 line) promotes it: the
 * longer a fly is awake, the more excitable they become, and driving them
 * puts a fly to sleep (Donlea et al. 2011, 2014). In MaleCNS those are the
 * FB6 types. Sleep pressure — the hours awake, and the small hours — is
 * current into all of them; what comes back is their mean activity, and
 * that is what the fly nods off on.
 *
 * CAFFEINE. In mammals caffeine keeps you up by blocking adenosine
 * receptors, which is how sleep pressure is felt; here that is the drive
 * into the dFB, cut by the caffeine level (coder.js, sleepDrive). In flies
 * the wake-promoting effect runs through dopamine: caffeine acts on the PAM
 * neurons, and without them it does not keep a fly awake (Nall et al. 2016).
 * So caffeine in the body is also current into PAM, and a gain on every
 * dopaminergic synapse; past the jitter mark, a gain on the cholinergic ones.
 *
 * TASTE. Caffeine is bitter, and flies avoid it: bitter gustatory neurons
 * detect it (Lee et al. 2009). Each sip drives the gustatory neurons and a
 * pulse into PPL1, the punishment cluster, fading as the taste becomes
 * familiar; sugar in the coffee is a pulse into PAM. The mushroom body
 * learns from both, on the measured wiring, as in every other experiment.
 *
 * THE DESK. The code scrolling up is upward motion for T4c/T5c; the caret
 * darting along a line is a small moving target for LC11 and LC10a; the
 * lo-fi and the keys clicking are near-field sound for Johnston's organ
 * (JO-A, JO-B). And when its head drops towards the keyboard, that is a
 * loom: LPLC2 and LC4, and the giant fibre DNp01. If the giant fibre fires,
 * it jerks awake.
 */
import { ConnectomeSim } from './simulation.js';
import { MushroomBodyMemory } from './memory.js';
import { PHASES } from '../game/coder.js';

const byName = (meta, test) => meta.names.map((n, i) => [n, i]).filter(([n]) => test(n)).map(([, i]) => i);

/** How many dFB types the panel shows. */
const DFB_SHOWN = 8;

export class CodeBrain {
  constructor(graph, meta) {
    this.P = meta.populations;
    this.names = meta.names;
    this.dFB = byName(meta, (n) => /^FB6/.test(n));
    // the rest of the central complex: action selection. The dFB is part of
    // it, and it gets the sleep drive instead
    const dfbSet = new Set(this.dFB);
    this.cx = this.P.centralComplex.filter((i) => !dfbSet.has(i));
    this.up = byName(meta, (n) => n === 'T4c' || n === 'T5c');
    this.side = byName(meta, (n) => /^T[45][ab]$/.test(n));
    this.caret = byName(meta, (n) => n === 'LC11' || n === 'LC10a');
    this.jo = byName(meta, (n) => /^JO-[AB]/.test(n));
    this.loomers = byName(meta, (n) => n === 'LPLC2' || n === 'LC4');
    this.escapers = byName(meta, (n) => n === 'DNp01');
    this.dopaminergic = [];
    this.cholinergic = [];
    meta.transmitters.forEach((t, i) => {
      if (t === 'dopamine') this.dopaminergic.push(i);
      else if (t === 'acetylcholine') this.cholinergic.push(i);
    });

    // How far the dFB can be driven: probe it once on a fresh network, the
    // way the trading desk probes its motion readers. The panel shows the
    // types that answer most.
    const probe = new ConnectomeSim(graph);
    for (let i = 0; i < 12; i++) probe.step(0.25);
    const before = probe.rate.slice();
    probe.clearInput();
    probe.drive(this.dFB, 0.5);
    for (let i = 0; i < 8; i++) probe.step(0.25);
    const lift = this.dFB.map((i) => probe.rate[i] - before[i]);
    this.dfbSpan = Math.max(1e-3, lift.reduce((a, b) => a + b, 0) / lift.length);
    this.dfbShown = this.dFB.map((i, k) => ({ i, lift: lift[k] }))
      .sort((a, b) => b.lift - a.lift).slice(0, DFB_SHOWN)
      .map(({ i }) => ({ index: i, name: meta.names[i] }));

    this.sim = new ConnectomeSim(graph);
    for (let i = 0; i < 12; i++) this.sim.step(0.25);
    this.rest = this.sim.rate.slice();
    this.restReward = this.sim.mean(this.P.reward);
    this.restPunish = this.sim.mean(this.P.punish);
    this.restDfb = this.sim.mean(this.dFB);
    this.restEscape = this.sim.mean(this.escapers);
    this.memory = new MushroomBodyMemory(this.sim, graph, this.P, meta.names, this.rest);
    this.dfb = 0;
    this.escape = 0;
    this.gains = { dopamine: 1, acetylcholine: 1 };
  }

  get rate() { return this.sim.rate; }

  attach(coder) { coder.setNeuralRest(this.restReward, this.restPunish); }

  /** Caffeine on the synapses: dopamine signalling up with the level, cholinergic past the jitters. */
  applyCaffeine(c) {
    const da = 1 + 0.3 * c.wake;
    const ach = 1 + 0.14 * c.jitter;
    const s = this.sim.preScale;
    for (const i of this.dopaminergic) s[i] = da;
    for (const i of this.cholinergic) s[i] = ach;
    this.gains.dopamine = da;
    this.gains.acetylcholine = ach;
  }

  step(c, dt) {
    const { sim, P } = this;
    sim.clearInput();
    this.applyCaffeine(c);
    const awake = 1 - c.collapse * 0.85;
    const typing = c.phase === PHASES.TYPING ? 1 : 0;

    // --- the room ----------------------------------------------------------
    // two screens in the dark, and later the window
    sim.drive(P.visual, (0.05 + c.daylight * 0.03) * awake);
    // lo-fi from the speaker and the keys clicking: near-field sound
    sim.drive(this.jo, 0.05 + c.keyPulse * 0.12);
    // the code scrolls up a line: upward motion; the caret: a small moving target
    sim.drive(this.up, c.scroll * 0.35 * awake);
    sim.drive(this.side, c.keyPulse * 0.12 * awake);
    sim.drive(this.caret, (0.03 + typing * 0.15) * awake);
    // the keyboard coming at its face as its head drops
    sim.drive(this.loomers, c.loom * 0.6);

    // --- the standing state --------------------------------------------------
    sim.drive(this.cx, (0.04 + c.deliberation * 0.08) * awake);
    sim.drive(P.mushroomBody, (0.004 + c.deliberation * 0.016 + c.flow * 0.006) * awake);
    sim.drive(P.descending, (0.03 + c.arousal * 0.08 + c.jitter * 0.2) * awake);
    sim.drive(P.mechanosensory, c.grip * 0.25 + c.keyPulse * 0.3);

    // --- the coffee ----------------------------------------------------------
    sim.drive(P.gustatory, c.extend * 0.15 + c.sipPulse * 0.4);
    // bitter: aversive, less so once it knows the taste
    sim.drive(P.punish, c.sipPulse * 0.5 * (1 - c.familiar));
    if (c.sugar) sim.drive(P.reward, c.sipPulse * 0.3);
    // caffeine arriving, and caffeine in: PAM (Nall et al. 2016)
    sim.drive(P.reward, (c.wake * 0.1 + Math.min(1, c.caffeineRise * 0.12) * 0.25) * awake);

    // --- the work --------------------------------------------------------------
    sim.drive(P.reward, (c.rewardPulse ?? 0) * 0.7 + c.flow * 0.05 * awake);
    sim.drive(P.punish, (c.punishPulse ?? 0) * 0.6 + c.jitter * 0.22 + c.fear * 0.1);

    // --- sleep ---------------------------------------------------------------
    sim.drive(this.dFB, c.sleepDrive * 0.5);

    sim.step(dt);
    this.memory.update(dt);

    const dfb = Math.max(0, sim.mean(this.dFB) - this.restDfb) / this.dfbSpan;
    this.dfb += (dfb - this.dfb) * Math.min(1, dt * 0.8);
    this.escape = Math.max(0, sim.mean(this.escapers) - this.restEscape) / 0.4;

    c.setNeuralReadout(sim.mean(P.reward), sim.mean(P.punish));
    c.setSleep(this.dfb, this.escape);
    c.setMemory(this.memory.value, this.memory.learned);
  }
}
