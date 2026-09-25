/**
 * The coder's room, in sound: rain on the window, a lo-fi loop from the
 * little speaker, vinyl crackle, and the desk — keys, the trackpad, the mug.
 *
 * Everything is synthesised on the shared Web Audio graph of audio.js, so the
 * page's one sound switch covers it: nothing plays until the visitor turns
 * sound on, and muting mutes this too. The loop is four seventh chords
 * through a warm low-pass, the kind of thing a fly would code to at 3 am.
 * Rain and music also reach the fly's own antennae (codeBrain.js, JO-A/B).
 */
import { sound } from './audio.js';

/** Fmaj7, Em7, Dm7, Cmaj7: down a step at a time, round and round. */
const CHORDS = [
  [174.61, 220.0, 261.63, 329.63],
  [164.81, 196.0, 246.94, 293.66],
  [146.83, 174.61, 220.0, 261.63],
  [130.81, 164.81, 196.0, 246.94],
];
const BAR_S = 3.6;

class Cozy {
  constructor() {
    this.nodes = null;
    this.t = 0;
    this.chord = -1;
    this.lastKey = 0;
  }

  build() {
    const ctx = sound.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(sound.bus);

    // rain: the noise buffer, looped, through a band that sounds like water on glass
    const rain = ctx.createBufferSource();
    rain.buffer = sound.noise;
    rain.loop = true;
    const rainBand = ctx.createBiquadFilter();
    rainBand.type = 'bandpass'; rainBand.frequency.value = 2300; rainBand.Q.value = 0.5;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0.035;
    rain.connect(rainBand).connect(rainGain).connect(out);
    rain.start();

    // the loop: four voices, slightly detuned, through a wobbling low-pass
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass'; lowpass.frequency.value = 850; lowpass.Q.value = 0.8;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.04;
    lowpass.connect(padGain).connect(out);
    const voices = CHORDS[0].map((f, k) => {
      const o = ctx.createOscillator();
      o.type = k === 0 ? 'sine' : 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = k === 0 ? 0.4 : 0.22;
      o.connect(g).connect(lowpass);
      o.start();
      return { o, g };
    });
    this.nodes = { out, rain, rainGain, lowpass, padGain, voices };
  }

  /** Called every frame by the scene. Builds itself the first time sound is on. */
  update(c, dt) {
    if (!sound.ready || !sound.ctx || sound.muted) {
      if (this.nodes) this.nodes.out.gain.setTargetAtTime(0, sound.now(), 0.3);
      return;
    }
    if (!this.nodes) this.build();
    const n = this.nodes;
    const now = sound.now();
    this.t += dt;
    n.out.gain.setTargetAtTime(1, now, 0.8);

    // the next chord on the bar
    const idx = Math.floor(this.t / BAR_S) % CHORDS.length;
    if (idx !== this.chord) {
      this.chord = idx;
      CHORDS[idx].forEach((f, k) => {
        const detune = 1 + (k % 2 ? 0.004 : -0.003);
        n.voices[k].o.frequency.setTargetAtTime(f * detune, now, 0.06);
        // a soft attack on each chord, like a key on a Rhodes
        n.voices[k].g.gain.cancelScheduledValues(now);
        n.voices[k].g.gain.setValueAtTime(k === 0 ? 0.4 : 0.1, now);
        n.voices[k].g.gain.linearRampToValueAtTime(k === 0 ? 0.4 : 0.24, now + 0.25);
      });
      // a brushed hat on the one, a kick under it
      sound.burst({ freq: 7000, q: 2, gain: 0.012, dur: 0.03 });
      sound.tone({ freq: 70, to: 48, dur: 0.22, gain: 0.05, type: 'sine' });
    }
    // half-way through the bar, a snare-ish brush
    const inBar = (this.t % BAR_S) / BAR_S;
    if (this.lastHalf !== (inBar > 0.5)) {
      this.lastHalf = inBar > 0.5;
      if (this.lastHalf) sound.burst({ freq: 1800, q: 0.9, gain: 0.018, dur: 0.06 });
    }

    // asleep: the music drops away and the rain comes up; at dawn the rain eases
    const sleepy = c.asleep ? 0.35 : 1;
    n.padGain.gain.setTargetAtTime(0.042 * sleepy, now, 0.6);
    n.lowpass.frequency.setTargetAtTime(760 + 260 * Math.sin(this.t * 0.37), now, 0.4);
    n.rainGain.gain.setTargetAtTime((c.asleep ? 0.05 : 0.032) * (1 - (c.daylight ?? 0) * 0.7), now, 1.2);

    // vinyl crackle
    if (Math.random() < dt * 4) sound.burst({ freq: 2500 + Math.random() * 3500, q: 9, gain: 0.012, dur: 0.008 });
  }

  /** A MacBook key: short, soft, a little different every time. */
  key() {
    const t = performance.now();
    if (t - this.lastKey < 25) return;
    this.lastKey = t;
    sound.burst({ freq: 3400 + Math.random() * 1400, q: 5, gain: 0.03, dur: 0.012 });
  }

  /** The trackpad's click. */
  click() { sound.burst({ freq: 5200, q: 7, gain: 0.03, dur: 0.01 }); }

  /** The mug set down on the desk. */
  clink() {
    sound.tone({ freq: 1320, dur: 0.18, gain: 0.03, type: 'sine' });
    sound.burst({ freq: 900, q: 3, gain: 0.05, dur: 0.03 });
  }

  /** A sip: a small slurp. */
  sip() { sound.burst({ freq: 700, q: 1.5, gain: 0.04, dur: 0.12, type: 'bandpass', decay: 2 }); }

  /** Pouring from the French press. */
  pour() { sound.pour(); }

  /** An error: two small descending blips, not a siren. */
  error() {
    sound.tone({ freq: 440, dur: 0.12, gain: 0.05, type: 'triangle' });
    sound.tone({ at: 0.1, freq: 330, dur: 0.18, gain: 0.05, type: 'triangle' });
  }

  /** Green: a small major third. */
  ok() {
    sound.tone({ freq: 659.25, dur: 0.18, gain: 0.04, type: 'sine' });
    sound.tone({ at: 0.08, freq: 830.61, dur: 0.3, gain: 0.04, type: 'sine' });
  }

  /** Deployed to pokyh.com: the jackpot. */
  deploy() { sound.win(false); }

  /** The head snapping back up. */
  jerk() { sound.burst({ freq: 1500, q: 1.2, gain: 0.08, dur: 0.05 }); sound.tone({ freq: 180, to: 320, dur: 0.15, gain: 0.05 }); }
}

export const cozy = new Cozy();
