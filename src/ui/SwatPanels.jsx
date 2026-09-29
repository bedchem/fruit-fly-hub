/**
 * The pub table's readouts: the score and what both sides are doing (top
 * right), the escape circuit live — the looming input, the giant fibre and
 * its threshold — the scoreboard, and the cards for each blow.
 *
 * Everything that moves continuously is read off the game on an animation
 * frame, like the other experiments' panels.
 */
import { useEffect, useRef } from 'react';
import { refocusHowButton } from './HowItWorks.jsx';
import { PHASES, HAND, PREPARE, TAKEOFF, SEDATION_MM, MM_PER_PERMILLE } from '../game/swatter.js';

function useFrameLoop(ref, fn) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const m = ref.current;
      if (m) fnRef.current(m);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ref]);
}

const setText = (el, v) => { if (el && el.textContent !== String(v)) el.textContent = v; };
const ms = (x) => (x === null || x === undefined ? '—' : `${Math.round(x)} ms`);

/** What the fly is doing, in a few words. */
export function flyDoing(g) {
  const f = g.fly;
  if (f.phase === PHASES.STUNNED) return 'swatted — dazed on the table';
  if (f.phase === PHASES.OUT) return 'passed out in the beer';
  if (f.phase === PHASES.AIR) return g.air?.mode === 'short' ? 'airborne — short-mode takeoff, tumbling' : 'airborne — long-mode takeoff';
  if (g.pendingTakeoff) return 'giant fibre fired — jumping';
  const drunk = g.permille >= 1.1 ? ', drunk' : g.permille >= 0.5 ? ', tipsy' : '';
  switch (f.action) {
    case 'prep': return 'raising its body, leaning away';
    case 'freeze': return 'frozen, watching the swatter';
    case 'drink': return `drinking beer${drunk}`;
    case 'walk': return (g.craving > 0.3 ? 'walking to the beer' : 'walking about') + drunk;
    case 'groom': return 'wiping its eyes';
    default: return `standing about${drunk}`;
  }
}

const HAND_WORDS = {
  [HAND.WAIT]: 'somewhere out of sight',
  [HAND.STALK]: 'closing in, slowly',
  [HAND.HOVER]: 'hovering above it',
  [HAND.SWING]: 'SWING',
  [HAND.IMPACT]: 'on the table',
  [HAND.LIFT]: 'lifting, checking',
};

const RUNLOG_SLOTS = 16;
function Outcomes({ history }) {
  const empty = Math.max(0, RUNLOG_SLOTS - history.length);
  const cls = { hit: 'x', near: 'n', escape: 'w', whiff: 'o', early: 'e' };
  return (
    <div className="history">
      <span className="history-label">Swings:</span>
      <div className="runlog swatlog tip" data-tip="The last swings. Green: escaped cleanly. Pale red: escaped by under 70 ms. Dark red: swatted. Grey: the hand missed on its own. Outlined: it left before the swing began.">
        {history.map((h, i) => <i key={h.at ?? i} className={cls[h.kind] ?? 'o'} />)}
        {Array.from({ length: empty }, (_, i) => <i key={`e${i}`} className="empty" />)}
      </div>
    </div>
  );
}

