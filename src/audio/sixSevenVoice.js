/**
 * Damian's voice.
 *
 * He says it out loud with the browser's own speech synthesis: no recording
 * is shipped (the clip the meme comes from is somebody's song), and nothing
 * is fetched. Only voices the browser reports as local to the device are
 * used — some browsers also list voices that send the text to a server, and
 * the privacy notice says no request leaves this domain.
 *
 * An English voice is preferred. A device set up in another language often
 * has none, so any local voice will do, given the words spelled the way that
 * language would have to read them to land near "six seven". With no local
 * voice at all there is no speech, and the two-note chant in SixSevenApp
 * carries it alone.
 *
 * Speech follows the page's sound switch: it never speaks while muted, and a
 * browser only lets it speak after the visitor has interacted with the page,
 * which is when the sound comes on anyway.
 */
import { sound } from './audio.js';

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let voice = null;

/** "Six seven", as each language's voice has to be given it; `loud` draws the seven out. */
const SPELLING = {
  en: { loud: 'six seveeen! six seveeen!', quiet: 'six seven' },
  de: { loud: 'Sicks Säwwen! Sicks Säwwen!', quiet: 'Sicks Säwwen' },
  it: { loud: 'Sics sèven! Sics sèven!', quiet: 'Sics sèven' },
  fr: { loud: 'Sixe sévène ! Sixe sévène !', quiet: 'Sixe sévène' },
  es: { loud: '¡Sics seven! ¡Sics seven!', quiet: 'Sics seven' },
};
const ORDER = ['en', 'de', 'it', 'fr', 'es'];
const langOf = (v) => v.lang.slice(0, 2).toLowerCase();

/** The best local voice: English first, then the languages there is a spelling for, then anything. */
function pickVoice() {
  if (!synth) return null;
  const local = synth.getVoices().filter((v) => v.localService);
  if (!local.length) return null;
  const score = (v) => {
    const i = ORDER.indexOf(langOf(v));
    return (i < 0 ? 0 : (ORDER.length - i) * 10)
      + (/en[-_]US/i.test(v.lang) ? 3 : 0)
      + (/child|kid|junior/i.test(v.name) ? 4 : 0)
      + (v.default ? 1 : 0);
  };
  return local.sort((a, b) => score(b) - score(a))[0];
}

if (synth) {
  voice = pickVoice();
  // most browsers load their voice list late
  synth.addEventListener?.('voiceschanged', () => { voice = pickVoice(); });
}

/** Can he actually be heard saying it on this device? */
export const canSpeak = () => !!synth && !!voice;

/**
 * "Six seveeen" — out loud twice over for the full gesture, once and quietly
 * when it is muttered. Returns whether anything was spoken.
 */
export function saySixSeven({ mutter = false } = {}) {
  if (!canSpeak() || sound.muted || !sound.ready) return false;
  synth.cancel();
  const words = SPELLING[langOf(voice)] ?? SPELLING.en;
  const u = new SpeechSynthesisUtterance(mutter ? words.quiet : words.loud);
  u.voice = voice;
  u.lang = voice.lang;
  // pitched up and a little quick: a kid at the back of the class
  u.pitch = mutter ? 1.2 : 1.7;
  u.rate = mutter ? 1.25 : 1.15;
  u.volume = mutter ? 0.3 : 1;
  synth.speak(u);
  return true;
}

/** Cut off mid-word: the teacher has seen him, or the sound was switched off. */
export function hush() {
  synth?.cancel();
}
