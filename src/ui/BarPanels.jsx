/**
 * The bar's readouts: the clock and what is in the fly's body (top right),
 * what it is leaning towards and why, the drugs and their after-effects in
 * the side panel, and the tab.
 *
 * Like the casino's, everything that moves continuously is read off the Bar
 * on an animation frame rather than pushed through React state.
 */
import { useEffect, useRef } from 'react';
import { refocusHowButton } from './HowItWorks.jsx';
import { Bar, PHASES, MM_PER_PERMILLE, SEDATION_PERMILLE, POUCH_MG, urgeReason } from '../game/bar.js';

function useFrameLoop(machineRef, fn) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const m = machineRef.current;
      if (m) fnRef.current(m);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [machineRef]);
}

const setText = (el, v) => { if (el && el.textContent !== String(v)) el.textContent = v; };

// ------------------------------------------------------------ top right

const PULLS = [
  { key: 'chase', label: 'NPF', tip: 'Low neuropeptide F. Deprived flies drink more ethanol (Shohat-Ophir et al. 2012), so a low level pushes it back to the glass.' },
  { key: 'buzz', label: 'buzz', tip: 'The stimulating edge of a rising ethanol level, and the PAM cluster still firing from it. Ethanol is rewarding to a fly. Tolerance blunts it.' },
  { key: 'memory', label: 'memory', tip: 'What its mushroom body has learned about this bar: the reward of the evenings against the punishment of the mornings.' },
  { key: 'relief', label: 'relief', tip: 'A drink makes the hangover go away for a while — so a hungover fly low on NPF drinks again.' },
  { key: 'craving', label: 'craving', tip: 'Nicotine dependence, felt as the level falls. It builds with every milligram and fades over days.' },
  { key: 'caution', label: 'caution', tip: 'The defensive state, the hangover and nicotine nausea — all of it scaled down by how drunk it is. Disinhibition.' },
];

/**
 * What it is leaning towards: a bout of sips (pips), a pouch (its strength),
 * or nothing yet. While it acts, the pips lock to what it committed to.
 */