export function SwatBank({ gameRef, ui }) {
  const escRef = useRef(null);
  const hitRef = useRef(null);
  const doingRef = useRef(null);
  const handRef = useRef(null);
  const skillRef = useRef(null);
  useFrameLoop(gameRef, (g) => {
    setText(escRef.current, g.stats.escapes);
    setText(hitRef.current, g.stats.hits);
    setText(doingRef.current, flyDoing(g));
    setText(handRef.current, HAND_WORDS[g.hand.phase]);
    if (handRef.current) handRef.current.dataset.state = g.hand.phase;
    if (skillRef.current) skillRef.current.style.setProperty('--v', String(g.hand.skill));
  });
  return (
    <aside className="bank swatbank">
      <div className="swat-score">
        <div className="tip" data-tip="Swings it got away from, near misses included.">
          <b ref={escRef}>0</b><span>escaped</span>
        </div>
        <div className="tip hits" data-tip="Swings that landed. It is a simulation: it lies dazed for a few seconds and gets up again, warier.">
          <b ref={hitRef}>0</b><span>swatted</span>
        </div>
      </div>
      <p className="swat-line"><span>The fly</span><b ref={doingRef}>grooming</b></p>
      <p className="swat-line"><span>The hand</span><b ref={handRef} className="swat-hand">somewhere out of sight</b></p>
      <div className="vital swat-skill tip" data-tip="How fast the hand swings. Every miss makes it quicker and more impatient, and it learns to aim a little ahead, where flies jump. A hit settles it down again." ref={skillRef}>
        <span className="vital-label">Hand speed</span>
        <div className="vital-track"><i /></div>
      </div>
      <Outcomes history={ui.history} />
      {ui.streak > 2 && <div className="bank-tags"><div className="tag">streak ×{ui.streak}</div></div>}
    </aside>
  );
}

// ------------------------------------------------------------ side panel

/** The escape circuit, live: loom in, giant fibre out, and what tunes it. */
export function EscapeCircuit({ gameRef }) {
  const refs = useRef({});
  useFrameLoop(gameRef, (g) => {
    const rows = {
      loom: [Math.min(1, g.loom / 1.5), g.loom.toFixed(2)],
      gf: [Math.min(1, g.escape / (2 * TAKEOFF)), g.escape.toFixed(2)],
      fear: [g.fly.fear, g.fly.fear.toFixed(2)],
      wary: [g.vigilance, g.vigilance.toFixed(2)],
      bac: [g.bac / SEDATION_MM, `${g.permille.toFixed(2)} ‰`],
      hunger: [g.craving, g.craving.toFixed(2)],
    };
    for (const [k, [v, text]] of Object.entries(rows)) {
      const el = refs.current[k];
      if (!el) continue;
      el.style.setProperty('--v', String(Math.max(0, Math.min(1, v))));
      setText(el.querySelector('output'), text);
    }
    const gf = refs.current.gf;
    if (gf) gf.dataset.state = g.escape >= TAKEOFF ? 'fire' : g.escape >= PREPARE ? 'prep' : 'rest';
  });
  const row = (key, label, tip, extra = '') => (
    <div className={`vital ${extra} tip`} data-tip={tip} ref={(el) => { refs.current[key] = el; }}>
      <span className="vital-label">{label}</span>
      <div className="vital-track"><i />{key === 'gf' && <><s /><u /></>}</div>
      <output className="vital-value">0.00</output>
    </div>
  );
  return (
    <section className="vitals swat-circuit">
      <span className="memory-title tip" tabIndex={0} data-tip="The pathway a real fly escapes with. How big the swatter head is in its eyes, and how fast that grows, drives the looming detectors LPLC2 and LC4; they converge on the giant fibre, DNp01. When DNp01 crosses the line, it jumps. Nothing else decides.">
        Escape circuit
      </span>
      {row('loom', 'Looming', 'Current into LPLC2 and LC4: the expansion of the swatter head across its eyes, plus a little for sheer size. A wary fly\'s pathway is turned up.')}
      {row('gf', 'Giant fibre', 'DNp01 firing above rest, read from the simulation. Past the thin mark it starts to prepare — it rises and leans away; at the thick mark it takes off. Prepared long enough and the takeoff is the stable long mode; caught short, the fast, tumbling short mode.', 'gf swat-gf')}
      {row('fear', 'Fear', 'PPL1, the punishment dopamine, above rest, with the loom on top. A frightened fly freezes instead of walking.')}
      {row('wary', 'Wariness', 'What its mushroom body has learned about this table: near misses and hits, through PPL1, weaken the approach side. The more it has learned, the harder its looming pathway is driven.')}
      {row('bac', 'Alcohol', `Body ethanol, as blood alcohol in per mille. It strengthens GABA synapses and weakens acetylcholine and glutamate ones all over the connectome — the looming pathway is mostly cholinergic, so a drunk fly's giant fibre fires later. It also sways, walks crooked and lands badly. At ${(SEDATION_MM / MM_PER_PERMILLE).toFixed(1)} ‰ it passes out.`, 'swat-bac')}
      {row('hunger', 'Craving', 'Rises slowly, falls while it drinks. A fly that craves beer lands near it, even with a swatter about — and drinks again, drunk or not.')}
    </section>
  );
}

