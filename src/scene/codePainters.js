/**
 * Everything in the coder's room that is drawn rather than modelled: the
 * editor on the MacBook, POKYH and the terminal on the external monitor, the
 * sky and the city in the window, and the room's printed things — the
 * keyboard's legends, the sticker, the posters, the rug, the wood.
 *
 * The screens are painted from the Coder's state (game/coder.js), so what is
 * on them is what the fly is doing: the real POKYH code it is typing, the
 * red squiggle under its typo, the dev server's answer, CI going green. The
 * editor theme and the terminal are generic — no product is imitated — and
 * POKYH is drawn in POKYH's own colours, read from its globals.css.
 */
import POKYH from '../game/pokyhCode.js';

const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const SANS = '"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

const APP = { ...POKYH.colors.light, ...POKYH.colors.dark };
const PK = {
  bg: APP['app-bg'] ?? '#09090C',
  surface: APP['app-surface'] ?? '#111116',
  card: APP['app-card'] ?? '#18181E',
  cardAlt: APP['app-card-alt'] ?? '#20202A',
  text: APP['app-text-primary'] ?? '#F0F0F8',
  text2: APP['app-text-secondary'] ?? '#8A8A9C',
  text3: APP['app-text-tertiary'] ?? '#52525F',
  border: APP['app-border'] ?? '#222230',
  accent: APP.accent ?? '#6366F1',
  accentSoft: APP['accent-soft'] ?? '#8B5CF6',
  tint: APP.tint ?? '#10B981',
  warning: APP.warning ?? '#F59E0B',
  danger: APP.danger ?? '#EF4444',
  orange: APP.orange ?? '#F97316',
};

/** The editor's theme: a quiet night palette. */
const ED = {
  bg: '#1a1b26', side: '#16161e', bar: '#13131a', line: '#20222f', gutter: '#3b3f5c', gutterOn: '#a9b1d6',
  text: '#c0caf5', comment: '#565f89', keyword: '#bb9af7', string: '#9ece6a', number: '#ff9e64',
  func: '#7aa2f7', type: '#2ac3de', tag: '#f7768e', punct: '#89ddff', attr: '#e0af68', caret: '#c0caf5',
  status: '#3d3f8f', statusText: '#e8e8ff', error: '#f7768e', sel: '#283457', dim: '#737aa2', tab: '#1f2030',
};

const rr = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

// ------------------------------------------------------------- highlighting

const KEYWORDS = new Set(('import export from default function return const let var if else for of in while switch case break '
  + 'continue new typeof instanceof as type interface extends implements class this null undefined true false async await '
  + 'try catch finally throw void keyof readonly private public static enum declare').split(' '));

/**
 * A small tokenizer: good enough to colour TypeScript and JSX the way an
 * editor would, one line at a time, with block comments carried across lines.
 */