function Decision({ machineRef }) {
  const pipsRef = useRef([]);
  const numRef = useRef(null);
  const verbRef = useRef(null);
  const whyRef = useRef(null);
  const barsRef = useRef({});
  const rootRef = useRef(null);

  useFrameLoop(machineRef, (m) => {
    const a = m.appetite;
    let state = 'leaning', verb = 'leaning', shown = 0, num = '', why = '';
    if (m.down) {
      state = 'broke';
      verb = m.phase === PHASES.SEIZURE ? 'knocked out' : 'asleep';
      num = '—';
      why = m.phase === PHASES.SEIZURE ? 'nicotine poisoning' : m.phase === PHASES.PASSED_OUT ? 'passed out' : 'sleeping it off';
    } else if (m.plan) {
      state = 'committed';
      if (m.plan.kind === 'beer') { verb = 'drinking'; shown = m.plan.sips; num = `${m.plan.sips} sips`; }
      else { verb = 'pouch'; shown = POUCH_MG.indexOf(m.plan.mg) + 2; num = `${m.plan.mg} mg`; }
      why = m.plan.why;
    } else if (a.pouch > a.beer && a.pouch > 0.24) {
      verb = 'eyeing the tin';
      const want = Math.min(3, Math.round(Math.min(1, a.pouch * 1.1 + (1 - a.disinhibit) * 0.55) * 3.2));
      shown = want + 2; num = `${POUCH_MG[want]} mg`;
      why = urgeReason(a, 'pouch');
    } else if (a.beer > 0.24) {
      shown = Bar.sipsFor(a.beer); num = `${shown} sips`;
      why = urgeReason(a, 'beer');
    } else {
      verb = 'holding off'; num = '0';
      why = urgeReason(a, 'rest');
    }
    pipsRef.current.forEach((el, i) => { if (el) el.className = i < shown ? 'on' : ''; });
    setText(numRef.current, num);
    setText(verbRef.current, verb);
    setText(whyRef.current, why);
    if (rootRef.current) rootRef.current.dataset.state = state;
    for (const p of PULLS) {
      const el = barsRef.current[p.key];
      if (!el) continue;
      el.style.setProperty('--v', String(Math.min(1, Math.abs(a[p.key]) / 0.5)));
      el.dataset.sign = a[p.key] < 0 ? 'neg' : 'pos';
    }
  });

  return (
    <div
      className="stake tip"
      ref={rootRef}
      data-tip="The fly decides everything itself: whether to drink, how many sips (1 to 5), whether to take a pouch and how strong (3 to 16 mg), and when to stop. The pulls underneath are what it is weighing right now."
    >
      <div className="stake-head">
        <span className="stake-verb" ref={verbRef}>leaning</span>
        <span className="stake-pips" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => <i key={i} ref={(el) => { pipsRef.current[i] = el; }} />)}
        </span>
        <b ref={numRef}>—</b>
      </div>
      <p className="stake-why" ref={whyRef} />
      <div className="stake-pulls bar-pulls">
        {PULLS.map((p) => (
          <span key={p.key} className={`pull pull-${p.key} tip`} data-tip={p.tip} ref={(el) => { barsRef.current[p.key] = el; }}>
            <i />{p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The last dozen things it did, as tally marks. */
const RUNLOG_SLOTS = 12;
function BarRunLog({ history }) {
  const empty = Math.max(0, RUNLOG_SLOTS - history.length);
  const cls = (h) => (h.kind === 'beer' ? `b s${Math.min(5, h.size)}` : h.kind === 'pouch' ? 'p'
    : h.kind === 'seizure' ? 'x' : h.kind === 'passout' ? 'd' : 'z');
  return (
    <div className="history">
      <span className="history-label">Tonight:</span>
      <div className="runlog barlog tip" data-tip="The last dozen things it did. Amber: a bout of beer, taller for more sips. White: a pouch. Dark: passed out. Grey: slept. Red: nicotine poisoning.">
        {history.map((h, i) => <i key={`${h.at}-${h.kind}-${i}`} className={cls(h)} />)}
        {Array.from({ length: empty }, (_, i) => <i key={`e${i}`} className="empty" />)}
      </div>
    </div>
  );
}

export function BarBank({ machineRef, ui }) {
  const clockRef = useRef(null);
  const dayRef = useRef(null);
  const bacRef = useRef(null);
  const nicRef = useRef(null);
  useFrameLoop(machineRef, (m) => {
    setText(clockRef.current, m.clock);
    setText(dayRef.current, `night ${m.nights}`);
    setText(bacRef.current, m.meterPermille.toFixed(2));
    setText(nicRef.current, m.nicotine.toFixed(0));
    if (bacRef.current) bacRef.current.dataset.level = m.sedation > 0.3 ? 'high' : m.sway > 0.3 ? 'mid' : 'low';
  });
  return (
    <aside className="bank barbank">
      <div className="bar-clock tip" data-tip="The bar's clock. The evening runs slowly enough to watch; asleep, the hours fly by.">
        <b ref={clockRef}>19:00</b><span ref={dayRef}>night 1</span>
      </div>
      <div className="bar-levels">
        <div className="bar-level tip" data-tip={`Alcohol level in Promille (‰). After a blackout this holds the level that caused it until the fly wakes, while the body rail shows the level clearing. A fly with no tolerance can pass out around ${SEDATION_PERMILLE.toFixed(1)} ‰; tolerance pushes that up. Internally, the model uses mM of body ethanol: 1 ‰ is about ${MM_PER_PERMILLE} mM.`}>
          <b ref={bacRef} data-level="low">0.00</b><span>‰ alcohol</span>
        </div>
        <div className="bar-level tip" data-tip="Nicotine in hemolymph, ng/mL, on a human scale so pouch strengths read as they do on the tin. Past 26 it gets the jitters; past 38 it seizes. Nicotine is an insecticide.">
          <b ref={nicRef}>0</b><span>ng/mL nicotine</span>
        </div>
      </div>
      <Decision machineRef={machineRef} />
      <BarRunLog history={ui.history} />
      {(ui.passouts > 0 || ui.seizures > 0) && (
        <div className="bank-tags">
          {ui.passouts > 0 && <div className="tag dry">passed out ×{ui.passouts}</div>}
          {ui.seizures > 0 && <div className="tag dry">seizures ×{ui.seizures}</div>}
        </div>
      )}
    </aside>
  );
}

// ----------------------------------------------------------- side panel

const BODY_EXPLAIN = {
  ethanol: 'Body ethanol against the level that sedates this fly. On the brain: GABA synapses are strengthened (GABA-A/Rdl potentiation) and acetylcholine and glutamate synapses weakened, across every simulated cell type that uses them.',
  nicotine: 'Nicotine against the seizure threshold. On the brain: every cholinergic synapse is strengthened — 911 of the 1,600 simulated cell types use acetylcholine.',
  hangover: 'What the night left behind, felt as the ethanol clears. It drains NPF, drives the punishment cluster PPL1 and weakens GABA below normal — the rebound. Drinking again masks it.',
  tolerance: 'Rapid tolerance: a drunk fly clears ethanol faster and needs more to fall over the next night. In Drosophila it needs a gene called hangover (Scholz et al. 2005).',
  dependence: 'Nicotine dependence. It grows with every milligram absorbed and fades over days; what it produces is craving once the level falls.',
};

export function BarBody({ machineRef, store, ready }) {
  const rowsRef = useRef({});
  const synRef = useRef(null);
  useFrameLoop(machineRef, (m) => {
    const set = (key, value, text) => {
      const el = rowsRef.current[key];
      if (!el) return;
      el.style.setProperty('--v', String(Math.max(0, Math.min(1, value))));
      setText(el.querySelector('output'), text);
    };
    set('ethanol', m.bac / m.sedationAt, `${m.permille.toFixed(2)} ‰`);
    set('nicotine', m.nicotine / 38, `${m.nicotine.toFixed(0)}`);
    set('hangover', m.hangover, m.hangover < 0.02 ? 'none' : m.hangover.toFixed(2));
    set('tolerance', m.tolerance, m.tolerance.toFixed(2));
    set('dependence', m.dependence, m.dependence.toFixed(2));
    const d = ready ? store.current.brain?.drugs : null;
    if (d && synRef.current) {
      const f = (x) => `${x >= 1 ? '+' : '−'}${Math.abs(Math.round((x - 1) * 100))}%`;
      setText(synRef.current, `ACh ${f(d.ach)} · GABA ${f(d.gaba)} · Glu ${f(d.glu)}`);
    }
  });
  const row = (key, label) => (
    <div className={`vital vital-${key}`} key={key} ref={(el) => { rowsRef.current[key] = el; }}>
      <span className="vital-label tip" data-tip={BODY_EXPLAIN[key]} tabIndex={0}>{label}</span>
      <div className="vital-track"><i /></div>
      <output className="vital-value">—</output>
    </div>
  );
  return (
    <section className="vitals barbody">
      <span className="memory-title">In its body</span>
      {row('ethanol', 'Alcohol')}
      {row('nicotine', 'Nicotine')}
      {row('hangover', 'Hangover')}
      {row('tolerance', 'Tolerance')}
      {row('dependence', 'Dependence')}
      <p
        className="synapses tip"
        data-tip="How strongly synapses of each transmitter land right now, relative to the measured wiring — the drugs, acting on the connectome."
      >
        <span>synapses</span> <b ref={synRef}>ACh +0% · GABA +0% · Glu +0%</b>
      </p>
    </section>
  );
}

export function BarTab({ machineRef }) {
  const refs = useRef({});
  useFrameLoop(machineRef, (m) => {
    const vals = {
      beers: m.beers + (m.fill < 0.999 && m.refilling === 0 ? ` +${Math.round((1 - m.fill) * 100)}%` : ''),
      sips: m.sips,
      pouches: m.pouchCount,
      mg: m.nicotineMg,
      peak: `${(m.allTimePeak / MM_PER_PERMILLE).toFixed(2)} ‰`,
      out: m.passouts,
      fits: m.seizures,
      nights: m.nights,
    };
    for (const [k, v] of Object.entries(vals)) setText(refs.current[k], v);
  });
  const cell = (key, label, tip) => (
    <div className="ledger-cell tip" data-tip={tip} tabIndex={0}>
      <b ref={(el) => { refs.current[key] = el; }}>0</b>
      <span>{label}</span>
    </div>
  );
  return (
    <section className="ledger">
      {cell('beers', 'glasses', 'Glasses finished, and how far into the current one it is. Finished glasses stay on the counter.')}
      {cell('sips', 'sips', 'Each drink is taken from the lifted glass.')}
      {cell('pouches', 'pouches', 'Nicotine pouches taken. Spent ones pile up on the napkin.')}
      {cell('mg', 'mg nicotine', 'Total nicotine in all the pouches it has taken.')}
      {cell('peak', 'peak', 'The highest alcohol level it has reached, in Promille (‰).')}
      {cell('out', 'passed out', 'Nights that ended with it falling over rather than going to sleep.')}
      {cell('fits', 'seizures', 'Times it poisoned itself with nicotine.')}
      {cell('nights', 'nights', 'Nights at the bar so far.')}
    </section>
  );
}

// --------------------------------------------------------------- cards

/** The slip after each action: what it took. */
export function ActionSlip({ result }) {
  if (!result || (result.kind !== 'beer' && result.kind !== 'pouch')) return null;
  const beer = result.kind === 'beer';
  return (
    <div className={`slip barslip ${beer ? 'beer' : 'pouch'}`} key={result.at}>
      <div className="slip-stake">
        {beer ? <><b>{result.sips}</b> {result.sips === 1 ? 'sip' : 'sips'}</> : <><b>{result.mg} mg</b> pouch</>}
        {' · '}<i>{result.why}</i>
      </div>
      <div className="stamp down">{beer ? (result.sips >= 5 ? 'Chug' : 'Prost') : 'Under the lip'}</div>
    </div>
  );
}

const DOWN_COPY = {
  'passed-out': {
    head: 'Passed out',
    body: 'Past its sedation threshold. A drunk fly loses its footing and falls over — that is how scientists measure how drunk a fly is. It will sleep it off.',
  },
  asleep: {
    head: 'Asleep',
    body: 'Late, tired, and still at the bar. It sleeps on the stool while the ethanol clears — and what the night leaves behind builds up.',
  },
  seizure: {
    head: 'Nicotine poisoning',
    body: 'Every cholinergic synapse turned up at once: the network saturates. Nicotine is an insecticide, and this is why. It spits the pouch and lies there until the level falls.',
  },
};

export function DownCard({ phase, clock }) {
  const copy = DOWN_COPY[phase];
  if (!copy) return null;
  return (
    <div className={`slip broke bar-down ${phase}`}>
      <div className="stamp down">{copy.head}</div>
      <p className="broke-body">{copy.body}</p>
      {phase !== 'seizure' && <p className="bar-zzz" aria-hidden="true"><span>z</span><span>z</span><span>z</span> <em>{clock}</em></p>}
    </div>
  );
}

export function WakeCard({ hangover }) {
  const bad = hangover > 0.35;
  return (
    <div className="slip revive">
      <div className="stamp down">{bad ? 'The morning after' : 'Morning'}</div>
      <p className="broke-body">
        {bad
          ? `Hangover ${Math.round(hangover * 100)}%. PPL1 is firing while its mushroom body still codes the bar — it is learning this, too. Whether it drinks again is up to it.`
          : 'It slept it off. Its tolerance is a little higher than last night.'}
      </p>
    </div>
  );
}

// --------------------------------------------------------- how it works

export function BarHowItWorks({ open, onClose }) {
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
    <div className="howto" id="howto" role="dialog" aria-label="How the bar works" ref={ref}>
      <button type="button" className="howto-close" onClick={() => { onClose(); refocusHowButton(); }} aria-label="Close">×</button>
      <h2>How the bar works</h2>
      <dl>
        <dt>The fly</dt>
        <dd>
          The same micro-CT scan as in the casino, on the same stool. It drinks the way flies do, by
          lifting a glass to its mouth and takes nicotine pouches from the tin with its
          rigged right foreleg.
        </dd>
        <dt>Its decisions</dt>
        <dd>
          Nobody tells it anything. Whether to drink, how many sips, whether to take a pouch and how strong,
          when to stop: all of it falls out of its state — NPF, dopamine, what its mushroom body has learned,
          the hangover, craving — and disinhibition, which makes the fourth drink easier than the first.
        </dd>
        <dt>Ethanol</dt>
        <dd>
          Absorbed from the crop, cleared at a fixed rate. On the brain it strengthens every GABA synapse and
          weakens acetylcholine and glutamate ones. Rising, it drives the reward cluster: flies find ethanol
          rewarding. The first sips are aversive; that fades. Enough, and it passes out.
        </dd>
        <dt>Nicotine</dt>
        <dd>
          Released from the pouch over minutes. It strengthens every cholinergic synapse — most fast excitation
          in an insect brain — and lifts dopamine. Too much at once saturates the network: a seizure.
        </dd>
        <dt>The morning</dt>
        <dd>
          What the night leaves behind is felt as the ethanol clears: NPF drains, the punishment cluster fires,
          inhibition rebounds below normal. The mushroom body learns that too. Drinking masks it — and it knows.
        </dd>
      </dl>
      <p className="note">
        Wiring and transmitters are real (<b>MaleCNS v1.0</b>). The drug mechanisms — which receptor, which
        transmitter, which direction — are the literature&apos;s; the magnitudes and the human-scale units are
        the model&apos;s, set to be legible rather than fitted. No fly was served a beer.
      </p>
      <p className="howto-links">
        <a href="/about.html">Read the full write-up</a> · <a href="/legal.html">Legal &amp; privacy</a>
      </p>
    </div>
  );
}
