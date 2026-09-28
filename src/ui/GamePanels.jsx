/**
 * The gaming setup's readouts: the match, the rank and how tilted it is (top
 * right), what its optic lobe makes of the game and how close the giant
 * fibre is to firing, which game its mushroom body has learned to hate, and
 * the cards for kills, deaths, results and rage-quits.
 *
 * Everything that moves continuously is read off the Gamer on an animation
 * frame, like the other experiments' panels.
 */
import { useEffect, useRef } from 'react';
import { refocusHowButton } from './HowItWorks.jsx';
import { PHASES } from '../game/gamer.js';
import { GAMES, GAME_ORDER, formatRank, CS2_ROUNDS_TO_WIN } from '../game/games.js';

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
const signed = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}`;

/** Tilt at which a death may end on the desk, and a lost match in a rage-quit (gamer.js). */
const MARKS = { slam: 0.55, quit: 0.7 };

// ----------------------------------------------------------- top right

const PULLS = [
  { key: 'memory', label: 'memory', tip: 'What its mushroom body has learned this game is worth. Each game drives its own Kenyon cells, so it learns them separately.' },
  { key: 'chase', label: 'NPF', tip: 'Low neuropeptide F: "one more". After a losing run it queues again for whatever it is already playing.' },
  { key: 'tilt', label: 'tilt', tip: 'Tilt pushes it away from the game that did this to it.' },
  { key: 'novelty', label: 'novelty', tip: 'The longer since it last played something, the more that something pulls.' },
];

function Decision({ gamerRef }) {
  const verbRef = useRef(null);
  const numRef = useRef(null);
  const whyRef = useRef(null);
  const rootRef = useRef(null);
  const barsRef = useRef({});
  useFrameLoop(gamerRef, (g) => {
    const a = g.appetite;
    const current = g.game;
    const pulls = {
      memory: g.gameValues[current],
      chase: a.chase,
      tilt: -g.tilt,
      novelty: a.best ? Math.min(1, (g.clock - g.career[a.best].lastPlayed) / 300) : 0,
    };
    let verb = 'wants', target, why, state = 'leaning';
    if (g.phase === PHASES.CASE_OPENING) { const a = g.cases.active; state = 'committed'; verb = 'opening'; target = a?.count > 1 ? `${a.count} cases` : 'a case'; why = a?.source === 'auto' ? 'CS2 feels good. The coin said yes.' : 'you asked. It was happy to.'; }
    else if (g.phase === PHASES.RAGE_QUIT) { state = 'broke'; verb = 'rage-quitting'; target = GAMES[a.best].short; why = `done with ${GAMES[current].short}. Alt-F4.`; }
    else if (g.phase === PHASES.SWITCHING) { state = 'committed'; verb = 'opening'; target = GAMES[g.nextGame ?? current].short; why = g.switchBy === 'visitor' ? 'you picked it. Quitting the other one.' : 'something else. anything else.'; }
    else if (g.phase === PHASES.QUEUE) { state = 'committed'; verb = 'queueing'; target = GAMES[current].short; why = g.inARow ? `game ${g.inARow + 1} in a row` : 'a fresh start'; }
    else {
      target = a.stay ? `more ${GAMES[current].short}` : GAMES[a.best].short;
      why = a.stay
        ? (a.chase > 0.3 ? 'NPF low — one more, to win it back' : g.gameValues[current] > 0.1 ? 'its mushroom body likes this one' : 'the queue button is right there')
        : (g.tilt > 0.5 ? 'too tilted for this one' : g.gameValues[current] < -0.1 ? 'this game has hurt it before' : 'bored of it');
    }
    setText(verbRef.current, verb);
    setText(numRef.current, target);
    setText(whyRef.current, why);
    if (rootRef.current) rootRef.current.dataset.state = state;
    for (const p of PULLS) {
      const el = barsRef.current[p.key];
      if (!el) continue;
      el.style.setProperty('--v', String(Math.min(1, Math.abs(pulls[p.key]) / 0.8)));
      el.dataset.sign = pulls[p.key] < 0 ? 'neg' : 'pos';
    }
  });
  return (
    <div className="stake tip" ref={rootRef} data-tip="After every match it decides again: queue for the same game, or open another. Nothing picks for it; these are the pulls, read off its state.">
      <div className="stake-head">
        <span className="stake-verb" ref={verbRef}>wants</span>
        <b ref={numRef}>—</b>
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

const LOG_SLOTS = 12;
function MatchLog({ history }) {
  const empty = Math.max(0, LOG_SLOTS - history.length);
  return (
    <div className="history">
      <span className="history-label">Matches:</span>
      <div className="runlog gamelog tip" data-tip="The last dozen matches. Orange: a win. Red: a loss. Dark red, tall: a match it rage-quit.">
        {history.map((h, i) => <i key={h.at ?? i} className={h.kind} title={GAMES[h.game].short} />)}
        {Array.from({ length: empty }, (_, i) => <i key={`e${i}`} className="empty" />)}
      </div>
    </div>
  );
}

export function GameHud({ gamerRef, ui }) {
  const gameRef = useRef(null);
  const rankRef = useRef(null);
  const lineRef = useRef(null);
  const tiltRef = useRef(null);
  const tiltValRef = useRef(null);
  useFrameLoop(gamerRef, (g) => {
    const id = g.phase === PHASES.CASE_OPENING ? 'cs2' : g.nextGame ?? g.game;
    const c = g.career[id];
    setText(gameRef.current, GAMES[id].name);
    setText(rankRef.current, `${formatRank(id, c.rank)}${c.lastDelta && g.phase === PHASES.RESULT ? `  ${c.lastDelta > 0 ? '+' : '−'}${Math.abs(c.lastDelta)}` : ''}`);
    const m = g.match;
    let line;
    if (g.phase === PHASES.CASE_OPENING) line = `case ${(g.cases.active?.index ?? 0) + 1}/${g.cases.active?.count ?? 1} · ${g.cases.items.length} skins${g.caseResume?.phase === PHASES.PLAYING ? ' · match paused' : ''}`;
    else if (g.phase === PHASES.QUEUE) line = `in queue · ${Math.floor(g.t)}s`;
    else if (g.phase === PHASES.SWITCHING) line = 'on the desktop';
    else if (g.phase === PHASES.RAGE_QUIT) line = 'quit the game';
    else if (!m) line = '';
    else if (m.game === 'r6') line = `${m.siege.operator.name} · ${m.siege.attack ? 'ATK' : 'DEF'} · ${m.rounds.us}–${m.rounds.them}`;
    else if (m.game === 'cs2') line = `${m.kills}/${m.deaths} · rounds ${m.rounds.us}–${m.rounds.them} of ${CS2_ROUNDS_TO_WIN}`;
    else if (m.game === 'fortnite') line = `${m.kills} elims · ${m.players} left`;
    else if (m.game === 'minecraft') line = `${m.kills} mobs · ${m.deaths} deaths · ${m.carried} 💎 carried`;
    else if (GAMES[m.game].solo) line = `story · ${m.kills} kills · ${m.deaths} deaths`;
    else line = `${m.kills}/${m.deaths}/${m.assists} · ${m.cs} cs`;
    setText(lineRef.current, line);
    if (tiltRef.current) tiltRef.current.style.setProperty('--v', g.tilt.toFixed(3));
    setText(tiltValRef.current, `${Math.round(g.tilt * 100)}%`);
  });
  return (
    <aside className="bank gamebank">
      <div className="game-now tip" data-tip="What it is playing, and its rank there. Each game keeps its own.">
        <b ref={gameRef}>—</b>
        <span ref={rankRef} />
      </div>
      <p className="game-line" ref={lineRef} />
      <div className="tilt tip" data-tip={`Tilt: a persistent, scalable state built from deaths, defeats and flame, through PPL1 and octopamine — and bled off by wins. It is the model's, like the defensive state. Past the first mark a death can end on the desk; past the second, a lost match ends in a rage-quit.`}>
        <span className="tilt-label">Tilt</span>
        <div className="tilt-track" ref={tiltRef}><i /><s style={{ left: `${MARKS.slam * 100}%` }} /><s style={{ left: `${MARKS.quit * 100}%` }} /></div>
        <output ref={tiltValRef}>0%</output>
      </div>
      <Decision gamerRef={gamerRef} />
      <MatchLog history={ui.history} />
      {(ui.slams > 0 || ui.rageQuits > 0) && (
        <div className="bank-tags">
          {ui.slams > 0 && <div className="tag dry">desk slams ×{ui.slams}</div>}
          {ui.rageQuits > 0 && <div className="tag dry">rage-quits ×{ui.rageQuits}</div>}
        </div>
      )}
    </aside>
  );
}

