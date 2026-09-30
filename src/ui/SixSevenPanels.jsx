/**
 * The classroom's readouts: how many times Damian has said it and the strikes
 * against his name (top right), the impulse live — the cue on the board, the
 * dopamine it raises, what holds it down — the scoreboard, and the cards for
 * laughs, silences, strikes and detention.
 *
 * Everything that moves continuously is read off the game on an animation
 * frame, like the other experiments' panels.
 */
import { useEffect, useRef } from 'react';
import { refocusHowButton } from './HowItWorks.jsx';
import { PHASES, TEACH, GO, MAX_STRIKES, NAME, DETENTION_LINES } from '../game/sixSeven.js';

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

/** What Damian is doing, in a few words. */
export function damianDoing(g) {
  if (g.phase === PHASES.DETENTION) return `writing lines (${g.lines}/${DETENTION_LINES})`;
  if (g.phase === PHASES.SIXSEVEN) return g.gesture?.mutter ? 'muttering it under his breath' : 'SIX SEVEN';
  if (g.urge - g.restraint > GO * 0.6) return 'about to say it';
  if (g.cue > 0.3 && g.watching > 0.5) return 'holding it in — the teacher is looking';
  if (g.cue > 0.3) return 'holding it in';
  if (g.boredom > 0.75) return 'bored, doodling sixes and sevens';
  if (g.watching > 0.5) return 'looking innocent';
  return 'watching the board';
}

const TEACH_WORDS = {
  [TEACH.WRITE]: 'writing on the board',
  [TEACH.ASK]: 'asking the class',
  [TEACH.ANSWER]: 'writing the answer',
  [TEACH.LOOK]: 'looking round the class',
  [TEACH.SCOLD]: `"${NAME}!"`,
  [TEACH.DETENTION]: 'supervising detention',
};

const RUNLOG_SLOTS = 16;
function Outcomes({ history }) {
  const empty = Math.max(0, RUNLOG_SLOTS - history.length);
  const cls = { laugh: 'w', flop: 'o', caught: 'x', held: 'e', detention: 'd' };
  return (
    <div className="history">
      <span className="history-label">Cues:</span>
      <div className="runlog sixlog tip" data-tip="The last cues and 67s. Orange: he said it and the class laughed. Grey: he said it to silence. Red: caught, a strike. Outlined: a cue he sat through. Black: detention.">
        {history.map((h, i) => <i key={h.at ?? i} className={cls[h.kind] ?? 'o'} />)}
        {Array.from({ length: empty }, (_, i) => <i key={`e${i}`} className="empty" />)}
      </div>
    </div>
  );
}

export function SixSevenBank({ gameRef, ui }) {
  const saidRef = useRef(null);
  const doingRef = useRef(null);
  const teachRef = useRef(null);
  const freshRef = useRef(null);
  const strikeRefs = useRef([]);
  useFrameLoop(gameRef, (g) => {
    setText(saidRef.current, g.stats.said);
    setText(doingRef.current, damianDoing(g));
    if (doingRef.current) doingRef.current.dataset.state = g.phase;
    setText(teachRef.current, g.teach.holdT > 0 ? 'whipping round' : TEACH_WORDS[g.teach.phase]);
    if (teachRef.current) teachRef.current.dataset.state = g.watching > 0.5 ? 'watching' : 'away';
    if (freshRef.current) freshRef.current.style.setProperty('--v', String(g.fresh));
    strikeRefs.current.forEach((el, i) => { if (el) el.dataset.on = i < g.strikes ? '1' : '0'; });
  });
  return (
    <aside className="bank sixbank">
      <div className="six-score">
        <div className="tip" data-tip={`How many times ${NAME} has said it, muttered ones included.`}>
          <b><span className="six-6">6</span><span className="six-7">7</span><em>×</em><span ref={saidRef}>0</span></b>
        </div>
        <div className="six-strikes tip" data-tip={`Strikes against his name on the board. ${MAX_STRIKES} is detention.`}>
          {Array.from({ length: MAX_STRIKES }, (_, i) => <i key={i} ref={(el) => { strikeRefs.current[i] = el; }} data-on="0" />)}
          <span>strikes</span>
        </div>
      </div>
      <p className="six-line"><span>{NAME}</span><b ref={doingRef} className="six-doing">watching the board</b></p>
      <p className="six-line"><span>The teacher</span><b ref={teachRef} className="six-teacher">writing on the board</b></p>
      <div className="vital six-fresh tip" data-tip="How funny it still is. Every 67 wears the joke out a little; it comes back slowly if he leaves it alone. A stale joke pulls less — and lands in silence." ref={freshRef}>
        <span className="vital-label">Freshness</span>
        <div className="vital-track"><i /></div>
      </div>
      <Outcomes history={ui.history} />
    </aside>
  );
}

