/**
 * The doomscroll's readouts: the night and the brain sync (top right), both
 * phones exactly as the flies see them, what each feed has turned into, the
 * two brains, the thread between them and their thoughts, and the morning's
 * screen-time report.
 *
 * Continuous values are read off the Duo on an animation frame, as in the
 * other experiments.
 */
import { useEffect, useRef } from 'react';
import { refocusHowButton } from './HowItWorks.jsx';
import { REELS, CATS, PHASES, NAMES } from '../game/scroll.js';
import { ScrollThinker } from './scrollThoughts.js';
import { TikTokFeedPlayer, EditCredit } from './TikTokConsent.jsx';
import { Vitals, EXPLAIN } from './Vitals.jsx';
import { EDITS, EDIT_SUBJECT } from '../game/tiktokEdits.js';

function useFrameLoop(ref, fn) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const d = ref.current;
      if (d) fnRef.current(d);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ref]);
}

const setText = (el, v) => { if (el && el.textContent !== String(v)) el.textContent = v; };
const pct = (x) => `${Math.round(x * 100)}%`;
const hm = (min) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`;

const STATUS = {
  [PHASES.WATCHING]: (f) => (f.reel.from ? `watching ${f.reel.from}'s reel` : f.reel.edit ? `watching ${f.reel.edit.creator}` : `watching ${f.reel.cat}`),
  [PHASES.SWIPING]: () => 'swiping',
  [PHASES.SHARING]: (f) => `sending to ${f.friend.name}`,
  [PHASES.DEAD]: () => 'phone died',
  [PHASES.ASLEEP]: () => 'asleep',
};

// ------------------------------------------------------------ top right

export function ScrollBank({ duoRef }) {
  const clockRef = useRef(null);
  const nightRef = useRef(null);
  const syncRef = useRef(null);
  const syncValRef = useRef(null);
  const exRef = useRef(null);
  const batRefs = useRef([]);
  useFrameLoop(duoRef, (d) => {
    setText(clockRef.current, d.clock);
    setText(nightRef.current, `night ${d.night}`);
    const s = Math.max(0, d.sync);
    if (syncRef.current) syncRef.current.style.setProperty('--v', String(s));
    setText(syncValRef.current, pct(s));
    setText(exRef.current, d.exchanged);
    d.flies.forEach((f, i) => {
      const el = batRefs.current[i];
      if (!el) return;
      el.style.setProperty('--v', String(f.battery / 100));
      el.dataset.low = f.battery < 15 ? 'yes' : 'no';
      setText(el.querySelector('output'), f.phase === PHASES.ASLEEP ? 'asleep' : `${Math.round(f.battery)}%`);
    });
  });
  return (
    <aside className="bank scrollbank">
      <div className="bar-clock tip" data-tip="The clock of the night. It runs slowly while they scroll, and fast once both are asleep.">
        <b ref={clockRef}>22:30</b><span ref={nightRef}>night 1</span>
      </div>
      <div className="sync tip" ref={syncRef} data-tip="Brain sync, measured the way hyperscanning studies measure people watching the same film: for a dozen brain regions, the time course of activity over the last six seconds is correlated between the two flies, then averaged. Different reels pull them apart; a sent reel, watched together, pulls them into step.">
        <span>brain sync</span>
        <div className="sync-track"><i /></div>
        <b ref={syncValRef}>0%</b>
      </div>
      <div className="batteries">
        {NAMES.map((n, i) => (
          <div className="battery" key={n} ref={(el) => { batRefs.current[i] = el; }}>
            <span>{n}</span><div className="battery-track"><i /></div><output>100%</output>
          </div>
        ))}
      </div>
      <p className="exchanged tip" data-tip="Reels sent between the two phones tonight and on nights before.">
        <b ref={exRef}>0</b> reels exchanged
      </p>
    </aside>
  );
}

// ------------------------------------------------------------ side panel

/**
 * Both phones, copied from the canvases the 3D phones are painted from. A
 * fly on a TikTok edit (with the visitor's consent) gets TikTok's player laid
 * over its screen, and the credit underneath.
 */