// ------------------------------------------------------------ side panel

/**
 * What the fly sees. The readers are the cell types its own connectome made
 * selective, found at start-up: for the view turning one way or the other,
 * and for a small moving target.
 */
export function GameVision({ gamerRef, store, ready }) {
  const panRef = useRef(null);
  const panValRef = useRef(null);
  const trackRef = useRef(null);
  const trackValRef = useRef(null);
  const gfRef = useRef(null);
  const gfValRef = useRef(null);
  const rowsRef = useRef({});
  useFrameLoop(gamerRef, (g) => {
    const p = Math.max(-1, Math.min(1, g.pan));
    if (panRef.current) panRef.current.style.setProperty('--x', String((p + 1) / 2));
    setText(panValRef.current, signed(p));
    if (trackRef.current) trackRef.current.style.setProperty('--v', g.track.toFixed(3));
    setText(trackValRef.current, g.track.toFixed(2));
    if (gfRef.current) gfRef.current.style.setProperty('--v', String(Math.min(1, g.escape / 1.5)));
    setText(gfValRef.current, g.escape.toFixed(2));
    const brain = ready ? store.current.brain : null;
    if (!brain) return;
    const rate = brain.sim.rate;
    for (const [key, idxs] of [['right', brain.readRight], ['left', brain.readLeft], ['target', brain.readTarget]]) {
      idxs.forEach((i, k) => {
        const el = rowsRef.current[`${key}${k}`];
        if (el) el.style.setProperty('--v', String(Math.max(0, Math.min(1, (rate[i] - brain.rest[i]) * 4))));
      });
    }
  });
  const brain = ready ? store.current.brain : null;
  const col = (key, list, label, tip) => (
    <div className="vision-col">
      <span className="tip" data-tip={tip}>{label}</span>
      {list.slice(0, 4).map((r, k) => (
        <div className={`vision-cell ${key}`} key={r.name} ref={(el) => { rowsRef.current[`${key}${k}`] = el; }}>
          <i /><em>{r.name}</em>
        </div>
      ))}
    </div>
  );
  return (
    <section className="vision">
      <div className="memory-head">
        <span className="memory-title tip" tabIndex={0} data-tip="The game on the monitor goes in through the fly's own eyes: the view turning drives the horizontal motion detectors (T4a/T5a, T4b/T5b), an enemy drives the small-target cells LC10a and LC11, and anything rushing at it drives the looming detectors LPLC2 and LC4.">
          What it sees
        </span>
      </div>
      <div className="memory-scale" aria-hidden="true">
        <span>left</span>
        <div className="memory-track vision-track game-pan" ref={panRef}><i /></div>
        <span>right</span>
        <b className="vision-val" ref={panValRef}>0.00</b>
      </div>
      <div className="vital track tip" ref={trackRef} data-tip="How well it is locked on: what comes back downstream of LC10a and LC11 — the cells a courting male tracks a female with. It sets how fast the crosshair gets onto the enemy.">
        <span className="vital-label">Tracking</span>
        <div className="vital-track"><i /></div>
        <output className="vital-value" ref={trackValRef}>0.00</output>
      </div>
      {brain && (
        <div className="vision-cols game-cols">
          {col('up', brain.readers.right, 'turn right', 'Found at start-up by driving T4a/T5a and T4b/T5b on the connectome and keeping the types that answer most to one direction.')}
          {col('down', brain.readers.left, 'turn left', 'The same probe, the other way.')}
          {col('target', brain.readers.target, 'target', 'The types most driven by LC10a and LC11, probed the same way. The anterior optic tubercle (AOTU) is where LC10 projects in a real fly.')}
        </div>
      )}
      <div className="vital gf tip" ref={gfRef} data-tip="DNp01, the giant fibre: the command neuron for escape. A gank, a creeper, a player over the wall — a loom — drives LPLC2 and LC4, which converge on it. Past the mark, the fly flinches: a panic flick and a wasted shot.">
        <span className="vital-label">Giant fibre</span>
        <div className="vital-track"><i /><s /></div>
        <output className="vital-value" ref={gfValRef}>0.00</output>
      </div>
    </section>
  );
}

