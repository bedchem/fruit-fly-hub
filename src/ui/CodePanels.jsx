/**
 * The coder's readouts: what it is working on, the clock of the night,
 * caffeine against the sleep drive and what it wants next (top right); the
 * night's chart and the dorsal fan-shaped body, the giant fibre and the
 * night's ledger (side panel); and the cards for green builds, red ones,
 * deploys, falling asleep and the morning.
 *
 * Everything that moves continuously is read off the Coder on an animation
 * frame, like the other experiments' panels.
 */
import { useEffect, useRef } from 'react';
import { refocusHowButton } from './HowItWorks.jsx';
import { PHASES, JITTER_MG, TOO_MUCH_MG, NOD_AT, MUG_MG } from '../game/coder.js';
import POKYH from '../game/pokyhCode.js';

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
/** The caffeine scale the meters run to, mg. */
const MG_SCALE = 300;
const DEEP_AT = 0.86;

// ----------------------------------------------------------- top right

const PULLS = [
  { key: 'tired', label: 'dFB', tip: 'The sleep drive, read from the dorsal fan-shaped body: the longer it is awake, the harder it pulls towards the mug.' },
  { key: 'crash', label: 'crash', tip: 'Coming down from a big dose: the level well below where it just was.' },
  { key: 'memory', label: 'memory', tip: 'What its mushroom body has learned about coffee at this desk: caffeine arriving through PAM, the bitter sips through PPL1.' },
  { key: 'bitter', label: 'bitter', tip: 'Caffeine is bitter, and flies avoid it (Lee et al. 2009). The pull away fades as the taste becomes familiar.' },
  { key: 'jitter', label: 'jitters', tip: 'Too much already: past the jitter mark it stops wanting more.' },
];

