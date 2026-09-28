import { useEffect, useMemo, useRef, useState } from 'react';
import { PHASES, TAG } from '../game/gamer.js';
import {
  INVENTORY_KEY, RARITIES, REAL_ODDS, SKINS, SKIN_BY_ID, WEAR_SHORT, gradeLine, itemName, wearName,
} from '../game/cases.js';
import { drawGame, MAIN_W, MAIN_H } from '../scene/gamePainters.js';
import '../styles/cases.css';

/**
 * The fly's CS2 cases, from the visitor's side: a card bottom right, there
 * only while the fly is in CS2, that shows a case opening live on its
 * monitor, lets the visitor ask it to open one, and opens its inventory.
 * The fly does the opening; the visitor watches and looks.
 */

const NEW_MS = 10 * 60 * 1000;
const TOAST_MS = 7000;

function CaseIcon() {
  return <svg viewBox="0 0 48 40" fill="none" aria-hidden="true">
    <path d="M17 8V4h14v4" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
    <rect x="3" y="8" width="42" height="28" rx="4" stroke="currentColor" strokeWidth="2.6" />
    <path d="M3 18h42M20 18v6h8v-6" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
  </svg>;
}

function Star() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.6 2.8 6.1 6.6.7-4.9 4.5 1.4 6.5L12 17.1l-5.9 3.3 1.4-6.5-4.9-4.5 6.6-.7L12 2.6Z" fill="currentColor" /></svg>;
}

function SkinArt({ skin, lazy = false, className }) {
  return <img className={className} src={skin.image} alt="" width="512" height="384" draggable="false" loading={lazy ? 'lazy' : undefined} decoding="async" />;
}

/** What the card needs to know, polled once a frame and compared as a string. */
function snapshot(g) {
  const c = g.cases;
  const a = c.active;
  return {
    show: !!a || (g.game === 'cs2' && g.phase !== PHASES.SWITCHING),
    canTrigger: g.canTriggerCase,
    version: c.version,
    count: c.items.length,
    active: a ? { id: a.id, count: a.count, index: a.index, source: a.source, summary: !!a.summary, landed: !!a.opening?.landed } : null,
    key: `${!!a || g.game === 'cs2'}|${g.phase}|${c.version}|${a?.index}|${!!a?.summary}|${!!a?.opening?.landed}`,
  };
}

function useCases(gamerRef) {
  const g = gamerRef.current;
  const [state, setState] = useState(() => snapshot(g));
  useEffect(() => {
    let raf, last = '';
    const tick = () => {
      const s = snapshot(g);
      if (s.key !== last) { last = s.key; setState(s); }
      raf = requestAnimationFrame(tick);
    };
    // drops saved by this site in another tab
    const sync = (event) => { if (event.key === INVENTORY_KEY) g.cases.merge(); };
    tick();
    window.addEventListener('storage', sync);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('storage', sync); };
  }, [g]);
  return state;
}

/** The fly's monitor, small and live, while it opens a case. */
function LiveMonitor({ gamerRef, running }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!running) return undefined;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let raf, last = 0;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 1000 / 30) return;
      last = now;
      const g = gamerRef.current;
      if (g.phase !== PHASES.CASE_OPENING) return;
      ctx.setTransform(canvas.width / MAIN_W, 0, 0, canvas.height / MAIN_H, 0, 0);
      drawGame(ctx, g, now / 1000);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [gamerRef, running]);
  return <canvas ref={ref} width={MAIN_W / 2} height={MAIN_H / 2} aria-hidden="true" />;
}

function openingLabel(active) {
  if (!active) return '';
  if (active.summary) return `${active.count} cases done`;
  return active.count > 1 ? `Case ${active.index + 1} of ${active.count}` : 'Opening a case';
}

// ------------------------------------------------------------------ the card, bottom right

function best(items) {
  let top = null;
  for (const item of items) {
    const r = RARITIES[SKIN_BY_ID[item.skinId].rarity].rank;
    if (!top || r > top.r || (r === top.r && item.at > top.item.at)) top = { item, r };
  }
  return top?.item ?? null;
}

