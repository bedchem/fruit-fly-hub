/**
 * Damian's brain in the classroom.
 *
 * One rate model over the measured MaleCNS wiring. What the lesson does to it
 * goes in through pathways a fly has:
 *
 *   the board, the room         -> the visual system
 *   the teacher's voice         -> Johnston's organ: JO-A and JO-B, the
 *                                  antennal neurons tuned to near-field sound
 *   a six and a seven together  -> the Kenyon cells (the cue is a context the
 *                                  mushroom body has a code for) and PAM, the
 *                                  reward dopamine: a cue that has paid off
 *                                  before predicts reward, and the prediction
 *                                  is itself a dopamine signal
 *   the class laughing          -> PAM, a burst
 *   silence after a 67          -> PPL1, a little
 *   the teacher's eyes on him,  -> PPL1, the punishment dopamine
 *   a strike, detention
 *   the foreleg pumping         -> mechanosensory and descending neurons
 *
 * PAM's rate above rest is handed back as the urge, PPL1's as the dread; the
 * game does the gesture when the first outruns what the second, and being
 * watched, hold down. The mushroom body learns from both as everywhere in Fly
 * Lab, and what it has learned scales how hard the next cue hits.
 *
 * A fruit fly does not know what sixty-seven is. The cue, and that laughter
 * is rewarding, are the model's; where the dopamine goes once it is released
 * is the connectome's.
 */
import { ConnectomeSim } from './simulation.js';
import { MushroomBodyMemory } from './memory.js';
import { PHASES } from '../game/sixSeven.js';

const indices = (meta, test) => meta.names.map((n, i) => [n, i]).filter(([n, i]) => test(n, i)).map(([, i]) => i);

/** PAM above rest, as a fraction of this, is the urge: 1 does it when nothing holds it back. */
const URGE_SCALE = 0.4;
const DREAD_SCALE = 0.4;
/** Current into PAM for a full-strength cue at full hype (tools/sim-67.mjs). */
const CUE_DRIVE = 0.8;

export class SixSevenBrain {
  constructor(graph, meta) {
    const P = meta.populations;
    this.P = P;
    this.S = { hearing: indices(meta, (n) => /^JO-(A|B)/.test(n)) };
    this.sim = new ConnectomeSim(graph);
    for (let i = 0; i < 12; i++) this.sim.step(0.25);
    this.rest = this.sim.rate.slice();
    // the readouts are measured against a fly sitting in class, not a network with no input
    for (let i = 0; i < 8; i++) { this.idle(); this.sim.step(0.25); }
    this.restReward = this.sim.mean(P.reward);
    this.restPunish = this.sim.mean(P.punish);
    this.memory = new MushroomBodyMemory(this.sim, graph, P, meta.names, this.rest);
  }

  get rate() { return this.sim.rate; }

  /** A pupil sitting still, looking at a board. */
  idle() {
    const { sim, P } = this;
    sim.clearInput();
    sim.drive(P.visual, 0.05);
    sim.drive(P.centralComplex, 0.04);
    sim.drive(P.mushroomBody, 0.01);
    sim.drive(P.descending, 0.035);
  }

  attach(game) { game.setNeuralRest(this.restReward, this.restPunish); }

  step(g, dt) {
    const { sim, P, S } = this;
    const f = g.fly;
    sim.clearInput();
    const awake = 1 - f.collapse * 0.5;

    // the room, and the teacher talking
    sim.drive(P.visual, 0.05);
    sim.drive(S.hearing, g.speaking * 0.35 + g.laughter * 0.3);

    // the standing state
    sim.drive(P.centralComplex, (0.04 + Math.min(1, g.cue) * 0.06) * awake);
    sim.drive(P.descending, (0.035 + f.arousal * 0.06 + f.grip * 0.1) * awake);
    sim.drive(P.mechanosensory, f.grip * 0.3);

    // a six and a seven: the context, and the reward it predicts
    sim.drive(P.mushroomBody, 0.01 + g.cue * 0.03);
    sim.drive(P.reward, g.cue * g.hype * CUE_DRIVE * awake);

    // what it got for it
    sim.drive(P.reward, g.rewardPulse * 0.5);
    sim.drive(P.punish, g.punishPulse * 0.55);
    // the teacher's eyes, heavier with every strike
    sim.drive(P.punish, g.watching * (0.03 + g.strikes * 0.05));
    if (g.phase === PHASES.DETENTION) sim.drive(P.punish, 0.12);

    sim.step(dt);
    this.memory.update(dt);
    const reward = sim.mean(P.reward), punish = sim.mean(P.punish);
    g.setNeuralReadout(reward, punish);
    g.setImpulse(Math.max(0, reward - this.restReward) / URGE_SCALE, Math.max(0, punish - this.restPunish) / DREAD_SCALE);
    g.setMemory(this.memory.value, this.memory.learned);
  }
}