// ------------------------------------------------------------ side panel

/** What is on the board right now, and how much of a six seven it is. */
export function OnTheBoard({ gameRef }) {
  const textRef = useRef(null);
  const tagRef = useRef(null);
  useFrameLoop(gameRef, (g) => {
    const T = g.teach;
    if (g.phase === PHASES.DETENTION) {
      setText(textRef.current, 'I will not say six seven in class.');
      setText(tagRef.current, 'detention');
      return;
    }
    const shown = T.item.text.slice(0, Math.ceil(T.item.text.length * T.written));
    setText(textRef.current, shown + (T.item.answer && T.answered > 0.3 ? `  = ${T.item.answer}` : '') || '…');
    setText(tagRef.current, T.item.cue ? (T.cued ? 'a six and a seven' : T.item.subject) : T.item.subject);
    if (tagRef.current) tagRef.current.dataset.cue = T.cued ? '1' : '0';
  });
  return (
    <section className="six-board">
      <div className="memory-head">
        <span className="memory-title tip" tabIndex={0} data-tip="What the teacher has chalked up so far. About half of what comes up has a six and a seven in it somewhere: page 67, a sum that comes to 67, 6 × 7, counting past six and seven.">
          On the board
        </span>
        <span className="six-tag" ref={tagRef} data-cue="0">maths</span>
      </div>
      <p className="six-chalk" ref={textRef}>…</p>
    </section>
  );
}

/** The impulse, live: the cue, the dopamine, and what holds it down. */
export function Impulse({ gameRef }) {
  const refs = useRef({});
  useFrameLoop(gameRef, (g) => {
    const rows = {
      cue: [g.cue, g.cue.toFixed(2)],
      urge: [g.urge / 2.4, g.urge.toFixed(2)],
      dread: [g.dread / 1.6, g.dread.toFixed(2)],
      bored: [g.boredom, g.boredom.toFixed(2)],
      suspicion: [g.teach.suspicion, g.teach.suspicion.toFixed(2)],
      memory: [(g.memory + 1) / 2, `${g.memory >= 0 ? '+' : '−'}${Math.abs(g.memory).toFixed(2)}`],
    };
    for (const [k, [v, text]] of Object.entries(rows)) {
      const el = refs.current[k];
      if (!el) continue;
      el.style.setProperty('--v', String(Math.max(0, Math.min(1, v))));
      setText(el.querySelector('output'), text);
    }
    const u = refs.current.urge;
    if (u) {
      // the line he has to cross moves: it is the threshold plus whatever holds him back
      u.style.setProperty('--m', String(Math.min(1, (GO + g.restraint) / 2.4)));
      u.dataset.state = g.phase === PHASES.SIXSEVEN ? 'fire' : g.urge - g.restraint > GO * 0.6 ? 'prep' : 'rest';
    }
  });
  const row = (key, label, tip, extra = '') => (
    <div className={`vital ${extra} tip`} data-tip={tip} ref={(el) => { refs.current[key] = el; }}>
      <span className="vital-label">{label}</span>
      <div className="vital-track"><i />{key === 'urge' && <s />}{key === 'memory' && <u />}</div>
      <output className="vital-value">0.00</output>
    </div>
  );
  return (
    <section className="vitals six-impulse">
      <span className="memory-title tip" tabIndex={0} data-tip="A cue drives PAM, the reward dopamine, in proportion to how funny the joke still is. When PAM's rate outruns what holds it back, he does it. Nothing else decides.">
        The impulse
      </span>
      {row('cue', 'Cue', 'How much of a six seven is on the board or in the air right now. It fades over a few seconds.')}
      {row('urge', 'Dopamine', 'PAM, the reward dopamine, above rest, read from the simulation. The mark is the line he has to cross: it moves right when the teacher is looking, with every strike against his name, and with dread. Past it, he says it.', 'gf six-urge')}
      {row('dread', 'Dread', 'PPL1, the punishment dopamine, above rest: the teacher\'s eyes, a strike, the silence after a 67 nobody laughed at.')}
      {row('memory', 'The classroom', 'What his mushroom body has learned about doing it here. Laughs, through PAM, push it right and make the next cue hit harder; strikes and detention, through PPL1, push it left.', 'six-memory')}
      {row('bored', 'Boredom', 'Rises while nothing on the board is a six or a seven. Bored enough, and unwatched, he mutters one unprompted.')}
      {row('suspicion', 'Suspicion', 'The teacher\'s. Every 67 behind its back raises it, and a suspicious teacher whips round. Whether he is caught depends on how far into it he is.')}
    </section>
  );
}