export function GameCases({ gamerRef, onWatch, watching }) {
  const g = gamerRef.current;
  const cases = g.cases;
  const state = useCases(gamerRef);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const seen = useRef(cases.items.length);
  const triggerRef = useRef(null);

  // a new drop: show it on the card for a few seconds
  useEffect(() => {
    if (cases.items.length > seen.current) {
      const item = cases.items[cases.items.length - 1];
      if (Date.now() - item.at < 20000) setToast({ item, until: Date.now() + TOAST_MS });
    }
    seen.current = cases.items.length;
  }, [state.version, cases]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), Math.max(0, toast.until - Date.now()));
    return () => clearTimeout(timer);
  }, [toast]);

  const active = state.active;
  const shown = active ? null : toast?.item ?? best(cases.items);
  const skin = shown ? SKIN_BY_ID[shown.skinId] : null;
  const trigger = () => { if (g.triggerCase()) setToast(null); };

  return <>
    <section className="case-dock" data-show={state.show ? '1' : '0'} inert={state.show ? undefined : ''} aria-label="The fly's CS2 cases">
      {active && <button type="button" className="case-live" onClick={onWatch} aria-label={`Watch it open: ${openingLabel(active)}, on the big monitor`}>
        <LiveMonitor gamerRef={gamerRef} running={state.show && !watching} />
        <span className="case-live-chip"><i />{openingLabel(active)}{active.source === 'manual' ? ' · you asked' : ''}</span>
        <span className="case-live-zoom" aria-hidden="true">⤢</span>
      </button>}
      <button type="button" className="case-inv-row" ref={triggerRef} onClick={() => setOpen(true)}>
        <span className="case-thumb" style={skin ? { '--rarity': RARITIES[skin.rarity].color } : undefined}>
          {skin ? <SkinArt skin={skin} /> : <CaseIcon />}
        </span>
        <span className="case-inv-text">
          <b>{toast && !active ? 'New in its inventory' : 'Its CS2 inventory'}</b>
          <small>{toast && !active && skin ? itemName(skin, shown) : `${state.count} ${state.count === 1 ? 'skin' : 'skins'}${skin ? ` · best: ${skin.weapon}` : ''}`}</small>
        </span>
        <span className="case-chevron" aria-hidden="true">›</span>
      </button>
      {active
        ? <button type="button" className="case-ask watching" onClick={onWatch}><span className="case-spinner" aria-hidden="true" />Watch it open</button>
        : <button type="button" className="case-ask" disabled={!state.canTrigger} onClick={trigger}><CaseIcon />Let it open a case</button>}
    </section>
    <InventoryDialog open={open} onClose={() => { setOpen(false); triggerRef.current?.focus(); }} gamerRef={gamerRef} state={state} onTrigger={trigger} onWatch={onWatch} />
  </>;
}

// ------------------------------------------------------------------ the inventory

const FILTERS = [['all', 'All'], ['rare', 'Knives & gems'], ['covert', 'Covert'], ['classified', 'Classified'], ['restricted', 'Restricted'], ['milspec', 'Mil-Spec']];

function ago(at) {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(at).toLocaleDateString();
}

function WearBar({ value }) {
  return <div className="case-wear" aria-hidden="true">
    <div className="case-wear-track">{[[0, 0.07], [0.07, 0.15], [0.15, 0.38], [0.38, 0.45], [0.45, 1]].map(([a, b]) => <i key={a} style={{ flexGrow: b - a }} />)}</div>
    <s style={{ left: `${value * 100}%` }} />
  </div>;
}

function Name({ skin, item }) {
  const full = itemName(skin, item);
  const [weapon, finish] = full.split(' | ');
  const st = item.stattrak ? (weapon.startsWith('★') ? '★ StatTrak™ ' : 'StatTrak™ ') : '';
  return <>{st && <em>{st}</em>}{weapon.slice(st.length)}{finish && <span> | {finish}</span>}</>;
}