export function Phones({
  duoRef, canvasRefs, playing = [null, null], upcoming = [null, null], soundOn = false, listen = 0,
  onListen = () => {}, expanded = null, onExpand = () => {},
}) {
  // the one phone you hear: the open one, else the chosen one if it is on an
  // edit, else whichever is — and never two at once
  const heard = expanded !== null ? -1 : playing[listen] ? listen : playing[1 - listen] ? 1 - listen : -1;
  const refs = useRef([]);
  const statusRefs = useRef([]);
  useFrameLoop(duoRef, (d) => {
    d.flies.forEach((f, i) => {
      const dst = refs.current[i];
      const src = canvasRefs[i].current;
      if (dst && src) dst.getContext('2d').drawImage(src, 0, 0, dst.width, dst.height);
      setText(statusRefs.current[i], STATUS[f.phase](f));
    });
  });
  return (
    <section className="phones">
      {NAMES.map((n, i) => (
        <figure className="phone-view" key={n}>
          <div className="phone-screen">
            <canvas ref={(el) => { refs.current[i] = el; }} width="270" height="560" aria-label={`${n}'s phone`} />
            {playing[i] && expanded !== i && (
              <TikTokFeedPlayer
                duo={duoRef.current}
                index={i}
                reel={playing[i]}
                next={upcoming[i]}
                audible={soundOn && heard === i}
              />
            )}
            {playing[i] && expanded !== i && (
              <button type="button" className="phone-expand" onClick={() => onExpand(i)} aria-label={`Watch ${n}'s edit large`}>
                watch large
              </button>
            )}
            {expanded === i && <p className="phone-away">playing large above</p>}
          </div>
          <figcaption>
            <b>{n}</b> <span ref={(el) => { statusRefs.current[i] = el; }}>—</span>
            {playing[i] && (
              <button
                type="button"
                className={`listen ${soundOn && heard === i ? 'on' : ''}`}
                aria-pressed={soundOn && heard === i}
                onClick={() => onListen(i)}
                title={soundOn ? `Hear ${n}'s phone` : 'Turn sound on to hear the edits'}
              >
                {soundOn && heard === i ? 'listening' : 'listen'}
              </button>
            )}
          </figcaption>
          {playing[i] && <EditCredit reel={playing[i]} />}
        </figure>
      ))}
    </section>
  );
}

/** What each feed has become: the algorithm's mix, and its guess. */
export function Feeds({ duoRef }) {
  const refs = useRef([]);
  useFrameLoop(duoRef, (d) => {
    d.flies.forEach((f, i) => {
      const el = refs.current[i];
      if (!el) return;
      const mix = f.feed.mix;
      for (const c of CATS) {
        const seg = el.querySelector(`[data-cat=${c}]`);
        if (seg) seg.style.flexGrow = String(mix[c] + 0.0001);
      }
      setText(el.querySelector('.feed-doom'), `${pct(f.feed.doom)} doom`);
      setText(el.querySelector('.feed-guess'), REELS[f.feed.favourite].label);
    });
  });
  return (
    <section className="feeds">
      <span className="memory-title tip" tabIndex={0} data-tip="The last two dozen reels each feed served. The algorithm only measures how long each kind was watched and serves more of what held attention. Threat reels drive octopamine, and an aroused fly watches longer — so feeds drift towards doom on their own.">
        What the algorithm feeds them
      </span>
      {NAMES.map((n, i) => (
        <div className="feed" key={n} ref={(el) => { refs.current[i] = el; }}>
          <div className="feed-head"><b>{n}</b><span className="feed-doom">0% doom</span></div>
          <div className="feed-bar">
            {CATS.map((c) => <i key={c} data-cat={c} style={{ background: REELS[c].color }} title={REELS[c].label} />)}
          </div>
          <p className="feed-why">thinks {n} likes: <span className="feed-guess">—</span></p>
        </div>
      ))}
      <div className="feed-legend">
        {CATS.filter((c) => !REELS[c].external || EDITS.length).map((c) => (
          <span key={c}><i style={{ background: REELS[c].color }} />{REELS[c].external ? 'TikTok edits' : c}</span>
        ))}
      </div>
    </section>
  );
}

/** What the signals mean here, where a reel is the only thing that happens. */
const SCROLL_EXPLAIN = {
  ...EXPLAIN,
  dopamine: 'PAM: a reel better than reels usually are, a message from the other, a reply.',
  octopamine: 'PPL1 and arousal: what the threat reels drive, and what keeps a fly watching.',
  defensive: 'Builds with every spider and swatter, and with a feed that is mostly doom.',
  npf: 'Satisfaction. Replies top it up; being left on seen and a frightening feed drain it.',
};

const EXTRA_ROWS = [
  { key: 'sleepy', label: 'Sleepy', tip: 'Sleep pressure. The phone\'s light holds it off; the battery usually gives out first.', value: (f) => f.sleepPressure },
  // only when there are TikTok edits to fall for
  ...(EDITS.length ? [{
    key: 'love',
    label: 'Love',
    tip: `How far it has fallen for ${EDIT_SUBJECT}: it grows with every edit watched, with dopamine behind it, and fades only slowly.`,
    value: (f) => f.love,
  }] : []),
];

/** Each fly's vitals as the other experiments show them, with its own stress gauge. */
export function ScrollVitals({ flyRefs }) {
  return NAMES.map((n, i) => (
    <Vitals
      key={n}
      machineRef={flyRefs[i]}
      title={n}
      explain={SCROLL_EXPLAIN}
      extra={EXTRA_ROWS}
      cortisol={{ label: `Cortisol · ${n}`, idPrefix: `cortisol-${n.toLowerCase()}` }}
    />
  ));
}

