/**
 * The trading desk's readouts: the account and the order being formed (top
 * right), what the fly's optic lobe makes of the chart and how close the
 * giant fibre is to firing, the scoreboard against buy-and-hold and a coin,
 * and the cards for fills, panics and margin calls.
 *
 * Everything that moves continuously is read off the Trader on an animation
 * frame, like the casino's and the bar's panels.
 */
import { useEffect, useRef } from 'react';
import { refocusHowButton } from './HowItWorks.jsx';
import { PHASES, MAX_UNITS, START_CASH, SHARES_PER_UNIT, tradeReason } from '../game/trader.js';
import { TICKER } from '../game/market.js';
import { drawChart } from '../scene/chartTexture.js';

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
export const money = (x, digits = 0) => `${x >= 0 ? '+' : '−'}$${Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const pct = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`;

// ----------------------------------------------------------- top right

const PULLS = [
  { key: 'follow', label: 'optomotor', tip: 'The trend as its optic lobe reports it. Flies turn with wide-field motion — the optomotor response — and here the same wiring decides which way to lean. Momentum trading, as a reflex.' },
  { key: 'memory', label: 'memory', tip: 'What its mushroom body has learned about being in this market: realised profits through PAM, losses through PPL1.' },
  { key: 'chase', label: 'NPF', tip: 'Low neuropeptide F. After a losing run it sizes up to win it back.' },
  { key: 'greed', label: 'greed', tip: 'Dopamine still up from the last win makes the next position bigger.' },
  { key: 'caution', label: 'caution', tip: 'The defensive state and the drawdown: it trades smaller when it is losing or the market lurches.' },
];