/** The scoreboard. */
export function SixSevenScores({ gameRef }) {
  const ref = useRef(null);
  useFrameLoop(gameRef, (g) => {
    const s = g.stats;
    const el = ref.current;
    if (!el) return;
    const set = (k, v) => setText(el.querySelector(`[data-k=${k}]`), v);
    set('said', s.said);
    set('laughs', s.laughs);
    set('flops', s.flops);
    set('caught', s.caught);
    set('held', s.held);
    set('unprompted', s.unprompted);
    set('rate', s.cues ? `${Math.round((100 * (s.said - s.unprompted)) / s.cues)}%` : '—');
    set('detentions', s.detentions);
    set('day', g.day);
  });
  const cell = (k, label, tip) => (
    <div className="ledger-cell tip" data-tip={tip} tabIndex={0}><b data-k={k}>0</b><span>{label}</span></div>
  );
  return (
    <section className="league">
      <span className="memory-title tip" tabIndex={0} data-tip="Everything since the page opened. Reload for a fresh joke and a clean board; ?seed=67 replays the same lesson.">
        {NAME}&apos;s record
      </span>
      <div className="ledger" ref={ref}>
        {cell('said', 'times said', 'Every 67, loud or muttered.')}
        {cell('laughs', 'laughs', 'Times the class laughed.')}
        {cell('flops', 'silences', 'Times nobody did. The joke was worn out.')}
        {cell('caught', 'caught', 'Times the teacher saw him at it.')}
        {cell('held', 'held in', 'Cues he sat through without doing it: the teacher was looking, or the joke was too stale to pull.')}
        {cell('rate', 'of cues', 'Share of the cues he answered.')}
        {cell('unprompted', 'unprompted', 'Muttered out of boredom, with no six or seven in sight.')}
        {cell('detentions', 'detentions', `${MAX_STRIKES} strikes each.`)}
        {cell('day', 'day', 'A day ends in detention.')}
      </div>
    </section>
  );
}

// --------------------------------------------------------------- cards

