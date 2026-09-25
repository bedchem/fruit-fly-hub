/**
 * Mushroom-body learning, on the measured wiring.
 *
 * This is how a fly actually learns what something is worth. Kenyon cells
 * (KCs) carry a sparse code for the current context — here, sitting in front
 * of this machine — and synapse onto the mushroom-body output neurons (MBONs).
 * Each MBON lives in a compartment that one dopamine cluster innervates, and
 * when dopamine arrives while the KCs are active, the KC→MBON synapses in that
 * compartment are DEPRESSED (Hige et al. 2015; Cohn et al. 2015).
 *
 * Which way that pushes behaviour depends on the compartment (Aso et al. 2014):
 *
 *   PAM compartments (reward)       — their MBONs drive AVOIDANCE. Reward
 *                                     weakens them, so the context becomes
 *                                     something to approach.
 *   PPL1 compartments (punishment)  — their MBONs drive APPROACH. Punishment
 *                                     weakens them, so the context becomes
 *                                     something to avoid.
 *
 * Nothing here says which MBON is which. The pairing is read off the
 * connectome: each MBON type's dopaminergic input is counted, and in MaleCNS
 * nearly every one gets it almost entirely from PAM or almost entirely from
 * PPL1 — MBON01 (γ5β'2a) 290 PAM synapses to 1 from PPL1, MBON11 (γ1pedc)
 * 308 from PPL1. That split IS the valence.
 *
 * The rule, per KC→MBON edge, with s the synapse's strength relative to naive:
 *
 *     ds/dt = −η · kc · da · s  +  (1 − s) / τ
 *
 * kc the Kenyon cell type's rate, da the PHASIC dopamine arriving in that
 * MBON's compartment: the burst on top of its own recent level. Plasticity
 * follows dopamine bursts, not the tonic background, so the fly learns from
 * what happens to it rather than from sitting there. The second term is
 * forgetting — slow, minutes, so a memory lasts the session but is not
 * permanent. The weakened synapses are
 * written straight back into the simulation, so the network's own MBON output,
 * and everything downstream of it, changes with what the fly has learned.
 */

/** Learning rate. Set with tools/sim-session.mjs so one loss is a few percent. */
const ETA = 1.0;
/** How quickly the tonic dopamine level is tracked; what rides above it is phasic. */
const TONIC = 8;
/** Forgetting, seconds. Short-term memory in a fly lasts on the order of hours; this is compressed. */
const FORGET = 420;
/** A synapse is never silenced outright. */
const FLOOR = 0.12;