/** Which game has its mushroom body learned to hate? */
export function GameLeague({ gamerRef }) {
  const refs = useRef({});
  useFrameLoop(gamerRef, (g) => {
    for (const id of GAME_ORDER) {
      const el = refs.current[id];
      if (!el) continue;
      const v = g.gameValues[id] ?? 0;
      const c = g.career[id];
      el.style.setProperty('--x', String((Math.max(-1, Math.min(1, v * 1.6)) + 1) / 2));
      el.dataset.sign = v < 0 ? 'neg' : 'pos';
      el.dataset.on = id === g.game ? '1' : '0';
      setText(el.querySelector('output'), signed(v));
      setText(el.querySelector('small'), `${c.wins}–${c.losses}${c.rageQuits ? ` · ${c.rageQuits}× quit` : ''}`);
    }
  });
  return (
    <section className="league games">
      <span className="memory-title tip" tabIndex={0} data-tip="Each game drives its own sparse set of Kenyon cells, like an odour. Kills and wins drive PAM, deaths and defeats PPL1, and the mushroom body learns each game separately — read here through that game's own Kenyon cells. Left of centre: it has learned the game is bad for it.">
        Which game hurts?
      </span>
      <div className="league-rows">
        {GAME_ORDER.map((id) => (
          <div key={id} className="game-row tip" data-tip={`${GAMES[id].name}: what its mushroom body says the game is worth, and its record there.`} ref={(el) => { refs.current[id] = el; }}>
            <span>{GAMES[id].short}</span>
            <div className="game-value"><i /></div>
            <output>+0.00</output>
            <small />
          </div>
        ))}
      </div>
    </section>
  );
}