function tokenize(line, state) {
  const out = [];
  let i = 0;
  const push = (text, color) => { if (text) out.push([text, color]); };
  if (state.comment) {
    const end = line.indexOf('*/');
    if (end < 0) { push(line, ED.comment); return out; }
    push(line.slice(0, end + 2), ED.comment);
    i = end + 2;
    state.comment = false;
  }
  while (i < line.length) {
    const rest = line.slice(i);
    let m;
    if (rest.startsWith('//')) { push(rest, ED.comment); break; }
    if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/', 2);
      if (end < 0) { push(rest, ED.comment); state.comment = true; break; }
      push(rest.slice(0, end + 2), ED.comment); i += end + 2; continue;
    }
    if ((m = rest.match(/^(['"`])(?:\\.|(?!\1).)*\1?/))) { push(m[0], ED.string); i += m[0].length; continue; }
    if ((m = rest.match(/^<\/?[A-Za-z][\w.]*/))) { push(m[0][1] === '/' ? '</' : '<', ED.punct); push(m[0].replace(/^<\/?/, ''), /^[A-Z]/.test(m[0].replace(/^<\/?/, '')) ? ED.type : ED.tag); i += m[0].length; continue; }
    if ((m = rest.match(/^\d[\d_.]*/))) { push(m[0], ED.number); i += m[0].length; continue; }
    if ((m = rest.match(/^[A-Za-z_$][\w$]*/))) {
      const w = m[0];
      const next = line[i + w.length];
      const color = KEYWORDS.has(w) ? ED.keyword : next === '(' ? ED.func : /^[A-Z]/.test(w) ? ED.type
        : next === '=' && line[i + w.length + 1] !== '=' && /\s/.test(line[i - 1] ?? '') && out.some(([t]) => t.startsWith('<')) ? ED.attr : ED.text;
      push(w, color); i += w.length; continue;
    }
    if ((m = rest.match(/^\s+/))) { push(m[0], ED.text); i += m[0].length; continue; }
    push(rest[0], /[{}()[\];,.:?=<>!&|+\-*/%]/.test(rest[0]) ? ED.punct : ED.text);
    i += 1;
  }
  return out;
}

/** Tokens per line of each file, once. */
const TOKENS = new Map();
function tokensOf(fileIndex) {
  let t = TOKENS.get(fileIndex);
  if (!t) {
    const state = { comment: false };
    t = POKYH.files[fileIndex].lines.map((l) => tokenize(l, state));
    TOKENS.set(fileIndex, t);
  }
  return t;
}

const fileName = (p) => p.split('/').pop();
const extColor = (p) => (p.endsWith('.tsx') ? '#2ac3de' : p.endsWith('.ts') ? '#7aa2f7' : p.endsWith('.css') ? '#bb9af7' : ED.dim);

// ------------------------------------------------------------------ editor

/**
 * The MacBook's screen: a code editor, dark, at night. File tree, tabs,
 * line numbers, the code, a minimap, the status bar with the problem count —
 * and the menu bar, with the game's clock, around the notch.
 */
export function paintEditor(ctx, c, time) {
  const { width: W, height: H } = ctx.canvas;
  const s = W / 1280;
  const ed = c.editor;
  const file = POKYH.files[ed.file];
  ctx.save();
  ctx.scale(s, s);
  const w = 1280, h = H / s;

  // wallpaper edge, then the window filling the screen
  ctx.fillStyle = '#0d0e14';
  ctx.fillRect(0, 0, w, h);

  // --- the menu bar, split by the notch ------------------------------------
  const MB = 30;
  ctx.fillStyle = '#0b0b10';
  ctx.fillRect(0, 0, w, MB);
  ctx.font = `600 15px ${SANS}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e8e8f0';
  ctx.fillText('Code', 22, MB / 2);
  ctx.font = `15px ${SANS}`;
  ctx.fillStyle = '#b8b8c8';
  ['File', 'Edit', 'Selection', 'View', 'Go', 'Terminal'].forEach((m, i) => ctx.fillText(m, 76 + i * 64, MB / 2));
  ctx.textAlign = 'right';
  ctx.fillStyle = '#e8e8f0';
  const day = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'][(c.night - 1 + (c.clockMin < 12 * 60 ? 1 : 0)) % 7];
  ctx.fillText(`${day} ${c.clock}`, w - 20, MB / 2);
  // battery, and it is plugged in
  ctx.strokeStyle = '#b8b8c8'; ctx.lineWidth = 1.5;
  rr(ctx, w - 150, 9, 26, 12, 3); ctx.stroke();
  ctx.fillStyle = '#b8b8c8'; ctx.fillRect(w - 147, 12, 20 * (0.55 + 0.4 * ((time * 0.001) % 1 > 2 ? 0 : 1)), 6);
  ctx.fillRect(w - 123, 13, 2, 4);
  // wifi
  ctx.beginPath();
  for (let k = 0; k < 3; k++) { ctx.moveTo(w - 176 - 6 - k * 4, 21 - k * 4); ctx.arc(w - 176, 22, 4 + k * 4, Math.PI * 1.25, Math.PI * 1.75); }
  ctx.stroke();
  ctx.textAlign = 'left';

  // --- the editor window ---------------------------------------------------
  const top = MB;
  ctx.fillStyle = ED.bar;
  ctx.fillRect(0, top, w, 34);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(22 + i * 22, top + 17, 6.5, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = ED.dim;
  ctx.font = `14px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.fillText(`${fileName(file.path)} — pokyh-frontend`, w / 2, top + 17);
  ctx.textAlign = 'left';

  const bodyTop = top + 34;
  const statusH = 26;
  const bodyH = h - bodyTop - statusH;

  // activity bar
  const AB = 52;
  ctx.fillStyle = ED.bar;
  ctx.fillRect(0, bodyTop, AB, bodyH);
  const icon = (y, kind, on) => {
    ctx.strokeStyle = on ? '#e0e3ff' : '#565a7a'; ctx.lineWidth = 2;
    const x = AB / 2;
    if (kind === 'files') { rr(ctx, x - 9, y - 11, 14, 18, 2); ctx.stroke(); rr(ctx, x - 4, y - 7, 14, 18, 2); ctx.stroke(); }
    if (kind === 'search') { ctx.beginPath(); ctx.arc(x - 2, y - 2, 7, 0, Math.PI * 2); ctx.moveTo(x + 3, y + 3); ctx.lineTo(x + 9, y + 9); ctx.stroke(); }
    if (kind === 'git') { ctx.beginPath(); ctx.arc(x - 5, y - 8, 3, 0, 7); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x - 5, y + 8); ctx.moveTo(x + 7, y - 5); ctx.arc(x + 5, y - 5, 3, 0, 7); ctx.moveTo(x + 5, y - 2); ctx.quadraticCurveTo(x + 5, y + 3, x - 5, y + 5); ctx.stroke(); }
    if (kind === 'run') { ctx.beginPath(); ctx.moveTo(x - 6, y - 9); ctx.lineTo(x + 8, y); ctx.lineTo(x - 6, y + 9); ctx.closePath(); ctx.stroke(); }
    if (kind === 'ext') { for (const [dx, dy] of [[-8, -8], [1, -8], [-8, 1], [3, 3]]) { ctx.strokeRect(x + dx, y + dy, 7, 7); } }
    if (on) { ctx.fillStyle = '#7aa2f7'; ctx.fillRect(0, y - 16, 3, 32); }
  };
  icon(bodyTop + 30, 'files', true);
  icon(bodyTop + 80, 'search');
  icon(bodyTop + 130, 'git');
  icon(bodyTop + 180, 'run');
  icon(bodyTop + 230, 'ext');
  // the changes badge on source control
  const changed = Math.max(0, ed.line - ed.upTo) + (ed.line > (c.task?.start ?? 0) ? 1 : 0);
  if (changed || ed.line > c.task.start) {
    ctx.fillStyle = '#7aa2f7'; ctx.beginPath(); ctx.arc(AB / 2 + 10, bodyTop + 140, 8, 0, 7); ctx.fill();
    ctx.fillStyle = '#10111a'; ctx.font = `bold 11px ${SANS}`; ctx.textAlign = 'center';
    ctx.fillText(String(Math.min(9, 1 + Math.floor((ed.line - c.task.start) / 6))), AB / 2 + 10, bodyTop + 141);
    ctx.textAlign = 'left';
  }

  // explorer
  const EX = 230;
  ctx.fillStyle = ED.side;
  ctx.fillRect(AB, bodyTop, EX, bodyH);
  ctx.font = `600 12px ${SANS}`;
  ctx.fillStyle = ED.dim;
  ctx.fillText('EXPLORER', AB + 18, bodyTop + 20);
  ctx.fillText('POKYH-FRONTEND', AB + 18, bodyTop + 48);
  const tree = [
    [0, 'app', 'dir'], [1, '[lang]', 'dir'], [2, 'mensa', 'dir'], [3, 'page.tsx', 'app/[lang]/mensa/page.tsx'],
    [2, 'timetable', 'dir'], [3, 'parts.tsx', 'app/[lang]/timetable/parts.tsx'], [3, 'timetable-logic.ts', 'app/[lang]/timetable/timetable-logic.ts'],
    [3, 'WeekGrid.tsx', 'app/[lang]/timetable/WeekGrid.tsx'], [1, 'globals.css', 'app/globals.css'],
    [0, 'components', 'dir'], [1, 'ui', 'dir'], [2, 'EmptyView.tsx', 'components/ui/EmptyView.tsx'], [2, 'Spinner.tsx', 'components/ui/Spinner.tsx'],
    [1, 'BottomNav.tsx', 'components/BottomNav.tsx'], [0, 'lib', 'dir'], [0, 'public', 'dir'], [0, 'package.json', 'package.json'], [0, 'README.md', 'README.md'],
  ];
  ctx.font = `14px ${SANS}`;
  tree.forEach(([depth, name, path], i) => {
    const y = bodyTop + 76 + i * 25;
    if (y > bodyTop + bodyH - 10) return;
    const active = path === file.path;
    if (active) { ctx.fillStyle = ED.sel; ctx.fillRect(AB, y - 12, EX, 24); }
    const x = AB + 16 + depth * 14;
    if (path === 'dir') {
      ctx.fillStyle = ED.dim; ctx.fillText('›', x, y + 1);
      ctx.fillStyle = '#d0a060'; rr(ctx, x + 12, y - 6, 14, 11, 2); ctx.fill();
      ctx.fillStyle = '#a9b1d6'; ctx.fillText(name, x + 32, y + 1);
    } else {
      ctx.fillStyle = extColor(path);
      ctx.font = `bold 10px ${SANS}`;
      ctx.fillText(path.endsWith('.tsx') ? 'TSX' : path.endsWith('.ts') ? 'TS' : path.endsWith('.css') ? '#' : path.endsWith('.json') ? '{}' : 'M↓', x + 12, y + 1);
      ctx.font = `14px ${SANS}`;
      ctx.fillStyle = active ? '#e0e3ff' : '#a9b1d6';
      const modified = active && c.task && ed.line > c.task.start;
      ctx.fillText(name, x + 38, y + 1);
      if (modified) { ctx.fillStyle = ED.attr; ctx.fillText('M', AB + EX - 22, y + 1); }
      if (active && ed.problems.length) { ctx.fillStyle = ED.error; ctx.fillText(String(ed.problems.length), AB + EX - 38, y + 1); }
    }
  });

  // tabs
  const CX = AB + EX;
  const CW = w - CX;
  ctx.fillStyle = ED.bar;
  ctx.fillRect(CX, bodyTop, CW, 38);
  let tx = CX;
  ctx.font = `14px ${SANS}`;
  for (const fi of ed.tabs) {
    const p = POKYH.files[fi].path;
    const name = fileName(p);
    const tw = Math.max(130, ctx.measureText(name).width + 62);
    const on = fi === ed.file;
    ctx.fillStyle = on ? ED.bg : ED.tab;
    ctx.fillRect(tx, bodyTop, tw, 38);
    if (on) { ctx.fillStyle = '#7aa2f7'; ctx.fillRect(tx, bodyTop, tw, 2); }
    ctx.fillStyle = extColor(p);
    ctx.font = `bold 10px ${SANS}`;
    ctx.fillText(p.endsWith('.tsx') ? 'TSX' : 'TS', tx + 12, bodyTop + 20);
    ctx.font = `14px ${SANS}`;
    ctx.fillStyle = on ? '#e0e3ff' : ED.dim;
    ctx.fillText(name, tx + 38, bodyTop + 20);
    // unsaved: a dot where the close button is
    if (on && c.phase === 'typing') { ctx.fillStyle = '#e0e3ff'; ctx.beginPath(); ctx.arc(tx + tw - 16, bodyTop + 19, 4, 0, 7); ctx.fill(); }
    tx += tw + 1;
  }

  // breadcrumbs
  const bcY = bodyTop + 38;
  ctx.fillStyle = ED.bg;
  ctx.fillRect(CX, bcY, CW, bodyH - 38);
  ctx.font = `13px ${SANS}`;
  ctx.fillStyle = ED.dim;
  ctx.fillText(file.path.split('/').join('  ›  '), CX + 18, bcY + 14);

  // --- the code ------------------------------------------------------------
  const FS = 17.5;
  const LH = 25;
  const codeTop = bcY + 30;
  const MM = 86;                                  // minimap width
  const gutterW = 64;
  const codeX = CX + gutterW;
  const codeW = CW - gutterW - MM - 12;
  const rows = Math.floor((h - statusH - codeTop - 6) / LH);
  ctx.font = `${FS}px ${MONO}`;
  const cw = ctx.measureText('m').width;
  const cols = Math.floor(codeW / cw);

  const toks = tokensOf(ed.file);
  // what is on screen: every line up to the cursor, the cursor's line as typed
  const junk = ed.junk ?? '';
  const junkLines = junk ? Math.ceil((ed.text.length + junk.length) / cols) : 1;
  const last = ed.line + junkLines - 1;
  const first = Math.max(0, last - rows + 5);
  // smooth scroll: the view slides up as a new line arrives
  const slide = c.scroll * LH * 0.8;
  const caretBlink = Math.floor(time / 530) % 2 === 0 || c.phase === 'typing';

  ctx.save();
  ctx.beginPath();
  ctx.rect(CX, codeTop - 4, CW, h - statusH - codeTop + 4);
  ctx.clip();
  for (let r = 0; r <= rows + 1; r++) {
    const ln = first + r;
    if (ln > last) break;
    const y = codeTop + r * LH + slide;
    const onCursor = ln === ed.line;
    const inJunk = ln > ed.line;
    if (onCursor && c.phase !== 'asleep') { ctx.fillStyle = ED.line; ctx.fillRect(CX, y - 2, CW - MM, LH); }
    // line number
    ctx.fillStyle = onCursor ? ED.gutterOn : ED.gutter;
    ctx.textAlign = 'right';
    ctx.font = `${FS - 2}px ${MONO}`;
    if (!inJunk) ctx.fillText(String(ln + 1), CX + gutterW - 18, y + LH / 2);
    ctx.textAlign = 'left';
    ctx.font = `${FS}px ${MONO}`;
    // the conflict markers, while it resolves one
    if (ed.conflict && ln >= ed.chunkStart - 3 && ln < ed.chunkStart && c.task?.stage === 'resolve') {
      ctx.fillStyle = ln === ed.chunkStart - 3 ? 'rgba(80,170,120,0.25)' : ln === ed.chunkStart - 1 ? 'rgba(90,120,220,0.25)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(codeX - 6, y - 2, codeW, LH);
      ctx.fillStyle = ED.dim;
      ctx.fillText(ln === ed.chunkStart - 3 ? '<<<<<<< HEAD (Current Change)' : ln === ed.chunkStart - 2 ? '=======' : '>>>>>>> main (Incoming Change)', codeX, y + LH / 2);
      continue;
    }
    if (ln < ed.line) {
      const override = ed.overrides[ln];
      if (override !== undefined) drawPlain(ctx, override, codeX, y + LH / 2, cw, cols, ED.text);
      else drawTokens(ctx, toks[ln] ?? [], codeX, y + LH / 2, cw, cols);
    } else if (onCursor || inJunk) {
      // the line being typed: coloured as far as it matches the real one
      const typed = ed.text + junk;
      const start = (ln - ed.line) * cols;
      const part = typed.slice(start, start + cols);
      if (!junk && !ed.typo) drawTokens(ctx, clipTokens(toks[ln] ?? [], typed.length), codeX, y + LH / 2, cw, cols);
      else drawPlain(ctx, part, codeX, y + LH / 2, cw, cols, junk ? '#d6d9f0' : ED.text);
      if (ed.typo && onCursor) squiggle(ctx, codeX + ed.typo.col * cw, y + LH - 3, ed.typo.len * cw);
      // the caret
      const caretIn = ln === last;
      if (caretIn && caretBlink && c.phase !== 'morning') {
        const cx = codeX + ((typed.length - start) % (cols + 1)) * cw;
        ctx.fillStyle = ED.caret;
        ctx.fillRect(cx, y + 2, 2, LH - 4);
      }
    }
    // the problems it did not see
    for (const p of ed.problems) {
      if (p.line === ln) squiggle(ctx, codeX + p.col * cw, y + LH - 3, Math.max(2, p.len) * cw);
    }
  }
  // the suggestion widget, while it waits for tab
  if (ed.completion && c.phase === 'typing') {
    const r = ed.line - first;
    const y = codeTop + (r + 1) * LH + slide;
    const x = codeX + Math.min(cols - 30, ed.text.length - 2) * cw;
    const word = (ed.lines[ed.line] ?? '').slice(ed.text.length - 2).match(/^[\w$]+/)?.[0] ?? '';
    const items = [word, `${word}s`, `${word.slice(0, 4)}Ref`, `${word.slice(0, 3)}Map`].slice(0, 4);
    const bw = Math.max(260, (word.length + 10) * cw);
    ctx.fillStyle = '#1f2335';
    rr(ctx, x, y, bw, items.length * 26 + 8, 5); ctx.fill();
    ctx.strokeStyle = '#3b4261'; ctx.lineWidth = 1; ctx.stroke();
    items.forEach((it, i) => {
      if (i === 0) { ctx.fillStyle = '#2e3c64'; ctx.fillRect(x + 3, y + 4 + i * 26, bw - 6, 26); }
      ctx.fillStyle = i === 0 ? ED.func : ED.type;
      ctx.font = `bold 11px ${SANS}`;
      ctx.fillText(i === 0 ? 'ƒ' : '◇', x + 12, y + 17 + i * 26);
      ctx.font = `${FS - 1}px ${MONO}`;
      ctx.fillStyle = '#c0caf5';
      ctx.fillText(it, x + 32, y + 17 + i * 26);
    });
  }
  ctx.restore();

  // minimap: the file as coloured bars
  const mx = w - MM - 6;
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(mx - 4, codeTop - 6, MM + 10, h - statusH - codeTop + 6);
  const n = Math.max(ed.line + 1, 1);
  const lh = Math.min(4, (h - statusH - codeTop - 12) / Math.max(60, n));
  for (let ln = 0; ln < n; ln++) {
    let x = mx;
    for (const [t, col] of toks[ln] ?? []) {
      const len = Math.min(t.length, 40);
      if (t.trim()) { ctx.fillStyle = col; ctx.globalAlpha = 0.55; ctx.fillRect(x, codeTop + ln * lh, len * 1.3, Math.max(1, lh - 1)); }
      x += len * 1.3;
      if (x > mx + MM) break;
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(180,190,255,0.08)';
  ctx.fillRect(mx - 4, codeTop + first * lh, MM + 10, rows * lh);
  for (const p of ed.problems) { ctx.fillStyle = ED.error; ctx.fillRect(w - 8, codeTop + p.line * lh, 5, 4); }

  // --- status bar ----------------------------------------------------------
  const sy = h - statusH;
  ctx.fillStyle = c.phase === 'asleep' ? '#2a2b40' : ED.status;
  ctx.fillRect(0, sy, w, statusH);
  ctx.font = `13px ${SANS}`;
  ctx.fillStyle = ED.statusText;
  ctx.textBaseline = 'middle';
  ctx.fillText(`⎇ ${c.task?.branch ?? 'main'}${c.task?.stage === 'push' ? ' ↑1' : ''}`, 14, sy + statusH / 2);
  const errs = ed.problems.length;
  ctx.fillStyle = errs ? '#ffb4c0' : ED.statusText;
  ctx.fillText(`⊗ ${errs}   ⚠ ${c.jitter > 0.3 ? 2 : 0}`, 290, sy + statusH / 2);
  ctx.fillStyle = ED.statusText;
  ctx.textAlign = 'right';
  ctx.fillText(`Ln ${ed.line + 1}, Col ${ed.text.length + (ed.junk?.length ?? 0) + 1}    Spaces: 2    UTF-8    LF    ${file.lang === 'tsx' ? 'TypeScript JSX' : 'TypeScript'}`, w - 16, sy + statusH / 2);
  ctx.textAlign = 'left';

  // a problems toast when it saves with errors
  if (errs && (c.phase === 'running' || c.phase === 'pointing' || c.phase === 'idle')) {
    const p = ed.problems[0];
    const bw = 520;
    ctx.fillStyle = '#2a1c26';
    rr(ctx, w - bw - 22, sy - 76, bw, 60, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(247,118,142,0.6)'; ctx.stroke();
    ctx.fillStyle = ED.error; ctx.font = `bold 14px ${SANS}`;
    ctx.fillText(`⊗ ts(2304)  Ln ${p.line + 1}`, w - bw - 8, sy - 57);
    ctx.fillStyle = '#e8d0d8'; ctx.font = `14px ${SANS}`;
    ctx.fillText(p.msg.length > 58 ? `${p.msg.slice(0, 57)}…` : p.msg, w - bw - 8, sy - 34);
  }
  // saved: a soft flash over the code
  if (ed.flash > 0) {
    ctx.fillStyle = `rgba(122,162,247,${ed.flash * 0.08})`;
    ctx.fillRect(CX, codeTop, CW, h - statusH - codeTop);
  }
  ctx.restore();
}

function clipTokens(tokens, n) {
  const out = [];
  let left = n;
  for (const [t, col] of tokens) {
    if (left <= 0) break;
    out.push([t.slice(0, left), col]);
    left -= t.length;
  }
  return out;
}

function drawTokens(ctx, tokens, x, y, cw, cols) {
  let col = 0;
  for (const [t, color] of tokens) {
    if (col >= cols) break;
    const text = t.slice(0, cols - col);
    if (text.trim()) { ctx.fillStyle = color; ctx.fillText(text, x + col * cw, y); }
    col += t.length;
  }
}

function drawPlain(ctx, text, x, y, cw, cols, color) {
  ctx.fillStyle = color;
  ctx.fillText(text.slice(0, cols), x, y);
}

function squiggle(ctx, x, y, w) {
  ctx.strokeStyle = ED.error;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i <= w; i += 3) ctx.lineTo(x + i, y + (Math.floor(i / 3) % 2 ? 2 : -1));
  ctx.stroke();
}

// ------------------------------------------------------- the external monitor

const SUBJECTS = [
  ['MAT', 'Mathematik', '#8b9cf7'], ['DEU', 'Deutsch', '#f7a78b'], ['ENG', 'Englisch', '#8bd3f7'],
  ['INF', 'Informatik', '#9ef7b0'], ['ITA', 'Italienisch', '#f7d98b'], ['PHY', 'Physik', '#c69bf7'],
  ['SPO', 'Bewegung', '#f79bd0'], ['GES', 'Geschichte', '#d3c49b'], ['REL', 'Religion', '#b0b8c8'],
];
/** A week at LBS Brixen, seeded: [day, first period, periods, subject, room]. */
const WEEK = (() => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const out = [];
  for (let d = 0; d < 6; d++) {
    let p = 0;
    const end = d === 5 ? 4 : 7 + Math.floor(rnd() * 3);
    while (p < end) {
      const len = rnd() < 0.55 ? 2 : 1;
      const sub = SUBJECTS[Math.floor(rnd() * SUBJECTS.length)];
      out.push({ d, p, len: Math.min(len, end - p), sub, room: `${['A', 'B', 'C'][Math.floor(rnd() * 3)]}${100 + Math.floor(rnd() * 30)}`,
        cancelled: rnd() < 0.06, exam: rnd() < 0.05, moved: rnd() < 0.1 });
      p += len;
      if (p === 4 && rnd() < 0.3) p += 1;
    }
  }
  return out;
})();
const DISHES = [
  ['Suppe', 'Minestrone mit Pesto', ['vegan'], 'linear', ['#FF9F43', '#EE5A24'], 4.1],
  ['Pasta', 'Spaghetti al pomodoro', ['vegetarisch'], 'linear', ['#F8C291', '#E55039'], 4.5],
  ['Fleisch', 'Speckknödel mit Krautsalat', [], 'linear', ['#B8860B', '#8B4513'], 4.7],
  ['Vegan', 'Gemüsecurry mit Reis', ['vegan'], 'linear', ['#78e08f', '#38ada9'], 3.9],
];

function grad(ctx, x, y, w, h, a, b) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, a); g.addColorStop(1, b);
  return g;
}

/** POKYH's mark: a plate that is a clock, a P on it, fork and knife. */
export function drawPokyhMark(ctx, x, y, size, rounded = true) {
  ctx.save();
  if (rounded) { ctx.fillStyle = '#524ab8'; rr(ctx, x, y, size, size, size * 0.22); ctx.fill(); }
  const cx = x + size / 2, cy = y + size / 2, r = size * 0.33;
  ctx.fillStyle = '#3a3488'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  ctx.strokeStyle = '#a9a3f0'; ctx.lineWidth = size * 0.028; ctx.stroke();
  ctx.strokeStyle = '#cfcaf8'; ctx.lineWidth = size * 0.014;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82); ctx.lineTo(cx + Math.cos(a) * r * 0.93, cy + Math.sin(a) * r * 0.93); ctx.stroke();
  }
  ctx.fillStyle = '#ecebff';
  ctx.font = `bold ${size * 0.34}px ${SANS}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('P', cx, cy + size * 0.015);
  // fork and knife
  ctx.fillStyle = '#ecebff';
  const fx = x + size * 0.1, kx = x + size * 0.87;
  rr(ctx, fx - size * 0.012, y + size * 0.36, size * 0.024, size * 0.32, size * 0.01); ctx.fill();
  for (let k = -1; k <= 1; k++) ctx.fillRect(fx + k * size * 0.022 - size * 0.006, y + size * 0.32, size * 0.012, size * 0.1);
  ctx.beginPath(); ctx.moveTo(kx, y + size * 0.3); ctx.quadraticCurveTo(kx + size * 0.05, y + size * 0.42, kx + size * 0.01, y + size * 0.5);
  ctx.lineTo(kx + size * 0.01, y + size * 0.68); ctx.lineTo(kx - size * 0.015, y + size * 0.68); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function paintTimetable(ctx, c, x, y, w, h, time) {
  const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const dates = [22, 23, 24, 25, 26, 27];
  const gut = 46;
  const colW = (w - gut) / 6;
  ctx.font = `600 13px ${SANS}`;
  ctx.textAlign = 'center';
  days.forEach((d, i) => {
    const cx = x + gut + colW * (i + 0.5);
    const today = i === 3;
    if (today) { ctx.fillStyle = PK.accent; rr(ctx, cx - 22, y, 44, 38, 10); ctx.fill(); }
    ctx.fillStyle = today ? '#fff' : PK.text2; ctx.fillText(d, cx, y + 13);
    ctx.font = `700 15px ${SANS}`; ctx.fillStyle = today ? '#fff' : PK.text; ctx.fillText(String(dates[i]), cx, y + 29);
    ctx.font = `600 13px ${SANS}`;
  });
  const gy = y + 48;
  const ph = (h - 52) / 10;
  ctx.textAlign = 'right';
  ctx.font = `11px ${SANS}`;
  const times = ['07:50', '08:40', '09:30', '10:35', '11:25', '12:15', '13:15', '14:05', '14:55', '15:55'];
  for (let p = 0; p < 10; p++) {
    ctx.fillStyle = PK.text3;
    ctx.fillText(times[p], x + gut - 8, gy + p * ph + 10);
    ctx.fillStyle = PK.border; ctx.fillRect(x + gut, gy + p * ph, w - gut, 1);
  }
  ctx.textAlign = 'left';
  // what it is building shows up in the app: a changed room as a chip
  const chips = c.task?.branch === 'feat/room-change-chip' ? Math.min(1, (c.editor.line - c.task.start) / 8) : 1;
  for (const l of WEEK) {
    const lx = x + gut + colW * l.d + 3;
    const ly = gy + l.p * ph + 2;
    const lw = colW - 6, lh = l.len * ph - 4;
    const [abbr, name, col] = l.sub;
    ctx.globalAlpha = l.cancelled ? 0.45 : 1;
    ctx.fillStyle = `${col}33`;
    rr(ctx, lx, ly, lw, lh, 8); ctx.fill();
    ctx.globalAlpha = 1;
    if (l.cancelled || l.exam) { ctx.strokeStyle = l.cancelled ? PK.danger : PK.warning; ctx.lineWidth = 2; rr(ctx, lx, ly, lw, lh, 8); ctx.stroke(); }
    ctx.fillStyle = col; ctx.fillRect(lx, ly + 6, 3, lh - 12);
    ctx.fillStyle = PK.text; ctx.font = `700 13px ${SANS}`;
    ctx.fillText(abbr, lx + 10, ly + 17);
    if (lh > 34) { ctx.fillStyle = PK.text2; ctx.font = `11px ${SANS}`; ctx.fillText(lw > 90 ? name : l.room, lx + 10, ly + 33); }
    if (l.moved && lh > 30 && chips > 0.5) {
      ctx.fillStyle = `${PK.orange}40`; rr(ctx, lx + lw - 46, ly + 6, 40, 17, 8); ctx.fill();
      ctx.fillStyle = PK.orange; ctx.font = `bold 10px ${SANS}`; ctx.fillText(l.room, lx + lw - 41, ly + 15);
    }
  }
  // now
  const nowY = gy + ph * 3.4;
  ctx.fillStyle = PK.danger; ctx.fillRect(x + gut + colW * 3, nowY, colW, 2);
  ctx.beginPath(); ctx.arc(x + gut + colW * 3, nowY + 1, 4, 0, 7); ctx.fill();
  void time;
}

function paintMensa(ctx, c, x, y, w, h) {
  ctx.fillStyle = PK.text2; ctx.font = `600 13px ${SANS}`;
  ctx.fillText('Donnerstag, 25. September', x, y + 12);
  const veganFirst = c.task?.branch === 'feat/mensa-vegan-first' && c.editor.line - c.task.start > 5;
  const dishes = veganFirst ? [...DISHES].sort((a, b) => (b[2].includes('vegan') ? 1 : 0) - (a[2].includes('vegan') ? 1 : 0)) : DISHES;
  const cw = (w - 16) / 2, ch = (h - 40) / 2 - 8;
  dishes.forEach(([cat, name, tags, , [a, b], stars], i) => {
    const cx = x + (i % 2) * (cw + 16), cy = y + 28 + Math.floor(i / 2) * (ch + 16);
    ctx.fillStyle = PK.card; rr(ctx, cx, cy, cw, ch, 14); ctx.fill();
    ctx.fillStyle = grad(ctx, cx, cy, cw, ch * 0.45, a, b);
    rr(ctx, cx, cy, cw, ch * 0.45, 14); ctx.fill();
    ctx.fillRect(cx, cy + ch * 0.3, cw, ch * 0.15);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `700 12px ${SANS}`;
    ctx.fillText(cat.toUpperCase(), cx + 14, cy + 22);
    ctx.fillStyle = PK.text; ctx.font = `700 15px ${SANS}`;
    ctx.fillText(name, cx + 14, cy + ch * 0.45 + 26);
    let tx = cx + 14;
    for (const t of tags) {
      const tw = ctx.measureText(t).width * 0.8 + 18;
      ctx.fillStyle = `${PK.tint}30`; rr(ctx, tx, cy + ch * 0.45 + 40, tw, 20, 10); ctx.fill();
      ctx.fillStyle = PK.tint; ctx.font = `600 11px ${SANS}`; ctx.fillText(t, tx + 9, cy + ch * 0.45 + 54);
      tx += tw + 6;
    }
    ctx.fillStyle = PK.warning; ctx.font = `13px ${SANS}`;
    ctx.fillText(`${'★'.repeat(Math.round(stars))}${'☆'.repeat(5 - Math.round(stars))}  ${stars.toFixed(1)}`, cx + 14, cy + ch - 16);
  });
}

function paintBrowser(ctx, c, x, y, w, h, time) {
  // chrome: a generic browser, dark
  ctx.fillStyle = '#1c1c22';
  ctx.fillRect(x, y, w, 76);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + 20 + i * 20, y + 20, 6, 0, 7); ctx.fill(); });
  ctx.fillStyle = PK.bg; rr(ctx, x + 84, y + 6, 250, 30, 8); ctx.fill();
  drawPokyhMark(ctx, x + 94, y + 12, 18);
  ctx.fillStyle = PK.text; ctx.font = `13px ${SANS}`; ctx.textBaseline = 'middle';
  ctx.fillText(c.app.view === 'mensa' ? 'Mensa · POKYH' : 'Stundenplan · POKYH', x + 120, y + 21);
  ctx.fillStyle = '#2a2a33'; rr(ctx, x + 70, y + 42, w - 90, 26, 13); ctx.fill();
  ctx.fillStyle = PK.text2; ctx.font = `13px ${SANS}`;
  ctx.fillText(`localhost:3000/de/${c.app.view === 'mensa' ? 'mensa' : 'timetable'}`, x + 88, y + 55);
  ctx.fillStyle = '#6a6a78'; ctx.fillText('‹  ›  ↻', x + 14, y + 55);

  const ay = y + 76;
  const ah = h - 76;
  ctx.fillStyle = PK.bg;
  ctx.fillRect(x, ay, w, ah);
  // the app's own sidebar, collapsed
  const SB = 66;
  ctx.fillStyle = PK.surface; ctx.fillRect(x, ay, SB, ah);
  drawPokyhMark(ctx, x + 13, ay + 14, 40);
  const navs = ['home', 'timetable', 'grades', 'mensa', 'messages'];
  navs.forEach((n, i) => {
    const on = (n === 'mensa') === (c.app.view === 'mensa') && (n === 'mensa' || n === 'timetable');
    const cy = ay + 92 + i * 56;
    if (on) { ctx.fillStyle = `${PK.accent}33`; rr(ctx, x + 11, cy - 20, 44, 40, 12); ctx.fill(); }
    ctx.strokeStyle = on ? PK.accent : PK.text3; ctx.lineWidth = 2;
    ctx.beginPath();
    if (n === 'home') { ctx.moveTo(x + 23, cy + 2); ctx.lineTo(x + 33, cy - 8); ctx.lineTo(x + 43, cy + 2); ctx.lineTo(x + 43, cy + 10); ctx.lineTo(x + 23, cy + 10); ctx.closePath(); }
    if (n === 'timetable') { ctx.rect(x + 23, cy - 8, 20, 18); ctx.moveTo(x + 23, cy - 2); ctx.lineTo(x + 43, cy - 2); }
    if (n === 'grades') { ctx.moveTo(x + 24, cy + 9); ctx.lineTo(x + 24, cy); ctx.moveTo(x + 33, cy + 9); ctx.lineTo(x + 33, cy - 8); ctx.moveTo(x + 42, cy + 9); ctx.lineTo(x + 42, cy - 3); }
    if (n === 'mensa') { ctx.arc(x + 33, cy + 1, 9, 0, 7); }
    if (n === 'messages') { rr(ctx, x + 23, cy - 8, 20, 15, 4); }
    ctx.stroke();
  });
  // top bar
  const cx0 = x + SB + 24;
  const cwid = w - SB - 48;
  ctx.fillStyle = PK.text; ctx.font = `800 26px ${SANS}`; ctx.textBaseline = 'alphabetic';
  ctx.fillText(c.app.view === 'mensa' ? 'Mensa' : 'Stundenplan', cx0, ay + 46);
  if (c.app.view !== 'mensa') {
    ctx.fillStyle = PK.card; rr(ctx, cx0 + cwid - 210, ay + 22, 210, 34, 17); ctx.fill();
    ctx.fillStyle = PK.text2; ctx.font = `600 13px ${SANS}`; ctx.textBaseline = 'middle';
    ctx.fillText('‹', cx0 + cwid - 196, ay + 39); ctx.fillText('›', cx0 + cwid - 22, ay + 39);
    ctx.fillStyle = PK.text; ctx.textAlign = 'center';
    ctx.fillText('KW 39 · 22.–27. Sep', cx0 + cwid - 105, ay + 39); ctx.textAlign = 'left';
  }
  ctx.textBaseline = 'middle';
  const cy0 = ay + 76;
  if (c.app.view === 'mensa') paintMensa(ctx, c, cx0, cy0, cwid, ah - 96);
  else paintTimetable(ctx, c, cx0, cy0, cwid, ah - 96, time);

  // Fast Refresh: a brief glow along the top when a save lands
  if (c.app.reloaded > 0) {
    ctx.fillStyle = `rgba(99,102,241,${c.app.reloaded * 0.9})`;
    ctx.fillRect(x, ay, w * (1 - c.app.reloaded * 0.4), 3);
  }
  // the dev overlay on a compile error
  const ov = c.app.overlay;
  if (ov) {
    ctx.fillStyle = 'rgba(5,5,8,0.72)'; ctx.fillRect(x, ay, w, ah);
    const bx = x + 40, by = ay + 50, bw = w - 80, bh = Math.min(300, ah - 100);
    ctx.fillStyle = '#16161b'; rr(ctx, bx, by, bw, bh, 12); ctx.fill();
    ctx.fillStyle = PK.danger; rr(ctx, bx, by, bw, 6, 3); ctx.fill();
    ctx.fillStyle = '#ff8a8a'; ctx.font = `700 22px ${SANS}`;
    ctx.fillText(ov.title, bx + 26, by + 44);
    ctx.fillStyle = '#9a9aac'; ctx.font = `14px ${MONO}`;
    ctx.fillText(ov.file, bx + 26, by + 78);
    ctx.fillStyle = '#f0f0f8'; ctx.font = `15px ${MONO}`;
    wrap(ctx, ov.msg, bx + 26, by + 116, bw - 52, 22, 5);
  }
  // the dev indicator, bottom left
  ctx.fillStyle = ov ? PK.danger : '#000';
  rr(ctx, x + 14, y + h - 44, ov ? 92 : 34, 30, 15); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `700 14px ${SANS}`;
  ctx.fillText(ov ? 'N  1 Issue' : 'N', x + 25, y + h - 29);
}

function wrap(ctx, text, x, y, w, lh, maxLines) {
  const words = text.split(' ');
  let line = '';
  let n = 0;
  for (const word of words) {
    const t = line ? `${line} ${word}` : word;
    if (ctx.measureText(t).width > w && line) {
      ctx.fillText(line, x, y + n * lh);
      line = word; n += 1;
      if (n >= maxLines) return;
    } else line = t;
  }
  if (line) ctx.fillText(line, x, y + n * lh);
}

const TONE = { cmd: '#e6e6f0', ok: '#6fdc8c', err: '#ff7b72', dim: '#7d8093', out: '#c8cad8' };

function paintTerminal(ctx, c, x, y, w, h, time) {
  ctx.fillStyle = '#0f1014'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#1a1b21'; ctx.fillRect(x, y, w, 32);
  ctx.fillStyle = '#9a9cae'; ctx.font = `13px ${SANS}`; ctx.textAlign = 'center';
  ctx.fillText('zsh — pokyh-frontend', x + w / 2, y + 16);
  ctx.textAlign = 'left';
  const LH = 21;
  ctx.font = `14.5px ${MONO}`;
  const cw = ctx.measureText('m').width;
  const cols = Math.floor((w - 28) / cw);
  // wrap everything, keep the last lines that fit
  const rows = [];
  for (const l of c.terminal) {
    const isCmd = l.tone === 'cmd';
    const text = isCmd ? l.text.replace(/^\$ /, '') : l.text;
    const first = isCmd ? `➜ ${text}` : text;
    for (let i = 0; i < first.length; i += cols) rows.push({ text: first.slice(i, i + cols), tone: l.tone, prompt: isCmd && i === 0 });
  }
  const fit = Math.floor((h - 48) / LH);
  const shown = rows.slice(-fit + 1);
  shown.forEach((r, i) => {
    const ty = y + 50 + i * LH;
    if (r.prompt) {
      ctx.fillStyle = '#6fdc8c'; ctx.fillText('➜', x + 14, ty);
      ctx.fillStyle = TONE.cmd; ctx.fillText(r.text.slice(2), x + 14 + cw * 2, ty);
    } else { ctx.fillStyle = TONE[r.tone] ?? TONE.out; ctx.fillText(r.text, x + 14, ty); }
  });
  // the prompt, waiting
  const py = y + 50 + shown.length * LH;
  ctx.fillStyle = '#6fdc8c'; ctx.fillText('➜', x + 14, py);
  ctx.fillStyle = '#7aa2f7'; ctx.fillText(`pokyh-frontend git:(${c.task?.branch ?? 'main'})`, x + 14 + cw * 2, py);
  if (Math.floor(time / 600) % 2 === 0) { ctx.fillStyle = '#c8cad8'; ctx.fillRect(x + 14 + cw * (4 + `pokyh-frontend git:(${c.task?.branch ?? 'main'})`.length), py - 9, cw, 18); }
}

function paintCI(ctx, c, x, y, w, h, time) {
  ctx.fillStyle = '#121318'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#1a1b21'; ctx.fillRect(x, y, w, 32);
  ctx.fillStyle = '#9a9cae'; ctx.font = `600 13px ${SANS}`;
  ctx.fillText('CHECKS', x + 14, y + 16);
  const ci = c.ci;
  if (!ci) {
    ctx.fillStyle = '#6a6c80'; ctx.font = `14px ${SANS}`;
    ctx.fillText('No checks yet tonight.', x + 14, y + 60);
    return;
  }
  ctx.fillStyle = '#c8cad8'; ctx.font = `13px ${MONO}`;
  ctx.fillText(`${ci.branch}  ${ci.hash ?? ''}`, x + 100, y + 16);
  const rowH = Math.min(30, (h - 90) / ci.steps.length);
  ci.steps.forEach((s, i) => {
    const ry = y + 50 + i * rowH;
    const cx = x + 26;
    if (s.state === 'passed') {
      ctx.fillStyle = '#3fb950'; ctx.beginPath(); ctx.arc(cx, ry, 9, 0, 7); ctx.fill();
      ctx.strokeStyle = '#0f1014'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(cx - 4, ry); ctx.lineTo(cx - 1, ry + 3); ctx.lineTo(cx + 4, ry - 3); ctx.stroke();
    } else if (s.state === 'failed') {
      ctx.fillStyle = '#f85149'; ctx.beginPath(); ctx.arc(cx, ry, 9, 0, 7); ctx.fill();
      ctx.strokeStyle = '#0f1014'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(cx - 3.5, ry - 3.5); ctx.lineTo(cx + 3.5, ry + 3.5); ctx.moveTo(cx + 3.5, ry - 3.5); ctx.lineTo(cx - 3.5, ry + 3.5); ctx.stroke();
    } else if (s.state === 'running') {
      ctx.strokeStyle = '#d29922'; ctx.lineWidth = 3;
      const a = (time / 180) % (Math.PI * 2);
      ctx.beginPath(); ctx.arc(cx, ry, 8, a, a + Math.PI * 1.4); ctx.stroke();
    } else {
      ctx.strokeStyle = '#4a4c5e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, ry, 8, 0, 7); ctx.stroke();
    }
    ctx.fillStyle = s.state === 'skipped' ? '#5a5c6e' : '#d8dae8'; ctx.font = `15px ${SANS}`;
    ctx.fillText(s.name, cx + 22, ry + 1);
    ctx.fillStyle = '#7d8093'; ctx.font = `13px ${MONO}`; ctx.textAlign = 'right';
    const t = s.state === 'queued' || s.state === 'skipped' ? '' : `${Math.min(s.t, s.len).toFixed(0)}s`;
    ctx.fillText(t, x + w - 16, ry + 1);
    ctx.textAlign = 'left';
  });
  // the verdict
  const vy = y + h - 30;
  if (ci.done && !ci.failed) {
    ctx.fillStyle = 'rgba(63,185,80,0.14)'; rr(ctx, x + 10, vy - 18, w - 20, 36, 8); ctx.fill();
    ctx.fillStyle = '#56d364'; ctx.font = `700 16px ${SANS}`;
    ctx.fillText('●  Deployed to pokyh.com', x + 24, vy);
  } else if (ci.failed) {
    ctx.fillStyle = 'rgba(248,81,73,0.14)'; rr(ctx, x + 10, vy - 18, w - 20, 36, 8); ctx.fill();
    ctx.fillStyle = '#ff7b72'; ctx.font = `600 13px ${SANS}`;
    const reason = ci.reason ?? 'failed';
    ctx.fillText(reason.length > 52 ? `${reason.slice(0, 51)}…` : reason, x + 22, vy);
  } else {
    ctx.fillStyle = '#d29922'; ctx.font = `600 14px ${SANS}`;
    ctx.fillText('●  Running…', x + 24, vy);
  }
}

/**
 * The external monitor: POKYH in a browser on the left, the terminal and the
 * CI checks on the right.
 */
export function paintMonitor(ctx, c, time) {
  const { width: W, height: H } = ctx.canvas;
  const s = W / 1600;
  ctx.save();
  ctx.scale(s, s);
  const w = 1600, h = H / s;
  ctx.fillStyle = '#08080b';
  ctx.fillRect(0, 0, w, h);
  const split = 980;
  paintBrowser(ctx, c, 0, 0, split, h, time);
  ctx.fillStyle = '#000'; ctx.fillRect(split, 0, 4, h);
  const th = Math.round(h * 0.6);
  paintTerminal(ctx, c, split + 4, 0, w - split - 4, th, time);
  ctx.fillStyle = '#000'; ctx.fillRect(split + 4, th, w - split - 4, 4);
  paintCI(ctx, c, split + 4, th + 4, w - split - 4, h - th - 4, time);
  ctx.restore();
}

// ------------------------------------------------------------------ the sky

const BUILDINGS = (() => {
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const out = [];
  let x = -10;
  while (x < 530) {
    const w = 26 + rnd() * 50;
    const hgt = 90 + rnd() * 190 + (rnd() < 0.15 ? 90 : 0);
    const windows = [];
    for (let wy = 12; wy < hgt - 10; wy += 16) {
      for (let wx = 6; wx < w - 8; wx += 11) windows.push({ x: wx, y: wy, on: rnd(), hue: rnd() });
    }
    out.push({ x, w, h: hgt, far: rnd() < 0.5, windows });
    x += w + rnd() * 8 - 2;
  }
  const bokeh = Array.from({ length: 46 }, () => ({ x: rnd() * 512, y: 330 + rnd() * 190, r: 5 + rnd() * 18, hue: rnd(), tw: rnd() * 6 }));
  const stars = Array.from({ length: 70 }, () => ({ x: rnd() * 512, y: rnd() * 260, a: 0.3 + rnd() * 0.7 }));
  return { list: out, bokeh, stars };
})();

const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const SKY = {
  night: [[8, 10, 30], [22, 24, 58], [52, 40, 78]],
  dawn: [[40, 52, 110], [196, 120, 140], [255, 170, 110]],
  day: [[92, 150, 214], [160, 196, 230], [236, 214, 190]],
};

/**
 * The window, from outside: the sky by the night's clock (Coder.daylight),
 * the stars fading, a city whose windows go out one by one as the night goes
 * on, and its lights blurred by the rain on the glass.
 */
export function paintSky(ctx, c, time) {
  const { width: W, height: H } = ctx.canvas;
  const s = W / 512;
  ctx.save();
  ctx.scale(s, s);
  const d = c.daylight;
  const k1 = Math.min(1, d * 2);
  const k2 = Math.max(0, d * 2 - 1);
  const stops = SKY.night.map((n, i) => mix(mix(n, SKY.dawn[i], k1), SKY.day[i], k2));
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, rgb(stops[0])); g.addColorStop(0.55, rgb(stops[1])); g.addColorStop(0.85, rgb(stops[2]));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, H / s);
  // stars and the moon, fading with the dawn
  const night = 1 - Math.min(1, d * 2.4);
  if (night > 0) {
    for (const st of BUILDINGS.stars) { ctx.fillStyle = `rgba(255,255,240,${st.a * night * (0.7 + 0.3 * Math.sin(time * 0.002 + st.x))})`; ctx.fillRect(st.x, st.y, 1.6, 1.6); }
    const mg = ctx.createRadialGradient(390, 90, 4, 390, 90, 70);
    mg.addColorStop(0, `rgba(255,250,230,${0.95 * night})`); mg.addColorStop(0.25, `rgba(255,245,220,${0.4 * night})`); mg.addColorStop(1, 'rgba(255,245,220,0)');
    ctx.fillStyle = mg; ctx.fillRect(300, 0, 200, 200);
  }
  // the sun coming up behind the city
  if (d > 0.25) {
    const sy = 440 - (d - 0.25) * 260;
    const sg = ctx.createRadialGradient(150, sy, 6, 150, sy, 190);
    sg.addColorStop(0, `rgba(255,236,190,${Math.min(1, (d - 0.25) * 2)})`);
    sg.addColorStop(0.2, `rgba(255,190,120,${Math.min(0.7, (d - 0.25) * 1.4)})`);
    sg.addColorStop(1, 'rgba(255,160,100,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 200, 512, 312);
  }
  // the city: far row, near row
  const k = c.nightK;
  for (const far of [true, false]) {
    const shade = far ? mix([30, 30, 58], [120, 110, 140], d) : mix([14, 14, 26], [70, 64, 84], d);
    for (const b of BUILDINGS.list) {
      if (b.far !== far) continue;
      const by = 512 - b.h * (far ? 0.8 : 1) + (far ? -20 : 0);
      ctx.fillStyle = rgb(shade);
      ctx.fillRect(b.x, by, b.w, 512 - by);
      // lit windows: fewer as the night goes on, all gone in daylight
      for (const w of b.windows) {
        const on = w.on > 0.45 + k * 0.4 + d * 0.5;
        if (!on) continue;
        ctx.fillStyle = w.hue < 0.7 ? `rgba(255,200,120,${far ? 0.5 : 0.8})` : `rgba(160,200,255,${far ? 0.4 : 0.7})`;
        ctx.fillRect(b.x + w.x, by + w.y * (far ? 0.8 : 1), 5, 7);
      }
    }
  }
  // street lights, blurred by the rain
  for (const b of BUILDINGS.bokeh) {
    const a = (0.22 + 0.1 * Math.sin(time * 0.001 * b.tw + b.x)) * (1 - d * 0.7);
    const col = b.hue < 0.5 ? '255,176,90' : b.hue < 0.8 ? '255,120,120' : '140,190,255';
    const bg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    bg.addColorStop(0, `rgba(${col},${a})`); bg.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = bg; ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
  }
  ctx.restore();
}

// ----------------------------------------------------------- static prints

/** The keyboard's legends, laid out like KEYS in codeLayout.js; backlit. */
export function paintKeyLegends(ctx, keys, frame) {
  const { width: W, height: H } = ctx.canvas;
  ctx.clearRect(0, 0, W, H);
  const sx = W / frame.w, sy = H / frame.d;
  const names = { delete: 'delete', return: 'return', rshift: 'shift', shift: 'shift', tab: 'tab', caps: 'caps lock', space: '', fn: 'fn', ctrl: 'control', opt: 'option', ropt: 'option', cmd: 'command', rcmd: 'command', left: '◀', right: '▶', updown: '▲▼', id: '', esc: 'esc' };
  for (const k of keys) {
    // the frame's u runs along -z, v along +x (towards the fly)
    const u = (frame.w / 2 - k.z) * sx;
    const v = (k.x + frame.d / 2) * sy;
    const label = names[k.label] ?? k.label.toUpperCase();
    if (!label) continue;
    const small = label.length > 1;
    ctx.fillStyle = 'rgba(236,240,255,0.92)';
    ctx.font = `${small ? 500 : 600} ${Math.round((small ? 0.19 : 0.34) * k.d * sy)}px ${SANS}`;
    ctx.textAlign = small ? 'left' : 'center';
    ctx.textBaseline = 'middle';
    const left = u - (k.w * sx) / 2;
    if (small) ctx.fillText(label, left + k.w * sx * 0.12, v + k.d * sy * 0.26);
    else ctx.fillText(label, u, v - k.d * sy * 0.04);
  }
}

/** The deck around the keys: black aluminium, the speaker grilles either side. */
export function paintDeck(ctx, frame, keyboard) {
  const { width: W, height: H } = ctx.canvas;
  ctx.fillStyle = '#26272b';
  ctx.fillRect(0, 0, W, H);
  const sx = W / frame.w, sy = H / frame.d;
  // the keyboard well
  ctx.fillStyle = '#0c0c0e';
  rr(ctx, (frame.w / 2 - keyboard.w / 2) * sx - 6, keyboard.v0 * sy - 6, keyboard.w * sx + 12, (keyboard.v1 - keyboard.v0) * sy + 12, 10);
  ctx.fill();
  // grilles
  ctx.fillStyle = '#131315';
  for (const side of [-1, 1]) {
    const cx = frame.w / 2 + side * (keyboard.w / 2 + (frame.w - keyboard.w) / 4);
    for (let gy = keyboard.v0 + 0.004; gy < keyboard.v1; gy += 0.0028) {
      for (let gx = -0.0055; gx <= 0.0055; gx += 0.0028) {
        ctx.beginPath(); ctx.arc((cx + gx) * sx, gy * sy, 0.0006 * sx, 0, 7); ctx.fill();
      }
    }
  }
  // brushed grain
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.02})`;
    ctx.fillRect(0, Math.random() * H, W, 1);
  }
}