/** The scoreboard. */
export function Scoreboard({ gameRef }) {
  const ref = useRef(null);
  useFrameLoop(gameRef, (g) => {
    const s = g.stats;
    const el = ref.current;
    if (!el) return;
    const set = (k, v) => setText(el.querySelector(`[data-k=${k}]`), v);
    set('swings', s.swings);
    set('rate', s.swings ? `${Math.round((100 * s.escapes) / s.swings)}%` : '—');
    set('near', s.near);
    set('best', ms(s.best));
    set('mean', ms(g.meanReaction));
    set('modes', `${s.long} / ${s.short}`);
    set('streak', s.bestStreak);
    set('feints', s.feints);
    set('sip', `${Math.round(s.sipped)} s`);
    set('peak', `${(g.peakBac / MM_PER_PERMILLE).toFixed(2)} ‰`);
  });
  const cell = (k, label, tip) => (
    <div className="ledger-cell tip" data-tip={tip} tabIndex={0}><b data-k={k}>0</b><span>{label}</span></div>
  );
  return (
    <section className="league">
      <span className="memory-title tip" tabIndex={0} data-tip="Everything since the page opened. Reload for a new hand and a sober, naive fly; ?seed=42 replays the same evening.">
        Fly vs. hand
      </span>
      <div className="ledger" ref={ref}>
        {cell('swings', 'swings', 'Times the swatter came down.')}
        {cell('rate', 'escaped', 'Share of swings it got away from.')}
        {cell('near', 'by a hair', 'Escapes with under 70 ms between takeoff and impact.')}
        {cell('best', 'fastest', 'Shortest time from the start of a swing to takeoff.')}
        {cell('mean', 'mean reaction', 'Swing start to takeoff, averaged. The fly does not react to the hand moving; it reacts when the head is close and growing fast — at a roughly constant time before contact.')}
        {cell('modes', 'long / short', 'Takeoffs in the long mode (prepared, stable) against the short mode (unprepared, fast, tumbling).')}
        {cell('streak', 'best streak', 'Escapes in a row.')}
        {cell('feints', 'feints', 'Twitches of the wrist that were not swings.')}
        {cell('sip', 'drinking', 'Time spent with its proboscis in the beer.')}
        {cell('peak', 'peak', 'The most it has had in its body at once.')}
      </div>
    </section>
  );
}

// --------------------------------------------------------------- cards

export function BlowSlip({ result }) {
  if (!result) return null;
  const words = {
    escape: ['Escaped', 'win'],
    near: ['By a hair', 'near'],
    whiff: ['Missed', 'open'],
    hit: ['Swatted', 'loss'],
  };
  const [verb, tone] = words[result.kind] ?? words.escape;
  return (
    <div className={`slip swatslip ${tone}`} key={result.at}>
      <div className="slip-stake">
        {result.margin !== null && result.kind !== 'hit'
          ? <>took off <b>{Math.round(result.margin)} ms</b> before impact · <i>{result.mode}-mode</i></>
          : result.kind === 'hit'
            ? <>{result.margin !== null ? <>took off only <b>{Math.round(result.margin)} ms</b> before — </> : <>never left the table — </>}<i>{Math.round(result.swing)} ms swing</i></>
            : <>the hand aimed where it expected it to jump</>}
      </div>
      <div className="stamp down">{verb}</div>
    </div>
  );
}