export class MushroomBodyMemory {
  /**
   * @param sim   the running ConnectomeSim (its weights are edited in place)
   * @param raw   the parsed graph with raw signed synapse counts
   * @param P     population index lists from cnsGraph.js
   * @param names type names, for the panel
   * @param rest  per-type resting rates of the settled network
   * @param opts  `sparse`: when set, a Kenyon cell counts only by how far it
   *              fires above its resting rate, times this gain. Real Kenyon
   *              cells are sparse and nearly silent; in the rate model they
   *              idle at a floor, and a page that gives each context its own
   *              Kenyon cells (the gaming setup) needs that floor not to learn.
   */
  constructor(sim, raw, P, names, rest, { sparse = 0 } = {}) {
    this.sim = sim;
    this.rest = rest;
    this.sparse = sparse;
    const KC = new Set(P.mushroomBody);
    const PAM = new Set(P.reward);
    const PPL = new Set(P.punish);

    const edges = [], edgeKC = [], edgeSlot = [];
    this.mbons = [];
    for (const m of P.mushroomOut) {
      let kcIn = 0, pamIn = 0, pplIn = 0;
      const dans = [];
      for (let p = raw.offsets[m]; p < raw.offsets[m + 1]; p++) {
        const j = raw.indices[p];
        const w = Math.abs(raw.weights[p]);
        if (KC.has(j)) kcIn += w;
        else if (PAM.has(j)) { pamIn += w; dans.push([j, w]); }
        else if (PPL.has(j)) { pplIn += w; dans.push([j, w]); }
      }
      const daIn = pamIn + pplIn;
      // an MBON with no dopaminergic input of its own has no compartment to learn in
      if (!kcIn || daIn < 5) continue;
      const slot = this.mbons.length;
      for (let p = sim.offsets[m]; p < sim.offsets[m + 1]; p++) {
        if (!KC.has(sim.indices[p])) continue;
        edges.push(p); edgeKC.push(sim.indices[p]); edgeSlot.push(slot);
      }
      this.mbons.push({
        index: m,
        name: names[m],
        // +1: a PPL1 compartment, its MBON says approach. −1: PAM, says avoid.
        valence: (pplIn - pamIn) / daIn,
        cluster: pplIn > pamIn ? 'PPL1' : 'PAM',
        dans: dans.map(([j, w]) => [j, w / daIn]),
        weight: kcIn,
        strength: 1,
        edgeCount: 0,
      });
    }
    this.edges = Int32Array.from(edges);
    this.edgeKC = Int32Array.from(edgeKC);
    this.edgeSlot = Int32Array.from(edgeSlot);
    this.base = Float32Array.from(edges, (p) => sim.weights[p]);
    this.s = new Float32Array(edges.length).fill(1);
    this.da = new Float32Array(this.mbons.length);
    this.tonic = new Float32Array(this.mbons.length);
    for (let e = 0; e < edges.length; e++) this.mbons[edgeSlot[e]].edgeCount++;
    // weight each MBON within its own side, so equal depression on both sides
    // reads as no preference rather than whichever side has more KC input
    for (const side of [1, -1]) {
      const group = this.mbons.filter((mb) => Math.sign(mb.valence) === side);
      const total = group.reduce((a, b) => a + b.weight, 0);
      group.forEach((mb) => { mb.weight /= total; });
    }

    /** −1 (this machine is bad) .. +1 (this machine is good). */
    this.value = 0;
    /** How much has been learned at all, 0..1 — the mean synaptic depression. */
    this.learned = 0;
  }

  /** Call once per frame, after the network has stepped. */
  update(dt) {
    const { sim, rest, mbons, da, tonic, s, edges, edgeKC, edgeSlot, base, sparse } = this;
    const rate = sim.rate;

    // dopamine arriving in each compartment, and the part of it that is a burst
    const follow = 1 - Math.exp(-dt / TONIC);
    for (let k = 0; k < mbons.length; k++) {
      let d = 0;
      for (const [j, f] of mbons[k].dans) d += f * Math.max(0, rate[j] - rest[j]);
      da[k] = Math.max(0, d - tonic[k]);
      tonic[k] += (d - tonic[k]) * follow;
    }

    const forget = dt / FORGET;
    const sums = new Float32Array(mbons.length);
    for (let e = 0; e < edges.length; e++) {
      const k = edgeSlot[e];
      let v = s[e];
      const kc = sparse ? Math.max(0, rate[edgeKC[e]] - rest[edgeKC[e]]) * sparse : rate[edgeKC[e]];
      v += -ETA * kc * da[k] * v * dt + (1 - v) * forget;
      v = v < FLOOR ? FLOOR : v > 1 ? 1 : v;
      s[e] = v;
      sim.weights[edges[e]] = base[e] * v;
      sums[k] += v;
    }

    // what the memory says: how far the approach side has been weakened,
    // against how far the avoid side has. Each MBON counts by how much KC
    // input it collects.
    let approachLost = 0, avoidLost = 0;
    for (let k = 0; k < mbons.length; k++) {
      const mb = mbons[k];
      mb.strength = mb.edgeCount ? sums[k] / mb.edgeCount : 1;
      const dep = (1 - mb.strength) * mb.weight;
      if (mb.valence > 0) approachLost += dep; else avoidLost += dep;
    }
    this.approachLost = approachLost;
    this.avoidLost = avoidLost;
    // losing approach drive means avoid; losing avoid drive means approach
    this.value = Math.max(-1, Math.min(1, (avoidLost - approachLost) * 2.5));
    // mean depression across both sides, as a fraction of the most it can go
    this.learned = Math.min(1, (approachLost + avoidLost) / 2 / (1 - FLOOR));
  }
}