// --------------------------------------------------------------- cards

export function KillSlip({ result }) {
  if (!result) return null;
  const death = result.kind === 'death';
  const verb = death ? (result.cause === 'explode' ? 'Blown up' : 'Slain') : result.hs ? 'Headshot' : result.streak >= 3 ? 'Triple' : result.streak === 2 ? 'Double' : 'Kill';
  return (
    <div className={`slip gameslip ${death ? 'loss' : 'win'}`} key={result.at}>
      <div className="slip-stake">
        {death ? <>by <b>{result.name}</b>{result.streak > 1 ? <> · {result.streak} in a row</> : null}</> : <><b>{result.name}</b> · {GAMES[result.game].short}</>}
      </div>
      <div className="stamp down">{verb}</div>
    </div>
  );
}

export function ResultCard({ result }) {
  const g = GAMES[result.game];
  const won = result.won;
  let line;
  if (result.game === 'fortnite') line = won ? 'Last one standing.' : `Out at #${result.placement}.`;
  else if (result.game === 'minecraft') line = won ? `Made it to sunrise with ${result.carried} diamonds.` : 'Died on the way home. The diamonds are gone.';
  else if (result.game === 'cs2' || result.game === 'r6') line = `${result.rounds.us} : ${result.rounds.them}.`;
  else if (g.solo) line = won ? 'Mission complete.' : 'Died. Back to the last checkpoint.';
  else line = won ? 'The enemy nexus fell.' : 'The nexus fell. Theirs did not.';
  return (
    <div className={`slip ${won ? 'revive' : 'broke'} gameresult`}>
      <div className="stamp down">{won ? 'Victory' : 'Defeat'}</div>
      <p className="broke-body">{g.name}. {line} {won ? 'PAM fires; tilt drops.' : 'PPL1 fires; tilt climbs.'}</p>
    </div>
  );
}