function Inspect({ item, onClose }) {
  const skin = SKIN_BY_ID[item.skinId];
  const rarity = RARITIES[skin.rarity];
  return <section className="case-inspect" style={{ '--rarity': rarity.color }} aria-label="Skin details">
    <button type="button" className="case-x" onClick={onClose} aria-label="Close details">×</button>
    <div className="case-inspect-art"><SkinArt skin={skin} /></div>
    <h3><Name skin={skin} item={item} /></h3>
    <p className="case-grade">{gradeLine(skin)}</p>
    <dl>
      <div><dt>Exterior</dt><dd>{wearName(item.float)}</dd></div>
      <div className="wide"><dt>Wear rating</dt><dd className="mono">{item.float.toFixed(9)}</dd><WearBar value={item.float} /></div>
      <div><dt>Pattern template</dt><dd className="mono">{item.pattern}{skin.fixedPattern ? ' · Blue Gem' : ''}</dd></div>
      {skin.phase && <div><dt>Phase</dt><dd>{skin.phase}</dd></div>}
      <div><dt>Unboxed</dt><dd>{ago(item.at)}{item.source === 'manual' ? ' · you asked' : item.source === 'auto' ? ' · its own idea' : ''}</dd></div>
    </dl>
  </section>;
}

function InventoryDialog({ open, onClose, gamerRef, state, onTrigger, onWatch }) {
  const cases = gamerRef.current.cases;
  const ref = useRef(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [selected, setSelected] = useState(null);
  const [limit, setLimit] = useState(48);

  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) {
      d.showModal();
      // start on the title, not on the first button: nothing lights up that nobody chose
      d.querySelector('h2')?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);

  const items = cases.items;
  const counts = useMemo(() => {
    const n = { all: items.length };
    for (const item of items) { const r = SKIN_BY_ID[item.skinId].rarity; n[r] = (n[r] ?? 0) + 1; }
    return n;
    // the array is mutated in place: `state.version` is what changes
  }, [items, state.version]);
  const unique = useMemo(() => new Set(items.map((i) => i.skinId)).size, [items, state.version]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const skin = SKIN_BY_ID[item.skinId];
      return (filter === 'all' || skin.rarity === filter) && (!q || itemName(skin, item).toLowerCase().includes(q));
    }).sort((a, b) => {
      const sa = SKIN_BY_ID[a.skinId], sb = SKIN_BY_ID[b.skinId];
      if (sort === 'rarity') return RARITIES[sb.rarity].rank - RARITIES[sa.rarity].rank || b.at - a.at;
      if (sort === 'name') return sa.name.localeCompare(sb.name) || a.float - b.float;
      if (sort === 'float') return a.float - b.float;
      return b.at - a.at;
    });
  }, [items, query, filter, sort, state.version]);
  const top = best(items);
  const current = selected && items.find((i) => i.id === selected);
  const active = state.active;
  const reason = active ? 'It is opening one right now.' : !state.show ? 'It only opens cases while it plays CS2.' : '';

  return <dialog ref={ref} className="case-dialog" aria-labelledby="case-dialog-title"
    onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }}
    onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="case-shell">
      <header className="case-head">
        <div className="case-head-title">
          <span className="case-eyebrow">CS2 inventory</span>
          <h2 id="case-dialog-title" tabIndex={-1}>{TAG}&rsquo;s skins</h2>
          <p>{items.length} {items.length === 1 ? 'item' : 'items'} · {unique} of {SKINS.length} found{top ? <> · best <b style={{ '--rarity': RARITIES[SKIN_BY_ID[top.skinId].rarity].color }}>{itemName(SKIN_BY_ID[top.skinId], top)}</b></> : ''}</p>
        </div>
        <div className="case-head-actions">
          {active
            ? <button type="button" className="case-btn live" onClick={onWatch}><i />Watch it open</button>
            : <button type="button" className="case-btn primary" disabled={!state.canTrigger} onClick={onTrigger} aria-describedby={reason ? 'case-hint' : undefined}><CaseIcon />Let it open a case</button>}
          <button type="button" className="case-x" onClick={onClose} aria-label="Close inventory">×</button>
          {reason && !active && <small className="case-hint" id="case-hint">{reason}</small>}
        </div>
      </header>

      <div className="case-tools">
        <div className="case-chips" role="group" aria-label="Filter by rarity">
          {FILTERS.map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} disabled={key !== 'all' && !counts[key]}
            style={key !== 'all' ? { '--rarity': RARITIES[key].color } : undefined} onClick={() => { setFilter(key); setLimit(48); }}>
            {key !== 'all' && <i />}{label}<small>{counts[key] ?? 0}</small>
          </button>)}
        </div>
        <label className="case-search"><span className="sr-only">Search skins</span>
          <input type="search" placeholder="Search…" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(48); }} /></label>
        <label className="case-sort"><span className="sr-only">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest</option><option value="rarity">Rarity</option><option value="float">Best float</option><option value="name">Name</option>
          </select></label>
      </div>

      <div className={`case-body ${current ? 'inspecting' : ''}`}>
        <div className="case-scroll">
        {!items.length
          ? <div className="case-empty">
            <CaseIcon />
            <h3>Nothing in it yet</h3>
            <p>It opens cases on its own when it is enjoying CS2 — a coin flip after each match, one to three at a time. Or ask it to, while it plays CS2.</p>
          </div>
          : !shown.length
            ? <div className="case-empty"><h3>No skins match</h3><p>Try another name or rarity.</p></div>
            : <div className="case-grid">
              {shown.slice(0, limit).map((item) => {
                const skin = SKIN_BY_ID[item.skinId];
                const [weapon, finish = ''] = skin.name.split(' | ');
                const isNew = Date.now() - item.at < NEW_MS;
                return <button type="button" key={item.id} className="case-tile" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}
                  style={{ '--rarity': RARITIES[skin.rarity].color }} aria-label={`${itemName(skin, item)}, ${wearName(item.float)}`}>
                  <span className="case-tile-art"><SkinArt skin={skin} lazy /></span>
                  <span className="case-tile-tags">
                    {item.stattrak && <b className="st">ST™</b>}
                    <b>{WEAR_SHORT[wearName(item.float)]}</b>
                    {skin.fixedPattern && <b className="gem">#{item.pattern}</b>}
                    {isNew && <b className="new">NEW</b>}
                  </span>
                  <span className="case-tile-name"><small>{weapon}</small><b>{finish}</b></span>
                </button>;
              })}
            </div>}
        {shown.length > limit && <button type="button" className="case-btn more" onClick={() => setLimit((n) => n + 48)}>Show {Math.min(48, shown.length - limit)} more</button>}
        </div>
        {current && <Inspect item={current} onClose={() => setSelected(null)} />}
      </div>

      <footer className="case-foot">
        <details>
          <summary>Odds, and where the pictures come from</summary>
          <p>
            The fly opens the Fly Lab Case: {SKINS.length} real Counter-Strike skins, from Mil-Spec to knives and a Blue Gem.
            Its odds: {Object.entries(RARITIES).map(([k, r]) => `${r.name} ${r.weight}%`).join(' · ')} — a real case is
            harsher ({Object.values(REAL_ODDS).join(' / ')}%). Wear, pattern and StatTrak™ are rolled per drop. Nothing here
            is bought or sold, and nothing is a Steam item; the inventory is saved in this browser only.
          </p>
          <p>
            Skin artwork © Valve and its contributing artists; metadata from <a href="https://github.com/ByMykel/CSGO-API" target="_blank" rel="noopener noreferrer">ByMykel/CSGO-API</a>,
            Blue Gem renders from <a href="https://skinory.io" target="_blank" rel="noopener noreferrer">Skinory</a>. The pictures are served from this site. Not affiliated with Valve.
          </p>
        </details>
        <span>{cases.saved ? 'Saved on this device' : 'Kept for this visit'}</span>
      </footer>
    </div>
  </dialog>;
}