/** Target position as eleven cells, short on the left, long on the right. */
function Decision({ traderRef }) {
  const cellsRef = useRef([]);
  const verbRef = useRef(null);
  const numRef = useRef(null);
  const whyRef = useRef(null);
  const barsRef = useRef({});
  const rootRef = useRef(null);
  useFrameLoop(traderRef, (m) => {
    const a = m.appetite;
    let state = 'leaning', verb = 'leaning', target = a.target, why;
    if (m.phase === PHASES.MARGIN_CALL) { state = 'broke'; verb = 'liquidated'; target = 0; why = 'the broker closed everything'; }
    else if (m.phase === PHASES.CLOSED) { verb = 'market closed'; target = m.position; why = 'holding overnight'; }
    else if (m.order) { state = 'committed'; verb = m.order.panic ? 'escaping' : 'pressing'; target = m.order.target; why = m.order.why; }
    else why = tradeReason(a, target, m.position);
    cellsRef.current.forEach((el, i) => {
      if (!el) return;
      const v = i - MAX_UNITS;
      const inHeld = m.position !== 0 && Math.sign(v) === Math.sign(m.position) && Math.abs(v) <= Math.abs(m.position);
      const inTarget = target !== 0 && Math.sign(v) === Math.sign(target) && Math.abs(v) <= Math.abs(target);
      el.className = `${v === 0 ? 'zero' : v > 0 ? 'long' : 'short'}${inHeld ? ' held' : ''}${inTarget ? ' want' : ''}`;
    });
    setText(verbRef.current, verb);
    setText(numRef.current, target === 0 ? 'flat' : `${target > 0 ? 'long' : 'short'} ${Math.abs(target)}`);
    setText(whyRef.current, why);
    if (rootRef.current) rootRef.current.dataset.state = state;
    for (const p of PULLS) {
      const el = barsRef.current[p.key];
      if (!el) continue;
      el.style.setProperty('--v', String(Math.min(1, Math.abs(a[p.key]) / 0.8)));
      el.dataset.sign = a[p.key] < 0 ? 'neg' : 'pos';
    }
  });
  return (
    <div
      className="stake tip"
      ref={rootRef}
      data-tip={`The fly picks its own position, from five units short to five long (a unit is ${SHARES_PER_UNIT} shares), from what it sees and what it feels. Filled cells are what it holds; outlined ones what it wants.`}
    >
      <div className="stake-head">
        <span className="stake-verb" ref={verbRef}>leaning</span>
        <b ref={numRef}>flat</b>
      </div>
      <div className="pos-cells" aria-hidden="true">
        {Array.from({ length: MAX_UNITS * 2 + 1 }, (_, i) => <i key={i} ref={(el) => { cellsRef.current[i] = el; }} />)}
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

const RUNLOG_SLOTS = 12;
function TradeLog({ history }) {
  const empty = Math.max(0, RUNLOG_SLOTS - history.length);
  const cls = (h) => (h.kind === 'margin' ? 'x' : h.kind === 'panic' ? 'p'
    : h.pnl > 1 ? 'w' : h.pnl < -1 ? 'l' : 'o');
  return (
    <div className="history">
      <span className="history-label">Orders:</span>
      <div className="runlog tradelog tip" data-tip="The last dozen orders. Green: closed at a profit. Red: closed at a loss. Grey: opened or added. Outlined: a panic sell, fired by the giant fibre. Dark red: a margin call.">
        {history.map((h, i) => <i key={h.at ?? i} className={cls(h)} />)}
        {Array.from({ length: empty }, (_, i) => <i key={`e${i}`} className="empty" />)}
      </div>
    </div>
  );
}

export function TradeBank({ traderRef, ui }) {
  const eqRef = useRef(null);
  const pnlRef = useRef(null);
  const posRef = useRef(null);
  const chartRef = useRef(null);
  const clock = useRef(0);
  useFrameLoop(traderRef, (m) => {
    setText(eqRef.current, `$${Math.round(m.equity).toLocaleString('en-US')}`);
    setText(pnlRef.current, `${money(m.pnl)} paper P&L`);
    if (pnlRef.current) pnlRef.current.dataset.sign = m.pnl < 0 ? 'neg' : 'pos';
    setText(posRef.current, m.position
      ? `${m.position > 0 ? 'Long' : 'Short'} ${Math.abs(m.position) * SHARES_PER_UNIT} ${TICKER} @ ${m.avgCost.toFixed(2)} · ${pct(m.unrealizedPct)}`
      : `Flat · $${TICKER} ${m.price.toFixed(2)}`);
    const now = performance.now();
    if (chartRef.current && now - clock.current > 120) {
      clock.current = now;
      drawChart(chartRef.current.getContext('2d'), m, { header: false, compact: true });
    }
  });
  return (
    <aside className="bank tradebank">
      <div className="trade-equity tip" data-tip={`Equity: cash plus the position at the current price. It started with $${START_CASH.toLocaleString('en-US')} of paper money; margin calls top it up, and the P&L leaves those top-ups out.`}>
        <b ref={eqRef}>$10,000</b>
        <span ref={pnlRef} data-sign="pos">+$0 paper P&L</span>
      </div>
      <canvas ref={chartRef} className="trade-mini tip" width="512" height="170" data-tip="The same chart the fly is watching on its monitor. The dashed line is its average cost." />
      <p className="trade-pos" ref={posRef}>Flat</p>
      <Decision traderRef={traderRef} />
      <TradeLog history={ui.history} />
      {(ui.panics > 0 || ui.marginCalls > 0) && (
        <div className="bank-tags">
          {ui.panics > 0 && <div className="tag dry">panic sells ×{ui.panics}</div>}
          {ui.marginCalls > 0 && <div className="tag dry">margin calls ×{ui.marginCalls}</div>}
        </div>
      )}
    </aside>
  );
}

// ------------------------------------------------------------ side panel

/**
 * What the fly sees. The readers are the cell types its own connectome made
 * direction-selective, found at start-up; each bar is that type's firing
 * above rest, live.
 */
export function Vision({ traderRef, store, ready }) {
  const trendRef = useRef(null);
  const trendValRef = useRef(null);
  const gfRef = useRef(null);
  const gfValRef = useRef(null);
  const rowsRef = useRef({});
  useFrameLoop(traderRef, (m) => {
    const t = Math.max(-1, Math.min(1, m.perceivedTrend));
    if (trendRef.current) trendRef.current.style.setProperty('--x', String((t + 1) / 2));
    setText(trendValRef.current, `${t >= 0 ? '+' : '−'}${Math.abs(t).toFixed(2)}`);
    if (gfRef.current) gfRef.current.style.setProperty('--v', String(Math.min(1, m.escape / 1.5)));
    setText(gfValRef.current, m.escape.toFixed(2));
    const brain = ready ? store.current.brain : null;
    if (!brain) return;
    const rate = brain.sim.rate;
    for (const [key, idxs] of [['up', brain.readUp], ['down', brain.readDown]]) {
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
      {list.map((r, k) => (
        <div className={`vision-cell ${key}`} key={r.name} ref={(el) => { rowsRef.current[`${key}${k}`] = el; }}>
          <i /><em>{r.name}</em>
        </div>
      ))}
    </div>
  );
  return (
    <section className="vision">
      <div className="memory-head">
        <span className="memory-title tip" tabIndex={0} data-tip="The chart drives the real upward (T4c, T5c) and downward (T4d, T5d) motion detectors of the optic lobe. What the fly trades on is read further downstream, from cell types the wiring itself makes direction-selective.">
          What it sees
        </span>
      </div>
      <div className="memory-scale" aria-hidden="true">
        <span>down</span>
        <div className="memory-track vision-track" ref={trendRef}><i /></div>
        <span>up</span>
        <b className="vision-val" ref={trendValRef}>0.00</b>
      </div>
      {brain && (
        <div className="vision-cols">
          {col('up', brain.readers.up, 'reads upward', 'Found at start-up by driving T4c/T5c and T4d/T5d on the connectome and keeping the types that answer most to upward motion.')}
          {col('down', brain.readers.down, 'reads downward', 'The same probe, the other way. VS cells are among them — the vertical system, which prefers downward motion in a real fly too.')}
        </div>
      )}
      <div className="vital gf tip" ref={gfRef} data-tip="DNp01, the giant fibre: the command neuron for escape. A crash on screen is a looming stimulus that drives LPLC2 and LC4, which converge on it. Past the mark, the fly flees — it sells everything.">
        <span className="vital-label">Giant fibre</span>
        <div className="vital-track"><i /><s /></div>
        <output className="vital-value" ref={gfValRef}>0.00</output>
      </div>
    </section>
  );
}

/** Fly vs. buy-and-hold vs. a coin, live. */
export function League({ traderRef }) {
  const refs = useRef({});
  useFrameLoop(traderRef, (m) => {
    const rows = { fly: m.pnl, hold: m.holdPnl, coin: m.coinPnl };
    const max = Math.max(1, ...Object.values(rows).map(Math.abs));
    const order = Object.entries(rows).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    for (const [k, v] of Object.entries(rows)) {
      const el = refs.current[k];
      if (!el) continue;
      setText(el.querySelector('output'), money(v));
      el.style.setProperty('--v', String(Math.abs(v) / max));
      el.dataset.sign = v < 0 ? 'neg' : 'pos';
      el.style.order = String(order.indexOf(k));
    }
    const s = refs.current.stats;
    if (s) {
      const closes = m.wins + m.losses;
      setText(s.querySelector('[data-k=trades]'), m.trades);
      setText(s.querySelector('[data-k=win]'), closes ? `${Math.round(100 * m.wins / closes)}%` : '—');
      setText(s.querySelector('[data-k=fees]'), `$${Math.round(m.fees)}`);
      setText(s.querySelector('[data-k=best]'), m.biggestWin ? money(m.biggestWin) : '—');
      setText(s.querySelector('[data-k=worst]'), m.biggestLoss ? money(m.biggestLoss) : '—');
      setText(s.querySelector('[data-k=days]'), m.market.day);
    }
  });
  const row = (key, label, tip) => (
    <div className={`league-row ${key} tip`} data-tip={tip} ref={(el) => { refs.current[key] = el; }}>
      <span>{label}</span>
      <div className="league-bar"><i /></div>
      <output>+$0</output>
    </div>
  );
  const cell = (k, label, tip) => (
    <div className="ledger-cell tip" data-tip={tip} tabIndex={0}><b data-k={k}>0</b><span>{label}</span></div>
  );
  return (
    <section className="league">
      <span className="memory-title tip" tabIndex={0} data-tip="Three accounts, the same $10,000 of paper money. Buy-and-hold bought at the first price and never touched it. The coin trades at the same moments the fly decides, with the same limits and fees.">
        Does a fly beat the market?
      </span>
      <div className="league-rows">
        {row('fly', 'The fly', 'Its paper P&L, margin-call top-ups left out.')}
        {row('hold', 'Buy & hold', 'All in at the first price, never sold.')}
        {row('coin', 'A coin', 'A random position at every moment the fly decides.')}
      </div>
      <div className="ledger league-stats" ref={(el) => { refs.current.stats = el; }}>
        {cell('trades', 'units traded', `Every button press is one unit of ${SHARES_PER_UNIT} shares.`)}
        {cell('win', 'win rate', 'Closes at a profit. Selling winners early keeps this high — and the P&L low. The disposition effect.')}
        {cell('fees', 'fees', 'Five basis points a press. Overtrading has a price.')}
        {cell('best', 'best close', 'The biggest profit on one order.')}
        {cell('worst', 'worst close', 'The biggest loss on one order.')}
        {cell('days', 'day', 'Trading day.')}
      </div>
    </section>
  );
}

// --------------------------------------------------------------- cards

export function FillSlip({ result }) {
  if (!result || !['buy', 'sell', 'panic'].includes(result.kind)) return null;
  const tone = result.kind === 'panic' ? 'panic' : result.realized > 1 ? 'win' : result.realized < -1 ? 'loss' : 'open';
  const verb = result.kind === 'panic' ? 'Panic sell' : result.kind === 'buy' ? 'Bought' : 'Sold';
  return (
    <div className={`slip tradeslip ${tone}`} key={result.at}>
      <div className="slip-stake">
        <b>{Math.abs(result.units) * SHARES_PER_UNIT}</b> {TICKER} at <b>{result.price.toFixed(2)}</b> · <i>{result.why}</i>
      </div>
      <div className="stamp down">
        {verb}{Math.abs(result.realized) > 1 ? ` ${money(result.realized)}` : ''}
      </div>
    </div>
  );
}

export function MarginCard({ count }) {
  return (
    <div className="slip broke">
      <div className="stamp down">Margin call</div>
      <p className="broke-body">
        Equity fell below half the stake and the broker closed everything at the market. PPL1 fires flat
        out. In a moment someone tops up the paper money — it was never real — and it trades on, warier.
      </p>
      {count > 1 && <p className="broke-count">Margin call number {count}.</p>}
    </div>
  );
}

export function ClosedCard({ day, pnl }) {
  return (
    <div className="slip revive">
      <div className="stamp down">Market closed</div>
      <p className="broke-body">End of day {day}. Paper P&L so far: {money(pnl)}. Whatever it holds, it holds overnight.</p>
    </div>
  );
}

export function NewsToast({ news }) {
  if (!news) return null;
  return (
    <div className="news-toast" key={`${news.day}-${news.at}`}>
      <b>Breaking</b> {news.text}
    </div>
  );
}

// --------------------------------------------------------- how it works

export function TradeHowItWorks({ open, onClose }) {
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
    <div className="howto" id="howto" role="dialog" aria-label="How the trading desk works" ref={ref}>
      <button type="button" className="howto-close" onClick={() => { onClose(); refocusHowButton(); }} aria-label="Close">×</button>
      <h2>How the trading desk works</h2>
      <dl>
        <dt>It sees the chart</dt>
        <dd>
          Six screens, and the price chart in the middle of the top row drives the real motion detectors of its optic lobe — T4c/T5c for upward
          motion, T4d/T5d for downward. The trend it trades on is read downstream, from cells its own wiring
          makes direction-selective, found by probing the connectome at start-up.
        </dd>
        <dt>Momentum is a reflex</dt>
        <dd>
          Flies turn with wide-field motion: the optomotor response. Here that same pull decides which way it
          leans. It buys what is rising and shorts what is falling, sized by NPF, dopamine, caution and what
          its mushroom body has learned.
        </dd>
        <dt>A crash is a loom</dt>
        <dd>
          A red bar growing fast on screen is an approaching object. It drives the looming detectors LPLC2 and
          LC4, which converge on the giant fibre, DNp01 — the escape command. If it fires, the fly flees: it
          sells everything.
        </dd>
        <dt>Its biases</dt>
        <dd>
          It sells winners early while dopamine is up, and holds losers until the loss hurts more than
          admitting it. Its win rate stays high; its P&amp;L often does not. The scoreboard shows it against
          buy-and-hold and a coin.
        </dd>
        <dt>Money</dt>
        <dd>
          $10,000 of paper money, one ticker — $BNNA, banana futures — and a market that is simulated and
          seeded. Nothing here is real, and nothing here is advice.
        </dd>
      </dl>
      <p className="note">
        Wiring, cell types and transmitters are measured (<b>MaleCNS v1.0</b>); the motion readers and the
        giant fibre are found in it, not listed by hand. The market, the money and the mapping from chart to
        retina are the model&apos;s.
      </p>
      <p className="howto-links">
        <a href="/about.html">Read the full write-up</a> · <a href="/legal.html">Legal &amp; privacy</a>
      </p>
    </div>
  );
}