function Wants({ coderRef }) {
  const verbRef = useRef(null);
  const numRef = useRef(null);
  const whyRef = useRef(null);
  const rootRef = useRef(null);
  const barsRef = useRef({});
  useFrameLoop(coderRef, (c) => {
    const a = c.appetite;
    let verb = 'wants', target, state = 'leaning';
    if (c.phase === PHASES.ASLEEP) { state = 'broke'; verb = 'is'; target = 'asleep'; }
    else if (c.phase === PHASES.MORNING) { state = 'broke'; verb = 'sees'; target = 'the sun'; }
    else if (c.phase === PHASES.SIPPING) { state = 'committed'; verb = 'drinking'; target = 'coffee'; }
    else if (c.phase === PHASES.NODDING) { state = 'broke'; verb = 'nodding'; target = 'off'; }
    else if (c.phase === PHASES.RUNNING) { state = 'committed'; verb = 'waiting on'; target = 'the terminal'; }
    else if (c.phase === PHASES.TYPING || c.phase === PHASES.POINTING) { state = 'committed'; verb = 'coding'; target = a.coffee > a.work ? 'for now' : 'on'; }
    else target = a.coffee > a.work ? 'coffee' : 'to code';
    setText(verbRef.current, verb);
    setText(numRef.current, target);
    setText(whyRef.current, c.why);
    if (rootRef.current) rootRef.current.dataset.state = state;
    for (const p of PULLS) {
      const el = barsRef.current[p.key];
      if (!el) continue;
      const v = a[p.key] ?? 0;
      el.style.setProperty('--v', String(Math.min(1, Math.abs(v) / 0.8)));
      el.dataset.sign = v < 0 ? 'neg' : 'pos';
    }
  });
  return (
    <div className="stake tip" ref={rootRef} data-tip="Nobody tells it to drink. Whether it reaches for the mug or keeps typing comes from its state: the sleep drive from its dFB, the crash, the bitter taste, what its mushroom body has learned, and the jitters.">
      <div className="stake-head">
        <span className="stake-verb" ref={verbRef}>wants</span>
        <b ref={numRef}>to code</b>
      </div>
      <p className="stake-why" ref={whyRef} />
      <div className="stake-pulls">
        {PULLS.map((p) => (
          <span key={p.key} className={`pull pull-${p.key} tip`} data-tip={p.tip} ref={(el) => { barsRef.current[p.key] = el; }}>
            <i />{p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const LOG_SLOTS = 14;
function NightLog({ history }) {
  const empty = Math.max(0, LOG_SLOTS - history.length);
  return (
    <div className="history">
      <span className="history-label">Tonight:</span>
      <div className="runlog codelog tip" data-tip="The night so far. Orange: a commit. Green: a deploy to pokyh.com. Red: an error, outlined if CI caught it. Brown: a coffee. Grey: a nod. Dark: asleep.">
        {history.map((h, i) => <i key={`${h.at}-${i}`} className={h.kind} />)}
        {Array.from({ length: empty }, (_, i) => <i key={`e${i}`} className="empty" />)}
      </div>
    </div>
  );
}

export function CodeHud({ coderRef, ui }) {
  const fileRef = useRef(null);
  const branchRef = useRef(null);
  const clockRef = useRef(null);
  const lineRef = useRef(null);
  const cafRef = useRef(null);
  const cafValRef = useRef(null);
  const sleepRef = useRef(null);
  const sleepValRef = useRef(null);
  useFrameLoop(coderRef, (c) => {
    const f = POKYH.files[c.editor.file];
    setText(fileRef.current, f ? f.path.split('/').pop() : '—');
    setText(branchRef.current, c.task?.branch ?? 'main');
    setText(clockRef.current, `${c.clock}${c.night > 1 ? ` · night ${c.night}` : ''}`);
    setText(lineRef.current, `${c.commits} commits · ${c.deploys} deployed · ${c.tests.passed}/${c.tests.total} tests${c.problems ? ` · ${c.problems} problem${c.problems > 1 ? 's' : ''}` : ''}`);
    if (cafRef.current) cafRef.current.style.setProperty('--v', String(Math.min(1, c.caffeine / MG_SCALE)));
    setText(cafValRef.current, `${Math.round(c.caffeine)} mg`);
    if (sleepRef.current) sleepRef.current.style.setProperty('--v', c.sleepiness.toFixed(3));
    setText(sleepValRef.current, c.sleepiness.toFixed(2));
  });
  return (
    <aside className="bank codebank">
      <div className="code-now tip" data-tip="The file it has open in POKYH's frontend — real code from github.com/bedchem/pokyh-frontend — and the branch it is on.">
        <b ref={fileRef}>—</b>
        <span ref={branchRef} />
      </div>
      <p className="code-clock tip" data-tip="The clock of the night. It starts at half past ten; the sky in the window follows it to sunrise." ref={clockRef}>22:30</p>
      <p className="code-line" ref={lineRef} />
      <div className="meter caf tip" data-tip={`Caffeine in the body, in mg on a human scale: a mug is ${MUG_MG} mg. It is absorbed from the crop and cleared with a half-life. Past the first mark: jitters. Past the second: too much.`}>
        <span className="meter-label">Caffeine</span>
        <div className="meter-track" ref={cafRef}><i /><s style={{ left: `${(JITTER_MG / MG_SCALE) * 100}%` }} /><s style={{ left: `${(TOO_MUCH_MG / MG_SCALE) * 100}%` }} /></div>
        <output ref={cafValRef}>0 mg</output>
      </div>
      <div className="meter sleep tip" data-tip="The sleep drive, read off the sleep-promoting neurons of the dorsal fan-shaped body (the FB6 types). Past the first mark its head starts to drop; past the second, a nod becomes sleep.">
        <span className="meter-label">Sleep</span>
        <div className="meter-track" ref={sleepRef}><i /><s style={{ left: `${NOD_AT * 100}%` }} /><s style={{ left: `${DEEP_AT * 100}%` }} /></div>
        <output ref={sleepValRef}>0.00</output>
      </div>
      <Wants coderRef={coderRef} />
      <NightLog history={ui.history} />
    </aside>
  );
}

// ------------------------------------------------------------ side panel

/**
 * The night on one chart: caffeine in the body against the sleep drive, a
 * sample every few minutes, the stretches it slept shaded. Below it, the
 * dFB types the brain drives with sleep pressure, and the giant fibre that
 * jerks it awake when its head drops.
 */
export function CaffeineVsSleep({ coderRef, store, ready }) {
  const canvasRef = useRef(null);
  const rowsRef = useRef({});
  const gfRef = useRef(null);
  const gfValRef = useRef(null);
  const clock = useRef(0);
  useFrameLoop(coderRef, (c) => {
    if (gfRef.current) gfRef.current.style.setProperty('--v', String(Math.min(1, c.escape / 1.5)));
    setText(gfValRef.current, c.escape.toFixed(2));
    const brain = ready ? store.current.brain : null;
    if (brain) {
      const rate = brain.sim.rate;
      brain.dfbShown.forEach((t, k) => {
        const el = rowsRef.current[k];
        if (el) el.style.setProperty('--v', String(Math.max(0, Math.min(1, (rate[t.index] - brain.rest[t.index]) * 5))));
      });
    }
    const now = performance.now();
    const cv = canvasRef.current;
    if (!cv || now - clock.current < 250) return;
    clock.current = now;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const span = 8 * 60 + 45;               // 22:30 to 07:15
    const x = (m) => (m / span) * W;
    const series = c.series;
    // asleep, shaded
    ctx.fillStyle = 'rgba(43,36,28,0.08)';
    for (let i = 1; i < series.length; i++) if (series[i].asleep) ctx.fillRect(x(series[i - 1].m), 0, x(series[i].m) - x(series[i - 1].m) + 1, H);
    // marks: the jitters, and nodding off
    ctx.strokeStyle = 'rgba(43,36,28,0.18)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H - (JITTER_MG / MG_SCALE) * H); ctx.lineTo(W, H - (JITTER_MG / MG_SCALE) * H); ctx.stroke();
    ctx.setLineDash([]);
    const line = (key, scale, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
      ctx.beginPath();
      series.forEach((s, i) => { const y = H - Math.min(1, s[key] / scale) * (H - 4) - 2; if (i) ctx.lineTo(x(s.m), y); else ctx.moveTo(x(s.m), y); });
      ctx.stroke();
    };
    line('caffeine', MG_SCALE, '#a0612a');
    line('sleep', 1, '#5b6ea8');
    // hours along the bottom
    ctx.fillStyle = 'rgba(43,36,28,0.45)'; ctx.font = '500 18px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    [['23', 30], ['01', 150], ['03', 270], ['05', 390], ['07', 510]].forEach(([h, m]) => ctx.fillText(h, x(m), H - 6));
  });
  const brain = ready ? store.current.brain : null;
  return (
    <section className="vision cafsleep">
      <div className="memory-head">
        <span className="memory-title tip" tabIndex={0} data-tip="Caffeine keeps a fly awake through dopamine: it acts on the PAM neurons (Nall et al. 2016). Sleep is promoted by the dorsal fan-shaped body, which grows more excitable the longer a fly is awake (Donlea et al. 2011, 2014). Here the hours awake drive the FB6 types, caffeine cuts that drive, and the chart is the night so far.">
          Caffeine vs sleep
        </span>
      </div>
      <canvas ref={canvasRef} className="cafsleep-chart" width="720" height="220" />
      <div className="cafsleep-legend" aria-hidden="true"><span className="c">caffeine</span><span className="s">sleep drive (dFB)</span></div>
      {brain && (
        <div className="dfb-cols">
          {brain.dfbShown.map((t, k) => (
            <div className="vision-cell dfb" key={t.name} ref={(el) => { rowsRef.current[k] = el; }}>
              <i /><em>{t.name}</em>
            </div>
          ))}
        </div>
      )}
      <div className="vital gf tip" ref={gfRef} data-tip="DNp01, the giant fibre. When its head drops towards the keys, that is a loom on LPLC2 and LC4; if the giant fibre fires, it jerks awake. If it does not, it falls asleep on the keyboard.">
        <span className="vital-label">Giant fibre</span>
        <div className="vital-track"><i /><s /></div>
        <output className="vital-value" ref={gfValRef}>0.00</output>
      </div>
    </section>
  );
}

/** The night in numbers. */
export function NightLedger({ coderRef }) {
  const ref = useRef(null);
  useFrameLoop(coderRef, (c) => {
    const s = ref.current;
    if (!s) return;
    const set = (k, v) => setText(s.querySelector(`[data-k=${k}]`), v);
    set('lines', c.lines);
    set('commits', c.commits);
    set('deploys', c.deploys);
    set('errors', c.errors);
    set('mugs', `${(c.sips / 12).toFixed(1)}`);
    set('mg', Math.round(c.caffeineMg));
    set('nods', c.nods);
    set('slept', `${Math.round(c.sleptMin)}m`);
    set('tol', `${Math.round(c.tolerance * 100)}%`);
  });
  const cell = (k, label, tip) => (
    <div className="ledger-cell tip" data-tip={tip} tabIndex={0}><b data-k={k}>0</b><span>{label}</span></div>
  );
  return (
    <section className="league">
      <span className="memory-title tip" tabIndex={0} data-tip="Every night it works until the sun comes up — or until it falls asleep on the keyboard.">
        The night so far
      </span>
      <div className="ledger league-stats" ref={ref}>
        {cell('lines', 'lines typed', 'Real POKYH code, one character at a time, with the right foreleg.')}
        {cell('commits', 'commits', 'Each finished chunk of a task is committed and pushed.')}
        {cell('deploys', 'deploys', 'Green CI on main ships to pokyh.com. The jackpot: a burst through PAM.')}
        {cell('errors', 'errors', 'Type errors, red builds, merge conflicts, CI failures: each one a pulse into PPL1.')}
        {cell('mugs', 'mugs', 'Twelve sips a mug.')}
        {cell('mg', 'mg caffeine', 'All the caffeine it has drunk tonight.')}
        {cell('nods', 'nods', 'Times its head dropped towards the keys.')}
        {cell('slept', 'slept', 'Game minutes asleep at the desk.')}
        {cell('tol', 'tolerance', 'Caffeine tolerance: the same mug does a little less each night.')}
      </div>
    </section>
  );
}

// --------------------------------------------------------------- cards

const CARD = {
  deploy: { tone: 'win', stamp: 'Deployed', line: (r) => `pokyh.com · ${r.branch ?? 'main'}` },
  commit: { tone: 'open', stamp: 'Committed', line: (r) => `git commit ${r.hash ?? ''}`.trim() },
  buildOk: { tone: 'win', stamp: 'Build ok', line: () => 'next build · 0 errors' },
  buildFail: { tone: 'loss', stamp: 'Build failed', line: (r) => r.msg ?? 'next build' },
  typeError: { tone: 'loss', stamp: 'Type error', line: (r) => r.msg ?? 'tsc' },
  ciFail: { tone: 'loss', stamp: 'CI red', line: (r) => r.reason ?? r.step ?? 'GitHub Actions' },
  conflict: { tone: 'loss', stamp: 'Conflict', line: (r) => `git pull — ${r.file ?? 'merge conflict'}` },
  rejected: { tone: 'loss', stamp: 'Rejected', line: () => 'git push — pull first' },
  jerk: { tone: 'loss', stamp: 'Jerked awake', line: () => 'the giant fibre caught it' },
};

export function CodeSlip({ result }) {
  const card = result && CARD[result.kind];
  if (!card) return null;
  return (
    <div className={`slip codeslip ${card.tone}`} key={result.at}>
      <div className="slip-stake"><i>{card.line(result)}</i> · {result.clock}</div>
      <div className="stamp down">{card.stamp}</div>
    </div>
  );
}

export function AsleepCard({ clock }) {
  return (
    <div className="slip broke">
      <div className="stamp down">Asleep</div>
      <p className="broke-body">
        {clock}. The dorsal fan-shaped body won: the head dropped to the keys and the giant fibre did not fire in time.
        It sleeps on the keyboard now, and the editor fills with whatever its tarsus is resting on.
      </p>
    </div>
  );
}

export function MorningCard({ morning }) {
  if (!morning) return null;
  return (
    <div className="slip revive morning">
      <div className="stamp down">Sunrise</div>
      <p className="broke-body">
        Night {morning.night}: {morning.lines} lines, {morning.commits} commits, {morning.deploys} deployed to pokyh.com,{' '}
        {morning.errors} errors, {Math.round(morning.mg)} mg of caffeine{morning.slept ? `, ${Math.round(morning.slept)} minutes asleep at the desk` : ''}.
        {morning.wasAsleep ? ' It slept through the sunrise.' : ' It saw the sun come up.'} Now it sleeps the day away — and tonight it starts again.
      </p>
    </div>
  );
}

// --------------------------------------------------------- how it works

export function CodeHowItWorks({ open, onClose }) {
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
    <div className="howto" id="howto" role="dialog" aria-label="How the coder's night works" ref={ref}>
      <button type="button" className="howto-close" onClick={() => { onClose(); refocusHowButton(); }} aria-label="Close">×</button>
      <h2>How the coder&apos;s night works</h2>
      <dl>
        <dt>It writes real code</dt>
        <dd>
          The fly works on POKYH, its team&apos;s WebUntis frontend. What it types is real code from the public
          pokyh-frontend repository, a character at a time, with its right foreleg on a MacBook&apos;s keys. It saves,
          builds, commits, pushes and waits on CI; green on main ships to pokyh.com.
        </dd>
        <dt>Sleep builds in the dFB</dt>
        <dd>
          The longer a fly is awake, the more excitable the sleep-promoting neurons of the dorsal fan-shaped body
          become (Donlea et al. 2011, 2014). Here the hours awake and the small hours drive the FB6 types, and what they
          answer is the sleep drive it nods off on.
        </dd>
        <dt>Coffee is caffeine</dt>
        <dd>
          Caffeine cuts that drive, the way it blocks the adenosine signal of sleep pressure. In flies its wake effect runs
          through dopamine: it acts on the PAM neurons (Nall et al. 2016). A level in mg that is absorbed and cleared,
          tolerance, jitters at high doses, and a crash as a big one wears off.
        </dd>
        <dt>Coffee is bitter</dt>
        <dd>
          Flies avoid caffeine: bitter taste neurons detect it (Lee et al. 2009). Every sip drives the gustatory
          neurons and PPL1 — less as the taste becomes familiar — and its mushroom body learns that the mug keeps it
          awake anyway.
        </dd>
        <dt>A nod is a loom</dt>
        <dd>
          When its head drops towards the keyboard, that is a looming stimulus on LPLC2 and LC4. If the giant fibre fires,
          it jerks awake. If not, it sleeps on the keys until the morning.
        </dd>
      </dl>
      <p className="note">
        Wiring, cell types and transmitters are measured (<b>MaleCNS v1.0</b>). The night, the doses, the builds and the
        mapping from desk to retina are the model&apos;s. The MacBook is drawn generically; Fly Lab is not affiliated with
        Apple. The code on screen is POKYH&apos;s own, by BedChem.
      </p>
      <p className="howto-links">
        <a href="/about.html">Read the full write-up</a> · <a href="/legal.html">Legal &amp; privacy</a>
      </p>
    </div>
  );
}