export function StunnedCard({ hits }) {
  return (
    <div className="slip broke swat-stunned">
      <div className="stamp down">Swatted</div>
      <p className="broke-body">
        The head came down before the giant fibre fired early enough. PPL1 fires flat out and its mushroom body
        learns the table. It lies dazed for a few seconds — this is a simulation, nothing is squashed — then gets up, warier.
      </p>
      {hits > 1 && <p className="broke-count">Swatted {hits} times.</p>}
    </div>
  );
}

export function OutCard({ permille }) {
  return (
    <div className="slip broke swat-out">
      <div className="stamp down">Passed out</div>
      <p className="broke-body">
        {permille.toFixed(2)} ‰. Enough ethanol to tip GABA over everything else: it loses its footing and lies in the beer.
        Its giant fibre will not fire now — nothing will, until the level falls. The hand has noticed.
      </p>
    </div>
  );
}

export function SwatToast({ text }) {
  if (!text) return null;
  return <div className="news-toast swat-toast" key={text.at}>{text.text}</div>;
}

// --------------------------------------------------------- how it works

export function SwatHowItWorks({ open, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || e.target.closest?.('.pill.info')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="howto" id="howto" role="dialog" aria-label="How the swatter works" ref={ref}>
      <button type="button" className="howto-close" onClick={() => { onClose(); refocusHowButton(); }} aria-label="Close">×</button>
      <h2>How the swatter works</h2>
      <dl>
        <dt>Nobody plays</dt>
        <dd>
          The hand is a small script with a temper: it waits, closes in, hovers, sometimes feints, and swings.
          The fly is its connectome. You watch.
        </dd>
        <dt>A swatter is a loom</dt>
        <dd>
          Every frame the page works out how big the swatter head is in the fly&apos;s eyes and how fast that grows.
          That expansion drives the looming detectors LPLC2 and LC4, which in MaleCNS converge on the giant fibre,
          DNp01 — the command neuron for escape. When its simulated rate crosses the line, the fly jumps. Nothing
          else makes it leave.
        </dd>
        <dt>Always at the last moment</dt>
        <dd>
          A looming detector answers to how fast an object grows, not where it is, so the giant fibre fires at a roughly
          constant time before contact — a few tens of milliseconds here, whatever the speed of the swing. Real flies do the
          same, which is why they seem to leave just in time, and why the ones that don&apos;t, don&apos;t by little.
        </dd>
        <dt>Long mode, short mode</dt>
        <dd>
          Given a moment of rising looming, it prepares: it raises its body and leans away, and takes off stable, away from
          the threat. Caught by a fast swing, the giant fibre fires before the posture is ready — a quicker, tumbling,
          badly aimed jump. Both are real (von Reyn et al. 2014).
        </dd>
        <dt>The beer</dt>
        <dd>
          It drinks spilled beer through its proboscis, and the ethanol goes where it goes at the bar: GABA synapses land
          harder, acetylcholine and glutamate ones softer, across the whole connectome. Most of the looming pathway is
          cholinergic, so nobody has to tell a drunk fly to react late — its giant fibre simply gets there later. It sways,
          walks crooked, lands badly, and at about 1.6 ‰ it passes out.
        </dd>
        <dt>Both sides learn</dt>
        <dd>
          Near misses and hits reach its mushroom body through PPL1, and the table becomes a place to fear: its looming
          pathway is driven harder the more it has learned. The hand learns too: every miss makes it faster and it starts
          aiming ahead, where flies jump.
        </dd>
      </dl>
      <p className="note">
        Wiring, cell types and transmitters are measured (<b>MaleCNS v1.0</b>); LPLC2, LC4 and DNp01 are found in it by name.
        The table, the beer, the hand, the swatter&apos;s size — shrunk far below the forty fly-lengths a real one spans — and the mapping from
        picture to retina are the model&apos;s.
      </p>
      <p className="howto-links">
        <a href="/about.html">Read the full write-up</a> · <a href="/legal.html">Legal &amp; privacy</a>
      </p>
    </div>
  );
}