/** The thread between the two phones, newest first. */
export function Thread({ thread }) {
  const items = thread.slice(-8).reverse();
  const text = (m) => {
    const from = NAMES[m.from];
    const to = NAMES[1 - m.from];
    if (m.kind === 'reel') return <><b>{from}</b> sent {to} {m.edit ? <>a {EDIT_SUBJECT} edit <i>by {m.edit.creator}</i></> : <>a reel <i>{m.cat}</i></>}</>;
    if (m.kind === 'seen') return <><b>{from}</b> <span className="seen">seen</span></>;
    return <><b>{from}</b> {m.kind}</>;
  };
  return (
    <section className="thread">
      <span className="memory-title tip" tabIndex={0} data-tip="Everything that passed between the two phones. A reel gets sent when it spikes the sender's dopamine or arousal; a reply is social reward for the sender, and 'seen' with nothing else is a small sting.">
        Between them
      </span>
      {items.length === 0 && <p className="thread-empty">Nothing sent yet.</p>}
      <ul>
        {items.map((m) => (
          <li key={`${m.at}-${m.from}-${m.kind}`} className={`msg ${m.from === 0 ? 'a' : 'b'} ${m.kind}`}>
            <span className="msg-time">{m.clock}</span> {text(m)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What each of them is thinking. */
export function Thoughts({ duoRef }) {
  const thinkers = useRef(null);
  const refs = useRef([]);
  useFrameLoop(duoRef, (d) => {
    if (!thinkers.current) thinkers.current = d.flies.map((f) => new ScrollThinker(f));
    thinkers.current.forEach((t, i) => setText(refs.current[i], t.read()));
  });
  return (
    <section className="thoughts">
      {NAMES.map((n, i) => (
        <p className="memory-verdict" key={n}>
          <span className="memory-verdict-label">{n}:</span>{' '}
          <span ref={(el) => { refs.current[i] = el; }} />
        </p>
      ))}
    </section>
  );
}

// ----------------------------------------------------------------- cards

export function MorningCard({ report }) {
  if (!report) return null;
  return (
    <div className="slip revive morning">
      <div className="stamp down">Screen time</div>
      <div className="report">
        {report.map((r) => (
          <div className="report-col" key={r.name}>
            <b>{r.name}</b>
            <span className="report-big">{hm(r.screen)}</span>
            <span>{r.reels} reels · sent {r.sent}</span>
            <span>{r.replies} replies · {r.ignored} on seen</span>
            <span>{r.flinches} flinches</span>
            <span className="report-doom">feed {pct(r.doom)} doom</span>
          </div>
        ))}
      </div>
      <p className="broke-body">The algorithm remembers. Tonight's feed starts where last night's ended.</p>
    </div>
  );
}

export function EventToast({ event }) {
  if (!event) return null;
  return <div className="news-toast scroll-toast" key={event.at}>{event.text}</div>;
}

// --------------------------------------------------------- how it works

export function ScrollHowItWorks({ open, onClose, onCookieSettings }) {
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
    <div className="howto" id="howto" role="dialog" aria-label="How the doomscroll works" ref={ref}>
      <button type="button" className="howto-close" onClick={() => { onClose(); refocusHowButton(); }} aria-label="Close">×</button>
      <h2>How the doomscroll works</h2>
      <dl>
        <dt>Two brains</dt>
        <dd>
          {NAMES[0]} and {NAMES[1]} each run their own rate model over the same measured wiring, with their own mushroom
          bodies. Nobody controls either of them.
        </dd>
        <dt>The reels</dt>
        <dd>
          Ten kinds, all things a fly&apos;s nervous system has an opinion on, fed into the pathway it would use:
          rotting fruit into the olfactory neurons, sugar into taste, wing song into Johnston&apos;s organ (JO-A/B),
          stripes and a swarm into the T4/T5 motion detectors, a bug zapper&apos;s UV onto the whole visual system —
          and spiders, swatters, vinegar traps, a parasitoid wasp and the zapper&apos;s pull into the looming
          detectors LPLC2 and LC4, which reach the giant fibre. When DNp01 fires, the fly flinches at a video.
        </dd>
        <dt>The algorithm</dt>
        <dd>
          Knows nothing about flies. It measures how long each kind of reel was watched and serves more of it.
          Threats drive octopamine, and an aroused fly watches longer — so feeds drift towards doom by themselves.
        </dd>
        <dt>The messages</dt>
        <dd>
          A reel that spikes dopamine or arousal gets sent to the other fly. Opening a friend&apos;s reel is rewarding;
          a reply is social reward for the sender, and &quot;seen&quot; is a small sting. Replies breed more sending.
        </dd>
        <dt>Brain sync</dt>
        <dd>
          The correlation of the two brains&apos; activity, live. The same reel on both screens pulls them together.
        </dd>
        <dt>The night</dt>
        <dd>
          The screen&apos;s light holds sleep off; usually the battery gives out first. In the morning, a screen-time
          report — and the feed remembers.
        </dd>
      </dl>
      <p className="note">
        Wiring, cell types and transmitters are measured (<b>MaleCNS v1.0</b>). The reels, the feed, the phone and
        the mapping from screen to sense are the model&apos;s. No fly owns a phone.
      </p>
      <p className="howto-links">
        <a href="/about.html">Read the full write-up</a> · <a href="/legal.html">Legal &amp; privacy</a>
        {onCookieSettings && <>{' · '}<button type="button" onClick={onCookieSettings}>Cookie settings</button></>}
      </p>
    </div>
  );
}