export function ResultSlip({ result }) {
  if (!result || !['laugh', 'flop', 'caught'].includes(result.kind)) return null;
  const tone = result.kind === 'laugh' ? 'win' : result.kind === 'caught' ? 'loss' : 'open';
  const verb = result.kind === 'laugh' ? 'The class laughs' : result.kind === 'caught' ? `Strike ${result.strikes}` : 'Silence';
  return (
    <div className={`slip sixslip ${tone}`} key={result.at}>
      <div className="slip-stake">
        {result.kind === 'laugh' && <>{result.ducked ? 'dropped his palms just as the teacher turned' : result.mutter ? 'muttered, and the back row heard' : 'behind the teacher’s back'} · <i>{Math.round(result.laughs * 100)}% of the room</i></>}
        {result.kind === 'flop' && <>the joke is worn out · <i>a small sting through PPL1</i></>}
        {result.kind === 'caught' && <>the teacher saw him mid-“six” · <i>PPL1 fires</i></>}
      </div>
      <div className="stamp down">{verb}</div>
    </div>
  );
}

export function DetentionCard({ count, lines }) {
  return (
    <div className="slip broke six-detention">
      <div className="stamp down">Detention</div>
      <p className="broke-body">
        {MAX_STRIKES} strikes. He stays behind and writes “I will not say six seven in class” — {lines} of {DETENTION_LINES} so
        far. PPL1 stays up the whole time, and his mushroom body learns what the classroom costs. Tomorrow the board is clean.
      </p>
      {count > 1 && <p className="broke-count">Detention number {count}.</p>}
    </div>
  );
}

export function SixSevenToast({ text }) {
  if (!text) return null;
  return <div className="news-toast six-toast" key={text.at}>{text.text}</div>;
}

// --------------------------------------------------------- how it works

export function SixSevenHowItWorks({ open, onClose }) {
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
    <div className="howto" id="howto" role="dialog" aria-label={`How ${NAME} works`} ref={ref}>
      <button type="button" className="howto-close" onClick={() => { onClose(); refocusHowButton(); }} aria-label="Close">×</button>
      <h2>How {NAME} works</h2>
      <dl>
        <dt>Nobody plays</dt>
        <dd>
          The teacher is a small script: it writes something on the board, turns to the class, writes the answer,
          looks round. {NAME} is a fruit fly connectome with a middle parting. You watch.
        </dd>
        <dt>A six and a seven</dt>
        <dd>
          About half of what goes on the board has them in it — page 67, a sum that comes to 67, 6 × 7. That is a cue,
          and a cue drives PAM, the reward dopamine, in his simulated brain: a cue that has paid off before predicts
          reward, and the prediction is itself a dopamine signal. When PAM&apos;s rate crosses the line, he does it.
        </dd>
        <dt>What holds it down</dt>
        <dd>
          The line moves. With the teacher looking, with every strike against his name, and with PPL1 — the punishment
          dopamine — it sits further away. So he mostly does it behind the teacher&apos;s back.
        </dd>
        <dt>A joke wears out</dt>
        <dd>
          The class laughs, and that is a reward burst. But less each time: freshness drops with every 67 and comes back
          slowly. A stale joke pulls less, so he holds more cues in — and if he says it anyway, it lands in silence.
        </dd>
        <dt>Caught</dt>
        <dd>
          Every unseen 67 makes the teacher more suspicious, and a suspicious teacher whips round. Far enough into it he
          drops his palms in time. Caught mid-“six” it is a strike; three is detention, and lines.
        </dd>
        <dt>The gesture</dt>
        <dd>
          Both palms weighing, up and down in turn. The scan has one rigged foreleg, so that one pumps and the body rocks
          the other way. With the sound on he says it out loud, in your browser&apos;s own voice: no recording is played,
          and only a voice that runs on your device is used.
        </dd>
      </dl>
      <p className="note">
        Wiring, cell types and transmitters are measured (<b>MaleCNS v1.0</b>). A fruit fly does not know what sixty-seven
        is: the cue, the classroom and the idea that laughter is rewarding are the model&apos;s. Where the dopamine goes
        once it is released, and what the mushroom body learns from it, is the connectome&apos;s.
      </p>
      <p className="howto-links">
        <a href="/about.html">Read the full write-up</a> · <a href="/legal.html">Legal &amp; privacy</a>
      </p>
    </div>
  );
}