/** The lid's back: space black, a single sticker. No logo. */
export function paintLid(ctx) {
  const { width: W, height: H } = ctx.canvas;
  ctx.fillStyle = '#232427';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 300; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.018})`; ctx.fillRect(0, Math.random() * H, W, 1); }
  // the POKYH sticker, a little crooked, lower left
  ctx.save();
  ctx.translate(W * 0.3, H * 0.62);
  ctx.rotate(-0.12);
  const s = W * 0.2;
  ctx.fillStyle = '#f4f2ff';
  rr(ctx, -s / 2 - 6, -s / 2 - 6, s + 12, s + 12, s * 0.26); ctx.fill();
  drawPokyhMark(ctx, -s / 2, -s / 2, s);
  ctx.restore();
  // and a small round one: a fly
  ctx.save();
  ctx.translate(W * 0.72, H * 0.3);
  ctx.rotate(0.25);
  ctx.fillStyle = '#f6ead6'; ctx.beginPath(); ctx.arc(0, 0, W * 0.07, 0, 7); ctx.fill();
  ctx.fillStyle = '#d9731f'; ctx.beginPath(); ctx.ellipse(0, W * 0.012, W * 0.018, W * 0.03, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#b8321f'; ctx.beginPath(); ctx.arc(-W * 0.012, -W * 0.024, W * 0.01, 0, 7); ctx.arc(W * 0.012, -W * 0.024, W * 0.01, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.ellipse(-W * 0.022, -W * 0.004, W * 0.012, W * 0.026, -0.6, 0, 7); ctx.ellipse(W * 0.022, -W * 0.004, W * 0.012, W * 0.026, 0.6, 0, 7); ctx.fill();
  ctx.restore();
}

/** Warm wood with a grain, for the desk and the shelf edges. */
export function paintWood(ctx, { base = [122, 76, 44], seed = 5, planks = 1 } = {}) {
  const { width: W, height: H } = ctx.canvas;
  let sd = seed;
  const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  ctx.fillStyle = rgb(base);
  ctx.fillRect(0, 0, W, H);
  const ph = H / planks;
  for (let p = 0; p < planks; p++) {
    const tone = 0.9 + rnd() * 0.2;
    ctx.fillStyle = `rgba(${base.map((v) => Math.round(v * tone)).join(',')},1)`;
    ctx.fillRect(0, p * ph, W, ph);
    for (let i = 0; i < 90; i++) {
      const y = p * ph + rnd() * ph;
      const dark = rnd() < 0.6;
      ctx.strokeStyle = dark ? `rgba(40,20,8,${0.05 + rnd() * 0.12})` : `rgba(255,220,170,${0.03 + rnd() * 0.06})`;
      ctx.lineWidth = 0.6 + rnd() * 2.2;
      ctx.beginPath();
      const amp = 2 + rnd() * 6, f = 0.004 + rnd() * 0.01, ph0 = rnd() * 6;
      for (let x = 0; x <= W; x += 16) ctx.lineTo(x, y + Math.sin(x * f + ph0) * amp);
      ctx.stroke();
    }
    if (planks > 1) { ctx.fillStyle = 'rgba(20,10,4,0.45)'; ctx.fillRect(0, p * ph, W, 2); }
  }
}

/** A rug: a warm, faded pattern. */
export function paintRug(ctx) {
  const { width: W, height: H } = ctx.canvas;
  ctx.fillStyle = '#8a3f2a';
  ctx.fillRect(0, 0, W, H);
  const border = W * 0.06;
  ctx.strokeStyle = '#e8c89a'; ctx.lineWidth = W * 0.012;
  ctx.strokeRect(border, border, W - border * 2, H - border * 2);
  ctx.strokeStyle = '#2f4a52'; ctx.lineWidth = W * 0.02;
  ctx.strokeRect(border * 1.6, border * 1.6, W - border * 3.2, H - border * 3.2);
  // medallions
  for (let i = 0; i < 3; i++) {
    const cx = W / 2, cy = H * (0.25 + i * 0.25);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = i === 1 ? '#d9a55a' : '#2f4a52';
    ctx.fillRect(-W * 0.12, -W * 0.12, W * 0.24, W * 0.24);
    ctx.fillStyle = '#8a3f2a'; ctx.fillRect(-W * 0.07, -W * 0.07, W * 0.14, W * 0.14);
    ctx.fillStyle = '#e8c89a'; ctx.fillRect(-W * 0.025, -W * 0.025, W * 0.05, W * 0.05);
    ctx.restore();
  }
  // wear and fibres
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,230,200' : '40,15,8'},${Math.random() * 0.08})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  // fringe
  ctx.fillStyle = '#e8d8b8';
  for (let x = 0; x < W; x += 6) { ctx.fillRect(x, 0, 2, border * 0.5); ctx.fillRect(x, H - border * 0.5, 2, border * 0.5); }
}

/** Posters for the wall. */
export function paintPoster(ctx, kind) {
  const { width: W, height: H } = ctx.canvas;
  if (kind === 'dolomites') {
    // a travel print of the mountains above Brixen, at dusk
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2b2d5c'); g.addColorStop(0.5, '#c8646a'); g.addColorStop(0.75, '#f3a86b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fbe3b0'; ctx.beginPath(); ctx.arc(W * 0.68, H * 0.42, W * 0.1, 0, 7); ctx.fill();
    const ridge = (base, col, peaks) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
      peaks.forEach(([x, y]) => ctx.lineTo(W * x, H * y));
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      void base;
    };
    ridge(0, '#7a3f5a', [[0, 0.62], [0.12, 0.48], [0.2, 0.55], [0.3, 0.36], [0.36, 0.44], [0.44, 0.3], [0.52, 0.47], [0.62, 0.4], [0.74, 0.52], [0.86, 0.38], [1, 0.5]]);
    ridge(0, '#4a2440', [[0, 0.72], [0.18, 0.62], [0.34, 0.7], [0.5, 0.6], [0.66, 0.72], [0.82, 0.64], [1, 0.7]]);
    ridge(0, '#2a1428', [[0, 0.82], [0.3, 0.78], [0.6, 0.84], [1, 0.8]]);
    ctx.fillStyle = '#fbe3b0'; ctx.textAlign = 'center';
    ctx.font = `800 ${W * 0.11}px ${SANS}`; ctx.fillText('BRIXEN', W / 2, H * 0.14);
    ctx.font = `500 ${W * 0.045}px ${SANS}`; ctx.fillText('BRESSANONE · PERSENON', W / 2, H * 0.2);
    ctx.font = `600 ${W * 0.04}px ${SANS}`; ctx.fillText('DOLOMITES', W / 2, H * 0.93);
  } else if (kind === 'fly') {
    // an old natural-history plate
    ctx.fillStyle = '#efe4cc'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#5a4630'; ctx.lineWidth = W * 0.008; ctx.strokeRect(W * 0.05, H * 0.04, W * 0.9, H * 0.92);
    ctx.save(); ctx.translate(W / 2, H * 0.47);
    ctx.fillStyle = 'rgba(160,180,200,0.35)'; ctx.strokeStyle = '#5a4630'; ctx.lineWidth = W * 0.006;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * W * 0.17, -H * 0.02, W * 0.2, W * 0.08, s * -0.35, 0, 7); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#c47a35'; ctx.beginPath(); ctx.ellipse(0, H * 0.07, W * 0.09, W * 0.16, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#6e3a14';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-W * 0.08, H * 0.05 + i * W * 0.05); ctx.lineTo(W * 0.08, H * 0.05 + i * W * 0.05); ctx.stroke(); }
    ctx.fillStyle = '#b86a2c'; ctx.beginPath(); ctx.ellipse(0, -H * 0.06, W * 0.08, W * 0.07, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#9e2a1c'; ctx.beginPath(); ctx.arc(-W * 0.05, -H * 0.12, W * 0.04, 0, 7); ctx.arc(W * 0.05, -H * 0.12, W * 0.04, 0, 7); ctx.fill();
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = W * 0.005;
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(s * W * 0.05, -H * 0.04 + i * W * 0.04); ctx.lineTo(s * W * 0.2, H * 0.02 + i * W * 0.07); ctx.lineTo(s * W * 0.24, H * 0.1 + i * W * 0.07); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = '#3a2a1a'; ctx.textAlign = 'center';
    ctx.font = `italic 600 ${W * 0.07}px Georgia, serif`; ctx.fillText('Drosophila melanogaster', W / 2, H * 0.84);
    ctx.font = `${W * 0.04}px Georgia, serif`; ctx.fillText('Meigen, 1830 · the common fruit fly', W / 2, H * 0.89);
  } else if (kind === 'works') {
    // a framed certificate every developer has earned
    ctx.fillStyle = '#f7f2e4'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#b89a5a'; ctx.lineWidth = W * 0.02; ctx.strokeRect(W * 0.06, H * 0.06, W * 0.88, H * 0.88);
    ctx.fillStyle = '#3a3226'; ctx.textAlign = 'center';
    ctx.font = `700 ${W * 0.075}px Georgia, serif`; ctx.fillText('CERTIFIED', W / 2, H * 0.3);
    ctx.font = `italic ${W * 0.07}px Georgia, serif`; ctx.fillText('Works on', W / 2, H * 0.48);
    ctx.fillText('my machine', W / 2, H * 0.6);
    ctx.fillStyle = '#b8321f'; ctx.beginPath(); ctx.arc(W * 0.72, H * 0.8, W * 0.09, 0, 7); ctx.fill();
    ctx.fillStyle = '#f7f2e4'; ctx.font = `700 ${W * 0.05}px ${SANS}`; ctx.fillText('✓', W * 0.72, H * 0.82);
  }
}

/** A sticky note. */
export function paintSticky(ctx, text, color = '#ffd966') {
  const { width: W, height: H } = ctx.canvas;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0.06)'); g.addColorStop(0.2, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2b2a55';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${W * 0.15}px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive`;
  text.split('\n').forEach((l, i, a) => ctx.fillText(l, W / 2, H / 2 + (i - (a.length - 1) / 2) * W * 0.19));
}