export function RageQuitCard({ game, count, midMatch }) {
  return (
    <div className="slip broke ragequit">
      <div className="stamp down">Rage-quit</div>
      <p className="broke-body">
        {midMatch ? `It left the ${GAMES[game].short} match in the middle.` : `It lost, and it is done with ${GAMES[game].short}.`}{' '}
        Octopamine and PPL1 have been driving tilt up all match; now it comes out on the desk. Its mushroom body
        will remember this game — and it will still open another one.
      </p>
      {count > 1 && <p className="broke-count">Rage-quit number {count}.</p>}
    </div>
  );
}

// --------------------------------------------------------- how it works

export function GameHowItWorks({ open, onClose }) {
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
    <div className="howto" id="howto" role="dialog" aria-label="How the gaming setup works" ref={ref}>
      <button type="button" className="howto-close" onClick={() => { onClose(); refocusHowButton(); }} aria-label="Close">×</button>
      <h2>How the gaming setup works</h2>
      <dl>
        <dt>It aims with its reflexes</dt>
        <dd>
          The view turning on the monitor is wide-field motion, the stimulus of the optomotor response. It drives the
          horizontal motion detectors T4a/T5a and T4b/T5b, and the brain reads the turn back from cells its own wiring
          makes direction-selective, found by probing the connectome at start-up.
        </dd>
        <dt>It tracks like it courts</dt>
        <dd>
          An enemy is a small moving target. It drives LC10a and LC11, the lobula cells for small objects — LC10a is what
          a courting male follows a female with. What comes back downstream (the anterior optic tubercle, among others)
          sets how fast its crosshair gets onto the target.
        </dd>
        <dt>A creeper is a loom</dt>
        <dd>
          A gank, a creeper, a player over the wall, a peek: something growing fast on screen drives LPLC2 and LC4, which
          converge on the giant fibre DNp01. Past threshold, the fly flinches — the escape reflex, wasted on a mouse.
        </dd>
        <dt>It hears the headset</dt>
        <dd>
          Gunfire and teammates shouting are sound on its antennae: Johnston&apos;s organ, JO-A and JO-B.
        </dd>
        <dt>Tilt, and the desk</dt>
        <dd>
          Deaths, defeats and flame drive PPL1 and octopamine; tilt is the model&apos;s name for the persistent state that
          builds from them, and it makes its aim shaky. Fly aggression needs octopamine (Hoyer et al. 2008; Zhou et al.
          2008). Tilted enough, it slams the desk; more, and it rage-quits.
        </dd>
        <dt>It learns each game</dt>
        <dd>
          Every game drives its own sparse set of Kenyon cells, like an odour, so its mushroom body learns what each one
          does to it — kills and wins through PAM, deaths and defeats through PPL1. After every match it chooses: the same
          game again, or another, from what it has learned, NPF, novelty and tilt.
        </dd>
        <dt>CS2 cases</dt>
        <dd>
          When CS2 is going well — its mushroom body values the game above zero — it flips a coin after each match:
          heads, it pauses and opens one to three cases, the way the game does it, on its own monitor. Then it goes back to
          exactly where it was. While it plays CS2 you can ask it to open one, watch the reel live, and look through its
          inventory. The skin pictures are real artwork; the drops are simulated, saved in your browser, and worth nothing.
        </dd>
        <dt>Rainbow Six Siege</dt>
        <dd>
          Five against five on one lodge, Bomb mode: a drone in the preparation phase, breaching charges and reinforced
          walls, no respawns within a round, a defuser to plant or disable, sides swapped after three rounds and overtime at
          four all.
        </dd>
      </dl>
      <p className="note">
        Wiring, cell types and transmitters are measured (<b>MaleCNS v1.0</b>); the readers are found in it, not listed by
        hand. The matches, the ranks, tilt and the mapping from screen to retina are the model&apos;s. Gameplay is drawn
        by us; the skin pictures in its inventory are Valve&apos;s, credited there. None of the game makers is involved.
      </p>
      <p className="howto-links">
        <a href="/about.html">Read the full write-up</a> · <a href="/legal.html">Legal &amp; privacy</a>
      </p>
    </div>
  );
}
