/**
 * Every sound in the machine, synthesised in the Web Audio graph.
 *
 * No sample files. A slot machine is metal, springs and detents, and those are
 * short transients that synthesise well — and the reel sound has to track each
 * drum's real angular velocity, which a looped sample cannot do: the detent
 * clicks have to slow down as the drum does.
 *
 * Browsers will not start an AudioContext without a gesture, so nothing is
 * built until `resume()` is called from a click or keypress.
 */

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/** Symbols around one drum — one detent click per symbol edge. */
const SYMBOLS_PER_DRUM = 6;

export class Sound {
  constructor() {
    this.ctx = null;
    this.ready = false;
    // off until the visitor's first click or keypress turns it on
    this.muted = true;
    this.reelVoices = [];
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  async resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.build();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.ready = this.ctx.state === 'running';
    return this.ready;
  }

  build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;

    // a touch of room so the metal is not bone dry
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(1.5, 2.6);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.22;
    this.dry = ctx.createGain();
    this.dry.gain.value = 1;

    this.bus = ctx.createGain();
    this.bus.connect(this.dry).connect(this.master);
    this.bus.connect(this.reverb).connect(this.wet).connect(this.master);
    this.master.connect(ctx.destination);

    this.noise = this.noiseBuffer(2);
    this.startAmbient();
  }

  noiseBuffer(seconds) {
    const n = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const n = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, n, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return buf;
  }

  now() { return this.ctx.currentTime; }

  /** One-shot noise burst through a band — the workhorse for clicks and clunks. */
  burst({ at = 0, dur = 0.08, freq = 1200, q = 4, gain = 0.4, type = 'bandpass', decay = 3 } = {}) {
    if (!this.ready || this.muted) return;
    const t = this.now() + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * decay * 0.4);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur * decay * 0.5 + 0.05);
  }

  /** A pitched body — used for thumps, bells and the win chord. */
  tone({ at = 0, freq = 440, to = null, dur = 0.5, gain = 0.25, type = 'sine', attack = 0.005 } = {}) {
    if (!this.ready || this.muted) return;
    const t = this.now() + at;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---- the machine's voice ------------------------------------------------

  /** The foreleg finding the knob: a soft chitinous tap. */
  reach() { this.burst({ freq: 2600, q: 2, gain: 0.10, dur: 0.03 }); }

  /** A ratchet detent. Called repeatedly as the lever travels. */
  ratchet(strength = 1) {
    this.burst({ freq: 1800 + Math.random() * 900, q: 9, gain: 0.10 * strength, dur: 0.02 });
    this.tone({ freq: 240 + Math.random() * 60, dur: 0.05, gain: 0.05 * strength, type: 'square' });
  }

  /** Bottom of the swing: the sear catching. */
  latch() {
    this.burst({ freq: 900, q: 2, gain: 0.5, dur: 0.12, decay: 4 });
    this.tone({ freq: 150, to: 60, dur: 0.22, gain: 0.34, type: 'triangle' });
    this.tone({ freq: 2400, to: 1500, dur: 0.07, gain: 0.10, type: 'square' });
  }

  /** The spring hauling the handle back up. */
  spring() {
    if (!this.ready || this.muted) return;
    const t = this.now();
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.26);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t, Math.random());
    src.stop(t + 0.35);
    this.burst({ at: 0.27, freq: 1400, q: 3, gain: 0.22, dur: 0.06 });
  }

  /** Lever slipped out of the fly's grip before it reached the bottom. */
  slip() {
    this.burst({ freq: 3200, q: 1.5, gain: 0.12, dur: 0.05 });
    this.tone({ freq: 420, to: 260, dur: 0.16, gain: 0.07, type: 'triangle' });
  }

  /**
   * A single reel detent: the "tck" of one symbol edge clicking past the stop.
   *
   * This is what a spinning reel actually is — a fast train of small mechanical
   * clicks, not a whoosh. Each one is a very short resonant click with a little
   * wooden body under it, and they get quieter and duller as the drum slows.
   */
  reelTick(strength = 1, index = 0) {
    if (!this.ready || this.muted) return;
    const t = this.now();
    const s = clamp(strength, 0, 1);

    // the click: a hard, short transient with a resonant peak
    const o = this.ctx.createOscillator();
    o.type = 'square';
    const f0 = 1500 + index * 180 + Math.random() * 260;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.012);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f0;
    bp.Q.value = 3.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.055 * (0.45 + 0.55 * s), t + 0.0012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.016);
    o.connect(bp).connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.03);

    // the body: a short low knock, so it reads as a mechanism and not a beep
    const b = this.ctx.createOscillator();
    b.type = 'triangle';
    b.frequency.setValueAtTime(190 + index * 22, t);
    b.frequency.exponentialRampToValueAtTime(110, t + 0.03);
    const bg = this.ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.03 * (0.4 + 0.6 * s), t + 0.002);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    b.connect(bg).connect(this.bus);
    b.start(t);
    b.stop(t + 0.05);
  }

  /**
   * The drums. Nothing here loops broadband noise — that is what made it sound
   * like a vacuum. All that runs continuously is a quiet, heavily low-passed
   * bearing rumble; the sound of the spin is the detent train in updateReels.
   */
  startReels() {
    if (!this.ready || this.muted || this.reelVoices.length) return;
    const t = this.now();
    for (let i = 0; i < 3; i++) {
      const motor = this.ctx.createOscillator();
      motor.type = 'triangle';
      motor.frequency.value = 52 + i * 6;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 180;                 // rumble only, no hiss
      const mg = this.ctx.createGain();
      mg.gain.value = 0;
      motor.connect(lp).connect(mg).connect(this.bus);
      motor.start(t);
      this.reelVoices.push({ motor, mg, tickPhase: Math.random() });
    }
  }

  /** speeds: rad/s per reel. Sets the rumble level and the detent rate. */
  updateReels(speeds, dt) {
    if (!this.ready || this.muted || !this.reelVoices.length) return;
    this.reelVoices.forEach((v, i) => {
      const speed = speeds[i] || 0;
      const s = clamp(speed / 19, 0, 1);
      v.mg.gain.value += (s * 0.016 - v.mg.gain.value) * 0.2;
      v.motor.frequency.value += (46 + s * 26 - v.motor.frequency.value) * 0.15;
      if (s <= 0.015) return;
      // one detent per symbol edge, so the click rate is the drum's real speed
      v.tickPhase += speed * dt * (SYMBOLS_PER_DRUM / (2 * Math.PI));
      // never fire more than a couple of clicks in one frame, or a dropped
      // frame turns into a burst
      let fired = 0;
      while (v.tickPhase >= 1 && fired < 2) { v.tickPhase -= 1; this.reelTick(s, i); fired++; }
      if (v.tickPhase >= 1) v.tickPhase = 0;
    });
  }

  stopReels() {
    this.reelVoices.forEach((v) => {
      try { v.motor.stop(this.now() + 0.05); } catch { /* already stopped */ }
    });
    this.reelVoices = [];
  }

  /** A drum dropping into its stop. Gets heavier for the last reel. */
  reelStop(index) {
    const heavy = index === 2;
    this.burst({ freq: heavy ? 520 : 760, q: 1.6, gain: heavy ? 0.5 : 0.38, dur: 0.14, decay: 4 });
    this.tone({ freq: heavy ? 118 : 165, to: heavy ? 52 : 72, dur: heavy ? 0.3 : 0.2, gain: 0.32, type: 'triangle' });
    this.tone({ freq: 1500 + index * 120, to: 900, dur: 0.05, gain: 0.07, type: 'square' });
  }

  /**
   * The reward. A warm chord that blooms rather than stabs, over a low swell —
   * the audible half of the dopamine curve.
   */
  win(jackpot = false) {
    if (!this.ready || this.muted) return;
    // F-major pentatonic, spread over two octaves
    const notes = jackpot
      ? [349.23, 440, 523.25, 698.46, 880, 1046.5, 1396.9]
      : [349.23, 440, 523.25, 698.46, 880];
    notes.forEach((f, i) => {
      this.tone({ at: i * 0.075, freq: f, dur: 1.5 + i * 0.16, gain: 0.13, type: 'sine', attack: 0.03 });
      this.tone({ at: i * 0.075 + 0.01, freq: f * 2, dur: 0.6, gain: 0.03, type: 'sine', attack: 0.02 });
    });
    // the swell underneath
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(87.3, t);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(200, t);
    f.frequency.linearRampToValueAtTime(jackpot ? 2200 : 1300, t + 0.45);
    f.frequency.exponentialRampToValueAtTime(220, t + 2.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(jackpot ? 0.16 : 0.10, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    o.connect(f).connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 2.9);
    if (jackpot) for (let i = 0; i < 14; i++) this.burst({ at: 0.35 + i * 0.055, freq: 3000 + Math.random() * 2500, q: 14, gain: 0.10, dur: 0.02 });
  }

  /**
   * Out of credit. The last credit drops, then a long falling tone and a
   * heartbeat that slows under it.
   */
  broke() {
    if (!this.ready || this.muted) return;
    this.tone({ freq: 220, to: 55, dur: 3.4, gain: 0.12, type: 'triangle', attack: 0.04 });
    this.tone({ at: 0.05, freq: 110, to: 41, dur: 4.2, gain: 0.08, type: 'sine', attack: 0.3 });
    let at = 0.4;
    for (let i = 0; i < 9; i++) {
      this.tone({ at, freq: 62, to: 44, dur: 0.16, gain: 0.16 * (1 - i / 11), type: 'sine' });
      at += 0.3 + i * 0.14;
    }
  }

  /** Coming round: a small rising breath, and the tray refilling. */
  revive() {
    this.tone({ freq: 196, to: 330, dur: 0.9, gain: 0.07, type: 'sine', attack: 0.2 });
    this.coin(4);
  }

  /** A loss: muted, brief, gone. */
  lose() {
    this.tone({ freq: 196, to: 146, dur: 0.3, gain: 0.12, type: 'triangle' });
    this.burst({ freq: 400, q: 1.2, gain: 0.10, dur: 0.12, decay: 3 });
  }

  /** Near-miss: the two that matched get a rising nudge before the third lands. */
  tease() {
    this.tone({ freq: 587.33, dur: 0.22, gain: 0.08, type: 'sine' });
    this.tone({ at: 0.1, freq: 698.46, dur: 0.3, gain: 0.07, type: 'sine' });
  }

  coin(n = 6) {
    for (let i = 0; i < n; i++) {
      this.burst({ at: 0.06 + i * 0.075, freq: 2600 + Math.random() * 1800, q: 10, gain: 0.14, dur: 0.03 });
      this.tone({ at: 0.06 + i * 0.075, freq: 900 + Math.random() * 500, dur: 0.09, gain: 0.05, type: 'sine' });
    }
  }

  /** The fly, idling. A wing hum you notice only when it stops. */
  startAmbient() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 212;                 // Drosophila wingbeat is ~200 Hz
    const vib = ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.value = 5.5;
    const vibG = ctx.createGain();
    vibG.gain.value = 9;
    vib.connect(vibG).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 2.4;
    const g = ctx.createGain();
    g.gain.value = 0.0;
    o.connect(f).connect(g).connect(this.bus);
    o.start(t); vib.start(t);
    this.ambient = { o, g, vib, base: 0.012 };
    g.gain.setTargetAtTime(this.ambient.base, t, 1.2);
  }

  /**
   * Excitement rides the dopamine level: faster, louder wings on a win.
   * `still` is how far the fly has collapsed — the hum you only notice when
   * it stops.
   */
  setArousal(x, still = 0) {
    if (!this.ambient || !this.ready) return;
    const a = clamp(x, 0, 1);
    const t = this.now();
    this.ambient.g.gain.setTargetAtTime(this.ambient.base * (1 + a * 3.2) * (1 - clamp(still, 0, 1)), t, 0.12);
    this.ambient.o.frequency.setTargetAtTime(212 + a * 95, t, 0.12);
  }

  // ---- the bar's voice ------------------------------------------------------

  /** Head down to the straw: a soft creak of chitin. */
  lean() { this.burst({ freq: 1400, q: 1.5, gain: 0.05, dur: 0.05 }); }

  /** One sip: a wet pull through the straw, a little lower each time. */
  sip(n = 1) {
    this.burst({ freq: 900 - n * 60, q: 3, gain: 0.16, dur: 0.16, type: 'bandpass', decay: 2 });
    this.tone({ at: 0.05, freq: 330 - n * 18, to: 190 - n * 10, dur: 0.14, gain: 0.07, type: 'sine' });
  }

  /** The bartender pours another: a rising column of noise. */
  pour() {
    if (!this.ready || this.muted) return;
    for (let i = 0; i < 18; i++) {
      this.burst({ at: i * 0.07, freq: 500 + i * 70, q: 2.5, gain: 0.08, dur: 0.09, type: 'bandpass' });
    }
    this.tone({ at: 1.3, freq: 2400, dur: 0.25, gain: 0.05, type: 'sine' });
  }

  /** The tin's lid and a pouch lifted out. */
  tin() {
    this.burst({ freq: 3200, q: 8, gain: 0.12, dur: 0.03 });
    this.tone({ freq: 1800, dur: 0.08, gain: 0.04, type: 'triangle' });
  }

  /** The lid snapping shut on its spring. */
  lidShut() {
    this.burst({ freq: 2600, q: 6, gain: 0.08, dur: 0.025 });
    this.tone({ freq: 1250, dur: 0.05, gain: 0.025, type: 'triangle' });
  }

  /** A spent pouch spat out, landing on the napkin a moment later: a damp pat. */
  spit() {
    this.burst({ freq: 1500, q: 2, gain: 0.03, dur: 0.04 });
    this.burst({ at: 0.72, freq: 420, q: 0.8, gain: 0.07, dur: 0.07 });
  }

  /** Tucked in: a soft pat, and a small bright tingle for the strong ones. */
  tuck(mg = 6) {
    this.burst({ freq: 600, q: 1, gain: 0.08, dur: 0.06 });
    const n = Math.round(mg / 4);
    for (let i = 0; i < n; i++) this.tone({ at: 0.1 + i * 0.05, freq: 2400 + i * 300, dur: 0.06, gain: 0.02, type: 'sine' });
  }

  /** Falling over: a long slide down. */
  passout() {
    this.tone({ freq: 330, to: 70, dur: 1.8, gain: 0.1, type: 'triangle', attack: 0.05 });
    this.burst({ at: 1.2, freq: 180, q: 1, gain: 0.18, dur: 0.2 });
    this.snore();
  }

  /** Snoring on the stool, until stopSnore(). */
  snore() {
    if (!this.ready || this.muted || this.snoring) return;
    const beat = () => {
      this.tone({ freq: 70, to: 95, dur: 1.1, gain: 0.05, type: 'sawtooth', attack: 0.4 });
      this.burst({ at: 1.3, freq: 700, q: 0.8, gain: 0.03, dur: 0.5, decay: 4 });
    };
    beat();
    this.snoring = setInterval(beat, 3200);
  }

  stopSnore() {
    if (this.snoring) clearInterval(this.snoring);
    this.snoring = null;
  }

  /** Nicotine poisoning: every channel at once, then nothing. */
  seizure() {
    if (!this.ready || this.muted) return;
    for (let i = 0; i < 26; i++) {
      this.burst({ at: i * 0.1, freq: 800 + Math.random() * 3000, q: 6, gain: 0.1, dur: 0.05 });
      this.tone({ at: i * 0.1, freq: 200 + Math.random() * 600, dur: 0.08, gain: 0.03, type: 'square' });
    }
    this.tone({ at: 2.6, freq: 180, to: 40, dur: 2.2, gain: 0.1, type: 'sine' });
  }

  // ---- the gaming setup, through the headset ---------------------------------

  /** A rifle shot: a crack and a thump. */
  gunshot() {
    this.burst({ freq: 1600 + Math.random() * 600, q: 0.8, gain: 0.13, dur: 0.05, decay: 2.5 });
    this.tone({ freq: 150, to: 55, dur: 0.1, gain: 0.1, type: 'triangle' });
  }

  /** The headshot ding. */
  ding() {
    this.tone({ freq: 1760, dur: 0.35, gain: 0.07 });
    this.tone({ at: 0.005, freq: 2637, dur: 0.25, gain: 0.035 });
  }

  /** A sword through the air. */
  swing() { this.burst({ freq: 900, q: 1, gain: 0.07, dur: 0.1 }); }

  /** A block breaking. */
  crunch() {
    for (let i = 0; i < 3; i++) this.burst({ at: i * 0.035, freq: 450 + Math.random() * 450, q: 2, gain: 0.08, dur: 0.05 });
  }

  /** Something green, right behind you. */
  hiss() { this.burst({ freq: 3200, q: 0.4, gain: 0.1, dur: 1.4, type: 'highpass', decay: 2 }); }

  boom() {
    this.tone({ freq: 90, to: 28, dur: 1.3, gain: 0.3, type: 'sine', attack: 0.01 });
    this.burst({ freq: 320, q: 0.7, gain: 0.32, dur: 0.6, type: 'lowpass', decay: 4 });
  }

  /** An ability going out. */
  cast() {
    this.tone({ freq: 520, to: 1100, dur: 0.18, gain: 0.04, type: 'square' });
    this.burst({ freq: 3200, q: 3, gain: 0.05, dur: 0.06 });
  }

  /** A message in the voice channel's text chat. */
  ping() {
    this.tone({ freq: 880, dur: 0.12, gain: 0.05 });
    this.tone({ at: 0.07, freq: 1320, dur: 0.2, gain: 0.04 });
  }

  /** The fly typing, hard. */
  clack(n = 8) {
    for (let i = 0; i < n; i++) this.burst({ at: i * (0.045 + Math.random() * 0.03), freq: 2800 + Math.random() * 2400, q: 7, gain: 0.07, dur: 0.02 });
  }

  /** The mouse button. */
  click() { this.burst({ freq: 4200, q: 6, gain: 0.04, dur: 0.012 }); }

  /** A foreleg on the desk: a thump, and everything on the desk rattling. */
  slam() {
    this.tone({ freq: 75, to: 38, dur: 0.4, gain: 0.34, type: 'sine', attack: 0.003 });
    this.burst({ freq: 240, q: 0.9, gain: 0.34, dur: 0.22, type: 'lowpass', decay: 3 });
    for (let i = 0; i < 12; i++) this.burst({ at: 0.02 + i * 0.022, freq: 2400 + Math.random() * 3000, q: 8, gain: 0.07, dur: 0.02 });
  }

  /** Losing a match: three notes down. */
  defeat() {
    [392, 311.13, 261.63].forEach((f, i) => this.tone({ at: i * 0.16, freq: f, dur: 0.5, gain: 0.09, type: 'triangle', attack: 0.01 }));
  }

  /** A match found. */
  queuePop() {
    this.tone({ freq: 660, dur: 0.18, gain: 0.07 });
    this.tone({ at: 0.12, freq: 990, dur: 0.3, gain: 0.07 });
  }

  /** Alt-F4: the game going away, fast. */
  rageQuit() {
    [784, 622.25, 523.25, 392].forEach((f, i) => this.tone({ at: i * 0.07, freq: f, dur: 0.2, gain: 0.06, type: 'square' }));
  }

  /** A flashbang: the ringing. */
  ring() { this.tone({ freq: 3400, dur: 2.2, gain: 0.05, type: 'sine', attack: 0.01 }); }

  setMuted(m) {
    this.muted = m;
    if (m) this.stopSnore();
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.now(), 0.05);
  }
}

export const sound = new Sound();
